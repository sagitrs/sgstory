// 车道 D · `--settle` 页内接线（`#215` 报备 `18504699`）：**落点文案（`--settle`）**那一面的显示层
// —— 只做"取输入 → 调内核 → 交给 DOM"，**不含判定**。
//
// 判据**复用** `editor/lib/core/settleRows.mjs`（页内不重写）—— 与 CLI 的 `--settle` 门**同一份**：
// 门侧证据 ＝ `stories/hollow-cave/gates/settle.mjs`（`settleProblems(src, p)`，`src` 取自 `ctx.passageSrc`）；
// 页侧输入 ＝ `pkg.passages = [{ name, text, file}]`（车道 E · A 片）——
// `text` ＝ **去注释源文**，与 `scripts/audit/context.mjs` 的 `passageSrc` **同口径**（→ 同一份判据吃同一口径的输入）。
//
//注意：**适用面写清**（㉑／㉕）：
// · **判据本身整门都能跑**（与 `--reads` 不同 —— 那门的 ②③ 要引擎侧索引 ＋ 宿主 io，页内拿不到）；
// 本门要的只是**段落源文本** → A 片之后**页内拿得到**。
// · 但**判的面不是全集**：页内判的是**用户选中的那些文件**里的段落；CLI 判的是**该故事清单声明的文件**
//（＋引擎件）→ 两者**同判据、同口径**，**面可能不同**（读数里如实写"本次判了几件／几段"）。
// · 机制面（`src/**`）的段落**不在页内** —— 用户选的是**故事目录**（不假装覆盖）。
//
//注意：**覆盖率那条 `已接线` 是模块身份级代理**（`scripts/report-page-coverage.mjs` 件头自己声明的"必要不充分"）：
// 它只证"**门用的判据模块，页内也 import 了**" → **不等于**"整门都在页内跑"。本件把这条边界也写进读数。
//
// **缺 vs 畸形**（照 `core/diagnose.mjs`／`read-faces-view.mjs` 既有口径）：
// · **缺**段落源（没选到 `*.twee`，或调用方直接喂 `io` → `sourcesAvailable:false`）→ **本件不适用**、**不抛**；
// · **畸形**（在册但 `passages` 不是数组）→ **讲人话地抛**。
//
// **浏览器安全**：零宿主（不碰 fs／进程／时钟 —— 时延由**调用方**测，本件不自带计时）。

import { settleProblems } from '../lib/core/settleRows.mjs';
import { fingerprintOf } from '../lib/core/fingerprint.mjs';

const PLACEHOLDER = '（落点文案诊断：未载入 ✓）';

/**「本包没有段落源 → 本件不适用」那两行 —— 明写"不适用"，免得被读成"跑过了、没问题"。 */
export const SETTLE_NOT_APPLICABLE_LINES = [
	'落点文案（`--settle` 面 ✓）：**本包没有段落源** ⇒ 本件不适用 ✓（**不是**"落点文案都齐" ✗）',
	'[info] applicable · 落点文案（`--settle` 面）：本件不适用 ✓ —— 选故事**目录**即带上 `*.twee`（那一步在 CLI ✓）',
];

/** 清空那一格（照 `#946` 同族：换包/失败时**旧读数必须消失**）。 */
export const clearSettle = ({ doc, containerId = 'settle' } = {}) => {
	const el = doc?.getElementById?.(containerId);
	if (el) el.textContent = PLACEHOLDER;
};

/** 两侧**同判**的那一步（纯函数：与门里 `run()` 用的是**同一个** `settleProblems`，本件不另写判据）。
 * 返回 `{ problems, passages, files, sha}` —— `problems` 已按 `site` 排好（可复现）。 */
export const settleFaceOf = (passages = [], { name = 'settle' } = {}) => {
	const problems = [];
	for (const p of passages) {
		for (const prob of settleProblems(p.text, p.name)) problems.push(prob);
	}
	problems.sort((a, b) => (a.site < b.site ? -1 : a.site > b.site ? 1 : 0));
	const files = [...new Set(passages.map((p) => p.file))].sort();
	return { problems, passages, files, sha: fingerprintOf({ name, problems: problems.map((p) => [p.site, p.snippet]) }) };
};

