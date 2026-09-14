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
import { LAYER_OF } from '../../module-order.mjs';
import { readKeys, notePaths, stripJsComments } from '../lib/shared.mjs';

export const flag = 'reads';
export const flags = ['reads'];

/** 故事面前缀：`SOURCE_ROOTS` 是 `['src','stories']`（`module-order.mjs` 单一权威），
 *  本门按「故事 vs 机制」分面 —— 故事面＝`stories/**`（叙事段＋声明表段），机制面＝其余（引擎胶水）。 */
export const STORY_PREFIX = 'stories/';
const MECH_TAGS = ['script', 'widget', 'stylesheet'];

// ── 基线：故事面里的**知识键**字面直读（逐条带理由）。新增即红；修好的条目只报告。 ──
// 为什么是这些（都是阶段 4 的待搬项，不是"允许的写法"）：
//   · 叙事段那 5 处：手写分支还没换进条件表（`#435` 内容批进行中）；
//   · `Game Tables` 那 9 处：`Codex.clues[].test`（图鉴线索判定）与面板 `done/apply` 谓词，
//     阶段 4/5 随「合龙门/线索」搬进条件表后消失。
export const READ_KNOWN = {
	'塔外花田|world.flower_warned': '阶段 4 待搬家：`<<link>>` 里的条件文案（花警告）',
	'门厅|world.hall_hint': '阶段 4 待搬家：门厅提示位点的手写分支',
	'门厅|ev.hall_seen': '阶段 4 待搬家：门厅「看钉」位点的手写分支（与 hall_hint 同一条笔记两源）',
	'书房|world.study_hint': '阶段 4 待搬家：书房提示位点的手写分支',
	'书房|ev.study_found': '阶段 4 待搬家：书房暗格位点的手写分支（知识并入 study_hint）',
	'Game Tables|ev.failure_cause': '声明表兼容读取：`Codex.clues[].test`（图鉴线索判定，阶段 4/5 待搬）',
	'Game Tables|ev.observation_lock': '声明表兼容读取：`Codex.clues[].test`（图鉴线索判定，阶段 4/5 待搬）',
	'Game Tables|ev.keeper_why': '声明表兼容读取：`Codex.clues[].test`（图鉴线索判定，阶段 4/5 待搬）',
	'Game Tables|ev.letter_seen': '声明表兼容读取：`Codex.clues[].test`（图鉴线索判定，阶段 4/5 待搬）',
	'Game Tables|ev.tav_tips': '声明表兼容读取：酒馆面板位点 `done/apply` 谓词（阶段 4/5 待搬）',
	'Game Tables|ev.tav_fog': '声明表兼容读取：酒馆面板位点 `done/apply` 谓词（阶段 4/5 待搬）',
	'Game Tables|ev.keeper_told': '声明表兼容读取：守林人面板位点 `done` 谓词（阶段 4/5 待搬）',
	'Game Tables|world.flower_warned': '声明表兼容读取：花警告（线索判定 ＋ 位点 `apply`）',
	'Game Tables|ev.witch_grip': '声明表兼容读取：老巫女面板位点 `done/apply` 谓词（阶段 4/5 待搬）',
};

// ── 源文件 → 段落清单（**注入式**：`read` 可换成 fixture，便于自证；判据不依赖被测对象）──
/** `:: 段落名 [tags]` 切段；注释**挖空但保留换行**（行号不漂）。 */
export const segmentsOf = (files, read = readFileSync) => {
	const out = [];
	for (const f of files) {
		const text = String(read(f, 'utf8'));
		const heads = [...text.matchAll(/^::\s*([^\n]*)\n/gm)];
		heads.forEach((m, i) => {
			const start = m.index + m[0].length;
			const end = i + 1 < heads.length ? heads[i + 1].index : text.length;
			const head = m[1];
			const tags = (head.match(/\[([^\]]*)\]/)?.[1] ?? '').trim().split(/\s+/).filter(Boolean);
			out.push({
				file: f, passage: head.replace(/\[[^\]]*\]\s*$/, '').trim(), tags,
				kind: tags.some((t) => MECH_TAGS.includes(t)) ? 'mech' : 'narr',
				layer: LAYER_OF[f] ?? 'story',
				line: text.slice(0, start).split('\n').length,
				// 注释挖空（不是删除）：`/% … %/` 里的示例不是代码，但行号要留住；
				// 机制段还要剥 JS 注释（`stripJsComments` 单一权威，与 `--text` 同口径）——否则表里的
				// 「示例」会被当成真读点（`--text` 就是这么被注释噪声推高的）。
				src: (() => {
					const t = text.slice(start, end).replace(/\/%[\s\S]*?%\//g, (c) => c.replace(/[^\n]/g, ' '));
					return (tags.some((x) => MECH_TAGS.includes(x)) ? stripJsComments(t) : t);
				})(),
			});
		});
	}
	return out;
};

