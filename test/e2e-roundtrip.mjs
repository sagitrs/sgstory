// `#1645`（PR 档减压二 · 第一片）：**端到端合并轮**（粗网）—— 一次 build ＋ 一次 jsdom，跑 N 段**按能力命名**的断言
//
// 为什么要它（✗ 不是为了"少写测试"）：
//   · 本仓 e2e 一族**各自 build 一次**（`mutates:['build']` ⇒ 互不并行）⇒ `test` job 里它们是**串行关键路径**
//   · 而它们的机制其实同形：**临时副本 → 编译 → build → jsdom 点击 → 断言**（`adds`／`takes` 共用 `m3-adds-fixture`）
//   ⇒ ★本件把"**多次 build**"折成"**一次 build ＋ 多段断言**" ✓
//
// ★覆盖（第一片，✗ 请按此读它）：`adds`（声明式算术）＋ `takes`（库存移除）＋ `pc.` 前缀拒绝（写侧收束）
//   ★**细网仍在**：对应的 3 段原件已移 `full` 档（夜间跑）⇒ ★**红时归因**由它们承担（✗ 本件只给"哪一类坏了"）✓
// ★格名纪律：**每格都带能力名**（如 `[adds]①`）⇒ 失败时**直接知道去哪看** ✓
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const WORK = mkdtempSync(join(tmpdir(), 'sg-roundtrip-'));
const stories = join(WORK, 'stories');
const AD = join(stories, 'ad');
cpSync(join(ROOT, 'test/fixtures/m3-adds-fixture/stories'), stories, { recursive: true });

// ── 夹具：把两面并进**同一份**声明（`adds` 两条 ＋ `takes` 两条；后两条原样保留）────────────
const pp = join(AD, 'data/passages.json');
const data = JSON.parse(readFileSync(pp, 'utf8'));
const orig = Object.fromEntries(data['房间'].links.map((l) => [l.label, l]));
data['房间'].links = [
	{ label: '咬一口', to: '咬一口', adds: { 心情: 5 } },
	{ label: '再咬一口', to: '咬一口', adds: { 心情: 5 } },
	{ label: '拿苹果', to: '咬一口', gives: ['苹果'] },
	{ label: '吃掉苹果', to: '咬一口', takes: ['苹果'] },
	{ label: '空手用掉', to: '咬一口', takes: ['不存在的东西'] },
	orig['放下'], orig['值够了就去看看'],
];
writeFileSync(pp, JSON.stringify(data, null, '\t') + '\n');

// ★清生成物（✗ 不清会拿到陈旧 twee ⇒ 读数落在旧形态 ✗）
for (const f of ['15-tables.twee', '17-rules.twee', '00-meta.twee']) {
	const q = join(AD, f); if (existsSync(q)) rmSync(q);
}
execFileSync(process.execPath, [join(ROOT, 'editor/compile-story.mjs'), 'ad', `--out=${AD}/`], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' });
execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' });
process.env.SG_STORIES_DIR = stories;

const { boot } = await import('./boot.mjs');
const B = await boot({ story: 'ad', random: 0.5 });
const w = B.w, S = w.SugarCube.State, R = w.Sg.rules, N = w.Sg.notes;
const pc = S.variables.pc;
const links = () => [...w.document.querySelectorAll('#passages a.link-internal')];
const clk = async (l) => {
	const a = links().find((x) => x.textContent.trim() === l);
	if (!a) return false;
	a.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, view: w }));
	await B.settle(); await new Promise((r) => setTimeout(r, 120)); await B.settle(); return true;
};
let bad = 0;
// ★ 《#1654》NIT（developer-9）：★结尾那行原来**硬编“adds 5 格”** ⇒ 实测 7 格 ⇒ ★**硬编必漂**
//   ⇒ 改成**按前缀计数**（★从格名里取 `[adds]`／`[takes]`／`[pc-prefix]` ⇒ 加几格就报几格，★不用改这行 ✓）
const CELLS = {};
const t = (l, ok, d = '') => {
	const m = /^\[([a-z-]+)\]/.exec(l);
	if (m) CELLS[m[1]] = (CELLS[m[1]] ?? 0) + 1;
	if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); }
};
const throws = (fn) => { try { fn(); return ''; } catch (e) { return String(e && e.message || e); } };

// ── 块 A · `adds`（声明式算术：点击那一刻 · 缺省零值 · 累加）──────────────────────────
{
	const mood = () => S.variables.pc?.ev?.心情;
	t('[adds]① 起点：`心情` **不存在**（✗ 不是 0 —— 缺省零值只在**加**的时候生效 ✓）', mood() === undefined, String(mood()));
	t('[adds]② **带 `adds` 的链接恰 2 条**（效果编进链接 ⇒ 点击时施加 ✗ 非渲染期 ✓）',
		links().filter((a) => /adds/.test(a.getAttribute('data-sg-effects') ?? '')).length === 2,
		links().map((a) => a.getAttribute('data-sg-effects') ?? '-').join('|'));
	t('[adds]③ ★**未点之前**仍是 `undefined`（✗ 不是渲染期就加 ✓）', mood() === undefined, String(mood()));
	await clk('咬一口');
	t('[adds]④ ★**点击那一刻**：`undefined` ⇒ **`5`**（缺省零值 ＋ 增量 ✓）', mood() === 5, String(mood()));
	await clk('回房间'); await clk('咬一口');
	t('[adds]⑤ ★**再点一次 ⇒ `10`**（**累加**，✗ 不是覆盖 ✓）', mood() === 10, String(mood()));
	const e1 = throws(() => R.applyAdds({ adds: { 心情: 'X' } }, S.variables.pc));
	t('[adds]⑥ ★值非有限数 ⇒ **fail-loud 点名**', /有限数/.test(e1), e1.slice(0, 90));
	S.variables.pc.ev.怪 = { 不是数: true };
	const e2 = throws(() => R.applyAdds({ adds: { 怪: 1 } }, S.variables.pc));
	t('[adds]⑦ ★目标键已有**非数值** ⇒ 点名（✗ 不静默当 0 再加 ✓）', /非数值/.test(e2), e2.slice(0, 90));
	delete S.variables.pc.ev.怪;
}

