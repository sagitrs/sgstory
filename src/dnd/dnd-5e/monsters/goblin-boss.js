/* DND5E 怪物 —— 哥布林首领（数值来自 5E SRD） */

DND5E.GoblinBoss = RPG.defCharacter({
	id: 'goblin-boss',
	name: '哥布林首领',
	hp: 21, maxHp: 21, // SRD：HP 21 (6d6)
	stats: DND5E.stats({
		str_mod: 0, dex_mod: 2, con_mod: 0, // SRD：STR 10(+0) DEX 15(+2)
		ac: 17, prof: 2, cr: '1',
	}),
	items: [
		{ id: 'club', equipped: true },
		{ id: 'coin' },
		{ id: 'bandage', charges: 1 },
	],
});

jQuery(document).on(':enginerestart', () => {
	DND5E.GoblinBoss.hp = 21; DND5E.GoblinBoss.effects = [];
	DND5E.GoblinBoss.items = [
		{ id: 'club', equipped: true }, { id: 'coin' }, { id: 'bandage', charges: 1 },
	];
});
