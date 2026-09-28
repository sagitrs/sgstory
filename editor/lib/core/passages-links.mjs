import { linkHtml } from './passages.mjs';   // `#1350` 尾件 ⑥：带 args 的行 → HTML（复用唯一权威）
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
/** ★ `#1401`（**可达性**，纯函数 ⇒ 能假）：以 `entry` 为根、按**两处出边**算图的可达闭包，
 * 返回**不可达的段名**（✗ 不含 `entry` 自身）。
 *
 * ★ 为什么必须**两处都看**（作者实测）：出边**分散在两地** ——
 *   ① `passages.json` 各段的 `links[].to`（新形态）
 *   ② 规则行的 `[[label|to]]`（`data/rules.json` 的 `text`；过渡形态）
 *   ⇒ 只算一处 ⇒ **不是漏报就是误报**：实测"只算 `passages.json`"时**误报**「废哨站」
 *     （指向它的边在 `rules.json` 的行里）✓
 *
 * ★ 范围（Operator 纪律）：这是**编译器/静态图机制** ⇒ 属**引擎** ✓
 *   （✗ 引擎不判"这个故事该不该全可达"—— 那是故事策略面，归 books CI ✓）
 */
export const unreachablePassages = ({ data = null, entry = null, rules = null } = {}) => {
	const names = data && typeof data === 'object' ? Object.keys(data) : [];
	const root = String(entry ?? '').trim();
	if (!names.length || !root) return [];
	const known = new Set(names);
	const edges = new Map(names.map((n) => [n, []]));
	for (const [seg, v] of Object.entries(data ?? {})) {
		for (const l of (Array.isArray(v?.links) ? v.links : [])) {
			const to = String(l?.to ?? '').trim();
			if (to && known.has(to) && edges.has(seg)) edges.get(seg).push(to);
		}
	}
	// 规则行：`scope`（作用域段）→ `text` 里的 `[[label|to]]`（✗ 只认带 `|` 的成对形态）
	for (const row of (Array.isArray(rules?.rows) ? rules.rows : [])) {
		const seg = String(row?.scope ?? '').trim();
		if (!edges.has(seg)) continue;
		for (const m of String(row?.text ?? '').matchAll(/\[\[([^\]|]*)\|([^\]]+)\]\]/g)) {
			const to = m[2].trim();
			if (known.has(to)) edges.get(seg).push(to);
		}
	}
	const seen = new Set([root]);
	const q = [root];
	while (q.length) {
		const cur = q.shift();
		for (const nx of edges.get(cur) ?? []) if (!seen.has(nx)) { seen.add(nx); q.push(nx); }
	}
	return names.filter((n) => !seen.has(n)).map((n) => '段「' + n + '」**不可达**（无任何入边且非 `entry`）⇒'
		+ ' 读者永远走不到它：加一条指向它的链接（或删段／把它设成 `entry`）✗');
};

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
			// ★ `#1350` 尾件 ⑥（实测缺陷）：**段尾块的链接收不到 `args`** —— `<<rules>>`／`<<rulelist>>` 只
			//   `wiki(row.text)`，而 `[[label|to]]` 由 SugarCube 自产 ⇒ 链接上**无** `data-sg-args` ⇒
			//   目标段的 `<<printparam>>` 报"本次未传" ✗（实测：靶 `pilot-new` 的 `门厅.推门` 带 `args`
			//   却永不生效）。修法：**带 `args` 的行在编译期就编成 HTML**（复用 `linkHtml` 唯一权威
			//   ⇒ ✗ 不在引擎里再造一份）；**不带 `args` 的行一字不动**（⇒ 片 5 的"渲染文本同／
			//   外属性集合同"两条验收仍成立 ✓）。
			const hasArgs = l.args && typeof l.args === 'object' && Object.keys(l.args).length > 0;
			const row = { scope, text: `[[${label}|${to}]]` };   // 默认行文；带 `args`／带效果时下面改写成 HTML
			if (l.id) row.id = String(l.id);
			if (Number.isFinite(l.prio)) row.prio = l.prio;
			if (Array.isArray(l.prereq) && l.prereq.length) row.prereq = [...l.prereq];
			// `cond` 原样搬（**条件求值只有一处** ⇒ 这里不解析、不改写 ✓）
			if (l.cond && typeof l.cond === 'object') for (const [k, v] of Object.entries(l.cond)) row[k] = v;
			// 传值面（片 4 消费；本片只透传）
			if (l.args && typeof l.args === 'object') row.args = { ...l.args };
			// ★ `#1408`（承 `#1406` ①）：`gives`／`sets`／`yields` ＝ **点击那一刻**施加（与 `args`／跳转同刻 ✓）——
			//   ⇒ 由 `linkHtml` 编进 `<a data-sg-effects="…">`（点击处理器施加 ✓），**✗ 不进规则行**：
			//   规则行语义＝"该作用域**渲染时**即施加" ⇒ 那会让读者**什么都没点就拿到钥匙** ✗（实测两态）。
			//   ★带 `args` 或带效果的行：**编成 HTML**（`linkHtml` 唯一权威 ✓）；两者都无 ⇒ 行文一字不动（`[[label|to]]`）
			// ★ `#1571`：`actor` 与效果字段**同装进** `data-sg-effects`（点击那一刻的收束点据它解析目标 ✓）
			const effKeys = EFFECT_FIELDS.filter((k) => l[k] != null);   // ★`#1586`：一份权威（✗ 各写一份）
			const effects = {};
			for (const k of effKeys) effects[k] = l[k];
			// ★ `#1562`（阶 2a）：**事件引用**（`use`）**✗ 属效果字段** ⇒ 单独走 `data-sg-call`
			//   （★`actor` 能进 `effects` 是因为它是**目标维**；而 `use` 是“**调哪个事件**” ⇒ 语义不同 ✓）
			const call = l[CALL_FIELD] != null && String(l[CALL_FIELD]).trim() !== '' ? String(l[CALL_FIELD]).trim() : null;
			if (hasArgs || effKeys.length || call) {
				row.text = linkHtml({ label, to, args: hasArgs ? l.args : null, effects: effKeys.length ? effects : null, call });
			}
			out.push(row);
		});
	}
	return out;
};

