/* DND3 道具 —— 二段（11–20 层）盾牌（#1779；领队裁**甲**：取 3E 真值）
 *
 * ## 源（逐值引 3E SRD；**禁 house rule 混入** —— `#1730` 裁定⑤「本段 groundtruth 充足」）
 *   `Basic Rules and Legal/equipment.md:2128-2144` 的 **Table: Armor and Shields** 盾牌段
 *   （缓存名 `tests/gates/pin-cache/equipment-3e.md`；两名为同一文件的引用形／缓存名）：
 *     行 2132  Shield, light wooden  3 gp  +1  … 5%  …  5 lb.
 *     行 2135  Shield, light steel   9 gp  +1  … 5%  …  6 lb.
 *     行 2138  Shield, heavy wooden  7 gp  +2  … 15% … 10 lb.
 *     行 2141  Shield, heavy steel  20 gp  +2  … 15% … 15 lb.
 *     行 2128  Buckler              15 gp  +1  … 5%  …  5 lb.
 *   列序（该表）：Cost ｜ Armor/Shield Bonus ｜ Maximum Dex ｜ Armor Check Penalty ｜ Arcane
 *     Spell Failure ｜ (speed 两列) ｜ Weight^1^。
 *
 * ## 消费点（**零引擎改** —— 实测）
 *   `DND3.acOf`（`src/dnd/dnd3/core/combat.js:16-23`）已遍列**全部已装备项**并累加
 *   `stats.ac_bonus` ⇒ 盾只需 `slot: 'shield'` ＋ `stats.ac_bonus`，**AC 即生效**。
 *   `#1730` 裁定③所说「`stats.ac_bonus` 消费点」**是既有面**（`mail.js`/`tunic.js` 早在用），本笔**不新增**。
 *
 * ## 槽位（`#1730` 裁定③「加槽零引擎改」—— 实测）
 *   `slot` 是**自由字符串**；`RPG.slotLabels` 只是可选**显示名**（`30-inventory.js:128`，core 不硬编码槽名）
 *   ⇒ 新槽 `shield` 无需改引擎、无需注册（未登记 label 时提示会回落显示槽名本身）。
 *
 * ## 非熟练惩罚（3E 有对应条款，**非 house rule**）
 *   `equipment.md:2030-2034`：「*Nonproficient with Armor Worn:* A character who wears armor and/or
 *   **uses a shield with which he or she is not proficient** takes the armor's (and/or **shield's**)
 *   armor check penalty on attack rolls and on all Strength-based and Dexterity-based ability and
 *   skill checks. The penalty for nonproficiency with armor **stacks** with the penalty for
 *   nonproficiency with shields.」
 *   ⇒ 3E 的惩罚是**把「护甲检定减值」加到攻击骰与力/敏检定上**（✗ 不是 5E 的「劣势」）。
 *   ⚠ **本笔只落数据与「留痕」**（按 `#1730` 裁定③「training 依 `#1731` Loading 形态简化＋数据留痕」）：
 *     盾的 `stats.acp` 记录表中的 1/2 值、并由 `stats.requiresTraining` 标出「本件需熟练」，
 *     **消费点（把 acp 加到攻击骰上）留待后续票** —— 与 `#1731` 的 Loading 同形（数据先落、链条后接）。
 *     这是**简化**，故在此**显式登记**（✗ 不得读成「无惩罚」）。
 *
 * ## 一次一盾（3E 条款）
 *   `equipment.md:2273-2274`（Heavy shield 描述）：「You strap a shield to your forearm and grip it
 *   with your hand. A heavy shield is so heavy that you **can't use your shield hand for anything else**.」
 *   ＋ `:2132-2141` 表列 `Shield, light` 与 `Shield, heavy` 各自占**单手/前臂**（盾手）。
 *   ⇒ 本笔的表达：全部盾共用一个 `shield` 槽 ⇒ **槽互斥天然保证「一次一盾」**
 *     （`RPG.slotEquip` 的同槽互斥，见 `30-inventory.js:82-94`），**零新增规则**。
 *
 * OGL 1.0a（3E 面，见 `NOTICE` / `LICENSE-CONTENT.md`）。
 */

