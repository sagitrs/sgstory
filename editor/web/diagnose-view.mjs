// P2 第三片（`#761`）：诊断的**显示层** ✓ —— **只显示，不判定** ✗
//
// ⚠️ 照复核席预注册 (vi) ✓：判定**复用** `editor/lib/core/diagnose.mjs` ✓（**本件不作任何判定** ✗）；
//   本件只做一件事 ✓：把 findings ＋ 声明面 ＋ 跳过面 **变成给人看的行** ✓。
// 三条"不许" ✓（沿用 `#861` 的口径）：① 不自己算 findings ✗ ② 不新写判定 ✗ ③ 不新造 schema ✗。

import { formatFinding, summarize } from '../lib/core/diagnose.mjs';

/** findings ⇒ 逐条一行 ✓（**逐字**来自 `formatFinding` ✓ —— 显示层不重排文案 ✗）。 */
export const findingLines = (findings = []) => findings.map((f) => formatFinding(f));

/** **声明面** ⇒ 一行 ✓（复核席 (ii) ✓：人能逐项核 ✓，不是一句"已注入相关事实" ✗）。 */
export const declaredLine = (declared = null) => (declared
	? `输入面（声明 ✓）：${declared.join(' ＋ ')}`
	: '输入面（声明 ✓）：(未声明 ✗ —— 那就别报 sha ✗)');

/** **跳过面逐面一行 `info`** ✓（复核席 (v) ✓：不是"部分检查已跳过" ✗）。
 *  ⚠️ 复核席 ④ ✓：**"这一步在 CLI"不许写死** ✗ —— 若那一步 CLI 里也没有 ⇒ 这行就**在说谎** ✗（＝读数指错对象 ✓）。
 *  ⇒ 让调用方**声明** `cliHas`：`true` ⇒ "这一步在 CLI ✓"／`false` ⇒ "**两侧都没有 ⇒ 归票** ✓"／未给 ⇒ **只说"本件不适用"** ✓（不替别人打包票 ✓）。 */
export const skippedLines = (skipped = []) => skipped.map((s) => {
	const face = typeof s === 'string' ? s : s.face;
	const cliHas = typeof s === 'string' ? null : (s.cliHas ?? null);
	const tail = cliHas === true ? '（这一步在 CLI ✓）' : cliHas === false ? '（**两侧都没有 ⇒ 归票** ✓）' : '';
	return `[info] applicable · ${face}：本件不适用 ✓${tail}`;
});

/** 两值指纹 ⇒ 两行 ✓（复核席 (i)(ii) ✓：`packageSha` 必须相等 ✓／`injectedSha` 允许不等但要与声明面一致 ✓）。 */
export const shaLines = ({ packageSha = null, injectedSha = null } = {}) => [
	`输入指纹 · packageSha = ${packageSha ?? '(未报 ✗)'}`,
	`输入指纹 · injectedSha = ${injectedSha ?? '(未报 ✗)'}`,
];

/** 一次编辑后的**完整显示块** ✓（顺序固定 ⇒ **不依赖外部顺序** ✓，照 ④ ✓）。 */
export const diagnoseLines = ({ findings = [], declared = null, skipped = [], packageSha = null, injectedSha = null } = {}) => [
	summarize(findings),
	declaredLine(declared),
	...shaLines({ packageSha, injectedSha }),
	...findingLines(findings),
	...skippedLines(skipped),
];

/** **DOM 适配器** ✓（3 行 ✓）：把上面那批行**写进页面** ✓ —— 页内只这一处碰 DOM ✓（判定与文案都不在这里 ✓）。 */
export const renderDiagnosis = ({ doc, containerId = 'out', lines = [] } = {}) => {
	const el = doc.getElementById(containerId);
	if (!el) throw new Error(`诊断容器 \`#${containerId}\` 不存在 ✗（不许静默丢弃诊断 ✓）`);
	el.textContent = lines.join('\n');
	return lines.length;
};