/** ★ `#1406` ⑤（**泛化判据**，协调席裁"比 `gives` 本身更值"）：`links[]` 的**映射白名单**。
 * 为什么要有它：今天 `gives` 被**静默丢弃**且 `problems=0` ⇒ 作者看到的是"我写了、它没生效"而**没人告诉他为什么** ✗。
 * 形态：**白名单外字段 ⇒ 点名**（含**拼错**的形态 ⇒ 提示相近的正确名）。
 * ★ 好处：**任何**未来新增的链接字段都会先红一次 ⇒ 逼作者与实现**同步**（同族先例：`slot` 与 `params` **撞名即红** ✓）。
 * ★ 范围（Operator 纪律）：这是**编译器/输入校验**行为 ⇒ 属**引擎** ✓（✗ 不判"故事该不该这么写"）。
 */
export const LINK_FIELDS = Object.freeze(['label', 'to', 'id', 'prio', 'prereq', 'cond', 'args', 'slot', 'gives', 'sets', 'yields', 'adds', 'takes', 'actor', 'use']);   // ★ `#1571`（1c）：`actor` ＝ **对象维**（该链接的效果施加到**哪个实体**上；缺省 ⇒ `pc` ✓）   // ★ `#1466`：`adds` ＝ 算术效果（与 gives/sets/yields 同族 ✓）

