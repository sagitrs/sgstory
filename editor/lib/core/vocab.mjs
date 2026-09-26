// 车道 D · 切片 1（`#215` 报备评论 `18500772`）：**词表** —— `Sg.rules.*` 的**页内可读镜像**
//
//注意：**单一权威在引擎** —— 本件是它的镜像，**不是**第二处声明：
// · 引擎侧声明：`src/engine/40-sim/22-rules.twee` 的 `prefixes`／`effects`／`ops`／`terms`（`#1187` 第五块后）（每轴都带"为什么必须由引擎宣告"的注释）；
// · **钉法**：`test/rules.mjs` 四轴逐条 `eq(Sg.rules.<axis>, VOCAB.<axis>)` → **只改一边 → 当场红**。
// → **要加一项：先改引擎**，再改这里（顺序反了会被门抓住）。
//
// 为什么页内需要它（P1-③「enum 取自 `Sg.rules.*`」）：编辑器要给**下拉/候选**，
// 而页面是**静态**的（不经服务端、不跑 SugarCube）→ 拿不到运行期的 `window.Sg.rules` → 必须有一份**可 import 的声明**。
// 定位：本件是**声明**（不是判定）—— 与 `core/stateDiagnose.mjs`／`core/k4criteria.mjs` 那种"判据件"**分家**
//（同 `#215` 里"判据住自己的 core 件"的形状）；**浏览器安全**：零宿主 import（`core/**` 的老规矩）。

/** 四轴词表（`Object.freeze` → 页内拿到的是**只读**声明：改它没有意义，改引擎才有）。 */
export const VOCAB = Object.freeze({
	/** **键形前缀**（`inv:<道具>`／`era:<时代>`／`gear:<道具>`）—— 行里用了未宣告的前缀 → `--rules` 判红。 */
	prefixes: Object.freeze(['inv', 'era', 'gear']),
	/** **引擎兑现的授予面**（`yields`／`gives`／`sets`）—— 被引擎忽略的声明＝**静默空转**。 */
	effects: Object.freeze(['yields', 'gives', 'sets']),
	/** **条件项的"对象算子"**（`{ gte: […]}` 一族）—— 引擎不认的算子会让条件**永假**。 */
	ops: Object.freeze(['gte', 'gt', 'lte', 'lt', 'oneOf']),
	/** **取值项**（当前只 `price`）—— 未宣告的取值项 → fail-loud。 */
	terms: Object.freeze(['price']),
});

/** 四个轴的**轴名**（给"钉法"和 UI 遍历用 —— 免得下游各写一份轴名表）。 */
export const VOCAB_AXES = Object.freeze(['prefixes', 'effects', 'ops', 'terms']);

/** 某一轴的候选值（轴名不认识 → **讲人话地抛**，不许静默给空数组 → "下拉空着"会被当成"没得选"）。 */
export const vocabOf = (axis) => {
	if (!Object.prototype.hasOwnProperty.call(VOCAB, axis)) {
		throw new Error(`vocabOf：未知轴「${axis}」✗（可用：${VOCAB_AXES.join('／')}）`);
	}
	return VOCAB[axis];
};


/** **字段名 → 轴** 的映射（车道 D 切片 1b）—— 给"表单该给哪一轴候选"一个**声明**，
 * 免得 DOM 层现编 `if (name === 'req') …`（那件件头明令"**不新造 schema**"）。
 * 当前只映**语义最确定**的四个条件行字段（设计稿 D3 的「何时(`req`／`any`／`exclude`／`prereq`／`prio`)」→ 取前四者 ——
 * `prio` 是**序号** 不是算子面 → 不映）；另三轴（`effects`／`prefixes`／`terms`）**已暴露未绑定** → 属后续切片。 */
export const VOCAB_FIELDS = Object.freeze({ req: 'ops', any: 'ops', exclude: 'ops', prereq: 'ops' });

/** 该字段用哪一轴的候选；**未映射 → `null`**（"这个字段没有候选"是**合法状态** → 不抛）。
 *注意：与 `vocabOf()` 分工：`vocabOf` 是"**轴名**不认识"→ 抛（编程错）；本函数是"字段没有候选"→ `null`（正常）。 */
export const vocabAxisForField = (name) => VOCAB_FIELDS[name] ?? null;

