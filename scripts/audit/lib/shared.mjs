// `#580`：注释遮蔽＝**一处**（`mask.mjs`，单扫描器按词法一次遮蔽）。写点/读点提取一律先遮后扫——
// 否则注释里的示例会变成"真的写了/真的读了"（实测：引擎 JS 注释里的 `<<setflag "flower_taken">>`
// 让 `--consequences` 把该键当成每个故事都写了 → 不声明它的故事假红）。
import { maskComments } from './mask.mjs';
export { maskComments };   // `#1208`：代码面正解经 hub 转出（审计门一律用它）
import { asListOf, KEY_PREFIX_RE, OPS, WRAPPED_READ_RE, condKeysOf, declCondRefs, notePaths, noteReadRefs, bareKey, wrappedReadKeys } from '../../../editor/lib/core/audit-shared.mjs';
import { WRITE_PATTERNS, rowOps, noteWriteKeys, noteWriteRefs, notePathWriteRefs, NOTE_PATH_WRITE_RE, NOTE_WRITE_RE, declaredNoteWriteRefs, DECLARED_NOTE_WRITE_RE, conditionReadsFlag, noteReadKeys, noteRefs, NOTE_REF_RE } from '../../../editor/lib/core/audit-shared.mjs';
export { WRITE_PATTERNS, rowOps, noteWriteKeys, noteWriteRefs, notePathWriteRefs, bareKey, NOTE_PATH_WRITE_RE, NOTE_WRITE_RE, declaredNoteWriteRefs, DECLARED_NOTE_WRITE_RE, conditionReadsFlag, noteReadKeys, noteRefs, NOTE_REF_RE };   // `#215` E-B1：定义已上移 core → 本处**只转出**（不算定义）
export { DECL_COND_RE, KEY_PREFIX_RE, OPS, READ_PATTERNS, WRAPPED_READ_RE, condKeysOf, declCondRefs, literalReadKeys, notePaths, readKeys, ruleRowKeys, stripProseComments, wrappedReadKeys } from '../../../editor/lib/core/audit-shared.mjs';

// ── 写点识别：**单一权威**（#476 复核建议）──────────────────────────────────
// 此前 `shared.mjs`（D2 分类器）与 `gates/state.mjs` 各写一份字面量 → **漂移过一次**：
// shared 只认 `= true`、state 认任意赋值 → D2 门看不见 `= null`／对象写点（#476 修的正是这个洞）。
// → 形态只此一处，两处消费方都从这里取。
// **隐含约束**：旗标键必须匹配 `[a-z_]\w*`（大写/数字开头会被静默漏检）——用 `keyCharsetViolations` 兜住。
export const KEY_CHARSET = /^[a-z_]\w*$/;
export const writeKeys = (text) => {
	const out = new Set();
	const masked = maskComments(text);
	for (const { re } of WRITE_PATTERNS) for (const m of masked.matchAll(re)) out.add(m[2] ?? m[1]);
	return out;
};
/** 限定键（`ev.x` / `world.x`；--state 用）。 */
export const qualifiedWriteKeys = (text) => {
	const out = [];
	const masked = maskComments(text);
	for (const { re, kind } of WRITE_PATTERNS) for (const m of masked.matchAll(re)) out.push(kind === 'scoped' ? `${m[1]}.${m[2]}` : `${kind}.${m[1]}`);
	return out;
};
/** 键形态违规：`pc.ev.Bad` 这类键会被上面的正则**静默漏检** → 单独兜住。 */

export const keyCharsetViolations = (text) =>
	[...String(text).matchAll(/\bpc\.(?:ev|world)\.([A-Za-z_$][\w$]*)/g)].filter((m) => !KEY_CHARSET.test(m[1])).map((m) => m[1]);

export const yieldsList = (row) => asListOf(row?.yields).map((y) => (y && typeof y === 'object' && !Array.isArray(y)
	? { id: String(y.id ?? ''), path: y.path ? String(y.path) : null }
	: { id: String(y), path: null }));


