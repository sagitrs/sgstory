/* DND3 角色 —— 野猪（一段 1–9 层「荒兽」面，Character 实例，声明式写法见 RPG.defCharacter）
 *
 * 数值出处：SRD 3.5 · `Monsters/Monsters - Animals.md:356`（`## Boar` → Abilities：Str 15／Dex 10／Con 17／Int 2／Wis 13／Cha 4；Hit Dice 3d8+12 (25 hp)；Armor Class 16；Challenge Rating 2）
 *   —— 逐值照录，**无设计改动**。
 * 段内定位（house rule，非 SRD）：`L5`–`L9` 的中坚（CR 2；定标见 `core/climb.js` 的 `SPAN1_SCALING`）。
 * 行为：`Ferocity (Ex)`（濒死仍全额行动）需「hp ≤ 0 时的行动判定」原语——本笔**不落**（范围外登记，
 *   见文件尾），仅注明来源，不冒充已实现。
 */

DND3.Boar = RPG.defCharacter({
	id: 'boar',
	name: '野猪',
	hp: 25,
	maxHp: 25,
	stats: DND3.stats({
		// SRD 3.5 · `Monsters/Monsters - Animals.md:356`（`## Boar` → Abilities）——Str 15／Dex 10／Con 17／Int 2／Wis 13／Cha 4
		str: 15, dex: 10, con: 17, int: 2, wis: 13, cha: 4,
		// 出处同上（同一 pin 文件同一行）—— Armor Class 16、Base Attack/Grapple +2、Challenge Rating 2
		ac: 16, bab: 2, cr: 2,
	}),
	items: [
		{ id: 'coin' },          // 战利品：死亡掉落（与哥布林同规则）
		/* ★`#1855`：天然攻击件 —— `equipped: true`（同 `goblin.js` 的 club：①自动通路可取到 ②死亡**不掉落**）。
		 *   数值**逐值照录** pinned，攻击加值走 `stats.atkBonus`（✗ 引擎推导）；
		 *   档头逐只反解与「不落项」清单见 `items/natural-attacks.js`。 */
		{ id: 'boar-gore', equipped: true },   // 野猪獠牙
	],
});

jQuery(document).on(':enginerestart', () => {
	DND3.Boar.hp = 25;
	DND3.Boar.effects = [];
});

/* 范围外登记（#1748）：Ferocity / Trip / Rage 这类「条件触发特技」在引擎侧需要
 * 「命中后追加」「濒死行动」原语（#1729 分析的 B5 族）——本笔只落**数值面**，
 * 特技面待引擎原语票；定义内不留假字段（无消费点即不声明，防死键，同 #1736 判据 1）。
 */
