/* 巴别之井 · 试玩版 —— 状态栏**面板注册**（B1 · `#1798`）
 *
 * 版式（twee）只留**骨架**（`data-panel` 空宿主）；内容一律由本文件的**渲染函数**给 ⇒
 *   「状态栏长什么样」只有一处权威源（✗ twee 与 JS 各写一份）。
 * 填充点只有一个：段落渲染后（`:passagedisplay`）⇒ `RPG.refreshPanels()`；
 *   段落**内**的状态变化（点道具、切通知档）只刷新**受影响的那一个**面板（B1 的局部刷新域）。
 */

const R = setup.RPG;
const D = setup.DND3;

/* ★**写回器**：面板的 DOM 写入**只在故事侧**（核心 `72-panel.js` 不碰 DOM —— `#1804` 件二的棘轮门）。
 *  契约：命中并写入 ⇒ 返回真值；选择器在当前段落找不到宿主 ⇒ 返回 `false`（那次刷新计为 skipped）。
 *
 * ★**重绘搬运宿主内交互态**（`#1877` P1-3 根因；判据节见 core `RPG.preservePanelState`）：
 *   `$host.html(html)` 是**整块替换** ⇒ 宿主里只存在于 DOM 的态（当前唯一一处：通知面板
 *   `<details class="rpg-notice-box">` 的 `open`）会被清掉 ⇒ 玩家展开列表后，一次动作/一次切档
 *   就把它打回折叠 ⇒ 表象正是操作者报的「计数在涨，可列表恒空」。
 *   ⇒ 在**唯一碰 DOM 的这一层**，写入**前**记下 `open === true` 的块，写入**后**按**同一选择器**写回
 *     （✗ 不按 index 配对 —— 列表顺序一变就错位）。
 *   ⚠ 只搬 `open`：块本身是否可展开由**新 HTML** 决定，不从旧 DOM 继承。 */
R.panelWriter = (host, html, opts = {}) => {
	const $host = jQuery(host);
	if ($host.length === 0) return false;
	const keep = [];
	for (const { sel } of opts.preserve ?? []) {
		$host.find(sel).each(function () { if (this.open === true) keep.push(sel); });
	}
	$host.html(html);
	for (const sel of keep) $host.find(sel).each(function () { this.open = true; });
	return true;
};

const traumaNames = () => Object.keys(D.Traumas).filter((id) => D.Player.contains(id))
	.map((id) => `<span class="trauma">${D.Traumas[id].name}</span>`).join(' ');

R.registerPanel('hp', {
	name: '体力',
	host: '.statusbar [data-panel="hp"]',
	render: () => `体力：${D.Player.hp} / ${D.Player.maxHp}`,
});
R.registerPanel('location', {
	name: '位置',
	host: '.statusbar [data-panel="location"]',
	render: () => {
		const cur = setup.BABEL?.map?.current;
		const name = cur ? setup.BABEL.map.locations.get(cur)?.name : null;
		return `位置：${name ?? '（未进入）'}`;
	},
});
R.registerPanel('trauma', {
	name: '创伤',
	host: '.statusbar [data-panel="trauma"]',
	render: () => `创伤：${traumaNames() || '无'}`,
});
R.registerPanel('inventory', {
	name: '背包',
	host: '.statusbar [data-panel="inventory"]',
	render: () => setup.RPG.inventoryLinks(),
});
/* 通知面板：能力来自 B4（`#1798`）⇒ **能力探测**注册（该面未落地时这一格留空，✗ 报错） */
if (typeof R.noticeToggleHTML === 'function') {
	R.registerPanel('notice', {
		name: '通知',
		host: '[data-panel="notice"]',
		render: () => `${R.noticeToggleHTML()}`
			+ `<details class="rpg-notice-box"><summary>最近的通知</summary>`
			+ `<ul class="rpg-notice-list">${R.noticesHTML()}</ul></details>`,
	});
}

/* 唯一填充点：每段落渲染后把面板填上（骨架→内容）。
 *
 * ★并且**在这里兜底**记录「本局见过的创伤」（`setup.BABEL.noteTraumas`）——
 *   原先这行在 footer 的 twee 里（每段落跑一次）；B1 把 footer 骨架化时**被顺手删掉**了
 *   （D 席 MAJOR-1：与版式无关的调用被删且零判据）。此处语义等价、位置更合适：
 *   `battle:end` 的订阅只覆盖「战斗内施加」（当前唯一施加途径），本兜底覆盖**一切路径**。
 *   ⚠ 若将来出现非战斗施加（陷阱/环境/脚本），这条兜底就是唯一的对齐点 ⇒ **别删**（⑮ 有断言守它）。 */
jQuery(document).on(':passagedisplay', () => {
	setup.BABEL?.noteTraumas?.();
	R.refreshPanels();
});
