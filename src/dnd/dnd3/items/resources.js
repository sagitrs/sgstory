/* DND3 —— 巴别之井「一段」：资源采集与聚落最小形（#1747）
 *
 * ## 范围（照票面 ＋ 领队裁定）
 *   ① **资源采集最小形**：甲案（资源即 Item，零新 face）——采集点按 `layers.md` 1–9 行投放
 *      （石料/木材/火种/种子/铜矿），采集动作走 core 的 `RPG.gatherFrom`（`src/core/35-gather.js`）。
 *   ② **聚落最小形**：**「收集-建设-升层」的最短闭环** —— 种子⇒农田⇒食物产出
 *      （第 10 层农耕聚落，`scenes/span1-hub.js` 已留下建设入口）。
 *   ③ **craft/building 边界**：定义在 `src/core/36-build.js` 文件头（**权威**），此处只消费。
 *
 * ## 数值面（**全部 house rule（非 SRD）**）
 *   ⚠ 门（`tests/gates/refs-integrity.mjs`）的 `RE_CLAIM` 会**逐行**看「是否带可解析引用」，
 *   而本行提到版本号 ⇒ **该行自身**必须带权威短语 `house rule`，否则门红
 *   （实测：初版写「在 3.5 源里无源」⇒ 门报「声称未带可解析引用」，K0/K12/K12b 三刀连带失败）。
 *   一段的资源/配方/产出在源书里**无源**（`equipment.md` 是成品价目表）⇒ **house rule（非 SRD）**，
 *   按 `README.md`「规则来源」§三 第 5 条：源里查不到 ⇒ 当本仓自定并写明 `house rule（非 SRD）`，
 *   ✗ 不得写成「对齐 SRD」。段内定标亦为 **house rule（非 SRD）**（承 `#1729` 裁定②）：
 *   **采集点采 2–6 次枯竭、配方耗量 2–4 件**，使「一层爬到下一层」的收支大致相抵。
 *
 * ## 留白（✗ 本笔不假设）
 *   「同路攀登者」「大空洞居民」两项留白未裁定 ⇒ 本笔**只做非人形面**：采集点是**自然物**，
 *   聚落里**没有 NPC**（居民/监工/献祭兽归留白裁定后另票）。
 *
 * 车道：本文件为 `dnd3` 包的内容面（数据）；采集/建造的**机制**在 core（`35-gather`/`36-build`）。
 */

/* ============================================================
 * 〇、资源（甲案：资源即 Item，零新 face）
 * ============================================================
 * 资源是**普通道具**（与 `wood-spear` 同类），只多一个 `craftInput` 标记（供建造检索）。
 * **不可装备**（无 `slot`、不注册 `equip`）⇒ 误 equip 会得「没有这个用法」提示。
 * `stackable: true` ＋ `charges: null` ⇒ **计数库存**（同 id 合并槽，无「使用次数」语义）。
 * 数值（`weight`）为 **house rule（非 SRD）**：SRD 3.5 无原料条目，取「一段人力可背负」的直觉值。
 */

/** 共享建造器：一段资源形状一致（名称/重量/描述不同）。 */
const resource = (def) => RPG.defItem({
	id: def.id,
	name: def.name,
	desc: def.desc,
	/* ★`noBattleUse: true`（`#1841`／`#1837` 远修）：**本件在战斗中没有动作** —— 战斗交互选单据此
	 *   **不亮「使用」**（`40-battle.js` 的 `actionOptionsFor`），✗ 让玩家点进去才被拒。
	 *   资源**本该不可战斗使用**（`used()` 按设计抛错）⇒ 这是把该事实**声明**出来，✗ 新语义。 */
	stats: { weight: def.weight, craftInput: true, noBattleUse: true, tier: def.tier ?? 1 },
	/* ★ `charges: 1` ＋ `stackable: true` ⇒ **引擎的堆叠槽即「计数库存」**：
	 *   `RPG.give(id, n)` 会走合并分支把 `n` 件并进同一槽的 `charges`（`30-inventory.js:20`）；
	 *   `RPG.take(id, n, actor)` 从槽里扣 `charges`、扣到 0 即移除槽（同文件 `RPG.take`）。
	 *   ⚠ 这**不是**「消耗品的使用次数」语义 —— 资源的 `used()` 明确抛错（见下），
	 *   故 `charges` 在此唯一含义是**件数**；此用法与既有 `bandage`（charges=2 表 2 件）同构。 */
	charges: 1,
	stackable: true,
	used() {
		/* 资源**没有**默认用法：要么被建造当输入消耗，要么在背包里躺着。
		 * 明确抛错（而非静默）——误当消耗品 use 时应当**响**。
		 * ★`#1877` P2-2：**玩家看白话、开发者看原文**（`RPG.refuse` 两栏，见 `10-item.js`）。
		 *   `code` 承载开发者信号（机器可读），`needAction` 给出应改用的动作名（✗ 散文）。 */
		throw RPG.refuse('MATERIAL_NOT_USABLE',
			`「${this.name}」是备料，不能就这么使——得拿去盖东西。`,
			{ needAction: 'build', itemId: this.id });
	},
});

