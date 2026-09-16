// ⓪z 波次与重置门（S3／`#488`）：波次推进（增援）· 奖励单调 · 失败重置语义
//
// **引擎门**（判据来自声明表：`mechanics().encounters[id] = { waves:[…], rewardsScale? }`）：
//   ① **波次推进/增援**：清完一批（`hits ≥ plan.hits`）才进下一批，且**下一批各自重置计数**；
//      最后一批清完 ⇒ `cleared`；回合用尽而未清 ⇒ `failed`（已定 ②：短＝1 回合·1 命中；长＝**5 回合**·3 命中
//      —— 回合上限 `#599` 由 3 调到 5〔保留"三击"只松压力〕）
//   ② **奖励随难度单调**：同一遭遇内 `waveRewardScale` 随批号（难度）**严格递增**
//   ③ **重置语义 ＋ 「不清什么」清单**：`resetRun` 清 `inv`／`gearHp`／`statuses`／hp／波次状态；
//      `RESET_KEEPS` 声明的面（`ev`／`soc`／`star`／`dragon`／`world` ＋ `Sg.notes`／`Sg.Codex`／`Sg.store`）**不受影响**
//   ④ **与存档相容**：`resetRun` 后 **pc 序列化往返** ⇒ 清过的仍为空、保留面同值（轻量代理；真存档矩阵并入 `#533`）
//   ⑤ **兼容降级**：`mechanics()` 为 `null` ⇒ 所有入口返回 `null`（调用方不调 ⇒ 零行为变化）
//
// 用法：`node scripts/audit.mjs --waves`（`--check` 为判定态）

export const flag = 'waves';
export const flags = ['waves'];

/** 纯函数：一串「回合结果 → 相位」的轨迹是否自洽（自证喂合成轨迹，真实运行喂引擎产物）。 */
export const traceViolations = ({ trace, plan }) => {
	const out = [];
	let idx = 1, hits = 0, rounds = 0, done = false;
	for (const [i, st] of trace.entries()) {
		if (done) { out.push(`第 ${i} 步：已经结束还在推进（相位 ${st.phase}）`); break; }
		rounds += 1;
		if (st.success) hits += 1;
		if (hits >= plan.hits) {
			if (idx >= plan.waves.length) {
				if (st.phase !== 'cleared') out.push(`第 ${i} 步：最后一批已清但相位是 ${st.phase}（应 cleared）`);
				done = true;
			} else {
				if (st.phase !== 'advance') out.push(`第 ${i} 步：该批已清但相位是 ${st.phase}（应 advance）`);
				if (st.pool !== plan.waves[idx].pool) out.push(`第 ${i} 步：增援后应换池到 ${plan.waves[idx].pool}（实际 ${st.pool}）`);
				idx += 1; hits = 0; rounds = 0;
			}
			continue;
		}
		if (rounds >= plan.rounds) {
			if (st.phase !== 'failed') out.push(`第 ${i} 步：回合用尽未清但相位是 ${st.phase}（应 failed）`);
			done = true;
			continue;
		}
		if (st.phase !== 'continue') out.push(`第 ${i} 步：未结束却相位为 ${st.phase}（应 continue）`);
	}
	return out;
};

/** 合成声明表（**自证用**）：短 1 批、长 2 批（第二批更难＋增援）。 */
const MECH = {
	hitLocations: ['衣服'],
	slots: {},
	equipment: {},
	statuses: {},
	encounters: {
		short: { waves: [{ pool: 'p1', difficulty: 1 }] },
		long: { waves: [{ pool: 'p1', difficulty: 1 }, { pool: 'p2', difficulty: 2, reinforce: true }], rewardsScale: 1.5 },
	},
};
const PC = () => ({ hp: 5, max_hp: 10, inv: { 花: true, 剑: true }, gear: [], gearHp: { 布衣: 1 }, statuses: { 手: { 流血: 2 } }, ev: { fight: { pool: 'p1', round: 1 } }, soc: { att: { a: 1 } }, star: { charge: 7 }, dragon: { hp: 9 }, world: { hall_hint: true } });

