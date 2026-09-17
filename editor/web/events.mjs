// WebUI（`#761` P1 第四片）：**事件编辑的纯逻辑** —— 列表 ＋ 改一个字段 ＋ 精确差异 ✓。
//
// 为什么这一片这么切 ✓（复核席给的读数口径 ✓）：出口判据是「**改一个事件 ⇒ 预览正确 ＋ CLI 结论一致**」✓，
//   而"改一个事件"必须是**可核**的 ✓ —— 不是"界面上看着对" ✗。所以本件只做三件**纯**事 ✓，
//   让"改了哪个字段、写盘后差在哪、编译后差在哪"都能**逐字段**报出来 ✓：
//     ① `eventsOf`：包里的**事件行** ⇒ 统一视图 ✓（设计稿 §2.2 的字段名 ✓）；
//     ② `editEventField`：**只**改那一行的那个字段 ✓（输入**不被修改** ✓ ⇒ 原包可做对照 ✓）；
//     ③ `diffFields`／`changedRows`：**精确**报出差异 ✓（"改了一个事件"这句从此**有据** ✓）。
//
// 数据面真源 ✓：事件住在 `data/rules.json` 的 `rows` ✓（别的文件不碰 ✓ ⇒ 本件**只**知道这一处 ✓）。

import { readStoryPackage } from '../lib/core/story.mjs';

const RULES = 'rules.json';

/** 事件行 ⇒ 统一视图（**读**侧 ✓，不发明字段 ✗ —— 只做改名与缺省 ✓）。 */
export const eventsOf = (pkg) => {
	const rows = pkg?.data?.[RULES]?.rows ?? [];
	return rows.map((r) => ({
		id: r.id,
		scope: r.scope,
		when: { req: r.req ?? [], any: r.any ?? [], exclude: r.exclude ?? [], prereq: r.prereq ?? null, prio: r.prio ?? 0 },
		say: { text: r.text ?? '' },
		raw: r,   // 原样留一份 ✓（"改字段"要写回**同一形状** ✓，不许借视图发明 schema ✗）
	}));
};

/** **只**改那一行的那个字段 ✓。返回**新的** `data` ✓（浅拷贝到行级 ✓ ⇒ 调用方的原包**不受影响** ✓）。
 *  ⚠️ 四个"缺一即错"的防卫 ✓（都属"读数要能证伪自己"那族 ✓）：
 *   ① 事件不存在 ⇒ **抛**（不是静默造一个新行 ✗）② 字段没被真正改动 ⇒ **抛**（空编辑不许当"改过了" ✗）
 *   ③ 未知字段 ⇒ **抛**（不许往行里塞新键 ✗ —— 那会绕过 schema ✓）④ 输入不含 `rules.json` ⇒ **抛** ✗。 */
export const editEventField = ({ pkg, id, field, value }) => {
	const rules = pkg?.data?.[RULES];
	if (!rules?.rows) throw new Error(`包里没有 ${RULES} 的 rows ⇒ 改不动事件 ✗（缺文件不许当空数据 ✗）`);
	const i = rules.rows.findIndex((r) => r.id === id);
	if (i < 0) throw new Error(`事件不存在 ✗：${id}`);
	const row = rules.rows[i];
	if (!(field in row)) throw new Error(`未知字段 ✗：\`${field}\`（不许给事件塞新键 —— 那会绕过 schema ✓）`);
	if (row[field] === value) throw new Error(`没改到东西 ✗：\`${id}.${field}\` 本来就是 ${JSON.stringify(value)}（空编辑不许当"改过了" ✗）`);
	const rows = rules.rows.map((r, k) => (k === i ? { ...r, [field]: value } : r));
	// 数据面**其余部分原样** ✓（"只改一个字段"要按构造成立 ✓，不靠调用方自觉 ✓）
	return { ...pkg.data, [RULES]: { ...rules, rows } };
};

/** 一个事件行**可改哪些字段 ＋ 各是什么类型** ✓ —— **从值导出** ✗ 不从 schema 抄 ✓
 *  （数据面就是真源 ✓：`str ⇒ text` ✓、`int ⇒ number` ✓、`list ⇒ list` ✓；不认识的值类型 ⇒ `raw` ＋ 点名 ✓）。 */
export const fieldKindsOf = (row) => {
	if (!row || typeof row !== 'object') throw new Error('fieldKindsOf 要一个事件行 ✗');
	return Object.entries(row).map(([name, v]) => ({
		name,
		kind: typeof v === 'string' ? 'text' : typeof v === 'number' ? 'number' : Array.isArray(v) ? 'list' : 'raw',
	}));
};

