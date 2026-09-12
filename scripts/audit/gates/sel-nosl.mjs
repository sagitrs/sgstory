// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['sel', 'nosl']。校验：npm run audit:golden。
export const flag = 'sel';
export const flags = ["sel", "nosl"];

export const run = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ⓪i 反 S/L 门（M10）：关键产出不许只有一条路 ──
if (wantAll || arg('sel') || arg('nosl')) {
	console.log('\n══ ⓪i 反 S/L 门（M10）——关键东西不止一条路，且判定属性不同 ══');
	let bad = 0;
	const sites = Game.Checks.sites;
	const keys = Game.Checks.keyYields ?? [];
	const byYield = new Map(keys.map((k) => [k, []]));
	for (const [site, d] of Object.entries(sites)) {
		if (!d.yields) continue;
		if (!byYield.has(d.yields)) { console.log(`  ✗ 位点「${site}」的 yields=「${d.yields}」不在 keyYields 里`); bad++; continue; }
		const ab = d.abil ?? Game.Rules.SKILLS[d.skill];
		byYield.get(d.yields).push({ site, ab, dc: d.dc });
	}
	// 交涉诉求（B2）：同一句诉求换手段＝换属性；另有一条"免检筹码"（不给骰子机会）
	for (const a of Game.Social?.asks ?? []) {
		if (!a.yield) continue;
		if (!byYield.has(a.yield)) { console.log(`  ✗ 诉求「${a.id}」的 yield=「${a.yield}」不在 keyYields 里`); bad++; continue; }
		const list = byYield.get(a.yield);
		for (const site of a.sites ?? []) {
			const d = sites[site];
			if (!d) { console.log(`  ✗ 诉求「${a.id}」的开口方式「${site}」不是位点`); bad++; continue; }
			list.push({ site, ab: d.abil ?? Game.Rules.SKILLS[d.skill], dc: d.dc });
		}
		if ((a.levers ?? []).some((l) => l.gives === 'auto') || a.willing) list.free = true;
	}
	for (const [key, paths] of byYield) {
		const abilities = [...new Set(paths.map((p2) => p2.ab))];
		// 交涉诉求：掷骰路子属性不同，**或者**有一条免检筹码（把对方想要的摆出来＝不必掷骰）
		// —— 这就是 D&D 2024「give them what they want → no check」落成的反 S/L 保障
		const ok = paths.free || (paths.length >= 2 && abilities.length >= 2);
		if (!ok) {
			bad++;
			console.log(`  ✗ 「${key}」通路 ${paths.length} 条 · 判定属性 ${abilities.length} 种 · 免检 ${paths.free ? '有' : '无'}——既要多路不同属性，也要有一条不靠骰子的路`);
		}
		console.log(`  ${ok ? '✓' : '✗'} ${key}：${paths.map((p2) => `${p2.site}（${p2.ab} DC${p2.dc}）`).join(' · ')}${paths.free ? ' · 免检筹码' : ''}`);
	}
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ 反 S/L 门：${bad} 项`); process.exit(1); }
		console.log('\n✔ 反 S/L 门通过（关键产出全部多路可达）');
	}
}
};
