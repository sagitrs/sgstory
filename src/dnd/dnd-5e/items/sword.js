/* DND5E 道具 —— 长剑（1d8 挥砍，Versatile 军用武器） */

DND5E.Longsword = RPG.defItem({
	id: 'sword', name: '长剑', desc: '制式长剑，可用单手或双手握持（双手 1d10）。',
	stats: { dmg: '1d8', type: 'slashing', weight: 3, cost: 15,
		finesse: false, versatile: '1d10' },
	weapon: true, slot: 'weapon', charges: null, stackable: false,
	actions: { equip: RPG.slotEquip, unequip: RPG.slotUnequip },
	/* ★**转发返回值**（`#1813` 笔 2）：攻击层在「打不出去」（腾不出手／没弹药）时 `return false`；
	 *   块体若不转发，`RPG.act` 拿到的仍是 `undefined` ⇒ 被算作 `applied` ⇒ `#1773` 三连护栏失效。 */
	used(that, from) { return DND5E.attack(this, that, from); },
});
