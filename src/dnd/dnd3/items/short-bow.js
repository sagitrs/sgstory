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
		DND3.meleeAttack(this, that, from);
	},
});
