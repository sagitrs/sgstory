/* DND3 道具 —— 铁环甲（身体槽装备：+3 AC）
 * 战斗数值走 DND3.acOf（已装备道具的 ac_bonus 计入防御等级）。
 */

DND3.Mail = RPG.defItem({
	id: 'mail',
	name: '铁环甲',
	desc: '缝满铁环的旧背心，沉甸甸地压在肩上。',
	stats: { ac_bonus: 3, weight: 20, cost: 100, slotName: '身体' },
	charges: null,
	stackable: false,
	slot: 'body',
	actions: {
		equip: RPG.slotEquip,
		unequip: RPG.slotUnequip,
	},

	used() {
		this.perform('铁环甲得穿在身上才有用——用「装备」动作。');
	},
});
