/* DND5E 道具 —— 链甲衫（中甲：AC 13 + 灵巧上限 2） */

DND5E.ChainShirt = RPG.defItem({
	id: 'chain-shirt', name: '链甲衫', desc: '细密金属环编织的护甲衣。',
	stats: { armor: { base: 13, dex: true, dexMax: 2 }, weight: 20, cost: 50 },
	slot: 'body', charges: null, stackable: false,
	actions: { equip: RPG.slotEquip, unequip: RPG.slotUnequip },
	used() { this.perform('链甲衫得穿上才有用。'); },
});
