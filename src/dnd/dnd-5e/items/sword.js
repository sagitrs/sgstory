/* DND5E 道具 —— 长剑（1d8 挥砍，Versatile 军用武器） */

DND5E.Longsword = RPG.defItem({
	id: 'sword', name: '长剑', desc: '制式长剑，可用单手或双手握持（双手 1d10）。',
	stats: { dmg: '1d8', type: 'slashing', weight: 3, cost: 15,
		finesse: false, versatile: '1d10' },
	weapon: true, slot: 'weapon', charges: null, stackable: false,
	actions: { equip: RPG.slotEquip, unequip: RPG.slotUnequip },
	used(that, from) { DND5E.attack(this, that, from); },
});
