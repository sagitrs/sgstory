/* DND3 道具 —— 短弓（远程武器：1d6 穿刺，用灵巧，射程 80 英尺）
 * 判定数学在 dnd3/core/combat.js 的 DND3.meleeAttack（ranged 分支）——
 * 与近战武器共用同一套数学，本文件只有数据声明。
 */

DND3.ShortBow = RPG.defItem({
	id: 'short-bow',
	name: '短弓',
	desc: '哥布林制的粗糙短弓，射程约 80 英尺。',
	stats: {
		dmg: '1d6',
		type: 'piercing',
		range: 80,
		weight: 2,
		cost: 30,
		prof: 'martial',
		ranged: true,  // 攻击/伤害用灵巧（meleeAttack 的 ranged 分支处理）
	},
	weapon: true,
	slot: 'weapon',
	charges: null,
	stackable: false,
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
