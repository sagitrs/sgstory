// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['dragon']。校验：npm run audit:golden。
export const flag = 'dragon';
export const flags = ["dragon"];

export const run = (ctx) => {
	const { Game, Rules, Pc, Chargen, ChargenPresets, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ① 检定成功率矩阵（伞 #22：难度审计）──
// 成功率解析计算：d20 枚举（优势=双骰取高）；自然20必成/自然1必败（SRD 5.2）
// ── ⓪f 龙战推演（#236 改版：封印战三门＝分布感知蒙特卡洛；单挑段保留期望劝退证据）──
if (wantAll || arg('dragon')) {
	console.log('\n══ ⓪f 龙战推演（封印战 MC 三门 · 单挑期望劝退 · 彩蛋击杀率）══');
	const D = Game.Dragon;

	// #236：期望值对连败方差视而不见（旧模型给「只带花毒」发活证书，实测 2 万局活 6.7%）。
	// 改忠实规则的蒙特卡洛：offer 三选一/贪心选牌/道具优势/武器 +1/药膏缺口≥4 自动用/败次 rage 封顶。
	const GAMES = 20000;
	const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
	const d20 = (rng, adv) => {
		const r1 = 1 + Math.floor(rng() * 20), r2 = 1 + Math.floor(rng() * 20);
		return adv ? Math.max(r1, r2) : r1;
	};
	// 一次性模拟一局封印战（真实动作池/检定/结算——与 fightresolve 同语义）
	const simSeal = (rng, pc0, inv, salves) => {
		const pc = JSON.parse(JSON.stringify(pc0));
		pc.inv = { ...inv }; pc.salves = salves ?? 0; pc.dragon = { hp: D.hp, defeats: 0, venom: false };
		let round = 1, guard = 0, lastUsed = '';
		const modOf = (site) => {
			const s = Game.Checks.sites[site];
			const abil = s.abil ?? Rules.SKILLS[s.skill];
			return Rules.parts(pc, abil, { skill: s.skill }).reduce((a, p) => a + p.v, 0);
		};
		const hitP = (site, adv) => {   // 数值概率（选牌用；结算用真骰）
			let w = adv ? 3 : 1, l = adv ? 1 : 3;	// 20 记胜、1 记败（权重＝两骰取高/取低的计数）
			const mod = modOf(site), dc = Game.Checks.sites[site].dc, need = dc - mod;
			for (let r = 2; r <= 19; r++) (r >= need ? w++ : l++);
			return (w / 20) * (adv ? (w / 20) : 1) + (adv ? 0 : 0) || w / 20; // 简化：无优劣势即 w/20
		};
		const resolveDmg = (n) => {     // <<damage>>：缺口≥4 自动烧药膏（#201）
			pc.hp = Math.max(0, pc.hp - n);
			if (pc.salves > 0 && pc.hp > 0 && pc.max_hp - pc.hp >= 4) { pc.salves--; pc.hp += 4; }
		};
		while (pc.hp > 0 && pc.dragon.hp > D.sealAt && round <= 40) {
			let offer = Game.Combat.offer('封印', round, pc, lastUsed);
			// 贪心选牌：期望值＝命中率×(伤害+0.7×护)+毒(一次性估值 12) − 失手×挨伤
			let best = null, bestEv = -1e9;
			for (const id of offer) {
				const a = Game.Combat.actions[id];
				const site = Game.Checks.sites[a.site];
				const adv = Game.Items.advAt(a.site, pc.inv, pc.gear);
				const p = Math.max(0.05, Math.min(0.95, hitP(a.site, adv)));
				let ev = p * ((a.ok?.dmg ?? 0) + 0.7 * (a.ok?.guard ?? 0)) - (1 - p) * (a.bad?.hurt ?? 0);
				if (a.ok?.venom && !pc.dragon.venom) ev += 12;
				if (ev > bestEv) { bestEv = ev; best = id; }
			}
			// 结算：玩家一手（真骰；优劣势按道具）
			const act = Game.Combat.actions[best];
			const adv = Game.Items.advAt(act.site, pc.inv, pc.gear);
			const roll = d20(rng, adv);
			const mod = modOf(act.site);
			const success = roll === 20 ? true : roll === 1 ? false : roll + mod >= Game.Checks.sites[act.site].dc;
			const r = Game.Combat.playerEff(best, { roll, success }, pc);   // #235：武器 +1 在这条路上
			const eff = r.eff;
			if (eff.dmg) pc.dragon.hp = Math.max(0, pc.dragon.hp - eff.dmg);
			if (eff.guard) guard += eff.guard;
			if (eff.venom) pc.dragon.venom = true;
			if (eff.hurt) resolveDmg(eff.hurt);
			lastUsed = best;
			if (pc.hp <= 0) break;
			if (pc.dragon.hp <= D.sealAt) break;
			// 它的回合：龙·吐息（书＝优势）；败＝rage 递增的实伤
			const fAdv = Game.Items.advAt('龙·吐息', pc.inv, pc.gear);
			const fRoll = d20(rng, fAdv);
			const fMod = modOf('龙·吐息');
			const fOk = fRoll === 20 ? true : fRoll === 1 ? false : fRoll + fMod >= Game.Checks.sites['龙·吐息'].dc;
			if (!fOk) {
				pc.dragon.defeats++;
				const raw = Game.Items.battleDamage(round, pc.inv, pc.dragon.defeats, pc.dragon.venom);
				resolveDmg(Math.max(1, raw - guard));
			}
			round++; guard = 0;
		}
		// 存活＝不死：拖到 40 轮没打完＝玩家会「退出去」（再度沉睡结局，人活着）——与游戏语义一致
		return pc.hp > 0;
	};
	const mcRate = (pc, inv, salves) => {
		const rng = mulberry32(20260911);
		const saved = Math.random; Math.random = rng;	// offer 内部也走种子
		let win = 0;
		for (let i = 0; i < GAMES; i++) if (simSeal(rng, pc, inv, salves)) win++;
		Math.random = saved;
		return win / GAMES;
	};
	// 三门（canon §3.8 口径：满配稳 / 花毒+一件减伤才稳 / 裸装倒）
	const GATES = { '满配': 0.80, '花毒+护臂': 0.50, '裸装': 0.20 };
	const loadouts = {
		'满配':      { inv: { 日记: true, 龙鳞护臂: true, 观星者的书: true, 月光花: true }, salves: 4, up: true },
		'花毒+护臂': { inv: { 龙鳞护臂: true, 月光花: true }, salves: 3, up: true },
		'只带花毒':  { inv: { 月光花: true }, salves: 0, up: false },
		'裸装':      { inv: {}, salves: 0, up: false },
	};
	let mcBad = 0;
	const rates = {};
	for (const p of presets) {
		for (const [ln, L] of Object.entries(loadouts)) {
			const rate = mcRate(p.pc, L.inv, L.salves);
			rates[`${p.name}·${ln}`] = rate;
			const gate = GATES[ln];
			const pass = gate === undefined ? true : (ln === '裸装' ? rate <= gate : rate >= gate);
			if (!pass) mcBad++;
			console.log(`  ${p.name}·${ln}: 存活 ${(rate * 100).toFixed(1)}%（${GAMES} 局）${gate === undefined ? '' : pass ? ' ✓' : ' ✗ 门 ' + (ln === '裸装' ? '≤' : '≥') + Math.round(gate * 100) + '%'}`);
		}
	}
	if (arg('check') && mcBad) { console.error(`\n✗ 封印战 MC 三门未过：${mcBad} 项（分布口径，canon §3.8）`); process.exit(1); }
	console.log('（#236：三门改分布口径——期望值对连败方差视而不见的问题不再。只带花毒无门：canon 未承诺其存活。）');
	// 彩蛋击杀率（M5b 拍板）：需「天然 20」；若位点带劣势 → 1/400。>1% 即红。
	let dragonBad = 0;
	const kill = Game.Checks.sites['龙·终击'];
	if (!kill || kill.nat !== 20) {
		dragonBad++;
		console.log('  ✗ 未定义「龙·终击」彩蛋位点（nat: 20）');
	} else {
		const pNat = 1 / 20;
		const pKill = kill.dis ? pNat * pNat : pNat;
		const ok = pKill <= 0.01;
		if (!ok) dragonBad++;
		console.log(`  单挑彩蛋击杀率 ≈ ${(pKill * 100).toFixed(2)}%（天然 ${kill.nat}${kill.dis ? ' + 劣势' : ''}）→ ${ok ? '✓ 几乎不可达（≤1%）' : '✗ 过高（>1%）'}`);
	}
	const breakers = Object.entries(Game.Items.effects)
		.filter(([, e]) => e.advSite === '龙·终击' || (e.advSites ?? []).includes('龙·终击')).map(([k]) => k);
	if (breakers.length) { dragonBad++; console.log(`  ✗ 破坏平衡的道具仍在给彩蛋位点优势：${breakers.join('、')}`); }
	// 正文不得对「劣势位点」硬写优势（防绕过 effects 表）
	const disSites = Object.entries(Game.Checks.sites).filter(([, s]) => s.dis).map(([k]) => k);
	const hardcoded = [];
	for (const [name, src] of passageSrc) {
		for (const s of disSites) if (src.includes(`<<sitecheck "${s}" "adv">>`)) hardcoded.push(`${name}→${s}`);
	}
	if (hardcoded.length) { dragonBad++; console.log(`  ✗ 正文对劣势位点硬写优势：${hardcoded.join('，')}`); }
	// ── 封印战（v17 补正 #3）：与守林人并肩——把龙打到 sealAt 以下，他才能念完那一句 ──
	console.log('\n  ── 封印战（普通结局·信息不足线）：需打掉 ' + (D.hp - D.sealAt) + ' 点血 ──');
	const sealSite = Game.Checks.sites['龙·斩击'];
	const saveSite = Game.Checks.sites['龙·吐息'];
	const sealLoadouts = {
		'裸装':           { inv: {}, venom: false, adv: true },
		'只带花毒':       { inv: {}, venom: true, adv: true },
		'花毒+护臂':      { inv: { 龙鳞护臂: true }, venom: true, adv: true },
		'花毒+护臂+日记': { inv: { 龙鳞护臂: true, 日记: true }, venom: true, adv: true },
	};
	// 动作池 → 单轮期望（玩家手上有什么，决定这一轮的平均输出与平均减伤）
	const CombatRound = (pc, L) => {
		const A = Game.Combat.actions;
		const ids = Game.Combat.pools['封印'].filter((id) => {
			const need = A[id]?.need;
			return !need || (need.startsWith('inv:') && L.inv[need.slice(4)]);
		});
		let dmg = 0, guard = 0;
		for (const id of ids) {
			const site = Game.Checks.sites[A[id].site];
			const pHit = successRate(pc, site, L.adv);
			const okD = A[id].ok?.dmg ?? 0, crD = A[id].crit?.dmg ?? 0;
			// 大成功 ≈ 1/20（骰面 20），其余成功档
			dmg += (1 / 20) * crD + (pHit - 1 / 20) * okD;
			guard += (A[id].ok?.guard ?? 0) * pHit + (A[id].ok?.skipFoe ? 6 : 0) * pHit;
		}
		// 3 选 1：每轮手上只有 3 张，取池内均值
		return { dmg: dmg / Math.max(1, ids.length), guard: guard / Math.max(1, ids.length) };
	};
	const sealRows = [];
	for (const p of presets) {
		for (const [ln, L] of Object.entries(sealLoadouts)) {
			const pSave = successRate(p.pc, saveSite, !!(L.inv['观星者的书'] || L.adv && false));
			const need = D.hp - D.sealAt;
			// B1：伤害/减伤不再来自单一「斩击」，而是这一轮手上真抽得到的牌（按 3 选 1 的均匀抽样取均值）
			const rot = CombatRound(p.pc, L);
			let dhp = D.hp, taken = 0, r = 0;
			for (; r < 40 && dhp > D.sealAt; r++) {
				dhp -= rot.dmg;
				taken += Math.max(1, Game.Items.battleDamage(r + 1, L.inv, 0, L.venom) - rot.guard) * (1 - pSave);
			}
			const alive = taken <= p.pc.max_hp;
			sealRows.push({ preset: p.name, loadout: ln, rounds: r, taken: Math.round(taken * 10) / 10, hp: p.pc.max_hp, alive });
			console.log(`  ${p.name}·${ln}: 期望 ${r} 轮（每轮 ≈${rot.dmg.toFixed(1)} 伤 / −${rot.guard.toFixed(1)} 受击） · 受击 ${taken.toFixed(1)} vs HP${p.pc.max_hp} → ${alive ? '✓ 活着按住它' : '✗ 先倒下'}`);
		}
	}
	const nakedAlive = sealRows.filter((x) => x.loadout === '裸装' && x.alive).length;
	const bestDead = sealRows.filter((x) => x.loadout === '花毒+护臂+日记' && !x.alive).length;
	if (!(D.sealAt < D.hp)) { dragonBad++; console.log('  ✗ 封印阈值 sealAt 不小于龙的血量（封印无从发动）'); }
	// 门 A：准备不足必须有人站不住（≥1 个预设裸装倒下）
	if (nakedAlive >= presets.length) { dragonBad++; console.log('  ✗ 三个预设裸装都活着按完封印——准备完全无意义'); }
	// 门 B：备齐花毒+减伤必须人人活得下来（普通结局应可达）
	if (bestDead) { dragonBad++; console.log(`  ✗ 备齐花毒+减伤仍会倒下（${bestDead} 个预设）——普通结局应当可达`); }
	// 门 C：毒性/减伤必须真的有用（带花毒一律不比裸装更疼）
	const worse = presets.filter((p) => {
		const naked = sealRows.find((x) => x.preset === p.name && x.loadout === '裸装');
		const venom = sealRows.find((x) => x.preset === p.name && x.loadout === '只带花毒');
		return venom && naked && venom.taken > naked.taken;
	}).length;
	if (worse) { dragonBad++; console.log(`  ✗ 花毒反而更疼（${worse} 个预设）——毒液方向搞反了`); }
	if (process.argv.includes('--check') && dragonBad) { console.error('\n✗ ⓪f 龙战门：彩蛋击杀率或平衡项不合规'); process.exit(1); }
}
};
