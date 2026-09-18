// ⓪s 「无字面状态读」门（`#435` 阶段 4／dev 认领）——**读侧**（写侧＝`--rules` 的 `text` 纯渲染）。
//
// 为什么需要它：阶段 1–3 把「知识」收进笔记表、把分支搬进条件表；阶段 4 起，**数据表**与**内容段落**
// 都不该再字面直读状态，否则两件事同时失效：
//   · 表：票面口径是「表里只许声明 `flagPath`/键名，求值走封装层」——表里夹源码文本会**污染**以源码
//     文本为输入的门（`--consequences`/`--state` 把表里的字符串当"叙事消费"，阶段 1 实测红过）；
//   · 内容：知识类键必须经 `Sg.notes.has('n_x')` 或条件表读——否则「谁读了它」不可数（`#436` 消费
//     可数门），阶段 5 删旗标时必漏。
//
// 判据（三级，**照实分级**：能硬判的硬判，还没搬完的不假装绿）：
//   ①【硬】条件表行（`Sg.story.rules()` 的 `req`/`any`/`exclude`/`prereq`/`yields` 与 `text`）：
//      不得含字面状态读 —— 复用 `lib/shared.mjs` 的 `READ_PATTERNS`/`readKeys` **单一权威**（不另写一套）；
//      键形态只许 `n_*` note id ∕ 裸键名 ∕ `ev.x`／`world.x`（禁 `$pc.ev.x`／`pc.ev.x`／`p.ev?.x` 这类路径）。
//   ②【硬＋基线】故事面（`stories/**`：叙事段 ＋ 声明表段）不得直读**知识键**（有笔记 `flagPath` 的键）：
//      必须经笔记/条件表。基线 `READ_KNOWN` 逐条带理由（阶段 4 搬家进行中）；**新增即红**。
//      基线里已修好的条目**只报告不判红**——阶段 4 的搬家 PR 会把它们顺手消掉，判红等于罚进度
//      （与 `test/premise-source.mjs` 的硬红不同：那边是收口态，这边是进行态，差别写在这里而不是放宽判据）。
//   ③【报告／`--strict` 转硬】非知识键（世界态/运行时）的直读按面汇总：叙事 · 声明表 · 机制。
//      它们按 `#432` 判定**本就不进笔记** ⇒ "经封装层读"是另一件事（`Sg.notes.readPath`／条件表 `holds`），
//      今天 130 多处；`--strict` 是收口时的**红证命令**，不做静默降级。
//
// 用法：node scripts/audit.mjs --reads --check ／ node scripts/audit.mjs --reads --check --strict
import { readFileSync } from 'node:fs';
import { LAYER_OF } from '../../../scripts/module-order.mjs';
import { ROOT } from '../../../scripts/dist-paths.mjs';
import { loadStoryAudit } from '../../../scripts/../scripts/audit/lib/story-audit.mjs';
import { literalReadKeys, readKeys } from '../../../scripts/../scripts/audit/lib/shared.mjs';
// A 片（`#215` 报备 `18504548`）：**分段那半已上移 core** ✓（`paragraphsOf` ✓）—— 本门只留 **io** ✗（与 `#877` 同款 ✓）。
import { paragraphsOf } from '../../../editor/lib/core/text.mjs';
// `#877` 第四块 ✓：六个**纯判定** ＋ 两个常量已搬进 core ✓（页面与门跑**同一份** ✓ —— 一处实现 ✓）。
// ⚠️ 本门只留 **io 那一半** ✗：`storyReadBaseline()`（`loadStoryAudit`／`ROOT` ✓）／`segmentsOf()`（`readFileSync` ✓）
//    —— `lib/core/**` 不得碰宿主 ✓（K6 ③ ✓）。
import { STORY_PREFIX, READ_KNOWN, scanReads, knowledgeIndex, faceOf, knowledgeHits, baselineProblems, tableReadProblems } from '../../../editor/lib/core/stateDiagnose.mjs';
// 出参**保留转出** ✓（`export … from` **不算定义** ✓ ⇒ 老调用方与故事清单**一行不改** ✓）。
export { STORY_PREFIX, READ_KNOWN, scanReads, knowledgeIndex, faceOf, knowledgeHits, baselineProblems, tableReadProblems } from '../../../editor/lib/core/stateDiagnose.mjs';

export const flag = 'reads';
export const flags = ['reads'];

/** 形状校验 + 取该故事的基线（未注册/形状不对 ⇒ 报错；空对象是合法数据集）。 */
export const storyReadBaseline = (ctx) => loadStoryAudit(ctx.storySlug, { root: ROOT }).readBaseline;

/** 源文件路径 ⇒ 段落清单 ✓：**io 那半在这里** ✗（读文件 ✓ + 注入 `layer` ✓），**分段在 core** ✓
 *  （`paragraphsOf` ✓ —— 与页内跑的是**同一份** ✓ ⇒ 不写第二份内核 ✗）。 */
