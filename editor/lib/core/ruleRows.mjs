// 规则行判据（**纯件** ✓ 零宿主 ✓）—— `#215` 车道 E-B1：从 **故事门** `stories/mist-forest/gates/rules.mjs`
// **逐字上移** ✓（`#881`／`#794` 先例 ✓），目的：让**页内**能调**同一份**判据 ✓（§17「同一条路」✓）。
//
// 口径 ✓：本次是**纯搬运** ✗ —— 判据一字未改 ✓；既有门的输出**逐字节不变** ✓（实测 `--rules --check` 8876B／md5 两侧同 ✓）；
//   故事门侧只 **import**（不留定义 ✓ ⇒ K6 ①b 副本 0 ✓）。
// ⚠️ 本次**唯一一处非逐字改动** ✗：`keys`／`asList`／`norm` 原为故事门里的**未导出**局部件 ✓，
//   上移后由本件**导出** ✓（故事门侧仍要用 `norm` ⇒ 不留副本 ✓）。
import { WRITE_PATTERNS, NOTE_WRITE_RE, condKeysOf, rowOps } from './audit-shared.mjs';

export const keys = (x) => (Array.isArray(x) ? x.map(String) : x ? [String(x)] : []);

export const asList = (x) => (Array.isArray(x) ? x : x ? [x] : []);
/** 条件项 → 键（**单一权威** `condKeysOf`）：字符串项／对象算子项都取到真键。
 *  `#624` 之前这里是 `keys(x).map(String)` ⇒ 对象形被 `String()` 成 `'[object Object]'`，
 *  于是"死规则/并列 prio"的键推理**对新形状静默失去意义**（不报错、但结论全是噪声）。 */

export const norm = (x) => asList(x).flatMap((c) => condKeysOf(c)).map((k) => String(k).replace(/^(ev|world)\./, ''));
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
 *   ② `exclude(B) ⊆ exclude(A)`  否则 B 会因某个 A 允许为真的键为真而落选（**反例①**：A.req=['x'] vs B.exclude=['y']）；
 *   ③ `any(B)` 被 A 的 **必含键**保证（`any(B)=∅` 或 `∃k ∈ any(B) ∩ req(A)`）
 *                                否则 A 只保证"任一"时可让 B 的择一落空（**反例②**：A.any=['b','c'] vs B.any=['c']）；
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
