// `#1466` 自证：**声明式算术效果**（`adds: { <键路径>: <数> }`）—— 引擎侧 · fixture 驱动
//
// 诉求（作者实测）：效果面此前只会"**置真**"（`gives` 库存布尔／`sets` 恒 `true`／`yields` 笔记）
//   ⇒ ★**"±数值"状态（如心情值）作者面写不出来** ✗（"读"与"存在"都够，"变"没有）
// 形态（`#1466` 定稿）：`adds: { 心情: 5 }` ⇒ ★与 `sets` **同规**（键路径 `ev.` 可省／`world.x` 可写）
//   ｜**同刻**（点击那一刻，照 `#1408` 的 `data-sg-effects` 路 ✗ 不进规则行）
//   ｜**缺省零值**（键不存在按 0 起算 ✗ 不产 NaN）｜**有限数校验**（fail-loud 点名）
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const WORK = mkdtempSync(join(tmpdir(), 'sg-adds-'));
const stories = join(WORK, 'stories');
cpSync(join(ROOT, 'test/fixtures/m3-adds-fixture/stories'), stories, { recursive: true });
// ★清生成物（✗ 不清会拿到陈旧 `17-rules.twee`／`00-meta.twee` ⇒ 读数落在旧形态 ✗ 我实测踩过）
for (const f of ['15-tables.twee', '17-rules.twee', '00-meta.twee']) {
	const q = join(stories, 'ad', f); if (existsSync(q)) rmSync(q);
}
execFileSync(process.execPath, [join(ROOT, 'editor/compile-story.mjs'), 'ad', `--out=${join(stories, 'ad')}/`], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' });
execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' });
process.env.SG_STORIES_DIR = stories;
const { boot } = await import('./boot.mjs');
const B = await boot({ story: 'ad', random: 0.5 });
const w = B.w, S = w.SugarCube.State;
const mood = () => S.variables.pc?.ev?.心情;
const links = () => [...w.document.querySelectorAll('#passages a.link-internal')];
const clk = async (l) => {
	const a = links().find((x) => x.textContent.trim() === l);
	if (!a) return false;
	a.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, view: w }));
	await B.settle(); await new Promise((r) => setTimeout(r, 120)); await B.settle(); return true;
};
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };

t('① 起点：`心情` **不存在**（✗ 不是 0 —— 缺省零值只在**加**的时候生效 ✓）', mood() === undefined, String(mood()));
t('② 起点：**带 `adds` 的链接恰 2 条**（＝那两条"咬一口"的 ⇒ 效果编进链接 ✓）',
	links().filter((a) => /adds/.test(a.getAttribute('data-sg-effects') ?? '')).length === 2,
	links().map((a) => a.getAttribute('data-sg-effects') ?? '-').join('|'));
t('③ ★**未点之前**`心情` 仍是 `undefined`（✗ 不是渲染期就加 ✓）', mood() === undefined, String(mood()));
await clk('咬一口');
t('④ ★**点击那一刻**：`undefined` ⇒ **`5`**（缺省零值 ＋ 增量 ✓）', mood() === 5, String(mood()));
await clk('回房间');
await clk('咬一口');
t('⑤ ★**再点一次 ⇒ `10`**（**累加**，✗ 不是覆盖 ✓）', mood() === 10, String(mood()));

// ★ 两格**防御态**（直调施加器 ⇒ ✗ 不靠造故事）：值非有限数 ⇒ 点名；目标已有非数值 ⇒ 点名
{
	const R = w.Sg.rules;   // ★施加器挂 `Sg.rules`（✗ 不是 `Game.Rules` —— 我探针第一次写错 ✓）
	let e1 = '';
	try { R.applyAdds({ adds: { 心情: 'X' } }, S.variables.pc); } catch (e) { e1 = String(e && e.message || e); }
	t('⑥ ★值非有限数 ⇒ **fail-loud 点名**', /有限数/.test(e1), e1.slice(0, 90));
	S.variables.pc.ev.怪 = { 不是数: true };
	let e2 = '';
	try { R.applyAdds({ adds: { 怪: 1 } }, S.variables.pc); } catch (e) { e2 = String(e && e.message || e); }
	t('⑦ ★目标键已有**非数值** ⇒ 点名（✗ 不静默当 0 再加 —— 那会掩盖数据错 ✓）', /非数值/.test(e2), e2.slice(0, 90));
}
if (B.uncaught?.length) { bad++; console.error('  ✗ 页面有未捕获异常：' + B.uncaught.slice(0, 2).join(' ｜ ')); }
try { await B.close?.(); } catch { /* 忽略 */ }
rmSync(WORK, { recursive: true, force: true });
if (bad) { console.error(`\n✗ adds 声明式算术自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ adds 声明式算术自证通过（点击那一刻 · 缺省零值 · 累加 · 编进链接非渲染期）');
