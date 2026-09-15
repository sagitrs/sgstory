// 兼容模式护栏（`#492` S7）：故事**未启用**新机制（部位/耐久/异常/波次）时，引擎必须**显式降级**到旧路径，
// 而且**旧减伤路径仍生效** —— 不许把"未声明"当成"0 减成"，把故事 1 的平衡悄悄改掉。
//
// 为什么需要这道门（而不是"看代码就知道"）：
//   · 引擎里那句 `if (!mech) return null` 只是**代码形状**，没有门盯着它。若哪天有人把它改成
//     `return { reduce: 0, toHp: hurt, ... }`（一个"0 减成计划"），**当前数值一模一样** ⇒ 现有门全绿，
//     但故事 1 从此**参与**了 slot 数学：将来任何对槽位/耐久/异常/波次的改动都会**默默**作用到它身上。
//     这正是 `#492` 要挡住的那一类"悄悄改平衡"。
//   · 反向也一样：故事 2 **声明启用了**机制，某个入口却返回 `null`（走了降级）⇒ 该机制等于没生效。
//   · ⚠️ 覆盖必须**按入口家族**（guest 在 T 席验收里实测的坑）：只钉 `slotAbsorb` 一个入口时，
//     把 `slotAbsorbAt` 改成 0-plan **不会**让门红 —— 同族入口有 7 个，必须一起钉。
//
// 判据：
//   ① **显式降级**：`mechanics() === null` ⇒ 家族**每个**入口都返回 `null`（不是 0-plan）；
//   ② **旧口径仍在**：`Game.Items.battleDamage()` 的 `flatDamageReduce`（日记/龙鳞护臂 = 2）照旧生效，
//      且下限 `1` 不变 —— 这三行是故事 1 **迁移前**的伤害数值（`#493` 要拿它对账）；
//   ③ **两态可辨**：声明启用机制的故事（`hollow-cave`）⇒ 家族每个入口都返回计划（不是 `null`）；
//   ④ **降级无副作用**：这些入口是**纯函数**（两态下都不写 `pc`）—— 降级路径不许留下残迹。
//
// 自证：`node test/fight-compat.mjs --selftest`（正例 2 ＋ 反例 4，含"某个非首入口 0-plan 必须判红"）
// 真产物探针（已实测）：把引擎 `slotAbsorb`（或 `slotAbsorbAt`）的 `if (!mech) return null` 改成返回 0-plan ⇒ 本门红。

import { boot } from './boot.mjs';

/** **入口家族**（引擎里所有"未启用 ⇒ 显式降级"的入口；新增入口请一并登记，否则门会漏）。
 *  取参在页面上下文里按**声明面**解析（故事 1 未声明 ⇒ 走兜底值，但短路发生在用参之前）。 */
export const ENTRY_LIST = [
	{ name: 'slotAbsorb', call: 'C.slotAbsorb(pc, 7)' },
	{ name: 'slotAbsorbAt', call: 'C.slotAbsorbAt(pc, part, 7)' },
	{ name: 'gearWear', call: 'C.gearWear(pc, gear)' },
	{ name: 'repairAll', call: 'C.repairAll(pc)' },
	{ name: 'statusTick', call: 'C.statusTick(pc)' },
	{ name: 'applyStatus', call: 'C.applyStatus(pc, statusId, part)' },
	{ name: 'wavePlan', call: 'C.wavePlan(encId)' },
];

/** 判定（纯函数，便于自证）。obs = { enabled, entries: { 入口名: planOrNull } }
 *  `null` ＝"这条路径没接管"（降级）；对象 ＝"接管了"（**0-plan 也算接管** ⇒ 未启用时必须判红）。 */
export const judgeFamily = (obs) => {
	const entries = obs?.entries ?? {};
	const names = Object.keys(entries);
	if (!names.length) return { verdict: 'uncalibrated', msg: '没有观测到任何机制入口（本用例需校准，不计为通过）' };
	const took = names.filter((n) => entries[n] !== null && entries[n] !== undefined);
	const missed = names.filter((n) => entries[n] === null || entries[n] === undefined);
	if (obs.enabled === false) {
		if (took.length) {
			return {
				verdict: 'fail',
				msg: `未启用机制却有入口**接管**（不是显式降级）：${took.join('／')}`
					+ `（例 ${took[0]} ⇒ ${JSON.stringify(entries[took[0]])}）——若这是"0 减成计划"，当前数值一样`
					+ '但故事 1 已**参与**该机制，将来改动会默默作用到它身上（`#492`）',
			};
		}
		return { verdict: 'pass', msg: `显式降级：${names.length} 个入口全部返回 null（${names.join('／')}）` };
	}
	if (missed.length) {
		return { verdict: 'fail', msg: `声明**已启用**机制却仍有入口返回 null（该机制等于没生效）：${missed.join('／')}` };
	}
	return { verdict: 'pass', msg: `机制已生效：${names.length} 个入口全部返回计划（${names.join('／')}）` };
};

