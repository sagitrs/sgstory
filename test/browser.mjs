
import { defaultStoryHtml, storyRelPath, storyHtml, FONT_PREFIX_FROM_STORY } from '../scripts/dist-paths.mjs';
// #263（#185 阶段五）真实浏览器验收：零依赖 CDP 驱动（Node 22 内建 fetch + WebSocket）
//
// 为什么不用 puppeteer/playwright：本仓只需「导航 + 求值 + 截图 + 视口」四件事，
// CDP 直连足够，且不新增 devDependency。浏览器用已装好的 Chrome for Testing：
// CHROME_PATH=/path/to/chrome（默认扫描 ~/.cache/puppeteer/chrome/*/chrome-linux64/chrome）
// 缺系统库时（容器常见）用 scripts/chrome-deps.sh 免 root 就地解包后：
// LD_LIBRARY_PATH=<deps>/usr/lib/x86_64-linux-gnu node test/browser.mjs
//
// 覆盖（伞票验收条 3/8 + 条 4/7 的真机复核）：场景 × 关键状态 × 操作前后 × 视口
// ① 战斗首屏：行动入口在视口内，首屏无近整屏空白
// ② 战斗回合：检定→你→它→下一轮 相邻成块（块间距阈值）
// ③ 门厅：观察结果留在屏上且可见（结果留屏真机复核）
// ④ 守林人：子对话返回＝短入口＋行动区在视口内（不重放介绍）
// ⑤ 视口矩阵 360×667 / 390×844 / 1280×844：无横向溢出；放大文字（200%）仍无溢出
//
// 退出码：断言失败＝1；缺浏览器/依赖＝0 并打印跳过原因（CI 友好）。
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const HOME = process.env.HOME ?? '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
	if (process.env.CHROME_PATH) return existsSync(process.env.CHROME_PATH) ? process.env.CHROME_PATH : null;
	const root = join(HOME, '.cache/puppeteer/chrome');
	if (!existsSync(root)) return null;
	for (const d of readdirSync(root).sort().reverse()) {
		const p = join(root, d, 'chrome-linux64/chrome');
		if (existsSync(p)) return p;
	}
	return null;
}

// 系统库（容器常见缺 libatk/libgbm 等）：按 SG_CHROME_LIBS → ~/.cache/sgstory-chrome-deps → /tmp/chromedeps 顺序自动发现，
// 发现就把 LD_LIBRARY_PATH 交给子进程——使用者不必手工 export（准备命令：npm run browser:setup）。
function findLibs() {
	const cands = [process.env.SG_CHROME_LIBS, join(HOME, '.cache/sgstory-chrome-deps'), '/tmp/chromedeps'].filter(Boolean);
	for (const d of cands) {
		const p = join(d, 'usr/lib/x86_64-linux-gnu');
		if (existsSync(p)) return `${p}:${join(d, 'lib/x86_64-linux-gnu')}`;
	}
	return null;
}
const LIBS = findLibs();
const childEnv = { ...process.env };
if (LIBS) childEnv.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH ? `${LIBS}:${process.env.LD_LIBRARY_PATH}` : LIBS;

// ── CI 契约与断言下界（#385 收口）────────────────────────────────────
// 为什么放在脚本里：CI 里「未找到 Chrome → 打印 skipped → **exit 0**」正是 #363/#385 那类**静默降级**
// ——绿灯看着有验收，其实一行断言都没跑。此前每个调用方各自内联 grep 守卫（`viewport-smoke.yml` 有、
// `ci.yml` 曾漏），既重复又会漏。现在把契约下沉：
// `CI_REQUIRE_BROWSER=1` → **跳过即失败**（脚本唯一的真源；调用方只需给这个环境变量）
// `MIN_ASSERTIONS` → 断言数**下界自 ratchet**：跟着脚本里的断言数走，删除断言即红
//（换成 workflow 里的魔数就会腐烂：原来写死 `N -ge 24`，而实际早已 38 —— 删 14 条断言也照样放行）
export const REQUIRE_BROWSER = process.env.CI_REQUIRE_BROWSER === '1';
//注意：`#1004` B2b 复核席**下调**：59 → 56（**写明理由**，这条门本来就允许"同步下调并写明理由"）。
// 理由：下界当初有一部分是「**故事 2（`hollow-cave`）三视口 +15**」撑起来的（`#491` 判据 5）；
// 该故事已随 B 段删除 → 本件那一块按**裁定 A** 重指到同样**无车卡**的冒烟故事 `minimal-demo`
//（它的多选一段比旧的故事 2 少一条 → 这一块从 15 格降到 12 格）→ **实测总数 56**。
// ⛔ 这不是"删断言凑绿"：**没有任何一格是被删掉的** —— 少的是"旧故事特有的那一页"，
// 且它换掉的那一面（无车卡最小面／多选一可点／200% 不溢出）**逐条仍在**。
export const MIN_ASSERTIONS = 58;   // `#1012`（2026-09-19）：+1＝新增「导航型交互」断言、+1＝原先 xfail 的「焦点回收正文」**转正** → 只涨