/**
 * ★★ `#1586`（病灶：**两处装箱键各写一份 ⇒ 必漂移**）：**效果面**字段 ＝ 进 `data-sg-effects` 的那些。
 * ★**单一权威**：链接路径（`linksToRows`）与规则行路径（`compileRowEffectsIntoLinks`）**共用这一份** ——
 *   实测的漂移后果：规则行那份漏了 `use`／`adds`／`takes` ⇒ ★**静默丢弃**（写的人以为生效 ✗）。
 * ★`actor` 能进这里（它是**目标维**）；★`use` **不进**（它是"调哪个事件" ⇒ 走独立的 `data-sg-call` 面，见下）✓。
 */
export const EFFECT_FIELDS = Object.freeze(['gives', 'sets', 'yields', 'adds', 'takes', 'actor']);

/** ★★ `#1586`：**调用面**字段（进 `data-sg-call` —— 与效果面**分开**，语义不同 ✓）。 */
export const CALL_FIELD = 'use';

/**
 * ★★ `#1586`：**规则行**（`rules.json` 的 `rows[]`）**支持的字段域** —— ★按**消费点**派生（✗ 凭记忆）：
 *   · 生成侧（`linksToRows` 产出的键）：`scope／text／id／prio／prereq／条件三件／args／效果六件`
 *   · 条件求值（`Sg.rules.matches`）：`req`／`any`／`exclude`／`prereq`
 *   · 效果施加（`applyGives/Sets/Yields/Adds/Takes` ＋ `actor` 目标维）：`gives／sets／yields／adds／takes／actor`
 *   · 渲染口（`<<rules>>`／`<<rulelist>>`）：`text`／`scope`／`prio`／`id`
 *   · 装箱口（`compileRowEffectsIntoLinks`）：`text`／`args`／`use`
 *   ⇒ ★真数据核对（两仓全部 `rules.json` ＋ 夹具 `linksToRows` 产出）：现用 10 键**全在其中** ✓
 *      （`gives／yields／adds／takes／actor／use` 今天只出现在**链接**上 —— ✗ 不代表规则行可以"写而不生效" ✓）
 * ★与 `contractVersion.mjs` 的 `'rules.json'.items.rows` 登记面**同源**（该件的判据件断这条 ✓）。
 */
export const ROW_FIELDS = Object.freeze(['id', 'scope', 'text', 'prio', 'prereq', 'req', 'any', 'exclude',
	'args', 'gives', 'sets', 'yields', 'adds', 'takes', 'actor', 'use']);

/** 白名单外字段 ⇒ 点名清单（**核心**：位置名／标签取法／白名单都由调用方给 ⇒ 一处实现两条路径共用 ✓）。 */
const unmappedFieldsOf = ({ items = [], known = [], label = () => '(无标签)', what = '链接' } = {}) => {
	const out = [];
	if (!Array.isArray(items)) return out;
	const set = new Set(known);
	const near = (f) => known.find((k) => k.length === f.length && k !== f
		&& [...k].filter((c, i) => c === f[i]).length >= k.length - 1);
	for (const it of items) {
		if (!it || typeof it !== 'object') continue;
		for (const k of Object.keys(it)) {
			if (set.has(k)) continue;
			const n = near(k);
			out.push(what + '「' + String(label(it)) + '」有**映射白名单外**的字段 `' + k + '` '
				+ (n ? '（是不是想写 `' + n + '`？）' : '') + ' ⇒ 它会被**静默丢弃** ✗（白名单：'
				+ known.join('／') + '）');
		}
	}
	return out;
};

/** 白名单外字段 ⇒ 点名清单（纯函数；`links` 非数组 ⇒ 空、不抛）。★报文与 `#1406` ⑤ 逐字同（零回归 ✓）。 */
export const unmappedLinkFields = ({ links = [] } = {}) =>
	unmappedFieldsOf({ items: links, known: LINK_FIELDS, what: '链接', label: (l) => l.label ?? l.id ?? '(无标签)' });

