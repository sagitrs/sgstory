/* DND5E 道具 —— 匕首（1d4 穿刺，Finesse 简单武器） */

DND5E.Dagger = RPG.defItem({
	id: 'dagger', name: '匕首', desc: '轻巧的短刃，可以投掷。',
	stats: { dmg: '1d4', type: 'piercing', weight: 1, cost: 2,
		finesse: true, thrown: '20/60' },
	weapon: true, slot: 'weapon', charges: null, stackable: false,
	actions: { equip: RPG.slotEquip, unequip: RPG.slotUnequip },
	used(that, from) { DND5E.attack(this, that, from); },
});
