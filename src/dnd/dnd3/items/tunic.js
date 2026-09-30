/* DND3 道具 —— 厚布衣（身体槽装备：+1 AC）。与铁环甲同槽互斥。 */

DND3.Tunic = RPG.defItem({
	id: 'tunic',
	name: '厚布衣',
	desc: '多层粗布缝成的旅行衣，挡风也略微挡刀。',
	stats: { ac_bonus: 1, weight: 4, cost: 5, slotName: '身体' },
	charges: null,
	stackable: false,
	slot: 'body',
	actions: {
		equip: RPG.slotEquip,
		unequip: RPG.slotUnequip,
	},

	used() {
		this.perform('厚布衣得穿上才有用——用「装备」动作。');
	},
});