/* 石料：最沉、量最大（1–9 层随处可采） */
DND3.Rock = resource({ id: 'rock', name: '石料', weight: 10,
	desc: '一块趁手的灰岩。砸得动，也垒得起。' });
/* 木材：可作燃料亦可作建材（与「木械」基调同源） */
DND3.Wood = resource({ id: 'wood', name: '木材', weight: 6,
	desc: '几段干透的木料。在这地方，能烧的也能用。' });
/* 火种：轻、稀缺（生火＝一段的关键技术） */
DND3.Tinder = resource({ id: 'tinder', name: '火种', weight: 1,
	desc: '压实的引火绒与一块燧石。得护着，潮了就没了。' });
/* 种子：聚落闭环的**起点**（农田的输入） */
DND3.Seed = resource({ id: 'seed', name: '种子', weight: 1,
	desc: '一把攥干的谷种。在今天之前，它只是某人的口粮。' });
/* 铜矿：第 10 层「青铜冶铸」的原料（`layers.md:10`） */
DND3.CopperOre = resource({ id: 'copper-ore', name: '铜矿', weight: 12,
	desc: '泛着暗绿的矿石。他们愿意为它把整座山掏空。' });

/* ============================================================
 * 一、采集点（1–9 层）：自然物的「可采集」形态
 * ============================================================
 * 采集点是**道具**（甲案：资源即 Item，采集点自然也是 Item），声明 `actions: { gather: RPG.gatherFrom }`
 *   ＋ `yields` 产出表。**不落进背包**（无 `charges` 的堆叠语义除外——采集点用 `charges` 表**可采次数**，
 *   采空后 `RPG.act` 会把槽移除 ⇒ 与「一次性资源点」同形）。
 *
 * ⚠ 采集点与资源的区别：资源 `stackable: true`（计数库存），采集点 `stackable: false` ＋ `charges: n`
 *   （`n` 次枯竭）。同名采集点被采空后即从背包消失 ⇒ 「这层采过了」可由背包状态读出。
 */

/** 共享建造器：一段采集点形状一致（名称/产出/可采次数不同）。 */
const gatherPoint = (def) => RPG.defItem({
	id: def.id,
	name: def.name,
	desc: def.desc,
	/* ⚠ **产出表必须放进 `stats`**：`Item` 构造只搬固定字段白名单
	 *   （id/name/desc/stats/charges/stackable/weapon/slot/equipped，见 `10-item.js`），
	 *   **自定义顶层字段会被静默丢弃**（实测：放在顶层的 `yields` 到实例上恒为 `undefined`）。
	 *   `stats` 是规则包约定的自由块 ⇒ 产出表、配方、工程声明一律落这里。 */
	stats: { tier: def.tier ?? 1, yields: def.yields },
	charges: def.charges,                // house rule（非 SRD）：可采次数（2–6，见文件头定标）
	stackable: false,
	actions: { gather: RPG.gatherFrom }, // 采集动作（core 共享动作库）
	used() {
		/* 采集点**没有**默认用法：必须显式 `gather`（✗ 不能用 use 顺手采）。
		 * 明确抛错 ⇒ 误用会响（与 resources.js 同款纪律）。
		 * ★`#1877` P2-2：玩家面✗ 出现英文动作名 `gather`（见 `RPG.refuse` 两栏）。 */
		throw RPG.refuse('GATHER_POINT_NOT_USABLE',
			`「${this.name}」是采料的地方——得用「采集」去采。`,
			{ needAction: 'gather', itemId: this.id });
	},
});

