
import { defaultStoryHtml, storyRelPath, storyHtml, shelfHtml, FONT_PREFIX_FROM_STORY, DIST_DIR } from '../scripts/dist-paths.mjs';   // ★ `#1532`：加 `shelfHtml`（引擎层跑书架页 ✓）   // ★`#1504`：`DIST_DIR` 是**根**的单一权威（✗ 不再硬编 `resolve('dist')`）
import { DEFAULT_SLUG } from '../scripts/dist-paths.mjs';
import { resolveStoryMap } from '../scripts/browser-story-map.mjs';   // ★ `#1532`：乙类映射表（无副作用 ⇒ 格可进程内量 ✓）   // `#1261`：零故事判定（与同批门同口径）

// ★★ `#1592` M7／A：战斗首屏面的**门闸**（✗ 旋钮 —— ★它是「对象形未定」的显式记号 ✓）
//   ★unblock：**战斗阶梯阶 3**（结果渲染＋命中判定）落地 ⇒ 重定对象 ＋ 置 true（挂 `#1542` 链 ✓）
const A_FIGHT_FACE_READY = false;
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
// `MIN_ASSERTIONS` → 断言数**下界自 ratchet**：跟着脚本里的断言数走，删除断言即红
//（换成 workflow 里的魔数就会腐烂：原来写死 `N -ge 24`，而实际早已 38 —— 删 14 条断言也照样放行）
export const REQUIRE_BROWSER = process.env.CI_REQUIRE_BROWSER === '1';
// ★ `#1532`（`#1516` C 案）：★断言**分层开关** —— 按“是否依赖故事内容”分两层：
//   · `engine`（甲＋丙）：★**不依赖故事内容** ⇒ ★零故事／单夹具即可跑（引擎侧持有 ✓）
//   · `story`（乙）：★**点名段名／事件键** ⇒ ★需真故事（归 books 侧 ✓ —— `books#36`）
//   ★默认 `all`（✗ 改旧行为）；`BROWSER_TIERS=engine` ⇒ 只跑甲＋丙。
// ★★ `#1532`（坐标裁）：乙类的**段名／入口名／事件键**可注入 ——
//   ★实现已抽到 **无副作用模块** `scripts/browser-story-map.mjs`（★门与格**同 import 同一份** ✓）
//   ★为何要抽（CR：**注入生效无近格** —— ★“守卫在远处” ✗）：
//     ★原写法是**顶层 IIFE**（读 env ＋ 失败即 `process.exit(1)`）⇒
//     ★`browser.mjs` 是**顶层 await 脚本** ⇒ ★**无法在进程内 import 它**来量“注入到底生效没” ✗
//     ★⇒ 故自证只能**在远处**断言（“默认值＝旧值”）而**注入那一路没近格** ✗
//   ★现在：★格可 `resolveStoryMap({ env: { SG_BROWSER_STORY_MAP: '…' } })` **直接量** ✓
const { map: _SM, error: _SM_ERR } = resolveStoryMap({ env: process.env });
if (_SM_ERR) { console.error('✗ ' + _SM_ERR); process.exit(1); }
export const STORY_MAP = _SM;

export const TIERS = (process.env.BROWSER_TIERS ?? 'all').trim() || 'all';
export const runsEngine = TIERS === 'all' || TIERS === 'engine';
export const runsStory = TIERS === 'all' || TIERS === 'story';
//注意：`#1004` B2b 复核席**下调**：59 → 56（**写明理由**，这条门本来就允许"同步下调并写明理由"）。
// 理由：下界当初有一部分是「**故事 2（`hollow-cave`）三视口 +15**」撑起来的（`#491` 判据 5）；
// 该故事已随 B 段删除 → 本件那一块按**裁定 A** 重指到同样**无车卡**的冒烟故事 `minimal-demo`
//（它的多选一段比旧的故事 2 少一条 → 这一块从 15 格降到 12 格）→ **实测总数 56**。
// ⛔ 这不是"删断言凑绿"：**没有任何一格是被删掉的** —— 少的是"旧故事特有的那一页"，
// 且它换掉的那一面（无车卡最小面／多选一可点／200% 不溢出）**逐条仍在**。
export const MIN_ASSERTIONS = 58;   // `#1012`（2026-09-19）：+1＝新增「导航型交互」断言、+1＝原先 xfail 的「焦点回收正文」**转正** → 只涨

