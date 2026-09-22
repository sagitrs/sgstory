// 车道 G 前半 · 切片 1b（`#215` 报备 `18503024`，设计要点经 `18503032` 批准）：
// **`contractVersion` 的落点 —— "允许的全集"（包络）**。
//
//注意：**声明一（口径，最要紧的一条 —— 必须写进件头，理由见下）**：
// **`contractVersion` 声明的是「允许的全集」，不是「每个故事都必须长这样」**。
// 依据 ＝ `rules.json` **缺失也是合法状态**（`hollow-cave`／`minimal-demo` 本来就没有）
// → **"缺"与"畸形"是两回事**（缺 → 合法；畸形 → 报 —— 那条口径落在 `core/dialect.mjs`）。
// → 于是本件**只有一个方向**：**故事形状 ⊆ 声明全集**（**包络**）；出现**全集外**的
// 顶层键／条目表／字段 → **红** → **必须显式改号**（＋同 PR 改这里的快照），不得"顺手补一条"。
//
//注意：**声明二（本件做不到的 / 不做的，如实写明 —— ㉑／㉕）**：
// ① **反向不判**：**全集里没有任何故事用到**的项 → 本件**只报读数、不判红** ——
// 它属"只增不减／腐烂"那一族 ＝ **G-2（旧面删除哨兵门）** 的地盘。**本件不假装双向**。
// ② **不读 `N-1`**：兼容层是 **G-1c**（故本件对号的判定是"**必须等于 `CURRENT`**" —— 一旦 G-1c 落地，
// 这一行要放宽成"`CURRENT` 或 `CURRENT-1`"，**那正是设计好的演进点**）。
// ③ **不覆盖非数组的嵌套结构**：包络只量 `{文件 → 顶层键}` ∪ `{文件 → **数组条目** 字段}`；
// 而 `tables.json.containers` 是**深嵌套对象**（`Social.asks[]`／`Checks.sites{}`／`Items.defs{}`，
// 实测 3 故事分别 19／11／12 个键）→ **它的内部形状不在本件包络内**（本件**不假装**覆盖）。
// 要覆盖它得先把 `containers` 的语义数据化 → 属后续切片。
//
//注意：**声明三（"包络"这条形状的量化依据 —— 要留档）**：
// `contract.json::members` 的**并集有 28 个字段**，而**三故事共有的只有 4 个**
//（`kind`／`name`／`path`／`value`）→ **24 个是故事特有** →
// **"方言"不是一个"三故事同形"的集合，而是一个包络：全集很大、每个故事只占一块**。
//（若它是"同形要求"，那 4 个共有字段以外的 24 个就得每故事都写一遍 —— 显然不是本仓的形态。）
//注意：**早期报备（`#215` 评论 `18503024`）把这个数写成了 27** → 已在 `#215` 跟一条**更正**（`18503261`）
// —— 此处以**实测的 28** 为准（28 ＝ 共有 4 ＋ 特有 24 → 三个数自洽）。
//
//注意：**声明四（号口径：(β)“**增面不 ＋1**”，经 `#215` 评论 `18504264` 裁定）**：
// · **改既有一面的形状／语义** ⟹ **破坏性** ⟹ `CURRENT ＋1`（设计稿 **§7 分期细化** 的 **P3 ② `contractVersion` ＋ 兼容层** 那行的原意 ——注意：**按节名引用**：`#973` 插 §0.1 后全稿**下移 21 行** → **行号会漂、节名不漂**）；
// · **新增一面**（`data/` 下多一个文件）⟹ **加法** ⟹ **不 ＋1**，但**必须在本件的 `EXTENSIONS` 里显式登记**。
// **牙在哪**：**未登记的增面 → 仍然红**（枚举里没名 → 拦 → (β) 只把“加法”从“改号”里分出去，**不是放宽**）；
// 且登记时必须**连那一面的形状一起写**（`topKeys`／`items`）→ **登记过的面里再出没登记的字段 → 也红**
//（否则“登记一个面”会被读成“这个面里什么都行”）。
// **三条配套**（同裁定）：登记与面**同 PR**（原子）· 登记**留痕**（写清这一面是什么 ＋ 票号）·
// **若某次增面对旧读者其实破坏性** ⟹ 走 `contractCompat` 的 **`external` 条目**（**不靠 ＋1 遮掩**）。
//
// **浏览器安全**：零宿主 import（`core/**` 老规矩）。**本件不 import `story.mjs`**
//（`story.mjs` 反过来 import 本件的 `CURRENT` → 避免环）。

/** 当前方言号（**整数**）。破坏性改方言时才 ＋1（兼容层读 `N-1` 见 G-1c）。 */
export const CURRENT = 1;

/** **声明的全集快照**（＝把"允许出现的形状"写死在这里）。
 *
 *注意：**它就是"改号时同 PR 要一起改的东西"** —— 只改 `CURRENT` 而不改它 → `test/contract-version.mjs`
 * 会**当场红**（"改了号却没改全集"必须被抓 —— 这正是 ㉗"这一刀打的是我要的那个面吗"的正形）。
 * 取值来源：`test/dialect.mjs`（切片 1a）在 `#949` 时量到的**三故事并集**（逐项排序）。 */
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

/** **本版已登记的增面**（(β) 的口）：增面**不 ＋1**，但**必须在这里显式登记**。
 *
 * 条目形状 ＝ `{ file, topKeys, items, reason, ticket}` —— **与 `DECLARED` 的同名键同义**（`checkDialect` 把它与 `DECLARED` **一视同仁** → **一套机制**，不另造第二套）；
 * `reason`／`ticket` 是**留痕**那两条（缺一 → `judgeExtensions()` 点名）。
 *注意：**形状要一起写**：否则“登记了一个面”会被误读成“这个面里什么都行”。 */
