/* DND3 角色 —— 水元素（Small／Medium 两型；`#2027`／七名河 E6：L11 固定教程的四组战斗之二）
 *
 * 数值出处：SRD 3.5 · `3.5 Compendium/Monsters/3.5 Monsters - E.md:312`（`### Water Elemental` 三档总表）
 *   —— 本档只落**首版教程用到的两型**（Small／Medium），逐值照录：
 *   · Small：Hit Dice 2d8+2 (11 hp)；Armor Class 17；Base Attack/Grapple +1/-1；Attack Slam +4 melee (1d6+3)；Saves Fort +4, Ref +0, Will +0；Abilities Str 14, Dex 10, Con 13, Int 4, Wis 11, Cha 11；Challenge Rating 1；体型 Small；
 *   · Medium：Hit Dice 4d8+12 (30 hp)；Armor Class 19；Base Attack/Grapple +3/+6；Attack Slam +6 melee (1d8+4)；Saves Fort +7, Ref +2, Will +1；Abilities Str 16, Dex 12, Con 17, Int 4, Wis 11, Cha 11；Challenge Rating 3；体型 Medium。
 *   ⚠ 大型及以上（Large/Huge/Greater/Elder）**本档不落** —— 首版教程不用（另票按需补）。
 * ★`Water mastery`（同 pin `:370` 的原文段）经 `stats` 之外的**效果**声明（`effects: ['water-mastery']`）
 *   接进 `core/water.js`：与对手**都**触水 ⇒ 攻击与伤害 +1；有一方只挨着非水地面 ⇒ −4。
 *   ⚠ 与 `Slam +4/1d6+3` 这些数值**不重叠** —— 原文自己写明「这些修正**不包含在**数值块里」。
 * ★`Treasure: None`（同 pin `:333`）⇒ **不掉 `coin`**；战场的固定散货由故事侧交付（`sgstory#2026`）。
 *
 * 不落的 SRD 能力（逐条记名，✗ 不静默丢弃；全表见 `#2027` 的二十条对照）：
 *   · `Drench`（同 pin `:375`）与 `Vortex`（同上 `:378`）—— 首版**公开不落**（领队预准、操作者终裁：
 *     E6 允许玩家留在干地，依 Water Mastery 实际处理）；
 *   · `elemental traits`（`:325` 的 Special Qualities 行）：不须呼吸／免疫毒素与睡眠与麻痹与震慑／
 *     不受重击与夹击／黑暗视觉 60 尺 —— 本仓无呼吸、免疫、重击判定与光照消费点（同
 *     `monsters/bombardier-beetle.js:11` 的「无消费点即不声明」记名形）；
 *   · `Skills`（Listen／Spot）与 `Feats`（Power Attack；Medium 另加 Cleave）—— 本仓无技能与专长面。
 *     ⚠ **专长会改实际输出**（Power Attack／Cleave）⇒ 这一条按 `#2027` 终裁的口径**具名**记在此处，
 *     战力差额由故事侧 S5／S8 的平衡面记账（✗ 不静默省）；
 *   · `Speed 20 ft., swim 90 ft.`、`Space/Reach`、`Organization`、`Advancement`、
 *     `Alignment: Usually neutral`、`Level Adjustment`、以及「不能离开被召唤水体 180 尺」——
 *     本仓无移动量纲与这些字段。
 * `Saves` 行的三个值**已随 `#2030`（＋`#1762` B-6）声明**（同 `monsters/crocodile.js` 的口径）：
 *   字段存**基础加值**，总分＝基础＋属性调整值 —— Small `Fort +4` − 体质 +1 ＝ 3 等；
 *   Medium `Fort +7` − +3 ＝ 4 等。
 */

/** 两型水元素共用的声明（差异只在数值 ⇒ 一处写形、两处给值，同 `items/natural-attacks.js` 的生成器形） */
const 水元素 = ({ id, name, hp, stats, item }) => RPG.defCharacter({
	id,
	name,
	hp,
	maxHp: hp,
	stats: DND3.stats(stats),
	effects: ['water-mastery'],
	items: [{ id: item, equipped: true }],   // 天然武器：死亡不掉落
});

/* Small：SRD 3.5 · `3.5 Compendium/Monsters/3.5 Monsters - E.md:312`（`### Water Elemental` → Abilities：Str 14／Dex 10／Con 13／Int 4／Wis 11／Cha 11；Hit Dice 2d8+2 (11 hp)；Armor Class 17；Slam +4 melee (1d6+3)；Challenge Rating 1） */
DND3.SmallWaterElemental = 水元素({
	id: 'small-water-elemental',
	name: '小型水元素',
	hp: 11,
	stats: {
		str: 14, dex: 10, con: 13, int: 4, wis: 11, cha: 11,
		// SRD 3.5 · `3.5 Compendium/Monsters/3.5 Monsters - E.md:326`（`### Water Elemental, Small` → Saves：Fort +4, Ref +0, Will +0）——
		//   3.5 的 Saves 行印的是**总分** ⇒ 本行三数是**基础加值**（＝总分 − 属性调整值）：
		//   体质 13（+1）／敏捷 10（+0）／感知 11（+0）；总分由 `core/saves.js` 现加回来
		//   （逐只反算回模板值见 `tests/unit/dnd3/monster-saves.test.js`）。
		save_fortitude: 3, save_reflex: 0, save_will: 0, // 基础加值
		// 出处同上（同一 pin 文件的 AC 行与 Base Attack/Grapple 行、Challenge Rating 行）—— AC 17、BAB +1、CR 1
		ac: 17, bab: 1, cr: 1, size: 'small',
	},
	item: 'small-water-elemental-slam',
});

/* Medium：SRD 3.5 · `3.5 Compendium/Monsters/3.5 Monsters - E.md:312`（`### Water Elemental` → Abilities：Str 16／Dex 12／Con 17／Int 4／Wis 11／Cha 11；Hit Dice 4d8+12 (30 hp)；Armor Class 19；Slam +6 melee (1d8+4)；Challenge Rating 3） */
DND3.MediumWaterElemental = 水元素({
	id: 'medium-water-elemental',
	name: '中型水元素',
	hp: 30,
	stats: {
		str: 16, dex: 12, con: 17, int: 4, wis: 11, cha: 11,
		// SRD 3.5 · `3.5 Compendium/Monsters/3.5 Monsters - E.md:326`（`### Water Elemental, Medium` → Saves：Fort +7, Ref +2, Will +1）——
		//   3.5 的 Saves 行印的是**总分** ⇒ 本行三数是**基础加值**（＝总分 − 属性调整值）：
		//   体质 17（+3）／敏捷 12（+1）／感知 11（+0）；总分由 `core/saves.js` 现加回来
		//   （逐只反算回模板值见 `tests/unit/dnd3/monster-saves.test.js`）。
		save_fortitude: 4, save_reflex: 1, save_will: 1, // 基础加值
		// 出处同上（同一 pin 文件的 AC 行与 Base Attack/Grapple 行、Challenge Rating 行）—— AC 19、BAB +3、CR 3
		ac: 19, bab: 3, cr: 3, size: 'medium',
	},
	item: 'medium-water-elemental-slam',
});

jQuery(document).on(':enginerestart', () => {
	DND3.SmallWaterElemental.hp = 11;
	DND3.SmallWaterElemental.effects = ['water-mastery'];
	DND3.MediumWaterElemental.hp = 30;
	DND3.MediumWaterElemental.effects = ['water-mastery'];
});
