// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['systems']。校验：npm run audit:golden。
export const flag = 'systems';
export const flags = ["systems"];

export const run = (ctx) => {
	const { Game, Rules, Pc, Chargen, ChargenPresets, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ⓪d D3 系统可玩性（#37）：机制发现性门 + 组合矩阵出具 ──
if (wantAll || arg('systems')) {
	console.log('\n══ ⓪d 系统可玩性（D3/#37）——规则不可知则不可实验：发现性锢点机检 ══');
	let bad = 0;
	const chargenText = ctx.ChargenRounds.flatMap((r) => r.options.flatMap((o) => [o.name, o.desc, o.effect])).join('\n');
	for (const m of Game.Systems.mechanics) {
		const src = m.p === '[chargen]' ? chargenText : passageSrc.get(m.p);
		if (src === undefined) { console.log(`  ✗ ${m.id}：源「${m.p}」不存在`); bad++; continue; }
		if (!src.includes(m.anchor)) { console.log(`  ✗ ${m.id}：${m.p} 锚句丢失「${m.anchor}」——规则对玩家不可见`); bad++; continue; }
		console.log(`  ✓ ${m.id}：${m.rule}`);
	}
	// C1 共鸣锚（#49）：锚段落存在且挂了 <<flip>>
	for (const a of Game.Shifts.anchors) {
		const src = passageSrc.get(a);
		if (src === undefined) { console.log(`  ✗ 共鸣锚段落「${a}」不存在`); bad++; continue; }
		if (!passageRaw.get(a).includes('<<flip>>')) { console.log(`  ✗ 共鸣锚「${a}」未挂 <<flip>>`); bad++; continue; }
	}
	console.log(`  共鸣锚：${Game.Shifts.anchors.length} 处全锚定（${Game.Shifts.unlimited ? '免费无限·位置门控' : ''}）`);
	console.log('  ── 机制×机制组合（实现证据出具）──');
	for (const c of Game.Systems.combos) console.log(`  · ${c.a} × ${c.b} ← ${c.evidence}`);
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ D3 系统门：${bad} 项规则不可发现`); process.exit(1); }
		console.log('\n✔ D3 系统门通过（核心机制全部有玩家侧说明）');
	}
}
};
