// 条件表门（`#435` 阶段 4）：**死规则** ＋ **`prereq` 形状** ＋ **并列 prio 报告**。
//
// 为什么需要它：表驱动的代价是"行的可达性不再肉眼可见"——一条 prio 更低、条件被完全覆盖的行
// 永不被选中，而它的 `text` 会**静默死掉**。
//
// 判据（dev 复核后定稿，2026-09-14）：**反例搜索式可满足性包含** ——
//   「A 可选中 ⇒ B 必可选中」不成立 ⟺ 存在一组赋值使 A 命中而 B 不命中。
//   搜索空间有限且只需看**极小**解：因谓词形如 req⊆／any∩≠∅／exclude∩=∅（单调），
//   A 的极小可满足赋值只有 `req(A)` 与 `req(A)∪{a}`（a ∈ any(A) \ exclude(A)）两种形态；
//   `prereq` 的历史取**极小**（`chose = prereq(A)`，多加只会更利于 B）。
//   ⇒ 对每个极小赋值试 B：**有反例 ⇒ 不是死规则**（并把反例打出来）；全都命中 ⇒ A 死。
//   （为什么不用"只比 req ⊆"：`A={req:['x']}` vs `B={req:[], exclude:['y']}` 就不是死规则；
//     反过来 `any(B)` 落在 `any(A)` 里时也可能 B 不中——两种我们都用反例搜索兜住。）
//
// 用法：node scripts/audit.mjs --rules --check
//
// 追加（`#435` 三片之①，2026-09-14）——**写侧**（读侧＝新门 `--reads`）：
//   ③ `text` 列只许**纯渲染**：A 方案（`text` 只渲染，`yields` 由 `<<rules>>` 渲染成功后统一落
//      `Sg.notes.add`）若允许表里写状态，就会**悄悄退化成 B**（数据里夹机制：`yields` 变装饰、与真写点各自漂移）。
//   ④ `scope` 机检（三条，都属"行永不被选中/两位点抢一行"同族）：
//      · **未接管行**：`scope` 全仓无 `<<rules "…">>` 调用点 ⇒ 该行永远不被渲染（搬家漏了半截）；
//      · **同位点重复调用**：同一段落里同一 `scope` 被调用 ≥2 次 ⇒ 两个位点抢同一行（渲染重复）；
//      · **归属不符**：`scope` 写成 `段落#位点`（＝声明了归属段落）时，调用点必须**就在那个段落**里。
//      另：无对应行的调用点 ⇒ 红（`pick()` 返回 null ＝ 正文静默消失，是本门要抓的同一类静默）。
import { WRITE_PATTERNS, NOTE_WRITE_RE, NOTE_WRITE_API_RE, rowOps, condKeysOf, yieldsList, notePaths } from '../../../scripts/../scripts/audit/lib/shared.mjs';

export const flag = 'rules';
export const flags = ['rules'];

const keys = (x) => (Array.isArray(x) ? x.map(String) : x ? [String(x)] : []);
const asList = (x) => (Array.isArray(x) ? x : x ? [x] : []);
/** 条件项 → 键（**单一权威** `condKeysOf`）：字符串项／对象算子项都取到真键。
 *  `#624` 之前这里是 `keys(x).map(String)` ⇒ 对象形被 `String()` 成 `'[object Object]'`，
 *  于是"死规则/并列 prio"的键推理**对新形状静默失去意义**（不报错、但结论全是噪声）。 */
const norm = (x) => asList(x).flatMap((c) => condKeysOf(c)).map((k) => String(k).replace(/^(ev|world)\./, ''));
/** 行里是否用了对象算子（`{ gte: … }` 这类）—— 数值/集合语义不参与布尔包含判定，见 `deadRows`。 */
export const opRows = (rows) => (rows ?? []).filter((r) => r?.id && rowOps(r).length > 0).map((r) => r.id);

/** 一行在给定赋值下是否命中（纯函数；`state` 断言键集合，`chose` 是先前行 id 集合）。 */
export const rowMatches = (row, state, chose) =>
	norm(row.req).every((k) => state.has(k)) &&
	(norm(row.any).length === 0 || norm(row.any).some((k) => state.has(k))) &&
	!norm(row.exclude).some((k) => state.has(k)) &&
	keys(row.prereq).every((id) => chose.has(id));

/** 纯函数：返回被判死的行 `[{ id, killedBy }]`（规则式可满足性包含；逐条都可被反例证伪）。
 *
 *  A 死（被 B 覆盖）⟺ 下面四条**同时**成立 —— 每条都对应一种"反例形态"，任一条不成立就有反例：
 *   ① `req(B) ⊆ req(A)`          否则 B 会缺一个 A 必有的键（S 不含它 ⇒ B 不中）；
 *   ② `exclude(B) ⊆ exclude(A)`  否则 B 会因某个 A 允许为真的键为真而落选（**dev 反例①**：A.req=['x'] vs B.exclude=['y']）；
 *   ③ `any(B)` 被 A 的 **必含键**保证（`any(B)=∅` 或 `∃k ∈ any(B) ∩ req(A)`）
 *                                否则 A 只保证"任一"时可让 B 的择一落空（**dev 反例②**：A.any=['b','c'] vs B.any=['c']）；
 *   ④ `prereq(B) ⊆ prereq(A)`     否则历史可以让 A 有资格而 B 没有。
 *   ⚠️ 不采用"只取极小赋值"的搜索：反例状态可以**多带一个真键**（`{x,y}` ⇒ A 中 B 不中）⇒ 极小化会漏掉反例。
 */
export const deadRows = (rows) => {
	const list = (rows ?? []).filter((r) => r && r.id);
	const out = [];
	for (const a of list) {
		const reqA = norm(a.req), exA = norm(a.exclude);
		// `#624`：**任一侧含对象算子 ⇒ 保守跳过**（不判死也不当被判死）。
		// 为什么必须这样：`gte`／`oneOf` 的语义是"数值/集合"的，而下面是**布尔键包含**推理——
		// 硬套会给出**错误结论**（假红/假绿都不可接受）。宁可不判，也不误判；跳过的行由 `opRows()` 在报告里点名。
		if (rowOps(a).length) continue;
		const killer = list.find((b) => {
			if (b === a || b.scope !== a.scope || !((b.prio ?? 0) > (a.prio ?? 0))) return false;
			if (rowOps(b).length) return false;                                     // ← 含算子的行不当"杀手"（同理由）
			if (!norm(b.req).every((k) => reqA.includes(k))) return false;          // ①
			if (!norm(b.exclude).every((k) => exA.includes(k))) return false;       // ②
			const anyB = norm(b.any);
			if (anyB.length && !anyB.some((k) => reqA.includes(k))) return false;   // ③
			if (!keys(b.prereq).every((id) => keys(a.prereq).includes(id))) return false;  // ④
			return true;
		});
		if (killer) out.push({ id: a.id, killedBy: killer.id });
	}
	return out;
};