/** **改一个事件的多个字段** ✓（原子 ✓：先全部校验 ⇒ 再一次性落盘 ✓；调用方拿到的不是"改一半" ✗）。
 *  `fields` ＝ `{ 字段名: 新值 }` ✓。四个防卫与 `editEventField` 同族 ✓ ＋ 两条新的 ✓：
 *  ① 新值类型要与**原值类型**相容 ✓（`list` 必须数组 ✓、`number` 必须有限数 ✓、`text` 必须字符串 ✓）；
 *  ② **原子性** ✓：任一项不过 ⇒ **一个字段也不改** ✓（不是"改了几个再抛" ✗）。 */
export const editEvent = ({ pkg, id, fields = {} } = {}) => {
	const rules = pkg?.data?.[RULES];
	if (!rules?.rows) throw new Error(`包里没有 ${RULES} 的 rows ⇒ 改不动事件 ✗（缺文件不许当空数据 ✗）`);
	const i = rules.rows.findIndex((r) => r.id === id);
	if (i < 0) throw new Error(`事件不存在 ✗：${id}`);
	const row = rules.rows[i];
	const names = Object.keys(fields);
	if (!names.length) throw new Error('没改到东西 ✗：`fields` 是空的（空编辑不许当"改过了" ✗）');
	for (const f of names) {                                            // ← 先全部校验 ✓（原子性的前提 ✓）
		if (!(f in row)) throw new Error(`未知字段 ✗：\`${f}\`（不许给事件塞新键 —— 那会绕过 schema ✓）`);
		const cur = row[f], next = fields[f];
		if (Array.isArray(cur) && !Array.isArray(next)) throw new Error(`字段类型不合 ✗：\`${f}\` 本来是 list，新值不是数组 ✓`);
		if (typeof cur === 'number' && !(typeof next === 'number' && Number.isFinite(next))) throw new Error(`字段类型不合 ✗：\`${f}\` 本来是 number ✓`);
		if (typeof cur === 'string' && typeof next !== 'string') throw new Error(`字段类型不合 ✗：\`${f}\` 本来是 text ✓`);
		if (JSON.stringify(cur) === JSON.stringify(next)) throw new Error(`没改到东西 ✗：\`${id}.${f}\` 本来就是 ${JSON.stringify(next)}（空编辑不许当"改过了" ✗）`);
	}
	const rows = rules.rows.map((r) => (i >= 0 && r === rules.rows[i] ? { ...r, ...fields } : r));
	return { ...pkg.data, [RULES]: { ...rules, rows } };
};

/** 两个 `data` 之间的**精确字段差异** ✓（只报 `rules.json.rows` ✓ —— 本件只知道这一处 ✓）。
 *  返回 `[{ id, field, from, to }]` ✓ ⇒ 空数组＝**没有任何字段变** ✓（那本身就是一条读数 ✓）。 */
export const diffFields = (before, after) => {
	const rb = before?.[RULES]?.rows ?? [];
	const ra = after?.[RULES]?.rows ?? [];
	const byId = new Map(rb.map((r) => [r.id, r]));
	const out = [];
	for (const row of ra) {
		const old = byId.get(row.id);
		if (!old) { out.push({ id: row.id, field: '(新增行)', from: undefined, to: row }); continue; }
		const fields = new Set([...Object.keys(old), ...Object.keys(row)]);
		for (const f of fields) if (JSON.stringify(old[f]) !== JSON.stringify(row[f])) out.push({ id: row.id, field: f, from: old[f], to: row[f] });
	}
	for (const row of rb) if (!ra.some((r) => r.id === row.id)) out.push({ id: row.id, field: '(删除行)', from: row, to: undefined });
	return out;
};

/** 供显示的一行摘要（**纯** ✓）。 */
export const editSummary = (diffs) => (diffs.length
	? [`改动 ${diffs.length} 处：`, ...diffs.map((d) => `  · ${d.id}.${d.field}：${JSON.stringify(d.from)} ⇒ ${JSON.stringify(d.to)}`)]
	: ['（没有任何字段变 ✗ —— 空编辑不算改动 ✓）']);

/** 调试用：一个包的事件条数（纯 ✓）。 */
export const eventCount = (pkg) => (pkg?.data?.[RULES]?.rows ?? []).length;

export { readStoryPackage };
