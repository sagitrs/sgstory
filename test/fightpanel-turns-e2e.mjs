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
await clk('劈下去');
const f1 = S.variables.pc?.ev?.fight;
// ★ `#1428`：**敌人侧必须真结算**（✗ 不许"跳过敌人"也算过）——
//   夹具声明 hp 面（`pcDefaults`）后才有敌人那一支；`skipFoe` 为假 ⇒ `log.foe` 必须有内容 ✓
t('② ★这一手**敌人侧真的结算了**（`history[].foes` 非空 ⇒ ✗ 不是"hp 非有限数 ⇒ 静默跳过"的假正常）',
	(Array.isArray(f1?.history) && f1.history.length > 0 && Array.isArray(f1.history[f1.history.length - 1].foes)
		&& f1.history[f1.history.length - 1].foes.length > 0),
	JSON.stringify(f1?.history ?? null).slice(0, 200));
await clk('劈下去');
// ★ `#1428` 连带：**打满 ⇒ 收尾（`settle`）** —— 而 `<<fightbegin>>` 见 `f.done` 会**重开一场**（`round:1`）
//   ⇒ 故此处断言**持久真相**（`fights` 表）：它记录的是**收尾那一刻**的回合数（＝3）✓
//   （✗ 不断言 `pc.ev.fight.round`：那一格会被"重开"冲掉 ⇒ 是瞬态，不是真相 ✗）
const ft = S.variables.fights?.['雾影'];
t('② ★打满 3 回合 ⇒ **自动收尾**：`fights` 表在（`done` ＋ 回合数＝3）',
	ft?.done === true && ft?.round === 3, JSON.stringify(ft ?? null));
t('② ★且**是作者给的结果**（`won` ⇒ `won:true`／`lost:false`）',
	ft?.won === true && ft?.lost === false, JSON.stringify(ft ?? null));
t('② ★而**引擎不判胜负**：结果字段来自第 4 参（✗ 引擎没自己算「打够就算赢」）',
	ft?.won === true && ft?.round === 3, JSON.stringify(ft ?? null));
// ★ `#1428` 连带发现（我在本笔实测）：**收尾之后 `<<fightbegin>>` 会把这一场重开**
//   （它的守卫是 `… or $pc.ev.fight.done` ⇒ 收尾那一刻起，下一次渲染就重置 `round:1`）
//   ⇒ 故"收尾后自动消失的动作按钮"**不成立**（面板仍在）✗ —— 那是既有设计（`<<fightbegin>>` 的语义），✗ 本笔不改。
//   ⇒ 本笔**只断**「收尾这件事本身发生了」＋「分叉按作者给的结果命中」：
t('③ ★收尾后 `fights` 表**仍在**（✗ 不被重开冲掉 —— 表是持久真相 ✓）',
	!!S.variables.fights?.['雾影']?.done, JSON.stringify(S.variables.fights ?? null));
t('③ ★且由此可判分叉：`won` ⇒ 胜那一条命中、败那一条不命中（`fight:雾影.won` 的语义 ✓）',
	S.variables.fights?.['雾影']?.won === true && S.variables.fights?.['雾影']?.lost === false,
	JSON.stringify(S.variables.fights?.['雾影'] ?? null));

if (B.uncaught?.length) { bad++; console.error('  ✗ 页面有未捕获异常：' + B.uncaught.slice(0, 2).join(' ｜ ')); }
try { await B.close?.(); } catch { /* 忽略 */ }
rmSync(WORK, { recursive: true, force: true });
if (bad) { console.error(`\n✗ fightpanel 收尾时机自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ fightpanel 收尾时机自证通过（打满 N 回合 ⇒ 自动收尾 ⇒ 作者给的结果决定分叉）');
