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
export const flag = 'rules';
export const flags = ['rules'];

const keys = (x) => (Array.isArray(x) ? x.map(String) : x ? [String(x)] : []);
const norm = (x) => keys(x).map((k) => k.replace(/^(ev|world)\./, ''));

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
		const killer = list.find((b) => {
			if (b === a || b.scope !== a.scope || !((b.prio ?? 0) > (a.prio ?? 0))) return false;
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
			['边界：B 的 prio **更低** ⇒ 不报（A 先中）', deadRows([R('A'), R('B', { req: [], prio: 5 })]).length === 0],
			['`prereq`：跨 scope ⇒ 报', prereqProblems([R('A'), R('B', { scope: 'T', prereq: ['A'] })]).some((p) => p.includes('跨 scope'))],
			['`prereq`：成环 ⇒ 报', prereqProblems([R('A', { prereq: ['B'] }), R('B', { prereq: ['A'] })]).some((p) => p.includes('成环'))],
			['`prereq`：指向不存在的行 ⇒ 报', prereqProblems([R('A', { prereq: ['nope'] })]).some((p) => p.includes('不存在'))],
			['并列 prio：报告清单（不判红）', ties([R('A'), R('B', { req: ['z'] })])[0]?.ids.length === 2],
		];
		let selfBad = 0;
		for (const [label, ok] of cases) { if (!ok) selfBad++; console.log(`      ${ok ? '✓' : '✗'} 自证·${label}`); }
		bad += selfBad;
	}
	const rows = ctx.window?.Sg?.story?.rules?.() ?? [];
	if (!Array.isArray(rows)) { console.log('  ✗ `Sg.story.rules()` 未返回行数组'); bad++; }
	else {
		for (const p of prereqProblems(rows)) { console.log(`  ✗ ${p}`); bad++; }
		for (const d of deadRows(rows)) { console.log(`  ✗ 死规则：行「${d.id}」永不被选中（被「${d.killedBy}」完全覆盖）`); bad++; }
		for (const t of ties(rows)) console.log(`  · 并列 prio：scope=${t.scope} prio=${t.prio} ⇒ ${t.ids.join(' / ')}（裁决＝表序最前）`);
		console.log(`  · 条件表 ${rows.length} 行 · 作用域 ${[...new Set(rows.map((r) => r.scope))].length} 个`);
	}
	if (bad) { console.error(`\n✗ 条件表门未通过（${bad} 项）`); process.exit(1); }
	console.log('✔ 条件表门通过（无死规则 · prereq 形状合法）');
};
