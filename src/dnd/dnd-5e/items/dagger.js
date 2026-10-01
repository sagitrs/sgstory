/* DND5E 道具 —— 匕首（1d4 穿刺，Finesse 简单武器） */

DND5E.Dagger = RPG.defItem({
	id: 'dagger', name: '匕首', desc: '轻巧的短刃，可以投掷。',
	stats: { dmg: '1d4', type: 'piercing', weight: 1, cost: 2,
		finesse: true, thrown: '20/60' },
	weapon: true, slot: 'weapon', charges: null, stackable: false,
	actions: { equip: RPG.slotEquip, unequip: RPG.slotUnequip, throw: RPG.throwItem },
	/* ★**转发返回值**（`#1813` 笔 2）：攻击层在「打不出去」（腾不出手／没弹药）时 `return false`；
	 *   块体若不转发，`RPG.act` 拿到的仍是 `undefined` ⇒ 被算作 `applied` ⇒ `#1773` 三连护栏失效。 */
	used(that, from) { return DND5E.attack(this, that, from); },
});
