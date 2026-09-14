// ⓪ac 战斗分布口径门（`#491` 判据 1／`#488` 已定 ②）——**故事门**（判据来自本故事声明的遭遇与位点）。
//
// 为什么要有它：本故事是"战斗系统试验场"，两档战斗的**数值口径**（短＝单次对抗判定；长＝3 回合上限＋3 次成功）
// 只在合成门（`--waves`）里被验过"状态机推进"，**没有任何门量过它的分布**（胜率／期望回合／受伤期望）。
// 而本仓的教训写得很清楚（`#236`）：**期望值对连败方差视而不见**——旧模型给"只带花毒"发过活证书，
// 2 万局实测活 6.7%。⇒ 本门**必须报分布**，且"只报期望"要被判红（见 `judgeDist`）。
//
// 判据（四条）：
//   ① **短战斗**：单次对抗判定 ⇒ 实证胜率 vs **解析闭式** `P(d20 ± 优/劣 ≥ DC − mod)`（含自然 1/20 口径）±3σ；
//   ② **长战斗**：真机 sim（`waveBegin`／`resolvePlayer`／`waveRecord` 逐回合驱动）⇒ 清完率、**期望回合**、受伤期望；
//   ③ **分布面**：回合数直方图 ＋ **连败分布**（`P(连败 ≥ k)`）＋ 最大连败 —— 缺任一项 ⇒ 红（反"只报期望"）；
//   ④ **可复算**：同一 seed 跑两次 ⇒ 报表**逐字节一致**（多种子 ＋ 固定骰面复算，与 `--dragon` 同口径）。
//
// 用法：`node scripts/audit.mjs --combat-dist --check --story hollow-cave`
import { mulberry32, asSugarRandom } from '../lib/rng.mjs';

export const flag = 'combat-dist';
export const flags = ['combat-dist'];

/** 纯函数：d20（`adv` 为 1／-1／0；自然 1 必败、自然 20 必成的口径由调用方给 `nat` 决定）。 */
export const roll20 = (rng, adv = 0) => {
	const a = 1 + Math.floor(rng() * 20);
	if (!adv) return a;
	const b = 1 + Math.floor(rng() * 20);
	return adv > 0 ? Math.max(a, b) : Math.min(a, b);
};

/** 纯函数：解析胜率（枚举 d20 全 20 面；`mod` 为总修正；`dc`）。含自然 1/20 口径（SRD 5.2）。 */
export const closedFormHitRate = ({ dc, mod = 0, adv = 0 }) => {
	let hit = 0, total = 0;
	for (let a = 1; a <= 20; a++) {
		const bs = !adv ? [0] : Array.from({ length: 20 }, (_, i) => i + 1);
		for (const b of bs) {
			const r = !adv ? a : adv > 0 ? Math.max(a, b) : Math.min(a, b);
			total += 1;
			if (r === 20) { hit += 1; continue; }           // 天然 20 必成（SRD 5.2）
			if (r === 1) continue;                          // 天然 1 必败
			if (r + mod >= dc) hit += 1;
		}
	}
	return hit / total;
};

/** 纯函数：**分布面**是否齐（`#236` 的教训：只报期望 ⇒ 红）。 */
export const judgeDist = (report) => {
	const out = [];
	if (!report) return [{ code: 'dist-missing', why: '报表缺失' }];
	if (typeof report.runs !== 'number' || report.runs <= 0) out.push({ code: 'dist-runs', why: '没报跑了多少局（`runs`）——复算口径不明' });
	if (typeof report.rate !== 'number') out.push({ code: 'dist-rate', why: '没报胜率／清完率' });
	if (typeof report.roundsMean !== 'number') out.push({ code: 'dist-rounds', why: '没报期望回合' });
	if (typeof report.hurtMean !== 'number') out.push({ code: 'dist-hurt', why: '没报受伤期望' });
	// ③ 分布面：直方图 ＋ 连败分布 ＋ 最大连败——**缺一即红**（这就是"期望值对连败方差视而不见"的反面）
	if (!report.roundsHist || typeof report.roundsHist !== 'object' || !Object.keys(report.roundsHist).length) out.push({ code: 'dist-hist', why: '没报回合数**分布**（只有期望值 ⇒ 方差不可见；`#236`）' });
	if (!report.lossRunDist || typeof report.lossRunDist !== 'object' || !Object.keys(report.lossRunDist).length) out.push({ code: 'dist-run', why: '没报**连败分布**（`P(连败 ≥ k)`）——正是 `#236` 踩过的那种盲区' });
	if (!Number.isFinite(report.maxLossRun)) out.push({ code: 'dist-maxrun', why: '没报最大连败' });
	if (Array.isArray(report.seeds) ? report.seeds.length < 6 : true) out.push({ code: 'dist-seeds', why: '没报多种子（`seeds` ≥ 6，与 `--dragon` 的多种子对照同口径）' });
	return out;
};

