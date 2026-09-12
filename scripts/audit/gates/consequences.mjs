// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['consequences']。校验：npm run audit:golden。
export const flag = 'consequences';
export const flags = ["consequences"];

export const run = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ⓪q D2 选择后果门（#267）：每个被写入旗标必须落一桶 ══
if (wantAll || arg('consequences')) {
	console.log('\n══ ⓪q 选择后果门（#267）——非任意·非二元·后果可见（机械判据）══');
	const { written, buckets, problems } = classifyNarrativeState();
	const by = {};
	for (const b of buckets.values()) by[b] = (by[b] ?? 0) + 1;
	console.log(`  写入旗标 ${written.size} 个 → ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' · ')}`);
	const META = { echo: '回声表（Echoes）', mechanic: '正文条件消费', ending: '结局分支消费', codex: '图鉴线索消费', provenance: '出处登记（带理由）', engine: '引擎/界面态（带理由）' };
	for (const [k, v] of Object.entries(META)) if (by[k]) console.log(`    ${k.padEnd(11)} ${by[k]} 项 ← ${v}`);
	if (problems.length) for (const p of problems) console.log(`  ✗ ${p}`);
	else console.log('  ✓ 每个写入旗标都有归属桶；provenance/engine 声明均带理由且无叙事消费');
	if (process.argv.includes('--check')) {
		if (problems.length) { console.error(`\n✗ 选择后果门：${problems.length} 项未归类/错标`); process.exit(1); }
		console.log('\n✔ 选择后果门通过（旗标分级齐备、声明与实况一致）');
	}
}
};
