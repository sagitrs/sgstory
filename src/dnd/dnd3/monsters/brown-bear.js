/* DND3 角色 —— 棕熊（二段 11–19 层「猎场怪兽」面；Character 实例，声明式写法见 RPG.defCharacter）
 *
 * 数值出处：SRD 3.5 · `Monsters/Monsters - Animals.md:230`（`## Bear, Brown` → Abilities：
 *   Str 27／Dex 13／Con 19／Int 2／Wis 12／Cha 6；Hit Dice 6d8+24 → **51 hp**；Armor Class **15**；Challenge Rating **4**）
 *   —— 逐值照录，**无设计改动**。
 * 段内定位（house rule，非 SRD）：`L18`–`L19` 的「猎场怪兽」压力峰值（CR 4；定标见 `core/climb2.js`）。
 * 不落的 SRD 能力：`Improved Grab`／`Scent`（需「命中后追加」原语，同一段的 Rage/Trip 族 —— 范围外登记）。
 */

DND3.BrownBear = RPG.defCharacter({
	id: 'brown-bear',
	name: '棕熊',
	hp: 51,
	maxHp: 51,
	stats: DND3.stats({
		// SRD 3.5 · `Monsters/Monsters - Animals.md:230`（`## Bear, Brown` → Abilities）——Str 27／Dex 13／Con 19／Int 2／Wis 12／Cha 6
		str: 27, dex: 13, con: 19, int: 2, wis: 12, cha: 6,
		// 出处同上（同一 pin 文件同一行）—— Armor Class 15、Challenge Rating 4
		ac: 15, bab: 4, cr: 4,
	}),
	items: [{ id: 'coin' }],
});

jQuery(document).on(':enginerestart', () => {
	DND3.BrownBear.hp = 51;
	DND3.BrownBear.effects = [];
});
