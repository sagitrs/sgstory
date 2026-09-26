// ⓪y 部位×异常门（S2／`#487`）：每回合判定（恢复／恶化／受伤）
//
// **引擎门**（判据来自声明表，不读故事散文 → 第二故事能直接跑）：
// ① **每回合被动**：`perRound.hp` → 该部位扣 HP（走 S1 的减成/耐久，同一套）
// ② **每回合判定**：逐 (部位 × 异常) 各一次（属性/DC 由声明给，走注入 rng）→ 成功**恢复**（剩余 −1，到 0 清）
// ③ **失败分档**：低骰（d20 ≤ `statusLowRoll`=5）→ `low` 档；其余 → `most` 档（两档必须穷尽，`#459`）
// ④ **减成作用域**：`statusPenalty['异常@部位'].check` → 该部位判定减成
// ⑤ **解除**：`cureStatus(id)` 只清指定 · `clearStatuses()` 清全部（温泉）
// ⑥ **兼容降级**：`mechanics()` 为 `null` → `statusTick`／`tickStatuses` 返回 `null`（调用方跳过 → 零行为变化）
// ⑦ **声明面 ≤ 实现面**：`turns` 缺失／`perRound.hp` 非数字／`statusPenalty` 出现非 `check` 键／骰式非 `NdM` → 报错
//
// 用法：`node scripts/audit.mjs --status`（`--check` 为判定态）
import { mulberry32, asSugarRandom } from '../lib/rng.mjs';
import { requireCombatFace } from '../lib/shared.mjs';   // `#1269` 能力面守卫

export const flag = 'status';
export const flags = ['status'];

/** 纯函数：给「一回合计划 ＋ 声明」→ 违反项。**自证喂合成计划，真实运行喂引擎产物。** */
export const planViolations = ({ plan, mech, prev }) => {
	const out = [];
	if (!plan || !Array.isArray(plan.steps)) return ['计划缺 steps'];
	const allowed = (id) => (mech.statuses?.[id]?.parts === '*' ? (mech.hitLocations ?? []) : (mech.statuses?.[id]?.parts ?? []));
	for (const s of plan.steps) {
		if (!mech.statuses?.[s.id]) { out.push(`计划里出现未声明的异常「${s.id}」`); continue; }
		if (!allowed(s.id).includes(s.part)) out.push(`异常「${s.id}」落在不允许的部位「${s.part}」`);
		const before = prev?.[s.part]?.[s.id];
		if (s.kind === 'recover') {
			if (typeof before !== 'number') out.push(`恢复步骤「${s.id}@${s.part}」前并没有生效实例`);
			else if (s.turns !== before - 1) out.push(`恢复后剩余回合 ${s.turns} ≠ 生效值 ${before} − 1`);
		} else if (s.kind === 'fail') {
			const want = s.res?.roll <= 5 ? 'low' : 'most';
			if (s.grade !== want) out.push(`分档 ${s.grade} 与骰面 ${s.res?.roll} 不符（应为 ${want}）`);
			const kinds = ['damage', 'addStatus', 'none'];
			if (!kinds.includes(s.effect?.kind)) out.push(`效果形态未实现：${JSON.stringify(s.effect)}`);
			if (s.effect?.kind === 'damage' && !(s.effect.amount > 0)) out.push('伤害效果的 amount 不是正数');
			if (s.effect?.kind === 'addStatus') {
				if (!mech.statuses?.[s.effect.id]) out.push(`addStatus 指向未声明的异常「${s.effect.id}」`);
				if (!allowed(s.effect.id).includes(s.effect.part)) out.push(`addStatus 落在不允许的部位「${s.effect.part}」`);
			}
		} else out.push(`步骤 kind 未知：${JSON.stringify(s.kind)}`);
	}
	return out;
};