export const segmentsOf = (files, read = readFileSync) =>
	files.flatMap((f) => paragraphsOf({ file: f, text: String(read(f, 'utf8')) }, { layer: LAYER_OF[f] ?? 'story' }));

export const run = (ctx) => {
	const { arg, wantAll } = ctx;
	if (!(wantAll || arg('reads'))) return;
	const strict = !!arg('strict');
	console.log('\n══ ⓪s 「无字面状态读」门（#435 阶段 4）——表与内容都经封装层读 ══');
	let bad = 0;

	// 自证（纯函数，正反例都跑同一份判据）
	{
		const cases = [
			['正例：条件表行只用 note id／键名 ⇒ 0 处字面状态读', tableReadProblems([{ id: 'A', scope: 'S', req: ['n_flower_warned'], any: ['world.fog_thin'], exclude: ['n_x'], yields: ['n_y'], text: '纯渲染' }]).length === 0],
			['🔴 反例：`req` 写成运行时路径 `$pc.ev.x` ⇒ 键形态报', tableReadProblems([{ id: 'A', req: ['$pc.ev.x'] }]).some((p) => p.what === '键形态')],
			['🔴 反例：`req` 写成 `pc.ev.x` ⇒ 字面状态读报', tableReadProblems([{ id: 'A', req: ['pc.ev.x'] }]).some((p) => p.what === '字面状态读')],
			['🔴 反例：`text` 里直读 `$pc.world.y` ⇒ 报（`text` 也在扫描面内）', tableReadProblems([{ id: 'A', text: '他去 <<if $pc.world.y>>…<</if>>' }]).some((p) => p.field === 'text')],
			['边界：`yields` 用 note id ⇒ 不报（与 `req` 同一命名空间）', tableReadProblems([{ id: 'A', yields: 'n_witch_fire_hint' }]).length === 0],
			['边界：`n_*` 里的下划线不被当"路径点"误判', tableReadProblems([{ id: 'A', req: 'n_flower_warned' }]).length === 0],
			['正例：前缀键 `inv:日记`／`era:present` 是合法键形（求值在引擎侧）', tableReadProblems([{ id: 'A', req: ['inv:日记'], any: ['era:present'] }]).length === 0],
			['正例（#437 批二）：`Sg.notes.readPath(p, \'ev.x\')` 是**封装层读** ⇒ 不算"字面状态读"', tableReadProblems([{ id: 'A', text: `<<if Sg.notes.readPath(p, 'ev.x')>>甲<</if>>` }]).length === 0],
			['边界（同一形状的两面）：封装层读**仍是读点**（`readKeys` 认它 ⇒ 消费可数不丢）', (() => { const m = readKeys(`Sg.notes.readPath(p, 'ev.x')`); return m.includes('ev.x'); })()],
			['🔴 反例：直读 `p.ev.x` 照旧报（封装层读的引入没有放水）', tableReadProblems([{ id: 'A', text: '<<if p.ev.x>>甲<</if>>' }]).length === 1],
			['正例（另票 #491）：对象算子形条件的**键**照常判形态（阈值/算子不进形态判定）', tableReadProblems([{ id: 'A', req: [{ gte: ['star.spent', 3] }, 'n_x'] }]).length === 0],
			['正例（修正①）：第三命名空间的状态路径 `keeper.met`／`star.spent` 是合法键形', tableReadProblems([{ id: 'A', req: ['keeper.met'], any: ['star.spent'] }]).length === 0],
			['🔴 反例（修正①的反面）：多段路径 `pc.ev.x` ／ 带 `$` 的 `$pc.ev.x` 仍拦', tableReadProblems([{ id: 'A', req: ['$pc.ev.x'] }]).length > 0 && tableReadProblems([{ id: 'A', req: ['a.b.c'] }]).some((p) => p.what === '键形态')],
			['正例（`#624` 片四）：`gear:` 是合法前缀键形（行囊/装备）⇒ 不报', tableReadProblems([{ id: 'A', req: ['gear:火把'] }]).length === 0],
			['🔴 反例：`inv:` 写成运行时读 `$pc.inv[…]` ⇒ 键形态报（`readKeys` 只管 ev/world，故这里靠形态兜住）', tableReadProblems([{ id: 'A', req: ["$pc.inv['日记']"] }]).some((p) => p.what === '键形态')],
			['正例：知识键在叙事段直读 ⇒ 命中（`know` 索引单一权威）', knowledgeHits(scanReads(segmentsOf(['stories/x.twee'], () => ':: P\n<<if $pc.ev.a>>x<</if>>\n')), new Map([['ev.a', 'n_a']])).length === 1],
			['边界：非知识键（世界态）不在②的扫描面内（走③报告）', knowledgeHits(scanReads(segmentsOf(['stories/x.twee'], () => ':: P\n<<if $pc.world.b>>x<</if>>\n')), new Map([['ev.a', 'n_a']])).length === 0],
			['🔴 反例：故事面新增知识键直读（不在基线）⇒ `fresh` 非空', baselineProblems([{ passage: '新段', key: 'ev.new', known: false }]).fresh.length === 1],
			['边界：基线内 ⇒ 不算新增（但仍在清单里，收口时归零）', baselineProblems([{ passage: '书房', key: 'ev.study_found', known: true }]).fresh.length === 0],
			['反沉默：注释里的示例不算读（`/% … %/` 挖空）', scanReads(segmentsOf(['stories/x.twee'], () => ':: P\n/% <<if $pc.ev.a>> %/\n正文\n')).length === 0],
			['反沉默：机制段的 JS 注释也不算读（`stripJsComments` 单一权威，与 `--text` 同口径）', scanReads(segmentsOf(['stories/z.twee'], () => ':: T [script]\n// 示例：pc.ev.a 读法\n正文\n')).length === 0],
			['机制段（`[script]`）不算叙事面（它走③的报告面）', scanReads(segmentsOf(['stories/z.twee'], () => ':: T [script]\n<<if pc.ev.a>>x<</if>>\n'))[0].kind === 'mech'],
			['边界（新修）：**赋值行不算读**——`pc.ev.a = true` 既不是读点也不该被算成"字面状态读"', literalReadKeys('pc.ev.a = true').length === 0 && literalReadKeys('<<set $pc.ev.a to true>>').length === 0],
		];
		let selfBad = 0;
		for (const [label, ok] of cases) { if (!ok) selfBad++; console.log(`      ${ok ? '✓' : '✗'} 自证·${label}`); }
		bad += selfBad;
	}

	// ① 条件表行
	const rows = ctx.window?.Sg?.story?.rules?.() ?? [];
	if (!Array.isArray(rows)) { console.log('  ✗ `Sg.story.rules()` 未返回行数组'); bad++; }
	else {
		const probs = tableReadProblems(rows);
		for (const p of probs) { console.log(`  ✗ 条件表行「${p.id}」的 \`${p.field}\` 有${p.what}：${p.detail}`); bad++; }
		console.log(`  · 条件表 ${rows.length} 行：字面状态读 ${probs.length} 处${probs.length ? '' : ' ✓'}`);
	}

	// ②③ 故事面／机制面的字面状态读
	const segments = segmentsOf(ctx.SRC_FILES ?? []);
	const hits = scanReads(segments);
	const know = knowledgeIndex(ctx.Game?.Notes?.entries ?? {});
	const RB = storyReadBaseline(ctx);                        // `#602`：该故事的基线（故事 1 的三条已搬去故事侧）
	const kh = knowledgeHits(hits, know, RB);
	const { fresh, stale } = baselineProblems(kh, RB);
	for (const h of fresh) { console.log(`  ✗ 知识键字面直读（基线外）：${h.file}:${h.line} 段落「${h.passage}」${h.key}（笔记 ${h.note}）——请走 \`Sg.notes.has('${h.note}')\` 或搬进条件表`); bad++; }
	if (stale.length) console.log(`  · 基线已修好（请从**本故事**的 \`Sg.story.readBaseline()\` 删除这些条目）：${stale.join('、')}`);
	const other = hits.filter((h) => !(faceOf(h) === 'story' && know.has(h.key)));
	const byFace = { narr: 0, decl: 0, mech: 0 };
	for (const h of other) byFace[faceOf(h) === 'mech' ? 'mech' : h.kind === 'narr' ? 'narr' : 'decl']++;
	const total = byFace.narr + byFace.decl + byFace.mech;
	console.log(`  · 知识键直读：故事面 ${kh.length} 处／${new Set(kh.map((h) => `${h.passage}|${h.key}`)).size} 个（段落×键）落点${fresh.length ? '' : '，全在基线内 ✓'}`);
	console.log(`  · 非知识键直读（世界态/运行时）：叙事 ${byFace.narr} · 声明表/故事机制 ${byFace.decl} · 机制 ${byFace.mech}（合计 ${total}）`);
	if (strict && total) { console.log(`  ✗ --strict：非知识键仍有 ${total} 处字面直读（阶段 4/5 收口后应转 0）`); bad++; }
	else if (total) console.log('  · 上述为非知识键的**已知存量**（报告制；`--strict` 可当红证）');

	if (bad) { console.error(`\n✗ 无字面状态读门未通过（${bad} 项）`); process.exit(1); }
	console.log('✔ 无字面状态读门通过（条件表 0 处 · 故事面知识键直读无新增）');
};