// 跳过时该退什么码（纯函数，便于自证）
export const skipVerdict = (requireBrowser) => (requireBrowser
	? { code: 1, notes: ['✗ CI_REQUIRE_BROWSER=1：浏览器验收被跳过 ＝ CI 接线失效（不许静默降级）'] }
	: { code: 0, notes: [] });

// 跑完时的判定（纯函数，便于自证）
export const evaluateRun = ({ total, fails, minAssertions = MIN_ASSERTIONS }) => {
	if (total < minAssertions) {
		return { code: 1, notes: [`✗ 断言数 ${total} < 下界 ${minAssertions}——这不像失败，像**被删除**：请补回断言，或同步下调 MIN_ASSERTIONS 并写明理由`] };
	}
	if (fails) return { code: 1, notes: [`✗ ${fails} 条断言失败`] };
	return { code: 0, notes: [] };
};

const bail = (reason) => {
	const v = skipVerdict(REQUIRE_BROWSER);
	if (REQUIRE_BROWSER) console.error(`✗ 真实浏览器验收跳过：${reason}`);
	else console.log(`○ 真实浏览器验收：跳过（${reason}）`);
	console.log('BROWSER_ASSERTIONS skipped');   // 稳定锚点：与「0/0 假绿」区分
	for (const n of v.notes) console.error(n);
	process.exit(v.code);
};

