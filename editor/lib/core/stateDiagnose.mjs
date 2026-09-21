// `#877`（P2 第二片）**状态读写诊断·纯件（第一块：形状与对齐）** ✓
//
// 为什么在这一层：页面要"**编辑即诊断**" ✓ ⇒ 判定必须**能在浏览器里跑** ✗（子进程门跑不了 ✓）。
//   ⇒ 于是把"判定"抽到 core（纯 ✓ 无 io ✓）、**事实由调用方注入** ✓：
//   · **页面**只有包内事实 ⇒ 喂得出就判 ✓、喂不出就打 `info`「本件不适用」✓（照 `editor/lib/core/diagnose.mjs` 同形 ✓ **不是 error** ✗）；
//   · **CLI 门**（`stories/mist-forest/gates/notes.mjs`）把从 twee／引擎取到的事实**注入同一份判定** ✓ ⇒ **一处实现 · 两份输入** ✓（不是两份实现 ✗）。
//
// 与 `editor/lib/core/diagnose.mjs` 的**同形契约**（逐项 ✓）：
//   · 返回 `[{ level, step, detail, target: { event, field } }]` ✓ —— 四键同名同义 ✓；
//   · `level` 取值只用 `error`／`warn`／`info` ✓；
//   · 输出**显式排序** ✓ 且键**逐字相同**：`` `${event}|${field}|${detail}` `` ✓
//     （⇒ 两侧对**同一份输入**必须得到**逐字节相同**的 findings ✓；④ 类缺陷"读数里掺环境"由此可检 ✓）；
//   · "不适用"形 ＝ `level: 'info'`, `step: 'applicable'` ✓；
//   · 渲染**不在这里重写** ✗ ⇒ 用 `diagnose.mjs` 的 `formatFinding`／`summarize` ✓。
//   · 差异（**已声明** ✓）：本件 `step` 用 `'shape'` ✓（`diagnose.mjs` 用 `row`／`package`／`applicable` ✓）—— 两者不冲突 ✓，但**是**一个面差异 ✓。
//   · `step` **取值集合**（契约处写清 ✓ —— `level` 有三值约束 ✓、`step` 本来没有 ⇒ 分叉最容易从这兒漏 ✗）：
//     `diagnose.mjs` ✓：`row` ／ `package` ／ `applicable`；本件 ✓：`shape`（形状与对齐 ✓）／`source`（源用法 ✓）／`consumption`（消费可数 ✓）。
//     ⇒ 新加 `step` 值必须**先声明** ✓（否则就是未声明的形状分叉 ✗）。`target.field` 同理：本件统一 `'flagPath'` ✓。
//
// 本块（#877 第一块）：`auditShape` —— 笔记条的**字段齐全 ＋ 状态契约域对齐** ✓。
//   ⇒ 它是**自足**的 ✓（只用本文件的常量与局部助手 ✓，不拉 `scripts/**` ✓）⇒ 因此可先落 ✓。
//
// ⚠️ **已抽 / 未抽**（件名声称的比现在交付的多 ✗ ⇒ 必须写明，免得下一个人以为漏了 ✓）：
//   · **已抽** ✓：`auditShape` ✓（＋它的两个局部助手 `flagPaths`／`keyOf` ✓）
//     ＋ **源用法三条** ✓：`notepathProblems`／`singleReadProblems`／`singleWriteProblems` ✓
//     ＋ **消费可数** ✓：`auditConsumption` ✓（外部依赖只有 `flagPaths`／`keyOf` ✓ 两者已在 core ✓）
//     ＋ **表行读点** ✓：`rowReads` ✓（`#877` 第四块 ✓ —— 依赖 `ruleRowKeys` ✓，它随 `#881` 进了 `./audit-shared.mjs` ✓）
//   · **已抽·另一门** ✓（`#877` 第四块 ✓）：`stories/mist-forest/gates/reads.mjs` 的同族六个 ✓ ——
//     `scanReads`／`knowledgeIndex`／`faceOf`／`knowledgeHits`／`baselineProblems`／`tableReadProblems` ✓
//     （＋四个常量 `STORY_PREFIX`／`READ_KNOWN`／`KEYS_OF`／`asList` ✓）。
//     ⚠️ 该门的 **io 那一半留在门里** ✗（`segmentsOf()` 吃 `readFileSync` 默认值 ✗ · `storyReadBaseline()` 吃 `loadStoryAudit`／`ROOT` ✗）
//     —— `lib/core/**` **不得碰宿主** ✗（K6 ③ ✓）。
//   · **不涉及** ✗：`info`／`applicable` 那条路 —— 已抽的判定对**任何包**都适用 ✓ ⇒ 无"缺面"可言 ✓；
//     "缺面逐行 `info`"要等吃 twee／引擎事实的那几块才出现 ✓。
//   · **已知形状差（已声明 ✓）** ✗：源用法三条的 `step` 用 `'source'` ✓（平列于 `row`／`package`／`applicable`／`shape` ✓）；
//     且它们曾经返回的 `where`（命中的源文件 ✓）**不再返回** ✗ —— 因为**无人消费** ✓（门只打 `id`／`detail` ✓）。
//     将来显示侧若要"去哪看" ⇒ 那是一次**跨片**的形状扩展（`target.where` ✓），归显示侧与复核席 ✓。

