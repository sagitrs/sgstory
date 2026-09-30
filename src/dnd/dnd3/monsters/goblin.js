/* DND3 角色 —— 哥布林（Character 实例，声明式写法见 RPG.defCharacter）
 *
 * 存档说明：挂在规则包上的实例不进存档（引擎重新开始也不会自动重置），
 * 需要持久化的角色请在 State 里存纯数据快照；这里用 :enginerestart
 * 事件把哥布林恢复到初始伤势，保证每次冒险遭遇的都是受伤的它。
 */

DND3.Goblin = RPG.defCharacter({
	id: 'goblin',
	name: '哥布林',
	hp: 6,
	maxHp: 7,
	// 数值块与玩家完全对称（对齐 3.5 怪物手册：Dex15→+2、Con12→+1、Wis9→-1、Cha6→-2）
	stats: DND3.stats({
		str_mod: -1, dex_mod: 2, con_mod: 1, int_mod: 0, wis_mod: -1, cha_mod: -2,
		ac: 15, bab: -1, heal_bonus: 3, cr: '1/4',
	}),
	items: [
		{ id: 'club', equipped: true }, // 装备：死亡不掉落（与宝箱规则对称）
		{ id: 'coin' }, // 战利品：死亡掉落
	],
});

jQuery(document).on(':enginerestart', () => {
	DND3.Goblin.hp = 6;
	DND3.Goblin.effects = [];
});
