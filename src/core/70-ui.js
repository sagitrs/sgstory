/* RPG 核心 —— 呈现面原语（C1：道具名链接化 —— 能力伞首期 `#1798`）
 *
 * 面（`#1798` C1）：「试玩现痛：**道具名无交互**」⇒ 点道具名即用/装备。
 *
 * ## 设计（承能力伞总原则：数据驱动呈现｜注册表同构扩展）
 *   ① **动作从条目自身的动作表派生**（`RPG.items.get(id).handlers`）—— ✗ 不在本文件里维护
 *      「哪些 id 能装备」的白名单（那是**第二套权威源**，与 `#1727`／`#1776` 立的单一权威源相悖）。
 *      ★ 动作表挂在**类**上（`defItem` 的注释：实例经 JSON 克隆也不丢处理器）⇒ 从类读是稳的。
 *   ② **纯逻辑与 DOM 绑定分离**：`RPG.itemClick(id)` 是可断言的纯入口（用例直接调），
 *      `RPG.bindItemLinks()` 只负责把点击事件接到它身上 ⇒ 无头环境也能测行为。
 *   ③ **渲染与语义一致**：`RPG.inventoryLinks()` 与既有的 `RPG.inventoryLabel()` **逐字同形**
 *      （同样的「×N」「（已装备）」「（空）」）⇒ 状态栏换用后**文本不变**，只多了可点。
 *   ④ 绑定**幂等**（重复调用只绑一次）：本模块在包加载时自绑一次，故事侧可再显式调用。
 *
 * ⚠ 本文件**不改**任何判定数学：点击走的就是既有的 `RPG.toggleEquip`／`RPG.useItem`
 *   （⇒ 弹药检查、`charges` 消耗、`item:used` 事件、动作拒绝语义全部照旧）。
 */

/** HTML 文本转义（道具名来自内容数据，但**渲染进 HTML** 就一律转义 —— 与 `#1746` 的 twee 渲染同纪律） */
const esc = (s) => String(s)
	.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
	.replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** 该道具**点击时**该走哪个动作：可装备 ⇒ `equip`（再点即 `unequip`，由 `toggleEquip` 决定）；否则 `use`。
 *  派生依据是**条目自己的动作表**；未注册 id ⇒ `null`（调用方自行拒绝，✗ 不猜）。 */
RPG.itemAction = (id) => {
	const klass = RPG.items.get(id);
	if (!klass) return null;
	return typeof klass.handlers?.equip === 'function' ? 'equip' : 'use';
};

/**
 * 点一下道具名的**行为**（纯入口，可断言）：可装备 ⇒ 切换装备；否则 ⇒ 用掉一次。
 * @param id    道具 id
 * @param opts.actor 缺省取 `RPG.playerActor()`（与 `RPG.gather`／`RPG.useItem` 同一缺省语义）
 * @returns `{ ok, action }`；未知 id ⇒ `{ ok: false, action: null }`
 */
RPG.itemClick = (id, { actor } = {}) => {
	const action = RPG.itemAction(id);
	if (action == null) return { ok: false, action: null };
	const who = actor ?? RPG.playerActor();
	if (action === 'equip') return { ok: RPG.toggleEquip(id) !== false, action };
	/* ★`#1857`：**故事页**的 `act` 抛错收成可读拒绝（`#1839` 战斗侧 `#actCatching` 的同族补面）。
	 *   道具的 `used()` 可以**按设计抛错**（资源「误当消耗品」`resources.js`：「应当响」），
	 *   而本函数原先**无 catch** ⇒ 异常穿过 `bindItemLinks` 的点击处理 ⇒ **穿到 jQuery/DOM 层**
	 *   ⇒ 玩家点一下**没有任何可读反馈**（实测：`itemClick('rock')` 抛「石料」是建设物资…）。
	 *   ⇒ 收成 `{ ok:false, reason:'action-threw', message }`（`message` ＝ **道具自己的话**，✗ 改写）。
	 *   ⚠ **只包这一处调用**（✗ 包整个函数）：其余异常是真缺陷，吞掉会把「崩了」伪装成「被拒绝」
	 *     （与 `#1839` 的取舍 1 同旨）。
	 *   ⚠ 与「`used()` 返回 `false`」的拒绝**可分辨**（后者 `reason === undefined`，即既有形）——
	 *     两者都 `ok:false`，但**成因不同**，故 `reason` 分开（既有 `#1805` 直证格不受影响）。 */
	let used;
	try {
		used = RPG.useItem(id, who, who, 'use');
	} catch (e) {
		/* 与 `#1839` 同形：玩家看**文案**（上屏）、作者看**栈**（控制台）—— ✗ 只留其一 */
		console.error('[RPG] 道具动作抛错（故事页已转为可读拒绝；此栈供排查是否为真 bug）:', e);
		return { ok: false, action, reason: 'action-threw', message: e?.message ?? String(e) };
	}
	return { ok: used !== false, action };
};