import { condKeysOf, literalReadKeys, notePaths, ruleRowKeys } from './audit-shared.mjs';

const REQUIRED = ['title', 'src', 'body', 'tags', 'era', 'flagPath'];
// `flagPath` 可以是字符串或**字符串数组**（多源 OR，`#432-B8/B12`）
export const flagPaths = (e) => (Array.isArray(e?.flagPath) ? e.flagPath : (e?.flagPath == null ? [] : [e?.flagPath]));
/** 「域.键」⇒ 键 ✓（`auditShape` 与门里「空状态」检查**共用** ✓ ⇒ 必须转出 ✓ —— 删本地副本时它是第三个消费者 ✓）。 */
export const keyOf = (p) => String(p ?? '').split('.').pop();

/** 内部：造一条 finding（**同形** ✓；渲染交给 `diagnose.mjs` 的 `formatFinding` ✓）。 */
const finding = ({ level = 'error', step = 'shape', detail, event = null, field = null }) =>
	({ level, step, detail, target: { event, field } });

/**
 * **形状与对齐** ✓：`entries` ＝ 笔记表（`{ id: {...} }`）· `domainKeys` ＝ **状态契约域**的键集（Set ✓）。
 * 判：① 每条笔记字段齐全 ✓ ② `grant` 要么是函数要么省略 ✓ ③ 每个 `flagPath` 是「域.键」形状 ✓ 且其键**已登记在契约域** ✓。
 * ⚠️ `detail` 文案与搬家前**逐字相同** ✓（门输出逐字节不变 ✓）；结构化 `field` 是**纯加法** ✓（不打印 ✗，只给判据用 ✓）。
 */
export const auditShape = (entries, domainKeys) => {
	const out = [];
	for (const [id, e] of Object.entries(entries ?? {})) {
		for (const f of REQUIRED) {
			const v = e?.[f];
			const empty = v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
			if (empty) out.push(finding({ detail: `缺字段「${f}」`, event: id, field: f }));
		}
		if (e?.grant != null && typeof e.grant !== 'function') out.push(finding({ detail: 'grant 必须是函数或省略（省略＝用 flagPath 求值）', event: id, field: 'grant' }));
		for (const p of flagPaths(e)) {
			const key = keyOf(p);
			// 「域.键」形状：域只能是 ev / world（笔记读的是知识与世界态；持有物不进笔记——#432-B11）
			if (!/^(ev|world)\.[a-z_]\w*$/.test(String(p ?? ''))) out.push(finding({ detail: `flagPath「${p}」不是「域.键」形状（应为 ev.<键> 或 world.<键>）`, event: id, field: 'flagPath' }));
			else if (!domainKeys.has(key)) out.push(finding({ detail: `flagPath 的键「${key}」未登记在状态契约域（--state）里`, event: id, field: 'flagPath' }));
		}
	}
	// **排序键与 `diagnose.mjs` 逐字相同** ✓（⇒ "重叠面逐字节相同"可检 ✓、且不掺外部顺序 ✓）
	return out.sort((a, b) => `${a.target.event}|${a.target.field}|${a.detail}`.localeCompare(`${b.target.event}|${b.target.field}|${b.detail}`));
};

