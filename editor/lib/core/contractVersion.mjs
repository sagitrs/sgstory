// 车道 G 前半 · 切片 1b（`#215` 报备 `18503024`，设计要点经 `18503032` 批准 ✓）：
// **`contractVersion` 的落点 —— "允许的全集"（包络）** ✓。
//
// ⚠️ **声明一（口径，最要紧的一条 ✗ —— 必须写进件头 ✓，理由见下）**：
//   **`contractVersion` 声明的是「允许的全集」，不是「每个故事都必须长这样」** ✗。
//   依据 ＝ `rules.json` **缺失也是合法状态** ✓（`hollow-cave`／`minimal-demo` 本来就没有 ✓）
//   ⇒ **"缺"与"畸形"是两回事** ✓（缺 ⇒ 合法；畸形 ⇒ 报 ✓ —— 那条口径落在 `core/dialect.mjs` ✓）。
//   ⇒ 于是本件**只有一个方向**：**故事形状 ⊆ 声明全集**（**包络** ✓）；出现**全集外**的
//     顶层键／条目表／字段 ⇒ **红** ✗ ⇒ **必须显式改号**（＋同 PR 改这里的快照 ✓），不得"顺手补一条" ✗。
//
// ⚠️ **声明二（本件做不到的 / 不做的，如实写明 ✗ —— ㉑／㉕）**：
//   ① **反向不判** ✗：**全集里没有任何故事用到**的项 ⇒ 本件**只报读数、不判红** ✓ ——
//      它属"只增不减／腐烂"那一族 ✓ ＝ **G-2（旧面删除哨兵门）** 的地盘 ✓。**本件不假装双向** ✗。
//   ② **不读 `N-1`** ✗：兼容层是 **G-1c** ✓（故本件对号的判定是"**必须等于 `CURRENT`**" ✓ —— 一旦 G-1c 落地，
//      这一行要放宽成"`CURRENT` 或 `CURRENT-1`"，**那正是设计好的演进点** ✓）。
//   ③ **不覆盖非数组的嵌套结构** ✗：包络只量 `{文件 → 顶层键}` ∪ `{文件 → **数组条目** 字段}` ✓；
//      而 `tables.json.containers` 是**深嵌套对象**（`Social.asks[]`／`Checks.sites{}`／`Items.defs{}` ✓，
//      实测 3 故事分别 19／11／12 个键 ✓）⇒ **它的内部形状不在本件包络内** ✗（本件**不假装**覆盖 ✓）。
//      要覆盖它得先把 `containers` 的语义数据化 ⇒ 属后续切片 ✓。
//
// ⚠️ **声明三（"包络"这条形状的量化依据 ✓ —— 要留档 ✓）**：
//   `contract.json::members` 的**并集有 28 个字段**，而**三故事共有的只有 4 个**
//   （`kind`／`name`／`path`／`value` ✓）⇒ **24 个是故事特有** ✗ ⇒
//   **"方言"不是一个"三故事同形"的集合，而是一个包络：全集很大、每个故事只占一块** ✓。
//   （若它是"同形要求"，那 4 个共有字段以外的 24 个就得每故事都写一遍 ✗ —— 显然不是本仓的形态 ✓。）
//   ⚠️ **早期报备（`#215` 评论 `18503024`）把这个数写成了 27** ✗ ⇒ 已在 `#215` 跟一条**更正**（`18503261`）✓
//     —— 此处以**实测的 28** 为准 ✓（28 ＝ 共有 4 ＋ 特有 24 ⇒ 三个数自洽 ✓）。
//
// **浏览器安全** ✓：零宿主 import ✓（`core/**` 老规矩 ✓）。**本件不 import `story.mjs`** ✓
//   （`story.mjs` 反过来 import 本件的 `CURRENT` ✓ ⇒ 避免环 ✓）。

/** 当前方言号 ✓（**整数** ✓）。破坏性改方言时才 ＋1 ✓（兼容层读 `N-1` 见 G-1c ✓）。 */
export const CURRENT = 1;

/** **声明的全集快照** ✓（＝把"允许出现的形状"写死在这里 ✓）。
 *
 *  ⚠️ **它就是"改号时同 PR 要一起改的东西"** ✗ —— 只改 `CURRENT` 而不改它 ⇒ `test/contract-version.mjs`
 *  会**当场红**（"改了号却没改全集"必须被抓 ✗ —— 这正是 ㉗"这一刀打的是我要的那个面吗"的正形 ✓）。
 *  取值来源：`test/dialect.mjs`（切片 1a）在 `#949` 时量到的**三故事并集** ✓（逐项排序 ✓）。 */
