// 兼容模式护栏（`#492` S7）：故事**未启用**新机制（部位/耐久/异常）时，引擎必须**显式降级**到旧路径，
// 而且**旧减伤路径仍生效** —— 不许把"未声明"当成"0 减成"，把故事 1 的平衡悄悄改掉。
//
// 为什么需要这道门（而不是"看代码就知道"）：
//   · 引擎里那句 `if (!mech) return null` 只是**代码形状**，没有任何门盯着它。若哪天有人把它改成
//     `return { reduce: 0, toHp: hurt, ... }`（一个"0 减成计划"），**当前数值一模一样** ⇒ 现有门全绿，
//     但故事 1 从此**参与**了 slot 数学：将来任何对 `slotAbsorbAt` 的改动（护具、掷部位、耐久）
//     都会**默默**作用到故事 1 上。这正是 `#492` 要挡住的那一类"悄悄改平衡"。
//   · 反向也一样：故事 2 **声明启用了**机制，却若返回 `null`（走了降级）⇒ 新机制等于没生效。
//
// 判据（每条都带反例，反例真会红）：
//   ① **显式降级**：`mechanics() === null` ⇒ `Game.Combat.slotAbsorb()` 必须返回 **`null`**（不是 0-plan）；
//   ② **旧口径仍在**：`Game.Items.battleDamage()` 的 `flatDamageReduce`（日记/龙鳞护臂 = 2）照旧生效，
//      且下限 `1` 不变 —— 这三行是故事 1 **迁移前**的伤害数值（`#493` 要拿它对账）；
//   ③ **两态可辨**：声明启用机制的故事（`hollow-cave`）⇒ `slotAbsorb()` 返回计划（不是 `null`）；
//   ④ **降级无副作用**：`slotAbsorb()` 是**纯函数**（两态下都不写 `pc`）—— 降级路径不许留下残迹。
//
// 自证：`node test/fight-compat.mjs --selftest`（正例 1 ＋ 反例 4，含"0-plan 必须判红"）
// 真产物探针（已实测）：把引擎 `slotAbsorb` 的 `if (!mech) return null` 改成返回 0-plan（或删掉该行）
//   ⇒ `node test/fight-compat.mjs` 红。

import { boot } from './boot.mjs';

/** 判定（纯函数，便于自证）。obs = { enabled, plans: [{ raw, plan, gearHpAfter }] }
 *  `plan === null` 表示"这条路径没接管"（降级）；对象表示"接管了"（0-plan 也算接管 ⇒ 必须判红）。 */
export const judgeCompat = (obs) => {
	const plans = obs?.plans ?? [];
	if (!plans.length) return { verdict: 'uncalibrated', msg: '没有观测到任何受击（本用例需校准，不计为通过）' };
	const tookOver = (p) => p.plan !== null && p.plan !== undefined;
	if (obs.enabled === false) {
		const bad = plans.filter(tookOver);
		if (bad.length) {
			return {
				verdict: 'fail',
				msg: `未启用机制却**接管**了受击（不是显式降级）：${bad.length}/${plans.length} 例，例：hurt=${bad[0].raw} ⇒ ${JSON.stringify(bad[0].plan)}`
					+ '——如果这是一份"0 减成计划"，当前数值一样但故事 1 已**参与** slot 数学（`#492`）',
			};
		}
		return { verdict: 'pass', msg: `显式降级：${plans.length} 例受击都返回 null（未接管）` };
	}
	const missed = plans.filter((p) => !tookOver(p));
	if (missed.length) {
		return {
			verdict: 'fail',
			msg: `声明**已启用**机制却没接管：${missed.length}/${plans.length} 例返回 null（例 hurt=${missed[0].raw}）——新机制等于没生效`,
		};
	}
	return { verdict: 'pass', msg: `机制已生效：${plans.length} 例受击都返回计划（非 null）` };
};

