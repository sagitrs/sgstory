// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['economy']。校验：npm run audit:golden。
export const flag = 'economy';
export const flags = ["economy"];

// ── #342 F2 自证：报表依赖的算术是**判据**（数字印给人看，算法必须可复算）──
// 规则：①`delta === null` ＝ 动态事件（不计入合计与最低）②按**章序**（不是插入序）累计
//      ③"序走最低"＝按章序遍历时的最小值。
export const timeline = (presets, events) => {
	const byChapter = {};
	for (const [key, ev] of Object.entries(events)) (byChapter[ev.chapter] ??= []).push([key, ev]);
	const chapters = Object.keys(byChapter).sort();
	return presets.map((p) => {
		let g = p.pc.gold, min = g;
		for (const ch of chapters) for (const [, ev] of byChapter[ch]) {
			if (ev.delta === null) continue;
			g += ev.delta ?? 0; min = Math.min(min, g);
		}
		return { name: p.name, start: p.pc.gold, end: g, min };
	});
};

export const run = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ② 经济收支时间线（伞 #22：余额审计）──
if (wantAll || arg('economy')) {
	console.log('\n══ ② 经济收支时间线（起点 = 预设车卡终资）══');
	let bad = 0;
	const tl = timeline(presets, Game.Economy.events);
	const byChapter = {};
	for (const [key, ev] of Object.entries(Game.Economy.events)) (byChapter[ev.chapter] ??= []).push([key, ev]);
	for (const p of presets) {
		console.log(`\n【${p.name}】起点 ${p.pc.gold} 金`);
		for (const ch of Object.keys(byChapter).sort()) {
			console.log(`  第${ch}章：`);
			for (const [key, ev] of byChapter[ch]) {
				const d = ev.delta ?? 0;
				console.log(`    ${key.padEnd(17, ' ')} ${d >= 0 ? '+' : ''}${String(d).padStart(3)}  ${ev.note}${ev.delta === null ? '（动态：不计入）' : ''}`);
			}
		}
		const t = tl.find((x) => x.name === p.name);
		console.log(`  全事件顺走（互斥事件同计=理论上界）：${t.end} 金（序走最低 ${t.min}）`);
	}
	// 自证：报表算术是判据（3 例：动态事件不计 / 章序累计 / 负数拉低最低）
	{
		const evs = { a: { chapter: '2', delta: -3 }, b: { chapter: '1', delta: 10 }, c: { chapter: '1', delta: null } };
		const r = timeline([{ name: 'T', pc: { gold: 5 } }], evs)[0];
		const cases = [
			['终点＝起点＋Σ（章序；`delta:null` 不计）＝ 5+10-3 = 12', r.end === 12],
			['序走最低按**章序**：先 +10 再 −3 ⇒ 最低＝起点 5（不是 2）', r.min === 5],
			['`delta:null` 的动态事件既不计入终点也不影响最低', timeline([{ name: 'T', pc: { gold: 0 } }], { c: { chapter: '1', delta: null } })[0].end === 0],
		];
		for (const [label, ok] of cases) { if (!ok) bad++; console.log(`      ${ok ? '✓' : '✗'} 自证·${label}`); }
	}
}
};