/** 纯函数：实证 vs 闭式的容差判据（3σ，二项分布）。 */
export const within3Sigma = ({ empirical, expected, n }) => {
	const sigma = Math.sqrt(Math.max(1e-12, expected * (1 - expected) / n));
	return Math.abs(empirical - expected) <= 3 * sigma;
};

/** 真机 sim：**长战斗**逐回合驱动（`waveBegin`／`resolvePlayer`／`waveRecord`）——受伤按 present 的口径落 HP。 */
export const simLong = ({ Game, pcMake, mech, id, seed, runs = 4000, poolOf }) => {
	const plan = Game.Combat.wavePlan(id);
	const rng = mulberry32(seed);
	Game.Rules.rng.set(asSugarRandom(rng));
	const roundsHist = {}, lossRunDist = {};
	let cleared = 0, roundsSum = 0, hurtSum = 0, maxLossRun = 0, lossRun = 0, deaths = 0;
	for (let i = 0; i < runs; i++) {
		const pc = pcMake();
		Game.Combat.waveBegin(pc, id);
		let rounds = 0, done = false;
		for (let guard = 0; guard < 64 && !done; guard++) {
			const wv = pc.ev.fight.wave;
			const pool = poolOf(plan.waves[wv.idx - 1].pool);
			const act = pool[Math.floor(rng() * pool.length)];
			pc.ev.fight.act = act;
			const r = Game.Combat.resolvePlayer(pc, null, false);
			pc.hp = Math.max(0, pc.hp - (r.hurt ?? 0));          // present（`<<damage>>`）的口径：hurt 在此落 HP
			hurtSum += r.hurt ?? 0;
			rounds += 1;
			if (r.check?.success) { lossRun = 0; } else { lossRun += 1; if (lossRun > maxLossRun) maxLossRun = lossRun; lossRunDist[lossRun] = (lossRunDist[lossRun] ?? 0) + 1; }
			const phase = Game.Combat.waveRecord(pc, !!r.check?.success);
			if (phase.phase === 'advance') continue;
			if (phase.phase === 'cleared') { cleared += 1; done = true; }
			else if (phase.phase === 'failed') { done = true; }
			if (pc.hp <= 0) done = true;                         // 全灭即中止本局
		}
		roundsSum += rounds;
		roundsHist[rounds] = (roundsHist[rounds] ?? 0) + 1;
	}
	Game.Rules.rng.reset();
	return { runs, rate: cleared / runs, roundsMean: roundsSum / runs, hurtMean: hurtSum / runs, deaths, roundsHist, lossRunDist, maxLossRun, seeds: [seed] };
};

