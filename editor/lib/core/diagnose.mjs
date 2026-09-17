// P2（`#761`）第一片：**实时诊断**的**纯件** ✓ —— 给一份故事包（`data/*.json`）⇒ 一份**结构化**诊断 ✓
//
// 三条口径（写在这里，因为它们是"为什么这样写"）：
//   ① **只吃包内既有事实** ✗ —— 不许自造 schema、不许引外部清单 ✓（数据面就是真源 ✓）；
//   ② 每一条都**点名** `{ event, field }` ✗ —— 用户要的是"**改哪个字段时坏了**" ✓，
//      不是"有错" ✗（否则页面只能笼统说"有问题"，等于没说 ✓）；
//   ③ **零宿主** ✓（core ✓）：不读文件、不起进程、不看钟 ✓ ⇒ 页面与 CLI 能跑**同一份**判定 ✓
//      （§17「同一条路」＝ 判定抽纯 ✓）。
//
// 适用面（**必须写清** ✗ —— 与"实时"这个理由一致 ✓）：本件只做**包内一致性**判定 ✓（毫秒级 ✓）；
// **不**做编译／等价／story-shape 那类要构建或要起引擎的检查 ✓（那些留在 CLI ✓，页内不冒充 ✓）。

const STR_FIELDS = ['id', 'scope', 'text'];
const NUM_FIELDS = ['prio'];
const LIST_FIELDS = ['req', 'any', 'exclude', 'yields', 'sets', 'blocks'];

const finding = ({ level = 'error', step = 'story', detail, event = null, field = null }) =>
	({ level, step, detail, target: { event, field } });

/** 主判定 ✓：纯函数 ✓（同输入 ⇒ 逐字节同输出 ✗：页面与 CLI 两侧可比 ✓）。 */
export const diagnoseStory = ({ data, slug = null } = {}) => {
	void slug;
	const out = [];
	const rules = data?.['rules.json'];
	// ⚠️ **适用面** ✓：有的故事的事件不在 `data/rules.json` 里（规则仍住在 twee ✓）⇒ 那**不是错误** ✗，
	//   而是"**本件不适用**" ✓ ⇒ 报 `info` 并把适用性说清 ✓（实测：`hollow-cave`／`minimal-demo` 就是这种 ✓）。
	if (!rules || typeof rules !== 'object') {
		return [finding({ level: 'info', step: 'applicable', detail: '本包没有 rules 数据面（事件不在 data/rules.json 里）⇒ 本件**不适用** ✓（不是错误 ✗）', field: 'rules.json' })];
	}
	if (!Array.isArray(rules.rows)) {
		return [finding({ step: 'package', detail: 'rules.json 的 rows 不是数组 ✗', field: 'rows' })];
	}

	const seen = new Map();          // id ⇒ 首次出现的下标 ✓（用来点名"和谁重了" ✓）
	for (const [i, row] of rules.rows.entries()) {
		if (!row || typeof row !== 'object') {
			out.push(finding({ step: 'row', detail: `第 ${i + 1} 行不是对象 ✗`, field: 'row' }));
			continue;
		}
		const ev = typeof row.id === 'string' && row.id.trim() ? row.id : `(第 ${i + 1} 行)`;
		// ① **重复 id** ✓ —— 事件的身份坏了 ⇒ 编辑里最常见的复制粘贴事故 ✓
		if (typeof row.id !== 'string' || !row.id.trim()) {
			out.push(finding({ step: 'row', detail: `第 ${i + 1} 行缺 id（或不是非空字符串）✗`, field: 'id' }));
		} else if (seen.has(row.id)) {
			out.push(finding({ step: 'row', detail: `事件 id 重复 ✗：\`${row.id}\` 与第 ${seen.get(row.id) + 1} 行相同（改一处会改到两行 ✗）`, event: row.id, field: 'id' }));
		} else {
			seen.set(row.id, i);
		}
		// ② **空 text** ✓ —— "点了没反应"那一族的入口 ✓
		if (typeof row.text !== 'string' || !row.text.trim()) {
			out.push(finding({ step: 'row', detail: `事件 \`${ev}\` 的 text 为空 ✗（渲染出来什么都没有 ⇒ 点了像没反应 ✗）`, event: ev, field: 'text' }));
		}
		// ③ **类型不合** ✓ —— 写错类型会一路混到产物里才炸 ✓ ⇒ 这里当场说 ✓
		for (const f of STR_FIELDS) if (f in row && typeof row[f] !== 'string') out.push(finding({ step: 'row', detail: `字段类型不合 ✗：\`${ev}.${f}\` 应为字符串 ✓`, event: ev, field: f }));
		for (const f of NUM_FIELDS) if (f in row && !(typeof row[f] === 'number' && Number.isFinite(row[f]))) out.push(finding({ step: 'row', detail: `字段类型不合 ✗：\`${ev}.${f}\` 应为有限数 ✓`, event: ev, field: f }));
		for (const f of LIST_FIELDS) if (f in row && !Array.isArray(row[f])) out.push(finding({ step: 'row', detail: `字段类型不合 ✗：\`${ev}.${f}\` 应为数组 ✓`, event: ev, field: f }));
	}
	// ④ **空 rows** ✓（清空一张表也是"编辑" ⇒ 该说一声 ✓；但不是 error 级别 ✗）
	if (!rules.rows.length) out.push(finding({ level: 'warn', step: 'package', detail: 'rules.json 的 rows 是空的 ⇒ 这个包里没有任何事件 ✗', field: 'rows' }));

	return out.sort((a, b) => `${a.target.event}|${a.target.field}|${a.detail}`.localeCompare(`${b.target.event}|${b.target.field}|${b.detail}`));
};

/** 给人看的一行 ✓（页面与 CLI 同源 ⇒ 报文不会两样 ✓）。 */
export const formatFinding = (f) => `[${f.level}] ${f.step}${f.target.event ? ` · ${f.target.event}` : ''}${f.target.field ? `.${f.target.field}` : ''}：${f.detail}`;

/** 结论的**摘要** ✓（供页面顶部一行显示 ✓）。 */
export const summarize = (findings) => {
	const errs = findings.filter((f) => f.level === 'error').length;
	const warns = findings.filter((f) => f.level === 'warn').length;
	const infos = findings.filter((f) => f.level === 'info').length;
	if (errs + warns === 0) return infos ? `✔ 不适用或无问题 ✓（${infos} 处说明 ✓）` : '✔ 没有发现问题 ✓';
	return  `${errs ? `✗ ${errs} 处错误` : ''}${errs && warns ? ' · ' : ''}${warns ? `⚠ ${warns} 处提示` : ''}`;
};
