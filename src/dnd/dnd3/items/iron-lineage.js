/* DND3 道具 —— 二段「铁器谱系」（#1779：谱系第二跳 ＋ craft 配方）
 *
 * ## 源（武器数值**逐值引 3E SRD**；`#1730` 裁定⑤「本段禁 house rule 混入」）
 *   `Basic Rules and Legal/equipment.md` 的 **Table: Weapons**（缓存名 `equipment-3e.md`）。
 *   ⚠ 该表在源文件里是**横向折行**的（名称被切成碎片、数值行在名称行**之前**）
 *     —— 本文件的每个行号都取「数值行」的实测行号，名称由其后紧跟的碎片拼出（两处都注在条目上）。
 *
 *   | 条目 | 数值行 | 表列（Cost｜小/中伤｜重击｜Weight｜Type） |
 *   |---|---|---|
 *   | Longsword  | `:765` | 15 gp｜1d6/1d8｜19-20/×2｜4 lb.｜Slashing |
 *   | Battleaxe  | `:744` | 10 gp｜1d6/1d8｜×3｜6 lb.｜Slashing |
 *   | Warhammer  | `:846` | 12 gp｜1d6/1d8｜×3｜5 lb.｜Bludgeoning |
 *   | Greataxe   | `:885` | 20 gp｜1d10/1d12｜×3｜12 lb.｜Slashing |
 *   | Greatsword | `:919` | 50 gp｜1d10/2d6｜19-20/×2｜8 lb.｜Slashing |
 *
 *   3E 武器表**没有**「铁矛」条目 —— 矛只有 `Spear`（`:501`，一段已用）。
 *   ⇒ **谱系第二跳的表达**（票面 ⑤）：**同名同值、换材质前缀**（木柄长矛 ⇒ **铁头长矛**），
 *     数值仍照 `Spear` 逐值引（✗ 不发明新数值）——「谱系」在此是**命名与配方**的事，不是数值的事。
 *     这一读法**显式登记**（见文件末「谱系说明」），✗ 不得读成「有一件 SRD 叫 Iron Spear」。
 *
 * ## 配方（craft）：**house rule** 显式（票面 ① 明写「配方本身 house rule 显式」）
 *   SRD **没有**「锻造配方」规则（3E 的 Craft 技能是**检定制**：DC×材料价，非固定配方表）
 *   ⇒ 本笔的「铁矿＋木材 ⇒ 铁剑」是**本仓自定**，逐条标 **house rule（非 SRD）**。
 *   消耗走 `#1776` 的 `RPG.consumeRecipe`（**共用同一套配方检索与消耗** ⇒ ✗ 不各写一套配方表）。
 */

/** 铁器武器共享建造器（数值全部来自表中条目，逐值引）。 */
const ironWeapon = (def) => RPG.defItem({
	id: def.id,
	name: def.name,
	desc: def.desc,
	weapon: true,
	slot: 'weapon',
	charges: null,
	stackable: false,
	stats: {
		dmg: def.dmg,            // 中型 wield 伤害（表中「Dmg (M)」列）
		crit: def.crit,          // 重击倍率
		critMin: def.critMin,    // 重击威胁下限（19 ⇒ 19-20；缺省 20）
		weight: def.weight,      // 表中 Weight 列
		cost: def.cost,          // 表中 Cost 列
		type: def.type,          // 表中 Type 列
		prof: def.prof,          // 简易/军用（表中所在分节）
		material: def.material,  // ★ 谱系用：材质（'wood'/'iron'）——供配方与谱系可视化检索
	},
	actions: { equip: RPG.slotEquip, unequip: RPG.slotUnequip },
	used(that, from) {
		/* ★**转发返回值**（`#1813`）：攻击层现在会在「打不出去」（腾不出手／没弹药）时
 *   `return false`；块体若不转发，`RPG.act` 拿到的仍是 `undefined` ⇒ 被算作 `applied`
 *   ⇒ `#1773` 的三连拒绝护栏在这一面失效。⇒ 与 `dnd-5e` 侧同笔（笔 1／笔 2）。 */
		return DND3.meleeAttack(this, that, from);
	},
});

/* 长剑（`equipment-3e.md:765`；军用单手，19-20/×2） */
DND3.IronLongsword = ironWeapon({
	id: 'iron-longsword', name: '铁长剑', dmg: '1d8', crit: 2, critMin: 19,
	weight: 4, cost: 15, type: 'slashing', prof: 'martial', material: 'iron',
	desc: '直刃长剑，钢口匀净。一记横斩能把骨器劈开。',
});

