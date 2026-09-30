/* DND3 角色 —— 哥布林（Character 实例，声明式写法见 RPG.defCharacter）
 *
 * 数值出处：SRD 3.5 · `3.5 Compendium/Monsters/3.5 Monsters - G.md:1283`（`## Goblin` → Abilities：
 *   Str 11／Dex 13／Con 12／Int 10／Wis 9／Cha 6 ⇒ 调整值 0／+1／+1／0／−1／−2）。
 * house rule（非 SRD）：HP 5→6（maxHp 7）、BAB +1→−1、CR 1/3→1/4——沿用既有设计，
 *   本笔只对齐属性调整值（见 #1719）。
 * 存档说明：挂在规则包上的实例不进存档（引擎重新开始也不会自动重置），
 * 需要持久化的角色请在 State 里存纯数据快照；这里用 :enginerestart
 * 事件把哥布林恢复到初始伤势，保证每次冒险遭遇的都是受伤的它。
 */

DND3.Goblin = RPG.defCharacter({
	id: 'goblin',
	name: '哥布林',
	hp: 6,
	maxHp: 7,
	// 数值块与玩家完全对称（属性调整值见文件头出处；与源 Abilities 一致）
	stats: DND3.stats({
		// SRD 3.5 · `3.5 Compendium/Monsters/3.5 Monsters - G.md:1283`（`## Goblin` → Abilities）——Str 11／Dex 13／Con 12／Int 10／Wis 9／Cha 6
		str: 11, dex: 13, con: 12, int: 10, wis: 9, cha: 6,
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
