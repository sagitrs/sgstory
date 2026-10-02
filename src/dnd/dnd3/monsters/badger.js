/* DND3 角色 —— 獾（一段 1–9 层「荒兽」面的最小型，Character 实例，声明式写法见 RPG.defCharacter）
 *
 * 数值出处：SRD 3.5 · `Monsters/Monsters - Animals.md:113`（`## Badger` → Abilities：Str 8／Dex 17／Con 15／Int 2／Wis 12／Cha 6；Hit Dice 1d8+2 (6 hp)；Armor Class 15；Challenge Rating 1/2）
 *   —— 逐值照录，**无设计改动**（与 `monsters/goblin.js` 的「设计值」不同，本笔不引入偏离）。
 * 段内定位（house rule，非 SRD）：`L1`–`L4` 的基调敌人（CR 1/2；定标见 `core/climb.js` 的 `SPAN1_SCALING`）。
 * 行为：无远程、无特殊攻击的纯近战扑咬（`Rage` 为 SRD 的**条件触发**能力，本笔不落——见下）。
 * 存档说明：挂在规则包上的实例不进存档；需要持久化的请存纯数据快照（同 `monsters/goblin.js`）。
 */

DND3.Badger = RPG.defCharacter({
	id: 'badger',
	name: '獾',
	hp: 6,
	maxHp: 6,
	// 数值块与玩家完全对称（原始分见文件头出处）
	stats: DND3.stats({
		// SRD 3.5 · `Monsters/Monsters - Animals.md:113`（`## Badger` → Abilities）——Str 8／Dex 17／Con 15／Int 2／Wis 12／Cha 6
		str: 8, dex: 17, con: 15, int: 2, wis: 12, cha: 6,
		// 出处同上（同一 pin 文件同一行）—— Armor Class 15、Base Attack/Grapple +0、Challenge Rating 1/2
		ac: 15, bab: 0, cr: '1/2',
	}),
	items: [
		{ id: 'coin' },          // 战利品：死亡掉落（与哥布林同规则）
		/* ★`#1855`：天然攻击件 —— `equipped: true`（同 `goblin.js` 的 club：①自动通路可取到 ②死亡**不掉落**）。
		 *   数值**逐值照录** pinned，攻击加值走 `stats.atkBonus`（✗ 引擎推导）；
		 *   档头逐只反解与「不落项」清单见 `items/natural-attacks.js`。 */
		{ id: 'badger-claw', equipped: true },   // 獾爪
	],
});

jQuery(document).on(':enginerestart', () => {
	DND3.Badger.hp = 6;
	DND3.Badger.effects = [];
});
