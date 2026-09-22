// `#1189`（父票 `#1184` 流四·甲）：**实现路线表**（只读登记面）。
//
// 这张表登记的是"同一件行为有多条实现路线"的地方：按**优先级**列清每条路线、写清兜底语义、
// 以及**退出条件**（旧路线什么时候可以退）。表本身不改任何行为。
//
// 表即登记面（出生规则）：此后新增多路线行为，必须**同片**带表项（含路线清单、兜底语义、退出条件），
// 不带即违例。判据件 `test/route-registry.mjs` 的"覆盖格"会自然抓住这种情形。
//
// ## 人怎么查表
//
// 人从 `docs/implementation-routes.md` 进（那里写口径与出生规则，并指到这里）；机器从 `ROUTES` 数组进。
// 入口不同，**真相只有这一处**（不在 doc 里另列一份表：两份清单必然腐烂）。
//
// ## 检测器认哪些形态（**形态匹配**，不是语义分析）
//
// 首版只覆盖交涉效果那一族，认的形态是"取契约钩子再按分支落地"的取值行：
//
// const hook = window.Sg?.story?.socialHooks?.()?.[…]…;
//
// 该行的**同名正则**在 `FORM_PATTERNS` 里（判据件与人都用它），配上"紧跟分支"的判读。认哪些形态写死在这里，
// 认不出的形态**不算覆盖**（列在 `UNCOVERED` 里，带来源与为什么首版不做）。
//
// ## 反向核数（人工维护）
//
// 判据件钉住"主干上检测到的现场数"（当前 5）。**新增现场必须同片更新这个数**（写在 doc 的出生规则里）；
// 不更新则判据件红。这条是防"检测器抽不到东西、覆盖格空转假绿"。

/** 检测形态（写死；判据件按它抽现场）。 */
export const FORM_PATTERNS = [
	{
		id: 'social-hook-assign',
		what: '取契约钩子的取值行（`const X = …socialHooks?.()…`，非注释行）',
		re: /(const|let|var)\s+[\w$]+\s*=.*socialHooks\?\.\(\)/,
	},
];

/** 登记面：每条一条行为，路线按优先级排列。 */
export const ROUTES = [
	{
		id: 'ask-has-effect',
		behavior: '该诉求有没有效果（门与测试问引擎的入口）',
		locus: { file: 'src/engine/40-sim/32-social.twee', method: 'askHasEffect' },
		routes: [
			{ priority: 1, form: '契约钩子 `socialHooks()[id].apply`', judge: '`typeof hook === "function"`' },
			{ priority: 2, form: '故事侧旧函数 `a.apply`', judge: '`typeof a.apply === "function"`' },
			{ priority: 3, form: '声明式 `yields`／`gives`／`sets`', judge: '三字段任一带值' },
		],
		fallback: '三条都不命中即判"没有效果"（调用方据此跳过落地）',
		exitCondition: '故事侧 `apply` 全为声明式或钩子之后，第 2 级自然退掉',
		ticket: '#785',
	},
	{
		id: 'ask-has-condition',
		behavior: '某诉求的某个条件字段（愿意／回绝／已办）是否有声明',
		locus: { file: 'src/engine/40-sim/32-social.twee', method: 'askHasCondition' },
		routes: [
			{ priority: 1, form: '数据声明 `a[field] != null`', judge: '字段带值' },
			{ priority: 2, form: '契约钩子 `socialHooks()[id][field]`', judge: '字段带值' },
		],
		fallback: '两处都没有即判"没有声明"（门据此判该诉求缺少哪一侧）',
		exitCondition: '条件全部搬进契约钩子之后，第 1 级自然退掉',
		ticket: '#785',
	},
	{
		id: 'apply-ask-effect',
		behavior: '诉求落地时把效果真正施加到角色身上',
		locus: { file: 'src/engine/40-sim/32-social.twee', method: 'applyAskEffect' },
		routes: [
			{ priority: 1, form: '契约钩子 `socialHooks()[id].apply`', judge: '`typeof hook === "function"`，命中即返回' },
			{ priority: 2, form: '故事侧旧函数 `a.apply`', judge: '`typeof a.apply === "function"`，命中即返回' },
			{ priority: 3, form: '声明式 `applyYields`／`applyGrants`／`applySets`', judge: '三条依次调用（与规则行同一套实现）' },
		],
		fallback: '声明式那三级对不带值的字段是空操作（不报错）',
		exitCondition: '故事侧 `apply` 全为声明式或钩子之后，第 2 级自然退掉',
		ticket: '#785',
	},
	{
		id: 'ask-done',
		behavior: '这一件诉求有没有"已办"的结果（供渲染层问）',
		locus: { file: 'src/engine/40-sim/32-social.twee', method: 'askDone' },
		routes: [
			{ priority: 1, form: '契约钩子 `socialHooks()[id].done`', judge: '命中即用（`condHolds`）' },
			{ priority: 2, form: '数据声明 `a.done`', judge: '命中即用（`condHolds`）' },
		],
		fallback: '两处都没有时按 `condHolds(null)` 的语义（字段缺席）判',
		exitCondition: '`done` 全部搬进契约钩子之后，第 2 级自然退掉',
		ticket: '#785',
	},
	{
		id: 'ask-verdict',
		behavior: '定档：愿意（不掷骰）／回绝（不掷骰）／其余掷骰',
		locus: { file: 'src/engine/40-sim/32-social.twee', method: 'verdict' },
		routes: [
			{ priority: 1, form: '契约钩子 `socialHooks()[id]` 的 `unwilling`／`willing`', judge: '`hook.field ?? a.field`，钩子优先' },
			{ priority: 2, form: '数据声明 `a.unwilling`／`a.willing`', judge: '带值且 `condHolds` 成立' },
		],
		fallback: '两处都不成立即 `roll`（掷骰定档）',
		exitCondition: '定档字段全部搬进契约钩子之后，第 2 级自然退掉',
		ticket: '#785',
	},
];

/** 未覆盖清单（**带来源**：哪次勘察发现的、为什么首版不做）。 */
export const UNCOVERED = [
	{
		what: '条件侧与效果侧之外的契约面级联（例如 story 契约里 `notesFace`／`chargen` 一族的取值回退）',
		foundBy: '`#1189` 首版勘察（2026-09-22）：按 `socialHooks?.()` 形态在 `src/**` 扫的时候只覆盖了交涉族',
		whyNotV1: '不是同一族形态，检测器认不出；要覆盖得先为那一族写形态，另片做',
	},
	{
		what: '`Sg.rules` 一族里"契约项与默认值"的回退（例如 `flipItem` 缺席时的默认）',
		foundBy: '`#1184` 流三归类时见到（能力开关与缺省值两类）',
		whyNotV1: '属于"缺省值"而不是"多路线实现"，口径不同（缺省值那面由 `#1188` 续片处理）',
	},
];

/**
 * 纯函数：从 `{ 路径: 全文}` 里抽出这一族的现场（返回按文件与行号排序的清单）。
 * 只认 `FORM_PATTERNS` 里的形态；认不出的不返回（不假装覆盖）。
 */
export const detectSites = (sources = {}) => {
	const out = [];
	for (const [file, text] of Object.entries(sources ?? {})) {
		const lines = String(text ?? '').split('\n');
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line.trim().startsWith('//')) continue;
			for (const p of FORM_PATTERNS) {
				if (p.re.test(line)) out.push({ file, line: i + 1, form: p.id });
			}
		}
	}
	return out.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));
};