const selftest = () => {
	let bad = 0;
	const t = (msg, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${msg}`); };
	t('跳过 + CI_REQUIRE_BROWSER=1 → 必须失败（不许静默降级）', skipVerdict(true).code === 1);
	t('跳过 + 本地（无该变量）→ 允许，退 0', skipVerdict(false).code === 0);
	// 用 `MIN_ASSERTIONS` 现算（不写死数字）：下界一涨，这几例自动跟着走（否则每加断言都要改自证）
	t(`${MIN_ASSERTIONS}/${MIN_ASSERTIONS} 达下界 → 通过`, evaluateRun({ total: MIN_ASSERTIONS, fails: 0 }).code === 0);
	t(`${MIN_ASSERTIONS}/${MIN_ASSERTIONS}（有失败）→ 失败`, evaluateRun({ total: MIN_ASSERTIONS, fails: 1 }).code === 1);
	t(`${MIN_ASSERTIONS - 5}/${MIN_ASSERTIONS - 5} 低于下界 → 失败（断言被删也算红，不靠 workflow 魔数）`, evaluateRun({ total: MIN_ASSERTIONS - 5, fails: 0, minAssertions: MIN_ASSERTIONS }).code === 1);
	t('0/0 → 失败（0/0 假绿）', evaluateRun({ total: 0, fails: 0 }).code === 1);
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过：CI 跳过必红 / 本地可跳 / 达下界绿 / 有失败红 / 断言被删红 / 0-0 假绿红');
};
if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

const CHROME = findChrome();
if (!CHROME) bail('未找到 Chrome；设 CHROME_PATH 或装 Chrome for Testing');
// 预检：库不全时 Chrome 起不来——直接给出准备命令，不让脚本超时失败
{
	const probe = spawnSync(CHROME, ['--version'], { env: childEnv, encoding: 'utf-8' });
	if (probe.status !== 0) {
		const missing = String(probe.stderr ?? '').match(/lib[A-Za-z0-9._-]+\.so[\d.]*/g) ?? [];
		console.log('   准备：npm run browser:setup   （免 root 就地解包系统库到 ~/.cache/sgstory-chrome-deps）');
		bail(`Chrome 起不来${missing.length ? `，缺 ${[...new Set(missing)].join(', ')}` : ''}`);
	}
}
if (!existsSync(defaultStoryHtml())) bail(`${defaultStoryHtml()} 不存在，先 npm run build`);

// ── 静态服务 + 浏览器 ───────────────────────────────────────────
// #363（P2）：原来这个服务器**不区分路径**，所有请求都回 dist/index.html —— 于是
// `/fonts/*.woff2` 也被回成 HTML，浏览器验收实际跑在**兜底字体**上（换行/行动位置/块间距都没验到发布字体）。
// 现在按**实际路径与 MIME** 服务 dist/，并对缺文件回 404（不再静默拿 HTML 兜底）。
const MIME = {
	'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
	'.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
	'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
};
const ROOT = resolve('dist');
const server = http.createServer((req, res) => {
	let pathname;
	try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); } catch { pathname = '/'; }
	if (pathname === '/' || pathname.endsWith('/')) pathname += 'index.html';
	const file = resolve(join(ROOT, pathname));
	if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {   // 防目录穿越 + 缺文件 404
		res.statusCode = 404;
		res.setHeader('content-type', 'text/plain; charset=utf-8');
		res.end('not found');
		return;
	}
	res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
	res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const CDP_PORT = 9500 + Math.floor(Math.random() * 200);
// profile 落 home 缓存，不占共享 /tmp（/tmp 是 19G tmpfs，多会话共用、常近满）
const profile = join(HOME, `.cache/sgstory-browser-profile-${process.pid}`);
const chrome = spawn(CHROME, [
	'--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
	`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore', env: childEnv });

const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { server.close(); } catch {} };
process.on('exit', cleanup);

let target = null;
for (let i = 0; i < 60 && !target; i++) {
	try {
		const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
		target = list.find((t) => t.type === 'page') ?? null;
	} catch { /* 等浏览器起来 */ }
	if (!target) await sleep(250);
}
if (!target) { cleanup(); bail('浏览器未起来（Chrome 进程/端口未就绪）'); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
	const m = JSON.parse(e.data);
	if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((res) => {
	const id = ++seq; pending.set(id, res);
	ws.send(JSON.stringify({ id, method, params }));
});
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

await send('Page.enable');
await send('Runtime.enable');

// ── 断言框架 ────────────────────────────────────────────────────
let fails = 0;
let total = 0;
// 机器可读锚点：末行汇总印「断言 通过/总数」（CI 守卫看这一行，不必锚死具体条数）
const check = (cond, msg) => { total++; console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; };
// `#1004` B2b 裁定（2026-09-19，option 3 严格形状）：**xfail 通道** —— 已实测不成立的断言**不计失败**，
// 但**必须逐条打印实测值**、不得静默，并在末尾汇总 ＋ 指向承接票（`#1012`）。
const xfails = [];
const xfail = (label, detail) => { xfails.push(`${label} — ${detail}`); console.log(`⚠ xfail ${label} — ${detail}`); };
const shots = 'build/browser-evidence';
mkdirSync(shots, { recursive: true });
const shoot = async (name) => {
	const r = await send('Page.captureScreenshot', { format: 'png' });
	if (r.result?.data) writeFileSync(join(shots, `${name}.png`), Buffer.from(r.result.data, 'base64'));
};

// 页面里注入的辅助：按标签点链接、读布局量
const HELPERS = `
window.__sg = {
  click(label) {
    const links = [...document.querySelectorAll('#passages a.link-internal, #passages a.soc-opt, #passages a[role=button], #passages a[role=link]')];
    const a = links.find((x) => x.textContent.replace(/\\s+/g, ' ').trim() === label)
      ?? links.find((x) => x.textContent.includes(label));
    if (!a) return { ok: false, why: 'not-found', passage: SugarCube.State.passage };
    a.scrollIntoView({ block: 'center' });   // 真实用户会先滚到它
    a.click();
    return { ok: true };
  },
  play(name) { SugarCube.Engine.play(name); return true; },
  rect(sel) { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height, left: r.left, right: r.right, width: r.width }; },
  overflow() { return { scroll: document.documentElement.scrollWidth, inner: window.innerWidth }; },
  text() { return document.querySelector('#passages')?.textContent ?? ''; },
  blocks(sel) { return [...document.querySelectorAll(sel)].map((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }); },
  gotoScrollTop() { window.scrollTo(0, 0); return true; }
};`;

const setViewport = async (w, h) => {
	await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: w < 700 });
	await sleep(150);
};
const loadFresh = async (story = null) => {
	// 每次重载前清掉自动存档：视口之间不串状态（否则上一轮的旗标/血量会污染判定）
	await ev('try{localStorage.clear()}catch(e){}');
	// #441 β2：根路径 `index.html` 已是**书架页** → 必须按 storyRelPath() 进故事页。
	// 这里加一道守卫：万一又跑到别的产物上，**立即 bail**而不是让后面 38 条断言"合理地"全红
	//（那类失败看起来像布局回归，实际是"测试跑错了产物"——本仓最贵的一种假红）。
	await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${storyRelPath(story ?? undefined)}` });
	for (let i = 0; i < 40; i++) {
		await sleep(250);
		const ok = await ev('!!(window.SugarCube && SugarCube.State && SugarCube.State.passage)').catch(() => false);
		if (ok) break;
	}
	// #441 β2 守卫（放在就绪等待**之后**：navigate 后立刻查会误报——页面还没解析完）：
	// 万一又跑到书架页/别的产物上，**立即 bail**，而不是让后面 38 条断言"合理地"全红
	//（那类失败看起来像布局回归，实际是"测试跑错了产物"——本仓最贵的一种假红）。
	{
		const ok = await ev('!!document.getElementById("font-face") && !!document.getElementById("passages")');
		if (!ok) bail(`导航到的不是故事页（期望 ${storyRelPath(story ?? undefined)}）——是不是又跑到书架页/别的产物上了？`);
	}
	await ev(HELPERS);
	// #363：**字体必须真的加载**（此前服务器把所有路径都回 HTML → 验收跑在兜底字体上）。
	// 断言两件事：① 两个 woff2 由服务器按 font/* MIME 提供（且不是 HTML 兜底）；② 页面的字体族确实来自该文件。
	const fontProbe = await ev(`(async () => {
		// 两层上溯：故事页在 dist/stories/<slug>/ ⇒ 由 dist-paths 的常量插值进来（外层模板字面量里不能再写反引号）
		const files = ['Regular', 'Medium'].map((w) => '${FONT_PREFIX_FROM_STORY}LXGWWenKai-' + w + '.woff2');
		const out = [];
		for (const f of files) {
			const r = await fetch(f);
			const buf = await r.arrayBuffer();
			out.push({ f, status: r.status, type: r.headers.get('content-type') || '', bytes: buf.byteLength, magic: String.fromCharCode(...new Uint8Array(buf.slice(0, 4))) });
		}
		await document.fonts.ready;
		const faces = [...document.fonts].map((x) => x.family + ':' + x.status);
		return { out, status: document.fonts.status, faces, check: document.fonts.check('16px "LXGW WenKai"') };
	})()`);
	const badFont = (fontProbe?.out ?? []).filter((r) => r.status !== 200 || !/^font\//.test(r.type) || r.magic !== 'wOF2');
	check((fontProbe?.out ?? []).length === 2 && badFont.length === 0,
		`#363 字体按 font/* MIME 提供且是 woff2（非 HTML 兜底）${badFont.length ? `：异常 ${JSON.stringify(badFont)}` : ''}`);
	check(/loaded/.test(fontProbe?.status ?? '') && (fontProbe?.check === true),
		`#363 发布字体已加载（document.fonts：${fontProbe?.status}；check LXGW WenKai=${fontProbe?.check}；faces=${(fontProbe?.faces ?? []).filter((x) => /LXGW|WenKai/i.test(x)).join(',') || '—'}）`);
};
// 直接进段落（布局检查用；状态按需注入）——与 jsdom 侧同款短路手法
const enter = async (passage, stateJs = '') => {
	// 基线角色：开场态还没车卡（hp 未定义），直接进场景会走「已倒下」支——补一个合法角色底
	await ev(`(function(){ const pc=SugarCube.State.variables.pc;
		if (typeof pc.max_hp !== 'number' || pc.max_hp <= 0) pc.max_hp = 18;
		if (typeof pc.hp !== 'number' || pc.hp <= 0) pc.hp = pc.max_hp;
		if (typeof pc.gold !== 'number') pc.gold = 10;
		pc.inv = pc.inv || {}; pc.ev = pc.ev || {}; pc.world = pc.world || {};
		pc.star = pc.star || { spent: 0 }; })()`);
	await ev(`(function(){ ${stateJs} })()`);
	await ev(`window.__sg.play(${JSON.stringify(passage)})`);
	for (let i = 0; i < 20; i++) {
		await sleep(150);
		if (await ev(`SugarCube.State.passage === ${JSON.stringify(passage)}`)) break;
	}
	await sleep(250);
	await ev('window.__sg.gotoScrollTop()');
	await sleep(150);
};

