// `#1350` 片 3：`data/passages.json` 的 `links[]` → **规则行同形**（纯函数）。
//
// 为什么要"转成规则行"而不是新写一个渲染口：本仓的**渲染与条件求值各有一处权威**——
//   · 条件求值：`Sg.rules.matches`（`src/engine/40-sim/22-rules.twee`）
//   · 渲染口：`<<rules>>`（单选）／`<<rulelist>>`（菜单），二者内部都走 `Sg.rules.pick`／`pickAll`
// ⇒ 把段落数据编成**同一形状**的行 ⇒ **渲染口零改动**即可接上（✗ 不在渲染面二次求值 ✓）。
//
// 映射（`links[{label,to,cond?,prio?,prereq?,args?,slot?}]` → 规则行）：
//   · `label` ⇒ `text` 里的 `[[label|to]]`（**维持现形态**：链接本就写在 `text` 里）
//   · `cond`  ⇒ **原样**搬进行的条件字段（`req`/`any`/… ⇒ 求值仍走唯一权威 ✓）
//   · `prio`／`prereq` ⇒ 原样（顺序维）
//   · `scope` ⇒ 段名（本行的作用域＝它所在的那一段 ✓）
//   · `args` ／ `slot` ⇒ **片 4 与渲染口协同**（本片**不硬塞临时形状** ✗；此处只保留原值以便下一片消费）
//
// 红线（同时写给写作者，供 `#1359` 总规范）：
//   **同一链接不得两处声明**（段内 `links[]` 与规则行 `text` 二选一）—— 两处同写＝**两份真源** ✗。
export const linksToRows = ({ data = {} } = {}) => {
	const out = [];
	for (const [scope, seg] of Object.entries(data ?? {})) {
		const links = Array.isArray(seg?.links) ? seg.links : [];
		links.forEach((l, i) => {
			if (!l || typeof l !== 'object') return;
			const label = String(l.label ?? '').trim();
			const to = String(l.to ?? '').trim();
			// ★ `#1350` 片 5 裁定：**带 `slot` 的链接不进规则行** —— `slot` 的落位是“渲染在**正文该处**”，
			//   它**不该**同时是“段尾菜单的候选”（内联 ⊕ 段尾 ＝ **互斥的落位** ✓）
			//   ⇒ 否则同一条链接**两处渲染**＝重复 ✗（实测：靶 `门厅` 因此多出 1 条 ✓）
			if (!label || !to) return;                                  // 缺件由 P1–P4（判据件）点名 ✗ 此处不重复报
			// ★ `#1350` 片 5 裁定：**带 `slot` 的链接不进规则行** —— `slot` 的落位是“渲染在**正文该处**”，
			//   它**不该**同时是“段尾菜单的候选”（内联 ⊕ 段尾 ＝ **互斥的落位** ✓）
			//   ⇒ 否则同一条链接**两处渲染**＝重复 ✗（实测：靶 `门厅` 因此多出 1 条 ✓）
			if (l.slot) return;
			const row = { scope, text: `[[${label}|${to}]]` };
			if (l.id) row.id = String(l.id);
			if (Number.isFinite(l.prio)) row.prio = l.prio;
			if (Array.isArray(l.prereq) && l.prereq.length) row.prereq = [...l.prereq];
			// `cond` 原样搬（**条件求值只有一处** ⇒ 这里不解析、不改写 ✓）
			if (l.cond && typeof l.cond === 'object') for (const [k, v] of Object.entries(l.cond)) row[k] = v;
			// 传值面（片 4 消费；本片只透传）
			if (l.args && typeof l.args === 'object') row.args = { ...l.args };
			out.push(row);
		});
	}
	return out;
};

/** 把段落数据合成到既有 `rules` 上（**不改既有 rows**，只追加 ⇒ 旧形态逐字不变 ✓）。 */
export const mergeLinksIntoRules = ({ rules = null, data = null } = {}) => {
	const added = linksToRows({ data });
	if (!added.length) return rules;
	const base = rules && typeof rules === 'object' ? rules : { section: 'StoryRules', key: 'rules', rows: [] };
	return { ...base, rows: [...(Array.isArray(base.rows) ? base.rows : []), ...added] };
};
