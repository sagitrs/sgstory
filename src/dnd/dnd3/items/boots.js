/* DND3 道具 —— 包铁皮靴（脚槽装备：+1 AC） */

DND3.Boots = RPG.defItem({
	id: 'boots',
	name: '包铁皮靴',
	desc: '鞋尖包着铁皮的好靴子，走烂路稳当，踢到石头也不疼。',
	/* ★`#1906` 盘点 §四·C4：防具**战斗中无「使用」动作**（`used()` 只出声拒绝）⇒ 声明它，
	 *   战斗选单不再亮一个注定被拒的项（装备/卸下路**不受影响** —— `noBattleUse` 只压「使用」）。 */
	stats: { ac_bonus: 1, weight: 2, cost: 8, slotName: '脚', noBattleUse: true },
	charges: null,
	stackable: false,
	slot: 'feet',
	actions: {
		equip: RPG.slotEquip,
		unequip: RPG.slotUnequip,
	},

	used() {
		/* ★`#1906` 笔一：瞬时说明走**通知面**（✗ 再落正文）＋ **显式拒绝**（`return false` ⇒ 不消耗）。
		 *   形同 `coin`（`books#130` D6-3 的读数形）：`perform` 两个面都写 ⇒ 玩家每点一次正文多一行。
		 *   ⚠ 能力探测（通知面未加载的环境回落 `perform`，同 `coin`）。 */
		const line = '靴子得穿上才有用——用「装备」把它穿上。';
		if (typeof RPG.pushNotice === 'function') RPG.pushNotice(line);
		else this.perform(line);
		return false;
	},
});
