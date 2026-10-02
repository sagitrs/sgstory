/* DND3 角色 —— 狼（一段 1–9 层「荒兽」面，Character 实例，声明式写法见 RPG.defCharacter）
 *
 * 数值出处：SRD 3.5 · `Monsters/Monsters - Animals.md:2302`（`## Wolf` → Abilities：Str 13／Dex 15／Con 15／Int 2／Wis 12／Cha 6；Hit Dice 2d8+4 (13 hp)；Armor Class 14；Challenge Rating 1）
 *   —— 逐值照录，**无设计改动**。
 * 段内定位（house rule，非 SRD）：`L3`–`L5` 的主力（CR 1；定标见 `core/climb.js` 的 `SPAN1_SCALING`）。
 * 行为：`Trip (Ex)`（咬中后可绊摔）是 SRD 的**条件触发**能力，需「命中后追加检定」原语——
 *   本笔**不落**（引擎无该原语，见 #1748 范围外登记），仅在此注明来源，不冒充已实现。
 */

DND3.Wolf = RPG.defCharacter({
	id: 'wolf',
	name: '狼',
	hp: 13,
	maxHp: 13,
	stats: DND3.stats({
		// SRD 3.5 · `Monsters/Monsters - Animals.md:2302`（`## Wolf` → Abilities）——Str 13／Dex 15／Con 15／Int 2／Wis 12／Cha 6
		str: 13, dex: 15, con: 15, int: 2, wis: 12, cha: 6,
		// 出处同上（同一 pin 文件同一行）—— Armor Class 14、Base Attack/Grapple +1、Challenge Rating 1
		ac: 14, bab: 1, cr: 1,
	}),
	items: [
		{ id: 'coin' },          // 战利品：死亡掉落（与哥布林同规则）
		/* ★`#1855`：天然攻击件 —— `equipped: true`（同 `goblin.js` 的 club：①自动通路可取到 ②死亡**不掉落**）。
		 *   数值**逐值照录** pinned，攻击加值走 `stats.atkBonus`（✗ 引擎推导）；
		 *   档头逐只反解与「不落项」清单见 `items/natural-attacks.js`。 */
		{ id: 'wolf-bite', equipped: true },   // 狼咬
	],
});

jQuery(document).on(':enginerestart', () => {
	DND3.Wolf.hp = 13;
	DND3.Wolf.effects = [];
});