/* 石料堆：最普遍（1–9 层各层基调均含石料），产出稳定 */
DND3.StonePile = gatherPoint({
	id: 'stone-pile', name: '碎石堆', charges: 6, tier: 1,
	desc: '一层风化的碎石。搬开表层，底下就是成块的灰岩。',
	yields: [{ id: 'rock', n: 2 }],
});
/* 枯木：木材来源（采 3 次枯竭；「木械」基调的物产面） */
DND3.DeadWood = gatherPoint({
	id: 'dead-wood', name: '枯倒的木料', charges: 3, tier: 1,
	desc: '一株倒伏的枯木，干得发响。放倒它比想象中容易。',
	yields: [{ id: 'wood', n: 2 }],
});
/* 燧石露头：火种来源（轻、稀缺；采 2 次即尽） */
DND3.FlintSeam = gatherPoint({
	id: 'flint-seam', name: '燧石露头', charges: 2, tier: 1,
	desc: '石缝里透出一线灰白。敲下来就是能打火的料。',
	yields: [{ id: 'tinder', n: 1 }],
});
/* 野谷穗：种子来源（聚落闭环的起点；概率产出 ⇒ 需多采几处） */
DND3.WildGrain = gatherPoint({
	id: 'wild-grain', name: '野生谷穗', charges: 4, tier: 1,
	desc: '岩缝里长着几丛细瘦的谷子。鸟早盯上它们了。',
	yields: [{ id: 'seed', n: 1, chance: 0.7 }],   // house rule：七成结实（未熟者采不到）
});
/* 铜矿石脉：一段的矿面（`layers.md:10` 青铜冶铸的原料）；采 2 次、量少 */
DND3.CopperVein = gatherPoint({
	id: 'copper-vein', name: '铜矿石脉', charges: 2, tier: 1,
	desc: '暗绿的锈迹沿着岩面爬开。有人为这种东西挖穿了整座山。',
	yields: [{ id: 'copper-ore', n: 1 }],
});

/* ============================================================
 * 二、建造图纸（building）：种子⇒农田⇒食物
 * ============================================================
 * 按 `src/core/36-build.js` 的边界：building = **输入是道具、产出落到世界**。
 * 图纸是**道具**（就地用 `RPG.buildAt` 动作）＋ 落地效果注册在 `RPG.registerBuild`：
 *   一处定**输入**（图纸的 `plan.inputs`）、一处定**输出**（落地函数），都在内容侧。
 */

/** 农田的状态键：落在 `State.variables`（最小形——建筑树/多建筑属二段以后的复杂度） */
const FARM_KEY = 'span1Farms';
/** 读农田数（0 表示尚未开垦） */
setup.DND3.farmCount = () => {
	const v = State.variables?.[FARM_KEY];
	return Number.isInteger(v) ? v : 0;
};

/* ★ 落地效果：农田（#1747 闭环的核心一环）。**house rule**（无 SRD 源）：农田本身不是 SRD 物件。 */
RPG.registerBuild('farm', (actor) => {
	State.variables[FARM_KEY] = (State.variables[FARM_KEY] ?? 0) + 1;
	return true;
});

/* 开垦图纸：种子 ×2 ⇒ 农田 ＋1。**house rule**（非 SRD）：耗量见文件头定标。 */
DND3.FarmPlot = RPG.defItem({
	id: 'farm-plot', name: '开垦的田垄', charges: null, stackable: false,
	desc: '一段翻好的土，等着下种。围栏外的人不关心谁种的，只关心收成。',
	/* house rule（非 SRD）：段内层级 ＋ 工程标记 ＋ **工程声明**（`id` 指向 `registerBuild`
	 *   的落地效果、`inputs` 是消耗的道具）。⚠ 同 `yields`：必须落 `stats`（见上）。 */
	stats: { tier: 1, buildPlan: true, plan: { id: 'farm', inputs: [{ id: 'seed', n: 2 }] } },
	actions: { build: RPG.buildAt },
	used() {
		throw RPG.refuse('BLUEPRINT_NOT_USABLE',
			`「${this.name}」是图纸——得对着地方用「建造」。`,
			{ needAction: 'build', itemId: this.id });
	},
});

