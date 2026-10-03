/* DND3 道具 —— 鳞甲（二段 11–19 层「甲胄」面；身体槽装备：+4 AC）
 *
 * 数值出处：SRD 3.5 · `Basic Rules and Legal/equipment.md:2108`（Table: Armor and Shields 的
 *   **Scale mail** 行：**50 gp**／**Armor Bonus +4**／Max Dex +3／Armor Check −4／Arcane Spell
 *   Failure 25%／30 ft.／**30 lb.**）—— 逐值照录，**无设计改动**。
 * 本件 = 本段的**价值带上限锚**（`core/climb2.js` 的 `SPAN2_SCALING.valueBand.maxGp = 50`）。
 * ⚠ **id 为何不叫 `chain-shirt`**：本仓 dnd-5e 包已注册同名 id（`dnd-5e/items/chain-shirt.js`）⇒
 *   跨包同名会**静默遮蔽**（`src/README.md:13`／系统性政策 `#1743`）—— 实测本笔首稿用 `chain-shirt`
 *   即打红 dnd-5e 的一条用例（`RPG.createItem('chain-shirt')` 取到了本包件）。故取本条目的**另一个**
 *   有源选项 Scale mail（同表、同 +4、价更低 ⇒ 更贴「早期铁器」），id 与两包既有面**零重叠**。
 * 与既有身体槽件（`items/tunic.js` +1／`items/mail.js` +3，皆无源标注）的关系：那两件是本仓早期
 *   设计值（`#1697` 前遗留）；本件**逐值引源**。三件同槽（`body`）⇒ 互斥（`RPG.slotEquip`），玩家择一——
 *   本笔不动既有两件（改它们的数值属另票）。
 * 战斗数值走 `DND3.acOf`（已装备道具的 `ac_bonus` 计入防御等级）。
 */

DND3.ScaleMail = RPG.defItem({
	id: 'scale-mail',
	name: '鳞甲',
	desc: '铁片像鱼鳞一样缀在皮衬上。沉，但挡得住矿坑里大多数东西。',
	stats: {
		ac_bonus: 4,           // SRD 3.5 · `Basic Rules and Legal/equipment.md:2108` —— Armor Bonus +4
		weight: 30,            // 同上 —— 30 lb.
		cost: 50,              // 同上 —— 50 gp
		slotName: '身体',
	},
	charges: null,
	stackable: false,
	slot: 'body',
	actions: {
		equip: RPG.slotEquip,
		unequip: RPG.slotUnequip,
	},

	used() {
		/* ★`#1906` 笔一：瞬时说明走**通知面**（✗ 再落正文）＋ **显式拒绝**（`return false` ⇒ 不消耗）。
		 *   形同 `coin`（`books#130` D6-3 的读数形）：`perform` 两个面都写 ⇒ 玩家每点一次正文多一行。
		 *   ⚠ 能力探测（通知面未加载的环境回落 `perform`，同 `coin`）。 */
		const line = '鳞甲得穿在身上才有用——用「装备」把它穿上。';
		if (typeof RPG.pushNotice === 'function') RPG.pushNotice(line);
		else this.perform(line);
		return false;
	},
});
