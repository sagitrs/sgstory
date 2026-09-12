// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['items', 'tokens']。校验：npm run audit:golden。
export const flag = 'items';
export const flags = ["items", "tokens"];

export const run = (ctx) => {
	const { Game, Rules, Pc, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ③ 道具效果 · 龙战伤害矩阵（伞 #22：高潮战审计）──
if (wantAll || arg('items') || arg('tokens')) {
	console.log('\n══ ③ 道具效果 · 龙战伤害矩阵（受击方=玩家，败次 0/2）══');
	const I = Game.Items;
	console.log(`减伤件：每件 −${I.perItemDamageReduce}；败次 +1 封顶 +2（M5b：件数共鸣与月光花优势已移除）`);
	for (const [name, e] of Object.entries(I.effects)) {
		const sites = [e.advSite, ...(e.advSites ?? [])].filter(Boolean);
		console.log(`  ${name.padEnd(8, '　')} ${sites.length ? `优势@${sites.join('/')}` : `减伤−${e.flatDamageReduce}`} —— ${e.note}`);
	}
	const sets = [
		{},
		{ 日记: true },
		{ 坏哨: true },
		{ 日记: true, 龙鳞护臂: true },
		{ 日记: true, 龙鳞护臂: true, 观星者的书: true },
		{ 日记: true, 龙鳞护臂: true, 观星者的书: true, 坏哨: true },
	];
	console.log('  道具组合 → R1/R2/R3 伤害（败次=0 | 败次=2）');
	for (const set of sets) {
		const f = (r) => `${I.battleDamage(r, set, 0)}/${I.battleDamage(r, set, 2)}`;
		console.log(`    [${Object.keys(set).join('、') || '空手'}] → ${f(1)} ${f(2)} ${f(3)}`);
	}
}
};
