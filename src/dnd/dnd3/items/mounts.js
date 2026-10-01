/* DND3 道具 —— 二段「骑乘最小形」（#1779；`#1730` 裁定④）
 *
 * ## 裁定原文
 *   `#1730` 裁定④：「**骑乘最小形＝`slot:'mount'` 道具，不做 Mounted Combat**」。
 *   ⇒ 本笔把「有坐骑」表达为**一件装备品**（占 `mount` 槽），**不落**乘骑战斗规则
 *     （冲锋加成、骑乘检定、坐骑与骑手的行动共享等**全部不做**）。
 *
 * ## 源（3E `Basic Rules and Legal/equipment.md` 的 **Mounts and Related Gear** 表；逐值引）
 *   缓存名 `tests/gates/pin-cache/equipment-3e.md`。**该表只有三列**：
 *     `Item ｜ Cost ｜ Weight`（表头实测 `:2738`）。
 *   ⇒ 本文件**只落这两列**（Cost → `stats.cost`；Weight → `stats.weight`），
 *     **✗ 不落载重/速度** —— 3E 的该表**没有**这两列（本席初稿曾臆造 `carry`/`speed`，**已删**：
 *     载重见 `Monsters - Animals.md` 的坐骑**属性块**、速度同源；均属**怪物数据**，
 *     pin 行不同（`Monsters/Monsters - Animals.md`），且裁定④「不做 Mounted Combat」⇒ 本笔不需要）。
 *
 *   逐条行号（均指 `equipment-3e.md`）：
 *     `:2740-2745` Barding（马用甲，Medium creature）×2/×1（**本笔不落**：那是「坐骑的甲」，属护甲面）
 *     `:2747-2750` Barding（Large creature）×4/×2（同上不落）
 *     `:2758` **Donkey or mule — 8 gp ｜ ---**
 *     `:2764-2767` **Horse, heavy — 200 gp ｜ ---**
 *     `:2769-2772` **Horse, light — 75 gp ｜ ---**
 *     `:2774-2777` **Pony — 30 gp ｜ ---**
 *     `:2779-2782` Warhorse, heavy — 400 gp ｜ ---（**本笔不落**：军马须「战斗训练」，属骑乘战斗面）
 *     `:2784-2787` Warhorse, light — 150 gp ｜ ---（同上）
 *     `:2789-2792` Warpony — 100 gp ｜ ---（同上）
 *
 *   ⚠ 表中马匹的 **Weight 列是 `---`**（未给）⇒ 本笔的 `weight` 照录 `null`（✗ 不臆造一个数）。
 *
 * ## 消费点（**零引擎改**）
 *   `slot: 'mount'` ⇒ 与其它槽同理：`RPG.slotEquip` 同槽互斥（一次一头坐骑）、
 *   `RPG.slotLabels.mount = '坐骑'`（在 `slot-extension.js` 登记）⇒ 提示可读。
 *   本笔**不新增任何消费逻辑** —— 「有坐骑」是装备态，「骑上」是叙事（交由故事侧）。
 *
 * ⚠ **军马三件（Warhorse/light/heavy/Warpony）本笔不落**：`equipment-3e.md:3437`（**Armor/Mount 描述段**，非表行）明写
 *   「Warhorses and warponies can be ridden easily into combat. Light horses, ponies, and
 *   heavy horses are hard to control in combat.」——「能在战斗中骑」正是**裁掉的那部分**
 *   （Mounted Combat）。故本笔只落**非军马**四件；军马留待骑乘战斗面另票。
 */

/** 坐骑共享建造器：只落源表的两列（Cost / Weight），✗ 不臆造载重/速度。 */
const mount = (def) => RPG.defItem({
	id: def.id,
	name: def.name,
	desc: def.desc,
	slot: 'mount',                 // ★ 裁定④：坐骑＝mount 槽道具
	stackable: false,
	charges: null,
	stats: {
		cost: def.cost,            // 表中 Cost 列
		weight: def.weight,        // 表中 Weight 列（马匹为 `---` ⇒ null；✗ 不臆造）
		requiresTraining: true,    // 训练面留痕（同盾/甲：消费点后接）
	},
	actions: { equip: RPG.slotEquip, unequip: RPG.slotUnequip },
	used() {
		throw new Error(`「${this.name}」是坐骑，装备（＝骑乘）后即生效；「用」它不产生额外效果`);
	},
});

/* 轻型马（`equipment-3e.md:2769-2772`：75 gp ｜ ---） */
DND3.LightHorse = mount({
	id: 'light-horse', name: '轻型马', cost: 75, weight: null,
	desc: '比人高半头的灰马，耐性好。它认得回家的路，也认得你什么时候慌了。',
});

/* 重型马（`equipment-3e.md:2764-2767`：200 gp ｜ ---） */
DND3.HeavyHorse = mount({
	id: 'heavy-horse', name: '重型马', cost: 200, weight: null,
	desc: '肩背宽厚的挽马。驮得动全套甲，也踹得碎一道栅栏。',
});

/* 矮种马（`equipment-3e.md:2774-2777`：30 gp ｜ ---） */
DND3.Pony = mount({
	id: 'pony', name: '矮种马', cost: 30, weight: null,
	desc: '膝盖到大腿高的矮马。走不快，但大空洞里的窄道它过得去。',
});

/* 骡（`equipment-3e.md:2758`：Donkey or mule — 8 gp ｜ ---） */
DND3.Mule = mount({
	id: 'mule', name: '骡', cost: 8, weight: null,
	desc: '不挑食、不叫唤、不跑。它是这条井里最像“装备”的活物。',
});