/** 盾牌共享建造器（六件盾只在数值与材质上不同）。 */
const shield = (def) => RPG.defItem({
	id: def.id,
	name: def.name,
	desc: def.desc,
	slot: 'shield',                 // 自由槽名（零引擎改）；同槽互斥 ⇒ 天然「一次一盾」
	stackable: false,
	charges: null,                  // 盾无使用次数（不是消耗品）
	stats: {
		ac_bonus: def.ac,           // 表中 Armor/Shield Bonus 列（+1 / +2）
		acp: def.acp,               // 表中 Armor Check Penalty 列（-1 / -2）——供非熟练惩罚消费（后接）
		weight: def.weight,         // 表中 Weight 列
		cost: def.cost,             // 表中 Cost 列
		asf: def.asf,               // 表中 Arcane Spell Failure 列（5% / 15%）
		requiresTraining: true,     // ★ 留痕：#1730 裁定③「training 依 Loading 形态简化＋数据留痕」
	},
	actions: {
		equip: RPG.slotEquip,       // 盾是装备品：装/卸走既有共享动作
		unequip: RPG.slotUnequip,
	},
	used() {
		/* 盾**没有**默认用法（3E 里「用盾」＝持盾取 AC，已由装备态表达；盾击另属武器面，见下注）。
		 * 明确抛错 ⇒ 误 use 会响（与 resources.js 同一纪律）。 */
		throw new Error(`「${this.name}」是防具，装备后即生效；「用」它不产生额外效果`);
	},
});

/* 小圆盾（3E `equipment.md:2128`）：+1 AC / 减 1 / 5 lb. / 15 gp / 5% */
DND3.Buckler = shield({
	id: 'buckler', name: '小圆盾', ac: 1, acp: -1, weight: 5, cost: 15, asf: 5,
	desc: '绑在前臂上的小圆盾。轻得几乎不碍事，也几乎挡不住什么。',
});

/* 轻盾·木（3E `equipment.md:2132`）：+1 AC / 减 1 / 5 lb. / 3 gp / 5% */
DND3.LightWoodenShield = shield({
	id: 'light-wooden-shield', name: '轻木盾', ac: 1, acp: -1, weight: 5, cost: 3, asf: 5,
	desc: '几块木板钉成的轻盾。挡得住爪，挡不住斧。',
});

/* 轻盾·钢（3E `equipment.md:2135`）：+1 AC / 减 1 / 6 lb. / 9 gp / 5% */
DND3.LightSteelShield = shield({
	id: 'light-steel-shield', name: '轻钢盾', ac: 1, acp: -1, weight: 6, cost: 9, asf: 5,
	desc: '包着钢面的轻盾。比木盾沉一点，也比木盾经用。',
});

/* 重盾·木（3E `equipment.md:2138`）：+2 AC / 减 2 / 10 lb. / 7 gp / 15% */
DND3.HeavyWoodenShield = shield({
	id: 'heavy-wooden-shield', name: '重木盾', ac: 2, acp: -2, weight: 10, cost: 7, asf: 15,
	desc: '齐胸高的木盾。举起来是一堵墙，举久了是一条命。',
});

/* 重盾·钢（3E `equipment.md:2141`）：+2 AC / 减 2 / 15 lb. / 20 gp / 15% */
DND3.HeavySteelShield = shield({
	id: 'heavy-steel-shield', name: '重钢盾', ac: 2, acp: -2, weight: 15, cost: 20, asf: 15,
	desc: '整块钢面的重盾。它救过的人比它压死的人多。',
});

/* 塔盾（3E `equipment.md:2144`）：+4 AC^3^ / 减 10 / 45 lb. / 30 gp / 50% / 最大敏 +2
 *   ★ 脚注 3（`equipment.md:2178-2183`）实取：「3 A tower shield can instead grant you cover.
 *     See the description.」⇒ 塔盾可**改作掩体**（cover），那是**另一种用法**（3E 掩体规则），
 *     本笔**不落** cover 面（属战斗规则扩展，非装备数据）⇒ **数据留痕**：`stats.coverOption: true`，
 *     消费点后接。同时其「最大敏 +2」列在此记 `stats.maxDex: 2`（同属留痕）。 */
DND3.TowerShield = RPG.defItem({
	id: 'tower-shield', name: '塔盾',
	desc: '一块竖起来比人还高的门板。举着它你能挡住大半支箭雨——代价是你什么也做不了。',
	slot: 'shield',
	stackable: false,
	charges: null,
	stats: {
		ac_bonus: 4,               // `equipment.md:2144` Armor/Shield Bonus 列（脚注 3 见下）
		acp: -10,                  // 同上 Armor Check Penalty 列
		weight: 45,                // 同上 Weight 列
		cost: 30,                  // 同上 Cost 列
		asf: 50,                   // 同上 Arcane Spell Failure 列
		maxDex: 2,                 // 同上 Maximum Dex Bonus 列
		coverOption: true,         // ★ 脚注 3（`equipment.md:2178-2183`）：可改作掩体（留痕，消费点后接）
		requiresTraining: true,
	},
	actions: { equip: RPG.slotEquip, unequip: RPG.slotUnequip },
	used() {
		throw new Error(`「${this.name}」是防具，装备后即生效；「用」它不产生额外效果`);
	},
});
