/* DND3 道具 —— 木柄长矛（一段 1–9 层「木械」面；SRD 3.5 · `Basic Rules and Legal/equipment.md:501-510`）
 *
 * 源：`### Spear` 表行（Two-Handed Melee，**2 gp**／伤害 **1d8**／重击 **×3**／射程 **20 ft.**／**6 lb.**／
 *   **Piercing**）。取名「木柄长矛」贴「木械」基调，数值一律照源（命名差异同 `bone-dagger.js` 的说明）。
 * 3E 判定数学在 `dnd3/core/combat.js`（近战武器共用，加新武器零重复）。
 */

DND3.WoodSpear = RPG.defItem({
	id: 'wood-spear',
	name: '木柄长矛',
	desc: '削尖的硬木长杆。简陋，但一刺一收之间足够保命。',
	stats: {
		dmg: '1d8',            // SRD 3.5 · `Basic Rules and Legal/equipment.md:501` —— Spear（中型）1d8
		crit: 3,               // 同上 —— ×3
		range: 20,             // 同上 —— 射程增量 20 英尺（可投掷）
		weight: 6,             // 同上 —— 6 lb.
		cost: 2,               // 同上 —— 2 gp
		type: 'piercing',      // 同上 —— Piercing
		prof: 'simple',        // SRD 3.5 · `Basic Rules and Legal/equipment.md:97` —— Spear 属简易武器
	},
	charges: null,
	stackable: false,
	weapon: true,
	slot: 'weapon',
	actions: {
		equip: RPG.slotEquip,
		unequip: RPG.slotUnequip,
	},

	used(that, from) {
		/* ★**转发返回值**（`#1813`）：攻击层现在会在「打不出去」（腾不出手／没弹药）时
 *   `return false`；块体若不转发，`RPG.act` 拿到的仍是 `undefined` ⇒ 被算作 `applied`
 *   ⇒ `#1773` 的三连拒绝护栏在这一面失效。⇒ 与 `dnd-5e` 侧同笔（笔 1／笔 2）。 */
		return DND3.meleeAttack(this, that, from);
	},
});