/* 战斧（`equipment-3e.md:744`；军用单手，×3） */
DND3.IronBattleaxe = ironWeapon({
	id: 'iron-battleaxe', name: '铁战斧', dmg: '1d8', crit: 3,
	weight: 6, cost: 10, type: 'slashing', prof: 'martial', material: 'iron',
	desc: '厚背单刃的战斧。不轻巧，但砍实了能一次了结。',
});

/* 战锤（`equipment-3e.md:846`；军用单手，×3） */
DND3.IronWarhammer = ironWeapon({
	id: 'iron-warhammer', name: '铁战锤', dmg: '1d8', crit: 3,
	weight: 5, cost: 12, type: 'bludgeoning', prof: 'martial', material: 'iron',
	desc: '方头短柄的铁锤。敲在甲上，甲里的人比甲先碎。',
});

/* 巨斧（`equipment-3e.md:885`；军用双手，×3） */
DND3.IronGreataxe = ironWeapon({
	id: 'iron-greataxe', name: '铁巨斧', dmg: '1d12', crit: 3,
	weight: 12, cost: 20, type: 'slashing', prof: 'martial', material: 'iron',
	desc: '要双手抡起来的巨斧。挥出去的弧线里没有“挡”这个选项。',
});

/* 巨剑（`equipment-3e.md:919`；军用双手，19-20/×2） */
DND3.IronGreatsword = ironWeapon({
	id: 'iron-greatsword', name: '铁巨剑', dmg: '2d6', crit: 2, critMin: 19,
	weight: 8, cost: 50, type: 'slashing', prof: 'martial', material: 'iron',
	desc: '齐胸长的双手剑。它存在的意思很直白：让你站在更远的地方。',
});

/* 铁头长矛（**谱系第二跳**：一段 `Spear`（`:501`）的材质升格；数值**逐值同 Spear**，✗ 未改一个数） */
DND3.IronSpear = ironWeapon({
	id: 'iron-spear', name: '铁头长矛', dmg: '1d8', crit: 3,
	weight: 6, cost: 2, type: 'piercing', prof: 'simple', material: 'iron',
	desc: '木杆上换了个铁矛头。还是那根矛，但捅进去的东西不一样了。',
});

/* ============================================================
 * 锻造（craft）—— **house rule（非 SRD）**，走 #1776 的共用消耗面
 * ============================================================
 * 输入：`iron-ore`（铁矿，二段 11–19 投放：`layers.md` 「铁矿」）＋ `wood`（一段的木材，跨段复用）
 * 输出：上列的武器（`yields`）。
 * 数量按**谱系重量**粗定（巨剑/巨斧耗更多铁）——**house rule**，见各条注释。
 */

/** 铁矿：二段的新资源（一段是铜矿；`layers.md` 11–19 行「铁矿」）。
 *  ⚠ 资源在 3E 装备表里**无条目**（同 `#1776` 的铜矿）⇒ 本条目为 **house rule（非 SRD）**。 */
DND3.IronOre = RPG.defItem({
	id: 'iron-ore', name: '铁矿', charges: 1, stackable: true,
	desc: '沉甸甸的暗红矿石。锻炉烧到发白，它才肯交出里面的东西。',
	/* ★`noBattleUse: true`（`#1841` RC · `dev-9` 抓）：**铁矿是资源、战斗中没有动作** —— 但它**不走**
	 *   `resources.js` 的共享建造器（它是二段新资源，单独声明）⇒ 本席首版只给建造器加声明**漏了它**
	 *   ⇒ `climb2.js` 层层掉落真实拿得到 ⇒ **病没治**（战斗选单仍亮「使用」）。
	 *   ★教训：我核了 `craftInput` 的**数**（6），却没核它的**出处**（6 件来自 2 个文件）。 */
	stats: { weight: 12, craftInput: true, noBattleUse: true, tier: 2 },
	used() {
		/* ★`#1877` P2-2：两栏（玩家白话／开发者原文），见 `RPG.refuse`。 */
		throw RPG.refuse('MATERIAL_NOT_USABLE',
			`「${this.name}」是打铁的料——不能就这么使，得拿去锻。`,
			{ needAction: 'craft', itemId: this.id });
	},
});

/** 共享：把「锻造配方」挂成道具的 `craft` 动作（输入→输出都回背包）。
 *  道具以 `stats.recipe` 声明配方（`#1776` 的读取点即 `this.stats?.recipe`）。 */