export const run = (ctx) => {
	const { arg, wantAll, window: w } = ctx;
	if (!(wantAll || arg('combat-dist'))) return;
	console.log('\n══ ⓪ac 战斗分布口径门（`#491` 判据 1／已定 ②）——胜率 · 期望回合 · 受伤期望 ＋ **分布** ══');
	let bad = 0;
	const { Game } = w;
	const story = w.Sg?.story ?? {};
	const mech = story.mechanics?.() ?? null;

	// ── 自证（纯函数：正例放过／反例必须报）──
	{
		const cases = [
			['正例：分布面齐（直方图＋连败分布＋最大连败＋多种子）⇒ 0 条', judgeDist({ runs: 4000, rate: 0.3, roundsMean: 4, hurtMean: 2, roundsHist: { 3: 1 }, lossRunDist: { 1: 1 }, maxLossRun: 3, seeds: [1, 2, 3, 4, 5, 6] }).length === 0],
			['🔴 反例：**只报期望值**（无直方图／无连败分布／无最大连败）⇒ 报（`#236` 的盲区）', (() => { const ps = judgeDist({ runs: 4000, rate: 0.3, roundsMean: 4, hurtMean: 2, seeds: [1, 2, 3, 4, 5, 6] }); return ps.some((p) => p.code === 'dist-hist') && ps.some((p) => p.code === 'dist-run') && ps.some((p) => p.code === 'dist-maxrun'); })()],
			['🔴 反例：没报多种子 ⇒ 报（复算口径不明）', judgeDist({ runs: 4000, rate: 0.3, roundsMean: 4, hurtMean: 2, roundsHist: { 3: 1 }, lossRunDist: { 1: 1 }, maxLossRun: 3, seeds: [1] }).length === 1],
			['闭式：DC12／mod0／无优 ⇒ 9/20（自然 1 必败、20 必成）', Math.abs(closedFormHitRate({ dc: 12, mod: 0 }) - 9 / 20) < 1e-9],
			['闭式：优势 ≥ 普通（同 DC 同 mod）', closedFormHitRate({ dc: 12, mod: 0, adv: 1 }) >= closedFormHitRate({ dc: 12, mod: 0 })],
			['3σ 判据：实证＝闭式 ⇒ 过；偏 0.1 ⇒ 不过', within3Sigma({ empirical: 0.45, expected: 0.45, n: 4000 }) === true && within3Sigma({ empirical: 0.55, expected: 0.45, n: 4000 }) === false],
		];
		let selfBad = 0;
		for (const [label, ok] of cases) { if (!ok) selfBad++; console.log(`      ${ok ? '✓' : '✗'} 自证·${label}`); }
		bad += selfBad;
	}

	if (!mech?.encounters) { console.log('  · 未启用（`mechanics().encounters` 为空）——本门对不启用新机制的故事零影响'); }
	else {
		const SEEDS = [20260914, 20260915, 20260916, 20260917, 20260918, 20260919];
		const poolOf = (id) => story.combatPool?.(id) ?? [];
		const pcMake = () => { const pc = Game.Pc.defaults(); pc.hp = 20; pc.max_hp = 20; pc.gear = ['旧剑', '火把']; pc.inv = { 旧剑: true, 火把: true }; return pc; };
		const sites = Object.keys(Game.Checks?.sites ?? {});
		const report = { runs: 0, rate: 0, roundsMean: 0, hurtMean: 0, roundsHist: {}, lossRunDist: {}, maxLossRun: 0, seeds: [] };

		// ① 短战斗：单次对抗判定 ⇒ 实证胜率 vs 闭式
		{
			const site = story.checkSite?.('洞窟·挥剑') ?? null;
			const N = 8000;
			const rng = mulberry32(SEEDS[0]);
			Game.Rules.rng.set(asSugarRandom(rng));
			let win = 0, hurt = 0;
			for (let i = 0; i < N; i++) {
				const pc = pcMake();
				const res = Game.Checks.resolve('洞窟·挥剑', pc);
				if (res.success) win++; else hurt += 2;              // 短战斗失败＝受伤 1 档（`Game.Damage.hurt`）
			}
			Game.Rules.rng.reset();
			const empirical = win / N;
			const closed = closedFormHitRate({ dc: site?.dc ?? 0, mod: 0, adv: 0 });
			const ok = within3Sigma({ empirical, expected: closed, n: N });
			console.log(`  ${ok ? '✓' : '✗'} 短战斗（${sites.includes('洞窟·挥剑') ? '洞窟·挥剑' : '?'} DC${site?.dc}）：实证胜率 ${(empirical * 100).toFixed(2)}% vs 闭式 ${(closed * 100).toFixed(2)}%（n=${N}，3σ 内${ok ? '' : '**超**'}）· 受伤期望 ${(hurt / N).toFixed(3)}／局`);
			if (!ok) bad++;
			report.rate = empirical; report.hurtMean = hurt / N; report.roundsMean = 1; report.runs = N;
			report.roundsHist = { 1: N }; report.lossRunDist = { 1: N - win }; report.maxLossRun = 1; report.seeds = SEEDS;
		}

		// ②③④ 长战斗：真机 sim（多种子 ＋ 分布面 ＋ 复算）
		{
			const RUNS = 1500;
			const runs = [];
			for (const s of SEEDS) runs.push(simLong({ Game, pcMake, mech, id: 'long', seed: s, runs: RUNS, poolOf }));
			const clearRate = runs.reduce((a, r) => a + r.rate, 0) / runs.length;
			const roundsMean = runs.reduce((a, r) => a + r.roundsMean, 0) / runs.length;
			const hurtMean = runs.reduce((a, r) => a + r.hurtMean, 0) / runs.length;
			const maxLossRun = Math.max(...runs.map((r) => r.maxLossRun));
			const deaths = runs.reduce((a, r) => a + r.deaths, 0) / runs.length;
			const hist = {}; for (const r of runs) for (const [k, v] of Object.entries(r.roundsHist)) hist[k] = (hist[k] ?? 0) + v;
			const runDist = {}; for (const r of runs) for (const [k, v] of Object.entries(r.lossRunDist)) runDist[k] = (runDist[k] ?? 0) + v;
			Object.assign(report, { rate: clearRate, roundsMean, hurtMean, deaths, roundsHist: hist, lossRunDist: runDist, maxLossRun, seeds: SEEDS, runs: RUNS * SEEDS.length });
			const distBad = judgeDist(report);
			bad += distBad.length;
			// ②b **模型与实际一致**（把"清完率"从神秘数字变成可复算口径）：按声明的 plan 推闭式——
			//    每批需 `hits` 次成功且回合上限恰为 `hits` ⇒ **每批必须全成功** ⇒ P(清) = ∏ p_i^hits。
			const pShort = closedFormHitRate({ dc: (story.checkSite?.('洞窟·围斗') ?? {}).dc ?? 13, mod: 0 });
			const plan = Game.Combat.wavePlan('long');
			const pPerBatch = [1, 2].map((i) => closedFormHitRate({ dc: (story.checkSite?.((poolOf(plan.waves[i - 1].pool)[0] && story.combatAction?.(poolOf(plan.waves[i - 1].pool)[0])?.site) ?? '洞窟·围斗') ?? {}).dc ?? 13, mod: 0 }));
			const closedClear = (pShort ** plan.hits) * (Math.min(...pPerBatch) ** plan.hits);
			const modelOk = within3Sigma({ empirical: clearRate, expected: closedClear, n: RUNS * SEEDS.length });
			console.log(`  ${modelOk ? '✓' : '✗'} 长战斗·口径复算：声明 plan（${plan.waves.length} 批 × 每批 ${plan.hits} 次成功 / 上限 ${plan.rounds} 回合）⇒ 每批必须**全成功** ⇒ 闭式清完率 ≈ ${(closedClear * 100).toFixed(2)}% vs 实证 ${(clearRate * 100).toFixed(2)}%（3σ 内${modelOk ? '' : '**超**'}）`);
			if (!modelOk) bad += 1;
			if (clearRate < 0.05) console.log(`      · ⚠ **平衡观察**（不是门红）：长战斗清完率 ${(clearRate * 100).toFixed(2)}%——由已定 ②「${plan.rounds} 回合上限 ＋ ${plan.hits} 次成功」直接推出（每批必须全成功），若要"打得过"须改这两项之一（本门只报口径，不设阈值）。`);
			console.log(`  ${distBad.length ? '✗' : '✓'} 长战斗：清完率 ${(clearRate * 100).toFixed(2)}% · 期望回合 ${roundsMean.toFixed(2)} · 受伤期望 ${hurtMean.toFixed(2)}／局 · **全灭率 ${(deaths * 100).toFixed(2)}%** · 最大连败 ${maxLossRun}（${SEEDS.length} 种子 × ${RUNS} 局）`);
			console.log(`      · 回合数分布：${Object.entries(hist).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}回合 ${(100 * v / (RUNS * SEEDS.length)).toFixed(1)}%`).join(' · ')}`);
			console.log(`      · 连败分布：${Object.entries(runDist).sort((a, b) => a[0] - b[0]).slice(0, 8).map(([k, v]) => `≥${k} 连败 ${v} 次`).join(' · ')}（**期望值看不见的那一面**）`);
			for (const p of distBad) { console.log(`  ✗ 分布面：${p.why}`); }
			// ④ 复算：同种子两次逐字节一致
			const again = simLong({ Game, pcMake, mech, id: 'long', seed: SEEDS[0], runs: 200, poolOf });
			const again2 = simLong({ Game, pcMake, mech, id: 'long', seed: SEEDS[0], runs: 200, poolOf });
			const same = JSON.stringify({ ...again, seeds: null }) === JSON.stringify({ ...again2, seeds: null });
			console.log(`  ${same ? '✓' : '✗'} 复算：同种子两次逐字节一致（seed ${SEEDS[0]} · 200 局）`);
			if (!same) bad++;
		}
	}

	if (bad) { console.error(`\n✗ 战斗分布口径门未通过（${bad} 项）`); process.exit(1); }
	console.log('✔ 战斗分布口径门通过（胜率对闭式 · 期望回合/受伤期望 · **分布面齐** · 同种子可复算）');
};
