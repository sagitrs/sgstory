/* DND3 角色 —— 巨蜂（二段 11–19 层「矿区怪物」面；Character 实例，声明式写法见 RPG.defCharacter）
 *
 * 数值出处：SRD 3.5 · `Monsters/Monsters - Vermin.md:79`（`## Giant Bee` → Abilities：
 *   Str 11／Dex 14／Con 11／**Int —**／Wis 12／Cha 9；Hit Dice → **13 hp**；Armor Class **14**；Challenge Rating **1**）
 *   —— 逐值照录，**无设计改动**。
 * ⚠ **Int「—」的落法**（二段首遇）：源为 **vermin** ⇒ `Int ---` 是**无心智**（非「0 分」）。本仓
 *   `STAT_BLOCK` 是六维对称块（#1697 §决策二）⇒ 无「none」态可表示；照 `d20m/monsters/armature-drone.js`
 *   先例落**缺省 10** 并登记缺口（落地须先动 STAT_BLOCK 语义，另票）。故本件 `int: 10` **非源值**，
 *   且源侧抽不出 Int ⇒ 不入门 A 组 ⇒ **此注释是唯一留痕**（#1778 body 亦登记）。
 * 段内定位（house rule，非 SRD）：L13–L15 基调敌人（CR 1；定标见 `core/climb2.js` 的 `SPAN2_SCALING`）。
 * 不落的 SRD 能力：vermin 的 `Darkvision`／`Immune to mind-affecting`（无消费点即不声明，同 #1736 判据 1）。
 */

DND3.GiantBee = RPG.defCharacter({
	id: 'giant-bee',
	name: '巨蜂',
	hp: 13,
	maxHp: 13,
	stats: DND3.stats({
		// SRD 3.5 · `Monsters/Monsters - Vermin.md:79`（`## Giant Bee` → Abilities）——Str 11／Dex 14／Con 11／Wis 12／Cha 9（Int 源为「—」⇒ 见文件头缺口说明）
		str: 11, dex: 14, con: 11, int: 10, wis: 12, cha: 9,
		// 出处同上（同一 pin 文件同一行）—— Armor Class 14、Challenge Rating 1
		ac: 14, bab: 2, cr: 1,
	}),
	items: [{ id: 'coin' }],
});

jQuery(document).on(':enginerestart', () => {
	DND3.GiantBee.hp = 13;
	DND3.GiantBee.effects = [];
});
