/* L0 宿主适配 · **布局壳**（`sgstory#1763` 第 2 件 · 与 `40-pace.js` 同形）
 *
 * 本包是全仓**唯一允许出现宿主符号**的层（`00-init.js` 头注 · 架构档 L0）。核侧（`72-panel.js`）
 * 已给注册表与**域刷新**；本档补票面第 2 件：**常驻面板区** ＋ **叙事列独立滚动** ＋ **面板显隐入设置**。
 *
 * ## 三件的落点（现查的，✗ 凭印象）
 *   · **常驻面板区**：故事侧 `src/ui/ui.twee` 的 `:: StoryCaption` 段就是侧栏常驻区（`#story-caption`）；
 *     壳把**已注册且可见**的面板逐个写回它们各自的宿主（走 `RPG.panelWriter`，同 `refreshPanels` 的纪律）。
 *   · **叙事列独立滚动**：叙事列是 `#passages`（`20-render.js:22` 写它）⇒ 只给它一条 `overflow`
 *     与容器高度约束 ⇒ 面板区与叙事列各自滚动，✗ 整页滚。**只出样式声明**（`scrollCSS()`，纯函数 ⇒ 可判），
 *     应用由本档（允许层）做。
 *   · **显隐入设置**：最小形＝`State.variables.settings.panels[id] = bool`（随档往返）。
 *     ⚠ 宿主 `Settings` API（带界面）留全量。（领队 05:26 裁：不换落点。）
 *
 * ## 边界（明说，✗ 免得读成漏）
 *   · 壳**不碰注册表语义**：域刷新仍归核的 `refreshDomain`；本档只决定「**挂哪些**（可见性）」与
 *     「**挂去哪**（常驻区）」。
 *   · 无宿主（无 jQuery／无 document／无 writer）⇒ **静默跳过**并如实报 `挂载: []`（✗ 假装已挂）。
 *   · ✗ 不做设置**界面**（只做声明与读口）；✗ 不做面板拖拽/排序（全量）。
 */
(() => {
	const 常驻区 = '#story-caption';          // ★只此一处：改常驻区只改这里

	const 有宿主 = () => typeof document !== 'undefined' && typeof jQuery !== 'undefined';
	const 设置表 = () => {
		const v = (typeof State !== 'undefined' && State?.variables) ? State.variables : null;
		if (v == null) return null;
		if (v.settings == null || typeof v.settings !== 'object') v.settings = {};
		if (v.settings.panels == null || typeof v.settings.panels !== 'object') v.settings.panels = {};
		return v.settings.panels;
	};

	/** 该面板是否可见（**缺省可见**；✗ 只有显式 `false` 才算隐藏 —— 否则「设置面没建」会让面板全消失）。 */
	const 可见 = (id) => 设置表()?.[id] !== false;

	/** 设可见性（**未注册 id ⇒ 具名抛**：面板名打错是接线错，同 `refreshPanels` 之旨）。 */
	const 设可见 = (id, 开 = true) => {
		if (!RPG.panels?.has(id)) throw new Error(`shell.setVisible：未注册的面板「${id}」`);
		const 表 = 设置表();
		if (表 == null) return false;                       // 无 State ⇒ 不落盘（静默，✗ 假装已设）
		表[id] = 开 !== false;
		return 表[id];
	};

	/** 叙事列独立滚动的**样式声明**（纯函数 ⇒ 判据直接断串，✗ 依赖 DOM）。 */
	const 滚动样式 = () => [
		'/* 布局壳（sgstory#1763）：叙事列独立滚动，面板区不随动 */',
		'#passages { overflow-y: auto; max-height: calc(100vh - 2rem); }',
	].join('\n');

	/** 把样式落进宿主（幂等：已注入 ⇒ 不再插第二份）。 */
	let 样式已注入 = false;
	const 应用滚动样式 = (doc = (typeof document !== 'undefined' ? document : null)) => {
		if (样式已注入) return false;
		if (doc?.head == null) return false;
		const el = doc.createElement('style');
		el.id = 'rpg-shell-scroll';
		el.textContent = 滚动样式();
		doc.head.appendChild(el);
		样式已注入 = true;
		return true;
	};

	/**
	 * 挂载常驻面板：把**已注册且可见**的面板写回各自宿主（走 `RPG.panelWriter`）。
	 * @returns `{ 挂载: string[], 跳过: string[], 隐藏: string[], 无写入器 }` —— 四个面都如实报
	 *   （✗ 不把「没挂上」与「挂了」混成一个数组：那是本席今晚反复吃的「假绿」形）。
	 */
	const 挂载面板 = ({ into, write } = {}) => {
		const put = write ?? RPG.panelWriter;
		const ids = [...(RPG.panels?.keys?.() ?? [])];
		if (typeof put !== 'function') return { 挂载: [], 跳过: ids, 隐藏: [], 无写入器: true };
		const 挂载 = [];
		const 跳过 = [];
		const 隐藏 = [];
		for (const id of ids) {
			const p = RPG.panels.get(id);
			if (!可见(id)) { 隐藏.push(id); continue; }
			const hit = put(into ?? p.host, p.render(), { preserve: RPG.preservePanelState }) !== false;
			if (!hit) { 跳过.push(id); continue; }
			p.count += 1;                                  // ★与核的 refreshPanels 同口径（计数＝可观测面）
			挂载.push(id);
		}
		return { 挂载, 跳过, 隐藏, 无写入器: false };
	};

	RPG.shell = Object.freeze({
		常驻区: 常驻区,
		可见,
		设可见,
		滚动样式,
		应用滚动样式,
		挂载面板,
		/** 装壳：挂载 ＋ 注入样式（一步到位；无宿主时各步自己静默跳过）。 */
		装: (opts = {}) => ({ 样式: 应用滚动样式(), ...挂载面板(opts) }),
		有宿主,
	});
})();
