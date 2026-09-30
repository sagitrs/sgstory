/* DND5E 怪物 —— 哥布林（数值来自 SRD 5.2.1 · `monsters-A-Z.md:7252`「Goblin Minion」）
 *
 * 命名映射（见 README「规则来源」§三.4）：SRD 5.2.1 **无**单独的「Goblin」条目，
 * 本条目取 **Goblin Minion**（AC 12／HP 7）；源里另有 `Goblin Warrior`（AC 15／HP 10）
 * 与 `Goblin Boss`（AC 17／HP 21）——前者**不是**本条目。
 */

DND5E.Goblin = RPG.defCharacter({
	id: 'goblin',
	name: '哥布林',
	hp: 7, maxHp: 7, // SRD 5.2.1 · monsters-A-Z.md:7257 —— HP 7 (2d6)
	stats: DND5E.stats({
		str: 8, dex: 15, con: 10, // 同上 :7279/7283/7287 —— STR 8(−1) DEX 15(+2) CON 10(+0)
		wis: 8, cha: 8,           // 同上 :7297/7301 —— WIS 8(−1) CHA 8(−1)（INT 10 ⇒ +0 与默认一致）
		ac: 12, prof: 2, cr: '1/4',          // 同上 :7256 —— AC 12
	}),
	items: [{ id: 'club', equipped: true }, { id: 'coin' }],
});

jQuery(document).on(':enginerestart', () => {
	DND5E.Goblin.hp = 7; DND5E.Goblin.effects = [];
	DND5E.Goblin.items = [{ id: 'club', equipped: true }, { id: 'coin' }];
});
