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
		// 出处同上（同一 pin 文件同一行）—— Armor Class 15、Base Attack/Grapple +2、Challenge Rating 2
		ac: 15, bab: 2, cr: 2,
	}),
	items: [
		{ id: 'coin' },
	],
});

jQuery(document).on(':enginerestart', () => {
	DND3.MonitorLizard.hp = 22;
	DND3.MonitorLizard.effects = [];
});
