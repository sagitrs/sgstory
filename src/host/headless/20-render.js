/* L0 宿主适配 · **RenderPort 实现（内存）** —— `sgstory#1998`
 *
 * 契约在 `src/core/ports/index.js`。本实现把输出收进**本宿主的**缓冲／收集器：
 *   · 设了收集器 ⇒ 逐件交给它（无头装置／判据用）；
 *   · 未设 ⇒ 落本宿主的缓冲（`lines()` 读，✗ 抛 —— 「没接收集器」在这里**不是错**，
 *     因为 headless 本来就该自己兜着；⚠ 与 SugarCube 宿主不同：那边两头都缺 ⇒ 具名抛）。
 */
(() => {
	const 缓冲 = [];
	let 收集器 = null;
	const 出门 = (件) => { if (收集器) { 收集器(件); return; } 缓冲.push(件); };

	RPG.defPort('render', {
		/** 逐行输出（正文／通知的分派在此）。 */
		output(text, { channel, level } = {}) {
			出门({ kind: 'output', text: String(text), channel, level });
		},

		/** 场景／面板级渲染（与逐行 `output` 分列）。 */
		render(node) { 出门({ kind: 'render', node }); },

		/** 注入输出收集器；`null` ⇒ 恢复本宿主的缓冲。 */
		setCollector(fn) {
			if (fn != null && typeof fn !== 'function') throw new Error('RenderPort.setCollector 需要函数或 null');
			收集器 = fn ?? null;
		},

		/* ---- 读数面（✗ 在契约里）---- */
		/** 缓冲里的件（浅拷贝）。 */
		lines: () => 缓冲.slice(),
		/** 只取逐行输出（判据最常用的读数）。 */
		texts: () => 缓冲.filter((x) => x.kind === 'output').map((x) => x.text),
		/** 清缓冲（装置逐格复位用；✗ 动收集器 —— 那是订阅，同 `framework/host.js` 的取舍）。 */
		clear: () => { 缓冲.length = 0; },
	}, { host: HEADLESS.id });
})();
