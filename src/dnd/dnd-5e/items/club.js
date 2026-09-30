/* DND5E 道具 —— 木棒（1d4 钝击，简单武器） */

DND5E.Club = RPG.defItem({
	id: 'club', name: '木棒', desc: '结实的硬木短棒。',
	stats: { dmg: '1d4', type: 'bludgeoning', weight: 2, cost: 1, finesse: false },
	weapon: true, slot: 'weapon', charges: null, stackable: false,
	actions: { equip: RPG.slotEquip, unequip: RPG.slotUnequip },
	used(that, from) { DND5E.attack(this, that, from); },
});
