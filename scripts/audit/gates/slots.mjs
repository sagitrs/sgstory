// ⓪x 槽位与耐久门（S1／`#486`）：部位 · 减成 · 耐久 · 损坏
//
// **引擎门**（`test-plan.mjs` 的 `AUDIT_ENGINE`）：判据与**故事散文无关** —— 输入是
// `Sg.story.mechanics()` 的**声明表**（`hitLocations`／`slots[*].protects`／`equipment[*]`），
// 换故事只换输入 ⇒ 第二个故事能直接跑（这正是 `#441-F` 要的）。
//
// 判据：
//   ① **两态语义**：有护具的部位 ⇒ 按声明减成 ＋ 该件**耐久吸伤** ＋ 溢出落 HP；
//      无护具 ⇒ **全额**落 HP（"无装备⇒无减成"不许被破）；
//   ② **分布口径**：部位命中逐部位 ≈ `1/|hitLocations|`（注入种子流，±容差）；吸伤量 ≡ `min(剩余耐久, 减成后伤害)`；
//      损坏阈值 ＝ `maxHp` 被扣尽即损坏，且**损坏后不再减成/吸伤**；
//   ③ **兼容模式**：`mechanics()` 为 `null` ⇒ `slotAbsorb` 返回 `null` ⇒ 调用方原样返回（`#492` 显式降级）；
//      该契约另有 `audit:golden` **逐字节一致**作证（故事 1 未启用 ⇒ 零行为变化）。
//   4. **声明面 ≤ 实现面**：`reduce` 形态不在实现集（`REDUCE_FORMS`）里 ⇒ 机制**大声报错**（不许静默 0 减成）。
//
// 用法：`node scripts/audit.mjs --slots`（`--check` 为判定态）
import { mulberry32, asSugarRandom } from '../lib/rng.mjs';
import { REDUCE_FORMS } from '../lib/story-shape.mjs';

export const flag = 'slots';
export const flags = ['slots'];

/** 纯函数：给「一次受击的输入 ＋ 引擎给的计划」⇒ 违反项。**自证喂合成计划，真实运行喂引擎产物。**
 *  @param {{raw:number, plan:object, gearHpBefore:number, declaredReduce:number}} o */
export const violations = ({ raw, plan, gearHpBefore, declaredReduce }) => {
	const out = [];
	if (!plan || typeof plan !== 'object') return ['没有拿到计划（机制未返回对象）'];
	if (plan.gear === null) {
		if (plan.reduce !== 0) out.push(`无护具却有减成 ${plan.reduce}（"无装备⇒无减成"被破）`);
		if (plan.absorbed !== 0) out.push(`无护具却吸了 ${plan.absorbed} 点伤`);
		if (plan.toHp !== raw) out.push(`无护具时落 HP ${plan.toHp} ≠ 原始伤害 ${raw}（悄悄减成）`);
		return out;
	}
	if (gearHpBefore <= 0) {   // 已损坏
		if (plan.reduce !== 0) out.push(`已损坏的装备仍在减成（${plan.reduce}）`);
		if (plan.absorbed !== 0) out.push(`已损坏的装备仍在吸伤（${plan.absorbed}）`);
		if (plan.toHp !== raw) out.push(`已损坏时落 HP ${plan.toHp} ≠ 原始伤害 ${raw}`);
		return out;
	}
	if (plan.reduce !== declaredReduce) out.push(`减成 ${plan.reduce} ≠ 声明的 ${declaredReduce}（引擎没按声明取值）`);
	const after = Math.max(0, raw - plan.reduce);
	const want = Math.min(gearHpBefore, after);
	if (plan.absorbed !== want) out.push(`吸伤 ${plan.absorbed} ≠ min(剩余耐久 ${gearHpBefore}, 减成后伤害 ${after}) = ${want}`);
	if (plan.toHp !== after - plan.absorbed) out.push(`落 HP ${plan.toHp} ≠ 溢出量 ${after - plan.absorbed}`);
	if (plan.gearHp !== gearHpBefore - plan.absorbed) out.push(`剩余耐久 ${plan.gearHp} ≠ ${gearHpBefore} − 吸伤 ${plan.absorbed}`);
	if (plan.broke !== (plan.gearHp <= 0)) out.push(`损坏标记 ${plan.broke} 与剩余耐久 ${plan.gearHp} 不一致`);
	return out;
};

