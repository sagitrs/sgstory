// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['economy']。校验：npm run audit:golden。
export const flag = 'economy';
export const flags = ["economy"];

export const run = (ctx) => {
	const { Game, Rules, Pc, Chargen, ChargenPresets, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ② 经济收支时间线（伞 #22：余额审计）──
if (wantAll || arg('economy')) {
	console.log('\n══ ② 经济收支时间线（起点 = 预设车卡终资）══');
	for (const p of presets) {
		console.log(`\n【${p.name}】起点 ${p.pc.gold} 金`);
		let g = p.pc.gold, min = g;
		const byChapter = {};
		for (const [key, ev] of Object.entries(Game.Economy.events)) (byChapter[ev.chapter] ??= []).push([key, ev]);
		for (const ch of Object.keys(byChapter).sort()) {
			console.log(`  第${ch}章：`);
			for (const [key, ev] of byChapter[ch]) {
				const d = ev.delta ?? 0;
				if (ev.delta !== null) { g += d; min = Math.min(min, g); }
				console.log(`    ${key.padEnd(17, ' ')} ${d >= 0 ? '+' : ''}${String(d).padStart(3)}  ${ev.note}${ev.delta === null ? '（动态：不计入）' : ''}`);
			}
		}
		console.log(`  全事件顺走（互斥事件同计=理论上界）：${g} 金（序走最低 ${min}）`);
	}
}
};
