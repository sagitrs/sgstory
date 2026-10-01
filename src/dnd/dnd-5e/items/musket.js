/* DND5E 道具 —— 火枪（武術远程武器，需弹药）
 * 数值出处：SRD 5.2.1 · `equipment.md:429-434`「Musket」——1d12 Piercing；500 GP；10 lb.
 *   特性 `Ammunition (Range 40/120; Bullet), Loading, Two-Handed`（`equipment.md:431`）
 *   - Ammunition：每次攻击耗 1 发（本仓由 `stats.ammo` 消费，见 `30-inventory.js` 的 useItem）
 *   - Loading：一次动作只能射一发 —— 现引擎无多次攻击概念（每次 attack 即一发）⇒ **自动满足**，
 *     故不落字段、仅在此登记依据（`equipment.md:78`）
 *   - Two-Handed：双手持用 —— 引擎无手数面（deferred，待 #1727 回合钩子后另议）
 */
DND5E.Musket = RPG.defItem({
	id: 'musket', name: '火枪', desc: '以火药推进弹丸的武術远程武器；每次射击消耗一发子弹（Loading：一击一发）。',
	stats: { dmg: '1d12', type: 'piercing', weight: 10, cost: 500, ranged: true,
		ammo: { id: 'bullets-firearm' }, twoHanded: true },
	weapon: true, slot: 'weapon', charges: null, stackable: false,
	actions: { equip: RPG.slotEquip, unequip: RPG.slotUnequip },
	/* ★**转发返回值**（`#1813` 笔 2）：攻击层在「打不出去」（腾不出手／没弹药）时 `return false`；
	 *   块体若不转发，`RPG.act` 拿到的仍是 `undefined` ⇒ 被算作 `applied` ⇒ `#1773` 三连护栏失效。 */
	used(that, from) { return DND5E.attack(this, that, from); },
});