/** 段落 → 字面状态读清单（`readKeys` 单一权威）。 */
export const scanReads = (segments) => {
	const out = [];
	for (const s of segments) {
		s.src.split('\n').forEach((l, i) => {
			for (const key of readKeys(l)) out.push({ file: s.file, passage: s.passage, kind: s.kind, line: s.line + i, key });
		});
	}
	return out;
};

/** 知识键索引：限定键 → 笔记 id（走 `notePaths` 单一权威）。 */
export const knowledgeIndex = (entries) => {
	const M = new Map();
	for (const [id, ps] of notePaths(entries)) for (const p of ps) M.set(p, id);
	return M;
};

/** 面：故事面（`stories/**`）／机制面（其余）。 */
export const faceOf = (hit) => (String(hit.file).startsWith(STORY_PREFIX) ? 'story' : 'mech');

/** ② 故事面的知识键直读 —— `[{ …, note, known }]`（`known` ＝ 在基线里）。 */
export const knowledgeHits = (hits, know, known = READ_KNOWN) =>
	hits.filter((h) => faceOf(h) === 'story' && know.has(h.key))
		.map((h) => ({ ...h, note: know.get(h.key), known: `${h.passage}|${h.key}` in known }));

/** ② 基线判据：新增（必须红）／腐烂（只报告）。 */
export const baselineProblems = (khits) => ({
	fresh: khits.filter((h) => !h.known),
	stale: Object.keys(READ_KNOWN).filter((k) => !khits.some((h) => `${h.passage}|${h.key}` === k)),
});

// ── ① 条件表行（读侧）────────────────────────────────────────────────────
const KEYS_OF = ['req', 'any', 'exclude', 'prereq', 'yields'];
const asList = (x) => (Array.isArray(x) ? x.map(String) : x ? [String(x)] : []);
/** 条件表行的读侧判据 ⇒ `[{ id, field, what, detail }]`（空＝干净）。 */
export const tableReadProblems = (rows) => {
	const out = [];
	for (const r of rows ?? []) {
		if (!r?.id) continue;
		for (const field of KEYS_OF) for (const k of asList(r[field])) {
			if (!/^(n_[a-z0-9_]+|[a-z_]\w*|(?:ev|world)\.[a-z_]\w*)$/.test(k)) out.push({ id: r.id, field, what: '键形态', detail: k });
			for (const key of readKeys(k)) out.push({ id: r.id, field, what: '字面状态读', detail: key });
		}
		for (const key of readKeys(r.text ?? '')) out.push({ id: r.id, field: 'text', what: '字面状态读', detail: key });
	}
	return out;
};

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
			['正例：知识键在叙事段直读 ⇒ 命中（`know` 索引单一权威）', knowledgeHits(scanReads(segmentsOf(['stories/x.twee'], () => ':: P\n<<if $pc.ev.a>>x<</if>>\n')), new Map([['ev.a', 'n_a']])).length === 1],
			['边界：非知识键（世界态）不在②的扫描面内（走③报告）', knowledgeHits(scanReads(segmentsOf(['stories/x.twee'], () => ':: P\n<<if $pc.world.b>>x<</if>>\n')), new Map([['ev.a', 'n_a']])).length === 0],
			['🔴 反例：故事面新增知识键直读（不在基线）⇒ `fresh` 非空', baselineProblems([{ passage: '新段', key: 'ev.new', known: false }]).fresh.length === 1],
			['边界：基线内 ⇒ 不算新增（但仍在清单里，收口时归零）', baselineProblems([{ passage: '书房', key: 'ev.study_found', known: true }]).fresh.length === 0],
			['反沉默：注释里的示例不算读（`/% … %/` 挖空）', scanReads(segmentsOf(['stories/x.twee'], () => ':: P\n/% <<if $pc.ev.a>> %/\n正文\n')).length === 0],
			['反沉默：机制段的 JS 注释也不算读（`stripJsComments` 单一权威，与 `--text` 同口径）', scanReads(segmentsOf(['stories/z.twee'], () => ':: T [script]\n// 示例：pc.ev.a 读法\n正文\n')).length === 0],
			['机制段（`[script]`）不算叙事面（它走③的报告面）', scanReads(segmentsOf(['stories/z.twee'], () => ':: T [script]\npc.ev.a = true\n'))[0].kind === 'mech'],
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
	const kh = knowledgeHits(hits, know);
	const { fresh, stale } = baselineProblems(kh);
	for (const h of fresh) { console.log(`  ✗ 知识键字面直读（基线外）：${h.file}:${h.line} 段落「${h.passage}」${h.key}（笔记 ${h.note}）——请走 \`Sg.notes.has('${h.note}')\` 或搬进条件表`); bad++; }
	if (stale.length) console.log(`  · 基线已修好（请从 READ_KNOWN 删除这些条目）：${stale.join('、')}`);
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
