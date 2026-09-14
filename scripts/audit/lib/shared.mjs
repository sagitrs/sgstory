// `#580`：注释遮蔽＝**一处**（`mask.mjs`，单扫描器按词法一次遮蔽）。写点/读点提取一律先遮后扫——
// 否则注释里的示例会变成"真的写了/真的读了"（实测：引擎 JS 注释里的 `<<setflag "flower_taken">>`
// 让 `--consequences` 把该键当成每个故事都写了 ⇒ 不声明它的故事假红）。
import { maskComments } from './mask.mjs';

// ── 写点识别：**单一权威**（#476 复核建议）──────────────────────────────────
// 此前 `shared.mjs`（D2 分类器）与 `gates/state.mjs` 各写一份字面量 ⇒ **漂移过一次**：
// shared 只认 `= true`、state 认任意赋值 ⇒ D2 门看不见 `= null`／对象写点（#476 修的正是这个洞）。
// ⇒ 形态只此一处，两处消费方都从这里取。
// **隐含约束**：旗标键必须匹配 `[a-z_]\w*`（大写/数字开头会被静默漏检）——用 `keyCharsetViolations` 兜住。
export const KEY_CHARSET = /^[a-z_]\w*$/;
export const WRITE_PATTERNS = [
	{ re: /<<setflag\s+"([a-z_]\w*)"/g, kind: 'world' },                 // 宏式写 world 域
	{ re: /<<set\s+\$pc\.(ev|world)\.([a-z_]\w*)\s+to\b/g, kind: 'scoped' },
	{ re: /\bpc\.(ev|world)\.([a-z_]\w*)\s*=[^=]/g, kind: 'scoped' },     // 赋值式（含 `= null`／对象／字符串）
	{ re: /\bpc\.(ev|world)\[["']([a-z_]\w*)["']\]\s*=[^=]/g, kind: 'scoped' },
	{ re: /<<firstTime\s+"([a-z_]\w*)"\s*>>/g, kind: 'ev' },            // 宏式写 ev 域（读一次再写）
];
/** 裸键集合（D2 分类器用）。 */
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
/** 键形态违规：`pc.ev.Bad` 这类键会被上面的正则**静默漏检** ⇒ 单独兜住。 */
// ── 读点形态（与写点同一处权威；`#436` 原范围 1）────────────────────────────
// 三种写法：`$pc.ev.x`（正文/宏）、`pc.ev.x`（裸 JS，如表内函数体）、`p.ev?.x`（表内谓词）。
// **读点必须排除写行**（同一行里出现 `.ev.x =` / `.ev.x to`）——否则"写了没人读"会被算成读过
//（本仓 #365 那类误判的根源；`analyze()` 里的行为逐字保留）。
export const READ_PATTERNS = [
	/\$pc\.(ev|world)\.([a-z_]\w*)/g,
	/\bpc\.(ev|world)\.([a-z_]\w*)/g,
	/\bp\.(ev|world)\??\.([a-z_]\w*)/g,
	// `#460` 补：**引擎 JS 里的读**写法（`State.variables.pc?.ev?.last_roll`）此前**任何模式都不认** ⇒
	// 「只有写没有读」把引擎自己的运行时槽判成假红（实测：`last_roll` 只靠一条**注释**里提了一句才"有读"）。
	/\bState\.variables\.pc\??\.(ev|world)\??\.([a-z_]\w*)/g,
];
// `#437` 批二的形状：**经封装层的路径读** —— `Sg.notes.readPath(pc, 'ev.x')`／`writePath` 的读侧。
// 为什么要单列：表里的谓词从"直读旗标"（`!!p.ev.x`）改成走封装层之后，**消费点不该消失**
//（`--notes` 的消费可数、D2 的分级都靠"谁读了它"）；但它**不是**「无字面状态读」要抓的那种直读
//（那份判据管的是"绕过封装层的裸读"）⇒ 两个口径必须分开，否则改一处就假红另一处。
export const WRAPPED_READ_RE = /Sg\.notes\.readPath\(\s*[^,()]+,\s*['"]([a-z_]+)\.([a-z_]\w*)['"]/g;
export const wrappedReadKeys = (text) => [...maskComments(text).matchAll(new RegExp(WRAPPED_READ_RE.source, 'g'))].map((m) => `${m[1]}.${m[2]}`);
// 单行 → 去重后的**限定键**（`ev.x` / `world.x`）——**含**封装层读（"谁读了它"的单一权威）
export const readKeys = (text) => {
	// `#580`：注释里的提法**不算读**（`maskComments` 保长度 ⇒ 行内逻辑不受影响）
	const line = maskComments(text);
	const out = new Set();
	for (const re of READ_PATTERNS) {
		for (const m of line.matchAll(new RegExp(re.source, 'g'))) {
			const k = `${m[1]}.${m[2]}`;
			// 写行不算读：`to true`／`= true`／`=true`／`= {` 都要排掉；`(?!=)` 排 `==`，`(?![a-z])` 排 `tower`
			if (new RegExp(`\\.${k}\\s*(?:=(?!=)|to(?![a-z]))`).test(line)) continue;
			out.add(k);
		}
	}
	for (const k of wrappedReadKeys(line)) out.add(k);
	return [...out];
};
/** **字面状态读**（＝「无字面状态读」门的判据）：`readKeys()` **减去**封装层读。
 *  两个口径分开是刻意的：`--reads` 管"绕过封装层的裸读"，而"谁读了它"要连封装层读一起算。 */
export const literalReadKeys = (text) => {
	const wrapped = new Set(wrappedReadKeys(text));
	return readKeys(text).filter((k) => !wrapped.has(k));
};

export const keyCharsetViolations = (text) =>
	[...String(text).matchAll(/\bpc\.(?:ev|world)\.([A-Za-z_$][\w$]*)/g)].filter((m) => !KEY_CHARSET.test(m[1])).map((m) => m[1]);

// audit 跨门共享 helper（#316 第 2 步）：被 ≥2 个门使用的定义集中于此，由壳注入 ctx。
// 清单：build/_shared_list.json（收敛循环自动发现）。
// ── 笔记引用（`#433` 阶段 2 的读点形状）：`Sg.notes.has('n_x')`／`Sg.notes.entry('n_x')`／`note:n_x` ──
// 为什么放在这里（与写点/读点并列）：阶段 2 把段落条件从 `<<if $pc.ev.X>>` 改成 `Sg.notes.has('n_X')`，
// 于是「谁读了旗标 X」这件事**换了写法但不该消失**——依赖它的门（`--state` 的有写有读、D2 的桶分类）
// 必须跟着认这个形状。否则转发的第一步就会把一堆键判成"只有写"⇒ 门红而代码其实等价（假红）。
// 这就是设计稿那条纪律：**先让门认新形状，再改内容**。
export const NOTE_REF_RE = /Sg\.notes\.(?:has|entry)\(\s*['"](n_[a-z0-9_]+)['"]|(?:^|[^\w:])note:(n_[a-z0-9_]+)/g;
// 文本里引用的笔记 id
export const noteRefs = (text) => {
	const out = new Set();
	for (const m of String(text ?? '').matchAll(NOTE_REF_RE)) out.add(m[1] ?? m[2]);
	return [...out];
};
// 笔记表 → id → flagPath（限定键数组）
export const notePaths = (entries) => {
	const M = new Map();
	for (const [id, e] of Object.entries(entries ?? {})) {
		const fp = Array.isArray(e?.flagPath) ? e.flagPath : (e?.flagPath ? [e.flagPath] : []);
		M.set(id, fp.map(String));
	}
	return M;
};
// 文本里**经笔记**读到的限定键（`ev.x`/`world.x`）
export const noteReadKeys = (text, entries) => {
	const paths = notePaths(entries);
	const out = new Set();
	for (const id of noteRefs(text)) for (const p of (paths.get(id) ?? [])) out.add(p);
	return [...out];
};
// 文本里**经笔记**读到的裸键（D2 按裸键判）
// ── 条件项 → 键名（`#491` 另票的口径：**对象形算子条件**）────────────────────────────
// 行的 `req`/`any`/`exclude` 里，一项可以是：
//   · 字符串：`'n_x'`（note id）／`'fog_thin'`（裸键＝`ev.`）／`'world.x'`／`'inv:日记'`／`'era:past'`；
//   · **对象算子形**（数值/枚举另票）：`{ gte: ['star.spent', 3] }`／`{ lte: ['hp', 1] }`／`{ oneOf: ['keeper.state', ['seal']] }`。
// 这里只取**键**（算子/阈值不进状态契约、不进旗标分级）——门侧各消费点都经它，避免各写一套。
// 算子本身的**声明面**＝`Sg.rules.ops`（与 `prefixes`／`effects` 同轴：用了未声明的算子 ⇒ `--rules` 判红）。
export const OPS = ['gte', 'lte', 'oneOf'];
export const condKeysOf = (cond) => {
	if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
		const out = [];
		for (const [op, v] of Object.entries(cond)) {
			if (!OPS.includes(op) || !Array.isArray(v) || v.length < 1) continue;
			out.push(String(v[0]));
		}
		return out;
	}
	return [String(cond)];
};
/** 行里用到的算子（去重；供「算子必须由引擎宣告」的判据用）。 */
export const rowOps = (row) => {
	const out = new Set();
	for (const field of ['req', 'any', 'exclude']) for (const cond of asListOf(row?.[field])) {
		if (cond && typeof cond === 'object' && !Array.isArray(cond)) for (const op of Object.keys(cond)) if (OPS.includes(op)) out.add(op);
	}
	return [...out];
};
const asListOf = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);
/** `yields` 项 → `[{ id, path }]`（`#491` 另票：**多源笔记的路径选择**）——`'n_x'` 或 `{ id:'n_x', path:'world.x' }`。 */
export const yieldsList = (row) => asListOf(row?.yields).map((y) => (y && typeof y === 'object' && !Array.isArray(y)
	? { id: String(y.id ?? ''), path: y.path ? String(y.path) : null }
	: { id: String(y), path: null }));

// 条件表行引用的**限定键**（`ev.x`/`world.x`）——`--state` 用（它按限定键判"有写有读"）。
// 与 `ruleRowFlags()`（裸键，D2 用）同源：都从 `req/any/exclude` 取；`n_*` 展开成笔记的 `flagPath`。
export const ruleRowKeys = (row, entries) => {
	const paths = notePaths(entries);
	const out = new Set();
	for (const key of [...asListOf(row?.req), ...asListOf(row?.any), ...asListOf(row?.exclude)].flatMap(condKeysOf)) {
		// `#435`：**前缀键**（`inv:<道具>`／`era:<时代>`）不是状态键（持有物/时代都不在状态契约域里）
		// ⇒ 不参与"有写有读"；它们的求值在引擎侧 `Sg.rules.holds()`。
		if (/^(?:inv|era):/.test(key)) continue;
		// `#435` 修正②：**第三命名空间**（`keeper.`/`star.`/`gold.`…）不是 `pc.ev`/`pc.world` 的键
		// ⇒ 不参与状态契约（`--state`）与旗标分级（D2）。不跳过的话 `keeper.met` 会被当成裸键 `met`
		// ⇒ `--state` 报"未落入任何域"（= 引入一个今天看不见的假红）。
		if (key.includes('.') && !/^(?:ev|world)\./.test(key)) continue;
		if (key.startsWith('n_')) for (const p of (paths.get(key) ?? [])) out.add(p);
		else out.add(key.includes('.') ? key : `ev.${key}`);
	}
	return [...out];
};

// ── 笔记**写点**（`#434` 阶段 3）：`Sg.notes.add('n_x')` 写的是该笔记 `flagPath` 里的键 ──────────
// 与读点（`noteReadKeys`）并列，仍是**单一权威**。为什么需要它：写点从「字面量写旗标」改成
// 「经 `Sg.notes.add` 写」之后，按**字面量**认写点的门（`--state` 的"有写有读"、D2 的桶分类）
// 会把该键判成**只有读** ⇒ 假红。（阶段 2 的 5 个消费点就是这个剧本，那次换的是**读**点形状。）
// 两种**写点形状**（单一权威）：① 模块 API `Sg.notes.add('n_x')`；② 词汇宏 ``<<note "n_x">>``（`#624` 片一新增，
// 表行与点击态里该用宏）。**新写点形状只改这一处** —— 否则 `--state`／D2／`--sel-gear`／`premise-source`
// 会集体把它当"只读" ⇒ 幽灵条件假红（阶段 2 的五消费点、`#624` 批 1 都撞过同一剧本）。
export const NOTE_WRITE_RE = /(?:Sg\.notes\.add\(\s*['"](n_[a-z0-9_]+)['"]|<<\s*note\s+['"](n_[a-z0-9_]+)['"])/g;
/** 只要**模块 API** 那一种（`Sg.notes.add(`）。判「表里该用宏还是裸 API」时用它（`#624` 片一）：
 *  `NOTE_WRITE_RE` 认两种形状（记账用），而**点击态域里的 `<<note>>` 是允许的**，不许当成裸 API 判红。 */
export const NOTE_WRITE_API_RE = /Sg\.notes\.add\(/;
/** 条件键 → 与段落 `<<if>>` 里**同形**的条件文本（`n_*` ⇒ `Sg.notes.has('n_x')`；其余 ⇒ `$pc.<域>.<键>`，裸键默认 `ev.`）。
 *  为什么必须只有一份（`#435` 前置 0）：表侧条件（行的 `req`/`any`/`exclude`）要过**同一份**判据
 *  （`causeReg()`／`conditionReadsFlag()`），若两处各写一套转换 ⇒ 必然漂移（`--echoes` 与 `--investment` G3 都用它）。 */
export const condTextOf = (cond) => {
	// 对象算子形 ⇒ 取它的**键**再合成（阈值/算子不影响"这段文本是否提到该旗标"这一判据）
	if (cond && typeof cond === 'object' && !Array.isArray(cond)) return condKeysOf(cond).map(condTextOf).join(' ');
	const k = String(cond);
	return k.startsWith('n_') ? `Sg.notes.has('${k}')` : `$pc.${k.includes('.') ? k : `ev.${k}`}`;
};
/** 条件表行的 **`sets` 写点**（`#435` Q1：授予家族第三类——状态键写点也搬进表）。与 `ruleRowKeys()` 同命名空间：
 *  裸键默认 `ev.`（与 `Sg.rules.holds()` 同口径）；写世界态请写全 `world.x`；note id／前缀键不是状态键 ⇒ 跳过。 */
export const ruleRowSetKeys = (row) => (Array.isArray(row?.sets) ? row.sets : row?.sets ? [row.sets] : [])
	.map(String).filter((k) => !/^(?:inv|era):/.test(k) && !k.startsWith('n_')).map((k) => (k.includes('.') ? k : `ev.${k}`));

/** 文本里 `Sg.notes.add('n_x')`（或 `<<note "n_x">>`）引用的笔记 id。 */
export const noteWriteRefs = (text) => {
	const out = new Set();
	for (const m of String(text ?? '').matchAll(NOTE_WRITE_RE)) out.add(m[1] ?? m[2]);   // 两种形状各有自己的捕获组
	return [...out];
};
/** 经 `Sg.notes.add()` 写到的**限定键**（`ev.x`/`world.x`）。 */
export const noteWriteKeys = (text, entries) => {
	const paths = notePaths(entries);
	const out = new Set();
	for (const id of noteWriteRefs(text)) for (const p of (paths.get(id) ?? [])) out.add(p);
	return [...out];
};
/** 同上，返回**裸键**（D2 按裸键判）。 */
export const noteWriteFlags = (text, entries) => noteWriteKeys(text, entries).map((k) => k.replace(/^(ev|world)\./, ''));

// ── 条件表**行**引用的裸键（`#435` 阶段 4）：`req`/`any`/`exclude` 里的键名/笔记 id ────────────
// 为什么要它：条件从段落搬进表之后，D2 的"正文条件消费"（`hasIf`）会**看不见**这个读点 ⇒
// 键被判「只在引擎段落被读」⇒ 假红（阶段 4 版本的"新形状"）。归属按行的 **`scope`**（＝哪一段）算。
export const ruleRowFlags = (row, entries) => {
	const paths = notePaths(entries);
	const out = new Set();
	for (const key of [...asListOf(row?.req), ...asListOf(row?.any), ...asListOf(row?.exclude)].flatMap(condKeysOf)) {
		if (/^(?:inv|era):/.test(key)) continue;   // 同 `ruleRowKeys()`：前缀键不是旗标，不参与分级
		if (key.includes('.') && !/^(?:ev|world)\./.test(key)) continue;   // 同上：第三命名空间不是旗标
		if (key.startsWith('n_')) for (const p of (paths.get(key) ?? [])) out.add(p.replace(/^(ev|world)\./, ''));
		else out.add(key.replace(/^(ev|world)\./, ''));
	}
	return [...out];
};
// 旗标（裸键）→ 引用它的笔记 id 数组（`#433`：门按旗标判"谁读了它"时要用）
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
// **条件文本是否消费了旗标 `flag`**（两种形状，单一权威）：
//   ① 直接读：`$pc.ev.flag` / `$pc.world['flag']`
//   ② 经笔记：`Sg.notes.has('n_flag')`（该笔记的 flagPath 含此旗标）
// `noteIds`：该旗标对应的笔记 id 数组（`noteIdsForFlag()` 的结果，缺省＝只认形状①）
export const conditionReadsFlag = (text, flag, noteIds = []) => {
	if (new RegExp(`(?:world|ev)\\s*(?:\\.|\\[)?["']?${flag}\\b`).test(String(text ?? ''))) return true;
	return noteIds.some((id) => new RegExp(`Sg\\.notes\\.(?:has|entry)\\(\\s*['"]${id}['"]`).test(String(text ?? '')));
};
// 条件文本里读到的旗标（**裸键，按出现顺序去重**）——两种形状一次扫完。
// 为什么强调顺序：报告文本（如 `--investment` G3 的「老巫女（seer_asked、coord、failure_cause）」）
// 直接印这串旗标 ⇒ 顺序稳定才能让「纯转发」的判据保持逐字一致（否则每转一处就要重签 golden 一行）。
// 返回**数组**（与 `noteReadKeys()` 一致：Set 会被 `.concat()` 当成单个元素——踩过一次）。
export const noteReadFlags = (text, entries) => {
	const paths = notePaths(entries);
	const ids = [...paths.keys()];
	const alt = ids.length ? `|Sg\\.notes\\.(?:has|entry)\\(\\s*['"](${ids.map((i) => i.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})['"]` : '';
	const re = new RegExp(`\\$pc\\.(?:world|ev)\\.([a-z_]\\w*)${alt}`, 'g');
	// `#437` 批二：表里的谓词改走封装层（`Sg.notes.readPath(p,'ev.x')`）之后，这条读点**不该消失**
	//（D2 按旗标分桶）⇒ 与 `readKeys()` 同源地把它也算进来。
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
	// #342 F2：可**注入输入**（默认取闭包里的真实来源 ⇒ 向后兼容）。没有这一层，
	// 依赖本分类器的门（如 ⓪q 选择后果门）只能用真产物自证——那等于"用被测对象证明被测对象"。
	function classifyNarrativeState(input = {}) {
		const sources = input.passageSrc ?? passageSrc;
		const tags = input.passageTags ?? passageTags;
		const Echoes = input.Echoes ?? Game.Echoes;
		const Consequences = input.Consequences ?? Game.Consequences;
		// 注释（/% … %/）里的示例不是代码——先剥离，免得把文档里的 <<firstTime "X">> 当成真写入
		// `#580`：写点面来自**共享遮蔽**（原先只剥 `/% %/` ⇒ `//` JS 注释里的示例会泄漏成真实写点）
		const stripped = new Map([...sources.entries()].map(([n, src]) => [n, maskComments(src, { file: n })]));
		const isEngine = (name) => !!tags.get(name)?.some((t) => ['script', 'widget', 'stylesheet'].includes(t));
		const isEnding = (name) => name.startsWith('结局');
		// `hasIf`：这一段的**正文条件**是否消费了该旗标。两种形状都认（#433 阶段 2）：
		//   ① 直接读 `<<if … $pc.ev.flag>>`；② 经笔记读 `<<if Sg.notes.has('n_flag')>>`（该笔记的 flagPath 含此旗标）
		const noteEntries = input.notes ?? Game.Notes?.entries ?? {};
		const notePathsById = notePaths(noteEntries);
		const flagsByNote = new Map();
		for (const [id, ps] of notePathsById) for (const p of ps) {
			const f = p.replace(/^(ev|world)\./, '');
			if (!flagsByNote.has(f)) flagsByNote.set(f, []);
			flagsByNote.get(f).push(id);
		}
		const refsByPassage = new Map([...stripped.entries()].map(([n, src]) => [n, new Set(noteRefs(src))]));
		// #435 阶段 4：**条件表行**里的键也算「正文条件消费」——按行的 `scope`（＝哪一段）判它是不是叙事段落。
		// 否则条件一搬进表，D2 就看不见这个读点（键被判「只在引擎段落被读」⇒ 假红）。
		// 表的来源：优先**注入**（node 侧没有 `window` 全局 ⇒ 不能在这里直读 `Sg.story`），退回 `Game.Rules.entries`
		const rulesRows = input.rules ?? Game.Rules?.entries ?? [];
		const rowFlags = new Set();
		for (const r of rulesRows) {
			if (!r?.scope || isEngine(r.scope) || isEnding(r.scope)) continue;   // 只算**叙事**段落的行
			for (const f of ruleRowFlags(r, noteEntries)) rowFlags.add(f);
		}
		// `(段落名, 源码, 旗标)`：两种形状任一命中即算「这一段消费了该旗标」
		// `#581`：条件形态还包 `<<elseif>>`——原先只认 `<<if>>` ⇒ `<<elseif $pc.ev.X>>` 这类**叙事条件读**被漏掉，
		// 该键会被判“无任何桶”（假红）。方向只会把假红变绿：加宽的是“**条件读**”的识别，不是把所有读取都算进来。
		// （注：`cave_step` 那条**不是**这个原因——它读写都在 `[widget]` 段里，按门口径属引擎面；已单独登记。）
		const hasIf = (name, src, flag) => {
			if (new RegExp(`<<(?:if|elseif)[^>]*\\$pc\\.(?:world|ev)\\.${flag}\\b`).test(src)) return true;
			return (flagsByNote.get(flag) ?? []).some((id) => refsByPassage.get(name)?.has(id));
		};
		const written = new Set();
		for (const src of stripped.values()) {
			// 写点形态来自**单一权威** `WRITE_PATTERNS`（#476 复核建议：两处字面量曾漂移过一次）
			// ＋ #434 的笔记写点（`Sg.notes.add('n_x')` ⇒ 该笔记 flagPath 的裸键也算被写）
			for (const k of [...writeKeys(src), ...noteWriteFlags(src, noteEntries)]) written.add(k);
		}
		const E = Echoes;
		const echoFlags = new Set([...E.list.flatMap((e) => [e.cause.flag, e.cause.token]), ...E.revisit.flatMap((r) => [r.flag, r.inv])].filter(Boolean));
		const tblSrc = sources.get('Game Tables') ?? '';
		// `#437` 批二：图鉴桶的旗标集合 = 表里的**直读**（`p.ev.X`／`p.world?.X`）∪ **封装层读**
		//（`Sg.notes.readPath(p, 'ev.X')`）——此前只认前者，谓词改走封装层后它就静默失明了。
		// 注：这里**不**用 `readKeys()` 全量（它会把表里**字符串文案**中提到的 `pc.ev.notes` 也算成读点）。
		const codexFlags = new Set([
			...tblSrc.matchAll(/p\.(?:ev|world)\??\.(\w+)/g),
		].map((m) => m[1]).concat(wrappedReadKeys(tblSrc).map((k) => k.replace(/^(ev|world)\./, ''))));
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
// 就必然各自漂移：guest 实测**一次搬家同时红六道门**（`--truth`/`--echoes`/`--npc`/`--notes`/
// `--interact`/`--text`），那不是六个 bug，是**一个横切面**（门的文本面窄了）。
// 单一权威的用途：各门都从 `storyText().text` 取"段落文本"，不再各自 `passageSrc.get(p)`。
export const MECH_TAGS = ['script', 'widget', 'stylesheet'];

/** 段落名 → **故事文本**（内容段落原文 ∪ 归属到它的表行 `text`，按**表序**追加）。
 *
 *  边界（都写在这里，免得各门各自解释）：
 *  · 追加的是**所有候选行**的 `text`（不是"选中的那一行"）—— 这是"文本集合"，不是"`pick()` 选哪行"；
 *    哪个行被选中是运行期的事，可能随状态变（门判的是"文本可达"）。
 *  · `scope` 段落不存在 ⇒ **不归属**，进 `orphans`（`--rules` 另报红；这里不静默吞）。
 *  · `isMech(name)`：机制段（`[script]`/`widget`/`stylesheet`）——门自己决定跳不跳（与 `--text` 同口径）。
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

// ── JS 注释剥离（`#486` 的副产品）────────────────────────────────────────
// 为什么需要：`--text` 的「总字」把 `[script]` 段里的 **JS 注释**也当正文数了——它只剥 Twee 注释 `/% %/`。
// 实测代价：加一行 `//` 说明就把「主题词密度/总字」推高（`#519` +92 · `#486` 机制片 +2572），
// 逼着每次改引擎注释都要重签 golden ⇒ **基线被注释噪声占满**，真正的正文漂移反而看不见。
// 规则与 `gates/literals.mjs` 的 `blankComments` 同口径：`/* */` 块；`//` 行注释，**但前面不是 `:`**
// （避免把 `https://…` 截断）。**挖空而非删除**（保留行号/长度语义，供需要行号的调用方）。
// `#580`：**本入口保持原语义**（两条正则 + `[^:]` 守卫绕 `https://`）——为什么不像写点那样换成词法器：
// 它跑在**散文**上（`--text` 的"总字"），而散文里有 `''强调''`／单个撇号；词法器的"未闭合字符串剥到行尾"
// 会把散文吃掉（实测 −1 字 ⇒ golden 漂移）。散文面用启发式、代码面用词法器，**这是有意的分工**。
// 真正需要词法器的是**写点/读点提取**（`writeKeys`／`qualifiedWriteKeys`／`readKeys`／D2 的 `stripped`）——见上。
export const stripJsComments = (text) => String(text)
	.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
	.replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

// ── `#572`「选中 ⇒ 真跑」：逐门执行并记录**这道门到底有没有产出输出** ──────────────
// 为什么需要它：每道门的 `run()` 都是「选中了也可能静默 return」的形状（`if (!wantAll && !arg('<flag>')) return;`），
// 而 `audit.mjs` 的 `selected` 只决定**调用谁** ⇒ 光看 `selected` 分不出「跑了」与「被守卫打回」。
// 2026-09-14 实测：`--engine-only --check` 时 9 道引擎门里只有 `state`／`literals`（无守卫）真跑，
// 其余 7 道逐个早退 —— 计划里那两段却把它当成「四道引擎门对第二/第三故事绿」的证据（假绿）。
// 纯逻辑（`log` 可注入）⇒ 自证与真实运行同一份代码。
export const runSelectedGates = (gates, ctx, log = console) => {
	const silent = [];
	for (const g of gates ?? []) {
		let spoke = false;
		const orig = log.log;
		log.log = (...a) => { spoke = true; return orig.apply(log, a); };
		try { g.run(ctx); } finally { log.log = orig; }   // 门内 `process.exit` 不回到这里也无妨（进程都要退了）
		if (!spoke) silent.push(g.flags?.[0] ?? '(未命名门)');
	}
	return { silent, selected: (gates ?? []).length, ran: (gates ?? []).length - silent.length };
};
