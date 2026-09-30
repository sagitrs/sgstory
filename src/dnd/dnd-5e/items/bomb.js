/* DND5E 道具 —— 铁皮炸弹（1d6 火焰，投掷武器，一次性） */

DND5E.Bomb = RPG.defItem({
	id: 'bomb', name: '铁皮炸弹', desc: '投掷武器，爆炸造成火焰伤害。',
	stats: { dmg: '1d6', type: 'fire', weight: 1, cost: 20, ranged: true },
	charges: 1, stackable: false,
	used(that, from) { DND5E.attack(this, that, from); },
});