/** 合成声明表（**自证用**）：`流血`（任意部位、每回合 −1 HP、5 回合、体质 DC12）· `麻痹`（四肢、3 回合、判定 −3） */
const MECH = {
	hitLocations: ['衣服', '裤子', '头盔', '鞋', '手腕', '脖子'],
	slots: { body: { protects: '衣服', label: '衣服' } },
	equipment: { 布衣: { slot: 'body', maxHp: 3, reduce: { flat: 1 } } },
	statuses: {
		流血: { parts: '*', turns: 5, perRound: { hp: -1 }, check: { attr: 'con', dc: 12 },
			onFail: [{ when: 'most', harm: 'damage', dice: '1d4' }, { when: 'low', addStatus: 'random', part: 'random' }] },
		麻痹: { parts: ['手腕', '鞋'], turns: 3, check: { attr: 'con', dc: 12 },
			onFail: [{ when: 'most', harm: 'damage', dice: '1' }, { when: 'low', addStatus: 'random', part: 'random' }] },
	},
	statusPenalty: { '麻痹@手腕': { check: -3 } },
};

const PC = { gear: ['布衣'], gearHp: {}, abilities: { con: 10 }, skills: [], flags: {}, statuses: { 衣服: { 流血: 2 } } };

/** `#703`：**机制必须可被玩家看见**——S1 的耐久与 S2 的异常若没有任何渲染点，
 * "机制存在"对玩家等于不存在（反馈③："UI 上看不到装备状态和部位状态"）。
 * 判据（源码级、可反例）：侧栏渲染面（`StoryCaption` 所在文件）必须调用引擎的只读快照入口
 * `Game.Gear.gearDurability(`（C 块宿主）与 `Game.StatusFx.statusEntries(`（★B 块宿主，`#1452` 搬）。 */