/** 纯函数：`prereq` 形状问题 —— 跨 scope 引用 ＋ 循环。 */
export const prereqProblems = (rows) => {
	const list = (rows ?? []).filter((r) => r && r.id);
	const byId = new Map(list.map((r) => [r.id, r]));
	const out = [];
	for (const r of list) for (const id of keys(r.prereq)) {
		const t = byId.get(id);
		if (!t) { out.push(`prereq 指向不存在的行：${r.id} → ${id}`); continue; }
		if (t.scope !== r.scope) out.push(`prereq 跨 scope：${r.id}(${r.scope}) → ${id}(${t.scope})（跨作用域＝隐式全局顺序，禁）`);
	}
	// 环：DFS 三色
	const color = new Map();
	const dfs = (id, stack) => {
		if (color.get(id) === 1) { out.push(`prereq 成环：${[...stack, id].join(' → ')}`); return; }
		if (color.get(id) === 2) return;
		color.set(id, 1);
		for (const n of keys(byId.get(id)?.prereq)) if (byId.has(n)) dfs(n, [...stack, id]);
		color.set(id, 2);
	};
	for (const r of list) dfs(r.id, []);
	return [...new Set(out)];
};

/** 纯函数：并列 `prio`（都可选中）的候选清单（**只报告**，裁决＝表序最前）。 */
export const ties = (rows) => {
	const byScope = new Map();
	for (const r of (rows ?? []).filter((x) => x?.id)) {
		const k = `${r.scope}|${r.prio ?? 0}`;
		byScope.set(k, [...(byScope.get(k) ?? []), r.id]);
	}
	return [...byScope.entries()].filter(([, ids]) => ids.length > 1).map(([k, ids]) => ({ scope: k.split('|')[0], prio: k.split('|')[1], ids }));
};

// ── ③ `text` 列只许纯渲染（写侧判据）────────────────────────────────────────
// 形态清单与 `--reads`（读侧）刻意**成对**：一个管"表里不许写"，一个管"表里不许读"。
// 写宏：SugarCube/本仓会改状态的宏；赋值式：复用 `shared.mjs` 的 `WRITE_PATTERNS` **单一权威**
//（`<<set $pc.ev.x to>>`／`pc.ev.x =` 都在其中）；`Sg.notes.add()` 复用 `NOTE_WRITE_RE`。
// 允许：`<<link>>`／`<<goto>>`／`<<if>>`／widget 之类的**纯渲染/导航**（它们不改状态）。
export const TEXT_WRITE_MACROS = ['set', 'setflag', 'run', 'give', 'damage', 'ending', 'firstTime', 'note'];
/** 一行 `text` 里的状态写形态（空数组＝纯渲染）。 */
export const textWrites = (text) => {
	const t = String(text ?? '');
	const hits = [];
	for (const m of t.matchAll(/<<\s*([A-Za-z_][\w]*)\b/g)) if (TEXT_WRITE_MACROS.includes(m[1])) hits.push(`<<${m[1]}>>`);
	for (const { re } of WRITE_PATTERNS) if (new RegExp(re.source, 'g').test(t)) hits.push('状态赋值');
	if (new RegExp(NOTE_WRITE_RE.source, 'g').test(t)) hits.push('Sg.notes.add()');
	return [...new Set(hits)];
};
/** 点击态域**允许**的词汇宏（与 L0-W1 同一份口径）。
 *  `damage` **刻意不在内**：带它的即"检定＋后果机制块"（`docs/notes-model.md` 边界 4）⇒ 机制块不搬，让它红当护栏。 */
export const CLICK_VOCAB_MACROS = ['note', 'give', 'setflag', 'econ', 'flip'];
/** 分域：`text` → `{ render, clicks }`（点击态域＝`<<link>>…<</link>>` 体内；渲染域＝其余）。 */
export const splitTextDomains = (text) => {
	const t = String(text ?? '');
	const clicks = [...t.matchAll(/<<link\b[^>]*>>([\s\S]*?)<\/link>>/g)].map((m) => m[1]);
	return { render: t.replace(/<<link\b[^>]*>>([\s\S]*?)<\/link>>/g, ''), clicks };
};
/** **`#624` 片一** 的新判据：按域判写（`[]`＝纯渲染）。
 *  渲染域：**任何**写形态 ⇒ 红（判据与旧版一字不动）。
 *  点击态域：只许词汇宏；裸 `<<set>>`／`<<run>>`／`<<script>>`／模块 API（`Sg.notes.add`…）／`<<damage>>` ⇒ 红。 */
export const textWriteProbs = (text) => {
	const out = [];
	const { render, clicks } = splitTextDomains(text);
	const rh = textWrites(render);
	if (rh.length) out.push({ domain: '渲染', hits: rh });
	clicks.forEach((body, i) => {
		// 先把**白名单内的词汇宏调用**整段剔掉，再看剩下什么：剔除是必需的 —— 有些宏本身也在
		// `WRITE_PATTERNS` 里（如 `<<setflag "x">>`），不剔就会把**已允许**的写法判成「状态赋值」（本批实测撞到）。
		let rest = String(body);
		for (const m of CLICK_VOCAB_MACROS) rest = rest.replace(new RegExp(`<<\\s*${m}\\b[^>]*>>`, 'g'), ' ');
		const raw = [];
		for (const m of rest.matchAll(/<<\s*([A-Za-z_][\w]*)\b/g)) if (TEXT_WRITE_MACROS.includes(m[1])) raw.push(`<<${m[1]}>>`);
		for (const { re } of WRITE_PATTERNS) if (new RegExp(re.source, 'g').test(rest)) raw.push('状态赋值');
		if (NOTE_WRITE_API_RE.test(rest)) raw.push('Sg.notes.add()');   // 只咬裸 API；宏形态 `<<note>>` 已在上面被剔掉
		if (raw.length) out.push({ domain: `点击态#${i + 1}`, hits: [...new Set(raw)] });
	});
	return out;
};
/** 全表：哪些行的 `text` 含状态写 ⇒ `[{ id, probs }]`。 */
export const textWriteRows = (rows) =>
	(rows ?? []).filter((r) => r?.id).map((r) => ({ id: r.id, probs: textWriteProbs(r.text) })).filter((x) => x.probs.length);

