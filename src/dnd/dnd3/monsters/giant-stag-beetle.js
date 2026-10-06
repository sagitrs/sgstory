/* DND3 角色 —— 巨锹甲（二段 11–19 层「矿区怪物」面；Character 实例，声明式写法见 RPG.defCharacter）
 *
 * 数值出处：SRD 3.5 · `Monsters/Monsters - Vermin.md:186`（`## Giant Stag Beetle` → Abilities：
 *   Str 23／Dex 10／Con 17／**Int —**／Wis 10／Cha 9；Hit Dice → **52 hp**；Armor Class **19**；Challenge Rating **4**）
 *   —— 逐值照录，**无设计改动**。
 * ⚠ **Int「—」的落法**（二段首遇）：源为 **vermin** ⇒ `Int ---` 是**无心智**（非「0 分」）。本仓
 *   `STAT_BLOCK` 是六维对称块（#1697 §决策二）⇒ 无「none」态可表示；照 `d20m/monsters/armature-drone.js`
 *   先例落**缺省 10** 并登记缺口（落地须先动 STAT_BLOCK 语义，另票）。故本件 `int: 10` **非源值**，
 *   且源侧抽不出 Int ⇒ 不入门 A 组 ⇒ **此注释是唯一留痕**（#1778 body 亦登记）。
 * 段内定位（house rule，非 SRD）：L18–L19 基调敌人（CR 4；定标见 `core/climb2.js` 的 `SPAN2_SCALING`）。
 * 不落的 SRD 能力：vermin 的 `Darkvision`／`Immune to mind-affecting`（无消费点即不声明，同 #1736 判据 1）。
 */

DND3.GiantStagBeetle = RPG.defCharacter({
	id: 'giant-stag-beetle',
	name: '巨锹甲',
	hp: 52,
	maxHp: 52,
	stats: DND3.stats({
		// SRD 3.5 · `Monsters/Monsters - Vermin.md:186`（`## Giant Stag Beetle` → Abilities）——Str 23／Dex 10／Con 17／Wis 10／Cha 9（Int 源为「—」⇒ 见文件头缺口说明）
		str: 23, dex: 10, con: 17, int: 10, wis: 10, cha: 9,
		// SRD 3.5 · `Monsters/Monsters - Vermin.md:200`（`## Giant Stag Beetle` → Saves：Fort +8, Ref +2, Will +2）——
		//   3.5 的 Saves 行印的是**总分** ⇒ 本行三数是**基础加值**（＝总分 − 属性调整值）：
		//   体质 17（+3）／敏捷 10（+0）／感知 10（+0）；总分由 `core/saves.js` 现加回来
		//   （逐只反算回模板值见 `tests/unit/dnd3/monster-saves.test.js`）。
		save_fortitude: 5, save_reflex: 2, save_will: 2, // 基础加值
		// 出处同上（同一 pin 文件同一行）—— Armor Class 19、Challenge Rating 4
		ac: 19, bab: 5, cr: 4,
	}),
	items: [
		{ id: 'coin' },          // 战利品：死亡掉落（与哥布林同规则）
		/* ★`#1855`：天然攻击件 —— `equipped: true`（同 `goblin.js` 的 club：①自动通路可取到 ②死亡**不掉落**）。
		 *   数值**逐值照录** pinned，攻击加值走 `stats.atkBonus`（✗ 引擎推导）；
		 *   档头逐只反解与「不落项」清单见 `items/natural-attacks.js`。 */
		{ id: 'giant-stag-beetle-bite', equipped: true },   // 巨鹿甲虫咬
	],
});

jQuery(document).on(':enginerestart', () => {
	DND3.GiantStagBeetle.hp = 52;
	DND3.GiantStagBeetle.effects = [];
});
