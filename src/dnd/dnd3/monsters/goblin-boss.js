/* DND3 角色 —— 哥布林首领（比普通哥布林更强，常与喽啰同时出战）
 *
 * 数值块与玩家/哥布林完全对称（3.5 怪物手册的酋长/首领模板加强版）。
 * 存档说明与哥布林相同：挂在规则包上的实例不进存档，:enginerestart 重置。
 */

DND3.GoblinBoss = RPG.defCharacter({
	id: 'goblin-boss',
	name: '哥布林首领',
	hp: 12,
	maxHp: 12,
	stats: DND3.stats({
		str_mod: 1, dex_mod: 2, con_mod: 1, int_mod: 0, wis_mod: 0, cha_mod: 0,
		ac: 16, bab: 1, heal_bonus: 4, cr: '1/3',
	}),
	items: [
		{ id: 'club', equipped: true }, // 装备：死亡不掉落
		{ id: 'coin' },                 // 战利品
		{ id: 'bandage', charges: 1 },  // 攒下来的急救物资也归你
	],
});

// 重新开始时重置（与哥布林同一钩子模式）
jQuery(document).on(':enginerestart', () => {
	DND3.GoblinBoss.hp = 12;
	DND3.GoblinBoss.effects = [];
	DND3.GoblinBoss.items = [
		{ id: 'club', equipped: true },
		{ id: 'coin' },
		{ id: 'bandage', charges: 1 },
	];
});
