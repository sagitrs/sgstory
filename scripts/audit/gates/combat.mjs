// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['combat']。校验：npm run audit:golden。
export const flag = 'combat';
export const flags = ["combat"];

export const run = (ctx) => {
	const { Game, Rules, Pc, Chargen, ChargenPresets, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ⓪k 战斗动作池门（B1）：每轮 3 选 1，每个动作三档结果 —— 不许空手、不许无后果 ──
if (wantAll || arg('combat')) {
	console.log('\n══ ⓪k 战斗动作池门（B1）——随机 3 选 1，每手都有属性、成/败/大成功都有后果 ══');
	let bad = 0;
	const C = Game.Combat;
	const MECH = ['dmg', 'adv', 'guard', 'skipFoe', 'venom', 'flag', 'flee'];
	const nakedPc = { inv: {}, gear: [], dragon: {} };
	for (const [pool, ids] of Object.entries(C.pools)) {
		// ① 池子够大：3 选 1 才有意义（去重后）
		const uniq = [...new Set(ids)];
		if (uniq.length < 3) { console.log(`  ✗ 池「${pool}」只有 ${uniq.length} 个动作——凑不出 3 选 1`); bad++; }
		// ② 不同选择＝不同判定：池内至少 2 项属性/技能
		const skills = new Set(uniq.map((id) => {
			const s = Game.Checks.sites[C.actions[id]?.site];
			return s ? (s.skill ?? `save:${s.abil}`) : '缺失';
		}));
		if (skills.size < 2) { console.log(`  ✗ 池「${pool}」所有动作都走同一项判定（${[...skills].join('/')}）——选择没有分化`); bad++; }
		let canHurt = 0, canGuard = 0;
		for (const id of uniq) {
			const a = C.actions[id];
			if (!a) { console.log(`  ✗ 池「${pool}」列了未登记的动作「${id}」`); bad++; continue; }
			if (!Game.Checks.sites[a.site]) { console.log(`  ✗ 动作「${id}」的位点「${a.site}」不在 Checks.sites`); bad++; }
			if (!a.label) { console.log(`  ✗ 动作「${id}」缺 label（面板上没字）`); bad++; }
			for (const k of ['ok', 'crit', 'bad']) {
				const eff = a[k];
				if (!eff || !eff.text) { console.log(`  ✗ 动作「${id}」缺 ${k} 档文案——玩家会撞上"没有后果"`); bad++; }
			}
			// 失败不许给好处（假代价门在战斗里的对应条目）
			const bad_ = a.bad ?? {};
			if (MECH.some((m) => bad_[m])) { console.log(`  ✗ 动作「${id}」的失败档给了收益（${MECH.filter((m) => bad_[m]).join('/')}）——失败就得疼`); bad++; }
			if (MECH.some((m) => a.ok?.[m] || a.crit?.[m])) canHurt++;
			if (a.ok?.guard || a.ok?.skipFoe || a.crit?.guard || a.crit?.skipFoe) canGuard++;
			if (a.need?.startsWith('inv:') && !Game.Items.defs[a.need.slice(4)]) {
				console.log(`  ✗ 动作「${id}」要求道具「${a.need.slice(4)}」，但道具表里没有——这手永远抽不到`);
				bad++;
			}
		}
		// ③ 反 S/L：池里必须同时有"能推进"和"能保命"的手（不会出现全是废牌的死局）
		if (!canHurt) { console.log(`  ✗ 池「${pool}」没有任何能推进战斗的动作——玩家只能挨打`); bad++; }
		if (!canGuard) { console.log(`  ✗ 池「${pool}」没有任何减伤/免伤的动作——只能硬换血`); bad++; }
		// ④ 空手不会死人：裸装（无道具）也能抽出 3 张牌
		const naked = C.offer(pool, 1, nakedPc, null);
		if (naked.length < 3) { console.log(`  ✗ 池「${pool}」裸装只抽到 ${naked.length} 张牌——手牌不足 3 选 1`); bad++; }
		if (ids.some((id) => !C.actions[id])) { /* 上面已报 */ } else { /* 去重后统计 */ }
		const dup = ids.length - uniq.length;
		if (dup) { console.log(`  ✗ 池「${pool}」有重复动作 ${dup} 个`); bad++; }
		console.log(`  ✓ ${pool}：${uniq.length} 手 → 每轮 3 选 1 · 判定 ${[...skills].join('/')} · 可推进 ${canHurt} · 可保命 ${canGuard}`);
	}
	// ⑤ 定档：天然 20＝大成功，其余按成败——三档都必须真的落到动作表里
	const probe = Object.keys(C.actions)[0];
	if (probe) {
		const critOk = C.pick(probe, { roll: 20, success: true }).kind === 'crit';
		const okKind = C.pick(probe, { roll: 11, success: true }).kind === 'ok';
		const badKind = C.pick(probe, { roll: 1, success: false }).kind === 'bad';
		if (!(critOk && okKind && badKind)) { console.log(`  ✗ 定档不对（20→${!critOk} / 成→${!okKind} / 败→${!badKind}）`); bad++; }
		else console.log('  ✓ 定档：骰面 20 → 大成功 · 成功 → 成功档 · 失败 → 失败档');
	}
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ ⓪k 战斗动作池门：${bad} 项`); process.exit(1); }
		console.log('\n✔ ⓪k 战斗动作池门通过（每手三档齐备、失败不给收益、裸装也抽得满 3 张）');
	}
}
};
