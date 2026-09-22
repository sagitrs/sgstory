// `#1093` P2-d：**"写之前先建父目录"** 的**共用助手**（复核席要求）。
//
// ## 为什么必须抽（同一教训今晚已在**三处**出现）
// ```
// `scripts/probe-gates.mjs:295`／`scripts/report-polarity-gap.mjs:136`（既有先例）
// `scripts/run-tests.mjs` 的仪表落点（`#1103`）／②层落点（`#1127` 复核阻断②）
// → → **规矩写在各处注释里 → 第四处照样漏**（今天就是第四处·被复核席抓到）
// ```
// → 抽成一个**可 grep 的名字**：**新落点一律走它** —— 而"没人绕过助手"由**一格判据**守
//（＝把规矩从**注释面**移到**判据面** —— 与 `probe-budget`／`UNDECLARED_INPUTS_BASELINE` 同族）
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** 确保 `file` 的**父目录**存在（幂等 可重入 并发安全）。**写任何文件前都该走它**。 */
export const ensureParent = (file) => {
	const dir = dirname(String(file));
	if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
	return dir;
};

export default ensureParent;
