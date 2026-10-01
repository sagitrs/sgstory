/* DND5E 道具 —— 手枪（武術远程武器，需弹药）
 * 数值出处：SRD 5.2.1 · `equipment.md:437-442`「Pistol」——1d10 Piercing；250 GP；3 lb.
 *   特性 `Ammunition (Range 30/90; Bullet), Loading`（`equipment.md:439`）；无 Two-Handed。
 */
DND5E.Pistol = RPG.defItem({
	id: 'pistol', name: '手枪', desc: '以火药推进弹丸的武術远程武器；每次射击消耗一发子弹（Loading：一击一发）。',
	stats: { dmg: '1d10', type: 'piercing', weight: 3, cost: 250, ranged: true,
		ammo: { id: 'bullets-firearm' } },
	weapon: true, slot: 'weapon', charges: null, stackable: false,
	actions: { equip: RPG.slotEquip, unequip: RPG.slotUnequip },
	/* ★**转发返回值**（`#1813` 笔 2）：攻击层在「打不出去」（腾不出手／没弹药）时 `return false`；
	 *   块体若不转发，`RPG.act` 拿到的仍是 `undefined` ⇒ 被算作 `applied` ⇒ `#1773` 三连护栏失效。 */
	used(that, from) { return DND5E.attack(this, that, from); },
});