/** ★★ `#1586`：**规则行**的同款点名（✗ 此前规则行**没有**这道点名 ⇒ 拼错/未知字段**静默** ✗）。 */
export const unmappedRowFields = ({ rows = [] } = {}) =>
	unmappedFieldsOf({ items: rows, known: ROW_FIELDS, what: '规则行', label: (r) => r.id ?? r.scope ?? '(无 id)' });

/** 把段落数据合成到既有 `rules` 上（**不改既有 rows**，只追加 ⇒ 旧形态逐字不变 ✓）。 */
/** ★ `#1468`：把**既有规则行**（含手写 `rules.json` 的行）的 `gives`/`sets`/`yields` **编进链接** ——
 *  真因：`<<rulelist>>`/`<<rules>>` 渲染期就 `applyYields(…)` ⇒ ★**读者没点就拿到东西** ✗
 *  （实测：`north-room` 进「靴子」段未点任何链接 ⇒ `inv` 里已有黄铜钥匙 ✓）
 *  ★与 `#1408`（`links[]` 路径）**同一形**：效果随链接走（`data-sg-effects`）⇒ **点击处理器**施加；
 *  ✗ 不进规则行 ⇒ 渲染期**不落效果** ✓（唯一权威仍是 `linkHtml` ⇒ ✗ 不造第二套 ✓）。
 *  ★面：只处理**能编成链接**的行（`text` 恰为 `[[label|to]]`）；
 *  行文**不含链接**（纯文本行）⇒ 保留原样并打 `effectsUnmounted`（它没有「点击」可挂 ⇒ 渲染期也不落 ✓）。
 */
export const compileRowEffectsIntoLinks = ({ rules = null } = {}) => {
	const rows = Array.isArray(rules?.rows) ? rules.rows : [];
	const out = rows.map((row) => {
		// ★ `#1571`：`actor`（对象维）与效果字段**同装**（✗ 顺手动 `adds`／`takes` 的既有缺口 —— 另记 ✓）
		// ★★ `#1586`（本笔的修）：★原来这里写死 `['gives','sets','yields','actor']` ⇒ **漏 `use`／`adds`／`takes`**
		//   ⇒ 规则行上写它们＝**静默丢弃**（实测：`use` 的行**没进** `data-sg-call`、产物里停在 `[[…]]` ✗）
		const effKeys = EFFECT_FIELDS.filter((k) => row?.[k] != null);
		// ★ `#1586`：`use` 同链接路径一样走**独立的 `data-sg-call`** ✓（✗ 塞进 effects —— 语义不同）
		//   ★**必须先算 `call` 再判早退**：★只写 `use`（✗ 别的效果）的行也要编译 ⇒ ✗ 否则它照样被丢
		//     （本片第一版就漏了这一步 ⇒ 实测"只写 use 的行仍停在 `[[…]]`" ⇒ 当场补 ✓）
		const call = row?.[CALL_FIELD] != null && String(row[CALL_FIELD]).trim() !== '' ? String(row[CALL_FIELD]).trim() : null;
		if (!effKeys.length && !call) return row;
		const t = String(row?.text ?? '');
		const m = t.match(/^\s*\[\[([^\]|]*)\|([^\]]+)\]\]\s*$/);
		if (!m) return { ...row, effectsUnmounted: true };   // ★无链接 ⇒ 渲染期也不落（见 handler）
		const effects = {};
		for (const k of effKeys) effects[k] = row[k];
		const html = linkHtml({ label: m[1], to: m[2], args: row.args ?? null, effects, call });
		return { ...row, text: html };
	});
	return { ...(rules ?? {}), rows: out };
};
export const mergeLinksIntoRules = ({ rules = null, data = null } = {}) => {
	const added = linksToRows({ data });
	if (!added.length) return rules;
	const base = rules && typeof rules === 'object' ? rules : { section: 'StoryRules', key: 'rules', rows: [] };
	return { ...base, rows: [...(Array.isArray(base.rows) ? base.rows : []), ...added] };
};
