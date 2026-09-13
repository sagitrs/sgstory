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
	let bad = 0;
	const { written, buckets, problems } = classifyNarrativeState();
	// 自证 7 例（**合成输入**——这就是给分类器加注入参数的理由）
	{
		const mk = (over = {}) => ({
			passageSrc: new Map([['P', '<<setflag "a">>'], ...(over.passageSrc ?? [])]),
			passageTags: new Map(over.passageTags ?? []),
			Echoes: over.Echoes ?? { list: [], revisit: [] },
			Consequences: over.Consequences ?? { provenance: {}, engine: {} },
		});
		const cases = [
			['回声表消费 ⇒ 落 echo 桶、无问题', (() => { const r = classifyNarrativeState(mk({ Echoes: { list: [{ cause: { flag: 'a' } }], revisit: [] } })); return r.buckets.get('a') === 'echo' && r.problems.length === 0; })()],
			['写入但无人消费、无声明 ⇒ 「无任何桶」（假选择嫌疑）', (() => { const r = classifyNarrativeState(mk()); return r.buckets.get('a') === 'none' && r.problems.some((p) => p.includes('无任何桶')); })()],
			['非引擎段落里 `<<if $pc.ev.a>>` ⇒ mechanic；引擎段落里读 ⇒ 「请登记为 engine」', (() => { const r1 = classifyNarrativeState(mk({ passageSrc: [['Q', '<<if $pc.ev.a>>x<</if>>']] })); const r2 = classifyNarrativeState(mk({ passageSrc: [['S', '<<if $pc.ev.a>>x<</if>>']], passageTags: [['S', ['script']]] })); return r1.buckets.get('a') === 'mechanic' && r2.problems.some((p) => p.includes('请登记为 engine')); })()],
			['声明与实况不符 ⇒ 错标红', (() => { const r = classifyNarrativeState(mk({ passageSrc: [['Q', '<<if $pc.ev.a>>x<</if>>']], Consequences: { provenance: {}, engine: { a: '引擎态' } } })); return r.problems.some((p) => p.includes('错标')); })()],
			['声明缺理由 ⇒ 红', (() => { const r = classifyNarrativeState(mk({ Consequences: { provenance: { a: '  ' }, engine: {} } })); return r.problems.some((p) => p.includes('声明缺理由')); })()],
			['`/% %/` 注释里的 `<<firstTime "b">>` **不算写入**（剥注释边界）', (() => { const r = classifyNarrativeState({ passageSrc: new Map([['P', '/% <<firstTime "b">> %/']]), passageTags: new Map() }); return !r.written.has('b'); })()],
			['结局段落里读 ⇒ ending 桶（isEnding 边界）', (() => { const r = classifyNarrativeState(mk({ passageSrc: [['结局·某', '<<if $pc.ev.a>>x<</if>>']] })); return r.buckets.get('a') === 'ending'; })()],
		];
		for (const [label, ok] of cases) { if (!ok) bad++; console.log(`      ${ok ? '✓' : '✗'} 自证·${label}`); }
	}
	const by = {};
	for (const b of buckets.values()) by[b] = (by[b] ?? 0) + 1;
	console.log(`  写入旗标 ${written.size} 个 → ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' · ')}`);
	const META = { echo: '回声表（Echoes）', mechanic: '正文条件消费', ending: '结局分支消费', codex: '图鉴线索消费', provenance: '出处登记（带理由）', engine: '引擎/界面态（带理由）' };
	for (const [k, v] of Object.entries(META)) if (by[k]) console.log(`    ${k.padEnd(11)} ${by[k]} 项 ← ${v}`);
	if (problems.length) for (const p of problems) console.log(`  ✗ ${p}`);
	else console.log('  ✓ 每个写入旗标都有归属桶；provenance/engine 声明均带理由且无叙事消费');
	if (process.argv.includes('--check')) {
		if (problems.length + bad) { console.error(`\n✗ 选择后果门：${problems.length} 项未归类/错标${bad ? ` ＋ 自证 ${bad} 项` : ''}`); process.exit(1); }
		console.log('\n✔ 选择后果门通过（旗标分级齐备、声明与实况一致）');
	}
}
};
