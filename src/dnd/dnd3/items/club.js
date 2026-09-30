/* DND3 道具 —— 木棒（D&D 3.5 SRD：简单近战武器，1d6 钝击，×2 重击）
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

	used(that, from) {
		DND3.meleeAttack(this, that, from);
	},
});
