// `#660` 片三-3：`Game.Pc.defaults()` —— **形状住引擎、数值走故事**（`Sg.story.pcDefaults()`）
//
// 判据（每条对应一处失效方式）：
//   ① **形状中性**：把故事面摘掉后，引擎给的**每个值都必须是中性的**（0/''/false/[]/{}/null）——
//      否则"故事 1 的数值"又硬编码回引擎（`star.charge = 12`／`keeper.state = 'post'` 就是原样）。
//   ② **故事值生效**：真机（故事 1）`star.charge === 12` · `keeper.state === 'post'`，且**没把兄弟键抹掉**（深合并一层）。
//   ③ **缺面降级**（必须的反例）：故事**未声明** `Sg.story.pcDefaults` ⇒ 仍返回**完整形状**、**不抛错**。
//   ④ **结构畸形 ⇒ 报错**：面存在但返回非对象 ⇒ fail-loud（不许静默当空）。
//   ⑤ **兜底住引擎**：`migrate()` 给旧档补键时**带上故事数值**（旧档读进来不能缺 `star.charge`）。
//   ⑥ **形状单一源**：三个故事的键集合**完全一致**（故事只能给数值，不能改形状）。
import { boot } from './boot.mjs';
let failures = 0;
const eq = (actual, expected, msg) => {
	const okk = JSON.stringify(actual) === JSON.stringify(expected);
	console.log(`${okk ? '✓' : '✗'} ${msg}${okk ? '' : `（期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}）`}`);
	if (!okk) failures++;
};
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) failures++; };

/** 中性值判定：0 / '' / false / [] / {} / null 才算"引擎形状该有的值"。 */
const isNeutral = (v) => v === null || v === 0 || v === '' || v === false
	|| (Array.isArray(v) && v.length === 0)
	|| (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every(isNeutral));

const { w } = await boot({ story: 'mist-forest', random: 0.5 });
const keysOf = (o) => Object.keys(o).sort().join(',');

// ② 真机（故事 1）：故事数值生效 ＋ 深合并不抹兄弟键
const real = w.eval('Game.Pc.defaults()');
eq(real.star.charge, 12, '② 真机：`star.charge === 12`（故事面给的数值）');
eq(real.keeper.state, 'post', '② 真机：`keeper.state === "post"`（故事面给的数值）');
eq([real.star.spent, real.star.first_free], [0, false], '② 深合并一层：`star` 的其余子键仍在（没被整块替换）');
eq(real.soc.att, {}, '② 深合并一层：`soc` 的空子表仍是空表');

// ① + ③ 摘掉故事面 ⇒ 形状中性 ＋ 不抛错（缺面＝显式降级）
const bare = w.eval('(() => { const f = Sg.story.pcDefaults; delete Sg.story.pcDefaults; try { return Game.Pc.defaults(); } finally { Sg.story.pcDefaults = f; } })()');
ok(isNeutral(bare), '① 摘掉故事面后：引擎给的**每个值都中性**（故事 1 的数值没有硬编码回引擎）');
eq(bare.star.charge, 0, '③ 缺面 ⇒ 显式降级：`star.charge === 0`（不抛错）');
eq(keysOf(bare), keysOf(real), '③ 缺面 ⇒ **形状不变**（键集合与真机一致，只是值中性）');

// ④ 面返回非对象 ⇒ 报错
const msgs = [];
for (const bad of ['() => 42', '() => []', "() => 'x'"]) {
	const got = w.eval(`(() => { const f = Sg.story.pcDefaults; Sg.story.pcDefaults = ${bad}; try { Game.Pc.defaults(); return '没报错'; } catch (e) { return e.message; } finally { Sg.story.pcDefaults = f; } })()`);
	if (/必须返回对象/.test(String(got))) msgs.push(bad);
}
eq(msgs.length, 3, '④ 结构畸形（`42` / `[]` / 字符串）⇒ 三条都 fail-loud（报"必须返回对象"）');

// ⑤ migrate 兜底：旧档补键要带上故事数值
const mig = w.eval('Game.Pc.migrate({ hp: 3 })');
eq([mig.hp, mig.star.charge, mig.keeper.state], [3, 12, 'post'], '⑤ `migrate()` 给旧档补键时带上故事数值（旧档不缺 `star.charge`）');

// ⑥ 形状单一源：三个故事键集合一致
const sets = { 'mist-forest': keysOf(real) };
for (const story of ['hollow-cave', 'minimal-demo']) {
	const { w: wi } = await boot({ story, random: 0.5 });
	sets[story] = keysOf(wi.eval('Game.Pc.defaults()'));
}
ok(Object.values(sets).every((k) => k === sets['mist-forest']), `⑥ 三故事键集合一致（形状单一源）：${Object.entries(sets).map(([s, k]) => `${s}=${k.split(',').length} 键`).join(' · ')}`);

console.log(failures ? `\n${failures} 项失败` : '\npc 默认形状（形状住引擎 · 数值走故事）全部通过');
process.exit(failures ? 1 : 0);
