/* DND5E 怪物 —— 哥布林（数值来自 5E SRD） */

DND5E.Goblin = RPG.defCharacter({
	id: 'goblin',
	name: '哥布林',
	hp: 7, maxHp: 7, // SRD：HP 7 (2d6)
	stats: DND5E.stats({
		str_mod: -1, dex_mod: 2, con_mod: 0, // SRD：STR 8(-1) DEX 15(+2) CON 10(+0)
		ac: 12, prof: 2, cr: '1/4',
	}),
	items: [{ id: 'club', equipped: true }, { id: 'coin' }],
});

jQuery(document).on(':enginerestart', () => {
	DND5E.Goblin.hp = 7; DND5E.Goblin.effects = [];
	DND5E.Goblin.items = [{ id: 'club', equipped: true }, { id: 'coin' }];
});
