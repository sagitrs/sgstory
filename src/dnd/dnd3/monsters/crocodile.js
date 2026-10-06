/* DND3 角色 —— 鳄鱼（`#2027`／七名河 E6：L11 固定教程的四组战斗之一）
 *
 * 数值出处：SRD 3.5 · `Monsters/Monsters - Animals.md:517`（`## Crocodile`：HP 22；AC 15；Str 19／Dex 12／Con 17／Int 1／Wis 12／Cha 2；Hit Dice 3d8+9；Challenge Rating 2）
 * 其余逐值照录（同块）：Base Attack/Grapple +2/+6、Attack `Bite +6 melee (1d8+6)`、`Saves Fort +6, Ref +4, Will +2`。
 * ★`Treasure` ⇒ **不掉 `coin`**：`:37` 的 Animals 总则明写「Animals never possess treasure」。
 *
 * 不落的 SRD 能力（逐条记名，✗ 不静默丢弃；全表见 `#2027` 的二十条对照）：
 *   · 尾击 `tail slap +6 melee (1d12+6)`（`:526` 的「**or**」另一支）—— 本仓攻击件是单件制
 *     （同 `items/natural-attacks.js` 档头的「多肢／Full Attack」条），取咬击**不违原文**（原文本为二者择一）；
 *   · `Hold breath`（`:555`）与 `low-light vision`（`:530`）—— 本仓无憋气／光照消费点；
 *   · `Skills`（`:559`：Hide +7*／Listen +4／Spot +4／Swim +12，含水中加值与掩蔽）与
 *     `Feats`（Alertness／Skill Focus (Hide)）—— 本仓无技能与专长面（同 `monsters/monitor-lizard.js:10` 的记名形）；
 *   · 组织／环境／进阶／等级调整（`:533` 起）—— 无对应量纲。
 * `Saves` 行的三个值**已随 `#2030`（＋`#1762` B-6）声明**（本档 `save_fortitude`／`save_reflex`／`save_will`）：
 *   口径是「字段存**基础加值**、总分＝基础＋属性调整值」⇒ 声明值 ＝ 模板总分 − 模板属性调整值
 *   （Fort +6 − 体质 +3 ＝ 3 等），总分由 `core/saves.js` 现加回来。
 */

DND3.Crocodile = RPG.defCharacter({
	id: 'crocodile',
	name: '鳄鱼',
	hp: 22,
	maxHp: 22,
	stats: DND3.stats({
		// SRD 3.5 · `Monsters/Monsters - Animals.md:532`（`## Crocodile` → Abilities）——Str 19／Dex 12／Con 17／Int 1／Wis 12／Cha 2
		str: 19, dex: 12, con: 17, int: 1, wis: 12, cha: 2,
		// SRD 3.5 · `Monsters/Monsters - Animals.md:531`（`## Crocodile` → Saves：Fort +6, Ref +4, Will +2）——
		//   3.5 的 Saves 行印的是**总分** ⇒ 本行三数是**基础加值**（＝总分 − 属性调整值）：
		//   体质 17（+3）／敏捷 12（+1）／感知 12（+1）；总分由 `core/saves.js` 现加回来
		//   （逐只反算回模板值见 `tests/unit/dnd3/monster-saves.test.js`）。
		save_fortitude: 3, save_reflex: 3, save_will: 1, // 基础加值
		// 出处同上（同一 pin 文件同一块）—— Armor Class 15、Base Attack/Grapple +2/+6、Challenge Rating 2、体型 Medium
		ac: 15, bab: 2, cr: 2, size: 'medium',
	}),
	items: [
		{ id: 'crocodile-bite', equipped: true },   // 天然武器：死亡不掉落（同 goblin.js 的 club）
	],
});

jQuery(document).on(':enginerestart', () => {
	DND3.Crocodile.hp = 22;
	DND3.Crocodile.effects = [];
});
