/* DND3 角色 —— 受伤的守卫（NPC 盟友：与玩家并肩作战，可被治疗）
 *
 * 数值块与其余角色完全对称。properties 不含 'player'——
 * 交互式战斗中它自动行动（AI 随机攻击敌方），但玩家可以治疗它。
 */

DND3.Guard = RPG.defCharacter({
	id: 'guard',
	name: '受伤的守卫',
	hp: 6,          // 半血入场，需要玩家治疗
	maxHp: 12,
	stats: DND3.stats({
		str_mod: 1, dex_mod: 0, con_mod: 1,
		ac: 14, bab: 0, heal_bonus: 0, cr: '1/2',
	}),
	items: [
		{ id: 'club', equipped: true }, // 有武器，可以反击
	],
});

// 重新开始时重置（与哥布林同一钩子模式）
jQuery(document).on(':enginerestart', () => {
	DND3.Guard.hp = 6;
	DND3.Guard.effects = [];
	DND3.Guard.items = [{ id: 'club', equipped: true }];
});