/* ============================================================
 * 三、升层（house rule）：农田产食物 —— 「建设 ⇒ 产出」的消费端
 * ============================================================
 * 最短闭环的**产出**：一段的农耕聚落靠农田供食。产出**不建新系统**（✗ 不做食物/饥饿经济），
 *   而是复用既有 `RPG.Bandage` 式的**恢复道具**：农田的产出是「口粮」，
 *   口粮是 `charges` 有限的恢复物（与 `herb-poultice` 同族，但**纯 house rule**）。
 *   理由：票面要求「食物产出」是闭环的一环，但**一段不引入饥饿系统**（那是二段以后）。
 */

/* 口粮：农田的产物（house rule（非 SRD）：无对应 SRD 条目；效果沿用「恢复少量 HP」的通用形）
 * ⚠ `charges: 1` ＋ `stackable: true` —— 与资源同款：**charges 是「件数」的载体**
 *   （`give` 的合并分支据它累加、`take` 据它逐槽扣）。初版写 `charges: null`（＝无限件）
 *   ⇒ 实测「吃完不离包」「产出计数为 null」两处失真。 */
DND3.Ration = RPG.defItem({
	id: 'ration', name: '口粮', charges: 1, stackable: true,
	desc: '一把炒过的谷粒，用布包着。谈不上好吃，但顶饿。',
	stats: { tier: 1, hp: 2, food: true },    // house rule（非 SRD）：恢复 2 HP（整定标下最弱的一档）
	used(that) {
		const heal = this.stats.hp;
		that.hp = Math.min(that.maxHp ?? Infinity, (that.hp ?? 0) + heal);
		this.perform(`${that.name}吃下口粮，恢复了${heal}点HP。`);
	},
});

/* 收获：农田 ⇒ 口粮（**building 的产出端**：读世界的农田数，把产出投进背包）。
 * 单独给一个入口（而非塞进 build）——「收获」与「建造」是**两个动作**，
 *   混在一个动作里会让 `RPG.act` 的「一次动作一次提交」语义含混。
 *
 * ## ★ 收获的「一次」定义（`#1776` D 席缺陷 4 定形）
 *   初版每次调用都按 `farmCount()` 全额产出，且农田**不消耗、无冷却** ⇒ 同一段田可**站着反复收**
 *   （实测：连收 3 次 ⇒ 口粮 ×3）——试玩版里这是**刷资源漏洞**。
 *   本笔采**「一段田每次收获需重新耕作」**的最小形（**house rule（非 SRD）**，无源）：
 *   收获会**清空** `span1Farms`（＝收完即需再建），并把本次收成记进 `span1Harvests`（累计，供叙事）。
 *   理由：一段的闭环是「**收集→建设→产出**」，若产出无限则**建设只做一次、收集随之失去意义**
 *   （与票面「最短链」的设计意图冲突）。另一条路（冷却计时）需要时间轴，超出一段范围。
 *   ⚠ 这是**设计选择**（house rule），故在此显式成文；后续如需「持续产出」，应改为加冷却而非取消本条。 */
RPG.harvest = (actor) => {
	const who = actor ?? RPG.playerActor();
	if (!who) return false;
	const n = setup.DND3.farmCount();
	if (n <= 0) {
		RPG.perform('还没有开垦的田，没什么可收的。');
		return false;
	}
	const got = RPG.deliverYields(who, [{ id: 'ration', n }], '收获');
	/* 收完即清空 ⇒ 下次收获必须先再建（见上「一次」定义） */
	State.variables.span1Farms = 0;
	State.variables.span1Harvests = (State.variables.span1Harvests ?? 0) + n;
	RPG.perform(`从 ${n} 段田垄收回：${got.join('、') || '（无产出）'}。（田已收空，需重新开垦）`);
	return got.length > 0;
};

/* ============================================================
 * 四、接线点说明（供 #1746 集成）
 * ============================================================
 *   · 采集：`RPG.gather('stone-pile')` —— 玩家背包语义（缺省取 `RPG.playerActor()`）；
 *     采集点须**先在背包里**（由遭遇表/场景发放 —— 本笔不发，避免与 #1748 的遭遇表抢定投放）。
 *   · 建造：`RPG.act(player, 'farm-plot', player, 'build')` —— 或经 `RPG.useItem('farm-plot', …, 'build')`。
 *   · 收获：`RPG.harvest()`（读 `State.variables.span1Farms`）。
 *   · `scenes/span1-hub.js` 的两个 `when: () => true` 入口可替换为：
 *     建设入口 `when: () => RPG.has('farm-plot')`、整备入口接 `RPG.harvest()`。
 */
