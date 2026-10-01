/* DND5E 道具 —— 铁皮炸弹（1d6 火焰，投掷武器，一次性） */

DND5E.Bomb = RPG.defItem({
	id: 'bomb', name: '铁皮炸弹', desc: '投掷武器，爆炸造成火焰伤害。',
	stats: { dmg: '1d6', type: 'fire', weight: 1, cost: 20, ranged: true },
	charges: 1, stackable: false,
	/* ★**转发返回值**（`#1813` 笔 2）：攻击层在「打不出去」（腾不出手／没弹药）时 `return false`；
	 *   块体若不转发，`RPG.act` 拿到的仍是 `undefined` ⇒ 被算作 `applied` ⇒ `#1773` 三连护栏失效。 */
	used(that, from) { return DND5E.attack(this, that, from); },
});
