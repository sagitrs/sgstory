/* DND5E 道具 —— 环甲（重甲：AC 14 固定，不加灵巧） */

DND5E.RingMail = RPG.defItem({
	id: 'ring-mail', name: '环甲', desc: '金属环缝制在皮革底上的重型护甲。',
	stats: { armor: { base: 14, dex: false }, weight: 40, cost: 30 },
	slot: 'body', charges: null, stackable: false,
	actions: { equip: RPG.slotEquip, unequip: RPG.slotUnequip },
	used() { this.perform('环甲得穿上才有用。'); },
});