export const NOTE_WRITE_API_RE = /Sg\.notes\.add(?:Path)?\(/;
export const condTextOf = (cond) => {
	// 对象算子形 → 取它的**键**再合成（阈值/算子不影响"这段文本是否提到该旗标"这一判据）
	if (cond && typeof cond === 'object' && !Array.isArray(cond)) return condKeysOf(cond).map(condTextOf).join(' ');
	const k = String(cond);
	return k.startsWith('n_') ? `Sg.notes.has('${k}')` : `$pc.${k.includes('.') ? k : `ev.${k}`}`;
};
/** 条件表行的 **`sets` 写点**（`#435` Q1：授予家族第三类——状态键写点也搬进表）。与 `ruleRowKeys()` 同命名空间：
 * 裸键默认 `ev.`（与 `Sg.rules.holds()` 同口径）；写世界态请写全 `world.x`；note id／前缀键不是状态键 → 跳过。 */
export const ruleRowSetKeys = (row) => (Array.isArray(row?.sets) ? row.sets : row?.sets ? [row.sets] : [])
	.map(String).filter((k) => !KEY_PREFIX_RE.test(k) && !k.startsWith('n_')).map((k) => (k.includes('.') ? k : `ev.${k}`));

export const noteWriteFlags = (text, entries) => noteWriteKeys(text, entries).map((k) => k.replace(/^(ev|world)\./, ''));

// ── 条件表**行**引用的裸键（`#435` 阶段 4）：`req`/`any`/`exclude` 里的键名/笔记 id ────────────
// 为什么要它：条件从段落搬进表之后，D2 的"正文条件消费"（`hasIf`）会**看不见**这个读点 →
// 键被判「只在引擎段落被读」→ 假红（阶段 4 版本的"新形状"）。归属按行的 **`scope`**（＝哪一段）算。
export const ruleRowFlags = (row, entries) => {
	const paths = notePaths(entries);
	const out = new Set();
	for (const key of [...asListOf(row?.req), ...asListOf(row?.any), ...asListOf(row?.exclude)].flatMap(condKeysOf)) {
		if (KEY_PREFIX_RE.test(key)) continue;   // 同 `ruleRowKeys()`：前缀键不是旗标，不参与分级
		if (key.includes('.') && !/^(?:ev|world)\./.test(key)) continue;   // 同上：第三命名空间不是旗标
		// `#1223` 重建：`n_x` 折到 canonical `ev.notes.n_x`（与写侧同键 -> 两侧可直比、无需注册表）
		// `#1223` rebuild: same rule on both sides -- strip the prefix before the bucket test, so emit the
		// **bare** key `notes.<key>` here (emitting `ev.notes.<key>` would not match `written`, and the
		// consumer would then be misread as engine-passage-only).
		if (key.startsWith('n_')) out.add(`notes.${key}`);
		else out.add(key.replace(/^(ev|world)\./, ''));
	}
	return [...out];
};
// 旗标（裸键）→ 引用它的笔记 id 数组（`#433`：门按旗标判"谁读了它"时要用）
/** `#785`：**声明式写点**（效果从函数搬进声明之后的唯一来源）——
 * · `sets`（状态键；裸键按 `ev.` 补域）；
 * · `yields`／`yield` 指向的**笔记** → 其 `flagPath` 的键。
 * 返回**按域限定**的键（`ev.x`／`world.x` —— 与读侧同域才可比）；调用方要裸键自己剥（`consequences`）。
 *注意：只吃**注入的行**（不读环境 —— 读环境会污染自证夹具，本轮实测过一次）。
 * 为何抽成一处：`--consequences`（写点集合）与 `--state`（写/读域匹配）都要它 → **一处定义**
 *（两处各写一份会各自漂移 —— `declCondRefs` 上刚吃过同款）。 */
export const declWriteKeys = (rows, notes) => {
	const paths = notePaths(notes);
	const out = [];
	const push = (k) => { const v = String(k ?? '').trim(); if (v && !out.includes(v)) out.push(v); };
	for (const r of rows ?? []) {
		for (const k of (Array.isArray(r?.sets) ? r.sets : (r?.sets ? [r.sets] : []))) push(String(k).includes('.') ? String(k) : `ev.${k}`);
		for (const y of [...(Array.isArray(r?.yields) ? r.yields : (r?.yields ? [r.yields] : [])), ...(r?.yield != null ? [r.yield] : [])]) {
			const raw = String(y ?? '');
			const noteId = raw.startsWith('note:') ? raw.slice(5) : (raw.startsWith('n_') ? raw : null);
			if (!noteId) continue;
			// `#1223` 重建：声明式写点同样折 canonical（不再经 flagPath 注册表）
			push(`ev.notes.${noteId}`);
		}
	}
	return out;
};

export const noteIdsForFlag = (entries) => {
	const M = new Map();
	for (const [id, ps] of notePaths(entries)) {
		for (const p of ps) {
			const f = p.replace(/^(ev|world)\./, '');
			if (!M.has(f)) M.set(f, []);
			M.get(f).push(id);
		}
	}
	return M;
};
export const noteReadFlags = (text, entries) => {
	const paths = notePaths(entries);
	const ids = [...paths.keys()];
	const alt = ids.length ? `|Sg\\.notes\\.(?:has|entry)\\(\\s*['"](${ids.map((i) => i.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})['"]` : '';
	const re = new RegExp(`\\$pc\\.(?:world|ev)\\.([a-z_]\\w*)${alt}`, 'g');
	// `#437` 批二：表里的谓词改走封装层（`Sg.notes.readPath(p,'ev.x')`）之后，这条读点**不该消失**
	//（D2 按旗标分桶）→ 与 `readKeys()` 同源地把它也算进来。
	const wrapped = [...String(text ?? '').matchAll(new RegExp(WRAPPED_READ_RE.source, 'g'))].map((m) => `${m[1]}.${m[2]}`);
	const out = [], seen = new Set();
	for (const m of String(text ?? '').matchAll(re)) {
		const flags = m[1] ? [m[1]] : (paths.get(m[2]) ?? []).map((k) => k.replace(/^(ev|world)\./, ''));
		for (const f of flags) if (!seen.has(f)) { seen.add(f); out.push(f); }
	}
	for (const p2 of wrapped) {
		const f = p2.replace(/^(ev|world)\./, '');
		if (!seen.has(f)) { seen.add(f); out.push(f); }
	}
	return out;
};

export const makeShared = (ctx) => {
	const { Game, presets, passageSrc, passageRaw, passageTags, SRC_FILES, arg, wantAll } = ctx;
	// #342 F2：可**注入输入**（默认取闭包里的真实来源 → 向后兼容）。没有这一层，
	// 依赖本分类器的门（如 ⓪q 选择后果门）只能用真产物自证——那等于"用被测对象证明被测对象"。
	function classifyNarrativeState(input = {}) {
		const sources = input.passageSrc ?? passageSrc;
		const tags = input.passageTags ?? passageTags;
		// `#1261` 零故事模式：`Game.Echoes` 可能不存在（故事面缺席）⇒ 退化为空回声表，
		// 让门「无样本可判」而不是崩（`E.list` 是下游的硬读点）。
		const Echoes = input.Echoes ?? Game.Echoes ?? { list: [], revisit: [] };
		const Consequences = input.Consequences ?? Game.Consequences;
		// 注释（/% … %/）里的示例不是代码——先剥离，免得把文档里的 <<firstTime "X">> 当成真写入
		// `#580`：写点面来自**共享遮蔽**（原先只剥 `/% %/` → `//` JS 注释里的示例会泄漏成真实写点）
		const stripped = new Map([...sources.entries()].map(([n, src]) => [n, maskComments(src, { file: n })]));
		const isEngine = (name) => !!tags.get(name)?.some((t) => ['script', 'widget', 'stylesheet'].includes(t));
		const isEnding = (name) => name.startsWith('结局');
		// `hasIf`：这一段的**正文条件**是否消费了该旗标。两种形状都认（#433 阶段 2）：
		// ① 直接读 `<<if … $pc.ev.flag>>`；② 经笔记读 `<<if Sg.notes.has('n_flag')>>`（该笔记的 flagPath 含此旗标）
		const noteEntries = input.notes ?? Game.Notes?.entries ?? {};
		const notePathsById = notePaths(noteEntries);
		// `#1223` rebuild: `flagsByNote` (registry -> flagPath bare keys) **retired**;
		// consumption is judged by the canonical id (see `noteIdOfKey` below).

		const refsByPassage = new Map([...stripped.entries()].map(([n, src]) => [n, new Set(noteReadRefs(src))]));
		// #435 阶段 4：**条件表行**里的键也算「正文条件消费」——按行的 `scope`（＝哪一段）判它是不是叙事段落。
		// 否则条件一搬进表，D2 就看不见这个读点（键被判「只在引擎段落被读」→ 假红）。
		// 表的来源：优先**注入**（node 侧没有 `window` 全局 → 不能在这里直读 `Sg.story`），退回 `Game.Rules.entries`
		const rulesRows = input.rules ?? Game.Rules?.entries ?? [];
		const rowFlags = new Set();
		for (const r of rulesRows) {
			if (!r?.scope || isEngine(r.scope) || isEnding(r.scope)) continue;   // 只算**叙事**段落的行
			for (const f of ruleRowFlags(r, noteEntries)) rowFlags.add(f);
		}
		// `(段落名, 源码, 旗标)`：两种形状任一命中即算「这一段消费了该旗标」
		// `#581`：条件形态还包 `<<elseif>>`——原先只认 `<<if>>` → `<<elseif $pc.ev.X>>` 这类**叙事条件读**被漏掉，
		// 该键会被判“无任何桶”（假红）。方向只会把假红变绿：加宽的是“**条件读**”的识别，不是把所有读取都算进来。
		//（注：`cave_step` 那条**不是**这个原因——它读写都在 `[widget]` 段里，按门口径属引擎面；已单独登记。）
		const hasIf = (name, src, flag) => {
			if (new RegExp(`<<(?:if|elseif)[^>]*\\$pc\\.(?:world|ev)\\.${flag}\\b`).test(src)) return true;
			// `#437` 批三（**口径对齐**后的措辞）：知识键**直读归零**之后，叙事条件改走**封装层**
			//（`<<if Sg.notes.readPath($pc, 'ev.X')>>`）——这一段**仍然消费**了该旗标，不认它就会
			// "转一处、消费点丢一处"（`--consequences` 判「无任何桶」= 假红；实测 `hall_seen`/`study_found` 就是这样掉出来的）。
			// **两种读形状同权、同粒度**：上面的字面形态（`<<if … $pc.ev.X`）与这里的封装层形态都是
			// **段落级**判定（段落**任何位置**出现即算，纯装饰性读也算）→ 要收紧就**两形状一起收**
			//（只收封装层那条 = 口径又劈叉，等于把假红挪到另一侧）。接收者不限于 `$pc`（同 `WRAPPED_READ_RE`）。
			if (new RegExp(`Sg\\.notes\\.readPath\\(\\s*[^,()]+,\\s*['"](?:ev|world)\\.${flag}['"]`).test(src)) return true;
			// `#1223` rebuild: note-family keys are judged by the canonical id only.
			// The passage side records **note ids** (via `Sg.notes.has('n_x')` / `<<note>>`), which is the same
			// source as the write-side canonical `ev.notes.<id>` (bare form `notes.<id>`) -> compare ids directly,
			// **no longer through `flagsByNote`** (which folded the registry back to flagPath bare keys).
			const noteIdOfKey = (k) => {
				const t = String(k ?? '');
				if (t.startsWith('notes.')) return t.slice('notes.'.length);
				return t.startsWith('n_') ? t : null;
			};
			const noteId = noteIdOfKey(flag);
			return !!noteId && !!refsByPassage.get(name)?.has(noteId);
		};
		const written = new Set();
		for (const src of stripped.values()) {
			// 写点形态来自**单一权威** `WRITE_PATTERNS`（#476 复核建议：两处字面量曾漂移过一次）
			// ＋ #434 的笔记写点（`Sg.notes.add('n_x')` → 该笔记 flagPath 的裸键也算被写）
			for (const k of [...writeKeys(src), ...noteWriteFlags(src, noteEntries)]) written.add(k);
		}
		// `#785`：**声明式写点**也要计入 —— 效果从函数搬进声明后，本集合会漏掉它们 → `--consequences` 的
		// 写入旗标计数从 88 降到 82（**判据看不见**，不是真的少写；实测 6 个：tav_tips/tav_fog/flower_warned/
		// seer_gave/goblin_spared/forge_thanks，其中两格来自**规则行** → 只补 ask 会漏）。
		// 来源两类**都要**（只补 ask 会漏规则行那两格）；两者都**只吃注入**（`input.…`）——
		// 与 `rules` 同一约定：本函数在 node 侧跑，没有 `window` → 拿环境数据会**污染自证的合成夹具**
		//（我第一版写成 `?? Game.Social?.asks`，4 条自证当场红 —— 这正是"注入式"存在的理由）。
		// 写形两类**也要**：`sets`（状态键）＋ `yields`／`yield` 指向的笔记 → 其 `flagPath` 的裸键。
		// 写法走**单一权威** `declWriteKeys()`（与 `--state` 门共用 —— 两处各写一份必漂移）。
		for (const k of declWriteKeys([...(input.rules ?? []), ...(input.asks ?? [])], noteEntries)) {
			written.add(String(k).replace(/^(ev|world)\./, ''));
		}
		const E = Echoes;
		const echoFlags = new Set([...E.list.flatMap((e) => [e.cause.flag, e.cause.token]), ...E.revisit.flatMap((r) => [r.flag, r.inv])].filter(Boolean));
		const tblSrc = sources.get('Game Tables') ?? '';
		// `#437` 批二：图鉴桶的旗标集合 = 表里的**直读**（`p.ev.X`／`p.world?.X`）∪ **封装层读**
		//（`Sg.notes.readPath(p, 'ev.X')`）——此前只认前者，谓词改走封装层后它就静默失明了。
		// 注：这里**不**用 `readKeys()` 全量（它会把表里**字符串文案**中提到的 `pc.ev.notes` 也算成读点）。
		const codexFlags = new Set([
			...tblSrc.matchAll(/p\.(?:ev|world)\??\.(\w+)/g),
		].map((m) => m[1])
			.concat(wrappedReadKeys(tblSrc).map((k) => k.replace(/^(ev|world)\./, '')))
			// `#437` C-2c-3：**读侧兼容层退场**后图鉴/门判据改走 `Sg.notes.has('n_x')`（单源笔记的规范形状）
			// → 不认它就会"转一处、桶丢一处"（实测：转图鉴 5 处 → `--consequences` `codex×3 → codex×2 · engine?×1`；
			// 再转 NPC 3 处 → `--echoes` 分级 5 → 6）。`noteReadKeys` 只认**笔记引用**（不像全量 `readKeys()`
			// 会把表里字符串文案提到的 `pc.ev.notes` 也算成读点）。
			.concat(noteReadKeys(tblSrc, noteEntries).map((k) => String(k).replace(/^(ev|world)\./, ''))));
		// `#785` 第 1 族（读点收口）：线索判定从"手写谓词"改成**声明式条件**后，消费点住在**数据字符串**里
		//（`{ id, label, req: ['world.fog_thin']}`／`req: ['n_x']`）—— 上面三种全是**代码形状**扫描
		//（`p.ev.X`／`readPath`／`notes.has`）→ 一个都看不见它 → 图鉴桶"转一处、桶丢一处"，
		// 键被判「只在引擎段落被读」或「无任何桶」（实测 `#786` 9 段红全是这一族）。
		// → 补第四种来源 `declCondRefs()`（**声明式条件**的文本口径；对象口径另有 `ruleRowFlags()`，
		// 两者的一致性由本文件自证里的**交叉例**钉住，见下方 `--...` 自证）。
		const declCond = declCondRefs(tblSrc);
		const declCondFlags = [
			...declCond.states.map((k) => k.replace(/^(ev|world)\./, '')),
			...declCond.notes.flatMap((id) => (notePathsById.get(id) ?? []).map((q) => q.replace(/^(ev|world)\./, ''))),
		];
		for (const f of declCondFlags) codexFlags.add(f);
		const decl = { ...(Consequences?.provenance ?? {}), ...(Consequences?.engine ?? {}) };
		const prop = { ...(Consequences?.provenance ?? {}) };
		const buckets = new Map();
		const problems = [];
		for (const flag of written) {
			// 先算派生桶（echo 优先——回声表本身就是登记表），再校验声明是否与实况一致
			const narrHit = rowFlags.has(flag) || [...stripped.entries()].some(([n, src]) => !isEngine(n) && !isEnding(n) && hasIf(n, src, flag));
			const endHit = [...stripped.entries()].some(([n, src]) => isEnding(n) && hasIf(n, src, flag));
			const engHit = [...stripped.entries()].some(([n, src]) => isEngine(n) && hasIf(n, src, flag));
			let derived = null;
			if (echoFlags.has(flag)) derived = 'echo';
			else if (narrHit) derived = 'mechanic';
			else if (endHit) derived = 'ending';
			else if (codexFlags.has(flag)) derived = 'codex';
			else if (engHit) derived = 'engine?';
			if (flag in decl) {
				const claimed = flag in prop ? 'provenance' : 'engine';
				if (derived && derived !== 'engine?') problems.push(`「${flag}」声明为 ${claimed}，但实际属于 ${derived}——错标（声明与实况不一致）`);
				else if (!String(decl[flag] ?? '').trim()) problems.push(`「${flag}」声明缺理由（why）`);
				buckets.set(flag, claimed);
				continue;
			}
			if (derived === 'engine?') { buckets.set(flag, 'engine?'); problems.push(`「${flag}」只在引擎段落被读——请登记为 engine（带理由）或补叙事消费`); continue; }
			if (derived) { buckets.set(flag, derived); continue; }
			buckets.set(flag, 'none');
			problems.push(`「${flag}」无任何桶——无正文消费也无登记（假选择嫌疑）`);
		}
		return { written, buckets, problems };
	}
	function successRate(pc, site, adv) {
		const mod = site.abil ? Game.Rules.save_mod_for_audit ?? Game.Rules.abilityMod(pc, site.abil) : Game.Rules.skillMod(pc, site.skill);
		const single = (r) => (r === 20 ? true : r === 1 ? false : r + mod >= site.dc);
		let win = 0, total = 0;
		for (let a = 1; a <= 20; a++) {
			if (!adv) { total++; if (single(a)) win++; }
			else for (let b = 1; b <= 20; b++) { total++; if (single(Math.max(a, b))) win++; }
		}
		return win / total;
	}

	return { classifyNarrativeState, successRate };
};

// ── 故事文本源（**唯一权威**，`#435` 前置 0）──────────────────────────────────
// 为什么要有它：阶段 4 把叙述也搬进条件表之后，「这段话属于哪个段落」不再由"字面写在段落里"决定，
// 而是由**归属**决定 —— 表行 `scope` 的 `#` 前那一截就是它的段落。若每道门自己拼一次文本面，
// 就必然各自漂移：实测**一次搬家同时红六道门**（`--truth`/`--echoes`/`--npc`/`--notes`/
// `--interact`/`--text`），那不是六个 bug，是**一个横切面**（门的文本面窄了）。
// 单一权威的用途：各门都从 `storyText().text` 取"段落文本"，不再各自 `passageSrc.get(p)`。
export const MECH_TAGS = ['script', 'widget', 'stylesheet'];

/** 段落名 → **故事文本**（内容段落原文 ∪ 归属到它的表行 `text`，按**表序**追加）。
 *
 * 边界（都写在这里，免得各门各自解释）：
 * · 追加的是**所有候选行**的 `text`（不是"选中的那一行"）—— 这是"文本集合"，不是"`pick()` 选哪行"；
 * 哪个行被选中是运行期的事，可能随状态变（门判的是"文本可达"）。
 * · `scope` 段落不存在 → **不归属**，进 `orphans`（`--rules` 另报红；这里不静默吞）。
 * · `isMech(name)`：机制段（`[script]`/`widget`/`stylesheet`）——门自己决定跳不跳（与 `--text` 同口径）。
 */
export const storyText = ({ passageSrc = new Map(), passageTags = new Map(), rows = [] } = {}) => {
	const text = new Map([...passageSrc].map(([n, s]) => [n, String(s ?? '')]));
	const tableText = new Map(), rowIds = new Map(), orphans = [];
	for (const r of rows ?? []) {
		if (!r?.id || r.text == null || r.text === '') continue;
		const p = String(r.scope ?? '').split('#')[0];
		if (!text.has(p)) { orphans.push({ id: r.id, scope: r.scope, passage: p }); continue; }
		text.set(p, `${text.get(p)}\n${r.text}`);
		tableText.set(p, [...(tableText.get(p) ?? []), String(r.text)]);
		rowIds.set(p, [...(rowIds.get(p) ?? []), r.id]);
	}
	const tagsOf = (n) => passageTags?.get?.(n) ?? [];
	const isMech = (n) => tagsOf(n).some((t) => MECH_TAGS.includes(t));
	return { text, tableText, rowIds, orphans, isMech, isNarrative: (n) => !isMech(n) };
};

/** 哪些表行的 `text` 含这个错句（（段落 ＋ 锚句）→ 行）—— `--echoes` 的"表侧条件归属"用它。 */
export const rowsContaining = (rows, passage, anchor) =>
	(rows ?? []).filter((r) => r?.id && r.text && String(r.scope ?? '').split('#')[0] === passage && String(r.text).includes(anchor));


// ── `#572`「选中 → 真跑」：逐门执行并记录**这道门到底有没有产出输出** ──────────────
// 为什么需要它：每道门的 `run()` 都是「选中了也可能静默 return」的形状（`if (!wantAll &&!arg('<flag>')) return;`），
// 而 `audit.mjs` 的 `selected` 只决定**调用谁** → 光看 `selected` 分不出「跑了」与「被守卫打回」。
// 2026-09-14 实测：`--engine-only --check` 时 9 道引擎门里只有 `state`／`literals`（无守卫）真跑，
// 其余 7 道逐个早退 —— 计划里那两段却把它当成「四道引擎门对第二/第三故事绿」的证据（假绿）。
// 纯逻辑（`log` 可注入）→ 自证与真实运行同一份代码。
// `#1157`：**剥掉对象头** —— 与"打头"（`runSelectedGates`）**同一落点**（谁打印谁负责剥离的形状）。
// 只在**首行**且**形状严格匹配**时剥（`^story=<slug>（…）$` → 少一个字符都不剥）
// → 剥后与旧基线**逐字节相同**（`test/audit-golden.json` **零改动**）。
//注意：若写成"剥掉任何含 `story=` 的行" → 门自己打印的读数也可能被吃掉（＝**把真差异吃掉**）
// → 故用**整行全匹配 ＋ 只剥首次出现的一行**（`test/audit-scope-header.mjs` 第 ③ 格看守）。
export const stripScopeHeader = (text) => String(text).replace(/^story=[^\n]*（[^）]*）\n?/, '');

export const runSelectedGates = (gates, ctx, log = console) => {
	const silent = [];
	// `#1157`：**对象头**（本票正题）—— 门首行说的是"**查什么**"（⓪u 状态契约门），驱动器这行说的是
	// "**查哪个对象**"（`story=<slug>`）→ **两根轴不同 → 对象头归驱动器**（职责对齐 单一落点五面一致）。
	// 为什么必须有：`scripts/audit.mjs` 的**默认故事作用域＝`face-fixture`**（`DEFAULT_SLUG`）→ 漏传 `--story`
	// → 读数**静默张冠李戴**（实测踩过 `#1157`）→ 默认时必须**明写"默认值注意："** → 张冠李戴**当场可见**。
	//注意：头进的是**进程 stdout** → `test/audit-golden.mjs` 的 `normalize` 会**剥掉这一行**再逐字节比对
	//（剥后与旧基线一致 → **基线零改动**）；**头在不在都不影响 golden**（在 → 剥；不在 → 没得剥）
	// → → **golden 不背对象头的锅，对象头由 `test/audit-scope-header.mjs` 自己背**（职责分离）。
	const explicit = (ctx?.argv ?? []).includes('--story');
	log.log(`story=${ctx?.storySlug ?? '(未知)'}（${explicit ? '--story 显式' : '默认值 ⚠ —— 未传 --story'}）`);
	for (const g of gates ?? []) {
		let spoke = false;
		const orig = log.log;
		log.log = (...a) => { spoke = true; return orig.apply(log, a); };
		try { g.run(ctx); } finally { log.log = orig; }   // 门内 `process.exit` 不回到这里也无妨（进程都要退了）
		if (!spoke) silent.push(g.flags?.[0] ?? '(未命名门)');
	}
	return { silent, selected: (gates ?? []).length, ran: (gates ?? []).length - silent.length };
};