/** 合成声明表（**自证用**，与故事无关）：6 个部位、其中 3 个有护具、1 个已损坏场景、另留无护具部位。 */
const MECH = {
	hitLocations: ['衣服', '裤子', '头盔', '鞋', '手腕', '脖子'],
	slots: {
		body: { protects: '衣服', label: '衣服' },
		legs: { protects: '裤子', label: '裤子' },
		head: { protects: '头盔', label: '头盔' },
	},
	equipment: {
		布衣: { slot: 'body', maxHp: 3, reduce: { flat: 1 } },
		护胫: { slot: 'legs', maxHp: 2, reduce: { flat: 1 } },
		铁盔: { slot: 'head', maxHp: 1, reduce: { flat: 2 } },
	},
};
/** 合成 pc：只带「布衣」（保护衣服）。 */
const PC = { gear: ['布衣'], gearHp: {} };

const hit = (Game, mech, idx, pc = PC, raw = 2) => {
	// 注入"恒出 idx+1"的种子流 ⇒ 部位可确定：`d(n) = _impl(1,n)` ⇒ 返回 idx+1 即命中 hitLocations[idx]
	Game.Rules.rng.set(() => idx + 1);
	try { return Game.Combat.slotAbsorb(pc, raw); } finally { Game.Rules.rng.reset(); }
};

/** `#704`（症状：`log.foe.slots` 有数据但渲染面从不引用 ⇒ 玩家看不到"打在哪、被哪件吸了多少、哪件快坏了"）：
 *  判据两条 ——
 *   ① `<<fightlog>>` 的源码里必须出现 `slots`（渲染面**引用**了这份数据）；
 *   ② 且必须有**显式的缺席分支**（`<<if … slots>>`）—— 否则未启用槽位的故事会走成"打印 undefined"
 *      （那是最难抓的假绿：看起来有渲染，实际是空行/问号）。 */
export const rendererProblems = (src) => {
	const out = [];
	const text = String(src ?? '');
	if (!text) { out.push({ why: '取不到 `fightlog` 源码（不静默判过）' }); return out; }
	if (!/slots/.test(text)) out.push({ why: '渲染面**没有引用** `log.foe.slots` ⇒ 受击明细玩家看不见（数据在、显示不在）' });
	if (!/<<if\s+_L\.foe\.slots>>/.test(text)) out.push({ why: '缺少**显式的缺席分支**（`<<if _L.foe.slots>>`）⇒ 未启用槽位的故事会打印空行/`undefined`（假绿）' });
	return out;
};

