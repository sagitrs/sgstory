// `#1468` 自证：**行效果在"点击那一刻"施加**（`<<rules>>`/`<<rulelist>>` 渲染期**不落**）—— 引擎侧 · fixture 驱动
//
// 诉求（写作者实测，我复现 ✓）：`m3-chk-e2e` 的 `north-room`「靴子」段有一条带 `gives` 的规则行
//   ⇒ **进段、未点任何链接** ⇒ `inv` 里**已有**`黄铜钥匙` ✗（`<<rulelist>>` 渲染期就 `applyGrants` ✓）
// 修（裁＝甲）：★效果**随链接走** —— 编译期把行效果编进 `<a data-sg-effects="…">`（复用 `#1408` 的**同一施加器** ✓），
//   由**点击处理器**施加；★渲染期**不再** `applyYields/Grants/Sets` ✓
// ★与 `#1408` 的关系：那是 `links[]` 路径（`passages.json`），本笔是**规则行路径**（`rules.json` 手写行）
//   ⇒ ★两侧**同一形、同一施加器**（✗ 不造第二套 —— 这正是 `#1463` 那条"同概念多入口"的纪律 ✓）
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const WORK = mkdtempSync(join(tmpdir(), 'sg-rulelist-'));
const stories = join(WORK, 'stories');
cpSync(join(ROOT, 'test/fixtures/m3-chk-e2e/stories'), stories, { recursive: true });
// ★清**三层**（✗ 不清"生成物"会拿到陈旧 `17-rules.twee` ⇒ 读数落在旧形态上 ✗ 我实测踩过）
for (const f of ['15-tables.twee', '17-rules.twee', '00-meta.twee']) {
	const q = join(stories, 'north-room', f); if (existsSync(q)) rmSync(q);
}
execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' });
process.env.SG_STORIES_DIR = stories;
const { boot } = await import('./boot.mjs');
const B = await boot({ story: 'north-room', random: 0.5 });
const w = B.w, S = w.SugarCube.State;
const links = () => [...w.document.querySelectorAll('#passages a.link-internal')];
const clk = async (l) => {
	const a = links().find((x) => x.textContent.trim() === l);
	if (!a) return false;
	a.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, view: w }));
	await B.settle(); await new Promise((r) => setTimeout(r, 120)); await B.settle(); return true;
};
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };

t('① 起点：`inv` 空（✗ 没有任何"读者没点就拿到"的东西）', Object.keys(S.variables.pc?.inv ?? {}).length === 0,
	JSON.stringify(S.variables.pc?.inv ?? {}));
await clk('翻一翻靴子');
t('② ★进「靴子」段、**未点任何链接** ⇒ `inv` 仍空（✗ 修前这里就有钥匙 ✓）',
	!S.variables.pc?.inv?.['黄铜钥匙'], JSON.stringify(S.variables.pc?.inv ?? {}));
const eff = links().filter((a) => a.getAttribute('data-sg-effects'));
t('③ ★带 `data-sg-effects` 的链接**恰 1 条**（＝规则行里那条 `gives` 的 ⇒ 效果真编进了链接 ✓）',
	eff.length === 1 && eff[0].textContent.trim() === '把钥匙收进口袋', `eff=${eff.length}｜${eff.map((a) => a.textContent.trim()).join('|')}`);
t('④ 且**不带效果**的链接**没有**该属性（✗ 不误加）',
	links().filter((a) => !a.getAttribute('data-sg-effects')).every((a) => !a.hasAttribute('data-sg-effects')));
if (eff[0]) await clk('把钥匙收进口袋');
t('⑤ ★**点击那一刻**才拿到钥匙（✗ 不是渲染期 ✓）', S.variables.pc?.inv?.['黄铜钥匙'] === true,
	JSON.stringify(S.variables.pc?.inv ?? {}));
t('⑥ 且**跳到目标段**（链接照旧可用 ✓）', String(S.passage) === '门厅', String(S.passage));

if (B.uncaught?.length) { bad++; console.error('  ✗ 页面有未捕获异常：' + B.uncaught.slice(0, 2).join(' ｜ ')); }
try { await B.close?.(); } catch { /* 忽略 */ }
rmSync(WORK, { recursive: true, force: true });
if (bad) { console.error(`\n✗ rulelist 行效果时机自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ rulelist 行效果时机自证通过（渲染期不落 · 点击那一刻施加 · 同一施加器）');