// #284①：真机键盘序列——用 CDP Input 真发 Tab/Enter（不是 JS 派发合成事件）
const pressKey = async (key, code, vk) => {
	const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
	await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
	await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
	await sleep(70);
};
const TAB = () => pressKey('Tab', 'Tab', 9);
// `#1004` B2b 复核席实测修正（2026-09-19）：原与 TAB 共用 `rawKeyDown` —— CDP 下 `rawKeyDown`+`keyUp`
// **不产生默认动作**：对 `<a>` 打 Enter 后 `State.passage` 不变、`activeElement` 仍停在原链接
//（而真 `click()` 会导航/出反馈 → 证明是**投递方式**不对、不是链接不响应）。
// → Enter 改投带 `text` 的 `keyDown`（CDP 语义：带 `text` 才触发默认动作），本条断言自此才有判别力。
const ENTER = async () => {
	const base = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' };
	await send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
	await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
	await sleep(70);
};
const focusInfo = () => ev(`(function(){
	const a = document.activeElement;
	if (!a) return null;
	return {
		tag: a.tagName, text: (a.textContent || '').trim().slice(0, 22), cls: String(a.className || ''),
		inPassages: !!a.closest('#passages'),
		inClosedDetails: !!a.closest('details:not([open])'),
		inActs: !!a.closest('.scene-acts, .tavern-actions'),
		isFeedback: a.classList.contains('action-feedback') || a.classList.contains('scene-feedback'),
	};
})()`);

