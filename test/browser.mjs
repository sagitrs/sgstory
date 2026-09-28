
import { storyRelPath, storyHtml, shelfHtml, FONT_PREFIX_FROM_STORY, DIST_DIR } from '../scripts/dist-paths.mjs';   // ★ `#1532`：加 `shelfHtml`（引擎层跑书架页 ✓）   // ★`#1504`：`DIST_DIR` 是**根**的单一权威（✗ 不再硬编 `resolve('dist')`）
import { DEFAULT_SLUG } from '../scripts/dist-paths.mjs';

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

// `#1261` 零故事模式（CI 面可见）：本件的对象＝**构建产物在真机浏览器里正确**（产品面，会活过 M1b）；
// 仓内无故事 -> 没有逐故事产物可验 -> 明说并退 0（不是静默跳过：CI 日志可见此行）。
// 状态＝「临时下架」：随 `#1163`（books 回填样本）恢复。

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
// `MIN_ASSERTIONS_ENGINE` → 断言数**下界自 ratchet**：跟着脚本里的断言数走，删除断言即红
//（换成 workflow 里的魔数就会腐烂：原来写死 `N -ge 24`，而实际早已 38 —— 删 14 条断言也照样放行）
export const REQUIRE_BROWSER = process.env.CI_REQUIRE_BROWSER === '1';

export const TIERS = (process.env.BROWSER_TIERS ?? 'all').trim() || 'all';
export const runsEngine = TIERS === 'all' || TIERS === 'engine';


export const MIN_ASSERTIONS_ENGINE = 33;
// 跳过时该退什么码（纯函数，便于自证）
export const skipVerdict = (requireBrowser) => (requireBrowser
	? { code: 1, notes: ['✗ CI_REQUIRE_BROWSER=1：浏览器验收被跳过 ＝ CI 接线失效（不许静默降级）'] }
	: { code: 0, notes: [] });

// ★ `#1532`（写作者侦察 `5851352857` 的裁）：★**未判 ≠ 通过** —— ★探不到浏览器（环境缺）时
//   本件**必须出声说“未判”**，✗ 不许静默绿 ✗。
//   ★为什么单列：★“跳过”（`skipVerdict`）允许本地退 0（★有意的本地便利）；
//     而“**环境缺 ⇒ 根本没判**”是**另一种**事 ⇒ ★若也退 0 ⇒ ★绿灯看着有验收、其实一行没跑 ✓
//     （★与 `#363`／`#385` 那族“静默降级”同源 ✓）
//   ★Chrome 可得性裁（协调席）：甲类跑 **realmachine job 的 `BROWSER_TIERS=engine` 步骤**（该 job 保证有 Chrome）；
//     books tier 用 **books CI 自装 playwright**（✗ 不跨仓 realmachine checkout ✓）
export const unjudgedVerdict = () => ({
	code: 1,
	notes: ['✗ 未判：探不到浏览器（环境缺 Chrome）—— ★这**不等于通过**（✗ 静默绿）；★请装 Chrome for Testing 或 `npm run browser:setup`'],
});

