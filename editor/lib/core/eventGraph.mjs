// 车道 D · 切片 2（`#215` 报备 `18501384`）：**事件依赖的「键级图」** ✓ —— P2-① 的第一半（只读 ✓）
//
// ⚠️ **适用范围（⑲／㉑：先说清"这张图是什么，不是什么"）** ✗：
//   ① 这是**键级**图 ✗ —— **不含位置边** ✓（当前 schema 里没有 `next`／`goto` ✓ ⇒ 位置间的可达性**做不了** ✗，本件**也不假装做** ✓）；
//   ② 授予面**只看事件声明** ✗ —— 事件行里由 `VOCAB.effects`（`yields`／`gives`／`sets` ✓）列出的键 ✓；
//      **散文／段落里的写点**（`<<set>>` 一族 ✓）属 `--state` 门 ✓ ⇒ **本件不含** ✗ ⇒ 因此"**无人授予**"的准确读法是
//      「**事件声明面里无人授予**」✗，**不是**"不可达" ✗（那条要等位置边与写点面都进来 ✓）；
//   ③ 只读 ✓：不判红、不改数据 ✓（判定仍归各门 ✓）。
//
// 为什么要有它 ✓（P2-① 的出口：「死规则／幽灵条件／静默产出**可定位到事件**」✓）：
//   门侧已有 `deadRows` 等判定 ✓，但**没有"事件之间靠哪些键联系"的结构** ✗ ⇒ 出问题时人只能在 61 行里翻 ✗；本件把这张结构算出来 ✓。
//
// 复用 ✓：条件键的抽取**沿用** `core/audit-shared.mjs` 的 `condKeysOf` ✓（全仓唯一那把刀 ✓ —— 不新造第二份 ✗）、
//   授予面**沿用** `core/vocab.mjs` 的 `VOCAB.effects` ✓（引擎宣告的授予面 ✓ —— 不写死字面 ✗）。
// **浏览器安全** ✓：零宿主 import ✓（`core/**` 老规矩 ✓）。

import { condKeysOf } from './audit-shared.mjs';
import { VOCAB } from './vocab.mjs';

const asList = (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

/** 条件面字段名 ✓（与 `editor/web/events.mjs` 的 `when` 同形 ✓；`prio` 是**序号** ✗ 不是键 ⇒ 不在内 ✓）。 */
export const COND_FIELDS = Object.freeze(['req', 'any', 'exclude', 'prereq']);

/** **事件行**需要的键 ✓（逐字段走 `condKeysOf` ✓ —— 对象算子形 `{ gte: [...] }` 也在内 ✓）。 */
export const keysNeededBy = (row) => {
	const out = new Set();
	for (const f of COND_FIELDS) for (const k of asList(row?.[f]).flatMap((v) => condKeysOf(v))) out.add(k);
	return [...out].sort();
};

/** **事件行**声明的授予键 ✓（按 `VOCAB.effects` 的那几面 ✓ —— 面名不写死 ✗）。 */
export const keysGrantedBy = (row) => {
	const out = new Set();
	for (const face of VOCAB.effects) for (const k of asList(row?.[face])) if (typeof k === 'string') out.add(k);
	return [...out].sort();
};

/** **键级图** ✓：事件 → 需要的键 ✓ ／ 键 → 声明授予它的事件 ✓ ／ ＋ 各自"**事件声明面里无人授予**"的项 ✓。
 *
 *  ⚠️ **`inContractPaths` 只是弱提示** ✗ —— **不是"有没有登记"的判定** ✗：
 *    `contract.json` 的 `members[]` 是**状态容器的登记**（`name`／`path`，例 `notes` ⇒ `Game?.Notes?.entries` ✓），
 *    而条件里大量出现的是**note／flag 类的键**（`n_keeper_told`／`keeper.met`／`era:past`／`inv:…` ✓）——
 *    它们登记在 **note 表**里（`stories/<slug>/16-notes-*.twee` ✗ **尚未数据化** ✗）⇒ 本件**拿不到**那一面 ✓。
 *    ⇒ 所以本件**只说**"**事件声明面里无人授予**"✗，**不说**"未登记／不可达" ✗（㉑：不许把部分报成全图 ✓）。 */
export const graphOf = ({ rows = [], members = [] } = {}) => {
	const byId = new Map();
	for (const r of rows) if (r?.id) byId.set(r.id, r);
	const memberOf = new Map(members.map((m) => [m?.path ?? m?.name, m]));
	const needs = {};
	const grantedBy = {};
	const granted = new Set();
	for (const [id, row] of byId) {
		const ks = keysNeededBy(row);
		if (ks.length) needs[id] = ks;
		for (const k of keysGrantedBy(row)) { granted.add(k); (grantedBy[k] ??= []).push(id); }
	}
	for (const k of Object.keys(grantedBy)) grantedBy[k].sort();
	const ungranted = [];
	for (const [id, ks] of Object.entries(needs)) {
		for (const k of ks) {
			if (granted.has(k)) continue;
			const m = memberOf.get(k);
			// ⚠️ 这两项都是**弱提示** ✗（见件头）：命中 `contract.members` 的 `path`／`name` 面而已 ✗ —— 不构成"已/未登记"的判定 ✓。
			ungranted.push({ id, key: k, inContractPaths: Boolean(m), hasDefault: m ? Object.prototype.hasOwnProperty.call(m, 'default') : false });
		}
	}
	return {
		events: byId.size,
		needs,
		grantedBy,
		/** 「**事件声明面里**无人授予它」的项 ✓ —— ⚠️ `inContractPaths`／`hasDefault` 都是**弱提示** ✗：`contract.members` 的 `path`／`name` 面（note／flag 类的键登记在 **note 表**里 ✗ ⇒ 那面还没数据化 ⇒ 本件拿不到 ✓）。 */
		ungranted,
		counts: {
			events: byId.size,
			withNeeds: Object.keys(needs).length,
			grantedKeys: granted.size,
			ungrantedItems: ungranted.length,
			ungrantedNotInContractPaths: ungranted.filter((u) => !u.inContractPaths).length,
			ungrantedInContractNoDefault: ungranted.filter((u) => u.inContractPaths && !u.hasDefault).length,
		},
	};
};

/** 读数行 ✓（**逐条**列出最可疑的几类 ✗ —— 不是只报个数 ✓）。 */
export const formatGraph = (g) => {
	const L = [];
	L.push(`事件 ${g.counts.events} ⇒ 有需求 ${g.counts.withNeeds} · 被声明授予的键 ${g.counts.grantedKeys}`);
	L.push(`「**事件声明面里**无人授予」 ${g.counts.ungrantedItems} 项 ⇒ 不在 \`contract.members\` 的 path/name 面上 ${g.counts.ungrantedNotInContractPaths}（**弱提示** ✗，不是“未登记”✗）· 在该面上但无 default ${g.counts.ungrantedInContractNoDefault}`);
	for (const u of g.ungranted.slice(0, 12)) L.push(`  · ${u.id} ← ${u.key}`);
	if (g.ungranted.length > 12) L.push(`  … 其余 ${g.ungranted.length - 12} 项`);
	return L;
};
