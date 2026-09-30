/* DND5E 怪物 —— 受伤的守卫（NPC 盟友，可被玩家治疗）
 *
 * 数值出处：SRD 5.2.1 · `monsters-A-Z.md:8753`（「Guard」）——属性调整值取源
 *   DEX 12（+1）／CON 12（+1）；WIS 11、CHA 10、INT 10 均为 +0，与本仓默认一致，故未另设。
 * house rule（非 SRD）：HP 11→6／12、AC 16→14——「受伤入场」的设计变体（见 #1719）。
 */

DND5E.Guard = RPG.defCharacter({
	id: 'guard',
	name: '受伤的守卫',
	hp: 6, maxHp: 12,
	stats: DND5E.stats({
		str: 13, dex: 12, con: 12, // 同上 :8753（Guard）—— STR 13(+1) DEX 12(+1) CON 12(+1)
		//                             WIS 11／CHA 10／INT 10 均为 +0，与本仓默认一致，故未另设。
		ac: 14, prof: 2, cr: '1/8', // house rule（非 SRD）：本条目以「受伤入场」设计值替代源值（源 16／11），见文件头（#1719）
	}),
	items: [{ id: 'club', equipped: true }],
});

jQuery(document).on(':enginerestart', () => {
	DND5E.Guard.hp = 6; DND5E.Guard.effects = [];
	DND5E.Guard.items = [{ id: 'club', equipped: true }];
});