// ★ `#1532`（`#1516` C 案）：★**下界拆双 ratchet** —— ★两层各自管自己的下界：
//   · `ENGINE`（甲＋丙）：★零故事即可跑 ⇒ ★**现测 12**（★为什么不是 0：3 视口 × 4 条甲类）
//   · `STORY`（乙）：★需真故事 ⇒ ★现下界 **58**（★两层合跑时的总数 —— ★下一步拆完各自重算 ✓）
//   ★★**为何必须拆**：★若共用 58 ⇒ ★以引擎层跑时**永远红**（★不是真红 —— 是下界不对）；
//     而★**它更坏的一面**：★若为了跑绿而把 58 改小 ⇒ ★删乙类断言也会放行 ✗
export const MIN_ASSERTIONS_ENGINE = 33;
// ★★ `#1592` M7／D：**下界按在场格重算 ＋ 写明理由**（协调席裁 ③ ✓；✗ 不容忍「凭旧数虚高」✗）
//   ★旧值 58 的前提是「五键段都在且都满格」—— 而实测那五键**四个在语料里根本不存在**（`#1592` 归因表 ✓），
//     那时的 58 是**靠零故事分支空转**凑的（✗ 假绿）⇒ ★今天 story 档**真跑**、**真对象**只有：
//       ① B 门厅（`north-room/里屋`）3 视口 × 1 格       ② ④ 守林人面 ⇒ **○ 未判**（对象随 `books#26` ✓）
//       ③ A 战斗首屏 ⇒ **○ 未判**（对象形随阶 3 重定 ✓）  ④ ⑤ 无横向溢出（每视口 1 格）＋ 键盘 4 格（对象待定 ✓）
//   ★现值＝**实测**（见本笔读数：真跑 35 格）⇒ ★下界取实测值：✗ 不可再低（防删断言），★再加格时**必须**同步上调 ✓
//   ★（story 档当前**默认关**（CI 不开）⇒ 该下界只在**显式开**时有牙 ✓；开闸前必须把它调到"真跑值" ✓）
export const MIN_ASSERTIONS_STORY = 35;
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
export const evaluateRun = ({ total, fails, minAssertions = (runsStory ? MIN_ASSERTIONS : MIN_ASSERTIONS_ENGINE) }) => {
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
	// ★ `#1498`：**接线格**（判据两格之上再加一格）——★"判定函数对"**≠**"零故事早退走它" ✗
	//   故这里直接扫**本件源码**：零故事分支必须**经 `bail(`**，✗ 不许自带 `process.exit(0)` ✓
	//   （★这是"被测对象＝本文件"的**结构断言** —— 它可假：改回旧写法 ⇒ 当场红 ✓）
	{
		const self = readFileSync(new URL(import.meta.url), 'utf8');
		// 取"零故事分支"那一段（`if (!DEFAULT_SLUG)` 起 到 行尾 ;）
		// ★取**真代码行**（✗ 不能取注释里的同形文字 —— 本笔实测撞过：注释里也写了它，match 取到注释 ✗）
		const code = self.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
				// ★ `#1532`：★本分支现在**带两个条件**（`!DEFAULT_SLUG && runsStory`）——
		//   ★判据仍然只问两件：★**走 `bail(`** ＋ ★**✗ 自带 `process.exit`** ✓（★不管条件几个 ✗）
		const m = code.match(/^\s*if \(!DEFAULT_SLUG\b[^\n]*/m);
		const line = m ? m[0] : '';
		t('★ `#1498` 接线：零故事分支**经 `bail(`**（✗ 不自带 process.exit）', /bail\(/.test(line) && !/process\.exit/.test(line), line.slice(0, 90));
		// ★且 `bail` 必须**定义在**零故事分支之前（✗ 前向引用会 TypeError ⇒ 静默降级）
		const iBail = self.indexOf('const bail = (reason) =>');
		const iZero = self.indexOf('if (!DEFAULT_SLUG)');
		t('★ `#1498` 顺序：`bail` 定义**在零故事分支之前**（✗ 前向引用）', iBail >= 0 && iZero >= 0 && iBail < iZero);
	}
	// 用 `MIN_ASSERTIONS` 现算（不写死数字）：下界一涨，这几例自动跟着走（否则每加断言都要改自证）
	t(`${MIN_ASSERTIONS}/${MIN_ASSERTIONS} 达下界 → 通过`, evaluateRun({ total: MIN_ASSERTIONS, fails: 0 }).code === 0);
	t(`${MIN_ASSERTIONS}/${MIN_ASSERTIONS}（有失败）→ 失败`, evaluateRun({ total: MIN_ASSERTIONS, fails: 1 }).code === 1);
	t(`${MIN_ASSERTIONS - 5}/${MIN_ASSERTIONS - 5} 低于下界 → 失败（断言被删也算红，不靠 workflow 魔数）`, evaluateRun({ total: MIN_ASSERTIONS - 5, fails: 0, minAssertions: MIN_ASSERTIONS }).code === 1);
	t('0/0 → 失败（0/0 假绿）', evaluateRun({ total: 0, fails: 0 }).code === 1);
	// ★ `#1532`：★**未判也必退 1**（★与“跳过”分开：跳过允许本地退 0，未判不允许 ✓）
	t('未判（环境缺）⇒ **必退 1**（✗ 静默绿）', unjudgedVerdict().code === 1);
	// ★ `#1532`：★**两层各自的下界**（★★★★★★★★★★★★★★★★★★）——
	//   ★判法：★两层**各自贴自己的下界**；★**且引擎层下界不能拿故事层的数去逗** ✗
	//   ★为什么：★共用一个数 ⇒ ★两层必有一层**永远红**（★不是真红）；
	//     而★为了跑绿把它改小 ⇒ ★**删乙类也会放行** ✗
	// ★★ `#1532`（坐标裁）：★**乙类段名可注入** —— ★判法：★默认值＝**旧值**（★✗ 改旧行为）；
	//   ★且★映射表**真的在管**：★各作用名的 `passage` 非空（★若某处改成硬编字面量 ⇒ 本格仍绿，
	//     ★故★另有★**行为面**守它：`SG_BROWSER_STORY_MAP` 非法 ⇒ 必退 1（★实测✓））
	// ★★ `#1532` CR（代码审查：**注入生效无近格**）：★现在抽成无副作用模块 ⇒ ★**进程内直接量** ✓
	//   ★三格：① 注入**真生效**（★且段名与默认不同 ⇒ ★✗ 可能是“碰巧相同”）
	//     ② 注入**逐作用名合并**（★只给一个 ⇒ ★其余落回默认 ✓）
	//     ③ ★**非法 JSON ⇒ 出错信息且不崩**（★这是“无副作用”的可量形 ✓）
	t('★乙类注入：**真生效**（★段名 `X` ⇒ 读到 `X`）',
		resolveStoryMap({ env: { SG_BROWSER_STORY_MAP: '{"witchHut":{"passage":"X"}}' } }).map.witchHut.passage === 'X');
	t('★乙类注入：**逐作用名合并**（★未给的落回默认）',
		resolveStoryMap({ env: { SG_BROWSER_STORY_MAP: '{"witchHut":{"passage":"X"}}' } }).map.multi.passage === '岔路');
	t('★乙类注入：★**非法 JSON ⇒ 出错信息**（★✗ 崩、✗ 静默）',
		(() => { const r = resolveStoryMap({ env: { SG_BROWSER_STORY_MAP: '{oops' } });
			return r.error !== null && r.map.witchHut.passage === '房间'; })());
	// ★ `#1592` M7：**重指后**的值（旧值 `女巫小屋`／`洞穴·战斗`／`里屋`／`守林人`／`岔路` 见 git 历史 ✓）
	//   ★且 A／B／C 三键**必须带 `story`**（✗ 否则 story 档退化回「全部格跑同一个故事页」✗）
	t('★乙类段名可注入：★重指后的默认值（★✗ 改旧行为 —— ★A/B/C 各带 story ✓）',
		STORY_MAP.witchHut.story === 'fruit-demo' && STORY_MAP.witchHut.passage === '房间'
		&& STORY_MAP.hall.story === 'north-room' && STORY_MAP.hall.passage === '里屋'
		&& STORY_MAP.keeper.story === 'mist-forest' && STORY_MAP.keeper.passage === '守林人'
		&& STORY_MAP.multi.passage === '岔路');
	// ★ `#1592` M7／A：★门闸常量在场且为 false（★"未判"要**可判**：真值一旦被写成 true 而对象未定 ⇒ 会挂 ✗）
	t('★A 门闸：`A_FIGHT_FACE_READY === false`（★unblock 挂 `#1542` 阶 3 ✓）', A_FIGHT_FACE_READY === false);
	// ★ `#1532` CR（T：本格**恒真** —— ★拿表里字面量比**同一个**字面量）。
	//   ★改**行为面**：★把 `expect` 当正则去 `test` **夹具真串**（★假如值写错（如字序颠倒）⇒ 本格当场红 ✓）。
	//   ★且★用**真实对象**（夹具 `north-room` 的检定名）—— ★✗ 再造一个字面量比自己 ✓
	//   ★实测依据：★我原写的 `觉察`（**字序颠倒**）⇒ ★真值是 `察觉`（`north-room` 的 `chk:里屋·察觉.success`）✓
	// ★★ `#1536` CR（T 的**跨边界格**建议）：★**“值对了” ≠ “值送到了”**。
	//   ★静态扫：`ev(\`…\`)` 的**模板串里** ✗ 得出现 **node 侧的自由标识符**
	//   （★如 `STORY_MAP`）—— ★它们在**页面侧不存在** ⇒ 抛 ⇒ ★格**恒红**（★而不是“发现了一个缺陷”）✗。
	//   ★正解：★**node 侧先插值**（`${JSON.stringify(…)}`）⇒ ★模板串里只剩**数据字面量** ✓
	t('★跨边界：`ev(\`…\`)` 模板串里 **✗ 出现 node 侧自由标识符**（★如 `STORY_MAP`）',
		(() => {
			const self = readFileSync(new URL(import.meta.url), 'utf8');
			// ★取**所有** `ev(\`…\`)` 模板串（★非横跨：括号配平）
			// ★取**所有** `ev(`…`)` 的模板串（★两侧 ``` 之间；★跳过 `\\` 转义 ✓）
			const spans = [];
			for (let i = self.indexOf('ev(`'); i >= 0; i = self.indexOf('ev(`', i + 1)) {
				const open = self.indexOf('`', i);
				let j = open + 1;
				while (j < self.length) {
					if (self[j] === '\\') { j += 2; continue; }   // ★转义对：跳**两**个
					if (self[j] === '`') break;
					j++;
				}
				spans.push(self.slice(open + 1, j));
			}
			// ★只查**未插值的空间**：模板串里出现 `STORY_MAP`（★未被 `${}` 包）⇒ 红
			const bad = spans.filter((t) => /STORY_MAP/.test(t.replace(/\$\{[^}]*\}/g, '')));
			return bad.length === 0; })());
	t('★乙类：`hall.expect` 能**匹中检定名形的真串**（★行为面 —— ✗ 字面量比字面量）',
		new RegExp(String(STORY_MAP.hall.expect)).test('察觉检定（感知）〔里屋·察觉〕 DC11') === true);
	t('★两层下界**各自独立**（★引擎层：达下界绿／低一条红）',
		evaluateRun({ total: MIN_ASSERTIONS_ENGINE, fails: 0, minAssertions: MIN_ASSERTIONS_ENGINE }).code === 0
		&& evaluateRun({ total: MIN_ASSERTIONS_ENGINE - 1, fails: 0, minAssertions: MIN_ASSERTIONS_ENGINE }).code === 1);
	t('★故事层下界**独立**（引擎层的数**不能**逗它）',
		evaluateRun({ total: MIN_ASSERTIONS_ENGINE, fails: 0, minAssertions: MIN_ASSERTIONS_STORY }).code === 1);
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过：CI 跳过必红 / 本地可跳 / 达下界绿 / 有失败红 / 断言被删红 / 0-0 假绿红');
};
if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

// ★ `#1498`：零故事早退（**归并进 `bail()` 单一出口**）—— ★必须放在 `--selftest` **之后**：
//   否则零故事态下 `--selftest` **自己**会被早退吃掉（✗ 连自证都跑不了 —— 本笔实测撞过 ✓）
// ★ `#1532`：零故事只挡**乙类** —— 甲类（字体／版式／自证）不依赖故事 ⇒ 不该 bail
if (!DEFAULT_SLUG && runsStory) bail('零故事模式（仓内无逐故事产物；★仅 `BROWSER_TIERS=engine` 可跑甲+丙类）');

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
if (runsStory && !existsSync(defaultStoryHtml())) bail(`${defaultStoryHtml()} 不存在，先 npm run build`);
if (!runsStory && !existsSync(shelfHtml())) bail(`${shelfHtml()} 不存在，先 npm run build`);

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
	//   ★我第一版写成 `!runsStory || !DEFAULT_SLUG` ⇒ ★**丙类传了 `SB` 也被拉到书架页** ✗
	//     （★实测：侧栏无血量条、链接数 0 —— ★因为根本没进故事页 ✗）
	//   ★正解：★`goShelf = story == null && (!runsStory || !DEFAULT_SLUG)`（★**给了故事就去故事页** ✓）
	const goShelf = story == null && (!runsStory || !DEFAULT_SLUG);
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

// 键盘用例（#284①）：一条正例序列 ＋ 一条反例自测（证明「折叠区不入序」的检查有牙）
async function keyboardCase(W, H) {
	await setViewport(W, H);
	await loadFresh();
	await ev(HELPERS);
	// `#1004` B2b 按裁定 A 重指: 键盘序列测的是「行动区可 Tab 抵达」这一**机制**（与故事内容无关），
	// 旧写法从 `门厅` 进（那段的行动区是旧故事专用的块名，已随 `#1227` 类四删除）。★ `#1532`：本处旧口径已过期——
	// 2026-09-19 复测后改定 `女巫小屋`（`70f4045` 撤回 `门厅·看钉` 那行夹具后重选）：
	// 夹具里行动区内的宏链接**全是自环/只出面板**（读数：`酒馆` 话题链接点击后 `passage` 不变且无反馈；
	// `女巫小屋`「从炉火边拿起那件东西」/ `书房`「把案上那本日记收起来」→ **反馈由无到有**）；
	// `女巫小屋` 行动区最大（16 条）→ Tab 面与取件面都最稳。
	await loadFresh(STORY_MAP.witchHut.story);   // ★M7：键盘格在自己的故事上跑（✗ 不再靠当前页 ✗）
	await enter(STORY_MAP.witchHut.passage, `const pc=SugarCube.State.variables.pc; pc.inv=pc.inv||{}; pc.ev=pc.ev||{};`);
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
	// ① 落在引擎包过的行动区里（`closest('.acts')`）；② **可聚焦且未禁用**（★`#1532`：★旧写法绑 `macro-link` 类名 —— 它在仓内 **0 命中** ✗）。
	// 实测依据：原写法 `querySelectorAll('.acts a, #passages a.link-internal')` 返的是**文档序并集**，
	// `酒馆` 里 `pool[0]` 是裸 `[[森林边缘]]`（不在行动区）；而**只加** `closest` 谓词仍不够 ——
	// ★ `#1532`：★故换成**行为性质**的谓词（★✗ 绑类名 —— ★books 真故事走 `link-internal` ✓）。
	const FB_PROBE = `(function(){
		const slot = document.querySelector('#passages .action-feedback, #passages .scene-feedback, #passages .check-result');
		const echo = [...document.querySelectorAll('#passages *')].find(e => e.children.length === 0 &&
			(e.textContent.includes('DC') || e.textContent.includes('d20(')));
		return { hasFb: !!(slot || echo), cls: slot ? slot.className : (echo ? 'echo' : '-'),
			focusInside: !!document.activeElement?.closest('#passages'),
			focusCls: String(document.activeElement?.className || ''), passage: SugarCube.State.passage };
	})()`;
	// ★ `#1532`（T 的终定披露）：旧写法用 `.macro-link`（`<<link>>` 宏的类名）
	//   ⇒ ★**books 的真故事走 `link-internal`**（散文 `[[…]]`）；★仓内 `.macro-link` **0 命中**
	//     ⇒ ★该探针**恒空**（★做不到「能焦点的行动链接」这件事 ✗）
	//   ★正解：★**✗ 绑类名** —— 改成「**行为性质**」三条：① 在 `.acts` 里、② 可聚焦、③ 未禁用 ✓
	const focusedAction = await ev(`(function(){
		const a = [...document.querySelectorAll('.acts a')]
			.find(x => x.closest('.acts') && typeof x.focus === 'function' && !x.hasAttribute('disabled'));
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
		//★ `#1532`（`#1505` 后）：`<<sitecheck>>` **已改为段级 `check` 字段的编译期注入**（✗ 不再是段落里手写宏）——，
		// 只判 `after.hasFb` 会在**未按键时**即为真 → 无判别力（本片实测过的假绿，勿回退）。
		const activated = after.passage !== before.passage || (!before.hasFb && after.hasFb);
		check(activated,
			`${vp} 键盘：Enter ⇒ 交互真被激活（passage ${before.passage}→${after.passage} · 反馈 ${before.hasFb}→${after.hasFb}${after.hasFb ? `〔${after.cls}〕` : ''}）`);
		// ── 半 (ii)：焦点回收正文 —— `#1012` 修好后**转正**（用**导航型**样本）───────────
		//注意：这半**此前从未守护**：旧写法 `rawKeyDown` 从不触发默认动作 → 交互根本没发生，
		// `activeElement` 自然还停在原链接上 → 旧绿是**虚的**（借「按键前就为真的结果在屏」站的）。
		//★ `#1532`：注意必须用**导航型**样本：`女巫小屋` 那类**非导航型**（就地反馈）按键前后焦点都在 `#passages` 内
		// → `focusInside` 两向皆真 → **无判别力**（写成 `check(after.focusInside)` 就是又一个假绿）。
		// 判据照 `docs/criterion-design.md` §八 8.5：契约＝「**焦点仍在 `#passages` 内**」 —— **不绑元素**
		//（落 `.passage`／`.acts`／反馈槽 都算过 —— 那一层是**实现路径**）。
		//注意：两向读数（2026-09-19 实测）：引擎侧那一手**禁用** → `focusInside=false`（落 `body`
		// ＝本格真会红）；**启用** → `DIV.passage` → 本格**有判别力**。
		const navTarget = await ev(`(function(){
			window.__sg.play('酒馆');
			const cur = '酒馆';
			const a = [...document.querySelectorAll('#passages .acts a.link-internal')]
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
	// ★`#1592` M7：本循环各块**各自 `loadFresh(<自己的故事>)`**（✗ 从前无参 ⇒ 全格跑同一个故事 ✗）
	await loadFresh(STORY_MAP.hall.story);
	const vp = label(W, H);
	console.log(`\n── 视口 ${vp}`);

	// ⑤ 无横向溢出（开场）
	const ov = await ev('window.__sg.overflow()');
	check(ov.scroll <= ov.inner + 1, `${vp} 开场无横向溢出（${ov.scroll} ≤ ${ov.inner}）`);

	// ① 战斗首屏：行动入口在视口内 + 首屏空白
	await ev(HELPERS);
	// `#1004` B2b 复核席按**裁定 A** 重指（面级 → 重指到有该面的样本）：旧名 `雾之魔物·战` 是**已删故事**的战斗段
	// → 换到面夹具的战斗段 `洞穴·战斗`（`<<fightbegin "雾影">>` ＋ `<<fightpanel "…" false>>`，战斗面满配）。
	// ★★ `#1592` M7／A（裁＝**乙**）：**○ 未判 ＋ 出声** —— ★理由两条（协调席 ✓）：
	//   ① 甲案＝复活已溶解的面（`<<fightbegin>>`/`<<fightpanel>>` 宏式战斗正是 `#1506` 溶解的对象 ⇒ 为其造夹具＝开倒车 ✗）
	//   ② 战斗阶梯正在重做战斗面（**阶 3**〔结果渲染＋命中判定〕落地 ⇒ 新首屏形定形）⇒ 现在造任何 A 夹具都会被阶 3 作废 ✗
	//   ★unblock 条件：**阶 3 落地后重定对象**（挂 `#1542` 链 ✓）—— ★格**保留在此**（✗ 未删断言 ✓），门闸一开即复跑 ✓
	if (runsStory && !A_FIGHT_FACE_READY) {
		console.log('  ○ 未判：战斗首屏面（3 视口 × 3 格）—— ★对象形未定（宏式战斗面板已随 `#1506` 溶解 ⇒ 阶 3 重定 ✓，挂 `#1542`）');
	}
	if (runsStory && A_FIGHT_FACE_READY) {
		await enter(STORY_MAP.caveFight.passage, `const pc=SugarCube.State.variables.pc; pc.inv=pc.inv||{}; pc.ev=pc.ev||{}; delete pc.ev.fight; pc.hp=pc.max_hp;`);
		{
			const acts = await ev('window.__sg.rect(".acts a")');
			const diag = await ev('JSON.stringify({p:SugarCube.State.passage,a:document.querySelectorAll(".acts a").length,hp:SugarCube.State.variables.pc.hp,f:!!SugarCube.State.variables.pc.ev.fight})');
			check(!!acts && acts.top < H, `${vp} 战斗首屏：第一项行动在视口内（top=${Math.round(acts?.top ?? -1)} < ${H}）取景=${diag}`);
			const firstBlock = await ev('window.__sg.rect("#passages .passage > *")');
			check(!!firstBlock && firstBlock.top < 260, `${vp} 战斗首屏：无近整屏空白（首块 top=${Math.round(firstBlock?.top ?? -1)}）`);
			await shoot(`${vp}-combat-first`);
		}

		// ② 战斗回合：点一手 → 检定/你/它/下一轮 相邻成块
		{
			const first = await ev('(function(){const a=document.querySelector(".acts a"); if(!a) return null; return a.textContent.trim();})()');
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

	}

	if (runsStory) {
		// ③ 门厅：观察结果留屏且可见
		await ev(HELPERS);
		await loadFresh(STORY_MAP.hall.story);   // ★M7／B：本块在**自己的故事**上跑（✗ 不再靠「当前页碰巧是它」✗）
		await enter(STORY_MAP.hall.passage, `const pc=SugarCube.State.variables.pc; pc.inv=pc.inv||{}; pc.ev=pc.ev||{}; delete pc.inv['坏哨']; delete pc.world.whistle_taken;   // #1004 B2b: 夹具的场地旗标是 world.whistle_taken（旧写的 ev.hall_seen 是旧故事的）`);
		{
			// `#1004` B2b：入口按夹具改准（夹具 `门厅` 的观察入口叫 `看钉`；`先看清钉子是怎么卡的` 是旧故事的文案）
			// ★ `#1532`：★**入口名由数据给**（★没给 ⇒ ✗ 点：★结果由**渲染期注入**产生）✓
			if (STORY_MAP.hall.entry) {
				const clk = await ev(`window.__sg.click("${STORY_MAP.hall.entry}")`);
				await sleep(900);
				if (!clk?.ok) console.log(`   （入口点击未命中：${JSON.stringify(clk)} passage=${await ev('SugarCube.State.passage')}）`);
			} else {
				await sleep(600);   // ★render-time 注入也要一拍（`Engine.DOM_DELAY`）
			}
			// ★ CR（T：**跨进程边界漏插值**）：下方 `ev` 的**模板串里**若直接引 `STORY_MAP`
			//   ⇒ ★它在**页面侧**执行、**而 `STORY_MAP` 是 node 侧绑定** ⇒ ★页面侧不存在 ⇒ 抛 ⇒ 本句返 `null` ⇒ 格恒红 ✗
			//   ★正解：**node 侧先插值**（`${JSON.stringify(…)}` —— 照 `:626`／`:706` 同形 ✓）。
			//   ★★口径：**“值对了” ≠ “值送到了”** —— 判据跨边界 ⇒ **必须在那一侧验一次** ✓
			const res = await ev(`(function(){
				// #1004 B2b: 读数对准夹具的等价可观察面 —— 夹具 门厅·看钉 把结果写在**正文段落**里
				//（旧故事放在专用容器里，该容器名已随 #1227 类四删除）。判据语义不变：**结果在屏且在视口内**。
				const p=document.querySelector('#passages .passage'); if(!p) return null;
				// 实况读数: 夹具这条走"点击时检定" -> 结果落在结果槽里（形如 察觉检定（感知）〔门厅·看钉〕 DC11）。
				// （我上一版改成找正文文案「钉子旁边那圈灰」是找错了对象 —— 那句是段落正文，不是结果）。
				const hit=[...document.querySelectorAll('#passages .check-result, #passages .scene-feedback')]
					.find(e=>new RegExp(String(${JSON.stringify(STORY_MAP.hall.expect ?? '检定')})).test(e.textContent));
				if(!hit) return null; const r=hit.getBoundingClientRect(); return { top:r.top, bottom:r.bottom, text:hit.textContent.slice(0,40) };
			})()`);
			if (!res) console.log(`   （门厅结果未找到：结果槽=${String(await ev(`document.querySelector('#passages .scene-feedback, #passages .check-result')?.textContent?.replace(/\s+/g,' ').slice(0,80) ?? 'NO'`))}）`);
			check(!!res && res.top < H, `${vp} 门厅：观察结果留屏且在视口内（top=${Math.round(res?.top ?? -1)}）`);
			await shoot(`${vp}-hall-result`);
		}

	}

	// ★★ `#1592` M7／C（裁）：**对象未就绪 ⇒ ○ 未判 ＋ 出声**（✗ 判红、✗ 删断言）
	//   ★对象＝`mist-forest` 第二章「守林人」（`books#26` 未落 ⇒ 章落地即**自动接上** ✓）
	if (runsStory && !existsSync(storyHtml(STORY_MAP.keeper.story))) {
		console.log('  ○ 未判：守林人面 —— 语料里没有 ' + STORY_MAP.keeper.story + ' 的「' + STORY_MAP.keeper.passage + '」段（`books#26` 第二章未落 ✓）');
	} else if (runsStory) {
		// ④ 守林人：子对话返回＝短入口＋行动区可见（不重放介绍）
		await ev(HELPERS);
		await enter(STORY_MAP.keeper.passage, `const pc=SugarCube.State.variables.pc; pc.inv=pc.inv||{}; pc.ev=pc.ev||{}; pc.keeper=pc.keeper||{}; pc.keeper.met=true;`);
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
			check(bar.bar, `${vp} 故事2 侧栏给出**血量条**（无车卡的最小面 · 判"有**可见**的百分比量条"——几何 > 0，✗ 只看属性）`);
			check(bar.list, `${vp} 故事2 侧栏给出**物品栏**（判"有**可见**的列表项"）`);
			// ③ 三选一：真机布局下至少两条路落在视口内（可点性/首屏不空）
			await ev(`window.__sg.play("${STORY_MAP.multi.passage}")`);   // `#1004` B2b：`minimal-demo` 的多选一段叫 `岔路`（旧写法 `岔口` 是旧故事的）
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

	}

// #284①：键盘序列（真机按键）——单视口做即可，走 390×844
// ★ `#1532`：★本块属**乙类**（它 `enter('女巫小屋')`）⇒ ★加 `runsStory` 闸 ✓
if (runsStory) {
	console.log('\n── 键盘序列（#284①，真机 Tab/Enter）');
	await keyboardCase(390, 844);
}

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
