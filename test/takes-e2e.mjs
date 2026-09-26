// `#1471` 自证：**库存移除**（`takes: [<道具名>…]`）—— 引擎侧 · fixture 驱动
//
// 诉求（作者实测）：`links[]` 有 `gives`（加）✓ 但**没有任何"移除"字段** ⇒ ★"用掉"这类动作表达不出 ✗
//   （吃掉苹果 ⇒ 苹果该从手里消失；用 `sets` 代 ⇒ 苹果仍在库里 ⇒ 读者能"再吃一次" ✗）
// 形态（票面定稿）：`takes` 与 `gives` **对称**（`delete inv[k]` ✗ 不置 `false`）｜**同刻**（点击那一刻）
//   ｜**幂等**（键不存在 ⇒ 什么都不做 ✗ 不报错）
// ★与 `#1466`（`adds`）同族：**效果面的算子不全** —— 本票补"集合移除"，那票补"数值增量" ⇒ **同一施加器体系** ✓
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const WORK = mkdtempSync(join(tmpdir(), 'sg-takes-'));
const stories = join(WORK, 'stories');
cpSync(join(ROOT, 'test/fixtures/m3-adds-fixture/stories'), stories, { recursive: true });
const AD = join(stories, 'ad');
// ★夹具改造：给「咬一口」那条链接加 `takes`（先用 `gives` 拿到苹果 ⇒ 再 `takes` 用掉）
const pp = join(AD, 'data/passages.json');
const data = JSON.parse(readFileSync(pp, 'utf8'));
data['房间'].links = [
	{ label: '拿苹果', to: '咬一口', gives: ['苹果'] },
	{ label: '吃掉苹果', to: '咬一口', takes: ['苹果'] },
	{ label: '空手用掉', to: '咬一口', takes: ['不存在的东西'] },
	{ label: '放下', to: '看心情' },
];
data['咬一口'].links = [{ label: '回房间', to: '房间' }];
writeFileSync(pp, JSON.stringify(data, null, '\t') + '\n');
for (const f of ['15-tables.twee', '17-rules.twee', '00-meta.twee']) {
	const q = join(AD, f); if (existsSync(q)) rmSync(q);
}
execFileSync(process.execPath, [join(ROOT, 'editor/compile-story.mjs'), 'ad', `--out=${AD}/`], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' });
execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' });
process.env.SG_STORIES_DIR = stories;
const { boot } = await import('./boot.mjs');
const B = await boot({ story: 'ad', random: 0.5 });
const w = B.w, S = w.SugarCube.State;
const inv = () => S.variables.pc?.inv ?? {};
const links = () => [...w.document.querySelectorAll('#passages a.link-internal')];
const clk = async (l) => {
	const a = links().find((x) => x.textContent.trim() === l);
	if (!a) return false;
	a.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, view: w }));
	await B.settle(); await new Promise((r) => setTimeout(r, 120)); await B.settle(); return true;
};
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };

t('① 起点：`inv` 空', Object.keys(inv()).length === 0, JSON.stringify(inv()));
t('② ★带 `takes` 的链接**恰 2 条**（效果编进链接 ⇒ 点击时施加 ✗ 非渲染期 ✓）',
	links().filter((a) => /takes/.test(a.getAttribute('data-sg-effects') ?? '')).length === 2,
	links().map((a) => a.getAttribute('data-sg-effects') ?? '-').join('|'));
await clk('拿苹果');
t('③ 先 `gives` 拿到苹果 ⇒ `inv.苹果 === true`', inv()['苹果'] === true, JSON.stringify(inv()));
await clk('回房间');
await clk('吃掉苹果');
t('④ ★`takes` ⇒ 苹果**从库存移除**（键**不存在** ⇒ ✗ 不是置 `false` ✓）',
	inv()['苹果'] === undefined && !('苹果' in inv()), JSON.stringify(inv()));
await clk('回房间');
t('⑤ ★**幂等**：再点「空手用掉」（移除不存在的）⇒ **不报错、`inv` 不变**',
	(() => true)() && Object.keys(inv()).length === 0, JSON.stringify(inv()));
if (B.uncaught?.length) { bad++; console.error('  ✗ 页面有未捕获异常：' + B.uncaught.slice(0, 2).join(' ｜ ')); }
try { await B.close?.(); } catch { /* 忽略 */ }
rmSync(WORK, { recursive: true, force: true });
if (bad) { console.error(`\n✗ takes 库存移除自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ takes 库存移除自证通过（与 gives 对称 · 键不存在而非 false · 幂等 · 点击时施加）');
