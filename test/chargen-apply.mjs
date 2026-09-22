// `#1132` B2：声明式施加器 `Sg.Chargen.apply(pc, patch)` 的**每动词一格**读数（boot 起真引擎 ✓）。
//   动词集是从真实消费者推得的**封闭三件**（set／add／append ✓）⇒ 每件各一格 ＋ 未知动词大声报一格 ✗
//   路径读写走 Sg.notes.writePath／readPath（引擎既有权威 ✓）；故必须真引擎 ⇒ 不能纯函数注入 ✓
import { boot } from './boot.mjs';

const { w } = await boot({ random: 0.5 });
const Sg = w.SugarCube.Sg ?? w.Sg ?? w.window.Sg;
let bad = 0;
const t = (label, ok, extra = '') => { console.log(`      ${ok ? '✓' : '✗'} ${label}${extra ? '：' + extra : ''}`); if (!ok) bad++; };
const mk = () => ({ ev: {}, world: {} });   // 最小 pc（writePath／readPath 走点分路径 ✓）

// ① set：整对象**替换**（不残留 ✓ —— 真实消费者 `pc.abilities = {…}`）
const pc1 = mk();
// NOTE: whole-object set must use the explicit "set" verb (a bare object is indistinguishable
// from a verb envelope, so the engine throws "no recognizable verb").
Sg.Chargen.apply(pc1, { abilities: { set: { str: 16, dex: 12 } } });
const r1a = JSON.stringify(Sg.notes.readPath(pc1, 'abilities'));
Sg.Chargen.apply(pc1, { abilities: { set: { str: 8 } } });
const r1b = JSON.stringify(Sg.notes.readPath(pc1, 'abilities'));
t('set：整对象替换（不残留）', r1b === '{"str":8}' && r1a.includes('"dex"'), `先=${r1a} 后=${r1b}`);

// ② add：数值增（含嵌套 ✓ —— 真实消费者 `pc.gold += 10`／`pc.abilities.str += 1`）
const pc2 = mk();
Sg.notes.writePath(pc2, 'gold', 5);
Sg.notes.writePath(pc2, 'abilities.str', 15);   // add 只对 number 生效 ⇒ 先有基值（真实消费者亦先经 abilities 赋值 ✓）
// (甲) 口径：补丁是**扁平表**，键＝点分路径 ⇒ 嵌套目标写成一个点分键 ✓
Sg.Chargen.apply(pc2, { gold: { add: 10 }, 'abilities.str': { add: 1 } });
const g = Sg.notes.readPath(pc2, 'gold'), st = Sg.notes.readPath(pc2, 'abilities.str');
t('add：数值随之变（含点分路径）', g === 15 && st === 16, `gold=${g} abilities.str=${st}（基值 15 + 1 ✓）`);

// ②b add：非 number ⇒ 当场大声报 ✗（不静默）
let m2 = null;
try { Sg.Chargen.apply(mk(), { gold: { add: 'abc' } }); } catch (e) { m2 = String(e.message); }
t('add：非数字载荷 ⇒ 抛错点名', !!m2 && /必须是数字/.test(m2), m2 ? m2.slice(0, 56) : '(未抛 ✗)');

// ③ append：数组追加（删一项 ⇒ 少一项 ✓ —— 真实消费者 `pc.skills.push('运动')`）
const pc3 = mk();
Sg.Chargen.apply(pc3, { skills: { append: ['运动', '察觉'] } });
const s3a = JSON.stringify(Sg.notes.readPath(pc3, 'skills'));
const pc4 = mk();
Sg.Chargen.apply(pc4, { skills: { append: ['运动'] } });
const s3b = JSON.stringify(Sg.notes.readPath(pc4, 'skills'));
t('append：追加顺序与条数（删一项即少一项）', s3a === '["运动","察觉"]' && s3b === '["运动"]', `${s3a} vs ${s3b}`);

// ④ 未知动词 ⇒ 大声报 ✗（封闭集的能假面）
let m4 = null;
try { Sg.Chargen.apply(mk(), { gold: { bogus: 1 } }); } catch (e) { m4 = String(e.message); }
t('未知动词 ⇒ 抛错点名并列出所认动词', !!m4 && /bogus|只认/.test(m4), m4 ? m4.slice(0, 66) : '(未抛 ✗)');

console.log(bad ? `✗ 施加器动词格未通过 ${bad} 项` : '✔ 施加器动词格通过（set 替换 ✓ add 数值增＋非数字报 ✓ append 追加 ✓ 未知动词报 ✓）');
process.exit(bad ? 1 : 0);