export const run = (ctx) => {
	const { Game, arg, wantAll } = ctx;
	const Sg = ctx.window?.Sg;
	if (!wantAll && !arg('slots')) return;
	console.log('\n══ ⓪x 槽位与耐久门（S1/#486）——部位 · 减成 · 耐久吸伤 · 损坏 ══');
	const bad0 = 0;
	let bad = bad0;
	// `#1151`：**自证格**的计数单列（格红＝本门失能；与「判据发现」语义不同 ⇒ 分开记 ✓）
	let selfBad = 0;
	const t = (label, ok, extra = '') => { if (ok) console.log(`      ✓ ${label}`); else { bad++; console.error(`      ✗ ${label}${extra ? '：' + extra : ''}`); } };
	const saved = Sg.story.mechanics;

	try {
		// ── ⓪ 兼容模式：未启用 ⇒ `null`（调用方原样返回）──
		Sg.story.mechanics = () => null;
		t('③ 未启用（`mechanics()` 为 null）⇒ `slotAbsorb` 返回 `null`（调用方原样返回＝零行为变化）', Game.Combat.slotAbsorb(PC, 5) === null);
		t('③ 未启用 ⇒ `repairAll` 也返回 `null`（不产生"隐形修复"）', Game.Combat.repairAll(PC) === null);

		// ── ① 两态语义（真跑引擎，判据走 `violations`）──
		Sg.story.mechanics = () => MECH;
		{
			const p = hit(Game, MECH, 0, { gear: ['布衣'], gearHp: {} }, 2);   // 衣服（有 布衣，reduce 1）
			t('① 有护具：减成 ＋ 吸伤 ＋ 溢出 三条同时成立', violations({ raw: 2, plan: p, gearHpBefore: 3, declaredReduce: 1 }).length === 0,
				violations({ raw: 2, plan: p, gearHpBefore: 3, declaredReduce: 1 }).join(' / '));
			t('① 有护具（具体值）：raw2 − 减成1 ⇒ 吸 1 · 落 HP 0 · 耐久 3→2', p.reduce === 1 && p.absorbed === 1 && p.toHp === 0 && p.gearHp === 2, JSON.stringify(p));

			const q = hit(Game, MECH, 4, { gear: ['布衣'], gearHp: {} }, 3);   // 手腕（**无护具**）
			t('① 无护具：**全额**落 HP（无减成、无吸伤）', q.gear === null && q.toHp === 3 && q.absorbed === 0,
				violations({ raw: 3, plan: q, gearHpBefore: 0, declaredReduce: 0 }).join(' / ') || JSON.stringify(q));

			const over = hit(Game, MECH, 0, { gear: ['布衣'], gearHp: { 布衣: 3 } }, 10);   // 溢出：raw10 −1 = 9 > 耐久 3
			t('① 溢出量落 HP：raw10 − 减成1 ⇒ 吸 3（耐久用尽）· 落 HP 6 · 标记损坏', over.absorbed === 3 && over.toHp === 6 && over.gearHp === 0 && over.broke === true, JSON.stringify(over));
		}

		// ── ② 分布口径与阈值（真跑引擎）──
		{
			// 部位命中：20 项 × 20000 次 ⇒ 每项频率 ≈ 1/20（±1.5%）
			const parts = Array.from({ length: 20 }, (_, i) => `P${i}`);
			const big = { hitLocations: parts, slots: {}, equipment: {} };
			Sg.story.mechanics = () => big;
			Game.Rules.rng.set(asSugarRandom(mulberry32(20260913)));
			const cnt = new Map();
			const N = 20000;
			try { for (let i = 0; i < N; i++) { const s = Game.Combat.slotAbsorb(PC, 0); cnt.set(s.part, (cnt.get(s.part) ?? 0) + 1); } }
			finally { Game.Rules.rng.reset(); }
			const want = N / parts.length;
			// 容差按**二项分布**定，不是拍脑袋：n=20000、p=1/20 ⇒ σ=√(n·p·(1−p))≈30.8 次 ⇒ 3σ≈92 次（9.2%）。
			// （初版我写 1.5%——实测最大偏差 6.5% 就被判红；那是**正常采样波动**（20 桶取最大 ~2σ），不是偏置。）
			const prob = 1 / parts.length;
			const sigma = Math.sqrt(N * prob * (1 - prob));   // ≈ 30.8 次
			const worstAbs = Math.max(...parts.map((p) => Math.abs((cnt.get(p) ?? 0) - want)));
			t(`② 部位命中分布：20 项 × ${N} 次 ⇒ 最大偏差 ${worstAbs} 次（${(worstAbs / want * 100).toFixed(2)}%）≤ 3σ（${(3 * sigma).toFixed(0)} 次）`, worstAbs <= 3 * sigma);
			// 可复算：同一种子再跑一遍 ⇒ 直方图逐项相同（这才是"分布口径可复算"的硬证据）
			Game.Rules.rng.set(asSugarRandom(mulberry32(20260913)));
			const cnt2 = new Map();
			try { for (let i = 0; i < N; i++) { const s2 = Game.Combat.slotAbsorb(PC, 0); cnt2.set(s2.part, (cnt2.get(s2.part) ?? 0) + 1); } }
			finally { Game.Rules.rng.reset(); }
			t('② 同种子两次 ⇒ 直方图逐项一致（可复算）', parts.every((p) => cnt.get(p) === cnt2.get(p)));
			t(`② 每个部位都被抽到（无"永远打不到"的槽位）`, parts.every((p) => (cnt.get(p) ?? 0) > 0));

			// 阈值：布衣 maxHp 3 ⇒ 连打 3 次（每次吸 1）后损坏；第 4 次不再减成
			Sg.story.mechanics = () => MECH;
			const pc = { gear: ['布衣'], gearHp: {} };
			const seen = [];
			for (let i = 0; i < 4; i++) { const s = hit(Game, MECH, 0, pc, 2); pc.gearHp = { ...(pc.gearHp ?? {}), 布衣: s.gearHp }; seen.push(s); }
			t('② 损坏阈值：护具 maxHp=3 ⇒ 第 3 次后损坏', seen[2].gearHp === 0 && seen[2].broke === true, JSON.stringify(seen.map((s) => s.gearHp)));
			t('② 损坏后不再减成/吸伤（第 4 次全额落 HP）', seen[3].reduce === 0 && seen[3].absorbed === 0 && seen[3].toHp === 2, JSON.stringify(seen[3]));
			t('② 损坏态下 `violations` 也认（gearHpBefore=0 分支）', violations({ raw: 2, plan: seen[3], gearHpBefore: 0, declaredReduce: 1 }).length === 0);

			// 判定失败的耐久扣减：掷骰 −1/−2（注 1 ⇒ −1；注 2 ⇒ −2），不设"直接损坏"档
			Game.Rules.rng.set(() => 1);
			const w1 = Game.Combat.gearWear({ gear: ['布衣'], gearHp: {} }, '布衣');
			Game.Rules.rng.reset();
			Game.Rules.rng.set(() => 2);
			const w2 = Game.Combat.gearWear({ gear: ['布衣'], gearHp: {} }, '布衣');
			Game.Rules.rng.reset();
			t('② `gearWear` 掷骰 −1/−2（两颗骰面各一例）', w1.loss === 1 && w2.loss === 2 && w2.from === 3 && w2.to === 1, JSON.stringify([w1, w2]));
			const rep = Game.Combat.repairAll({ gear: ['布衣'], gearHp: { 布衣: 0 } });
			t('② 温泉 `repairAll` ⇒ 满耐久表（v1 唯一修复点）', rep && rep.布衣 === 3, JSON.stringify(rep));

			// 4. 声明面 ≤ 实现面：形态不在实现集 ⇒ 报错
			let msg = '';
			Sg.story.mechanics = () => ({ ...MECH, equipment: { 布衣: { slot: 'body', maxHp: 3, reduce: { dice: '1d4' } } } });
			try { hit(Game, MECH, 0, { gear: ['布衣'], gearHp: {} }, 2); } catch (e) { msg = String(e.message); }
			t('4. 未实现的减成形态（`dice`）⇒ 机制大声报错（不许静默 0 减成）', msg.includes('未实现'), msg || '（没有报错）');
			t('4. 实现集与声明枚举一致（`REDUCE_FORMS` 就是实现面）', REDUCE_FORMS.every((f) => f === 'flat'), REDUCE_FORMS.join('/'));
		}

		// ── 自证（4 类反例：合成计划必须被判出）──
		{
			const base = { raw: 2, plan: { part: '衣服', gear: '布衣', reduce: 1, absorbed: 1, toHp: 0, gearHp: 2, broke: false }, gearHpBefore: 3, declaredReduce: 1 };
			const cases = [
				['正例：合规计划不报', { ...base }, 0],
				['反例①：无护具却减成（悄悄减成）', { ...base, plan: { ...base.plan, gear: null, reduce: 1 } }, 3],
				['反例②：吸伤量不对（不是 min(耐久, 减成后伤害)）', { ...base, plan: { ...base.plan, absorbed: 5 } }, 3],
				['反例③：损坏后仍吸伤', { ...base, gearHpBefore: 0, plan: { ...base.plan, absorbed: 1 } }, 3],
				['反例④：减成不等于声明值（引擎没按声明取值）', { ...base, plan: { ...base.plan, reduce: 9 } }, 2],
				['反例⑤：损坏标记与剩余耐久不一致', { ...base, plan: { ...base.plan, gearHp: 0, broke: false } }, 2],
			];
			for (const [label, input, want] of cases) {
				const got = violations(input);
				const ok = want === 0 ? got.length === 0 : got.length >= want;
				console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：检出 ${got.length}（期望 ${want === 0 ? 0 : '≥' + want}）`);
				if (!ok) selfBad++;
			}
		}
	} finally {
		Sg.story.mechanics = saved;
		Game.Rules.rng.reset();
	}

	// `#704`：渲染面（`fightlog`）必须引用 `slots` ＋ 显式缺席分支
	{
		const cases = [
			['正例：引用 `slots` 且有缺席分支 ⇒ 不报',
				rendererProblems('<<if _L.foe>><<if _L.foe.slots>><<print _L.foe.slots.part>><</if>><</if>>').length, 0],
			['🔴 反例：删掉渲染（不引用 `slots`）⇒ 报**两条**（缺引用 ＋ 缺缺席分支）',
				rendererProblems('<<if _L.foe>><<print _L.foe.text>><</if>>').length, 2],
			['🔴 反例：引用了但**没有缺席分支** ⇒ 报（未启用槽位的故事会打印空行/undefined）',
				rendererProblems('<<if _L.foe>><<print _L.foe.slots.part>><</if>>').length, 1],
			['反例：取不到源码 ⇒ 报（不静默判过）', rendererProblems('').length, 1],
		];
		for (const [label, got, want] of cases) {
			const okk = got === want;
			console.log(`      ${okk ? '✓' : '✗'} 自证·${label}：检出 ${got}（期望 ${want}）`);
			if (!okk) selfBad++;
		}
		// 按**widget 定义**定位（不按段落名硬编码 ⇒ 段落改名/搬家不会让这条静默失效）
		const holders = [...(ctx.passageSrc ?? new Map()).entries()].filter(([, v]) => /<<widget\s+"fightlog">>/.test(v ?? ''));
		if (!holders.length) { console.log('  ✗ #704 渲染面：找不到 `<<widget "fightlog">>` 的定义（不静默判过）'); bad++; }
		for (const [name, src] of holders) for (const p2 of rendererProblems(src)) { console.log(`  ✗ #704 渲染面（${name}）：${p2.why}`); bad++; }
	}

	bad += selfBad;
	// `#1151`（同 `#1149`／`#1150`）⭐ **自证格的红必须进退出码** —— 格级属性 ✓，**不依赖 `process.argv`** ✗
	//   ⚠️ 与「判据发现」**分开报** ✓：本条语义是「**本门自身失能**」，不是「故事数据/内容有问题」✓
	if (selfBad) {
		console.error(`\n✗ ⓪x 槽位与耐久门：**自证格**红 ${selfBad} 项 ⇒ **本门自身失能**（不是判据发现 ✗）—— 请修本门再跑 ✓（\`#1151\`）`);
		process.exit(1);
	}
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ ⓪x 槽位与耐久门：${bad} 项`); process.exit(1); }
		console.log('\n✔ 槽位与耐久门通过（两态语义 · 分布口径 · 损坏阈值 · 兼容降级 · 声明面≤实现面）');
	}
};