const selftest = () => {
	let bad = 0;
	const t = (msg, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${msg}`); };
	const all = (v) => Object.fromEntries(ENTRY_LIST.map((e) => [e.name, v]));
	const zeroPlan = { part: '躯干', gear: null, reduce: 0, absorbed: 0, toHp: 7, gearHp: null, broke: false };
	t('正例①：未启用 ⇒ 家族全 null（显式降级）', judgeFamily({ enabled: false, entries: all(null) }).verdict === 'pass');
	t('正例②：已启用 ⇒ 家族全非 null', judgeFamily({ enabled: true, entries: all({ hp: 1 }) }).verdict === 'pass');
	t('🔴 反例①：未启用但**某个非首入口**（`slotAbsorbAt`）返回 0-plan ⇒ 判红，且点名该入口',
		(() => { const r = judgeFamily({ enabled: false, entries: { ...all(null), slotAbsorbAt: zeroPlan } }); return r.verdict === 'fail' && r.msg.includes('slotAbsorbAt'); })());
	t('🔴 反例②：未启用但**全部**接管 ⇒ 判红', judgeFamily({ enabled: false, entries: all(zeroPlan) }).verdict === 'fail');
	t('🔴 反例③：声明启用却有入口返回 null ⇒ 判红（机制没生效）',
		(() => { const r = judgeFamily({ enabled: true, entries: { ...all({ hp: 1 }), wavePlan: null } }); return r.verdict === 'fail' && r.msg.includes('wavePlan'); })());
	t('反例④：没有观测 ⇒ 判「需校准」（不会空判成通过）', judgeFamily({ enabled: false, entries: {} }).verdict === 'uncalibrated');
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过：家族级显式降级 / 0-plan 判红并点名 / 已启用却降级判红 / 无观测不空判');
};

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

let bad = 0;
const ok = (msg, cond, extra = '') => {
	if (cond) console.log(`      ✓ ${msg}`);
	else { bad++; console.error(`      ✗ ${msg}${extra ? '：' + extra : ''}`); }
};

/** 在页面上下文里跑**整个入口家族**（取参按声明面解析）；同时记录 `pc` 是否被写（纯函数判据）。 */
const probeFamily = (w) => w.eval(`(() => {
	const pc = (typeof State !== 'undefined' && State.variables && State.variables.pc) ? State.variables.pc : Game.Pc.defaults();
	const C = Game.Combat, mech = C.slotsDecl();
	const part = (mech?.hitLocations ?? ['躯干'])[0];
	const gear = Object.keys(mech?.equipment ?? { x: {} })[0] ?? 'x';
	const statusId = Object.keys(mech?.statuses ?? { x: {} })[0] ?? 'x';
	const encId = Object.keys(mech?.encounters ?? { x: {} })[0] ?? 'x';
	const snap = (o) => JSON.stringify([o?.gearHp ?? null, o?.statuses ?? null]);
	const before = snap(pc);
	const entries = {};
	${ENTRY_LIST.map((e) => `entries[${JSON.stringify(e.name)}] = ${e.call};`).join('\n\t')}
	return { entries, wrote: before !== snap(pc) };
})()`);

// ── 故事 1（`mist-forest`）：**未启用** ⇒ 判据 ①②④ ─────────────────────────────
{
	console.log('── 故事 1（未启用新机制）：家族级显式降级 ＋ 旧口径');
	const { w, close } = await boot({ story: 'mist-forest', random: 0.5 });
	const mech = w.eval('window.Sg.story.mechanics()');
	ok('前提：故事 1 显式声明"未启用"（`mechanics()` 为 null，不是省略）', mech === null, JSON.stringify(mech));
	const { entries, wrote } = probeFamily(w);
	const r = judgeFamily({ enabled: false, entries });
	ok(`① 家族级显式降级：${r.verdict}`, r.verdict === 'pass', r.msg);
	ok('④ 降级无副作用（纯函数，两态都不写 `pc`）', wrote === false);
	// ② 旧口径：flatDamageReduce 仍生效 ＋ 下限 1（这三行是 `#493` 迁移前要对上的数值）
	const dmg = (inv) => w.eval(`Game.Items.battleDamage(1, ${inv}, 0, false)`);
	const d0 = dmg('{}'), d1 = dmg('{ 日记: true }'), d2 = dmg('{ 日记: true, 龙鳞护臂: true }');
	ok(`② 旧减伤路径仍生效：第 1 回合 ${d0} → 1 件 ${d1}（−2）→ 2 件 ${d2}（−4，触下限）`, d0 === 5 && d1 === 3 && d2 === 1, `得 ${d0}/${d1}/${d2}`);
	ok('② 下限 1 不变（再叠道具也不低于 1）', dmg('{ 日记: true, 龙鳞护臂: true }') >= 1);
	close();
}

// ── 故事 2（`hollow-cave`）：**已启用** ⇒ 判据 ③（两态可辨：确实走了另一条路）──────────
{
	console.log('── 故事 2（已启用新机制）：家族每个入口都真的接管');
	const { w, close } = await boot({ story: 'hollow-cave', random: 0.5 });
	const mech = w.eval('window.Sg.story.mechanics()');
	ok('前提：故事 2 声明了机制（非 null）', mech !== null && typeof mech === 'object');
	const { entries, wrote } = probeFamily(w);
	const r = judgeFamily({ enabled: true, entries });
	ok(`③ 已启用 ⇒ 家族全部接管：${r.verdict}`, r.verdict === 'pass', r.msg);
	ok('④ 纯函数（返回计划，不在内部写 `pc`）', wrote === false);
	close();
}

if (bad) { console.error(`\n✗ 兼容模式护栏未通过（${bad} 项）—— 未启用新机制时引擎必须**显式降级**，不许"0 减成"悄悄改平衡（#492）`); process.exit(1); }
console.log('\n✔ 兼容模式护栏通过（未启用 ⇒ 家族 7 个入口全显式 null · 旧减伤口径不变 · 已启用 ⇒ 全部接管 · 纯函数）');
process.exit(0);
