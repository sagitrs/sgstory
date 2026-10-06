/* DND3 角色 —— 巨蜥（一段 1–9 层「地栖怪物」面，Character 实例，声明式写法见 RPG.defCharacter）
 *
 * 数值出处：SRD 3.5 · `Monsters/Monsters - Animals.md:1165`（`## Lizard, Monitor` → Abilities：Str 17／Dex 15／Con 17／Int 1／Wis 12／Cha 2；Hit Dice 3d8+9 (22 hp)；Armor Class 15；Challenge Rating 2）
 *   —— 逐值照录，**无设计改动**。源条目名为「Lizard, Monitor」（置后式），本仓注册名为 `monitor-lizard`
 *   ⇒ 属「命名可能不同」面（README §三.4）：引用**以源条目名为准**（已照录）。
 *   ⚠ 本笔**未**把它加入 `tests/gates/name-map.json`：C 组校验硬编码 `### <entry>` 前缀，而 3E 的
 *   `Monsters - Animals.md` 条目是 **h2**（`## Lizard, Monitor`）⇒ 入表必**假红**。⇒ 门侧缺口已记入本 PR
 *   （建议 C 组改 `#{2,6}`），修门归测试域，不在本笔车道。
 * 段内定位（house rule，非 SRD）：`L6`–`L9` 的「地栖」压力源（CR 2；定标见 `core/climb.js`）。
 * 行为：SRD 的 `Skills`（游泳/躲藏种族加值）属判定加值面，本笔不落（无消费点即不声明）。
 */

DND3.MonitorLizard = RPG.defCharacter({
	id: 'monitor-lizard',
	name: '巨蜥',
	hp: 22,
	maxHp: 22,
	stats: DND3.stats({
		// SRD 3.5 · `Monsters/Monsters - Animals.md:1165`（`## Lizard, Monitor` → Abilities）——Str 17／Dex 15／Con 17／Int 1／Wis 12／Cha 2
		str: 17, dex: 15, con: 17, int: 1, wis: 12, cha: 2,
		// SRD 3.5 · `Monsters/Monsters - Animals.md:1179`（`## Lizard, Monitor` → Saves：Fort +8, Ref +5, Will +2）——
		//   3.5 的 Saves 行印的是**总分** ⇒ 本行三数是**基础加值**（＝总分 − 属性调整值）：
		//   体质 17（+3）／敏捷 15（+2）／感知 12（+1）；总分由 `core/saves.js` 现加回来
		//   （逐只反算回模板值见 `tests/unit/dnd3/monster-saves.test.js`）。
		save_fortitude: 5, save_reflex: 3, save_will: 1, // 基础加值
		// 出处同上（同一 pin 文件同一行）—— Armor Class 15、Base Attack/Grapple +2、Challenge Rating 2
		ac: 15, bab: 2, cr: 2,
	}),
	items: [
		{ id: 'coin' },          // 战利品：死亡掉落（与哥布林同规则）
		/* ★`#1855`：天然攻击件 —— `equipped: true`（同 `goblin.js` 的 club：①自动通路可取到 ②死亡**不掉落**）。
		 *   数值**逐值照录** pinned，攻击加值走 `stats.atkBonus`（✗ 引擎推导）；
		 *   档头逐只反解与「不落项」清单见 `items/natural-attacks.js`。 */
		{ id: 'monitor-lizard-bite', equipped: true },   // 巨蜥咬
	],
});

jQuery(document).on(':enginerestart', () => {
	DND3.MonitorLizard.hp = 22;
	DND3.MonitorLizard.effects = [];
});
