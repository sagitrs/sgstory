/* DND3 道具 —— 铁剑（二段 11–19 层「早期铁器」面；SRD 3.5 · `Basic Rules and Legal/equipment.md:765-774`）
 *
 * 源：`### Longsword` 表行（军用近战，**15 gp**／伤害 **1d8**／重击 **19–20/×2**／**4 lb.**／**Slashing**）。
 * 本仓取名「铁剑」以贴二段的「早期铁器」基调，**数值一律照源**——源条目名 `Longsword` 与本仓名的差异
 * 属 README §三.4「命名可能不同」面（映射数据在 `tests/gates/name-map.json`）。
 * ⚠ 与既有 `items/sword.js`（同名 `Longsword`、同值）的关系：那件是**一段基线件**（未标注层域），
 *   本件是**二段投放件**。二者源相同、值相同 ⇒ 本笔**不复制数值**：本件 = 同源**再声明**，
 *   其存在意义是「二段遭遇表要有一个可引的注册 id」（表只引 id）；数值面由 A 组对源核（同一行）。
 * 3E 判定数学在 `dnd3/core/combat.js`（近战武器共用，加新武器零重复代码）。
 */

DND3.IronSword = RPG.defItem({
	id: 'iron-sword',
	name: '铁剑',
	desc: '矿脉里炼出的第一代铁。比青铜沉，也比青铜可靠。',
	stats: {
		dmg: '1d8',            // SRD 3.5 · `Basic Rules and Legal/equipment.md:765` —— Longsword（中型）1d8
		crit: 2,               // 同上 —— ×2
		critMin: 19,           // 同上 —— 重击威胁 19–20
		weight: 4,             // 同上 —— 4 lb.
		cost: 15,              // 同上 —— 15 gp
		type: 'slashing',      // 同上 —— Slashing
		prof: 'martial',       // SRD 3.5 · `Basic Rules and Legal/equipment.md:88` —— Longsword 属军用武器
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
		DND3.meleeAttack(this, that, from);
	},
});
