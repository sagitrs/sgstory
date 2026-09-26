// `#1485`（`#1470` 五步②）：**装载层三源**的**纯函数合并器**（browser-safe core · 不碰磁盘）。
//
// 背景（实测）：故事数据此前是**单源逐文件**（`readStoryPackage` 对 `DATA_FILES` 逐个读
// `data/<name>`）⇒ ★没有"来源清单／合并"的概念。本件补上**合并**那一半；"读清单 ＋ 逐源读"
// 那一半在主读路（`story.js`／`story.mjs`）里（因为要注入的 `io`）。
//
// 三层（裁定 D5）：**规则级** ⇒ **世界级** ⇒ **故事级**，"**具体者胜**"（**靠后者**盖靠前者）。
// ★`shared/` 是**仓级**（D5：世界级共用只有在 story 之外才成立）—— 路径解析在主读路（本件只吃已读好的 json）。
//
// 判据（照票面 `#1485`）：
//   ① 被引件缺 ⇒ ✗ 不在本件（主读路读不到 ⇒ 由调用方点名；本件只合并 ⇒ 可自证 ✓）
//   ② 覆盖 ⇒ ★**记 `traces`**（逐容器逐键；✗ 静默 ✓）
//   ③ ★**覆盖"规则级"键 ⇒ 红**（D5：具体者胜**但不许**故事盖掉规则级 ✓）
//
// `sources` **声明形**（`tables.json` 顶层）：★**字符串数组** —— `["shared/rules.json", "shared/world.json", …]`
//   ★为什么用**字符串数组**（裁定）：仓内**单字段清单的惯例形**（`gives`／`sets`／`req` 一族都是 `string[]`）；
//     且 `#487` 口径是"**声明面 ✗ 大于实现面**" ⇒ ✗ 造 `{from}` 壳**给将来留位**（那正是要避免的 ✓）
//   ★**顺序＝优先级**：数组**靠后**者胜（`[规则级, 世界级, 故事级]` ⇒ 故事级最后 ⇒ 最具体 ✓）
//   ★内部形态（本件消费）仍是 `[{from, json}]` —— 由主读路**读盘时**补上 `json` ✓
//   ★**顺序＝优先级**：数组**靠后**者胜（`[规则级, 世界级, 故事级]` ⇒ 故事级最后 ⇒ 最具体 ✓）

/** 是不是"普通对象"（合并粒度＝**逐容器逐键**；数组／标量 ⇒ **整块替换**）。 */
const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * 逐容器逐键合并（**具体者胜**）＋ 覆盖留痕。
 * @param {Array<{from: string, json: any}>} sources ★顺序＝优先级（靠后者胜）
 * @returns {{ json: any, traces: Array<{path: string, from: string, to: string, over: any, by: any}> }}
 */
export const mergeSources = (sources = []) => {
	const list = Array.isArray(sources) ? sources.filter(Boolean) : [];
	const traces = [];
	/** 每个叶子/键的**当前来源**（`path` → `from`）；★用并行表 ✗ 不往数据里塞标记（会污染数据 ✓） */
	const origins = new Map();
	const merge = (dst, src, from, path) => {
		for (const [k, v] of Object.entries(src ?? {})) {
			const here = path ? `${path}.${k}` : k;
			if (isPlainObject(v) && isPlainObject(dst[k])) { origins.set(here, from); merge(dst[k], v, from, here); continue; }
			// ★覆盖留痕：目标**已有该键** ⇒ 记一条（✗ 静默 ✓）
			if (Object.prototype.hasOwnProperty.call(dst, k)) {
				traces.push({ path: here, from: origins.get(here) ?? null, to: from, over: dst[k], by: v });
			}
			dst[k] = Array.isArray(v) ? [...v] : (isPlainObject(v) ? { ...v } : v);
			origins.set(here, from);
		}
	};
	const out = {};
	for (const s of list) {
		const from = String(s?.from ?? '?');
		if (!isPlainObject(s?.json)) continue;                    // ✗ 非对象 ⇒ 跳过（主读路已点名"读不到／畸形"）
		merge(out, s.json, from, '');
	}
	return { json: out, traces };
};

/** ★**覆盖"规则级"键 ⇒ 红**（D5 判据③）：规则级 ＝ `sources[0]`（数组**最前** ＝ 最不具体）。 */
// 为什么单列：主读路要"出声"，而"出声"的条件**必须可自证** ⇒ 判据住纯函数 ✓
export const ruleLevelOverrides = (sources = [], traces = []) => {
	const list = Array.isArray(sources) ? sources.filter(Boolean) : [];
	const first = list[0]?.from != null ? String(list[0].from) : null;
	if (!first) return [];
	return (traces ?? []).filter((t) => String(t?.from ?? '') === first);
};

/** 纯函数：`sources` 声明形状检查（空＝绿）。★`from` 必须是**仓级相对路径**（✗ 不许指进故事目录）。 */
export const sourcesShapeProblems = (sources) => {
	const out = [];
	if (sources == null) return out;                              // 缺省 ⇒ 单源（＝今天）✓
	if (!Array.isArray(sources)) return [{ code: 'not-array', got: typeof sources }];
	if (!sources.length) return [{ code: 'empty-array' }];        // ★空数组 ⇒ 出声（✗ 静默当"零源" ✓）
	sources.forEach((s, i) => {
		// ★`#1485`（裁定）：**声明形＝字符串数组** ⇒ 非字符串项一律点名（✗ 不认 `{from}` 对象形 —— 两形并存 ✗）
		if (typeof s !== 'string' || !s.trim()) { out.push({ code: 'bad-entry', index: i, got: typeof s }); return; }
		if (/^stories\//.test(s)) out.push({ code: 'not-repo-level', index: i, from: s });   // ★★必留（T 读数点名的）
	});
	return out;
};
