/* DND3 道具 —— 木棒（SRD 3.5 · `Basic Rules and Legal/equipment.md:427-434`：简单近战武器 Club，中型 **1d6** 钝击，**×2** 重击，投掷 10 ft.）
 * 3E 判定数学在 dnd3/core/combat.js（近战武器共用，加新武器零重复）。
 */

DND3.Club = RPG.defItem({
	id: 'club',
	name: '木棒',
	desc: '一根结实的硬木短棒。随手可得，但敲在头上一样疼。',
	stats: {
		dmg: '1d6',          // 伤害骰（中型 wielder）
		crit: 2,             // 重击倍率 ×2
		range: 10,           // 射程增量 10 英尺
		weight: 3,           // 3 磅
		cost: 0,             // 价格可忽略
		type: 'bludgeoning', // 钝击伤害
		prof: 'simple',      // 简单武器
	},
	charges: null,
	stackable: false,
	weapon: true,
	slot: 'weapon',
	actions: {
		equip: RPG.slotEquip,
		unequip: RPG.slotUnequip,
	},

	used(that, from, 源 = null) {
		/* ★**转发返回值**（`#1813`）：攻击层现在会在「打不出去」（腾不出手／没弹药）时
 *   `return false`；块体若不转发，`RPG.act` 拿到的仍是 `undefined` ⇒ 被算作 `applied`
 *   ⇒ `#1773` 的三连拒绝护栏在这一面失效。⇒ 与 `dnd-5e` 侧同笔（笔 1／笔 2）。 */
		return DND3.meleeAttack(this, that, from, 源);
	},
});
