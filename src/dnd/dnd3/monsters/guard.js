/* DND3 角色 —— 受伤的守卫（NPC 盟友：与玩家并肩作战，可被治疗）
 *
 * house rule（非 SRD）：3.5 SRD 无「Guard」条目（`3.5 Compendium/Monsters/3.5 Monsters - G.md` 内 `## Guard` 零命中）⇒
 *   本条目数值为 house rule 值，不作 SRD 对齐声明（见 #1719）。
 * 数值块与其余角色完全对称。properties 不含 'player'——
 * 交互式战斗中它自动行动（AI 随机攻击敌方），但玩家可以治疗它。
 */

DND3.Guard = RPG.defCharacter({
	id: 'guard',
	name: '受伤的守卫',
	hp: 6,          // 半血入场，需要玩家治疗
	maxHp: 12,
	// house rule（非 SRD 数值）：3E SRD 无「Guard」条目（源仓 `3.5 Compendium/Monsters/3.5 Monsters - G.md` 内 `## Guard` 零命中）；
	// 本块为故事自有（半血入场），P1 行为保全 ⇒ 按原调整值落原始分；对齐评估见 #1719。
	stats: DND3.stats({
		str: 12, dex: 10, con: 12,
		ac: 14, bab: 0, heal_bonus: 0, cr: '1/2',
		/* ★`sgstory#2030`：三豁免的**基础加值**显式写 0 —— 本档无 SRD 模板（见档头）⇒
		 *   无 Saves 行可照录；总分＝属性调整值那一份（体质 +1／敏捷 +0／感知缺省 10 ⇒ +0）。 */
		save_fortitude: 0, save_reflex: 0, save_will: 0,
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
