// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['systems']。校验：npm run audit:golden。
export const flag = 'systems';
export const flags = ["systems"];

// ── 纯函数（供自证喂合成数据；判据与真实运行**同一份代码**）──
export const judgeMechanics = (mechanics, srcOf) => {
	const out = [];
	for (const m of mechanics) {
		const src = srcOf(m.p);
		if (src === undefined) { out.push({ id: m.id, why: `源「${m.p}」不存在` }); continue; }
		if (!src.includes(m.anchor)) out.push({ id: m.id, why: `${m.p} 锚句丢失「${m.anchor}」——规则对玩家不可见` });
	}
	return out;
};
export const judgeShifts = (anchors, srcOf, rawOf) => {
	const out = [];
	for (const a of anchors) {
		const src = srcOf(a);
		if (src === undefined) { out.push({ id: a, why: `共鸣锚段落「${a}」不存在` }); continue; }
		if (!String(rawOf(a) ?? '').includes('<<flip>>')) out.push({ id: a, why: `共鸣锚「${a}」未挂 <<flip>>` });
	}
	return out;
};

export const run = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ⓪d D3 系统可玩性（#37）：机制发现性门 + 组合矩阵出具 ──
if (wantAll || arg('systems')) {
	console.log('\n══ ⓪d 系统可玩性（D3/#37）——规则不可知则不可实验：发现性锢点机检 ══');
	let bad = 0;
	// ── 自证（先证会红，再判真实数据；合成夹具 → 期望检出数）──
	{
		const fake = new Map([['P', '这里有规则说明'], ['Q', '<<flip>> 翻转锚']]);
		const srcOf = (k) => fake.get(k);
		const rawOf = (k) => fake.get(k);
		const cases = [
			['正例：锚句在段里', judgeMechanics([{ id: 'm1', p: 'P', anchor: '规则说明' }], srcOf), 0],
			['反例①：锚句丢失', judgeMechanics([{ id: 'm1', p: 'P', anchor: '不存在的锚' }], srcOf), 1],
			['反例②：源段落不存在', judgeMechanics([{ id: 'm1', p: 'NOPE', anchor: 'x' }], srcOf), 1],
			['正例：共鸣锚挂了 flip', judgeShifts(['Q'], srcOf, rawOf), 0],
			['反例③：共鸣锚未挂 flip', judgeShifts(['P'], srcOf, rawOf), 1],
			['反例④：共鸣锚段落不存在', judgeShifts(['NOPE'], srcOf, rawOf), 1],
		];
		for (const [label, got, want] of cases) {
			const ok = got.length === want;
			console.log(`      ${ok ? '✓' : '✗'} 自证·${label}：检出 ${got.length}（期望 ${want}）`);
			if (!ok) bad++;
		}
	}
	const chargenText = ctx.Game.Chargen.rounds.flatMap((r) => r.options.flatMap((o) => [o.name, o.desc, o.effect])).join('\n');
	const mechSrc = (k) => (k === '[chargen]' ? chargenText : passageSrc.get(k));
	for (const m of Game.Systems.mechanics.filter((m) => !judgeMechanics([m], mechSrc).length)) console.log(`  ✓ ${m.id}：${m.rule}`);
	for (const f of judgeMechanics(Game.Systems.mechanics, mechSrc)) { console.log(`  ✗ ${f.id}：${f.why}`); bad++; }
	// C1 共鸣锚（#49）：锚段落存在且挂了 <<flip>>
	for (const f of judgeShifts(Game.Shifts.anchors, (k) => passageSrc.get(k), (k) => passageRaw.get(k))) { console.log(`  ✗ ${f.why}`); bad++; }
	console.log(`  共鸣锚：${Game.Shifts.anchors.length} 处全锚定（${Game.Shifts.unlimited ? '免费无限·位置门控' : ''}）`);
	console.log('  ── 机制×机制组合（实现证据出具）──');
	for (const c of Game.Systems.combos) console.log(`  · ${c.a} × ${c.b} ← ${c.evidence}`);
	if (process.argv.includes('--check')) {
		if (bad) { console.error(`\n✗ D3 系统门：${bad} 项规则不可发现`); process.exit(1); }
		console.log('\n✔ D3 系统门通过（核心机制全部有玩家侧说明）');
	}
}
};
