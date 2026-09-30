/* DND5E 怪物 —— 哥布林首领（数值来自 SRD 5.2.1 · `monsters-A-Z.md:7404`「Goblin Boss」） */

DND5E.GoblinBoss = RPG.defCharacter({
	id: 'goblin-boss',
	name: '哥布林首领',
	hp: 21, maxHp: 21, // SRD 5.2.1 · monsters-A-Z.md:7409 —— HP 21 (6d6)
	stats: DND5E.stats({
		str: 10, dex: 15, con: 10, // 同上 :7431/7435/7439 —— STR 10(+0) DEX 15(+2) CON 10(+0)
		wis: 8,                    // 同上 :7449 —— WIS 8(−1)（CHA 10／INT 10 ⇒ +0 与默认一致）
		ac: 17, prof: 2, cr: '1',           // 同上 :7408 —— AC 17
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