// ── 块 B · `takes`（库存移除：与 `gives` 对称 · 键不存在而非 `false` · 幂等）──────────────
{
	await clk('回房间');   // ★块 A 结束时停在「咬一口」段 ⇒ 先回「房间」才看得到 takes 链接（✗ 否则计数看到 0）
	const inv = () => S.variables.pc?.inv ?? {};
	t('[takes]① 起点：`inv` 空', Object.keys(inv()).length === 0, JSON.stringify(inv()));
	t('[takes]② ★带 `takes` 的链接**恰 2 条**（效果编进链接 ⇒ 点击时施加 ✗ 非渲染期 ✓）',
		links().filter((a) => /takes/.test(a.getAttribute('data-sg-effects') ?? '')).length === 2,
		links().map((a) => a.getAttribute('data-sg-effects') ?? '-').join('|'));
	await clk('拿苹果');
	t('[takes]③ 先 `gives` 拿到苹果 ⇒ `inv.苹果 === true`', inv()['苹果'] === true, JSON.stringify(inv()));
	await clk('回房间'); await clk('吃掉苹果');
	t('[takes]④ ★`takes` ⇒ 苹果**从库存移除**（键**不存在** ⇒ ✗ 不是置 `false` ✓）',
		inv()['苹果'] === undefined && !('苹果' in inv()), JSON.stringify(inv()));
	await clk('回房间'); await clk('空手用掉');
	t('[takes]⑤ ★**幂等**：移除不存在的 ⇒ **不报错、`inv` 不变**', Object.keys(inv()).length === 0, JSON.stringify(inv()));
}

// ── 块 C · `pc.` 前缀拒绝（写侧一处收束 · 三处各抛 · 不误伤）──────────────────────────
{
	const e1 = throws(() => R.applySets({ sets: ['pc.心情'] }, pc));
	t('[pc-prefix]① `sets` 带 `pc.` 前缀 ⇒ **抛错点名**', /pc\./.test(e1) && /前缀/.test(e1), e1.slice(0, 80));
	const e2 = throws(() => R.applyAdds({ adds: { 'pc.心情': 1 } }, pc));
	t('[pc-prefix]② `adds` 带 `pc.` 前缀 ⇒ **抛错点名**', /pc\./.test(e2) && /前缀/.test(e2), e2.slice(0, 80));
	const e3 = throws(() => R.applyYields({ yields: [{ id: 'x', path: 'pc.心情' }] }, pc));
	t('[pc-prefix]③ `yields.y.path` 带 `pc.` 前缀 ⇒ **抛错点名**', /pc\./.test(e3) && /前缀/.test(e3), e3.slice(0, 80));
	t('[pc-prefix]④ ★报文点出"会静默落到 `pc.pc.…`"（✗ 不只说"非法" ✓）', /pc\.pc\./.test(e1), e1.slice(0, 110));
	t('[pc-prefix]⑤ ★裸键**在 `writePath` 层**不加 `ev.`（✗ 那是 `applySets` 的活）',
		(() => { N.writePath(pc, '裸键T3', 7); return pc.裸键T3 === 7 && pc.ev?.裸键T3 === undefined; })());
	t('[pc-prefix]⑤b 而 `applySets` 的**裸键**仍默认 `ev.`（作者面口径不变 ✓）',
		(() => { R.applySets({ sets: ['心情A'] }, pc); return pc.ev.心情A === true; })());
	t('[pc-prefix]⑥ `ev.` ／ `world.` 仍过',
		(() => { N.writePath(pc, 'world.心情', 3); return pc.world.心情 === 3; })());
	t('[pc-prefix]⑦ ★`gives` 的**库存键名**不拦（`pc.inv["pc.心情"]` 合理 ✓）',
		(() => { R.applyGrants({ gives: ['pc.心情'] }, pc); return pc.inv['pc.心情'] === true; })());
}

if (B.uncaught?.length) { bad++; console.error('  ✗ 页面有未捕获异常：' + B.uncaught.slice(0, 2).join(' ｜ ')); }
try { await B.close?.(); } catch { /* 忽略 */ }
rmSync(WORK, { recursive: true, force: true });
if (bad) { console.error(`\n✗ 端到端合并轮失败 ${bad} 项（★看格名 ⇒ [adds]／[takes]／[pc-prefix] 定位能力）`); process.exit(1); }
console.log('\n✔ 端到端合并轮通过（一次 build ＋ 一次 jsdom：'
	+ Object.entries(CELLS).map(([k, n]) => `\`${k}\` ${n} 格`).join(' ＋ ') + '）');