/** 内部：造一条**消费可数** finding ✓ —— `step: 'consumption'` ✓（与 `shape`／`source` 并列 ✓）。
 *  `field` 统一用 `'flagPath'` ✓（判的是它那串键有没有读点 ✓；要改的辅助面 `bookkeeping` 写在 `detail` 里 ✓）。 */
const consFinding = ({ detail, event = null }) => ({ level: 'error', step: 'consumption', detail, target: { event, field: 'flagPath' } });

/** **消费可数**（`#436` 原范围 2）：每条笔记至少要有一个读点 ✓；零读者必须在 `Game.State.bookkeeping` 里
 *  带理由声明 ✓，而声明了“零消费”却又真的被读 ⇒ **僵尸豁免**（红）✓。
 *  ⚠️ 外部依赖只有 `flagPaths`／`keyOf` ✓ —— **两者已在 core** ✓ ⇒ 本函数**不需要**前置切片 `#881` ✓。
 *  ⚠️ `detail` 文案与搬家前**逐字相同** ✓（门输出逐字节不变 ✓）。 */
export const auditConsumption = (entries, reads, bookkeeping, refText, declaredNotes = null) => {
	const out = [];
	const bk = new Set(bookkeeping ?? []);
	const refs = String(refText ?? '');
	for (const [id, e] of Object.entries(entries ?? {})) {
		const paths = flagPaths(e);
		const keys = paths.map(keyOf);
		// 读点表按**限定键**（`ev.tav_fog`）建 ⇒ 用 flagPath 原样查（`world.x` 与 `ev.x` 是两个域，不可混——#365）
		let consumers = 0;
		for (const p of paths) consumers += (reads.get(p)?.size ?? 0);
		// 阶段 2/4 形态：笔记 id 被条件/表引用（`note:n_x` 或 `Sg.notes.has('n_x')`）
		const byId = (new RegExp(`(?:note:${id}\\b|Sg\\.notes\\.(?:has|entry)\\(\\s*['"]${id}['"])`).test(refs) || (declaredNotes?.has?.(id) ?? false)) ? 1 : 0;
		const declaredZero = keys.some((k) => bk.has(k));
		if (consumers === 0 && !byId && !declaredZero) {
			out.push(consFinding({ event: id, detail: `**零消费**：没有任何读点消费它（键 ${keys.map((k) => '`' + k + '`').join('/')}）—— 加了线索没人用；若确属「仅记账」请登记进 \`Game.State.bookkeeping\`（带理由）` }));
		}
		if ((consumers > 0 || byId) && declaredZero) {
			out.push(consFinding({ event: id, detail: `**僵尸豁免**：\`Game.State.bookkeeping\` 把它声明成"零消费"，但实际已有了消费点 ⇒ 请删掉那条声明` }));
		}
	}
	return sortFindings(out);
};

/** 内部：造一条**源用法** finding ✓ —— `step: 'source'` ✓（平列于 `row`／`package`／`applicable`／`shape` ✓）。
 *  `field` 统一用 `'flagPath'` ✓（＝**该去改的那个字段** ✓；精确位置（哪个源文件、哪条路径）在 `detail` 里 ✓）。 */
const srcFinding = ({ detail, event = null, level = 'error' }) => ({ level, step: 'source', detail, target: { event, field: 'flagPath' } });

const sortFindings = (out) => out.sort((a, b) => `${a.target.event}|${a.target.field}|${a.detail}`.localeCompare(`${b.target.event}|${b.target.field}|${b.detail}`));

/** **`<<notepath>>` 的 id/path 必须与笔记登记一致** ✓（`#437` C-2b′）。
 *  ⚠️ `detail` 文案与搬家前**逐字相同** ✓；曾经返回的 `where`（源文件名 ✓）**不再返回** ✗（无人消费 ✓，门只打 `event`／`detail` ✓）。 */