// ── ③' `text` 里的**分支**只许读「渲染期只读槽」（`#435` 口径，guest 问的"机制内层 `<<if>>`"）─────
// 口径（2026-09-14 拍板）：判定结果 → 两段文案**属渲染**（`<<if $last_check.success>>…<<else>>…`），
// 不是"数据里夹机制" —— 把"判定面"外置就得让表声明检定/DC/骰，那才是把**机制**复制进表。
// 所以允许 `<<if>>`，但边界写死、可机检：
//   ✔ 允许读：**判定结果槽**（`$last_check`）与 `_` 前缀局部量（SugarCube 渲染期临时量）；
//   ✘ 禁止读：状态路径（`pc.ev/pc.world`，`--reads` 另判）· 笔记/表 API（`Sg.notes.*`/`Sg.rules.*`）· 持有物（`inv[…]`）·
//                `$era` —— 这些属**条件面**，请写成行的 `req`/`any`/`exclude`（键形含 `inv:<道具>`／`era:<时代>`）。
export const TEXT_BRANCH_ALLOW = ['last_check'];
export const TEXT_BRANCH_FORBID = [
	[/\bSg\.(?:notes|rules)\b/, 'Sg.notes/Sg.rules（笔记/表 API）'],
	[/\binv\s*\[/, 'inv[…]（持有物）'],
	[/\$era\b/, '$era（时代）'],
	[/\bGame\.Consequences\b/, 'Game.Consequences'],
];
/** 一行 `text` 里的分支条件违规 ⇒ `[{ cond, why }]`（空＝干净）。 */
export const textBranchProbs = (text) => {
	const out = [];
	for (const m of String(text ?? '').matchAll(/<<\s*(?:if|elseif)\s+([\s\S]*?)>>/g)) {
		const cond = m[1].trim();
		const why = [];
		for (const v of cond.matchAll(/\$([A-Za-z_]\w*)/g)) if (!TEXT_BRANCH_ALLOW.includes(v[1])) why.push(`$${v[1]}`);
		for (const [re, label] of TEXT_BRANCH_FORBID) if (re.test(cond)) why.push(label);
		if (why.length) out.push({ cond, why: [...new Set(why)] });
	}
	return out;
};
/** 全表：`text` 分支越界的行 ⇒ `[{ id, probs }]`。 */
export const textBranchRows = (rows) =>
	(rows ?? []).filter((r) => r?.id).map((r) => ({ id: r.id, probs: textBranchProbs(r.text) })).filter((x) => x.probs.length);

// ── ③'' 键形：条件语言的**声明面**（前缀键必须由引擎宣告支持——反沉默）─────────────────
// `#435`：条件键可以是 `n_*` note id ∕ 裸键名 ∕ `ev.x`／`world.x`（状态路径），以及**前缀形**：
// `inv:<道具>`（持有物）· `era:<时代>`（时代）。前缀的**求值**在引擎侧 `Sg.rules.holds()`；
// ⇒ 引擎必须在 `Sg.rules.prefixes` 里**宣告**它支持哪些前缀，门的判据是「行里用的前缀 ⊆ 引擎宣告的」。
// 为什么要这层：否则作者写了 `inv:日记` 而引擎不认 ⇒ **条件永远不命中**（行静默死掉，最坏那种 bug）。
export const rowKeyPrefixes = (rows) => {
	const out = new Set();
	for (const r of rows ?? []) for (const f of ['req', 'any', 'exclude']) for (const k of (Array.isArray(r?.[f]) ? r[f] : r?.[f] ? [r[f]] : [])) {
		const m = /^([a-z_]+):/.exec(String(k));
		if (m) out.add(m[1]);
	}
	return [...out];
};
/** `sets:` 形状判据（`#435` Q1 拍板：**授予家族第三类**——`yields` 笔记／`gives` 物品／`sets` 状态键）。
 *  三条收窄（都可机检，就是为了不让"表＝脚本"）：
 *   ① 键必须是**已登记的状态键**（裸键或 `ev.`/`world.` 限定；复用 `--state` 的域表）；
 *   ② **有笔记的键不得进 `sets`**（那必须走 `yields`——否则就是"同一知识两条写路"，正是 `#434` 用 fail-loud 挡的）；
 *   ③ 只许**布尔置真**语义（`sets: ['k']` ≡ `<<setflag "k">>`）；数值/枚举写不在内（另票）。
 *  另：写点仍恒在 `<<rules>>` 一处（引擎侧 `applySets`，幂等，与 `applyYields`/`applyGrants` 同面）。 */
export const setProblems = (rows, { notes = {}, domains = [] } = {}) => {
	const flagPaths = new Set();
	for (const e of Object.values(notes ?? {})) for (const p of (Array.isArray(e?.flagPath) ? e.flagPath : e?.flagPath ? [e.flagPath] : [])) flagPaths.add(String(p));
	const match = (b) => (domains ?? []).filter((d) => (d.keys ?? []).includes(b) || (d.prefix ?? []).some((x) => b.startsWith(x)));
	const out = [];
	for (const r of rows ?? []) {
		for (const k0 of (Array.isArray(r?.sets) ? r.sets : r?.sets ? [r.sets] : [])) {
			const k = String(k0), bare = k.replace(/^(ev|world)\./, '');
			if (/^(?:inv|era):/.test(k) || k.startsWith('n_')) { out.push({ id: r.id, key: k, why: '键形非法（`sets` 只写状态键：不写 note id／前缀键）' }); continue; }
			if (!/^(?:ev|world)\.[a-z_]\w*$/.test(k) && !/^[a-z_]\w*$/.test(k)) { out.push({ id: r.id, key: k, why: '键形非法（写裸键或 `ev.`/`world.` 限定；裸键默认 `ev.`，与 `holds()` 同口径）' }); continue; }
			const qualified = k.includes('.') ? k : `ev.${k}`;
			if (flagPaths.has(qualified)) { out.push({ id: r.id, key: k, why: '该键**有笔记** ⇒ 必须走 `yields`（避免同一知识两条写路）' }); continue; }
			if (!match(bare).length) out.push({ id: r.id, key: k, why: '键未登记在状态契约域（`--state`）里' });
		}
	}
	return out;
};
/** **算子声明面**：行里用了 `{ gte: … }`／`{ lte: … }`／`{ oneOf: … }` ⇒ 引擎必须在 `Sg.rules.ops` 里宣告
 *  （与 `prefixes`／`effects` 同轴的反沉默：引擎不认的算子会让条件**永假**＝行静默死掉）。 */
export const undeclaredOps = (rows, declared = []) => {
	const used = new Set((rows ?? []).flatMap((r) => rowOps(r)));
	return [...used].filter((op) => !(declared ?? []).includes(op)).map((op) => ({ op, declared: declared ?? [] }));
};
/** **取值项声明面**（`#624` 片二）：条件里写了 `{ gte: ['gold', { price: 'x' }] }` ⇒ 引擎必须在 `Sg.rules.terms` 里宣告
 *  （与 `ops`／`prefixes`／`effects` 同轴的反沉默）；取值项里出现**未宣告的名字**（含打错、含多个算子位）一并报。 */
export const undeclaredTerms = (rows, declared = []) => {
	const out = [];
	const seen = new Set();
	const scan = (x) => {
		if (!x || typeof x !== 'object' || Array.isArray(x)) return;
		for (const name of Object.keys(x)) if (!seen.has(name)) { seen.add(name); if (!(declared ?? []).includes(name)) out.push({ term: name, declared: declared ?? [] }); }
	};
	for (const r of rows ?? []) for (const field of ['req', 'any', 'exclude']) {
		const list = Array.isArray(r?.[field]) ? r[field] : r?.[field] ? [r[field]] : [];
		for (const cond of list) {
			if (!cond || typeof cond !== 'object' || Array.isArray(cond)) continue;
			for (const args of Object.values(cond)) if (Array.isArray(args)) for (const a of args.slice(1)) scan(a);
		}
	}
	return out;
};
/** **多源笔记的路径声明**（`#491` 另票）：`yields: [{ id:'n_x', path:'world.x' }]` 的 `path` 必须属于
 *  该笔记的 `flagPath` 集合 —— 否则就是"声明了一条不存在的路径"（写进去读不出来：`Sg.notes.has` 永不成立）。 */
export const yieldPathProblems = (rows, notes = {}) => {
	const paths = notePaths(notes);
	const out = [];
	for (const r of rows ?? []) for (const y of yieldsList(r)) {
		if (!y.path) continue;
		const known = paths.get(y.id) ?? [];
		if (!known.length) out.push({ id: r.id, yield: y.id, path: y.path, why: '该 `yields` 条目的笔记不存在（`Game.Notes.entries` 里没有）' });
		else if (!known.includes(y.path)) out.push({ id: r.id, yield: y.id, path: y.path, why: `该路径不属于这条笔记的 flagPath（可用：${known.join('/')}）` });
	}
	return out;
};

/** **引擎兑现的"面"**：行里用到的面必须由引擎宣告（`Sg.rules.effects`）——反沉默。
 *  为什么（与 `prefixes` 同轴）：被引擎忽略的声明＝**静默空转**（行看起来授予了，实际什么都没发生）。
 *  注：`yields`/`gives` 早于本机制（老声明面，不追溯）；`sets` 是新增面 ⇒ 用到就必须宣告。 */
export const undeclaredSets = (rows, declared = []) => {
	const used = (rows ?? []).some((r) => r?.sets != null && !(Array.isArray(r.sets) && !r.sets.length));
	return used && !(declared ?? []).includes('sets') ? [{ surface: 'sets', declared: declared ?? [] }] : [];
};

/** 未被引擎宣告支持的前缀 ⇒ `[{ prefix, declared }]`。 */
export const undeclaredPrefixes = (rows, declared = []) =>
	rowKeyPrefixes(rows).filter((p) => !(declared ?? []).includes(p)).map((prefix) => ({ prefix, declared: declared ?? [] }));

// ── ④ scope 机检（调用面）────────────────────────────────────────────────
/** 静态取出 `<<rules "scope">>` 调用点（**机制段不算**：引擎注释里的示例不是调用）。
 *  参数不是引号字面量（反引号表达式等）⇒ 无法静态判定，单独报告（**反沉默**：不静默跳过）。 */
export const ruleCalls = (sources, tagsOf = () => []) => {
	const calls = [], dynamic = [];
	for (const [p, src] of sources ?? []) {
		const tags = tagsOf(p) ?? [];
		if (['script', 'widget', 'stylesheet'].some((t) => tags.includes(t))) continue;
		// `#624` 批 1：`<<rulelist>>`（菜单：渲染全部命中行）与 `<<rules>>`（单选）**同属调用面**
		for (const m of String(src ?? '').matchAll(/<<\s*(rules|rulelist)\s+([^>]*?)>>/g)) {
			const raw = m[2].trim();
			const lit = /^(['"])([\s\S]*)\1$/.exec(raw);
			if (lit) calls.push({ p, scope: lit[2], macro: m[1] });
			else dynamic.push({ p, raw });
		}
	}
	return { calls, dynamic };
};
/** 未接管行：`scope` 无任何调用点 ⇒ 永远不被渲染。 */
export const orphanRows = (rows, calls) => {
	const scopes = new Set((calls ?? []).map((c) => c.scope));
	return (rows ?? []).filter((r) => r?.id).filter((r) => !scopes.has(r.scope)).map((r) => r.id);
};
/** 同位点重复调用：同一段落里同一 `scope` 被调用 ≥2 次（两个位点抢同一行）。 */
export const duplicateCalls = (calls) => {
	const seen = new Map();
	for (const c of calls ?? []) {
		const k = `${c.p}|${c.scope}`;
		seen.set(k, (seen.get(k) ?? 0) + 1);
	}
	return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
};
/** 归属不符：`scope` 含 `#`（＝声明归属段落）时，调用点必须在**该段落**里；另报"调用点无对应行"。 */
export const scopeProblems = (rows, calls) => {
	const list = (rows ?? []).filter((r) => r?.id);
	const scopes = new Set(list.map((r) => r.scope));
	const out = [];
	for (const c of calls ?? []) {
		if (!scopes.has(c.scope)) { out.push(`调用点无对应行：段落「${c.p}」的 \`<<rules "${c.scope}">>\` 在表里找不到 scope（漏登记＝正文静默消失）`); continue; }
		const [passage] = String(c.scope).split('#');
		if (c.scope.includes('#') && passage !== c.p) out.push(`归属不符：scope「${c.scope}」声明归属「${passage}」，却从段落「${c.p}」调用`);
	}
	return out;
};

/** 归属段落必须**真实存在**：`scope` 的 `#` 前那一截（无 `#` 则整个 `scope`）＝该行 `text` 归属的段落。
 *  为什么需要它（guest 建议，2026-09-14）：`段落#位点` 约定把 `scope` 从"备注"变成了**结构**——
 *  它决定该行的 `text` 算哪个段落的故事文本（归属面）；scope 打错 ⇒ 归属到一个**不存在的段落**
 *  （其它三条机检都看不出来：无调用点会报"未接管"，但"调用点也对不上"时可能悄悄漂）。 */
export const unknownScopes = (rows, passages) => {
	const names = passages instanceof Set ? passages : new Set(passages ?? []);
	return (rows ?? []).filter((r) => r?.id).filter((r) => !names.has(String(r.scope ?? '').split('#')[0])).map((r) => r.id);
};

export const run = (ctx) => {
	const { arg, wantAll } = ctx;
	if (!(wantAll || arg('rules'))) return;
	console.log('\n══ ⓪r 条件表门（#435）——死规则 · `prereq` 形状 · 并列 prio ══');
	let bad = 0;
	{
		const R = (id, over = {}) => ({ id, scope: 'S', req: ['x'], prio: 10, ...over });
		const cases = [
			['正例：单行 ⇒ 无死规则', deadRows([R('only')]).length === 0],
			['反例：B 更宽（req⊂）且 prio 更高 ⇒ A 死', deadRows([R('A'), R('B', { req: [], prio: 20 })]).some((d) => d.id === 'A' && d.killedBy === 'B')],
			['🔴 dev 的反例①：`req(B)=∅` 但 `exclude(B)=[y]` ⇒ **不是**死规则（y 真时 B 不中）', deadRows([R('A'), R('B', { req: [], exclude: ['y'], prio: 20 })]).length === 0],
			['🔴 dev 的反例②：`any(B)⊆any(A)` 而 A 只保证"任一" ⇒ 不是死规则（A 中 b 而 B 要 c 时）', deadRows([R('A', { req: [], any: ['b', 'c'] }), R('B', { req: [], any: ['c'], prio: 20 })]).length === 0],
			['边界：同 prio ⇒ 不是死规则（裁决＝表序最前）', deadRows([R('A'), R('B', { req: [], prio: 10 })]).length === 0],
			['边界：不同 scope ⇒ 互不相干', deadRows([R('A'), R('B', { req: [], prio: 20, scope: 'T' })]).length === 0],
			// `#624`：对象算子形（数值/枚举）—— 键抽取必须走单一权威，且死规则分析**保守跳过**
			['正例（#624）：对象形的键抽取走 `condKeysOf`（不再 `[object Object]`）', JSON.stringify(norm([{ gte: ['star.spent', 3] }, 'n_x', { oneOf: ['keeper.state', ['seal']] }])) === JSON.stringify(['star.spent', 'n_x', 'keeper.state'])],
			['🔴 反例（#624）：含算子的行**不判死**（数值语义不能套布尔包含）', deadRows([R('A', { req: [{ gte: ['star.spent', 3] }], prio: 5 }), R('B', { req: [], prio: 20 })]).length === 0],
			['🔴 反例（#624）：含算子的行也**不当杀手**', deadRows([R('A'), R('B', { req: [{ oneOf: ['keeper.state', ['seal']] }], prio: 20 })]).length === 0],
			['正例（#624）：`opRows()` 点名含算子的行（跳过要**可见**，不能静默）', JSON.stringify(opRows([R('A', { req: [{ gte: ['x', 1] }] }), R('B')])) === JSON.stringify(['A'])],
			['边界：B 的 prio **更低** ⇒ 不报（A 先中）', deadRows([R('A'), R('B', { req: [], prio: 5 })]).length === 0],
			['`prereq`：跨 scope ⇒ 报', prereqProblems([R('A'), R('B', { scope: 'T', prereq: ['A'] })]).some((p) => p.includes('跨 scope'))],
			['`prereq`：成环 ⇒ 报', prereqProblems([R('A', { prereq: ['B'] }), R('B', { prereq: ['A'] })]).some((p) => p.includes('成环'))],
			['`prereq`：指向不存在的行 ⇒ 报', prereqProblems([R('A', { prereq: ['nope'] })]).some((p) => p.includes('不存在'))],
			['并列 prio：报告清单（不判红）', ties([R('A'), R('B', { req: ['z'] })])[0]?.ids.length === 2],
		];
		// ③ 写侧：`text` 只许纯渲染
		const T = (text) => ({ id: 'T', scope: 'S', req: [], prio: 1, text });
		cases.push(
			['正例：`text` 纯渲染（`<<link>>`/`<<goto>>`/散文）⇒ 无写形态', textWrites(`先别动它 <<link "退回">><<goto "塔门">><</link>>`).length === 0],
			['🔴 反例：`text` 含 `<<set $pc.ev.x to true>>` ⇒ 报', textWrites(`<<set $pc.ev.a to true>>`).includes('状态赋值') && textWrites(`<<set $pc.ev.a to true>>`).includes('<<set>>')],
			['🔴 反例：`text` 含 `Sg.notes.add()` ⇒ 报（A 方案退化成 B 的形态）', textWrites(`<<run Sg.notes.add('n_x')>>`).includes('Sg.notes.add()')],
			['🔴 反例：`text` 含 `<<give>>` ⇒ 报', textWrites(`<<give "月光花">>`).includes('<<give>>')],
			['🔴 反例：`text` 含赋值式 `pc.world.x = true` ⇒ 报', textWrites(`<<run (pc.world.x = true)>>`).includes('状态赋值')],
			['边界：`<<if>>` 只读不写 ⇒ 不算写侧问题（读侧归 `--reads`）', textWrites(`<<if Sg.notes.has('n_x')>>字<</if>>`).length === 0],
			['边界：宏名前缀不误伤（`<<setflag>>` 只算 setflag，不算 set）', textWrites(`<<setflag "a">>`).includes('<<setflag>>') && !textWrites(`<<setflag "a">>`).includes('<<set>>')],
			// `#624` 片一：**分域**判据（渲染域一字不动；点击态域只许词汇宏）
			['正例（#624）：点击态域用词汇宏（`<<note>>`／`<<give>>`）⇒ 绿', textWriteProbs(`<<link "问一句">><<note "n_x">><<goto "塔门">><</link>>`).length === 0],
			['🔴 反例（#624）：点击态域裸 `<<run>>` ⇒ 红', textWriteProbs(`<<link "问">><<run Sg.notes.add('n_x')>><<goto "塔门">><</link>>`).some((p) => p.domain.startsWith('点击态') && p.hits.some((h) => h.includes('run') || h.includes('Sg.notes.add')))],
			['🔴 反例（#624）：点击态域 `<<damage>>` ⇒ 红（机制块按边界 4 不搬）', textWriteProbs(`<<link "动手">><<damage 3>><</link>>`).some((p) => p.hits.includes('<<damage>>'))],
			['🔴 反例（#624）：**渲染域**写 ⇒ 红（判据未放宽）', textWriteProbs(`先写一句 <<note "n_x">>`).some((p) => p.domain === '渲染')],
			['边界（#624）：link 外与 link 内各一处 ⇒ 只有渲染域那处红', textWriteProbs(`<<note "n_a">> <<link "问">><<note "n_b">><</link>>`).filter((p) => p.domain === '渲染').length === 1],
			// ③' `text` 分支只许读渲染期只读槽
			['正例：判定结果分支（`$last_check.success`）⇒ 放行（属渲染）', textBranchProbs(`<<if $last_check.success>>成<<else>>败<</if>>`).length === 0],
			['正例：`_` 前缀局部量（渲染期临时量）⇒ 放行', textBranchProbs(`<<if _n gt 1>>多<</if>>`).length === 0],
			['🔴 反例：分支里读状态 `$pc.ev.x` ⇒ 报（那是条件面的事）', textBranchProbs(`<<if $pc.ev.x>>甲<</if>>`).length === 1],
			['🔴 反例：分支里读 `$era` ⇒ 报（时代请写成 `era:` 键）', textBranchProbs(`<<if $era is Game.Era.PRESENT>>甲<</if>>`).some((p) => p.why.some((w) => w.includes('$era')))],
			['🔴 反例：分支里读笔记 API `Sg.notes.has(...)` ⇒ 报', textBranchProbs(`<<if Sg.notes.has('n_x')>>甲<</if>>`).some((p) => p.why.some((w) => w.includes('Sg.notes')))],
			['🔴 反例：分支里读持有物 `inv[…]` ⇒ 报（请写成 `inv:` 键）', textBranchProbs(`<<if $pc.inv['日记']>>甲<</if>>`).length === 1],
			['边界：混写（只读槽 ＋ 状态）⇒ 如实报出状态那个', textBranchProbs(`<<if $last_check.success and $pc.world.fog_thin>>甲<</if>>`).length === 1],
			// ③'' 前缀键必须由引擎宣告
			['正例：前缀键被引擎宣告支持 ⇒ 不报', undeclaredPrefixes([{ id: 'A', req: ['inv:日记'] }], ['inv', 'era']).length === 0],
			['🔴 反例：用了未宣告的前缀（`inv:` 而引擎只认状态键）⇒ 报（否则条件永假＝行静默死）', undeclaredPrefixes([{ id: 'A', req: ['inv:日记'] }], []).join() !== ''],
			['边界：非前缀键（note id／裸键／`ev.x`）不参与前缀判定', rowKeyPrefixes([{ id: 'A', req: ['n_x'], any: ['fog_thin'], exclude: ['ev.y'] }]).length === 0],
			// 另票（#491）：对象算子形条件 ＋ 多源笔记的 path 声明（机制侧未落地 ⇒ 门侧先就位）
			['正例：算子被引擎宣告 ⇒ 不报', undeclaredOps([{ id: 'A', req: [{ gte: ['star.spent', 3] }] }], ['gte']).length === 0],
			['🔴 反例：用了未宣告的算子 ⇒ 报（否则条件永假）', undeclaredOps([{ id: 'A', req: [{ oneOf: ['keeper.state', ['seal']] }] }], []).length === 1],
			['边界：字符串条件项不参与算子判定', undeclaredOps([{ id: 'A', req: ['n_x', 'fog_thin'] }], []).length === 0],
			// `#624` 片二：取值项声明面
			['正例（#624）：取值项被引擎宣告 ⇒ 不报', undeclaredTerms([{ id: 'A', req: [{ gte: ['gold', { price: 'rumor_buy' }] }] }], ['price']).length === 0],
			['🔴 反例（#624）：未宣告的取值项 ⇒ 报', undeclaredTerms([{ id: 'A', req: [{ gte: ['gold', { priceOf: 'x' }] }] }], ['price']).some((u) => u.term === 'priceOf')],
			['边界（#624）：字面量操作数不参与取值项判定', undeclaredTerms([{ id: 'A', req: [{ gte: ['star.spent', 3] }] }], []).length === 0],
			['正例：`yields` 的 path 属于该笔记的 flagPath ⇒ 不报', yieldPathProblems([{ id: 'A', yields: [{ id: 'n_x', path: 'world.x' }] }], { n_x: { flagPath: ['world.x', 'ev.x2'] } }).length === 0],
			['🔴 反例：path 不属于该笔记 ⇒ 报（写进去读不出来）', yieldPathProblems([{ id: 'A', yields: [{ id: 'n_x', path: 'world.nope' }] }], { n_x: { flagPath: 'world.x' } }).length === 1],
			['🔴 反例：`yields` 指向不存在的笔记 ⇒ 报', yieldPathProblems([{ id: 'A', yields: [{ id: 'n_gone', path: 'world.x' }] }], {}).length === 1],
			['边界：`yields` 用字符串形（无 path）⇒ 不参与 path 判定', yieldPathProblems([{ id: 'A', yields: ['n_x'] }], {}).length === 0],
			// Q1：`sets:`（授予家族第三类）的三条收窄 ＋ 引擎面宣告
			['正例：`sets` 写已登记的无笔记状态键 ⇒ 不报', setProblems([{ id: 'A', sets: ['world.flower_taken'] }], { notes: {}, domains: [{ id: 'flower', prefix: ['flower_'] }] }).length === 0],
			['🔴 反例：`sets` 写了**有笔记**的键 ⇒ 报（必须走 `yields`）', setProblems([{ id: 'A', sets: ['world.hall_hint'] }], { notes: { n_hall_hint: { flagPath: 'world.hall_hint' } }, domains: [{ id: 'tower', prefix: ['hall_'] }] }).some((p) => p.why.includes('有笔记'))],
			['🔴 反例：`sets` 写了未登记的键 ⇒ 报（新增状态键必须登记）', setProblems([{ id: 'A', sets: ['no_such_flag'] }], { notes: {}, domains: [] }).some((p) => p.why.includes('未登记'))],
			['🔴 反例：`sets` 写 note id／前缀键 ⇒ 报（不是状态键）', setProblems([{ id: 'A', sets: ['n_x'] }], {}).length === 1 && setProblems([{ id: 'A', sets: ['inv:日记'] }], {}).length === 1],
			['🔴 反例：用了 `sets` 但引擎未宣告 ⇒ 报（否则静默空转）', undeclaredSets([{ id: 'A', sets: ['world.x'] }], []).length === 1],
			['正例：引擎宣告了 `sets` ⇒ 不报；没用到 `sets` 的行不需要宣告', undeclaredSets([{ id: 'A', sets: ['world.x'] }], ['sets']).length === 0 && undeclaredSets([{ id: 'A', yields: ['n_x'] }], []).length === 0],
		);
		// ④ scope 机检（调用面）
		const AT = (p, scope) => ({ p, scope });
		cases.push(
			['正例：`scope` 有调用点、归属段落一致 ⇒ 无问题', scopeProblems([R('A', { scope: '塔外花田#站一会' })], [AT('塔外花田', '塔外花田#站一会')]).length === 0],
			['🔴 反例：未接管行（`scope` 无调用点）⇒ 报', orphanRows([R('A'), R('B', { scope: 'T' })], [AT('P', 'S')]).join() === 'B'],
			['🔴 反例：同段同位点调用两次 ⇒ 报', duplicateCalls([AT('P', 'A#1'), AT('P', 'A#1')]).length === 1],
			['边界：不同段落各调一次（同名 scope）⇒ 不报重复', duplicateCalls([AT('P', 'Q'), AT('R', 'Q')]).length === 0],
			['🔴 反例：`段落#位点` 从别的段落调用 ⇒ 归属不符', scopeProblems([R('A', { scope: '塔外花田#站一会' })], [AT('塔门', '塔外花田#站一会')]).some((x) => x.includes('归属不符'))],
			['🔴 反例：调用点无对应行 ⇒ 报（正文会静默消失）', scopeProblems([R('A')], [AT('P', 'nope')]).some((x) => x.includes('无对应行'))],
			['边界：无 `#` 的话题式 scope 可从任意段落调用', scopeProblems([R('A', { scope: '守林人' })], [AT('守林人·守', '守林人')]).length === 0],
			['正例：`scope` 的归属段落在段落清单里 ⇒ 无问题', unknownScopes([R('A', { scope: '塔外花田#站一会' })], ['塔外花田', '塔门']).length === 0],
			['🔴 反例：`scope` 的归属段落不存在（打错字）⇒ 报', unknownScopes([R('A', { scope: '塔外花田#站一会' })], ['塔门']).join() === 'A'],
			['🔴 反例：无 `#` 的 scope 也必须是真实段落名', unknownScopes([R('A', { scope: 'keeper.flower' })], ['守林人']).join() === 'A'],
		);
		let selfBad = 0;
		for (const [label, ok] of cases) { if (!ok) selfBad++; console.log(`      ${ok ? '✓' : '✗'} 自证·${label}`); }
		bad += selfBad;
	}
	{
		// 选择器自证（真代码路径）：`Sg.rules.pick()` 用临时表跑，跑完还原（**注入式**，不靠真表形状）
		let badSel = 0;
		for (const [label, ok] of selectorCases(ctx.window)) { if (!ok) badSel++; console.log(`      ${ok ? '✓' : '✗'} 自证·${label}`); }
		bad += badSel;
	}
	const rows = ctx.window?.Sg?.story?.rules?.() ?? [];
	if (!Array.isArray(rows)) { console.log('  ✗ `Sg.story.rules()` 未返回行数组'); bad++; }
	else {
		for (const p of prereqProblems(rows)) { console.log(`  ✗ ${p}`); bad++; }
		for (const d of deadRows(rows)) { console.log(`  ✗ 死规则：行「${d.id}」永不被选中（被「${d.killedBy}」完全覆盖）`); bad++; }
		{
			// `#624`：含算子的行被保守跳过 —— 必须**点名叫出来**（跳过的判据不能是静默的）
			const opIds = opRows(rows);
			if (opIds.length) console.log(`  · 含对象算子的行 ${opIds.length} 条（${opIds.join('／')}）：**死规则分析保守跳过**（数值/集合语义不参与布尔包含判定——宁可不判，不可误判）`);
		}
		for (const b of textBranchRows(rows)) for (const pr of b.probs) { console.log(`  ✗ \`text\` 分支越界：行「${b.id}」的 ${`<<if ${pr.cond}>>`} 读了 ${pr.why.join('、')}——分支只许读**渲染期只读槽**（$last_check／\`_\` 前缀局部量）；状态/时代/持有物/笔记请写成行的 req/any/exclude（键形含 inv:／era:）`); bad++; }
		for (const u of undeclaredPrefixes(rows, ctx.window?.Sg?.rules?.prefixes ?? [])) { console.log(`  ✗ 前缀键未被引擎宣告：行里用了「${u.prefix}:」，但 \`Sg.rules.prefixes\`（当前 ${JSON.stringify(u.declared)}）里没有它——引擎不认的前缀会让条件**永假**（行静默死掉）`); bad++; }
		for (const p of setProblems(rows, { notes: ctx.Game?.Notes?.entries ?? {}, domains: ctx.Game?.State?.domains ?? [] })) { console.log(`  ✗ \`sets\` 声明非法：行「${p.id}」的「${p.key}」——${p.why}`); bad++; }
		for (const u of undeclaredOps(rows, ctx.window?.Sg?.rules?.ops ?? [])) { console.log(`  ✗ 算子未被引擎宣告：行里用了「${u.op}」，但 \`Sg.rules.ops\`（当前 ${JSON.stringify(u.declared)}）里没有它——引擎不认的算子会让条件**永假**（行静默死掉）`); bad++; }
		for (const u of undeclaredTerms(rows, ctx.window?.Sg?.rules?.terms ?? [])) { console.log(`  ✗ 取值项未被引擎宣告：行里用了「${u.term}」，但 \`Sg.rules.terms\`（当前 ${JSON.stringify(u.declared)}）里没有它——引擎不认的取值项会让条件**永假**（行静默死掉）`); bad++; }
		for (const q of yieldPathProblems(rows, ctx.Game?.Notes?.entries ?? {})) { console.log(`  ✗ \`yields\` 路径声明非法：行「${q.id}」的「${q.yield}」→「${q.path}」——${q.why}`); bad++; }
		for (const u of undeclaredSets(rows, ctx.window?.Sg?.rules?.effects ?? [])) { console.log(`  ✗ 行面未被引擎宣告：表里用了「${u.surface}」，但 \`Sg.rules.effects\`（当前 ${JSON.stringify(u.declared)}）里没有它——引擎不兑现的声明＝**静默空转**`); bad++; }
		for (const w of textWriteRows(rows)) for (const pr of w.probs) { console.log(`  ✗ \`text\` 不是纯渲染（${pr.domain}域）：行「${w.id}」含 ${pr.hits.join('、')}——渲染域的写请走「yields」（A 方案：渲染成功后由 \`<<rules>>\` 统一落）；**点击态**域只许词汇宏（${CLICK_VOCAB_MACROS.map((m) => '<<' + m + '>>').join('／')}，\`damage\` 不在内 ⇒ 机制块不搬）`); bad++; }
		const { calls, dynamic } = ruleCalls(ctx.passageSrc, (p) => ctx.passageTags?.get(p) ?? []);
		for (const id of orphanRows(rows, calls)) { console.log(`  ✗ 未接管行：行「${id}」的 \`scope\` 没有任何 \`<<rules "…">>\` 调用点 ⇒ 永不被渲染`); bad++; }
		for (const k of duplicateCalls(calls)) { const [p, scope] = k.split('|'); console.log(`  ✗ 同位点重复调用：段落「${p}」里 \`<<rules "${scope}">>\` 出现 ≥2 次（两个位点抢同一行）`); bad++; }
		for (const p of scopeProblems(rows, calls)) { console.log(`  ✗ ${p}`); bad++; }
		{ // `#624` 批 1：同一作用域**同时**被 `<<rules>>` 与 `<<rulelist>>` 接管 ⇒ 单选/菜单两套语义打架
			const byScope = new Map();
			for (const c of calls) byScope.set(c.scope, new Set([...(byScope.get(c.scope) ?? []), c.macro ?? 'rules']));
			for (const [scope, macros] of byScope) if (macros.size > 1) { console.log(`  ✗ 作用域「${scope}」同时被 ${[...macros].map((m) => '<<' + m + '>>').join(' 与 ')} 接管——单选/菜单语义冲突，请只用一种`); bad++; }
		}
		for (const id of unknownScopes(rows, new Set(ctx.passageSrc?.keys() ?? []))) { const r = rows.find((x) => x.id === id); console.log(`  ✗ 归属段落不存在：行「${id}」的 \`scope\` 「${r.scope}」的段落部分不在段落清单里（scope 是**结构**：它决定该行 text 算哪个段落的故事文本）`); bad++; }
		for (const d of dynamic) console.log(`  · 无法静态判定：段落「${d.p}」的 \`<<rules ${d.raw}>>\`（参数不是引号字面量）`);
		for (const t of ties(rows)) console.log(`  · 并列 prio：scope=${t.scope} prio=${t.prio} ⇒ ${t.ids.join(' / ')}（裁决＝表序最前）`);
		console.log(`  · 条件表 ${rows.length} 行 · 作用域 ${[...new Set(rows.map((r) => r.scope))].length} 个 · 调用点 ${calls.length} 个`);
	}
	if (bad) { console.error(`\n✗ 条件表门未通过（${bad} 项）`); process.exit(1); }
	console.log('✔ 条件表门通过（无死规则 · prereq 形状合法 · `text` 纯渲染 · scope 与调用点一致）');
};

/** 选择器自证：`Sg.rules.pick()` 的真代码路径（临时表 ⇒ 跑完还原）。
 *  为什么值得单独一测：位点约定（`段落#位点`）与 prio 裁决是**表↔引擎的接口**，它们错了不会有别的门叫。 */
export const selectorCases = (w) => {
	if (!w?.Sg?.rules?.pick || !w?.Sg?.story) return [['选择器自证：`Sg.rules.pick()` 不可用（dist 陈旧？）', false]];
	const story = w.Sg.story, saved = story.rules, out = [], pc = w.Game?.Pc?.defaults?.() ?? {};
	const pick = (scope) => w.Sg.rules.pick(scope, { pc, chose: new Set() });
	try {
		// 同段两位点各取各的行（`段落#位点` 约定的机检——共用 scope 会互相抢行，是结构性的）
		story.rules = () => [
			{ id: 'a1', scope: 'P#一', prio: 10, req: [], text: '一' },
			{ id: 'a2', scope: 'P#二', prio: 10, req: [], text: '二' },
		];
		out.push(['同段两位点各取各的行（`段落#位点` 约定）', pick('P#一')?.id === 'a1' && pick('P#二')?.id === 'a2']);
		story.rules = () => [{ id: 'low', scope: 'Q', prio: 1, req: [] }, { id: 'high', scope: 'Q', prio: 9, req: [] }];
		out.push(['选择器：显式 `prio` 高者先中', pick('Q')?.id === 'high']);
		story.rules = () => [{ id: 'first', scope: 'Q', prio: 5, req: [] }, { id: 'second', scope: 'Q', prio: 5, req: [] }];
		out.push(['选择器：同 `prio` ⇒ 表序最前（不做隐式顺序假设）', pick('Q')?.id === 'first']);
		story.rules = saved;
	} catch (e) {
		story.rules = saved;
		return [...out, [`选择器自证崩了：${e?.message ?? e}`, false]];
	}
	return out;
};