export const DECLARED = Object.freeze({
	'contract.json': Object.freeze({
		topKeys: Object.freeze(['members', 'note', 'section']),
		items: Object.freeze({
			members: Object.freeze(['args', 'baseParam', 'default', 'docs', 'empty', 'error', 'fallback', 'field', 'from',
				'fromMember', 'join', 'key', 'kind', 'name', 'note', 'optional', 'param', 'params', 'parts', 'path',
				'prefix', 'required', 'suffix', 'to', 'trim', 'type', 'value', 'via']),
		}),
	}),
	'tables.json': Object.freeze({
		topKeys: Object.freeze(['containers', 'merges', 'note', 'section']),
		items: Object.freeze({
			merges: Object.freeze(['default', 'target', 'value']),
		}),
	}),
	'rules.json': Object.freeze({
		topKeys: Object.freeze(['key', 'rows', 'section']),
		items: Object.freeze({
			rows: Object.freeze(['any', 'exclude', 'id', 'prio', 'req', 'scope', 'sets', 'text', 'yields']),
		}),
	}),
});

/** **越界检查** ✓（**只有一个方向** ✗：故事 ⊆ 全集）：`dialect` ＝ 1a 的 `dialectOf()` 输出 ✓。
 *
 *  返回**逐条**清单 ✗（不合并成一句 ✓ —— 照 `core/diagnose.mjs` 的 findings 同族 ✓）：
 *  `{ file, kind: 'file'|'topKey'|'itemList'|'field', name, list? }`。
 *  **缺的任何东西都不报** ✓（缺 ＝ 合法 ✓）；**只报"全集外"** ✗。 */
export const checkDialect = (dialect, { declared = DECLARED } = {}) => {
	const out = [];
	for (const [file, shape] of Object.entries(dialect?.files ?? {})) {
		const d = declared[file];
		if (!d) { out.push({ file, kind: 'file', name: file }); continue; }
		for (const k of shape.topKeys ?? []) if (!d.topKeys.includes(k)) out.push({ file, kind: 'topKey', name: k });
		for (const [list, fields] of Object.entries(shape.items ?? {})) {
			const df = d.items[list];
			if (!df) { out.push({ file, kind: 'itemList', name: list }); continue; }
			for (const f of fields) if (!df.includes(f)) out.push({ file, kind: 'field', name: f, list });
		}
	}
	return out;
};

/** **号的判定** ✓：故事的清单里 `contractVersion` 必须**是正整数**且**等于 `current`** ✓。
 *
 *  ⚠️ **`current` 可注入** ✓（＝为了"把 `CURRENT` 改成 2 而全集不动 ⇒ 故事必红"这条**能假**的判据能单测 ✓，
 *  不必真去改常量 ✓）。 */
export const judgeContractVersion = ({ slug, manifest } = {}, { current = CURRENT } = {}) => {
	const out = [];
	const v = manifest?.contractVersion;
	if (v === undefined || v === null) out.push({ slug, kind: 'missing', detail: `故事「${slug}」的 00-story.json 缺 contractVersion ✗（方言号必须显式声明 ✓）` });
	else if (!Number.isInteger(v) || v < 1) out.push({ slug, kind: 'shape', detail: `故事「${slug}」的 contractVersion 不是正整数 ✗：${JSON.stringify(v)}` });
	else if (v !== current) out.push({ slug, kind: 'stale', detail: `故事「${slug}」的 contractVersion ＝ ${v} ✗，而当前方言号 ＝ ${current} ✓（不同号 ⇒ 须由兼容层读，见 G-1c；本片只认同号 ✗）` });
	return out;
};

/** **读数** ✓：**全集里没有任何故事用到**的项 ⇒ **只报不判** ✗（反向归 G-2 ✓ —— 见声明二① ✓）。
 *
 *  入参 `dialects` ＝ 若干 `dialectOf()` 输出 ✓（数组 ✓）。 */
export const unusedDeclared = (dialects = [], { declared = DECLARED } = {}) => {
	const out = [];
	const usedTop = {};
	const usedField = {};
	for (const d of dialects) {
		for (const [file, shape] of Object.entries(d?.files ?? {})) {
			(usedTop[file] ??= new Set()); (usedField[file] ??= {});
			for (const k of shape.topKeys ?? []) usedTop[file].add(k);
			for (const [list, fields] of Object.entries(shape.items ?? {})) {
				(usedField[file][list] ??= new Set());
				for (const f of fields) usedField[file][list].add(f);
			}
		}
	}
	for (const [file, d] of Object.entries(declared)) {
		for (const k of d.topKeys) if (!usedTop[file]?.has(k)) out.push({ file, kind: 'topKey', name: k });
		for (const [list, fields] of Object.entries(d.items)) {
			for (const f of fields) if (!usedField[file]?.[list]?.has(f)) out.push({ file, kind: 'field', name: f, list });
		}
	}
	return out;
};

/** 读数行 ✓（逐条列 ✗）。 */
export const formatContractVersion = ({ current = CURRENT, declared = DECLARED } = {}) => {
	const L = [];
	L.push(`方言号：CURRENT ＝ ${current} ✓（读 N-1 见 G-1c ✗）`);
	for (const [file, d] of Object.entries(declared)) {
		const lists = Object.entries(d.items).map(([k, v]) => `${k}[](${v.length})`).join(' · ') || '（无条目表）';
		L.push(`  · ${file}：顶层 ${d.topKeys.length} 个 [${d.topKeys.join(', ')}] ｜ 条目表 ${lists}`);
	}
	return L;
};
