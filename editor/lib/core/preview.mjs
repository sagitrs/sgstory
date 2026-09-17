// 渲染文本的**唯一取处**（`#761` P1 第六片 A 段）✓ —— 宿主无关：它只**接收**一个 window ✓。
//
// 为什么它必须是一处（可复核席的"同一条路"口径 §17 ✓）：
//   引擎在**多个宿主**里跑（真实浏览器 ✓／测试里的 jsdom ✓）⇒ **渲染只有一处 · 宿主可以有多个** ✓
//   ⇒ 于是"页面侧预览"与"Node 侧读数"能比**字节** ✓，而不是比"两套取法各自的结果" ✗。
//
// ⚠️ **`win` 必填、且件内不许兜默认** ✗（复核席硬加项(i) 的形状化 ✓）：
//   `window` 就是**状态**的所在 ✓ ⇒ 把"状态来源"钉在**调用点** ✓，并在**构造上**堵掉
//   "两侧各自兜默认 ⇒ 都空/都默认 ⇒ 假同" ✗（那正是我们今天拔掉多次的那族 ✓）。

/** 取渲染出的段落（**DOM 侧** ✓ —— 与 `State` 的同步由调用方 `settle` 负责 ✓，本件不猜 ✗）。 */
export const renderedPassages = (win) => {
	if (!win || !win.document) throw new Error('renderedPassages 要一个已经 boot 的 window（**状态就在它里面** ✓）—— 不许省略、也不许件内兜默认 ✗');
	return [...win.document.querySelectorAll('#passages .passage')].map((e) => e.dataset?.passage ?? '');
};

/** 取当前渲染文本 ✓：给了 `passage` 就只要那一段 ✓，否则按 DOM 顺序拼 ✓。
 *  返回**纯文本** ✓（不含标签 ✓）⇒ 于是"逐字节同"比的是**玩家会看到的字** ✓。 */
export const renderedTextOf = (win, { passage = null } = {}) => {
	if (!win || !win.document) throw new Error('renderedTextOf 要一个已经 boot 的 window（**状态就在它里面** ✓）—— 不许省略、也不许件内兜默认 ✗');
	const els = [...win.document.querySelectorAll('#passages .passage')];
	const pick = passage ? els.filter((e) => (e.dataset?.passage ?? '') === passage) : els;
	return pick.map((e) => e.textContent ?? '').join('\n');
};

/** 落点自检（**纯** ✓）：给定名字必须在**已渲染**的段落里 ✓ —— 供"预览该出现而没出现"这类红**讲人话** ✓。 */
export const assertRendered = (win, passage) => {
	const names = renderedPassages(win);
	if (!names.includes(passage)) throw new Error(`预览取不到段落 \`${passage}\` ✗：当前渲染的是 ${names.join('、') || '（空）'}`);
	return renderedTextOf(win, { passage });
};
