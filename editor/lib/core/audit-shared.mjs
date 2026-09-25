// `#881`（`#877` 前置）**审计共享纯帮手 → `editor/lib/core`**
//
// 为什么有这个前置切片：`#877` 要抽的两门（`stories/mist-forest/gates/{notes,reads}.mjs`）的**纯区**
// 都依赖 `scripts/audit/lib/shared.mjs` 里的纯帮手 —— 而 **`editor/lib/core/**` 不得 import `scripts/**`**
//（分层：core 只依赖 core，且 core 要**浏览器安全**）。→ 帮手先搬到本件 → `#877` 的抽取才是**真·纯搬运**。
//
// 与 `scripts/audit/lib/shared.mjs` 的**唯一关系**：那边**只转出**这些名字（`export … from` —— **不是副本**，
// K6 ①b「core 能力不许在 core 之外再定义」的口径正是"重导出不算定义"）；那边**内部**仍用它们的
//（`rowOps`／`ruleRowFlags`／`makeShared` …）从本件 `import` 回来 —— **一处实现**。
//
// 本件的 14 个名字（**闭包，不动点求得** —— 不是"按顶层定义名扫一遍"，那种扫法会漏 `asListOf`）：
// · 起点七个（`#877` 的依赖面）：`declCondRefs` · `readKeys` · `literalReadKeys` · `notePaths` · `condKeysOf` · `ruleRowKeys` · `stripJsComments`；
// · 闭包补进七个：`DECL_COND_RE` · `READ_PATTERNS` · `WRAPPED_READ_RE` · `OPS` · `KEY_PREFIX_RE` · `asListOf` · `wrappedReadKeys`。
//注意：`asListOf` 原本**未导出**（`const asListOf = …`）→ 本件把它改成 `export const` ——
// **这是全片唯一一处非逐字改动**，理由：`shared.mjs` 侧 `rowOps`／`ruleRowFlags`／`yieldsList` 仍要用它
// → 不留副本 → 只能由本件转出。（原处 `export` 面因此**不变**：44 → 44。）
//
// 依赖面（**只有一处 import**）：`./mask.mjs`（遮蔽器同片搬进 core，因为 core 不得 import `scripts/**`）——
// `readKeys`／`wrappedReadKeys`／`declCondRefs` 都要"先遮后扫"。
//
//注意：三个已踩过的点（留给下一个人）：
// 1. **闭包用不动点求** —— 单轮"按行首形态扫顶层定义名"会漏 `asListOf`（它是 `...asListOf(...)` 的**展开实参**，
// 任何"前字符是 `.` 就当属性名跳过"的启发式都会把它吞掉 —— **这一族的洞在本片里已被踩过两次**）；
// 2. **`mask.mjs` 必须一起进 core** —— 否则要么 core import `scripts/**`、要么留副本；
// 3. **验收别拿"导出名 44 → 44"当证据** —— 它只比**名字集**，不比**体内引用能否解析**；
// 正形是**逐函数冒烟** ＋ **两道门与 main 逐字节同** ＋ `npm test` 全绿。

import { maskComments } from './mask.mjs';

/** **前缀键**（`inv:`／`era:`／`gear:`，`#624` 片四加最后一个）的**单一权威**：它们不是状态键（持有物/时代/行囊都不在 `pc.ev`/`pc.world` 域）→ 不参与状态契约与旗标分级；求值在引擎 `Sg.rules.holds()`。 */
// `#1275`：加 `chk:` 族（**运行时结果维**，案 A）—— 与引擎 `readKey` 的族集合必须相等（`test/readkey-family.mjs` 守）。
export const KEY_PREFIX_RE = /^(?:inv|era|gear|chk|fight):/;

