// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['sitedisc']。校验：npm run audit:golden。
export const flag = 'sitedisc';
export const flags = ["sitedisc"];

export const run = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ⓪p 位点失败纪律门（#199/#195）：带伤失败必须有解，无解决不许带伤 ──
if (wantAll || arg('sitedisc')) {
	console.log('\n══ ⓪p 位点失败纪律（#199）——伤＝代价，不是空手；无解决不许带伤 ══');
	let bad = 0;
	let seen = 0;
	for (const [name, src] of passageSrc) {
		const re = /<<sitecheck\s+"([^"]+)"[^>]*>>[\s\S]{0,1200}?<<if\s+\$last_check\.success>>([\s\S]*?)<<else>>([\s\S]*?)<<\/if>>/g;
		for (const m of src.matchAll(re)) {
			const site = m[1], badBranch = m[3];
			if (!badBranch.includes('<<damage')) continue; // 只管带伤的失败档
			seen++;
			const resolves = /<<give\s|<<set\s+\$pc\.|<<goto\s/.test(badBranch);
			if (!resolves) {
				console.log(`  ✗ ${name} · ${site}：失败档带 <<damage>> 却不给结果（可无限磨伤）`);
				bad++;
			}
		}
	}
	console.log(`  带伤失败档 ${seen} 处，全部落结果（给东西/置旗标/退场）`);
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ ⓪p 位点失败纪律门：${bad} 项`); process.exit(1); }
		console.log('\n✔ ⓪p 位点失败纪律门通过（带伤失败必有解，无磨伤死角）');
	}
}
};
