/* DND3 道具 —— 铁锭（二段 11–19 层的**投放资源**；**house rule（非 SRD）**）
 *
 * ⚠ 数值**无源**（**house rule（非 SRD）**）：装备/财富面**没有**「铁锭」这一条目（它是本井的**资源**概念，
 *   不是 D&D 的装备物）。依 README §三.5（不许无出处），本件按**本仓自定**处理并显式标注
 *   **house rule（非 SRD）**，不得写成「对齐 SRD」。
 * 形制依据（照 #1729 裁定①「资源即 Item」甲案）：资源**零新原语**——就是一件不可装备、可叠加的道具，
 *   靠 `stats.value` 承载数量/价值，经 `RPG.give`/`RPG.loot` 收发。第 20 层 hub 的建设入口消耗它
 *   （消费端归 `#1747` 的资源/聚落最小形，本笔只落**可被引用的注册 id**）。
 * 定标依据（house rule，非 SRD）：单价 1 gp —— 低于本段最贵单件（链甲衫 100 gp）两个数量级，
 *   以匹配「就地取材」的资源性质（段内定标见 `core/climb2.js` 的 `SPAN2_SCALING`）。
 */

DND3.IronIngot = RPG.defItem({
	id: 'iron-ingot',
	name: '铁锭',
	desc: '粗炼的铁块。铸剑还差火候，垒墙倒是够用。',
	stats: { value: 1 },   // house rule（非 SRD）：单价 1 gp
	charges: null,
	stackable: true,
	slot: null,            // 资源不可装备（与武器/护甲面区分）

	used(that, from) {
		this.perform('铁锭得拿到工坊去用——它自己不会变成剑。');
	},
});
