/* DND3 核心扩展 —— 巴别之井「二段」（11–20 层）：层元数据 ＋ 遭遇表 ＋ 段内定标（#1778）
 *
 * 面：`docs/plans/babel/layers.md:11`（11–19 层「攀爬·为第 20 层备料」）与 `:12`（第 20 层「大空洞·封建中世纪」）。
 * 契约：**与一段逐字同形**（领队钉在 `#1748` 票面，本票照旧、✗ 未自拟第二套）——
 *   层元数据 `{id,type,start?}`、遭遇条目 `{encounters:[{ref,weight,elite?}],loot:[{id,weight,qty?}]}`；
 *   表内只引**注册 id**（数值在定义面），抽样经 `RPG.rng`（#1710）。
 * 层表注册：走 **core 的注册面** `RPG.registerLayerMeta('span2', …)`（#1760 折领队裁甲；
 *   `src/core/40-battle.js:117` 的注册面）——⚠ 二段的层表**不含 `start: true`**（起点层是本井唯一的最深处，
 *   属一段 `L1`）⇒ 注册**不会**影响 `RPG.startLayerId()` 的读取（它取**第一个**带 start 的表项）。
 *
 * 段内定标 = **house rule（非 SRD）**（#1729 裁定②／#1730 裁定⑤：本段 groundtruth 充足 ⇒
 *   **不得把 SRD 值混写成 house rule**，反之亦然；缩放系数本身必在源外 ⇒ 必须显式成文）。
 */

/* ---------- 二段定标系数（house rule，非 SRD）----------
 * 与一段同三条原则（沿用，不另立）：①层内 CR 带随断代梯度递增；②第 20 层（hub）无战斗；③数值带只约束引用强度。
 * 相对一段的**抬升**＝「铁器时代」：CR 带由 ≤2 抬至 ≤4，价值带上限 2 gp → 100 gp（链甲衫实值，见下）。
 */
setup.DND3.SPAN2_SCALING = {
	id: 'span2',
	name: '二段（11–19 层）攀爬·定标',
	kind: 'house-rule',            // 显式：非 SRD
	crBand: [                     // 每层允许的 CR 上限（逐层递增；第 20 层不列 = 无战斗）
		{ layer: 'L11', crMax: 0.5 },   // 甲虫一级的小型矿坑生物
		{ layer: 'L12', crMax: 1 },
		{ layer: 'L13', crMax: 1 },
		{ layer: 'L14', crMax: 2 },
		{ layer: 'L15', crMax: 2 },
		{ layer: 'L16', crMax: 2 },
		{ layer: 'L17', crMax: 3 },
		{ layer: 'L18', crMax: 4 },     // 巨锹甲（CR 4）／棕熊（CR 4）——段内峰值
		{ layer: 'L19', crMax: 4 },     // 段内最深处、第 20 层门前的压力峰值
	],
	/* 资源/道具价值带（11–19 层）：铁器时代工坊产物 ⇒ 上限取**鳞甲 50 gp**
	 * （SRD 3.5 · `Basic Rules and Legal/equipment.md:2108`：Scale mail 50 gp／+4 AC）——
	 * 即「本段可获的最贵单件」；重装（半身甲 600／全身甲 1500 gp）属第 20 层 hub 的工坊产物，不在此带。
	 * 同表更贵的 Chain shirt（100 gp，`:2102`）本段**未取**：其 id 与 dnd-5e 包同名（跨包遮蔽，见
	 * `items/scale-mail.js` 的说明），故取同源、同 +4 而价更低的 Scale mail 作本段代表件。 */
	valueBand: { maxGp: 50 },
};

/* ---------- 层元数据（契约形 `{id,type,start?}`）----------
 * L11–L19 = climb、L20 = hub。**无 `start`**（见文件头：起点层唯一，属一段）。
 * 注册进 core 面，消费方（`RPG.respawn` 等）只读 ⇒ 包与包零认知（`src/README.md:13`）。
 * ⚠ 本表的 key 'span2' 与一段 'span1' 并列 ⇒ `RPG.startLayerId()` 仍返回 `L1`（一段表排在先且带 start）。 */
