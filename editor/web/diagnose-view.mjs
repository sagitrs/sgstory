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

/** **跳过面逐面一行 `info`** ✓（复核席 (v) ✓：不是"部分检查已跳过" ✗）。 */
export const skippedLines = (skipped = []) => skipped.map((s) => `[info] applicable · ${s}：本件不适用 ✓（这一步在 CLI ✓）`);

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