/** ★`#1857`：把 `itemClick` 的**抛错形拒绝**转成**可读文案**（纯函数，便于单测直证）。
 *  ★原样引**道具自己的话**（`result.message`）—— 那是道具作者写给自己玩家的「因」，✗ 泛泛的「用不了」。
 *  ⚠ 只对 `reason === 'action-threw'` 生效；其余形态（`used()` 返回 `false` 的拒绝）⇒ 返回 `null`
 *    （**语义不同**：前者是「动作抛了」，后者是「动作自己判定做不到」—— 由各自的既有路径呈现）。
 *  @returns string|null 文案；`null` ＝ 本形态不上屏 */
RPG.itemRejectText = (result) => {
	if (result?.reason !== 'action-threw') return null;
	/* ★**原样**用道具自己的话（✗ 前置名字／加括号）—— 道具文案**通常已含名字与因**
	 *   （实测：`「石料」是建设物资，不能直接使用（请用于建造）`），再套一层会得
	 *   「「石料」用不了：「石料」是建设物资…」＝**重复**（与 `#1839` 的取舍 2 同族：✗ 塞进括号位）。
	 *   ⇒ 道具作者写了什么，玩家就看到什么；若某道具的话不自明，那是**道具侧**该补的文案。 */
	return result.message;
};

/**
 * 一个道具名的**可点标签**（HTML 串）。
 * @param id     道具 id
 * @param opts.label 覆盖显示文本（缺省取快照/注册面的名字）
 * @param opts.suffix 追加文本（如「（已装备）」）—— 由调用方给，✗ 本函数不猜状态
 */
RPG.itemLink = (id, { label, suffix = '' } = {}) => {
	const name = label ?? (RPG.items.has(id) ? RPG.createItem(id).name : id);
	const act = RPG.itemAction(id);
	const cls = act == null ? 'rpg-item-link rpg-item-link-unknown' : 'rpg-item-link';
	const title = act == null ? '未注册的道具' : (act === 'equip' ? '点击装备／卸下' : '点击使用');
	return `<a href="#" class="${cls}" data-item="${esc(id)}" title="${esc(title)}">${esc(name)}</a>${esc(suffix)}`;
};

/** 状态栏用：背包内容的**可点**标签（与 `RPG.inventoryLabel()` 逐字同形，只是每个名字可点）。 */
RPG.inventoryLinks = () => {
	const list = State?.variables?.inventory ?? [];
	if (list.length === 0) return '（空）';
	return list
		.map((s) => {
			const item = RPG.reviveItem(s);
			/* `#1836`：与 `RPG.inventoryLabel()` **同步**改成一律 `×N`（含 `×1`）—— 两处**必须逐字同形**（本文件头注 ③
			 * 的不变式，有单测把守）。0 充能**同样自解释**（渲染 `×0`）⇒ **不需要**「（已用尽）」分支，
			 * 也**不依赖**「所有扣减路径都记得摘槽」（详见 `30-inventory.js` 同名处注释）。 */
			const text = item.charges != null ? `${item.name}×${item.charges}` : item.name;
			return RPG.itemLink(item.id, { label: text, suffix: item.equipped ? '（已装备）' : '' });
		})
		.join('、');
};

/** 把点击事件接到 `RPG.itemClick`（幂等：只绑一次）。无 DOM 环境（无头单测）⇒ 静默跳过。 */
RPG.bindItemLinks = () => {
	if (RPG.__itemLinksBound) return false;
	if (typeof document === 'undefined' || typeof jQuery === 'undefined') return false;
	jQuery(document).on('click', '.rpg-item-link', function (ev) {
		ev.preventDefault();
		const id = jQuery(this).attr('data-item');
		if (!id) return;
		const r = RPG.itemClick(id);
		/* ★`#1857`：**把拒绝上屏**（✗ 静默 —— 玩家点了没反应＝「穿 DOM」的另一种形态）。
		 *   `perform` 会把文案插在 `.statusbar` **之前**（＝页底，玩家正在看的地方，见 `01-perform.js:23`）。 */
		const rejectText = RPG.itemRejectText(r);
		if (rejectText != null) RPG.perform(rejectText);
		/* 用后重绘：状态栏里「（已装备）」与「×N」都会变 ⇒ 走 **B1 的局部刷新域**只刷新「背包」那一格
		 *   （`#1798` B1 落地后，本文件不再自己找 DOM 写入 ⇒ 谁该重绘由**面板注册表**回答）。
		 *   面板未注册／当前段落没有该宿主（如未接线的故事）⇒ 退化为「什么都不做」（✗ 整段重绘）。 */
		if (typeof RPG.refreshPanels === 'function' && RPG.panels?.has?.('inventory')) {
			RPG.refreshPanels(['inventory']);
		}
	});
	RPG.__itemLinksBound = true;
	return true;
};

/* 包加载即自绑一次（故事侧仍可显式调用；幂等 ⇒ 重复无副作用）。 */
RPG.bindItemLinks();