RPG.registerLayerMeta('span2', setup.DND3.LAYER_META_SPAN2 = [
	{ id: 'L11', type: 'climb' },
	{ id: 'L12', type: 'climb' },
	{ id: 'L13', type: 'climb' },
	{ id: 'L14', type: 'climb' },
	{ id: 'L15', type: 'climb' },
	{ id: 'L16', type: 'climb' },
	{ id: 'L17', type: 'climb' },
	{ id: 'L18', type: 'climb' },
	{ id: 'L19', type: 'climb' },
	{ id: 'L20', type: 'hub' },                 // 大空洞·封建中世纪（整备区，非战斗）
]);

/* ---------- 遭遇表（11–19 层；第 20 层无条目 = 整备区）----------
 * 纪律同一段：只引注册 id、不内嵌数值、权重为层内相对值、`elite` 供 B2 取精英标记（本笔只标不消费）。
 * ⚠ **人形面**（layers.md:11 的「废隧道匪帮」／:12 的「骑士/佣兵团/审判所」）**本笔不入表** ——
 *   依 `#1778` 票面「先按非人形面产出，人形面标注候裁」⇒ 只列非人形项（矿坑虫类／猎场兽）。
 */
setup.DND3.ENCOUNTER_SPAN2 = {
	L11: { encounters: [{ ref: 'fire-beetle', weight: 3 }, { ref: 'fire-beetle', weight: 2, elite: true }], loot: [{ id: 'coin', weight: 1 }, { id: 'herb-poultice', weight: 1 }] },
	L12: { encounters: [{ ref: 'fire-beetle', weight: 3 }, { ref: 'giant-bee', weight: 2 }], loot: [{ id: 'coin', weight: 2 }, { id: 'herb-poultice', weight: 1 }] },
	L13: { encounters: [{ ref: 'giant-bee', weight: 3 }, { ref: 'fire-beetle', weight: 2, elite: true }], loot: [{ id: 'coin', weight: 2 }, { id: 'iron-ingot', weight: 1 }, { id: 'herb-poultice', weight: 1 }] },
	L14: { encounters: [{ ref: 'bombardier-beetle', weight: 3 }, { ref: 'giant-bee', weight: 2, elite: true }], loot: [{ id: 'coin', weight: 2 }, { id: 'iron-ingot', weight: 1 }] },
	L15: { encounters: [{ ref: 'bombardier-beetle', weight: 3 }, { ref: 'bombardier-beetle', weight: 2, elite: true }], loot: [{ id: 'coin', weight: 3 }, { id: 'iron-ingot', weight: 2 }] },
	L16: { encounters: [{ ref: 'bombardier-beetle', weight: 3 }, { ref: 'bombardier-beetle', weight: 2, elite: true }], loot: [{ id: 'coin', weight: 3 }, { id: 'iron-ingot', weight: 2 }, { id: 'iron-sword', weight: 1 }] },
	L17: { encounters: [{ ref: 'giant-bee', weight: 3, elite: true }, { ref: 'bombardier-beetle', weight: 3 }], loot: [{ id: 'coin', weight: 3 }, { id: 'iron-ingot', weight: 2 }, { id: 'iron-sword', weight: 1 }] },
	L18: { encounters: [{ ref: 'giant-stag-beetle', weight: 3 }, { ref: 'brown-bear', weight: 2 }], loot: [{ id: 'coin', weight: 4 }, { id: 'iron-ingot', weight: 3 }, { id: 'iron-sword', weight: 2 }] },
	L19: { encounters: [{ ref: 'brown-bear', weight: 3, elite: true }, { ref: 'giant-stag-beetle', weight: 3, elite: true }], loot: [{ id: 'coin', weight: 4 }, { id: 'iron-message', weight: 1 }, { id: 'iron-sword', weight: 2 }] },
};
