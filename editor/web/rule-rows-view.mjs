// 车道 E-B2（`#215` 报备 `18502613`）：**规则行**那一面的显示层 ✓ —— 只做"取输入 ⇒ 调内核 ⇒ 交给 DOM" ✗，不含判定 ✓。
//
// 判据**复用** `editor/lib/core/ruleRows.mjs` ✓（页内不重写 ✗）—— 与 CLI 的 `--rules` 门**同一份**：
//   门侧 import 证据 ＝ `stories/mist-forest/gates/rules.mjs`（`import { opRows, rowMatches, deadRows, prereqProblems, ties, norm }` ✓）。
//
// ⚠️ **适用面写清**（车道 E 判据 ② ✓）：本件只跑**已上移 core** 的四步 ——
//   ① 死规则 `deadRows()` ✓　② `prereq` 形状 `prereqProblems()` ✓　③ 并列 prio `ties()` ✓　④ 含算子行的**点名** `opRows()` ✓；
//   **不跑**门内那几步 ✗（`text` 写侧判据 ／ `scope` 机检 ／ `prefixes|ops|terms|effects` 声明面 ／ `yields` 路径 ／ 段落存在性 ✗）——
//   理由：那几步的**输入**是故事门上下文（`Sg.rules.*`／`ctx.Game.*`／段落表 ✓），**未上移 core** ✗
//   ⇒ 页内**拿不到同一份输入** ✗；硬在页内重写＝造**第二份判据**（K6 要防的正是这个 ✗）。
//   ⇒ 读数里写的是"**上面四步** 0 条"✗，**不是**"这张表没问题"✗（如实写在读数里 ✓，不只写在票面 ✓ 照 ㉑／㉕）。
//
// **缺 vs 畸形** ✓（照 `core/diagnose.mjs` 既有口径 ✓ ＋ 发起者 2026-09-18 15:05 裁定的「缺 ⇒ 合法」✓）：
//   · **缺** `rules.json`（`hollow-cave`／`minimal-demo` 本来就没有 ✓）⇒ **本件不适用** ✗、**不抛** ✗、
//     更**不写成"0 条 ⇒ 表没问题"** ✗ —— 抛会把**合法状态**说成坏 ✓；
//   · **畸形**（在册但 `rows` 不是数组 ✓）⇒ **讲人话地抛** ✓（`#949` 同口径 ✓）。
//
// **浏览器安全** ✓：零宿主 ✓（不碰 fs／进程／时钟 ✓ —— `core/**` 老规矩 ＋ 本层沿用 ✓）。

import { deadRows, prereqProblems, ties, opRows } from '../lib/core/ruleRows.mjs';
import { fingerprintOf } from '../lib/core/fingerprint.mjs';

const PLACEHOLDER = '（规则行诊断：未载入 ✓）';

/** 「本包没有规则数据面」那两行 ✓ —— 明写"不适用"✗，免得被读成"跑过了、没问题"✗。 */
export const NOT_APPLICABLE_LINES = [
	'规则行（`--rules` 面 ✓）：本包**没有 `rules.json` 数据面** ⇒ **本件不适用** ✓（**不是**"表没问题" ✗）',
	'[info] applicable · 规则行（`--rules` 面）：本件不适用 ✓（这一步在 CLI ✓）',
];

/** 清空那一格 ✓（照 `#946` 同族：换包/失败时**旧读数必须消失** ✗ —— 否则读的人会把上次的当这次 ✓）。 */
export const clearRuleRows = ({ doc, containerId = 'rulediag' } = {}) => {
	const el = doc?.getElementById?.(containerId);
	if (el) el.textContent = PLACEHOLDER;
};

/** 四步判据 ⇒ 结构化读数 ✓（**纯** ✓ —— 判定全在 core ✓，本件只**取**它们的返回值 ✓）。 */
export const ruleRowFacts = ({ rows = [] } = {}) => ({
	dead: deadRows(rows),
	prereq: prereqProblems(rows),
	ties: ties(rows),
	ops: opRows(rows),
});

/** 读数 ⇒ 逐行 ✓（**纯函数** ✓：只把 core 的结论变成人读的行 ✗，不判定 ✓，不重排文案 ✗）。 */
export const ruleRowsLines = ({ rows = [], rowsSha = null, facts = null } = {}) => {
	const f = facts ?? ruleRowFacts({ rows });
	const L = [];
	L.push(`规则行（\`--rules\` 面 ✓ · 页内跑的是**已上移 core 的四步** ✓）：输入 rows ${rows.length} 行 · 输入指纹 ${rowsSha ?? '(未报 ✗)'}`);
	L.push(`  死规则：${f.dead.length} 条${f.dead.length ? ` ⇒ ${f.dead.map((d) => `「${d.id}」永不被选中（被「${d.killedBy}」完全覆盖）`).join(' · ')}` : ' ✓'}`);
	L.push(`  \`prereq\` 形状：${f.prereq.length} 条${f.prereq.length ? ` ⇒ ${f.prereq.join(' · ')}` : ' ✓'}`);
	L.push(`  并列 prio（**只报** ✗ —— 裁决＝表序最前 ✓）：${f.ties.length} 组${f.ties.length ? ` ⇒ ${f.ties.map((g) => `${g.scope}@${g.prio}：${g.ids.join('／')}`).join(' · ')}` : ' ✓'}`);
	L.push(`  含对象算子的行（死规则分析**保守跳过** ✗ —— 跳过要点名，不许静默 ✓）：${f.ops.length} 条${f.ops.length ? ` ⇒ ${f.ops.join('／')}` : ''}`);
	L.push('[info] applicable · 页内**不跑**：`text` 写侧 ／ `scope` 机检 ／ `prefixes|ops|terms|effects` 声明面 ／ `yields` 路径 ／ 段落存在性：本件不适用 ✓（这一步在 CLI ✓）');
	L.push('⚠️ 上面四步 `0 条` **不等于**这张表没问题 ✗ —— 未跑的那几步只在 CLI（`node scripts/audit.mjs --rules --check` ✓）。');
	return L;
};

/** 把规则行读数渲染进 `#rulediag` ✓；返回 `{ applicable, rows, rowsSha, facts }`（**显示与判定同源** ✓ —— 供读数断言 ✓）。
 *  ⚠️ **入口先清** ✗（`#946` 同族）：任何一条守卫抛之前，那一格已经清过 ✓ ⇒ 抛了也不留上次的读数 ✓。 */
export const renderRuleRows = ({ doc, pkg, containerId = 'rulediag' } = {}) => {
	const el = doc?.getElementById?.(containerId);
	if (!el) throw new Error(`规则行诊断：容器「#${containerId}」不存在 ✗（读数不该静默不显示 ✓）`);
	clearRuleRows({ doc, containerId });
	const rules = pkg?.data?.['rules.json'];
	if (rules === undefined || rules === null) {          // 缺 ⇒ 合法 ✓（不抛 ✗）
		el.textContent = NOT_APPLICABLE_LINES.join('\n');
		return { applicable: false, rows: null, rowsSha: null, facts: null };
	}
	if (!Array.isArray(rules.rows)) {                     // 畸形 ⇒ 必须报 ✓
		throw new Error('规则行诊断：包里的「rules.json」在，但 `rows` 不是数组 ✗（畸形必须报 ✗ —— 静默成 0 条会被读成"表没问题"✓）');
	}
	const rows = rules.rows;
	const rowsSha = fingerprintOf(rows);
	const facts = ruleRowFacts({ rows });
	el.textContent = ruleRowsLines({ rows, rowsSha, facts }).join('\n');
	return { applicable: true, rows, rowsSha, facts };
};
