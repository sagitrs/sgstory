// audit 门模块（#316 第 2 步）：从 scripts/audit.mjs **逐字搬出**，不改语义。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// flags=['consequences']。校验：npm run audit:golden。
export const flag = 'consequences';
export const flags = ["consequences"];

export const judgeConsequences = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll, classifyNarrativeState, successRate } = ctx;

// ── ⓪q D2 选择后果门（#267）：每个被写入旗标必须落一桶 ══
if (wantAll || arg('consequences')) {
	console.log('\n══ ⓪q 选择后果门（#267）——非任意·非二元·后果可见（机械判据）══');
	let bad = 0;
	// `#1151`：**自证格**的计数单列（格红＝本门失能；与「判据发现」语义不同 → 分开记）
	let selfBad = 0;
	// #435 阶段 4：把**条件表**注入分类器（node 侧没有 `window` 全局 → 由这里给；表的来源＝故事契约）
	const RULES = ctx.window?.Sg?.story?.rules?.() ?? [];
	// `#785`：**声明式写点**的第二类来源 —— 诉求表（ask 的 `sets`／`yields`）。与 RULES 同样**注入**
	//（node 侧没有 `window` → 只能从这里给；表来源＝故事接入契约）。
	const ASKS = ctx.window?.Sg?.story?.socialAsks?.() ?? [];
	const { written, buckets, problems } = classifyNarrativeState({ rules: RULES, asks: ASKS });
	// 自证 7 例（**合成输入**——这就是给分类器加注入参数的理由）
	{
		const mk = (over = {}) => ({
			passageSrc: new Map([['P', '<<setflag "a">>'], ...(over.passageSrc ?? [])]),
			passageTags: new Map(over.passageTags ?? []),
			Echoes: over.Echoes ?? { list: [], revisit: [] },
			Consequences: over.Consequences ?? { provenance: {}, engine: {} },
			rules: over.rules ?? [],   // #435：条件表的注入口（自证要用它，别再被 mk() 吞掉）
			asks: over.asks ?? [],     // `#785`：诉求表的注入口（同上：自证必须**密闭**，不得吃环境数据）
			notes: over.notes,         // #437 C-2c-3：笔记表也要能注入（图鉴读形状的自证要用）
		});
		const cases = [
			// #580：注释遮蔽（`maskComments` 单一实现）——**双向**：注释里的示例不算写点；真代码里的必须算
			['正例（#580）：`//` 注释里的 `<<setflag "b">>` 不算写点', !classifyNarrativeState(mk({ passageSrc: [['P2', '// <<setflag "b">>']] })).written.has('b')],
			['正例（#580）：`/% %/` 注释里的 `<<setflag "b">>` 不算写点', !classifyNarrativeState(mk({ passageSrc: [['P3', '/% <<setflag "b">> %/']] })).written.has('b')],
			['反例（#580）：真代码里的 `<<setflag "b">>` **必须**算写点（防遮蔽过度）', classifyNarrativeState(mk({ passageSrc: [['P4', '<<setflag "b">>']] })).written.has('b')],
			['正例（#580）：正则字面量里的 `//` 不再把后面的代码吃掉（旧两条正则曾过度遮蔽）', classifyNarrativeState(mk({ passageSrc: [['P5', 'const re = /\\/\\//g; pc.ev.b = true;']] })).written.has('b')],
			['回声表消费 ⇒ 落 echo 桶、无问题', (() => { const r = classifyNarrativeState(mk({ Echoes: { list: [{ cause: { flag: 'a' } }], revisit: [] } })); return r.buckets.get('a') === 'echo' && r.problems.length === 0; })()],
			['写入但无人消费、无声明 ⇒ 「无任何桶」（假选择嫌疑）', (() => { const r = classifyNarrativeState(mk()); return r.buckets.get('a') === 'none' && r.problems.some((p) => p.includes('无任何桶')); })()],
			['非引擎段落里 `<<if $pc.ev.a>>` ⇒ mechanic；引擎段落里读 ⇒ 「请登记为 engine」', (() => { const r1 = classifyNarrativeState(mk({ passageSrc: [['Q', '<<if $pc.ev.a>>x<</if>>']] })); const r2 = classifyNarrativeState(mk({ passageSrc: [['S', '<<if $pc.ev.a>>x<</if>>']], passageTags: [['S', ['script']]] })); return r1.buckets.get('a') === 'mechanic' && r2.problems.some((p) => p.includes('请登记为 engine')); })()],
			['声明与实况不符 ⇒ 错标红', (() => { const r = classifyNarrativeState(mk({ passageSrc: [['Q', '<<if $pc.ev.a>>x<</if>>']], Consequences: { provenance: {}, engine: { a: '引擎态' } } })); return r.problems.some((p) => p.includes('错标')); })()],
			['声明缺理由 ⇒ 红', (() => { const r = classifyNarrativeState(mk({ Consequences: { provenance: { a: '  ' }, engine: {} } })); return r.problems.some((p) => p.includes('声明缺理由')); })()],
			['#441-A：JS 赋值式写入（`pc.ev.a = null`／对象／非 true）**也要算写入**——原判据只认 `= true`',
			(() => { const r = classifyNarrativeState({ passageSrc: new Map([['P', 'pc.ev.a = null; pc.ev.b = { x: 1 }; pc.ev.c = true;']]), passageTags: new Map() }); return ['a', 'b', 'c'].every((k) => r.written.has(k)); })()],
		['反例保护：`pc.ev.a == 1`（比较，不是赋值）**不算写入**',
			(() => { const r = classifyNarrativeState({ passageSrc: new Map([['P', 'if (pc.ev.a == 1) {}']]), passageTags: new Map() }); return !r.written.has('a'); })()],
		['`/% %/` 注释里的 `<<firstTime "b">>` **不算写入**（剥注释边界）', (() => { const r = classifyNarrativeState({ passageSrc: new Map([['P', '/% <<firstTime "b">> %/']]), passageTags: new Map() }); return !r.written.has('b'); })()],
			// #434 阶段 3：经 `Sg.notes.add('n_a')` 写的旗标**也要算写入**（写点换了形状）
			['经 `Sg.notes.add` 写的旗标算写入（裸键 a）', (() => { const r = classifyNarrativeState({ passageSrc: new Map([['P', "Sg.notes.add('n_a')"]]), passageTags: new Map(), notes: { n_a: { flagPath: 'ev.a' } } }); return r.written.has('a'); })()],
			// #435 阶段 4：条件表行里的键算「正文条件消费」（按行 `scope` 归属）；scope 是引擎段则不算
			['表行（scope=叙事段）引用该旗标 ⇒ mechanic 桶', (() => { const r = classifyNarrativeState(mk({ passageSrc: [['Q', ''], ['P', '<<setflag "a">>']], passageTags: [['Q', []]], rules: [{ id: 'r', scope: 'Q', req: ['a'], prio: 1 }] })); return r.buckets.get('a') === 'mechanic' && r.problems.length === 0; })()],
			['表行 scope 是**引擎段**（script 标签）⇒ 不算叙事消费', (() => { const r = classifyNarrativeState(mk({ passageSrc: [['Q', ''], ['S', ''], ['P', '<<setflag "a">>']], passageTags: [['S', ['script']]], rules: [{ id: 'r', scope: 'S', req: ['a'], prio: 1 }] })); return r.buckets.get('a') !== 'mechanic'; })()],
			['结局段落里读 ⇒ ending 桶（isEnding 边界）', (() => { const r = classifyNarrativeState(mk({ passageSrc: [['结局·某', '<<if $pc.ev.a>>x<</if>>']] })); return r.buckets.get('a') === 'ending'; })()],
			// `#581`：条件形态加宽——`<<elseif>>` 也是**叙事条件读**（原先只认 `<<if>>` → 该键被判“无任何桶”假红）
			['`<<elseif $pc.ev.X>>` 也算条件消费（#581）', (() => { const r = classifyNarrativeState(mk({ passageSrc: [['Q', '<<if $pc.ev.z>>甲<<elseif $pc.ev.a>>乙<</if>>']] })); return r.buckets.get('a') === 'mechanic' && r.problems.length === 0; })()],
			// `#437` C-2c-3：读侧兼容层退场后图鉴谓词改走 `Sg.notes.has('n_x')`
			['`Sg.notes.has("n_a")` 也算图鉴读 ⇒ codex 桶（#437 C-2c-3）', (() => { const r = classifyNarrativeState(mk({ passageSrc: [['P', '<<setflag "a">>'], ['Game Tables', "Sg.notes.has('n_a')"]], passageTags: [['Game Tables', ['script']]], notes: { n_a: { flagPath: 'ev.a' } } })); return r.buckets.get('a') === 'codex' && r.problems.length === 0; })()],
			['🔴 没有 `has("n_a")` 这类读 ⇒ **不进** codex 桶（防"有笔记条目就算读"的误判）', (() => { const r = classifyNarrativeState(mk({ passageSrc: [['P', '<<setflag "a">>'], ['Game Tables', 'const x = 1;']], notes: { n_a: { flagPath: 'ev.a' } } })); return r.buckets.get('a') !== 'codex'; })()],
		];
		for (const [label, ok] of cases) { if (!ok) selfBad++; console.log(`      ${ok ? '✓' : '✗'} 自证·${label}`); }
	}
	const by = {};
	for (const b of buckets.values()) by[b] = (by[b] ?? 0) + 1;
	console.log(`  写入旗标 ${written.size} 个 → ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' · ')}`);
	const META = { echo: '回声表（Echoes）', mechanic: '正文条件消费', ending: '结局分支消费', codex: '图鉴线索消费', provenance: '出处登记（带理由）', engine: '引擎/界面态（带理由）' };
	for (const [k, v] of Object.entries(META)) if (by[k]) console.log(`    ${k.padEnd(11)} ${by[k]} 项 ← ${v}`);
	if (problems.length) for (const p of problems) console.log(`  ✗ ${p}`);
	else console.log('  ✓ 每个写入旗标都有归属桶；provenance/engine 声明均带理由且无叙事消费');
	bad += selfBad;
	// `#1151`（同 `#1149`／`#1150`）⭐ **自证格的红必须进退出码** —— 格级属性，**不依赖 `process.argv`**
	//注意：与「判据发现」**分开报**：本条语义是「**本门自身失能**」，不是「故事数据/内容有问题」
	if (selfBad) {
		console.error(`\n✗ 选择后果门：**自证格**红 ${selfBad} 项 ⇒ **本门自身失能**（不是判据发现 ✗）—— 请修本门再跑 ✓（\`#1151\`）`);
		process.exit(1);
	}
	if (process.argv.includes('--check')) {
		if (problems.length + bad) { console.error(`\n✗ 选择后果门：${problems.length} 项未归类/错标${bad ? ` ＋ 自证 ${bad} 项` : ''}`); process.exit(1); }
		console.log('\n✔ 选择后果门通过（旗标分级齐备、声明与实况一致）');
	}
}
};

// `#1100` (甲)：**判据体提成具名导出** → 锚可指它（此前判据内联在 `run` 里 → 掏空 `run` 时
// 锚检照样绿）。`run` 只做委派 → **行为逐字保持**（提取提交不夹带接线或格）。
export const run = (ctx) => judgeConsequences(ctx);