// 键盘用例（#284①）：一条正例序列 ＋ 一条反例自测（证明「折叠区不入序」的检查有牙）
async function keyboardCase(W, H) {
	await setViewport(W, H);
	await loadFresh();
	await ev(HELPERS);
	// `#1004` B2b 按裁定 A 重指: 键盘序列测的是「行动区可 Tab 抵达」这一**机制**（与故事内容无关），
	// 旧写法从 `门厅` 进（那段的行动区是旧故事专用的 `#hall-act`）→ 改从夹具进。
	// 2026-09-19 复测后改定 `女巫小屋`（`70f4045` 撤回 `门厅·看钉` 那行夹具后重选）：
	// 夹具里行动区内的宏链接**全是自环/只出面板**（读数：`酒馆` 话题链接点击后 `passage` 不变且无反馈；
	// `女巫小屋`「从炉火边拿起那件东西」/ `书房`「把案上那本日记收起来」→ **反馈由无到有**）；
	// `女巫小屋` 行动区最大（16 条）→ Tab 面与取件面都最稳。
	await enter('女巫小屋', `const pc=SugarCube.State.variables.pc; pc.inv=pc.inv||{}; pc.ev=pc.ev||{};`);
	const vp = `${W}x${H}`;

	// 反例自测：往正文里塞一个「关闭的 details ＋ 可聚焦链接」，先证明检查器认得出，
	// 再证明 Tab 不会进去（原生行为）——若将来有人给折叠区里放控件又设 display 假隐藏，这条会红。
	const negative = await ev(`(function(){
		const box = document.querySelector('#passages .passage');
		const d = document.createElement('details');
		d.innerHTML = '<summary>反例折叠</summary><a href="#" id="neg-probe" tabindex="0">反例控件</a>';
		box.appendChild(d);
		const probe = document.getElementById('neg-probe');
		return { exists: !!probe, closedDetected: !!probe.closest('details:not([open])') };
	})()`);
	check(negative.exists && negative.closedDetected, `${vp} 键盘反例自测：检查器能识别「关闭折叠区内的可聚焦控件」`);

	// 正例：Tab 序列（正文 → 跳到行动 → 行动区），全程不得落进关闭的折叠区
	const seq = [];
	for (let i = 0; i < 30; i++) {
		await TAB();
		const f = await focusInfo();
		if (!f) break;
		seq.push(f);
		if (f.inActs) break;                       // 到达行动区即停
	}
	check(seq.some((f) => f.text.includes('跳到正文')), `${vp} 键盘：首个跳转链接「跳到正文」可达（越过侧栏）`);
	check(seq.some((f) => f.text.includes('跳到行动')), `${vp} 键盘：「跳到行动」在 Tab 序列内`);
	check(seq.every((f) => !f.inClosedDetails), `${vp} 键盘：Tab 序列不入关闭的折叠区（走了 ${seq.length} 步）`);
	check(seq.some((f) => f.inActs), `${vp} 键盘：Tab 能抵达行动区控件`);

	// 键盘触发一次真实交互：把焦点放到**行动区里第一个可聚焦链接**再 Enter
	// #1004 B2b 按裁定 A 重指: 原写法钉着旧故事的文案（「先看清钉子是怎么卡的」）→ 换成
	// 与故事无关的取法（行动区/正文里第一个可聚焦链接）—— 测的仍是「Enter 能触发交互 ＋ 焦点回收」这一机制。
	// `#1004` B2b 裁定（2026-09-19 option 3）：谓词须**两条同时成立** ——
	// ① 落在引擎包过的行动区里（`closest('.scene-acts')`）；② 是 `<<link>>` 宏链接（`macro-link`）。
	// 实测依据：原写法 `querySelectorAll('.scene-acts a, #passages a.link-internal')` 返的是**文档序并集**，
	// `酒馆` 里 `pool[0]` 是裸 `[[森林边缘]]`（不在行动区）；而**只加** `closest` 谓词仍不够 ——
	// `酒馆` 的行动区首位是裸 `[[就地了结这一趟]]`（无 `macro-link`）→ 仍会选到**不响应**的裸链接。
	const FB_PROBE = `(function(){
		const slot = document.querySelector('#passages .action-feedback, #passages .scene-feedback, #passages .check-result');
		const echo = [...document.querySelectorAll('#passages *')].find(e => e.children.length === 0 &&
			(e.textContent.includes('DC') || e.textContent.includes('d20(')));
		return { hasFb: !!(slot || echo), cls: slot ? slot.className : (echo ? 'echo' : '-'),
			focusInside: !!document.activeElement?.closest('#passages'),
			focusCls: String(document.activeElement?.className || ''), passage: SugarCube.State.passage };
	})()`;
	const focusedAction = await ev(`(function(){
		const a = [...document.querySelectorAll('.scene-acts a.macro-link')]
			.find(x => x.closest('.scene-acts') && typeof x.focus === 'function');
		if (!a) return false;
		a.focus();
		return document.activeElement === a;
	})()`);
	if (focusedAction) {
		const before = await ev(FB_PROBE);
		await ENTER();
		await sleep(800);
		const after = await ev(FB_PROBE);
		// ── 半 (i)：`Enter` → **交互真被激活** —— 本片裁定后**真守护** ─────────────────────
		// 可观察面二选一：· `passage` 变化 ／ · 反馈节点**由无到有**（`!before.hasFb && after.hasFb`）。
		//注意：`70f4045` 撤回那行夹具后，夹具里**没有**会导航的行动区宏链接 → 只能取「反馈由无到有」这一支
		//（读数：`酒馆` 话题链接两支皆否；`女巫小屋`「从炉火边拿起那件东西」后者成立）。
		//注意：必须带 `before` 读数：`门厅·看钉` 那类段的**渲染期** `<<sitecheck>>` 会预置 `check-result`，
		// 只判 `after.hasFb` 会在**未按键时**即为真 → 无判别力（本片实测过的假绿，勿回退）。
		const activated = after.passage !== before.passage || (!before.hasFb && after.hasFb);
		check(activated,
			`${vp} 键盘：Enter ⇒ 交互真被激活（passage ${before.passage}→${after.passage} · 反馈 ${before.hasFb}→${after.hasFb}${after.hasFb ? `〔${after.cls}〕` : ''}）`);
		// ── 半 (ii)：焦点回收正文 —— `#1012` 修好后**转正**（用**导航型**样本）───────────
		//注意：这半**此前从未守护**：旧写法 `rawKeyDown` 从不触发默认动作 → 交互根本没发生，
		// `activeElement` 自然还停在原链接上 → 旧绿是**虚的**（借「按键前就为真的结果在屏」站的）。
		//注意：必须用**导航型**样本：`女巫小屋` 那类**非导航型**（就地反馈）按键前后焦点都在 `#passages` 内
		// → `focusInside` 两向皆真 → **无判别力**（写成 `check(after.focusInside)` 就是又一个假绿）。
		// 判据照 `docs/dev-conventions.md` §6：契约＝「**焦点仍在 `#passages` 内**」 —— **不绑元素**
		//（落 `.passage`／`.scene-acts`／反馈槽 都算过 —— 那一层是**实现路径**）。
		//注意：两向读数（2026-09-19 实测）：引擎侧那一手**禁用** → `focusInside=false`（落 `body`
		// ＝本格真会红）；**启用** → `DIV.passage` → 本格**有判别力**。
		const navTarget = await ev(`(function(){
			window.__sg.play('酒馆');
			const cur = '酒馆';
			const a = [...document.querySelectorAll('#passages .scene-acts a.link-internal')]
				.find(x => (x.getAttribute('data-passage') ?? '') && x.getAttribute('data-passage') !== cur);
			if (!a) return null;
			a.focus();
			return { label: a.textContent.trim().slice(0, 18), target: a.getAttribute('data-passage'), focused: document.activeElement === a };
		})()`);
		if (navTarget && navTarget.focused) {
			await sleep(300);
			const navBefore = await ev(FB_PROBE);
			await ENTER();
			await sleep(800);
			const navAfter = await ev(FB_PROBE);
			// 两半都要能假：① **真导航**（`passage` 到目标 —— 否则就不是"导航型"样本了）；
			// ② **焦点仍在正文内**（§6 的契约）。
			check(navAfter.passage === navTarget.target,
				`${vp} 键盘：Enter ⇒ **导航型**交互真发生（${navBefore.passage}→${navAfter.passage}，目标「${navTarget.label}」⇒ ${navTarget.target}）`);
			check(navAfter.focusInside,
				`${vp} 键盘：导航后**焦点回收正文**（焦点在正文=${navAfter.focusInside} · focus=${navAfter.focusCls.slice(0, 30)} · 「#1012」✓）`);
		} else {
			check(false, `${vp} 键盘：找不到「会换段落」的行动区链接（样本变了？）`);
		}
	} else {
		check(false, `${vp} 键盘：找不到可聚焦的行动链接（状态不对？）`);
	}
}

