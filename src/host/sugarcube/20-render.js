/* L0 宿主适配 · **RenderPort 实现**（`sgstory#1912` 交付 1 · 步 2）
 *
 * 契约见 `src/core/ports/index.js`。职责：把「一行输出去哪」收成一处 —— 内核（含 `01-perform.js`／
 * `71-notice.js`）今后只经 `RPG.portOf('render')`，✗ 各自直写 DOM。
 *
 * ## 宿主真面（按码读到的）
 *   · `71-notice.js` 的既有形是「`jQuery(document).on('click', '.rpg-notice-toggle', …)`，且**头部先判**
 *     `typeof document === 'undefined' || typeof jQuery === 'undefined'`」⇒ 无头环境**不炸**（本档照此形）。
 *   · 逐行输出内核已有 `RPG.perform(text)`（`01-perform.js` 在 `:passagedisplay` 冲刷缓冲）⇒
 *     本端口**包**它，✗ 另造一条输出路（否则两会话／两路输出会分叉）。
 *   · 收集器（`setCollector`）是**无头可跑**的前提：注入后所有输出进收集器，✗ 落屏。
 */
(() => {
	const 有jQuery = () => typeof jQuery !== 'undefined' && typeof document !== 'undefined';

	/** 输出收集器（注入后生效；`null` ⇒ 回真宿主）。 */
	let 收集器 = null;

	/** 真宿主落地：内核既有 `perform` 已把「缓冲＋段落显示后冲刷」都办了 ⇒ 复用它。 */
	const 落屏 = (text) => {
		if (typeof RPG.perform === 'function') { RPG.perform(String(text)); return; }
		if (有jQuery()) { jQuery('#passages').append(String(text)); return; }
		/* 两头都没有 ⇒ 具名抛错（✗ 静默丢弃 —— 「输出丢了」与「没输出」必须不同形）。 */
		throw new Error('RenderPort：既无收集器也无宿主输出面（测试请先 setCollector）');
	};

	RPG.defPort('render', {
		/** 输出一条（正文／通知的分派在此）。 */
		output(text, { channel, level } = {}) {
			if (收集器) { 收集器({ kind: 'output', text: String(text), channel, level }); return; }
			/* 通知通道交给内核既有的通知面（它自己负责过滤与面板），✗ 本档重写那套规则。 */
			if (channel != null && typeof RPG.pushNotice === 'function') { RPG.pushNotice(String(text), { channel }); return; }
			落屏(text);
		},

		/** 场景／面板级渲染（与逐行 `output` 分列）。 */
		render(node) {
			if (收集器) { 收集器({ kind: 'render', node }); return; }
			if (typeof node === 'string') { 落屏(node); return; }
			if (有jQuery() && node?.nodeType) { jQuery('#passages').append(node); return; }
			throw new Error('RenderPort.render：既无收集器也无宿主渲染面');
		},

		/** 注入输出收集器（无头／测试用）；`null` ⇒ 恢复真宿主。 */
		setCollector(fn) {
			if (fn != null && typeof fn !== 'function') throw new Error('RenderPort.setCollector 需要函数或 null');
			收集器 = fn ?? null;
		},
	});
})();