/** 读数 → 逐行（**纯函数**：只把 core 的结论变成人读的行，不判定，不重排文案）。 */
export const settleLines = ({ problems = [], passages = [], files = [], sha = null, inputSha = null } = {}) => {
	const L = [];
	L.push(`落点文案（\`--settle\` 面 ✓ · 页内跑的是**与 CLI 同一份判据** ✓）：本次判 **${files.length} 件 · ${passages.length} 段** ｜ 所判输入指纹 ${inputSha ?? '(未报 ✗)'}`);
	L.push(`  结论指纹 ${sha ?? '(未报 ✗)'} —— 与 CLI 侧同判时应当相等 ✓`);
	L.push(`  有副作用却**没落点文案**的分支：${problems.length} 处${problems.length ? '' : ' ✓'}`);
	for (const p of problems) {
		L.push(`      · 「${p.site}」${p.why}`);
		L.push(`          片段：${p.snippet}`);
	}
	L.push('[info] applicable · 落点文案（`--settle` 面）：本件**整门都在页内跑** ✓（判据只要段落源 ✓ —— 与 `--reads` 的 ②③ 不同 ✗，那两个要引擎侧索引 ＋ 宿主 io ✗）。');
	L.push('  ⚠️ **判的面**：页内判**用户选中的文件** ✓；CLI 判**该故事清单声明的文件**（＋引擎件 ✓）⇒ **同判据、同口径，面可能不同** ✗（看上面"本次判了几件／几段"✓）。');
	L.push('  ⚠️ **机制面（`src/**`）的段落不在页内** ✗：用户选的是**故事目录** ⇒ 引擎那几个 twee 不在取件面内 ✓（不假装覆盖 ✗）。');
	L.push('  ⚠️ **注释已挖空** ✓（`/% … %/` ✓，与 `context.mjs` 的 `passageSrc` 同口径 ✓）：注释里举例的写法**不算**（免得假红 ✗）。');
	L.push('⚠️ 本格由**模块身份级代理**判为"已接线" ✗（`report-page-coverage.mjs`：必要不充分 ✓）—— 它证的是"门用的判据页内也 import 了"✗，**不是**"整门都在页内跑"✗（本门恰好真在页内跑 ✓，但那是**跑出来**的 ✓，不是代理证出来的 ✗）。');
	return L;
};

/** 把落点文案读数渲染进 `#settle`；返回 `{ applicable, passages, files, problems, sha, inputSha}`（**显示与判定同源**）。
 *注意：**入口先清**（`#946` 同族）：任何一条守卫抛之前，那一格已经清过 → 抛了也不留上次的读数。 */
export const renderSettle = ({ doc, pkg, containerId = 'settle' } = {}) => {
	const el = doc?.getElementById?.(containerId);
	if (!el) throw new Error(`落点文案诊断：容器「#${containerId}」不存在 ✗（读数不该静默不显示 ✓）`);
	clearSettle({ doc, containerId });
	const passages = pkg?.passages;
	if (passages === undefined || passages === null || (Array.isArray(passages) && passages.length === 0)) {   // 缺 → 合法（不抛）
		el.textContent = SETTLE_NOT_APPLICABLE_LINES.join('\n');
		return { applicable: false, passages: null, files: [], problems: null, sha: null, inputSha: null };
	}
	if (!Array.isArray(passages)) {                       // 畸形 → 必须报
		throw new Error('落点文案诊断：包里的 `passages` 在，但不是数组 ✗（畸形必须报 ✗ —— 静默成 0 处会被读成"落点文案都齐"✓）');
	}
	const inputSha = fingerprintOf(passages.map((p) => [p.file, p.name, p.text]));
	const face = settleFaceOf(passages);
	const lines = settleLines({ ...face, inputSha });
	el.textContent = lines.join('\n');
	return { applicable: true, ...face, inputSha };
};
