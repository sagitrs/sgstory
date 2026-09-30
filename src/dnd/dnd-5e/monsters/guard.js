/* DND5E 怪物 —— 受伤的守卫（NPC 盟友，可被玩家治疗） */

DND5E.Guard = RPG.defCharacter({
	id: 'guard',
	name: '受伤的守卫',
	hp: 6, maxHp: 12,
	stats: DND5E.stats({
		str_mod: 1, dex_mod: 0, con_mod: 1,
		ac: 14, prof: 2, cr: '1/8',
	}),
	items: [{ id: 'club', equipped: true }],
});

jQuery(document).on(':enginerestart', () => {
	DND5E.Guard.hp = 6; DND5E.Guard.effects = [];
	DND5E.Guard.items = [{ id: 'club', equipped: true }];
});
