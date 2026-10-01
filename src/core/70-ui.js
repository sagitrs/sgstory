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
	return { ok: RPG.useItem(id, who, who, 'use') !== false, action };
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
			const text = item.charges != null && item.charges > 1 ? `${item.name}×${item.charges}` : item.name;
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
		RPG.itemClick(id);
		/* 用后重绘**当前**状态：状态栏里「（已装备）」与「×N」都会变 ⇒ 原地重绘它自己（B1 的局部刷新面
		 *   在首期尚未落 ⇒ 此处只做最小可信的一步：把这一行按当前状态重写）。 */
		const $bar = jQuery('#passages .passage').last().find('.inventory-links').first();
		if ($bar.length) $bar.html(RPG.inventoryLinks());
	});
	RPG.__itemLinksBound = true;
	return true;
};

/* 包加载即自绑一次（故事侧仍可显式调用；幂等 ⇒ 重复无副作用）。 */
RPG.bindItemLinks();
