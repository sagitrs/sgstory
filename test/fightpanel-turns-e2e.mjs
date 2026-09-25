// `#1426` 自证：**战斗的"收尾时机"**（`<<fightpanel "池" N [won|lost]>>`）—— 引擎侧 · fixture 驱动 · ✗ 不跑真故事。
//
// 诉求：`#1420` 给了**写点**（`<<fightend>>`）与**声明态**（`fight:<池>.won/.lost/.done`）✓，
//   但作者**没有任何位置**可以写"回合打够了 ⇒ 收尾" ✗（旧故事只能在散文里算 `<<if $pc.ev.fight.round gt 2>>`）。
// 形态（丙案）：第 3 参＝**打满 N 回合即收尾**（**机械事实**：回合数）；第 4 参＝**作者给的结果**（缺省＝不判）。
//   ★引擎仍**不判胜负**（那是故事策略 ✓）；✗ 不新开写路（复用 `Game.Combat.settle` ✓）；✗ 不破零表达式 ✓。
//
// ★ 实现要点（实测踩到）：判定必须放在 **link 体**里（＝**点击时**执行）——
//   因为 SugarCube 对 `<<goto 同段>>` **不重渲染**（实测：`:passagerender` 计数 1→1）
//   ⇒ 若把判定写在渲染期，它在"打满"那一刻**永不执行** ✗。
//
// 两态：① 打满 N 回合 ⇒ **自动收尾**（`fights` 表在 ＋ `fight:<池>.won` 为真 ⇒ 胜分叉出现）
//      ② 未打满 ⇒ **不收尾**（表不在 ⇒ 两侧分叉都不出 ✓，与 `#1420` 的"未收尾 ⇒ 不出"同轴）
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const WORK = mkdtempSync(join(tmpdir(), 'sg-fturns-'));
const stories = join(WORK, 'stories');
cpSync(join(ROOT, 'test/fixtures/m3-fightpanel-turns/stories'), stories, { recursive: true });
for (const f of ['15-tables.twee', '17-rules.twee', '00-meta.twee']) {
	const q = join(stories, 'fp', f); if (existsSync(q)) rmSync(q);
}
execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' });
process.env.SG_STORIES_DIR = stories;
const { boot } = await import('./boot.mjs');
const B = await boot({ story: 'fp', random: 0.5 });
const w = B.w, S = w.SugarCube.State;
const links = () => [...w.document.querySelectorAll('#passages a.link-internal')].map((a) => a.textContent.trim());
const clk = async (l) => {
	const a = [...w.document.querySelectorAll('#passages a.link-internal')].find((x) => x.textContent.trim() === l);
	if (!a) return false;
	a.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, view: w }));
	await B.settle(); return true;
};
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };

t('① 起点：战斗已开（面板在 ＋ 有可点动作）', links().includes('劈下去'), links().join(' | '));
t('① 起点：**未收尾**（`fights` 表不在 ⇒ 两侧分叉都不出 —— 与 `#1420` 同轴）',
	!S.variables.fights && !links().some((x) => x.includes('战果')));
// 打满 N=3 ⇒ 第 2 次点击后 round 达 3（`resolveFoe` 末尾 `round++` ✓）
await clk('劈下去'); await clk('劈下去');
const f = S.variables.pc?.ev?.fight;
t('② ★打满 3 回合 ⇒ **自动收尾**：`fight` 记 `done` ＋ `fights` 表在', f?.done === true && !!S.variables.fights?.['雾影'],
	`done=${f?.done} fights=${JSON.stringify(S.variables.fights ?? null)}`);
t('② ★且**是作者给的结果**（`won` ⇒ `won:true`／`lost:false`）',
	S.variables.fights?.['雾影']?.won === true && S.variables.fights?.['雾影']?.lost === false,
	JSON.stringify(S.variables.fights?.['雾影'] ?? null));
t('② ★而**引擎不判胜负**：结果字段来自第 4 参（✗ 引擎没自己算「打够就算赢」）',
	S.variables.fights?.['雾影']?.round === 3, String(S.variables.fights?.['雾影']?.round));
// 异段跳入（同段 goto 不重渲染 ⇒ 走 `战果` 段看分叉）
await clk('查看这一场');
t('③ 收尾后到 `战果` 段 ⇒ **胜分叉出现**（`fight:雾影.won` 命中）', links().includes('查看战果（胜）'), links().join(' | '));
t('③ 且**不出现**败分叉（✗ 不是两侧都出）', !links().includes('查看战果（败）'));

if (B.uncaught?.length) { bad++; console.error('  ✗ 页面有未捕获异常：' + B.uncaught.slice(0, 2).join(' ｜ ')); }
try { await B.close?.(); } catch { /* 忽略 */ }
rmSync(WORK, { recursive: true, force: true });
if (bad) { console.error(`\n✗ fightpanel 收尾时机自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ fightpanel 收尾时机自证通过（打满 N 回合 ⇒ 自动收尾 ⇒ 作者给的结果决定分叉）');