const selftest = () => {
	let bad = 0;
	const t = (msg, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${msg}`); };
	const P = (raw, plan) => ({ raw, plan: plan === 'null' ? null : plan });
	t('正例：未启用 ⇒ 全 null（显式降级）', judgeCompat({ enabled: false, plans: [P(7, 'null'), P(13, 'null')] }).verdict === 'pass');
	t('🔴 反例①：未启用但有一个 **0-plan** ⇒ 判红（"看着数值一样、其实换了路径"）',
		judgeCompat({ enabled: false, plans: [P(7, 'null'), P(13, { part: '', reduce: 0, absorbed: 0, toHp: 13, gearHp: null, broke: false })] }).verdict === 'fail');
	t('🔴 反例②：未启用但**全部**接管 ⇒ 判红', judgeCompat({ enabled: false, plans: [P(7, { reduce: 0, toHp: 7 })] }).verdict === 'fail');
	t('🔴 反例③：声明启用却返回 null ⇒ 判红（机制没生效）', judgeCompat({ enabled: true, plans: [P(7, 'null')] }).verdict === 'fail');
	t('反例④：没有观测 ⇒ 判「需校准」（不会空判成通过）', judgeCompat({ enabled: false, plans: [] }).verdict === 'uncalibrated');
	t('正例：已启用 ⇒ 全非 null', judgeCompat({ enabled: true, plans: [P(7, { part: '头', reduce: 1, toHp: 6 })] }).verdict === 'pass');
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过：显式降级 / 0-plan 判红 / 已启用却降级判红 / 无观测不空判');
};

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

let bad = 0;
const ok = (msg, cond, extra = '') => {
	if (cond) console.log(`      ✓ ${msg}`);
	else { bad++; console.error(`      ✗ ${msg}${extra ? '：' + extra : ''}`); }
};

// 取受击计划（在页面上下文里取一张 pc：没车卡的故事用 `Game.Pc.defaults()`，**不**改页面状态）
const absorb = (w, raw) => w.eval(`(() => {
	const pc = (typeof State !== 'undefined' && State.variables && State.variables.pc) ? State.variables.pc : Game.Pc.defaults();
	const before = pc.gearHp === undefined ? undefined : JSON.stringify(pc.gearHp);
	const plan = Game.Combat.slotAbsorb(pc, ${raw});
	const after = pc.gearHp === undefined ? undefined : JSON.stringify(pc.gearHp);
	return { raw: ${raw}, plan: plan, gearHpWritten: before !== after };
})()`);

// ── 故事 1（`mist-forest`）：**未启用** ⇒ 判据 ①②④ ─────────────────────────────
{
	console.log('── 故事 1（未启用新机制）：显式降级 ＋ 旧口径');
	const { w, close } = await boot({ story: 'mist-forest', random: 0.5 });
	const mech = w.eval('window.Sg.story.mechanics()');
	ok('前提：故事 1 显式声明"未启用"（`mechanics()` 为 null，不是省略）', mech === null, JSON.stringify(mech));
	const plans = [1, 4, 7, 13, 20].map((raw) => absorb(w, raw));
	const r = judgeCompat({ enabled: false, plans });
	ok(`① 显式降级（slotAbsorb 一律 null）：${r.verdict}`, r.verdict === 'pass', r.msg);
	ok('④ 降级无副作用（纯函数，不写 `pc.gearHp`）', plans.every((p) => p.gearHpWritten === false));
	// ② 旧口径：flatDamageReduce 仍生效 ＋ 下限 1（这三行是 `#493` 迁移前要对上的数值）
	const dmg = (inv) => w.eval(`Game.Items.battleDamage(1, ${inv}, 0, false)`);
	const d0 = dmg('{}'), d1 = dmg('{ 日记: true }'), d2 = dmg('{ 日记: true, 龙鳞护臂: true }');
	ok(`② 旧减伤路径仍生效：第 1 回合 ${d0} → 1 件 ${d1}（−2）→ 2 件 ${d2}（−4，触下限）`, d0 === 5 && d1 === 3 && d2 === 1, `得 ${d0}/${d1}/${d2}`);
	ok('② 下限 1 不变（再叠道具也不低于 1）', dmg('{ 日记: true, 龙鳞护臂: true }') >= 1);
	close();
}

// ── 故事 2（`hollow-cave`）：**已启用** ⇒ 判据 ③（两态可辨：确实走了另一条路）──────────
{
	console.log('── 故事 2（已启用新机制）：slot 路径确实接管');
	const { w, close } = await boot({ story: 'hollow-cave', random: 0.5 });
	const mech = w.eval('window.Sg.story.mechanics()');
	ok('前提：故事 2 声明了机制（非 null）', mech !== null && typeof mech === 'object');
	const plans = [4, 7, 9].map((raw) => absorb(w, raw));
	const r = judgeCompat({ enabled: true, plans });
	ok(`③ 已启用 ⇒ 接管受击：${r.verdict}`, r.verdict === 'pass', r.msg);
	ok('④ 纯函数（返回计划，不在内部写 `pc.gearHp`）', plans.every((p) => p.gearHpWritten === false));
	close();
}

if (bad) { console.error(`\n✗ 兼容模式护栏未通过（${bad} 项）—— 未启用新机制时引擎必须**显式降级**，不许"0 减成"悄悄改平衡（#492）`); process.exit(1); }
console.log('\n✔ 兼容模式护栏通过（未启用 ⇒ 显式 null 降级 · 旧减伤口径不变 · 已启用 ⇒ slot 接管 · 纯函数）');
process.exit(0);