const VP = [[360, 667], [390, 844], [1280, 844]];
const label = (w, h) => `${w}x${h}`;

console.log('══ 真实浏览器验收（#263 · #185 阶段五）══');
console.log(`   浏览器：${CHROME.replace(HOME, '~')}`);

for (const [W, H] of VP) {
	await setViewport(W, H);
	await loadFresh();
	const vp = label(W, H);
	console.log(`\n── 视口 ${vp}`);

	// ⑤ 无横向溢出（开场）
	const ov = await ev('window.__sg.overflow()');
	check(ov.scroll <= ov.inner + 1, `${vp} 开场无横向溢出（${ov.scroll} ≤ ${ov.inner}）`);

	// ① 战斗首屏：行动入口在视口内 + 首屏空白
	await ev(HELPERS);
	// `#1004` B2b 复核席按**裁定 A** 重指（面级 → 重指到有该面的样本）：旧名 `雾之魔物·战` 是**已删故事**的战斗段
	// → 换到面夹具的战斗段 `洞穴·战斗`（`<<fightbegin "雾影">>` ＋ `<<fightpanel "…" false>>`，战斗面满配）。
	await enter('洞穴·战斗', `const pc=SugarCube.State.variables.pc; pc.inv=pc.inv||{}; pc.ev=pc.ev||{}; delete pc.ev.fight; pc.hp=pc.max_hp;`);
	{
		const acts = await ev('window.__sg.rect(".fight-acts a")');
		const diag = await ev('JSON.stringify({p:SugarCube.State.passage,a:document.querySelectorAll(".fight-acts a").length,hp:SugarCube.State.variables.pc.hp,f:!!SugarCube.State.variables.pc.ev.fight})');
		check(!!acts && acts.top < H, `${vp} 战斗首屏：第一项行动在视口内（top=${Math.round(acts?.top ?? -1)} < ${H}）取景=${diag}`);
		const firstBlock = await ev('window.__sg.rect("#passages .passage > *")');
		check(!!firstBlock && firstBlock.top < 260, `${vp} 战斗首屏：无近整屏空白（首块 top=${Math.round(firstBlock?.top ?? -1)}）`);
		await shoot(`${vp}-combat-first`);
	}

	// ② 战斗回合：点一手 → 检定/你/它/下一轮 相邻成块
	{
		const first = await ev('(function(){const a=document.querySelector(".fight-acts a"); if(!a) return null; return a.textContent.trim();})()');
		if (first) {
			await ev(`window.__sg.click(${JSON.stringify(first)})`);
			await sleep(700);
			// 一轮的反馈块（检定/你/它/伤害）按 DOM 顺序取，测相邻块间距——漏块会把中间隔着的块算成空白
			const gaps = await ev(`(function(){
				const els=[...document.querySelectorAll('#passages .check-result, #passages .fight-log, #passages .damage-flash')];
				if(els.length<2) return null;
				const rects=els.map(el=>el.getBoundingClientRect()).sort((a,b)=>a.top-b.top);
				let max=0; for(let i=1;i<rects.length;i++) max=Math.max(max, rects[i].top-rects[i-1].bottom);
				return max;
			})()`);
			check(gaps !== null && gaps < 60, `${vp} 战斗回合：反馈相邻成块（最大间距=${gaps === null ? 'n/a' : Math.round(gaps)}px < 60）`);
			await shoot(`${vp}-combat-round`);
		}
	}

	// ③ 门厅：观察结果留屏且可见
	await ev(HELPERS);
	await enter('门厅', `const pc=SugarCube.State.variables.pc; pc.inv=pc.inv||{}; pc.ev=pc.ev||{}; delete pc.inv['坏哨']; delete pc.world.whistle_taken;   // #1004 B2b: 夹具的场地旗标是 world.whistle_taken（旧写的 ev.hall_seen 是旧故事的）`);
	{
		// `#1004` B2b：入口按夹具改准（夹具 `门厅` 的观察入口叫 `看钉`；`先看清钉子是怎么卡的` 是旧故事的文案）
		const clk = await ev('window.__sg.click("看钉")');
		await sleep(900);
		if (!clk?.ok) console.log(`   （门厅点击未命中：${JSON.stringify(clk)} passage=${await ev('SugarCube.State.passage')}）`);
		const res = await ev(`(function(){
			// #1004 B2b: 读数对准夹具的等价可观察面 —— 夹具 门厅·看钉 把结果写在**正文段落**里
			//（旧故事放在 #hall-act 那种专用容器里）。判据语义不变：**结果在屏且在视口内**。
			const p=document.querySelector('#passages .passage'); if(!p) return null;
			// 实况读数: 夹具这条走"点击时检定" ⇒ 结果落在结果槽里（形如 察觉检定（感知）〔门厅·看钉〕 DC11）。
			// （我上一版改成找正文文案「钉子旁边那圈灰」是找错了对象 —— 那句是段落正文，不是结果）。
			const hit=[...document.querySelectorAll('#passages .check-result, #passages .scene-feedback')]
				.find(e=>/门厅·看钉|检定/.test(e.textContent));
			if(!hit) return null; const r=hit.getBoundingClientRect(); return { top:r.top, bottom:r.bottom, text:hit.textContent.slice(0,40) };
		})()`);
		if (!res) console.log(`   （门厅结果未找到：结果槽=${String(await ev(`document.querySelector('#passages .scene-feedback, #passages .check-result')?.textContent?.replace(/\s+/g,' ').slice(0,80) ?? 'NO'`))}）`);
		check(!!res && res.top < H, `${vp} 门厅：观察结果留屏且在视口内（top=${Math.round(res?.top ?? -1)}）`);
		await shoot(`${vp}-hall-result`);
	}

	// ④ 守林人：子对话返回＝短入口＋行动区可见（不重放介绍）
	await ev(HELPERS);
	await enter('守林人', `const pc=SugarCube.State.variables.pc; pc.inv=pc.inv||{}; pc.ev=pc.ev||{}; pc.keeper=pc.keeper||{}; pc.keeper.met=true;`);
	{
		// ⛔ **退役 ＋ 声明**（`#1004` B2b，按裁定 A 的"剧情级"半边）：原两格
		//「**不重放首遇介绍**」（认台词「我就是守林人」）与「**子对话返回** → 行动区在视口内」
		//（走 `问他：你守的到底是什么` → `回到守林人`）—— 那是**旧故事**的首遇门控 ＋ 子对话层；
		// 面夹具的 `守林人` 只是一个 hub（`他拄着杖站在路口。` ＋ `<<socpanel>>`）→ 两面**都没有对象**。
		//注意：**声明**：**「首遇门控（`keeper_intro`）＋ 子对话返回落点」这两面自此无端到端守护**
		//（其**非真机**对偶件 `test/saveui.mjs` 那一格也已同批退役并声明）。
		// 保留并可机检的那半：**入口块在视口内**（真机布局下不空屏）—— 改判夹具的交涉面板/首个可点项。
		const acts = await ev('window.__sg.rect(".soc-opt, .socpanel, #passages a.link-internal")');
		check(!!acts && acts.top < H * 0.8, `${vp} 守林人：首个可点项落在视口内（top=${Math.round(acts?.top ?? -1)}）`);
		await shoot(`${vp}-keeper-entry`);
	}

	// ⑤ 放大文字 200% 仍无横向溢出
	await ev(`document.documentElement.style.fontSize='200%'`);
	await sleep(300);
	const ov2 = await ev('window.__sg.overflow()');
	check(ov2.scroll <= ov2.inner + 1, `${vp} 放大文字 200% 无横向溢出（${ov2.scroll} ≤ ${ov2.inner}）`);
	await ev(`document.documentElement.style.fontSize=''`);
}