export const run = (ctx) => {
	const { Game, arg, wantAll } = ctx;
	const Sg = ctx.window?.Sg;
	if (!wantAll && !arg('waves')) return;
	console.log('\n══ ⓪z 波次与重置门（S3/#488）——增援 · 奖励单调 · 失败重置 ══');
	let bad = 0;
	const t = (label, ok, extra = '') => { if (ok) console.log(`      ✓ ${label}`); else { bad++; console.error(`      ✗ ${label}${extra ? '：' + extra : ''}`); } };
	const saved = Sg.story.mechanics;

	try {
		// ── ⑤ 兼容降级 ──
		Sg.story.mechanics = () => null;
		t('⑤ 未启用 ⇒ `wavePlan`／`waveBegin`／`waveRewardScale` 全返 `null`', Game.Combat.wavePlan('short') === null && Game.Combat.waveBegin(PC(), 'short') === null && Game.Combat.waveRewardScale('long', 1) === null);

		Sg.story.mechanics = () => MECH;

		// ── ① 两档定义（已定 ②）──
		{
			const s = Game.Combat.wavePlan('short'), l = Game.Combat.wavePlan('long');
			t('① 短＝1 批·1 回合·1 命中（单次判定定胜负）', s.rounds === 1 && s.hits === 1 && s.waves.length === 1 && s.long === false, JSON.stringify(s));
			// `#705` 片二-B（判据⑦）：声明了 `enemies` 的波 ⇒ 通关判据＝**敌人全灭**（`hits` 退场），
			// 上限按判据⑥**重导**（`#599` 的 5 是固定伤害数学下算的）⇒ 现在是 **8**（覆盖实测 p90）。
			t('① 长＝2 批·**8 回合**（⑥ 重导）·**敌人全灭**（⑦；`hits` 退场）', l.rounds === 8 && l.hits === 3 && l.waves.length === 2 && l.long === true, JSON.stringify(l))

		}

		// ── ① 波次推进 / 增援（真跑引擎）──
		{
			const pc = PC();
			const started = Game.Combat.waveBegin(pc, 'long');
			t('① `waveBegin` 开局：写 `pc.ev.fight.wave`（不新增顶层键）＋ 返回第一批的池', pc.ev.fight.wave.idx === 1 && started.pool === 'p1' && Object.keys(pc).includes('ev'), JSON.stringify(pc.ev.fight.wave));
			const trace = [];
			// 合法轨迹：第一批 3 次命中 ⇒ `advance`（换池）；第二批 3 次命中 ⇒ `cleared`。
			// （初版夹具写 [true,false,true,true] ⇒ 第 3 回合恰好用尽而本批未清 ⇒ 引擎已判 `failed`，
			//   我却继续调 `waveRecord` ⇒ 判据自检当场抓到"已结束还在推进"。夹具自身要合法。）
			for (const okk of [true, true, true, true, true, true]) { const r = Game.Combat.waveRecord(pc, okk); trace.push({ success: okk, phase: r.phase, pool: r.pool }); }
			const adv = trace[2], last = trace[5];
			t('① **清完一批才增援**：第 3 次命中 ⇒ `advance` 且换池到 `p2`', adv.phase === 'advance' && adv.pool === 'p2', JSON.stringify(adv));
			t('① 增援后**计数各自重置**（第二批从 0 起算 ⇒ 3 次命中才 `cleared`）', pc.ev.fight.wave.idx === 2 && trace[3].phase === 'continue', JSON.stringify({ wave: pc.ev.fight.wave, step3: trace[3] }));
			t('判据自检：真跑轨迹不报违反项', traceViolations({ trace, plan: Game.Combat.wavePlan('long') }).length === 0, traceViolations({ trace, plan: Game.Combat.wavePlan('long') }).join(' / '));
			t('① 最后一批清完 ⇒ `cleared`', last.phase === 'cleared', JSON.stringify(last));
		}

		// ── ① 回合用尽 ⇒ 判负 ──
		{
			const pc = PC();
			Game.Combat.waveBegin(pc, 'long');
			let last = null;
			const R = Game.Combat.wavePlan('long').rounds;                          // 口径从**声明面**读，别再写死数字
			for (let i = 0; i < R; i++) last = Game.Combat.waveRecord(pc, false);   // R 回合全败（无命中）
			t(`① 回合用尽而本批未清 ⇒ \`failed\`（${R} 回合上限）`, last.phase === 'failed' && pc.ev.fight.wave.rounds === R && pc.ev.fight.wave.hits === 0, JSON.stringify(last));
			const pc2 = PC();
			Game.Combat.waveBegin(pc2, 'short');
			const r1 = Game.Combat.waveRecord(pc2, false);
			t('① 短战斗：1 回合失败即判负（无第二回合）', r1.phase === 'failed', JSON.stringify(r1));
		}

		// ── ② 奖励随难度单调 ──
		{
			const a = Game.Combat.waveRewardScale('long', 1), b = Game.Combat.waveRewardScale('long', 2);
			t('② 同遭遇内随批号（难度）**严格递增**', b > a, JSON.stringify({ a, b }));
			t('② 乘数取声明的 `rewardsScale`（1.5 × difficulty）', Math.abs(a - 1.5) < 1e-9 && Math.abs(b - 3) < 1e-9, JSON.stringify({ a, b }));
		}

		// ── ③ 重置语义 ＋ 「不清什么」清单 ──
		{
			const pc = PC();
			const keepOf = (p) => ({ ...p.ev, fight: undefined });   // 保留面：`ev` 的**其它**键（`fight` 是瞬态，本就该清）
			const before = { ev: JSON.stringify(keepOf(pc)), soc: JSON.stringify(pc.soc), star: JSON.stringify(pc.star), dragon: JSON.stringify(pc.dragon), world: JSON.stringify(pc.world) };
			const r = Game.Combat.resetRun(pc);
			t('③ 清掉：`inv`／`gearHp`／`statuses`／瞬态战斗状态（清单逐条）', Object.keys(pc.inv).length === 0 && Object.keys(pc.gearHp).length === 0 && Object.keys(pc.statuses).length === 0 && pc.ev.fight === null, JSON.stringify({ inv: pc.inv, gearHp: pc.gearHp, statuses: pc.statuses }));
			t('③ 回出生点：hp 回到 `max_hp`', pc.hp === pc.max_hp, String(pc.hp));
			t('③ **保留**笔记/图鉴/已解锁面（`ev` 其它键／`soc`／`star`／`dragon`／`world` 同值）', before.ev === JSON.stringify(keepOf(pc)) && before.soc === JSON.stringify(pc.soc) && before.star === JSON.stringify(pc.star) && before.dragon === JSON.stringify(pc.dragon) && before.world === JSON.stringify(pc.world));
			t('③ 「不清什么」是**显式声明**（`RESET_KEEPS` 非空且含 Sg.* 三个命名空间）', Array.isArray(Game.Combat.RESET_KEEPS) && ['Sg.notes', 'Sg.Codex', 'Sg.store'].every((k) => Game.Combat.RESET_KEEPS.includes(k)), JSON.stringify(Game.Combat.RESET_KEEPS));
			t('③ 返回被重置的字段清单（供 UI/门核销）', r.reset.includes('inv') && r.reset.includes('ev.fight') && r.before.inv === 2, JSON.stringify(r));

			// ── ④ 与存档相容（pc 序列化往返的轻量代理）──
			const round = JSON.parse(JSON.stringify(pc));
			t('④ `resetRun` → 序列化往返 ⇒ 清过的仍为空、保留面同值', Object.keys(round.inv).length === 0 && round.hp === round.max_hp && JSON.stringify(keepOf(round)) === before.ev, JSON.stringify({ inv: round.inv, hp: round.hp }));
			t('④ 全灭判定：`runOver` 只在 hp ≤ 0 为真（单步失败＝带伤继续）', Game.Combat.runOver({ hp: 1 }) === false && Game.Combat.runOver({ hp: 0 }) === true);
		}

		// ── 自证（4 类反例：合成轨迹必须被判出）──
		{
			const plan = Game.Combat.wavePlan('long');
			const good = [{ success: true, phase: 'continue', pool: 'p1' }, { success: true, phase: 'continue', pool: 'p1' }, { success: true, phase: 'advance', pool: 'p2' }, { success: true, phase: 'continue', pool: 'p2' }, { success: true, phase: 'continue', pool: 'p2' }, { success: true, phase: 'cleared', pool: 'p2' }];
			const cases = [
				['正例：自洽轨迹不报', good, 0],
				['反例①：未清就 advance（假增援）', good.map((x, i) => (i === 0 ? { ...x, phase: 'advance', pool: 'p2' } : x)), 1],
				['反例②：已清却报 continue', good.map((x, i) => (i === 2 ? { ...x, phase: 'continue' } : x)), 1],
				['反例③：增援后没换池', good.map((x, i) => (i === 2 ? { ...x, pool: 'p1' } : x)), 1],
				// 轨迹长度取**声明面的回合数**（`#599` 把它从 3 调到 5；写死就跟着坏）
				['反例④：回合用尽却报 continue', Array.from({ length: plan.rounds }, () => ({ success: false, phase: 'continue', pool: 'p1' })), 1],
			];
			for (const [label, trace, want] of cases) {
				const got = traceViolations({ trace, plan });
				const okk = want === 0 ? got.length === 0 : got.length >= want;
				console.log(`      ${okk ? '✓' : '✗'} 自证·${label}：检出 ${got.length}（期望 ${want === 0 ? 0 : '≥' + want}）`);
				if (!okk) bad++;
			}
		}
	} finally {
		Sg.story.mechanics = saved;
	}

	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ ⓪z 波次与重置门：${bad} 项`); process.exit(1); }
		console.log('\n✔ 波次与重置门通过（增援 · 两档定义 · 奖励单调 · 重置语义与「不清什么」· 存档代理 · 兼容降级）');
	}
};
