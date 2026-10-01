/* DND5E 道具 —— 木棒（1d4 钝击，简单武器） */

DND5E.Club = RPG.defItem({
	id: 'club', name: '木棒', desc: '结实的硬木短棒。',
	stats: { dmg: '1d4', type: 'bludgeoning', weight: 2, cost: 1, finesse: false },
	weapon: true, slot: 'weapon', charges: null, stackable: false,
	actions: { equip: RPG.slotEquip, unequip: RPG.slotUnequip },
	/* ★**转发返回值**（`#1813` 笔 2）：攻击层在「打不出去」（腾不出手／没弹药）时 `return false`；
	 *   块体若不转发，`RPG.act` 拿到的仍是 `undefined` ⇒ 被算作 `applied` ⇒ `#1773` 三连护栏失效。 */
	used(that, from) { return DND5E.attack(this, that, from); },
});