export const visibilityProblems = (sidebarSrc) => {
	const src = String(sidebarSrc ?? '');
	if (!src.trim()) return [{ code: 'sidebar-src-missing', why: '取不到侧栏源码（`src/10-core.twee`）——本判据要读渲染面才能判' }];
	const out = [];
	if (!/Game\.Gear\.gearDurability\(/.test(src)) out.push({ code: 'gearhp-invisible', why: '侧栏没有渲染**装备耐久**（`Game.Gear.gearDurability(`）——S1 机制对玩家不可见（#703）' });
	if (!/Game\.StatusFx\.statusEntries\(/.test(src)) out.push({ code: 'status-invisible', why: '侧栏没有渲染**部位异常**（`Game.StatusFx.statusEntries(`）——S2 机制对玩家不可见（#703）' });
	return out;
};

/** `#747`（症状：减成靠**手写稀疏表** → 漏格没人看得见，`麻痹@手臂` 就是洞）：
 * **组合穷举** —— 对每个异常的**每一个允许部位**求一遍减成，并检查"只押了部分部位"的形态：
 * · 声明了 `perRound.penalty`（`{ value, scope:'part'}`）→ 覆盖**全部**允许部位 → 合规；
 * · 只有手写表且**少于**允许部位 → **报**（要么改声明覆盖全部，要么把剩下的 0 也显式写出来）。
 * 返回值里带矩阵（`cells`），便于门把"显式 0 与漏格"分开报。 */
export const penaltyCoverageProblems = (id, st, mech) => {
	const allowed = st?.parts === '*' ? (mech?.hitLocations ?? []) : (st?.parts ?? []);
	const derived = st?.perRound?.penalty;
	// `#747`：报表必须**扣掉 `only`** —— 否则"只压躯干"会被读成"全身 −1"（报表骗人比没有报表更糟）
	const inOnly = (p) => !derived?.only || derived.only.includes(p);
	const cells = allowed.map((p) => ({
		part: p,
		src: derived ? (inOnly(p) ? 'declared' : 'declared·不在 only') : (mech?.statusPenalty?.[`${id}@${p}`] ? 'table' : 'none'),
		value: derived ? (inOnly(p) ? derived.value : 0) : (mech?.statusPenalty?.[`${id}@${p}`]?.check ?? 0),
	}));
	if (derived) {
		// `#747`：`only` ＝ 有意只押某几格（必须 ⊆ 允许部位；越界由引擎 fail-loud）→ 不算漏格
		const badOnly = (derived.only ?? []).filter((p2) => !allowed.includes(p2));
		return { cells, problems: badOnly.length ? [{ id, why: `penalty.only 里的 ${badOnly.join('、')} 不在允许部位（${allowed.join('、')}）内` }] : [] };
	}
	const declared = cells.filter((c) => c.src === 'table');
	if (declared.length && declared.length < allowed.length) {
		return { cells, problems: [{ id, why: `减成只押在 ${declared.map((c) => c.part).join('、')}，而允许部位是 ${allowed.join('、')} ⇒ **漏格**（${cells.filter((c) => c.src === 'none').map((c) => c.part).join('、')} 没有值）——要么改 \`perRound.penalty\` 覆盖全部允许部位，要么把 0 也显式写出来` }] };
	}
	return { cells, problems: [] };
};

export const run = (ctx) => {
	// `#1269`：**能力面就绪守卫** —— 故事未声明该能力面时，自证格里的裸调
	// `Game.Combat.*` 会抛 TypeError（不点名缺什么）。缺面 → **点名并跳过自证**
	//（判据本体不动：缺面时那部分本就无样本可判；补齐声明后自证照跑）。
	const { Game, arg, wantAll } = ctx;
	// `#1269`（两席 RC 修）：能力面就绪**走权威 `requireCombatFace`**（不许各处再内联一份），
	// 且**检测必须在解构之后** —— 此前"检测在前" → 函数体内对后置 const 求 typeof 抛 TDZ
	// → 被自己的 try/catch 吞 → 一律 false → **本门自证被整门吞掉**（rc=0、零判定  ）。
	const __fn = requireCombatFace(Game, 'statusTick');
	// **两态能假格（常驻）**：就绪与缺席必须给出不同判定；否则等于"门在跑但零判定"。
	{
		// ★ `#1452`（T 的阻断，裁＝甲）：**守卫锚跟着搬家** —— B 块把 `statusTick` 搬到 `Game.StatusFx`
		//   ⇒ 本格必须按**新宿主**喂（✗ 仍喂 `Combat` ⇒ 与真相不符 ⇒ 自证变装饰 ✗ 实测就是这条当场红 ✓）
		const readyInj = requireCombatFace({ StatusFx: { 'statusTick': () => null } }, 'statusTick') !== null;
		const absentInj = requireCombatFace({ StatusFx: {} }, 'statusTick') === null;
		// ★**能假（映射锚的牙）**：把方法喂到**旧宿主**（`Combat`）⇒ 必须 **null**
		//   （✗ 不许「两个宿主都认」 —— 那会让「搬家后锚忘改」重新变成**静默通过** ✗）
		const movedAway = requireCombatFace({ Combat: { 'statusTick': () => null } }, 'statusTick') === null;
		if (!movedAway) {
			console.error("  ✗ 映射锚失效：`statusTick` 在**旧宿主** `Combat` 上仍被认到 ⇒ 搬家后锚忘改也看不出来 ✗（`#1452`）");
			return 1;
		}
		if (!(readyInj && absentInj)) {
			console.error(`  ✗ 守卫两态不可分（就绪=${readyInj}／缺席=${absentInj}）⇒ 本门可能在"零判定"下报绿（#1269）`);
			return 1;
		}
	}
	if (!__fn) {
		console.log('  #1269 缺少能力面声明（Sg.story.mechanics() 未启用／未列出）⇒ 本门自证跳过（判据本体不变）');
		return 0;
	}
	const Sg = ctx.window?.Sg;
	if (!wantAll && !arg('status')) return;
	console.log('\n══ ⓪y 部位×异常门（S2/#487）——每回合判定：恢复／恶化／受伤 ══');
	let bad = 0;
	// `#1151`：**自证格**的计数单列（格红＝本门失能；与「判据发现」语义不同 → 分开记）
	let selfBad = 0;
	const t = (label, ok, extra = '') => { if (ok) console.log(`      ✓ ${label}`); else { bad++; console.error(`      ✗ ${label}${extra ? '：' + extra : ''}`); } };
	const saved = Sg.story.mechanics;
	//注意：注入的恒值必须**遵守 `d(n)` 契约**（返回 1..n）——`() => v` 在 `d(2)` 时会给出 2 以上的值，
	// 那是**夹具自身**越界（实测踩到一次）。这里统一夹上界，把"骰面固定"与"取值合法"分开。
	const rngAt = (Game2, v) => { Game2.Rules.rng.set((lo, hi) => Math.min(hi, Math.max(lo, v))); };
	const clone = (pc) => JSON.parse(JSON.stringify(pc));

	try {
		// ── ⑥ 兼容降级 ──
		Sg.story.mechanics = () => null;
		t('⑥ 未启用（`mechanics()` 为 null）⇒ `statusTick` 返回 `null`（调用方跳过）', Game.StatusFx.statusTick(PC) === null);
		t('⑥ 未启用 ⇒ `tickStatuses` 也返回 `null`（不写状态、不产伤害）', Game.StatusFx.tickStatuses(clone(PC)) === null);
		t('⑥ 未启用 ⇒ `applyStatus` 返回 `null`（不静默施加）', Game.StatusFx.applyStatus(PC, '流血', '衣服') === null);

		// ── ① 每回合被动 ＋ ② 恢复 ＋ ③ 分档（真跑引擎，注入 rng 控骰）──
		Sg.story.mechanics = () => MECH;
		{
			const pc = clone(PC);                       // 衣服 流血 2 回合
			rngAt(Game, 20);                            // 恒 20 → 判定必成 → 走「恢复」分支
			const plan = Game.StatusFx.statusTick(pc);
			Game.Rules.rng.reset();
			t('② 必成骰（20）⇒ 恢复：剩余 2 → 1', plan.steps.length === 1 && plan.steps[0].kind === 'recover' && plan.steps[0].turns === 1, JSON.stringify(plan.steps[0]));
			t('① 计划里带上每回合被动（`perRound: -1`）', plan.steps[0].perRound === -1, JSON.stringify(plan.steps[0].perRound));
			t('判据自检：合规计划不报违反项', planViolations({ plan, mech: MECH, prev: pc.statuses }).length === 0, planViolations({ plan, mech: MECH, prev: pc.statuses }).join(' / '));

			// 落：被动 −1（无护具部位 → 全额落 HP）＋ 恢复
			const applied = Game.StatusFx.statusTickApply(clone(PC), plan);
			t('① 被动伤害走 S1：衣服有护具（reduce 1）⇒ perRound 1 点被吃住 ⇒ hurt=0', applied.hurt === 0 && applied.statuses.衣服.流血 === 1, JSON.stringify({ hurt: applied.hurt, statuses: applied.statuses }));
			const pcBare = clone(PC); pcBare.gear = [];    // 无护具 → 全额落 HP
			const applied2 = Game.StatusFx.statusTickApply(pcBare, plan);
			t('① 无护具 ⇒ 被动伤害全落 HP（hurt=1）', applied2.hurt === 1, JSON.stringify(applied2.hurt));

			// 到 0 → 清除
			const pc1 = clone(PC); pc1.statuses = { 衣服: { 流血: 1 } };
			rngAt(Game, 20);
			const plan1 = Game.StatusFx.statusTick(pc1);
			const ap1 = Game.StatusFx.statusTickApply(pc1, plan1);
			Game.Rules.rng.reset();
			t('② 剩余 1 ⇒ 恢复后清除（`statuses` 里不留空壳）', ap1.statuses.衣服 === undefined, JSON.stringify(ap1.statuses));

			// 低骰失败 → `low` 档 → 随机他异常（部位合法）
			rngAt(Game, 3);                              // d20=3 → 失败且 ≤5 → low
			const planLow = Game.StatusFx.statusTick(clone(PC));
			Game.Rules.rng.reset();
			const st = planLow.steps[0];
			t('③ 低骰（3）⇒ `low` 档 ⇒ 随机他异常（落在声明允许的部位）', st.kind === 'fail' && st.grade === 'low' && st.effect.kind === 'addStatus' && st.effect.id === '麻痹' && ['手腕', '鞋'].includes(st.effect.part), JSON.stringify(st));
			t('判据自检：合规的 low 步不报', planViolations({ plan: planLow, mech: MECH, prev: PC.statuses }).length === 0, planViolations({ plan: planLow, mech: MECH, prev: PC.statuses }).join(' / '));

			// 高骰失败 → `most` 档 → 伤害（经 S1 减成/耐久）
			rngAt(Game, 8);                              // d20=8 → 失败但 >5 → most
			const planMost = Game.StatusFx.statusTick(clone(PC));
			Game.Rules.rng.reset();
			const sm = planMost.steps[0];
			t('③ 非低骰失败（8）⇒ `most` 档 ⇒ 伤害（骰式已解成正数）', sm.kind === 'fail' && sm.grade === 'most' && sm.effect.kind === 'damage' && sm.effect.amount >= 1, JSON.stringify(sm));
			const apMost = Game.StatusFx.statusTickApply(clone(PC), planMost);
			t('③ 该伤害同走 S1：衣服护具吸住（hurt ≤ 伤害）', apMost.hurt <= sm.effect.amount, JSON.stringify({ hurt: apMost.hurt, amount: sm.effect.amount }));

			// ④ 减成作用域：手腕有 麻痹 → 判定 bonus −3
			const pcPen = clone(PC); pcPen.statuses = { 手腕: { 麻痹: 2 } };
			t('④ `statusPenalty[' + "'麻痹@手腕'" + '].check = −3` ⇒ 该部位判定减成 −3', Game.StatusFx.statusPenaltyFor(pcPen, '手腕') === -3, String(Game.StatusFx.statusPenaltyFor(pcPen, '手腕')));
			t('④ 别的部位不受影响（作用域＝该部位）', Game.StatusFx.statusPenaltyFor(pcPen, '衣服') === 0, String(Game.StatusFx.statusPenaltyFor(pcPen, '衣服')));
			rngAt(Game, 12);                             // 12 + 0 = 12 ≥ 12 本应过；带上 −3 → 9 < 12 → 失败
			const planPen = Game.StatusFx.statusTick(pcPen);
			Game.Rules.rng.reset();
			t('④ 减成真的进了判定（12+0 ≥ DC12 本应恢复，−3 后失败）', planPen.steps[0].kind === 'fail' && planPen.steps[0].res.mod === -3, JSON.stringify(planPen.steps[0].res));

			// ⑤ 解除
			const pc5 = clone(PC); pc5.statuses = { 衣服: { 流血: 3, 麻痹: 1 }, 手腕: { 麻痹: 2 } };
			const cured = Game.StatusFx.cureStatus(pc5, '流血');
			t('⑤ `cureStatus("流血")` 只清该异常（其他部位/异常留存）', !cured.statuses.衣服.流血 && cured.statuses.衣服.麻痹 === 1 && cured.statuses.手腕.麻痹 === 2, JSON.stringify(cured.statuses));
			t('⑤ `clearStatuses()` 清全部（温泉）', Object.keys(Game.StatusFx.clearStatuses().statuses).length === 0);

			// 骰式：两种形态都认（纯整数＝固定值；NdM 走 rng）
			rngAt(Game, 3);
			const dInt = Game.Combat.rollDice('2');
			const dDice = Game.Combat.rollDice('2d4');
			Game.Rules.rng.reset();
			t('骰式：`2` ⇒ 固定 2；`2d4` ⇒ 2 次 d4（注入 3 ⇒ 6）', dInt === 2 && dDice === 6, JSON.stringify({ dInt, dDice }));

			// ⑦ 声明面 ≤ 实现面（四种形态各报一次错）
			const badCases = [
				['`turns` 缺失', () => { const m = { ...MECH, statuses: { ...MECH.statuses, 流血: { ...MECH.statuses.流血, turns: undefined } } }; return [m, () => Game.StatusFx.statusTick(clone(PC))]; }],
				['`perRound.hp` 非数字', () => { const m = { ...MECH, statuses: { ...MECH.statuses, 流血: { ...MECH.statuses.流血, perRound: { hp: 'x' } } } }; return [m, () => Game.StatusFx.statusTick(clone(PC))]; }],
				['`statusPenalty` 出现非 `check` 键', () => { const m2 = { ...MECH, statusPenalty: { '麻痹@手腕': { dmg: -1 } } }; return [m2, () => Game.StatusFx.statusPenaltyFor({ statuses: { 手腕: { 麻痹: 1 } } }, '手腕', m2)]; }],
				// `#702`：`NdM±K` 现在是**合法**骰式（伤害骰＋属性调整）→ 反例改用仍非法的形态
				['骰式不是 `N`／`NdM`／`NdM±K`', () => [MECH, () => Game.Combat.rollDice('1d4+2d6')]],
			];
			for (const [label, mk] of badCases) {
				const [m, fn] = mk();
				Sg.story.mechanics = () => m;
				rngAt(Game, 8);
				let msg = '';
				try { fn(); } catch (e) { msg = String(e.message); } finally { Game.Rules.rng.reset(); }
				t(`⑦ ${label} ⇒ 大声报错`, msg.length > 0, msg || '（没有报错）');
				Sg.story.mechanics = () => MECH;
			}
		}

		// ── 自证（4 类反例：合成计划必须被判出）──
		{
			const base = { mech: MECH, prev: { 衣服: { 流血: 2 } } };
			const ok = { ...base, plan: { steps: [{ part: '衣服', id: '流血', turns: 1, kind: 'recover', perRound: -1, res: { roll: 20 } }] } };
			// `#703`：机制可见性（**独立循环**——它判的是"渲染面有没有引用"，不是 plan 违反项）
			{
				const visCases = [
					['#703 正例：侧栏渲染了装备耐久与部位异常 ⇒ 不报', '行囊 <<set _gh to Game.Gear.gearDurability($pc)>> <<set _st to Game.StatusFx.statusEntries($pc)>>', 0],
					['🔴 #703 反例：删掉装备耐久渲染 ⇒ 报', '<<set _st to Game.StatusFx.statusEntries($pc)>>', 1],
					['🔴 #703 反例：删掉部位异常渲染 ⇒ 报', '<<set _gh to Game.Gear.gearDurability($pc)>>', 1],
					['#703 反例：取不到侧栏源码 ⇒ 报（不静默判过）', '', 1],
				];
				for (const [label, src, want] of visCases) {
					const got = visibilityProblems(src);
					const okk = want === 0 ? got.length === 0 : got.length >= want;
					console.log(`      ${okk ? '✓' : '✗'} 自证·${label}：检出 ${got.length}（期望 ${want === 0 ? 0 : '≥' + want}）`);
					if (!okk) selfBad++;
				}
			}
			const cases = [
				['正例：合规计划不报', ok, 0],
				['反例①：恢复后回合数不对', { ...base, plan: { steps: [{ ...ok.plan.steps[0], turns: 7 }] } }, 1],
				['反例②：异常落在不允许的部位（用 `parts` 受限的「麻痹」：脖子不在四肢里）', { ...base, plan: { steps: [{ part: '脖子', id: '麻痹', kind: 'recover', turns: 1, perRound: 0, res: { roll: 20 } }] } }, 2],
				['反例③：分档与骰面不符', { ...base, plan: { steps: [{ part: '衣服', id: '流血', kind: 'fail', grade: 'most', res: { roll: 3 }, perRound: -1, effect: { kind: 'damage', amount: 2 } }] } }, 1],
				['反例④：效果形态未实现', { ...base, plan: { steps: [{ part: '衣服', id: '流血', kind: 'fail', grade: 'most', res: { roll: 8 }, perRound: -1, effect: { kind: 'teleport' } }] } }, 1],
			];
			for (const [label, input, want] of cases) {
				const got = planViolations(input);
				const okk = want === 0 ? got.length === 0 : got.length >= want;
				console.log(`      ${okk ? '✓' : '✗'} 自证·${label}：检出 ${got.length}（期望 ${want === 0 ? 0 : '≥' + want}）`);
				if (!okk) selfBad++;
			}
		}

		// ── `#747` 自证：组合穷举（**旧形态必红**：只押一个部位 → 漏格；声明 `perRound.penalty` → 合规）──
		{
			const covCases = [
				['`#747` 正例：声明 `perRound.penalty` ⇒ 覆盖全部允许部位，不报',
					penaltyCoverageProblems('麻痹', { parts: ['手腕', '鞋'], perRound: { penalty: { value: -2, scope: 'part' } } }, MECH).problems.length, 0],
				['🔴 `#747` 反例（**实测的旧形态**）：手写表只押「手腕」而允许部位有「手腕／鞋」⇒ 报漏格',
					penaltyCoverageProblems('麻痹', { parts: ['手腕', '鞋'] }, MECH).problems.length, 1],
				['`#747` 边界：`parts: \'*\'` ＋ 手写表只押一个 ⇒ 也算漏格（任意部位＝全部部位）',
					penaltyCoverageProblems('流血', { parts: '*' }, { hitLocations: ['衣服', '裤子'], statusPenalty: { '流血@衣服': { check: -1 } } }).problems.length, 1],
			];
			for (const [label, got, want] of covCases) {
				const okk = got === want;
				console.log(`      ${okk ? '✓' : '✗'} 自证·${label}：检出 ${got}（期望 ${want}）`);
				if (!okk) selfBad++;
			}
		}
	} finally {
		Sg.story.mechanics = saved;
		Game.Rules.rng.reset();
	}

	// `#703`：**机制必须可被玩家看见**——侧栏（`StoryCaption`）必须渲染装备耐久与部位异常
	//（两者此前全仓零渲染；反馈③）。判据看的是**渲染面**，不是状态里有没有数据。
	{
		const sidebar = ctx.passageSrc?.get('StoryCaption') ?? '';
		for (const p of visibilityProblems(sidebar)) { console.log(`  ✗ 机制可见性：${p.why}`); bad++; }
	}

	// `#747`：**真实声明面的组合穷举**（矩阵逐格报出来 ＋ 漏格判红）——
	// 为什么放在最后：前面那段在 `try` 里注过合成 `MECH`，此时已由 `finally` 还回故事自己的声明。
	{
		const mech = Sg?.story?.mechanics?.() ?? null;
		if (mech) {
			for (const [id, st] of Object.entries(mech.statuses ?? {})) {
				const { cells, problems } = penaltyCoverageProblems(id, st, mech);
				console.log(`  · 减成矩阵 ${id}（${st.label ?? id}）：${cells.map((c) => `${c.part} ${c.value}［${c.src}］`).join(' · ')}`);
				for (const p of problems) { console.log(`  ✗ #747 减成漏格：${p.why}`); bad++; }
			}
		}
	}

	bad += selfBad;
	// `#1151`（同 `#1149`／`#1150`）⭐ **自证格的红必须进退出码** —— 格级属性，**不依赖 `process.argv`**
	//注意：与「判据发现」**分开报**：本条语义是「**本门自身失能**」，不是「故事数据/内容有问题」
	if (selfBad) {
		console.error(`\n✗ ⓪y 部位×异常门：**自证格**红 ${selfBad} 项 ⇒ **本门自身失能**（不是判据发现 ✗）—— 请修本门再跑 ✓（\`#1151\`）`);
		process.exit(1);
	}
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ ⓪y 部位×异常门：${bad} 项`); process.exit(1); }
		console.log('\n✔ 部位×异常门通过（被动 · 判定恢复 · 失败分档 · 减成作用域 · 解除 · 兼容降级 · 声明面≤实现面 · 机制可见性 #703）');
	}
};
