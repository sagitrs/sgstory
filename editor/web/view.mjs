// WebUI（`#761` P1 第六片 B 段）：**预览的页面侧视图** ✓ —— 薄 sink，判定与取文本都在内核 ✓。
//
// 裁定 (b) 的后半 ✓：**页面与 Node 侧用同一份引擎 ＋ 同一份包 ＋ 同一份钉住的状态** ✓ ⇒
//   于是"**页面侧 vs Node 侧逐字节同**"这条读数**按构造成立** ✓（§17："渲染只有一处 · 宿主可以有多个" ✓）。
//
// 三条"不许"（沿用 `#861` 的口径 ✓）：
//  ① **不许自己取文本** ✗ —— 取文本只有一处（`lib/core/preview.mjs` ✓）；
//  ② **不许自己渲染** ✗ —— 渲染是引擎的事（本件只把**已经渲染好的文本**搬进 DOM ✓）；
//  ③ **不许新造状态源** ✗ —— 状态由调用方**显式**给（`win`／`passage` 必填 ✓）。

import { renderedTextOf, renderedPassages, assertRendered } from '../lib/core/preview.mjs';

/** 把引擎**已经渲染好的**文本放进页面元素 ✓（纯搬运 ✓ —— 本件不产生任何文本 ✓）。
 *  ⚠️ `win` 与 `passage` **都必填** ✓（状态与目标都钉在调用点 ✓；缺了就抛，不许兜默认 ✗）。 */
export const paintPreview = ({ doc, win, passage, selector = '#preview' } = {}) => {
	if (!doc || !win) throw new Error('paintPreview 要 doc 与 win（**状态在 win 里** ✓）—— 不许省略、也不许兜默认 ✗');
	const text = assertRendered(win, passage);          // ← 唯一的取文本处 ✓（取不到 ⇒ 讲人话地抛 ✓）
	const el = doc.querySelector(selector);
	if (!el) throw new Error(`页面上没有目标元素 \`${selector}\` ✗（预览不该静默消失 ✓）`);
	el.textContent = text;
	return text;
};

/** 页面侧的"当前预览" ✓（读回来的就是**页面上实际显示的那串** ✓ —— 供对拍 ✓）。 */
export const shownPreview = ({ doc, selector = '#preview' } = {}) => {
	const el = doc?.querySelector?.(selector);
	if (!el) throw new Error(`页面上没有目标元素 \`${selector}\` ✗`);
	return el.textContent ?? '';
};

/** 页面侧的一行状态（供 UI 提示 ✓；**不参与判定** ✗）。 */
export const previewHint = (win) => {
	const names = renderedPassages(win);
	return names.length ? `当前渲染：${names.join('、')}` : '（引擎还没渲染出段落 ✗）';
};

export { renderedTextOf };
