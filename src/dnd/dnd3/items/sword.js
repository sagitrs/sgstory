/* DND3 道具 —— 长剑（SRD 3.5 · `Basic Rules and Legal/equipment.md:765-774`：军用近战武器 Longsword，中型 **1d8** 挥砍，**19–20/×2** 重击）
 * 与木棒共用 dnd3/core/combat.js 的 3E 判定——本文件只有数据。
 */

DND3.Sword = RPG.defItem({
	id: 'sword',
	name: '长剑',
	desc: '制式长剑，剑刃上有保养留下的油光。比木棒体面得多。',
	stats: {
		dmg: '1d8',          // 伤害骰
		crit: 2,             // 重击倍率 ×2
		critMin: 19,         // 重击威胁范围 19-20（木棒是 20）
		range: 0,            // 近战
		weight: 4,           // 4 磅
		cost: 15,            // 15 金币
		type: 'slashing',    // 挥砍伤害
		prof: 'martial',     // 军用武器
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
