/* DND3 角色 —— 爆甲虫（二段 11–19 层「矿区怪物」面；Character 实例，声明式写法见 RPG.defCharacter）
 *
 * 数值出处：SRD 3.5 · `Monsters/Monsters - Vermin.md:119`（`## Giant Bombardier Beetle` → Abilities：
 *   Str 13／Dex 10／Con 14／**Int —**／Wis 10／Cha 9；Hit Dice → **13 hp**；Armor Class **16**；Challenge Rating **2**）
 *   —— 逐值照录，**无设计改动**。
 * ⚠ **Int「—」的落法**（二段首遇）：源为 **vermin** ⇒ `Int ---` 是**无心智**（非「0 分」）。本仓
 *   `STAT_BLOCK` 是六维对称块（#1697 §决策二）⇒ 无「none」态可表示；照 `d20m/monsters/armature-drone.js`
 *   先例落**缺省 10** 并登记缺口（落地须先动 STAT_BLOCK 语义，另票）。故本件 `int: 10` **非源值**，
 *   且源侧抽不出 Int ⇒ 不入门 A 组 ⇒ **此注释是唯一留痕**（#1778 body 亦登记）。
 * 段内定位（house rule，非 SRD）：L14–L17 基调敌人（CR 2；定标见 `core/climb2.js` 的 `SPAN2_SCALING`）。
 * 不落的 SRD 能力：vermin 的 `Darkvision`／`Immune to mind-affecting`（无消费点即不声明，同 #1736 判据 1）。
 */

DND3.BombardierBeetle = RPG.defCharacter({
	id: 'bombardier-beetle',
	name: '爆甲虫',
	hp: 13,
	maxHp: 13,
	stats: DND3.stats({
		// SRD 3.5 · `Monsters/Monsters - Vermin.md:119`（`## Giant Bombardier Beetle` → Abilities）——Str 13／Dex 10／Con 14／Wis 10／Cha 9（Int 源为「—」⇒ 见文件头缺口说明）
		str: 13, dex: 10, con: 14, int: 10, wis: 10, cha: 9,
		// 出处同上（同一 pin 文件同一行）—— Armor Class 16、Challenge Rating 2
		ac: 16, bab: 1, cr: 2,
	}),
	items: [
		{ id: 'coin' },          // 战利品：死亡掉落（与哥布林同规则）
		/* ★`#1855`：天然攻击件 —— `equipped: true`（同 `goblin.js` 的 club：①自动通路可取到 ②死亡**不掉落**）。
		 *   数值**逐值照录** pinned，攻击加值走 `stats.atkBonus`（✗ 引擎推导）；
		 *   档头逐只反解与「不落项」清单见 `items/natural-attacks.js`。 */
		{ id: 'bombardier-beetle-bite', equipped: true },   // 投弹甲虫咬
	],
});

jQuery(document).on(':enginerestart', () => {
	DND3.BombardierBeetle.hp = 13;
	DND3.BombardierBeetle.effects = [];
});