// ── `#491` 判据 5：**第三个故事**的真机三视口（本故事自己的一遍；故事 1 的用例不套用）──
{
	// `#1004` B2b 复核席按**裁定 A** 重指：这一块测的是「**无车卡的故事**也要有最小面（血量/物品栏）＋
	// 多选一可点 ＋ 200% 不溢出」 —— `hollow-cave` 已删 → 换到同样**无车卡**的冒烟故事 `minimal-demo`
	//（它的入口是 `开场`、多选一在 `岔路`）。
	const SB = 'minimal-demo';
	if (!existsSync(storyHtml(SB))) {
		console.log(`\n（跳过故事 2 真机：${storyHtml(SB)} 不存在——先 npm run build）`);
	} else {
		console.log('\n══ 故事 2 真机三视口（#491 判据 5／无名洞窟）══');
		for (const [W, H] of VP) {
			const vp = label(W, H);
			await setViewport(W, H);
			await loadFresh(SB);
			console.log(`\n── 视口 ${vp}（故事 2）`);
			// ① 开场无横向溢出
			const ov = await ev('window.__sg.overflow()');
			check(ov.scroll <= ov.inner + 1, `${vp} 故事2 开场无横向溢出（${ov.scroll} ≤ ${ov.inner}）`);
			// ② 侧栏：**没有车卡的故事也要能看见血量与物品**（`#574` 的最小面；这是"战斗试验场"的前提）
			const bar = await ev(`(function(){const c=document.querySelector('#story-caption')||document.getElementById('ui-bar');return { hp: !!document.querySelector('.hpbar'), inv: !!document.querySelector('.inv-block'), text: (c?.textContent||'').replace(/\\s+/g,' ').slice(0,40) };})()`);
			check(bar.hp, `${vp} 故事2 侧栏给出**血量条**（无车卡的最小面）`);
			check(bar.inv, `${vp} 故事2 侧栏给出**物品栏**`);
			// ③ 三选一：真机布局下至少两条路落在视口内（可点性/首屏不空）
			await ev('window.__sg.play("岔路")');   // `#1004` B2b：`minimal-demo` 的多选一段叫 `岔路`（旧写法 `岔口` 是旧故事的）
			await sleep(320);
			const cards = await ev('window.__sg.blocks("#passages a.link-internal")');
			const inVp = (cards ?? []).filter((b) => b.bottom <= H + 1).length;
			check((cards ?? []).length >= 2 && inVp >= 2, `${vp} 故事2 三选一：≥2 条路在视口内（共 ${(cards ?? []).length} 条 · 在内 ${inVp}）`);
			// ④ 200% 文字缩放仍无横向溢出（与故事 1 同口径）
			await ev('document.documentElement.style.fontSize = "200%"');
			await sleep(220);
			const ov2 = await ev('window.__sg.overflow()');
			check(ov2.scroll <= ov2.inner + 1, `${vp} 故事2 文字 200% 无横向溢出（${ov2.scroll} ≤ ${ov2.inner}）`);
			await ev('document.documentElement.style.fontSize = ""');
		}
	}
}

// #284①：键盘序列（真机按键）——单视口做即可，走 390×844
console.log('\n── 键盘序列（#284①，真机 Tab/Enter）');
await keyboardCase(390, 844);

if (xfails.length) {
	console.log(`\n⚠ xfail ${xfails.length} 条（已实测不成立，**不计失败**，逐条指向承接票）：`);
	for (const x of xfails) console.log(`   ⚠ ${x}`);
}
const summary = `${fails ? '✗' : '✔'} 真实浏览器验收：${fails ? `${fails} 项失败` : '全部通过'}（断言 ${total - fails}/${total} · ${VP.length} 视口 × 4 场景 ＋ 键盘序列 1 例）`;
console.log(`\n${summary}`);
console.log(`   截图：${shots}/（${VP.length} 视口 × 4 场景）`);
const verdict = evaluateRun({ total, fails });
for (const n of verdict.notes) console.error(n);
console.log(`BROWSER_ASSERTIONS ${total - fails}/${total}`);   // 稳定锚点（#385 后 CI 不再需要解析它，保留供人读）
cleanup();
process.exit(verdict.code);