export const EXTENSIONS = Object.freeze([
	// 车道 B · notes 面（`#215` 报备 `18504282`；(β) 经 `18504264` 裁定）：
	// **增面不 ＋1**，但形状要一起登记（否则“登记一个面”会被读成“这个面里什么都行”）。
	//注意：`blocks[].entries` 是**深嵌套对象** → 它的内部形状**不在本包络内**（与 `contract.json` 的 `containers` 同一边界）。
	{
		file: 'notes.json',
		topKeys: ['blocks', 'eraMap', 'note', 'why_eraMap'],
		items: { blocks: ['entries', 'file', 'section'] },
		reason: 'notes 面：把写写 `16-notes-*.twee`（手写表）的数据化 ✓ —— 一块＝一个 `:: <段名> [script]` 输出件 ✓',
		ticket: 'sgstory#761 / gsvector-process#215',
	},
]);

/** **登记条目自身的检查**（镜像 `escapeHatchProblems()` 的“条目必须带理由与票号”那一条）。 */
export const judgeExtensions = (extensions = EXTENSIONS) => {
	const out = [];
	if (!Array.isArray(extensions)) return [{ at: 'EXTENSIONS', kind: 'shape', detail: '`EXTENSIONS` 不是数组 ✗' }];
	for (const [i, e] of extensions.entries()) {
		const at = `EXTENSIONS[${i}]`;
		if (!e || typeof e !== 'object') { out.push({ at, kind: 'shape', detail: `${at} 不是对象 ✗` }); continue; }
		if (typeof e.file !== 'string' || !e.file) out.push({ at, kind: 'file', detail: `${at} 缺 \`file\` ✗（登记要指名**哪一面** ✓）` });
		if (!Array.isArray(e.topKeys)) out.push({ at, kind: 'shape', detail: `${at} 缺 \`topKeys\` ✗（**登记面要连形状一起写** ✓ —— 否则会被误读成“这个面里什么都行” ✗）` });
		if (!e.items || typeof e.items !== 'object' || Array.isArray(e.items)) out.push({ at, kind: 'shape', detail: `${at} 缺 \`items\`（可为空对象 ✓）✗` });
		for (const k of ['reason', 'ticket']) if (e[k] === undefined || e[k] === null || e[k] === '') out.push({ at, kind: 'required', field: k, detail: `${at} 缺 \`${k}\` ✗（增面登记必须可追：理由 ＋ 票号 ✓）` });
	}
	return out;
};

/** **越界检查**（**只有一个方向**：故事 ⊆ 全集）：`dialect` ＝ 1a 的 `dialectOf()` 输出。
 *
 * 返回**逐条**清单（不合并成一句 —— 照 `core/diagnose.mjs` 的 findings 同族）：
 * `{ file, kind: 'file'|'topKey'|'itemList'|'field', name, list?}`。
 * **缺的任何东西都不报**（缺 ＝ 合法）；**只报“全集外”**。
 *注意：**判据面**（(β)）：`DECLARED` **∪** `EXTENSIONS` —— **已登记的增面**与 `DECLARED` **同等对待**；
 * **没登记的增面** → `kind: 'file'` 报（**牙仍在**）。 */
export const checkDialect = (dialect, { declared = DECLARED, extensions = EXTENSIONS } = {}) => {
	const out = [];
	const merged = { ...declared };
	for (const e of Array.isArray(extensions) ? extensions : []) {
		if (!e?.file) continue;
		merged[e.file] = { topKeys: e.topKeys ?? [], items: e.items ?? {} };
	}
	for (const [file, shape] of Object.entries(dialect?.files ?? {})) {
		const d = merged[file];
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

/** **号的判定**：故事的清单里 `contractVersion` 必须**是正整数**且**等于 `current`**。
 *
 *注意：**`current` 可注入**（＝为了"把 `CURRENT` 改成 2 而全集不动 → 故事必红"这条**能假**的判据能单测，
 * 不必真去改常量）。 */
export const judgeContractVersion = ({ slug, manifest } = {}, { current = CURRENT } = {}) => {
	const out = [];
	const v = manifest?.contractVersion;
	if (v === undefined || v === null) out.push({ slug, kind: 'missing', detail: `故事「${slug}」的 00-story.json 缺 contractVersion ✗（方言号必须显式声明 ✓）` });
	else if (!Number.isInteger(v) || v < 1) out.push({ slug, kind: 'shape', detail: `故事「${slug}」的 contractVersion 不是正整数 ✗：${JSON.stringify(v)}` });
	else if (v !== current) out.push({ slug, kind: 'stale', detail: `故事「${slug}」的 contractVersion ＝ ${v} ✗，而当前方言号 ＝ ${current} ✓（不同号 ⇒ 须由兼容层读，见 G-1c；本片只认同号 ✗）` });
	return out;
};

/** **读数**：**全集里没有任何故事用到**的项 → **只报不判**（反向归 G-2 —— 见声明二①）。
 *
 * 入参 `dialects` ＝ 若干 `dialectOf()` 输出（数组）。 */
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

/** 读数行（逐条列）。 */
export const formatContractVersion = ({ current = CURRENT, declared = DECLARED } = {}) => {
	const L = [];
	L.push(`方言号：CURRENT ＝ ${current} ✓（读 N-1 见 G-1c ✗）`);
	for (const [file, d] of Object.entries(declared)) {
		const lists = Object.entries(d.items).map(([k, v]) => `${k}[](${v.length})`).join(' · ') || '（无条目表）';
		L.push(`  · ${file}：顶层 ${d.topKeys.length} 个 [${d.topKeys.join(', ')}] ｜ 条目表 ${lists}`);
	}
	return L;
};
