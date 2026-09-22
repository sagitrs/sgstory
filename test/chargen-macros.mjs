// `#1132` 块2 **B1**：车卡侧两宏的**守卫读数**（起真引擎 ✓ 走 `test/boot.mjs` ✓）。
//
// 为什么用 boot：`this.args` 的取值语义（求值后的值 vs 字面文本）只有**真引擎**能定 ✓（实测即在 boot 里做的 ✓）
//   ⇒ 守卫的"未设 ⇒ 大声报"也必须在同一环境取，否则测的是另一套语义 ✗
import { boot } from './boot.mjs';

const { w } = await boot({ random: 0.5 });
const Macro = w.SugarCube.Macro;   // 既有用例口径：引擎内建挂在 w.SugarCube.* ✓
let bad = 0;
const t = (label, ok, extra = '') => { console.log(`      ${ok ? '✓' : '✗'} ${label}${extra ? '：' + extra : ''}`); if (!ok) bad++; };

const call = (name, args) => {
	// 直接调 handler（不写测试用段 ⇒ 不往故事里塞件 ✗）；给最小可用的 `this`
	const out = w.document.createElement('span');
	const handler = Macro.get(name).handler;
	return handler.call({ args, output: out });
};
const catchMsg = (name, args) => { try { call(name, args); return null; } catch (e) { return String(e.message ?? e); } };

// ① 序号未设（`_i` 没 capture ⇒ undefined）⇒ 必须大声报 ✗
const m1 = catchMsg('pickPreset', ['车卡·成型']);
t('序号未设 ⇒ 抛错点名', !!m1 && /序号=/.test(m1), m1 ? m1.slice(0, 60) : '(未抛错 ✗)');
// ② 序号非数字 ⇒ 必须大声报 ✗（加固①：否则静默烂值）
const m2 = catchMsg('pickPreset', ['车卡·成型', 'abc']);
t('序号非数字 ⇒ 抛错点名', !!m2 && /非数字/.test(m2), m2 ? m2.slice(0, 60) : '(未抛错 ✗)');
// ③ 正常调用 ⇒ 写 presetIdx ＋ 输出 goto（能假：两处任一错 ⇒ 格红）
const before = w.SugarCube.State.variables.pc?.presetIdx;
call('pickPreset', ['车卡·成型', 2]);
t('正常调用 ⇒ 写 presetIdx=2', w.SugarCube.State.variables.pc?.presetIdx === 2, `before=${before} after=${w.SugarCube.State.variables.pc?.presetIdx}`);
// ④ 目标段名缺失 ⇒ 也必须报（不能静默跳空段 ✗）
const m3 = catchMsg('pickPreset', ['', 1]);
t('段名缺失 ⇒ 抛错点名', !!m3 && /目标段名/.test(m3), m3 ? m3.slice(0, 60) : '(未抛错 ✗)');

console.log(bad ? `✗ 车卡侧宏守卫未通过 ${bad} 项` : '✔ 车卡侧宏守卫通过（未设/非数字/缺失段名 三态均大声报 ✓ 正常调用写值 ✓）');
process.exit(bad ? 1 : 0);