export const notepathProblems = ({ entries = {}, sources = {} } = {}) => {
	const out = [];
	const ids = new Set(Object.keys(entries));
	const NP = /<<\s*notepath\s+['"](n_[a-z0-9_]+)['"]\s+['"]((?:ev|world)\.[a-z0-9_]+)['"]/g;
	const NOTE = /(?:<<\s*note\s+['"](n_[a-z0-9_]+)['"]|Sg\.notes\.add\(\s*['"](n_[a-z0-9_]+)['"])/g;
	for (const [f, src] of Object.entries(sources)) {
		const text = String(src ?? '').replace(/\/%[\s\S]*?%\//g, '');   // 注释里的示例不是代码
		for (const m of text.matchAll(NP)) {
			const [, id, path] = m;
			if (!ids.has(id)) { out.push(srcFinding({ event: id, detail: `\`<<notepath>>\` 的笔记 id「${id}」**未登记**（写进去读不出来）` })); continue; }
			if (!flagPaths(entries[id]).includes(path)) {
				out.push(srcFinding({ event: id, detail: `\`<<notepath>>\` 的 path「${path}」**不属于**该笔记的 \`flagPath\`（${flagPaths(entries[id]).join('／')}）——写进去读不出来` }));
			}
		}
		for (const m of text.matchAll(NOTE)) {
			const id = m[1] ?? m[2];
			const e = entries[id];
			if (!e || flagPaths(e).length <= 1 || e.setPath) continue;   // 未登记/单源/已声明 setPath ⇒ 不归本判据管
			out.push(srcFinding({ event: id, detail: `多源笔记用了 \`<<note>>\`／\`Sg.notes.add()\`——必须用 \`<<notepath "id" "path">>\` 声明**写哪一条**（或声明 \`setPath\`）` }));
		}
	}
	return sortFindings(out);
};

/** **单源笔记不得用 `readPath` 读**（`#437` C-2c-3 的判据面）—— 理由见 `stories/mist-forest/gates/notes.mjs` 的同名注释 ✓
 *  （多源笔记相反：那里 `readPath` 表达"**哪一条路径**拿到了" ⇒ 必须保留 ✓）。基线腐烂即红 ✓。 */
export const singleReadProblems = ({ entries = {}, sources = {}, baseline = {} } = {}) => {
	const out = [];
	const pathInfo = new Map();   // 'ev.x' → { id, multi }
	for (const [id, e] of Object.entries(entries)) {
		const ps = Array.isArray(e?.flagPath) ? e.flagPath : (e?.flagPath == null ? [] : [e.flagPath]);
		for (const p of ps) if (p) pathInfo.set(String(p), { id, multi: Array.isArray(e.flagPath) });
	}
	const seen = new Set();
	for (const [f, src] of Object.entries(sources)) {
		const text = String(src ?? '').replace(/\/%[\s\S]*?%\//g, '');
		for (const m of text.matchAll(/Sg\.notes\.readPath\(\s*[^,()]+,\s*['"]((?:ev|world)\.[a-z_]+)['"]/g)) {
			const info = pathInfo.get(m[1]);
			if (!info || info.multi) continue;                    // 未登记/多源 ⇒ 不归本判据管
			const key = `${f}::${m[1]}`;
			seen.add(key);
			if (!baseline[key]) out.push(srcFinding({ event: info.id, detail: `单源笔记用 \`readPath\` 读 ⇒ 应为 \`Sg.notes.has('${info.id}')\`（path 即唯一来源，两者等价；改用 has 后旗标才能从读侧退场）` }));
		}
	}
	// 腐烂：基线里登记了、但**现在已不再命中**（修好了）⇒ 报，逼你删（本仓既有纪律）
	for (const [key, why] of Object.entries(baseline ?? {})) {
		if (seen.has(key)) continue;
		out.push(srcFinding({ event: key, detail: `基线腐烂：「${key.split('::')[1]}」已不再以 \`readPath\` 形式出现（修好了就删基线）——登记理由：${why}` }));
	}
	return sortFindings(out);
};

/** **单源笔记不得走 `<<notepath>>`／`addPath()`**（`#733` 片 2）—— 理由见门上同名注释 ✓。 */
export const singleWriteProblems = ({ entries = {}, sources = {} } = {}) => {
	const out = [];
	const multi = (id) => Array.isArray(entries?.[id]?.flagPath);
	for (const [f, src] of Object.entries(sources)) {
		const text = String(src ?? '').replace(/\/%[\s\S]*?%\//g, '');
		for (const m of text.matchAll(/<<\s*notepath\s+['"](n_[a-z0-9_]+)['"]\s+['"](?:ev|world)\.[a-z0-9_]+['"]/g)) {
			if (multi(m[1])) continue;
			out.push(srcFinding({ event: m[1], detail: `**单源**笔记走了 \`<<notepath>>\`（写那条旗标已无读者）⇒ 应改用 \`<<note "${m[1]}">>\`（issue #733 片 2）` }));
		}
		for (const m of text.matchAll(/Sg\.notes\.addPath\(\s*['"](n_[a-z0-9_]+)['"]/g)) {
			if (multi(m[1])) continue;
			out.push(srcFinding({ event: m[1], detail: `**单源**笔记走了 \`addPath()\` ⇒ 应改用 \`Sg.notes.add('${m[1]}')\`（issue #733 片 2）` }));
		}
	}
	return sortFindings(out);
};

// ── `#877` 第四块：`rowReads` ＋ `reads.mjs` 同族六个（`#435` 阶段 4 的**读侧**判据）─────────────
// 为什么在这一层 ✓：两门是**子进程门** ⇒ 页面里跑不了 ✗；P2 要的是"**编辑即诊断**、不落盘也能看见" ✓
//   ⇒ 判定抽 core（纯 ✓ 无 io ✓）、**事实由调用方注入** ✓（照 `#875`／本件前四块的同形契约 ✓）。
// `#881` 先把两门依赖的纯帮手搬进 `./audit-shared.mjs` ✓ ⇒ 本块才是**真·纯搬运** ✓
//   （握手两条：两门输出**逐字节不变** ✓ ＋ 两门自证的期望值**逐字不变** ✓）。
// ⚠️ **io 那一半留在门里** ✗：`segmentsOf()`（吃 `readFileSync` 默认值 ✗）／`storyReadBaseline()`
//   （吃 `loadStoryAudit`／`ROOT` ✗）—— `lib/core/**` **不得碰宿主** ✗（K6 ③ ✓）。

/** **表行读点**（`#435` 前置 0 ✓）：`req`/`any`/`exclude` ⇒ 限定键 ⇒ 读点集合（`Map`）。
 *  阶段 4 之后**表行就是读点** ✓（求值走 `Sg.notes`／`Sg.rules` 封装层 ✓）；不收进来 ⇒ 条件从段落搬进表后
 *  那些笔记会被判「**零消费**」（假红：搬家反而把笔记判死 ✗ —— 实测过 ✓）。
 *  键与域的对应走**单一权威** `ruleRowKeys()` ✓（与 `--state` 的"有写有读"同一份 ✓）。 */
export const rowReads = (rows, entries) => {
	const M = new Map();
	for (const r of rows ?? []) for (const k of ruleRowKeys(r, entries)) {
		if (!M.has(k)) M.set(k, new Set());
		M.get(k).add(`表行:${r?.id ?? '?'}`);
	}
	return M;
};

/** 故事面前缀：`stories/**` ⇒ `'story'` 面；其余 ⇒ `'mech'` 面 ✓。
 *  （`SOURCE_ROOTS` 是 `['src','stories']` ✓ —— `module-order.mjs` 单一权威 ✓；本件按「故事 vs 机制」分面 ✓。） */
export const STORY_PREFIX = 'stories/';
/** 引擎侧**默认空基线** ✓。`#602`：基线属**该故事的数据** ✗ ⇒ 真实基线**由调用方注入** ✓
 *  （故事侧 `Sg.story.readBaseline()` ✓；门侧经 `loadStoryAudit()` 取 ✓）。 */
export const READ_KNOWN = {};
const KEYS_OF = ['req', 'any', 'exclude', 'prereq', 'yields'];
// 注意**不要**先 `String()`：条件项可能是**对象算子形**（`{ gte: ['star.spent', 3] }`，另票 #491）
const asList = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);

/** 段落 → 字面状态读清单（`readKeys` 单一权威）。 */
export const scanReads = (segments) => {
	const out = [];
	for (const s of segments) {
		s.src.split('\n').forEach((l, i) => {
			for (const key of literalReadKeys(l)) out.push({ file: s.file, passage: s.passage, kind: s.kind, line: s.line + i, key });
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
export const baselineProblems = (khits, known = READ_KNOWN) => ({
	fresh: khits.filter((h) => !h.known),
	stale: Object.keys(known).filter((k) => !khits.some((h) => `${h.passage}|${h.key}` === k)),
});

/** 条件表行的读侧判据 ⇒ `[{ id, field, what, detail }]`（空＝干净）。 */
export const tableReadProblems = (rows) => {
	const out = [];
	for (const r of rows ?? []) {
		if (!r?.id) continue;
		for (const field of KEYS_OF) for (const k of asList(r[field]).flatMap(condKeysOf)) {
			// `#435` 键形：note id ∕ 裸键（默认 `ev.`）∕ **任意域的状态路径**（`ev.`/`world.`/`keeper.`/`star.`…）∕
			// 两种**前缀键**（`inv:<道具>`／`era:<时代>`，求值在引擎侧 `Sg.rules.holds()`）。
			// 修正①（2026-09-14）：原先只放行 `ev|world` 两域 ⇒ **误杀 `keeper.met`/`star.spent`** 这类第三命名空间。
			// ⚠️ `#1156` **实测结论：此处不换 `readKeyFamily`** ✗ —— "**可读**（引擎能否取值）"与"**合法键形**（契约面口径）"
			//   是**两个概念**：引擎对 `$pc.ev.x`／`nope:zzz` 都能兜底取值（宽 ✓），但契约面**必须拒**它们 ✗。
			//   证据（`#1156` 的反例读数）：换成族判定后 `test/web-read-faces.mjs` 的 ④ 刀 由 **3 → 2** 项
			//   （`synth` 里 `A`＝`'$pc.ev.x'` 不再被报 ⇒ 一条真判据被削弱 ✗），而 **`audit-golden` 当时仍绿** ✓
			//   ⇒ 记账：**"逐字节不变" ≠ "行为不变"**（golden 数据里没有这类键 ⇒ 抓不到 ✗）；**反例才是判据还在的证据** ✓。
			//   ⇒ 所以此判据**保持原契约口径**（含 `era:` 只认 past/present ✓ 含 `:` 但非已知族 ⇒ 拒 ✓）；`readKeyFamily`
			//   的用途限于**读点面**（`declCondRefs` ✓）与**成对断言**（锁引擎真源 ✓）—— 不越界到契约面 ✓。
			if (!/^(n_[a-z0-9_]+|[a-z_]\w*|[a-z_]\w*\.[a-z_]\w*|inv:.+|era:(?:past|present)|gear:.+|codex:.+)$/.test(k)) out.push({ id: r.id, field, what: '键形态', detail: k });   // \`#1132\`：白名单加 \`codex:.+\`（读取面键形 ✓）
			for (const key of literalReadKeys(k)) { if (/^codex:/.test(key)) continue; out.push({ id: r.id, field, what: '字面状态读', detail: key }); }   // `#1132`：`codex:` 是读取面键形 ⇒ 不算「字面状态读」
		}
		// `#1132`：`text` 面**不该**出现 `codex:`（它住 `req/exclude` 条件字段 ✓）⇒ 此排除为**对称性保险** ✓
		//   （万一将来有人误写进 text ⇒ 不报 problem 比报好 ✓；评审裁定：留它 ✓ 不删 ✓）。
		for (const key of literalReadKeys(r.text ?? '')) { if (/^codex:/.test(key)) continue; out.push({ id: r.id, field: 'text', what: '字面状态读', detail: key }); }
	}
	return out;
};