// 跑完时的判定（纯函数，便于自证）
export const evaluateRun = ({ total, fails, minAssertions = MIN_ASSERTIONS_ENGINE }) => {
	if (total < minAssertions) {
		return { code: 1, notes: [`✗ 断言数 ${total} < 下界 ${minAssertions}——这不像失败，像**被删除**：请补回断言，或同步下调 MIN_ASSERTIONS_ENGINE 并写明理由`] };
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

// ★ `#1498`（诊断 P1-b／S12）：**零故事早退必须归并进 `bail()` 的单一出口**。
//   原状：`if (!DEFAULT_SLUG) { …; process.exit(0); }` **在 `REQUIRE_BROWSER`／`skipVerdict` 之前**（:28 附近）
//     ⇒ ★`CI_REQUIRE_BROWSER=1` 时**严格门被短路**（零故事 ⇒ 退 0 ＝ 静默降级 ✗ —— 正是 CI 接线失效）
//   修：走 `bail('零故事（仓内无逐故事产物，until #1163）')` ⇒ ★严格门与跳过成为**同一判定面** ✓
//     ① 不设 `CI_REQUIRE_BROWSER` ⇒ 明说未判 ＋ **退 0**（本地行为**不变** ✓）
//     ② 设 `=1` ⇒ ★**报"浏览器验收被跳过 ＝ CI 接线失效" ＋ 退 1** ✓

const selftest = () => {
	let bad = 0;
	const t = (msg, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${msg}`); };
	t('跳过 + CI_REQUIRE_BROWSER=1 → 必须失败（不许静默降级）', skipVerdict(true).code === 1);
	t('跳过 + 本地（无该变量）→ 允许，退 0', skipVerdict(false).code === 0);
	// 用 `MIN_ASSERTIONS_ENGINE` 现算（不写死数字）：下界一涨，这几例自动跟着走（否则每加断言都要改自证）
	t(`${MIN_ASSERTIONS_ENGINE}/${MIN_ASSERTIONS_ENGINE} 达下界 → 通过`, evaluateRun({ total: MIN_ASSERTIONS_ENGINE, fails: 0 }).code === 0);
	t(`${MIN_ASSERTIONS_ENGINE}/${MIN_ASSERTIONS_ENGINE}（有失败）→ 失败`, evaluateRun({ total: MIN_ASSERTIONS_ENGINE, fails: 1 }).code === 1);
	t(`${MIN_ASSERTIONS_ENGINE - 5}/${MIN_ASSERTIONS_ENGINE - 5} 低于下界 → 失败（断言被删也算红，不靠 workflow 魔数）`, evaluateRun({ total: MIN_ASSERTIONS_ENGINE - 5, fails: 0, minAssertions: MIN_ASSERTIONS_ENGINE }).code === 1);
	t('0/0 → 失败（0/0 假绿）', evaluateRun({ total: 0, fails: 0 }).code === 1);
	// ★ `#1532`：★**未判也必退 1**（★与“跳过”分开：跳过允许本地退 0，未判不允许 ✓）
	t('未判（环境缺）⇒ **必退 1**（✗ 静默绿）', unjudgedVerdict().code === 1);
	t('★下界**边沿**（★`#1597` 后只剩**引擎层**一层 ⇒ ✗ 不再说「两层」✓）：达下界绿／低一条红',
		evaluateRun({ total: MIN_ASSERTIONS_ENGINE, fails: 0, minAssertions: MIN_ASSERTIONS_ENGINE }).code === 0
		&& evaluateRun({ total: MIN_ASSERTIONS_ENGINE - 1, fails: 0, minAssertions: MIN_ASSERTIONS_ENGINE }).code === 1);
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过：CI 跳过必红 / 本地可跳 / 达下界绿 / 有失败红 / 断言被删红 / 0-0 假绿红');
};
if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }


const CHROME = findChrome();
if (!CHROME) {
	// ★ `#1532`：★**未判**（✗ 不是跳过、✗ 不是通过）⇒ ★必须出声 ＋ 退 1 ✓
	const v = unjudgedVerdict();
	console.error('✗ 真实浏览器验收：**未判**（探不到 Chrome）—— ★这不等于通过 ✗');
	console.log('BROWSER_ASSERTIONS unjudged');
	for (const n of v.notes) console.error(n);
	process.exit(v.code);
}
// 预检：库不全时 Chrome 起不来——直接给出准备命令，不让脚本超时失败
{
	const probe = spawnSync(CHROME, ['--version'], { env: childEnv, encoding: 'utf-8' });
	if (probe.status !== 0) {
		const missing = String(probe.stderr ?? '').match(/lib[A-Za-z0-9._-]+\.so[\d.]*/g) ?? [];
		console.log('   准备：npm run browser:setup   （免 root 就地解包系统库到 ~/.cache/sgstory-chrome-deps）');
		bail(`Chrome 起不来${missing.length ? `，缺 ${[...new Set(missing)].join(', ')}` : ''}`);
	}
}
// ★ `#1532`：★引擎层只需**书架页**；乙类（故事层）才需故事页 ✓
// ★ `#1597`（收窄）：story 档已撤 ⇒ ★本件只跑**引擎层**（对象＝仓内最小夹具 ✓），✗ 不再看逐故事产物 ✓
if (!existsSync(shelfHtml())) bail(`${shelfHtml()} 不存在，先 npm run build`);

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
// ★ `#1504` CR（转述＋实证）：本服务器此前硬编**仓根** `resolve('dist')`
//   ⇒ ★与 `SG_STORIES_DIR=夹具` 合用时，产物在 `test/fixtures/<夹具>/dist/` ⇒ **服务器 404** ⇒ 导航到非故事页 ⇒ bail ✗
//   ⇒ ★正解：改用**同一权威** `DIST_DIR`（`dist-paths.mjs` 已导出 —— ★本件别处已 import 它三个函数，但**没用它** ⇒ 半拉口径 ✓）
const ROOT = DIST_DIR;
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
	// ★ `#1532`：★引擎层（零故事 / ★无正式故事页）跑**书架页**（`dist/index.html`）——
	//   ★甲类断言（字体／版式）全在书架页上成立 ✓（★✗ 再要求"故事页" ✗）
	// ★ `#1532`（修）：★**只有“没有指定故事”时才走书架页** ——
	//     （★实测：侧栏无血量条、链接数 0 —— ★因为根本没进故事页 ✗）
	const goShelf = story == null && !DEFAULT_SLUG;   // ★ `#1597`：story 档已撤（✗ 不再看 runsStory ✓）
	await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${goShelf ? 'index.html' : storyRelPath(story ?? undefined)}` });
	for (let i = 0; i < 40; i++) {
		await sleep(250);
		// ★ `#1532`：书架页**没有 SugarCube**（它是静态选书页）⇒ ★改问"**页面已挂上字体面**"
		const ok = goShelf
			? await ev('!!document.getElementById("font-face")').catch(() => false)
			: await ev('!!(window.SugarCube && SugarCube.State && SugarCube.State.passage)').catch(() => false);
		if (ok) break;
	}
	// #441 β2 守卫（放在就绪等待**之后**：navigate 后立刻查会误报——页面还没解析完）：
	// 万一又跑到书架页/别的产物上，**立即 bail**，而不是让后面 38 条断言"合理地"全红
	//（那类失败看起来像布局回归，实际是"测试跑错了产物"——本仓最贵的一种假红）。
	{
		const ok = goShelf
			? await ev('!!document.getElementById("font-face")')
			: await ev('!!document.getElementById("font-face") && !!document.getElementById("passages")');
		if (!ok && !goShelf) bail(`导航到的不是故事页（期望 ${storyRelPath(story ?? undefined)}）——是不是又跑到书架页/别的产物上了？`);
	}
	await ev(HELPERS);
	// #363：**字体必须真的加载**（此前服务器把所有路径都回 HTML → 验收跑在兜底字体上）。
	// 断言两件事：① 两个 woff2 由服务器按 font/* MIME 提供（且不是 HTML 兜底）；② 页面的字体族确实来自该文件。
	const fontProbe = await ev(`(async () => {
		// 两层上溯：故事页在 dist/stories/<slug>/ -> 由 dist-paths 的常量插值进来（外层模板字面量里不能再写反引号）
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
		inActs: !!a.closest('.acts'),
		isFeedback: a.classList.contains('action-feedback') || a.classList.contains('scene-feedback'),
	};
})()`);

const VP = [[360, 667], [390, 844], [1280, 844]];
const label = (w, h) => `${w}x${h}`;

console.log('══ 真实浏览器验收（#263 · #185 阶段五）══');
console.log(`   浏览器：${CHROME.replace(HOME, '~')}`);

for (const [W, H] of VP) {
	await setViewport(W, H);
	// ★`#1592` M7：★**按档**载入 —— story 档各块**各自 `loadFresh(<自己的故事>)`**（✗ 从前无参 ⇒ 全格跑同一个故事 ✗）；
	await loadFresh();   // ★ `#1597`：story 档已撤 ⇒ ★统一落在夹具默认故事上 ✓
	const vp = label(W, H);
	console.log(`\n── 视口 ${vp}`);

	// ⑤ 无横向溢出（开场）
	const ov = await ev('window.__sg.overflow()');
	check(ov.scroll <= ov.inner + 1, `${vp} 开场无横向溢出（${ov.scroll} ≤ ${ov.inner}）`);

	// ① 战斗首屏：行动入口在视口内 + 首屏空白
	await ev(HELPERS);

	// ⑤ 放大文字 200% 仍无横向溢出
	await ev(`document.documentElement.style.fontSize='200%'`);
	await sleep(300);
	const ov2 = await ev('window.__sg.overflow()');
	check(ov2.scroll <= ov2.inner + 1, `${vp} 放大文字 200% 无横向溢出（${ov2.scroll} ≤ ${ov2.inner}）`);
	await ev(`document.documentElement.style.fontSize=''`);
}

// ── `#491` 判据 5：**无车卡最小面**的真机三视口（★`#1532` 归**引擎层**：用仓内夹具 `nocar-basic` ✓）──
{
	// ★ `#1532`：★丙类（无车卡最小面）⇒ ★归**引擎层**（★用仓内夹具 ⇒ ✗ 不需真故事 ✓）
	if (runsEngine) {
	// `#1004` B2b 复核席按**裁定 A** 重指：这一块测的是「**无车卡的故事**也要有最小面（血量/物品栏）＋
	// 多选一可点 ＋ 200% 不溢出」 —— `hollow-cave` 已删 → 换到同样**无车卡**的冒烟故事 `minimal-demo`
	//（它的入口是 `开场`、多选一在 `岔路`）。
	// ★★ `#1532`（`#1516` C 案、丙类）：★本块测的是「**无车卡的故事也要有最小面**」
	//   （侧栏血量条／物品栏／三选一／200% 不溢出）—— ★**先前点的 `minimal-demo` 是 books 侧故事**（仓内无）
	//   ⇒ ★★改指**仓内最小夹具** `nocar-basic`（`test/fixtures/m3-nocar-fixture`）——
	//   ★它正是为这一面建的（无车卡 ＋ `vitals` 走引擎 `BUILTIN` 缺省 ＋ 三路 ✓）
	//   ★归层：★丙类（形状通用、取值来自最小夹具）⇒ ★**跟 `runsEngine`（引擎层）一起跑** ✓
	const SB = 'nocar-basic';
	if (!existsSync(storyHtml(SB))) {
		console.log(`\n（跳过无车卡最小面真机：${storyHtml(SB)} 不存在——先 npm run build）`);
	} else {
		console.log('\n══ 无车卡最小面 真机三视口（#491 判据 5／`nocar-basic`）══');
		for (const [W, H] of VP) {
			const vp = label(W, H);
			await setViewport(W, H);
			await loadFresh(SB);
			console.log(`\n── 视口 ${vp}（无车卡最小面）`);   // ★ `#1597` 收尾：对象＝仓内夹具 `nocar-basic`（✗ 不再是「故事 2」✓）
			// ① 开场无横向溢出
			const ov = await ev('window.__sg.overflow()');
			check(ov.scroll <= ov.inner + 1, `${vp} 无车卡最小面 开场无横向溢出（${ov.scroll} ≤ ${ov.inner}）`);
			// ② 侧栏：**没有车卡的故事也要能看见血量与物品**（`#574` 的最小面；这是"战斗试验场"的前提）
			// ★`#1539`（P3）**解耦**：原先断言写死**实现类名**（`.hpbar`／`.inv-block`）—— 那是
			//   "断言随实现走"（实现一换类名它就红，而产品其实是对的；本次 CR 的根因之一）。
			//   ⇒ 改为按**几何**判（✗ 不绑类名、✗ 也不只看 `style.width`）：
			//     ★★`#1556` 评审（② MAJOR）实测过：只判"`style.width` 含 `%`"是**不够的** ——
			//     若 CSS 缺失（`.sg-bar*` 无样式 ⇒ 高度 0）则"节点在、宽度属性也在"而**玩家看不见** ⇒
			//     判据会**绿**而对象**不在**（正是"判据绿而对象不在"那一族）。
			//     ⇒ 判**可见性**：该量条元素 `getBoundingClientRect().height > 0`（有高度才是真能看见）。
			//     · 量条：侧栏内**有高度 > 0** 的元素其 `style.width` 带 `%`；
			//     · 列表：`.sg-list-item` **或**旧壳 `.inv-item`，且其 rect 高度 > 0。
			const bar = await ev(`(function(){
				const c = document.querySelector('#story-caption') || document.getElementById('ui-bar');
				const scope = c || document;
				const visible = (el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.width > 0; };
				const barEl = [...scope.querySelectorAll('*')].find((el) => /%/.test(el.style?.width || '') && visible(el));
				const listEl = [...scope.querySelectorAll('.sg-list-item, .inv-item')].find(visible);
				return { bar: !!barEl, list: !!listEl, text: (c?.textContent || '').replace(/\\s+/g, ' ').slice(0, 40) };
			})()`);
			check(bar.bar, `${vp} 无车卡最小面 侧栏给出**血量条**（无车卡的最小面 · 判"有**可见**的百分比量条"——几何 > 0，✗ 只看属性）`);
			check(bar.list, `${vp} 无车卡最小面 侧栏给出**物品栏**（判"有**可见**的列表项"）`);
			// ③ 三选一：真机布局下至少两条路落在视口内（可点性/首屏不空）
			await ev(`window.__sg.play("${'岔路'}")`);   // `#1004` B2b：`minimal-demo` 的多选一段叫 `岔路`（旧写法 `岔口` 是旧故事的）
			await sleep(320);
			const cards = await ev('window.__sg.blocks("#passages a.link-internal")');
			const inVp = (cards ?? []).filter((b) => b.bottom <= H + 1).length;
			check((cards ?? []).length >= 2 && inVp >= 2, `${vp} 无车卡最小面 三选一：≥2 条路在视口内（共 ${(cards ?? []).length} 条 · 在内 ${inVp}）`);
			// ④ 200% 文字缩放仍无横向溢出（与故事 1 同口径）
			await ev('document.documentElement.style.fontSize = "200%"');
			await sleep(220);
			const ov2 = await ev('window.__sg.overflow()');
			check(ov2.scroll <= ov2.inner + 1, `${vp} 无车卡最小面 文字 200% 无横向溢出（${ov2.scroll} ≤ ${ov2.inner}）`);
			await ev('document.documentElement.style.fontSize = ""');
		}
	}
}

	}

if (xfails.length) {
	console.log(`\n⚠ xfail ${xfails.length} 条（已实测不成立，**不计失败**，逐条指向承接票）：`);
	for (const x of xfails) console.log(`   ⚠ ${x}`);
}
const summary = `${fails ? '✗' : '✔'} 真实浏览器验收：${fails ? `${fails} 项失败` : '全部通过'}（断言 ${total - fails}/${total} · ${VP.length} 视口 × 4 场景）`;
console.log(`\n${summary}`);
console.log(`   截图：${shots}/（${VP.length} 视口 × 4 场景）`);
const verdict = evaluateRun({ total, fails });
for (const n of verdict.notes) console.error(n);
console.log(`BROWSER_ASSERTIONS ${total - fails}/${total}`);   // 稳定锚点（#385 后 CI 不再需要解析它，保留供人读）
cleanup();
process.exit(verdict.code);
