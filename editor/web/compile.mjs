// WebUI（`#761` P1 第二片）：**页内编译** —— 用内核把"故事包"编成 twee ✓。
//
// 为什么这一片重要 ✓：P1 的出口判据是「**UI 改一个事件 ⇒ 预览正确 ＋ CLI 结论一致**」✓，而"一致"
//   最硬的形式就是**逐字节相同** ✓ —— 本件调的是**同一个内核**（`lib/core/emit.mjs` 的 `compileStory` ✓，
//   与命令体 `compile-story` 调的是**同一处** ✓）⇒ 一致性**按构造成立** ✓（不是"两份实现碰巧一样" ✗）。
//
// 浏览器安全 ✓：本件零宿主 ✓（`compileStory` 是 core 的纯函数 ✓）。**不含**判定逻辑 ✗ ——
//   "编得对不对"由**对拍**回答（见 `test/web-compile.mjs` ✓），不在这里自己判 ✓。

import { compileStory } from '../lib/core/emit.mjs';

/** 包（`loadPackage` 的产物 ✓）⇒ 生成物文本映射（键＝包内 twee 文件名 ✓）。
 *  ⚠️ 入参只取 `data` ✓ —— 生成的**唯一真源**是 `data/*.json` ✓（设计稿 §3 ✓）；
 *  故这里**不**读任何手写 twee ✗（那会把"产物"当输入 ⇒ 循环 ✓）。 */
export const compileInPage = ({ slug, data } = {}) => {
	const pick = (name) => data?.[name] ?? null;
	const files = compileStory({
		tables: pick('tables.json'),
		contract: pick('contract.json'),
		rules: pick('rules.json'),
		slug,
	});
	const names = Object.keys(files).sort();
	return { slug, files, names, bytes: names.reduce((n, k) => n + files[k].length, 0) };
};

/** 供显示的一行摘要（**纯** ✓ ⇒ 可单测 ✓）。 */
export const compileSummary = (out) => [
	`编出产物：${out.names.length} 件 · 共 ${out.bytes} 字节`,
	...out.names.map((k) => `  · ${k}（${out.files[k].length} 字节）`),
];

/** 该编却**一件都没编出来** ⇒ 必须响亮报错 ✗（"没编出东西"不许当"无需编译" ✓ —— 空读数是本仓最贵的一类 ✓）。 */
export const assertCompiled = (out) => {
	if (!out.names.length) throw new Error(`编不出任何产物 ✗：${out.slug} 的 data/ 里没有可编的源（空产物不许当通过 ✗）`);
	return out;
};
