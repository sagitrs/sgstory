/* DND5E 道具 —— 皮靴（脚槽装备） */

DND5E.Boots = RPG.defItem({
	id: 'boots', name: '皮靴', desc: '结实的旅行靴。',
	stats: { weight: 2, cost: 5 },
	slot: 'feet', charges: null, stackable: false,
	actions: { equip: RPG.slotEquip, unequip: RPG.slotUnequip },
	used() { this.perform('靴子得穿上才有用。'); },
});
