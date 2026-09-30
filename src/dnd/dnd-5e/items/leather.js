/* DND5E 道具 —— 皮甲（轻甲：AC 11 + 灵巧） */

DND5E.LeatherArmor = RPG.defItem({
	id: 'leather', name: '皮甲', desc: '硬化的皮革护甲，轻便灵活。',
	stats: { armor: { base: 11, dex: true }, weight: 10, cost: 10 },
	slot: 'body', charges: null, stackable: false,
	actions: { equip: RPG.slotEquip, unequip: RPG.slotUnequip },
	used() { this.perform('皮甲得穿上才有用。'); },
});