/** **领域表**（`#966`）—— 引擎**按名查表**的两张（`src/10-core.twee:75/76`），与四轴**分家**：
 * 四轴是**规则行词表**（用了未宣告的 → 行静默死）；这两张是**引擎查表**（查不到 → **默默给 0** —— `mod(score) { … ((score?? 10) - 10) …}`，`10-core.twee:82`）。
 *注意：**带中文标签**（**不是数组**）：`abilities` 是“值 → 中文名”、`skills` 是“技能 → 归属属性” —— 页内下拉要显示中文就靠它。
 *注意：**改了引擎表不改本镜像 → 当场红**（由 `test/rules.mjs` 那组钉法保证，照四轴同形）。 */
export const DOMAIN_TABLES = Object.freeze({
	abilities: Object.freeze({ str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' }),
	skills: Object.freeze({ 运动: 'str', 体操: 'dex', 巧手: 'dex', 隐匿: 'dex', 奥秘: 'int', 历史: 'int', 调查: 'int', 自然: 'int', 宗教: 'int', 驯兽: 'wis', 洞悉: 'wis', 医药: 'wis', 察觉: 'wis', 生存: 'wis', 欺瞒: 'cha', 恐吓: 'cha', 表演: 'cha', 游说: 'cha' }),
});

/** **牙**（`#966`）：包内**检定站点**（`tables.json` 的 `Checks.sites`）出现**表外**的 `abil`／`skill` → **列出来**。
 *注意：**只列不判**（与 `core/**` 老规矩一致：判红住门）；**零宿主** → 页内也能用。
 * 为什么要有它：`mod(undefined) → 0` → **写错一个字母 → 检定静默 +0**（正是四轴当初要防的那类静默）。
 *注意：本函数只扫 `Checks.sites`（当前**唯一**出现这两个字段的地方）—— 将来多一处来源 → 连同探针一起补。 */
export const unknownDomainWords = (data = {}) => {
	const sites = data?.['tables.json']?.containers?.Checks?.sites ?? null;
	if (!sites || typeof sites !== 'object') return [];
	const out = [];
	for (const [name, site] of Object.entries(sites)) {
		if (!site || typeof site !== 'object') continue;
		if (site.abil !== undefined && !Object.prototype.hasOwnProperty.call(DOMAIN_TABLES.abilities, String(site.abil))) out.push({ site: name, field: 'abil', value: String(site.abil) });
		if (site.skill !== undefined && !Object.prototype.hasOwnProperty.call(DOMAIN_TABLES.skills, String(site.skill))) out.push({ site: name, field: 'skill', value: String(site.skill) });
	}
	return out;
};

// ── `#1048`→`#1114`：取值词汇命名空间（提升至 core——防 test/ 被编辑器反向依赖）──────────
//注意：**单一权威**：门侧（`test/prose-vocabulary.mjs`）与拼装层（`editor/lib/core/passages.mjs`）**都 import 本函数**
//（门放行/拼装不认 → 静默漏值 ——裁定 `#1048` 评论 5755635491 §三）。
// 两源并集（甲-1）：① contract 成员 ∩ 值语义 kind（const/state-ref/identity-string）∪ ② 引擎 VALUE_LABELS（10-core 常量表）。
export const VALUE_KINDS = Object.freeze(['const', 'state-ref', 'identity-string']);   // 排除侧：template/lookup/bool-exists/game-ref 等产值但语义待逐条显式列入（「不许整类放开」）

/** `#1048`：从引擎源抽 `VALUE_LABELS` 常量表（对账面）。**纯函数**。
 * `#1114` 片 2b-2b-0：**本处为单一权威**（原先在 `test/prose-vocabulary.mjs`）——
 * 拼装层（`build` 接线）与门**必须**用同一份（各算一份 → 门放行/拼装不认 → 静默漏值）。 */
export const engineLabels = (sources = []) => {
	const out = new Set();
	for (const text of sources) {
		const m = /VALUE_LABELS:\s*Object\.freeze\(\[([^\]]*)\]\)/.exec(String(text));
		if (m) for (const x of m[1].matchAll(/['"]([A-Za-z0-9_-]+)['"]/g)) out.add(x[1]);
	}
	return [...out].sort();
};

export const valueTerms = ({ contract = { members: [] }, labels = [] } = {}) =>
	new Set([...(contract.members ?? []).filter((m) => VALUE_KINDS.includes(m?.kind)).map((m) => m.name), ...labels]);