// `#1156`：**可读键形的单一权威** —— 与引擎 `Sg.rules.readKey`（`src/engine/40-sim/22-rules.twee`，`#1187` 第五块后）的
// 分支族**逐支对应**（真源在引擎 本函数是它的**族分类镜像**；两者由**成对断言**锁住 → 不再各写一份漂移）。
//注意：**返回"族名"而不是布尔**：布尔会把族信息压掉 → 消费者无法保留各自语义 ——
// 最要紧的一例：`inv:`／`era:`／`gear:` 与 `codex:` **都"可读"**，但前者**不进状态契约**（值在 pc.inv／Era／gear）
// 而后者**算读点**（存档面谓词 → `declCondRefs` 收它）→ **"可读"与"进哪面"是两个问法**（`#1132` 块 1 的注释所指）。
// 族名与引擎分支一一对应：
// `note` ← `k.startsWith('n_')` → `Sg.notes.has`
// `inv`／`era`／`gear` ← `/^(inv|era|gear):(.+)$/`（引擎**一支三族** → 这里**展开**成三族）
// `codex` ← `/^codex:(.+)$/` → `Sg.Codex.seenFinal()`
// `pc` ← `k.startsWith('pc.')` → `readPath(pc, k.slice(3))`（**显式根**）
// `dotted` ← 含点（引擎 `k.includes('.')`） → `readPath(pc, k)`
// `bare` ← 其余（引擎 `readPath(pc, \`ev.${k}\`)`）→ 默认 `ev.` 域
// 不可读 → `null`（消费者要布尔时内联 `readKeyFamily(k)!== null` 不是第二个函数）。
export const readKeyFamily = (key) => {
	const k = String(key);
	if (k.startsWith('n_')) return 'note';
	const m = /^(inv|era|gear):(.+)$/.exec(k);
	if (m) return m[1];                                                    // 一支三族 → 展开
	if (/^codex:[a-z_]\w*$/.test(k)) return 'codex';
	if (k.startsWith('pc.')) return 'pc';
	// `#1275`（案 A）：`chk:<站点>.<字段>` ＝ **运行时结果维**。
	// 为什么单独一支：`chk:` key 里带 `.`（`chk:书房·敲墙.success`）⇒ 不加这一支会**落到 `dotted`**（族判定错）。
	// 与 `KEY_PREFIX_RE` 是**两个面**：那个管"可读前缀合法性"，这个管"族归属" ⇒ 加族必须**两处同改**
	// （成对断言 `test/readkey-family.mjs` 锁住"core 族集合 ≡ 引擎族集合"）。
	if (/^chk:(.+)\.([a-z]+)$/.test(k)) return 'chk';
	// `#1413`（**战斗结果维**，与 `chk:` 同构）：`fight:<池名>.<字段>`（同一支的理由同 `chk:` ——
	// key 里带 `.` ⇒ 不加这一支会落到 `dotted` ✗）
	if (/^fight:(.+)\.([a-z]+)$/.test(k)) return 'fight';
	if (k.includes('.')) return 'dotted';
	return 'bare';
};
// ── 读点形态（与写点同一处权威；`#436` 原范围 1）────────────────────────────
// 三种写法：`$pc.ev.x`（正文/宏）、`pc.ev.x`（裸 JS，如表内函数体）、`p.ev?.x`（表内谓词）。
// **读点必须排除写行**（同一行里出现 `.ev.x =` / `.ev.x to`）——否则"写了没人读"会被算成读过
//（本仓 #365 那类误判的根源；`analyze()` 里的行为逐字保留）。
export const READ_PATTERNS = [
	/\$pc\.(ev|world)\.([a-z_]\w*)/g,
	/\bpc\.(ev|world)\.([a-z_]\w*)/g,
	/\bp\.(ev|world)\??\.([a-z_]\w*)/g,
	// `#460` 补：**引擎 JS 里的读**写法（`State.variables.pc?.ev?.last_roll`）此前**任何模式都不认** →
	//「只有写没有读」把引擎自己的运行时槽判成假红（实测：`last_roll` 只靠一条**注释**里提了一句才"有读"）。
	/\bState\.variables\.pc\??\.(ev|world)\??\.([a-z_]\w*)/g,
];
// `#437` 批二的形状：**经封装层的路径读** —— `Sg.notes.readPath(pc, 'ev.x')`／`writePath` 的读侧。
// 为什么要单列：表里的谓词从"直读旗标"（`!!p.ev.x`）改成走封装层之后，**消费点不该消失**
//（`--notes` 的消费可数、D2 的分级都靠"谁读了它"）；但它**不是**「无字面状态读」要抓的那种直读
//（那份判据管的是"绕过封装层的裸读"）→ 两个口径必须分开，否则改一处就假红另一处。
export const WRAPPED_READ_RE = /Sg\.notes\.readPath\(\s*[^,()]+,\s*['"]([a-z_]+)\.([a-z_]\w*)['"]/g;
export const wrappedReadKeys = (text) => [...maskComments(text).matchAll(new RegExp(WRAPPED_READ_RE.source, 'g'))].map((m) => `${m[1]}.${m[2]}`);
// `#785` 第 1 族：**声明式条件**里的键（`req/any/exclude` 数组字面量）——线索判定从"手写谓词"改成
// 声明式条件后，`!!p.world?.x` 这种直读写法消失 → 若这里不认，`--state`／`--notes`／后果门会把
// **真实消费点**判成"无任何桶/未被消费"（假红）。键形与 `ruleRowKeys()` 同源：`n_*`＝笔记读；
// `inv:`/`era:`/`gear:`＝前缀键（不在状态域，跳过）；其余点分键＝状态键。
export const DECL_COND_RE = /\b(?:req|any|exclude)\s*:\s*\[([^\]]*)\]/g;
export const declCondRefs = (text) => {
	const line = maskComments(text);
	const states = [], notes = [];
	for (const m of line.matchAll(new RegExp(DECL_COND_RE.source, 'g'))) {
		for (const q of m[1].matchAll(/'([^']+)'/g)) {
			const k = q[1];
			// `#1156`：**族判定走单一权威** `readKeyFamily`（引擎 `readKey` 的镜像 → 成对断言锁住）；
			//注意：各族在此处的**去留语义原样保留**（"可读" ≠ "进状态契约"）：
			// `note` → notes ｜ `inv/era/gear` → **跳过**（不在状态契约域 与 `ruleRowKeys` 同口径）
			// ｜ `codex` → **进 states**（被读但不是状态键 `#1132` 块 1）｜ `pc/dotted` → 进 states（剥根）。
			const fam = readKeyFamily(k);
			if (fam === 'note') { notes.push(k); continue; }
			if (fam === 'inv' || fam === 'era' || fam === 'gear') continue;
			if (fam === 'codex') { states.push(k); continue; }
			// 归一化：**显式根 → 裸键**（与 `mergeByBare()`／`ruleRowKeys()` 同一口径；两处不一致过一次：
			// 不剥 `pc.` 会把 `pc.gold` 报成未登记的新键、逼出第二种命名形状）。点分**非**根键原样保留。
			if (/^[a-z_]\w*(\.[a-z_]\w*)+$/.test(k)) states.push(k.replace(/^(?:pc|ev|world)\./, ''));
		}
	}
	return { states, notes };
};
// 单行 → 去重后的**限定键**（`ev.x` / `world.x`）——**含**封装层读（"谁读了它"的单一权威）
export const readKeys = (text) => {
	// `#580`：注释里的提法**不算读**（`maskComments` 保长度 → 行内逻辑不受影响）
	const line = maskComments(text);
	const out = new Set();
	for (const k of declCondRefs(line).states) out.add(k);   // `#785`：声明式条件里的状态键
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
 * 两个口径分开是刻意的：`--reads` 管"绕过封装层的裸读"，而"谁读了它"要连封装层读一起算。 */
export const literalReadKeys = (text) => {
	const wrapped = new Set(wrappedReadKeys(text));
	return readKeys(text).filter((k) => !wrapped.has(k));
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
// ── 条件项 → 键名（`#491` 另票的口径：**对象形算子条件**）────────────────────────────
// 行的 `req`/`any`/`exclude` 里，一项可以是：
// · 字符串：`'n_x'`（note id）／`'fog_thin'`（裸键＝`ev.`）／`'world.x'`／`'inv:日记'`／`'era:past'`；
// · **对象算子形**（数值/枚举另票）：`{ gte: ['star.spent', 3]}`／`{ lte: ['hp', 1]}`／`{ oneOf: ['keeper.state', ['seal']]}`。
// 这里只取**键**（算子/阈值不进状态契约、不进旗标分级）——门侧各消费点都经它，避免各写一套。
// 算子本身的**声明面**＝`Sg.rules.ops`（与 `prefixes`／`effects` 同轴：用了未声明的算子 → `--rules` 判红）。
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
export const asListOf = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);
// 条件表行引用的**限定键**（`ev.x`/`world.x`）——`--state` 用（它按限定键判"有写有读"）。
// 与 `ruleRowFlags()`（裸键，D2 用）同源：都从 `req/any/exclude` 取；`n_*` 展开成笔记的 `flagPath`。
export const ruleRowKeys = (row, entries) => {
	const paths = notePaths(entries);
	const out = new Set();
	for (const key of [...asListOf(row?.req), ...asListOf(row?.any), ...asListOf(row?.exclude)].flatMap(condKeysOf)) {
		// `#435`：**前缀键**（`inv:<道具>`／`era:<时代>`）不是状态键（持有物/时代都不在状态契约域里）
		// → 不参与"有写有读"；它们的求值在引擎侧 `Sg.rules.holds()`。
		if (KEY_PREFIX_RE.test(key)) continue;
		// `#435` 修正②：**第三命名空间**（`keeper.`/`star.`/`gold.`…）不是 `pc.ev`/`pc.world` 的键
		// → 不参与状态契约（`--state`）与旗标分级（D2）。不跳过的话 `keeper.met` 会被当成裸键 `met`
		// → `--state` 报"未落入任何域"（= 引入一个今天看不见的假红）。
		if (key.includes('.') && !/^(?:ev|world)\./.test(key)) continue;
		if (key.startsWith('n_')) for (const p of (paths.get(key) ?? [])) out.add(p);
		else out.add(key.includes('.') ? key : `ev.${key}`);
	}
	return [...out];
};
// ── JS 注释剥离（`#486` 的副产品）────────────────────────────────────────
// 为什么需要：`--text` 的「总字」把 `[script]` 段里的 **JS 注释**也当正文数了——它只剥 Twee 注释 `/% %/`。
// 实测代价：加一行 `//` 说明就把「主题词密度/总字」推高（`#519` +92 · `#486` 机制片 +2572），
// 逼着每次改引擎注释都要重签 golden → **基线被注释噪声占满**，真正的正文漂移反而看不见。
// 规则与 `gates/literals.mjs` 的 `blankComments` 同口径：`/* */` 块；`//` 行注释，**但前面不是 `:`**
//（避免把 `https://…` 截断）。**挖空而非删除**（保留行号/长度语义，供需要行号的调用方）。
// `#580`：**本入口保持原语义**（两条正则 + `[^:]` 守卫绕 `https://`）——为什么不像写点那样换成词法器：
// 它跑在**散文**上（`--text` 的"总字"），而散文里有 `''强调''`／单个撇号；词法器的"未闭合字符串剥到行尾"
// 会把散文吃掉（实测 −1 字 → golden 漂移）。散文面用启发式、代码面用词法器，**这是有意的分工**。
// 真正需要词法器的是**写点/读点提取**（`writeKeys`／`qualifiedWriteKeys`／`readKeys`／D2 的 `stripped`）——见上。
// `#1208`：**散文面专用**启发式（原名 `stripJsComments`，名不副实 → 改名 —— 它同时被代码面调用过，
// 而代码面的正解是 `./mask.mjs` 的单次词法扫描；一个句柄服务两种输入面正是 `#1206` 那类假阴性的温床）。
//注意：**不要**拿它扫代码：`//` 行里含 `/*` 时它会吞掉夹在中间的真代码（充要条件见 `test/comment-mask.mjs`）。
// 为什么散文面仍用它：词法器的"未闭合引号"分支会把散文吃掉（实测总字 −1 → 金标漂移）。
export const stripProseComments = (text) => String(text)
	.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
	.replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

// ── `#215` 车道 E-B1：从 `scripts/audit/lib/shared.mjs` **上移**（逐字；原处改转出；消费者一行不改）──
export const WRITE_PATTERNS = [
	{ re: /<<setflag\s+"(ev|world)\.([a-z_]\w*)"/g, kind: 'scoped' },      // `#624` 片三：`<<setflag "ev.x">>`（显式域）
	{ re: /<<setflag\s+"([a-z_]\w*)"/g, kind: 'world' },                 // 宏式写 world 域（裸键，原语义）
	{ re: /<<set\s+\$pc\.(ev|world)\.([a-z_]\w*)\s+to\b/g, kind: 'scoped' },
	{ re: /\bpc\.(ev|world)\.([a-z_]\w*)\s*=[^=]/g, kind: 'scoped' },     // 赋值式（含 `= null`／对象／字符串）
	{ re: /\bpc\.(ev|world)\[["']([a-z_]\w*)["']\]\s*=[^=]/g, kind: 'scoped' },
	{ re: /<<firstTime\s+"([a-z_]\w*)"\s*>>/g, kind: 'ev' },            // 宏式写 ev 域（读一次再写）
];
/** 裸键集合（D2 分类器用）。 */
// 文本里**经笔记**读到的裸键（D2 按裸键判）
/** 行里用到的算子（去重；供「算子必须由引擎宣告」的判据用）。 */
export const rowOps = (row) => {
	const out = new Set();
	for (const field of ['req', 'any', 'exclude']) for (const cond of asListOf(row?.[field])) {
		if (cond && typeof cond === 'object' && !Array.isArray(cond)) for (const op of Object.keys(cond)) if (OPS.includes(op)) out.add(op);
	}
	return [...out];
};
/** `yields` 项 → `[{ id, path}]`（`#491` 另票：**多源笔记的路径选择**）——`'n_x'` 或 `{ id:'n_x', path:'world.x'}`。 */
/** 经 `Sg.notes.add()` 写到的**限定键**（`ev.x`/`world.x`）。**限定形只记声明的那一条**（`#437` C-2）：
 * 多源笔记若把整族都记上，就等于承认"静默多写"——而 `#434` 的护栏恰恰要求 fail-loud。 */
export const noteWriteKeys = (text, entries) => {
	const paths = notePaths(entries);
	const out = new Set();
	const qualified = notePathWriteRefs(text);
	const qualifiedIds = new Set(qualified.map((q) => q.id));
	for (const q of qualified) out.add(q.path);
	// 未限定形（`<<note>>`／`Sg.notes.add`）仍按整族记 —— 它们**不该**用在多源笔记上（护栏会报）
	// `#1223` 重建：**未限定形折到 canonical `ev.notes.<id>`**（原折 `flagPath` 裸键 -> 与消费侧断开）。
	// 限定形（`notepath`／`addPath`）**仍只记声明的那一条**（`#434` 护栏，多源必须显式给 setPath）。
	// `#1223` rebuild: **every** write ref records the canonical key (qualified or not);
	// a qualified ref (`notepath` / `addPath`) **additionally** records the declared path only.
	for (const id of noteWriteRefs(text)) {
		out.add(`ev.notes.${id}`);
		if (qualifiedIds.has(id)) continue;
	}
	return [...out];
};
/** 同上，返回**裸键**（D2 按裸键判）。 */
/** 文本里 `Sg.notes.add('n_x')`（或 `<<note "n_x">>`）引用的笔记 id。 */
export const noteWriteRefs = (text) => {
	const out = new Set();
	for (const m of String(text ?? '').matchAll(NOTE_WRITE_RE)) out.add(m[1] ?? m[2]);   // 两种形状各有自己的捕获组
	// `#608`：**声明面驱动的写点**（`encounters[*].failNote`）同样算写——引擎侧是变量，字面 id 只在数据里
	for (const id of declaredNoteWriteRefs(text)) out.add(id);
	return [...out];
};
/** **路径限定**写点的 `[{ id, path}]`（两形状一份口径，`#437` C-2）。 */
/** **路径限定**写点的 `[{ id, path}]`（两形状一份口径，`#437` C-2）。 */
export const notePathWriteRefs = (text) => {
	const out = [], seen = new Set();
	for (const m of String(text ?? '').matchAll(NOTE_PATH_WRITE_RE)) {
		const id = m[1] ?? m[3], path = m[2] ?? m[4];
		const k = `${id}\u0000${path}`;
		if (seen.has(k)) continue;
		seen.add(k);
		out.push({ id, path });
	}
	return out;
};
/** 经 `Sg.notes.add()` 写到的**限定键**（`ev.x`/`world.x`）。**限定形只记声明的那一条**（`#437` C-2）：
 * 多源笔记若把整族都记上，就等于承认"静默多写"——而 `#434` 的护栏恰恰要求 fail-loud。 */
/** **路径限定**写点 → `[{ id, path}]`（`#437` 批三 C-2）。为什么要单独一条正则：多源笔记要知道
 * **写的是哪一条**（`<<note>>` 只能记整族；`noteWriteKeys()` 对限定形**只记声明的那条**）。
 * 宏参数在 SugarCube 里按**空白**切 → 写成 `<<notepath "id", "path">>` 会把逗号带进参数；
 * 那种写法**不被本正则认**（记不进记账 → 会红）。方向是安全的：它是坏形状，不该被认。 */
export const NOTE_PATH_WRITE_RE = /(?:Sg\.notes\.addPath\(\s*['"](n_[a-z0-9_]+)['"]\s*,\s*['"]((?:ev|world)\.[a-z0-9_]+)['"]|<<\s*notepath\s+['"](n_[a-z0-9_]+)['"]\s+['"]((?:ev|world)\.[a-z0-9_]+)['"])/g;
/** 只要**模块 API** 那一种（`Sg.notes.add(`／`Sg.notes.addPath(`）。判「表里该用宏还是裸 API」时用它（`#624` 片一）：
 * `NOTE_WRITE_RE` 认三种形状（记账用），而**点击态域里的 `<<note>>`／`<<notepath>>` 是允许的**，不许当成裸 API 判红。
 * `addPath` 一并咬（`#437` C-2）：否则"路径限定"的裸 API 形态成了 W1 白名单之外的一条后门。 */
// ── 笔记**写点**（`#434` 阶段 3）：`Sg.notes.add('n_x')` 写的是该笔记 `flagPath` 里的键 ──────────
// 与读点（`noteReadKeys`）并列，仍是**单一权威**。为什么需要它：写点从「字面量写旗标」改成
//「经 `Sg.notes.add` 写」之后，按**字面量**认写点的门（`--state` 的"有写有读"、D2 的桶分类）
// 会把该键判成**只有读** → 假红。（阶段 2 的 5 个消费点就是这个剧本，那次换的是**读**点形状。）
// 三种**写点形状**（单一权威）：① 模块 API `Sg.notes.add('n_x')`；② 词汇宏 ``<<note "n_x">>``（`#624` 片一新增，
// 表行与点击态里该用宏）；③ **路径限定**的 ``<<notepath "n_x" "ev.y">>``／`Sg.notes.addPath('n_x','ev.y')`
//（`#437` 批三 C-2：多源笔记 `flagPath: [a,b]` 必须声明**写哪一条**，否则整族都算被写＝静默多写）。
// **新写点形状只改这一处** —— 否则 `--state`／D2／`--sel-gear`／`premise-source`
// 会集体把它当"只读" → 幽灵条件假红（阶段 2 的五消费点、`#624` 批 1 都撞过同一剧本）。
// `#437` C-2b 的这一处是**读侧 `hasIf()` 那次的同构**：读侧堵了、写侧不堵 → "转一处、写点丢一处"。
export const NOTE_WRITE_RE = /(?:Sg\.notes\.add(?:Path)?\(\s*['"](n_[a-z0-9_]+)['"]|<<\s*(?:note|notepath)\s+['"](n_[a-z0-9_]+)['"])/g;
/** **路径限定**写点 → `[{ id, path}]`（`#437` 批三 C-2）。为什么要单独一条正则：多源笔记要知道
 * **写的是哪一条**（`<<note>>` 只能记整族；`noteWriteKeys()` 对限定形**只记声明的那条**）。
 * 宏参数在 SugarCube 里按**空白**切 → 写成 `<<notepath "id", "path">>` 会把逗号带进参数；
 * 那种写法**不被本正则认**（记不进记账 → 会红）。方向是安全的：它是坏形状，不该被认。 */
export const declaredNoteWriteRefs = (text) => [...String(text ?? '').matchAll(DECLARED_NOTE_WRITE_RE)].map((m) => m[1]);
/** 条件键 → 与段落 `<<if>>` 里**同形**的条件文本（`n_*` → `Sg.notes.has('n_x')`；其余 → `$pc.<域>.<键>`，裸键默认 `ev.`）。
 * 为什么必须只有一份（`#435` 前置 0）：表侧条件（行的 `req`/`any`/`exclude`）要过**同一份**判据
 *（`causeReg()`／`conditionReadsFlag()`），若两处各写一套转换 → 必然漂移（`--echoes` 与 `--investment` G3 都用它）。 */
/** **声明面驱动的写点**（`#608`）：短战斗 widget 落败时按 `encounters[*].failNote` 写笔记——
 * 引擎侧是**变量**（`<<note _note>>`），字面 id 只在**故事的数据表**里 → 静态扫描必须以声明为源，
 * 否则 `--state` 会报「只有读没有写（幽灵条件）」（实测：`cave_battered` 恰好踩中）。 */
export const DECLARED_NOTE_WRITE_RE = /failNote\s*:\s*['"](n_[a-z0-9_]+)['"]/g;
// **条件文本是否消费了旗标 `flag`**（两种形状，单一权威）：
// ① 直接读：`$pc.ev.flag` / `$pc.world['flag']`
// ② 经笔记：`Sg.notes.has('n_flag')`（该笔记的 flagPath 含此旗标）
// `noteIds`：该旗标对应的笔记 id 数组（`noteIdsForFlag()` 的结果，缺省＝只认形状①）
export const conditionReadsFlag = (text, flag, noteIds = []) => {
	if (new RegExp(`(?:world|ev)\\s*(?:\\.|\\[)?["']?${flag}\\b`).test(String(text ?? ''))) return true;
	return noteIds.some((id) => new RegExp(`Sg\\.notes\\.(?:has|entry)\\(\\s*['"]${id}['"]`).test(String(text ?? '')));
};
// 条件文本里读到的旗标（**裸键，按出现顺序去重**）——两种形状一次扫完。
// 为什么强调顺序：报告文本（如 `--investment` G3 的「老巫女（seer_asked、coord、failure_cause）」）
// 直接印这串旗标 → 顺序稳定才能让「纯转发」的判据保持逐字一致（否则每转一处就要重签 golden 一行）。
// 返回**数组**（与 `noteReadKeys()` 一致：Set 会被 `.concat()` 当成单个元素——踩过一次）。
// 文本里**经笔记**读到的限定键（`ev.x`/`world.x`）
/** #1223: the ONE prefix normalization shared by both gates (consequences / state).
 * Both sides must call it before any set comparison; do not keep a copy per gate
 * (this session already bit once because there were two copies).
 */
export const bareKey = (k) => String(k ?? '').replace(/^(ev|world)\./, '');

export const noteReadKeys = (text, entries) => {
	// #1223 rebuild: the READ side must use the same canonical key as the WRITE side (ev.notes.<id>).
	// Folding to the note flagPath paths here was the mismatch that flipped the #608 positive
	// selftest (write = canonical, read = flagPath).
	const out = new Set();
	for (const id of noteRefs(text)) out.add(`ev.notes.${id}`);
	return [...out];
};
// 文本里**经笔记**读到的裸键（D2 按裸键判）
/** 行里用到的算子（去重；供「算子必须由引擎宣告」的判据用）。 */
// `#785`：声明式条件里的 `n_*` 也是笔记读（`req: ['n_x']`）——笔记消费可数不该因改形状而消失。
// 文本里引用的笔记 id
export const noteRefs = (text) => {
	const out = new Set();
	for (const m of String(text ?? '').matchAll(NOTE_REF_RE)) out.add(m[1] ?? m[2]);
	// `#785`：声明式条件里的 `n_*`（`req: ['n_x']`）也是笔记读 —— 消费可数不该因改形状而消失
	for (const id of declCondRefs(text).notes) out.add(id);
	return [...out];
};

/** `#1223`：**只含读**的 refs —— 供"谁消费了它"使用（声明形 `note:x` 不计）。
 * 两条读路径都要在（**形态**分，不按键名）：`Sg.notes.has/entry('n_x')` ＋ 声明式条件 `req: ['n_x']`。
 */
export const noteReadRefs = (text) => {
	const out = new Set();
	for (const m of String(text ?? '').matchAll(NOTE_READ_RE)) out.add(m[1]);
	for (const id of declCondRefs(text).notes) out.add(id);
	return [...out];
};
// 文本里**经笔记**读到的限定键（`ev.x`/`world.x`）
// audit 跨门共享 helper（#316 第 2 步）：被 ≥2 个门使用的定义集中于此，由壳注入 ctx。
// 清单：build/_shared_list.json（收敛循环自动发现）。
// ── 笔记引用（`#433` 阶段 2 的读点形状）：`Sg.notes.has('n_x')`／`Sg.notes.entry('n_x')`／`note:n_x` ──
// 为什么放在这里（与写点/读点并列）：阶段 2 把段落条件从 `<<if $pc.ev.X>>` 改成 `Sg.notes.has('n_X')`，
// 于是「谁读了旗标 X」这件事**换了写法但不该消失**——依赖它的门（`--state` 的有写有读、D2 的桶分类）
// 必须跟着认这个形状。否则转发的第一步就会把一堆键判成"只有写"→ 门红而代码其实等价（假红）。
// 这就是设计稿那条纪律：**先让门认新形状，再改内容**。
// `#1223` rebuild: **declaration is not consumption** -- split the two halves by FORM (never by key name).
// read half: `Sg.notes.has('n_x')` / `entry('n_x')` => a real read.
// decl half: `note:n_x` (a write-side declaration, e.g. in `yields`) => **NOT** a read.
export const NOTE_READ_RE = /Sg\.notes\.(?:has|entry)\(\s*['"](n_[a-z0-9_]+)['"]/g;
export const NOTE_DECL_RE = /(?:^|[^\w:])note:(n_[a-z0-9_]+)/g;
// kept for the write-side callers (write refs accept both forms); consumption must use `noteReadRefs`.
export const NOTE_REF_RE = /Sg\.notes\.(?:has|entry)\(\s*['"](n_[a-z0-9_]+)['"]|(?:^|[^\w:])note:(n_[a-z0-9_]+)/g;
// `#785`：声明式条件里的 `n_*` 也是笔记读（`req: ['n_x']`）——笔记消费可数不该因改形状而消失。
// 文本里引用的笔记 id
