/* DND3 道具 —— 骨刺匕首（一段 1–9 层「骨器」面；SRD 3.5 · `Basic Rules and Legal/equipment.md:362-370`）
 *
 * 源：`### Dagger` 表行（Light Melee，**2 gp**／伤害 **1d4**／重击 **19–20/×2**／射程 **10 ft.**／**1 lb.**／
 *   **Piercing or Slashing**）。本仓取名「骨刺匕首」以贴一段的「骨器」基调，**数值一律照源**——
 *   源条目名与本仓注册名的差异属 README §三.4「命名可能不同」面（映射数据在 `tests/gates/name-map.json`）。
 * 3E 判定数学在 `dnd3/core/combat.js`（近战武器共用，加新武器零重复）。
 */

DND3.BoneDagger = RPG.defItem({
	id: 'bone-dagger',
	name: '骨刺匕首',
	desc: '把兽骨磨尖绑在短柄上。比石头锋利，也比石头脆。',
	stats: {
		dmg: '1d4',            // SRD 3.5 · `Basic Rules and Legal/equipment.md:362` —— Dagger（中型）1d4
		crit: 2,               // 同上 —— ×2
		critMin: 19,           // 同上 —— 重击威胁 19–20
		range: 10,             // 同上 —— 射程增量 10 英尺（可投掷）
		weight: 1,             // 同上 —— 1 lb.
		cost: 2,               // 同上 —— 2 gp
		type: 'piercing',      // 同上 —— Piercing or Slashing（取 piercing）
		prof: 'simple',        // SRD 3.5 · `Basic Rules and Legal/equipment.md:97` —— Dagger 属简易武器
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