const forgeItem = (def) => RPG.defItem({
	id: def.id,
	name: def.name,
	desc: def.desc,
	charges: null,
	stackable: false,
	stats: {
		recipe: def.recipe,
		tier: 2,
		forgeBlueprint: true,          // 图纸标记（供 UI/检索；与 #1776 的 buildPlan 同族）
	},
	actions: { craft: RPG.craftWith },  // ★ 复用 #1776 的 craft 共享动作
	used() {
		throw RPG.refuse('BLUEPRINT_NOT_USABLE',
			`「${this.name}」是图纸——得在锻造台上对着用。`,
			{ needAction: 'craft', itemId: this.id });
	},
});

/* 配方（**house rule（非 SRD）**）：铁矿 ×2 ＋ 木材 ×1 ⇒ 单手铁器（剑/斧/锤）
 *   耗量依据：单手武器重 4–6 lb.，按「一份铁矿可出数件」的直觉取 2 份。 */
const lightRecipe = (outId) => ({ inputs: [{ id: 'iron-ore', n: 2 }, { id: 'wood', n: 1 }], yields: [{ id: outId, n: 1 }] });
/* 双手/大件（巨斧 12 lb.、巨剑 8 lb.）：铁矿 ×3 ＋ 木材 ×2。**house rule**。 */
const heavyRecipe = (outId) => ({ inputs: [{ id: 'iron-ore', n: 3 }, { id: 'wood', n: 2 }], yields: [{ id: outId, n: 1 }] });

DND3.ForgeLongsword = forgeItem({
	id: 'forge-longsword', name: '长剑锻造图',
	desc: '一张画着长剑形制的皮子。边上写着几行火候。',
	recipe: lightRecipe('iron-longsword'),
});
DND3.ForgeBattleaxe = forgeItem({
	id: 'forge-battleaxe', name: '战斧锻造图',
	desc: '斧刃的弧度被反复描过。画它的人显然很在意那一下。',
	recipe: lightRecipe('iron-battleaxe'),
});
DND3.ForgeWarhammer = forgeItem({
	id: 'forge-warhammer', name: '战锤锻造图',
	desc: '方头的尺寸标得格外仔细。剩下一半是锤柄的配重。',
	recipe: lightRecipe('iron-warhammer'),
});
DND3.ForgeGreataxe = forgeItem({
	id: 'forge-greataxe', name: '巨斧锻造图',
	desc: '斧面大的那张图。角上有一行字：一个人抡不动。',
	recipe: heavyRecipe('iron-greataxe'),
});
DND3.ForgeGreatsword = forgeItem({
	id: 'forge-greatsword', name: '巨剑锻造图',
	desc: '剑身从纸的一头画到另一头。料要得多，废的也多。',
	recipe: heavyRecipe('iron-greatsword'),
});
/* 铁头长矛（**谱系第二跳**）：轻，耗 1 份铁 ＋ 1 份木（矛头小）。**house rule**。 */
DND3.ForgeIronSpear = forgeItem({
	id: 'forge-iron-spear', name: '铁矛头锻造图',
	desc: '只画了一个矛头。木杆的事，随便找根直的就行。',
	recipe: { inputs: [{ id: 'iron-ore', n: 1 }, { id: 'wood', n: 1 }], yields: [{ id: 'iron-spear', n: 1 }] },
});

/* ============================================================
 * 谱系说明（**显式登记**，✗ 不得读成源里有 Iron Spear）
 * ============================================================
 * 票面 ⑤「谱系第二跳：木矛→铁矛等谱系可视化条目（`books#72` 轴二取值——内容登记）」。
 * 实现取「**同一形制、材质升格**」：`material` 字段标 `'wood'`/`'iron'`，
 *   一段的 `wood-spear`（`material` 未设，默认视作木）与本文的 `iron-spear` 构成一对；
 *   两者**数值逐值同源**（3E `Spear`，`:501`）⇒ **谱系是命名与配方的事，不是数值的事**。
 * ⚠ 一段的 `wood-spear.js` **未设 `material`** —— 本笔**不改它**（避免跨笔改动已合入内容），
 *   改由「谱系谓词的默认值」在消费侧处理（缺 `material` 即视为 `'wood'`）。此登记见 `RPG.ironLineage`。
 */

/** 谱系谓词（消费点）：给出一件武器的「材质档」。缺 `material` ⇒ 视为 `'wood'`（一段的默认）。
 *  用途示例：某处要「铁器才能破的防御」，即 `RPG.weaponMaterial(item) === 'iron'`。 */
RPG.weaponMaterial = (item) => item?.stats?.material ?? 'wood';
