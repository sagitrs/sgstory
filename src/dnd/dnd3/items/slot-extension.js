/* DND3 道具 —— 二段槽位扩展（肩甲/腰带/背心）（#1779；`#1730` 裁定③「纯内容零引擎改」）
 *
 * ## 零引擎改（实测）
 *   `slot` 是**自由字符串**（`10-item.js:52` `this.slot = def.slot ?? null`），
 *   `RPG.slotLabels` 只是可选**显示名**（`30-inventory.js:128`）—— core **不硬编码任何槽名**。
 *   `RPG.slotEquip` 的同槽互斥按 `this.slot` 逐字符串比较 ⇒ **新槽自动互斥、自动并存**。
 *   ⇒ 本文件**只新增 Item 定义**，`src/core/**` 零改动（这是票面 ③ 的验收点）。
 *
 * ## 源（逐值引 3E SRD；`#1730` 裁定⑤「本段禁 house rule 混入」）
 *   3E 的**护甲表**（`Basic Rules and Legal/equipment.md:2088-2144`）只有 body 面（盔甲）与盾，
 *   **没有「肩甲／腰带／背心」的独立条目** —— 这三种是**槽位的表达**，不是 3E 的装备类别。
 *   ⇒ 它们的**数值取自表内已有的护甲条目**（逐值引），而**「把它挂到肩/腰/胸槽"是内容侧的组织**：
 *     这属「**同一件护甲换个槽位**」还是「**新增一件护甲**」？—— 本笔采**最保守**的读法：
 *       · **只把「表中已有、且数值可逐值引」的护甲**放进新槽（如 `Padded`/`Leather` 之类轻甲挂 `vest`）；
 *       · **不为新槽发明新数值**（那会立刻构成 house rule，违反裁定⑤）。
 *   ⚠ 若后续需要「3E 表里没有的肩甲/腰带」，那必然是 house rule ⇒ **须另票并按 #1712 形态显式登记**。
 *
 * ## 为何本文件只有三件（不是各槽若干件）
 *   本笔的范围是**证明「加槽零引擎改」**（票面 ③ 的验收），故每个新槽放**一件可逐值引源的护甲**；
 *   槽位的**内容填充**（每槽多件、与职业/训练挂钩）属二段内容票的量，不在此笔膨胀。
 */

/** 新槽护甲共享建造器：数值全部来自表中条目，逐值引。 */
const armorIn = (def) => RPG.defItem({
	id: def.id,
	name: def.name,
	desc: def.desc,
	slot: def.slot,               // ★ 新槽名（自由字符串，零引擎改）
	stackable: false,
	charges: null,
	stats: {
		ac_bonus: def.ac,         // 表中 Armor/Shield Bonus 列
		acp: def.acp,             // 表中 Armor Check Penalty 列
		maxDex: def.maxDex,       // 表中 Maximum Dex Bonus 列（null ⇒ 无上限）
		asf: def.asf,             // 表中 Arcane Spell Failure 列
		weight: def.weight,       // 表中 Weight 列
		cost: def.cost,           // 表中 Cost 列
		armorType: def.armorType, // Light / Medium / Heavy（表列）
		requiresTraining: true,   // 同盾：训练面依 #1730 裁定③ 留痕、消费点后接
	},
	actions: { equip: RPG.slotEquip, unequip: RPG.slotUnequip },
	used() {
		/* ★`#1906` 笔一：裸 `throw new Error` ⇒ **结构化拒绝**（`RPG.refuse`），同盾族；白话为玩家面。 */
		throw RPG.refuse('ARMOR_NOT_USABLE',
			`「${this.name}」得穿在身上挡刀——用「装备」把它带上。`,
			{ needAction: 'equip', itemId: this.id });
	},
});

/* ---- 肩甲槽（`shoulders`）：3E 表中的 `Padded`（`equipment.md:2095`）----
 * 表值（逐格照录）：5 gp ｜ **+1** ｜ 最大敏 **+8** ｜ 减 **0** ｜ **5%** ｜ **10 lb.**（Light armor）
 * `Padded` 在 3E 是**全身软甲**；本笔把它挂到 `shoulders` 是**内容侧的组织**
 *   —— 数值**逐值照表**（✗ 未改一个数），仅槽位归属由内容决定。 */
DND3.PaddedShoulders = armorIn({
	id: 'padded-shoulders', name: '衬垫护肩', slot: 'shoulders',
	ac: 1, acp: 0, maxDex: 8, asf: 5, weight: 10, cost: 5, armorType: 'light',
	desc: '几层缝实的粗布垫肩。挡不住刀，挡得住磨。',
});

/* ---- 腰带槽（`belt`）：3E 表中的 `Leather`（`equipment.md:2097`）----
 * 表值（逐格照录）：10 gp ｜ **+2** ｜ 最大敏 **+6** ｜ 减 **0** ｜ **10%** ｜ **15 lb.**（Light armor） */
DND3.LeatherBelt = armorIn({
	id: 'leather-belt', name: '皮革束腰', slot: 'belt',
	ac: 2, acp: 0, maxDex: 6, asf: 10, weight: 15, cost: 10, armorType: 'light',
	desc: '一条宽厚的熟皮带，护住腰腹。弯腰时不那么容易被捅进来。',
});

/* ---- 背心槽（`vest`）：3E 表中的 `Studded leather`（`equipment.md:2099-2100`，条目名折两行）----
 * 表值（逐格照录）：25 gp ｜ **+3** ｜ 最大敏 **+5** ｜ 减 **-1** ｜ **15%** ｜ **20 lb.**（Light armor） */
DND3.StuddedVest = armorIn({
	id: 'studded-vest', name: '镶钉皮背心', slot: 'vest',
	ac: 3, acp: -1, maxDex: 5, asf: 15, weight: 20, cost: 25, armorType: 'light',
	desc: '皮面上钉满铁钉的背心。看着扎眼，挨刀时才知道值。',
});

/* 登记显示名（可选、纯 UI；未登记时提示回落显示槽名本身）。
 * ⚠ 登记**不是**引擎要求 —— 它的存在只为提示更可读。 */
RPG.slotLabels.shoulders = '肩甲';
RPG.slotLabels.belt = '腰带';
RPG.slotLabels.vest = '背心';
RPG.slotLabels.shield = '盾';
RPG.slotLabels.mount = '坐骑';
