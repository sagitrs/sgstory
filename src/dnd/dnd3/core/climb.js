/* DND3 核心扩展 —— 巴别之井「一段」（1–10 层）攀爬面：层元数据 ＋ 遭遇表 ＋ 段内定标（#1748）
 *
 * 面：`docs/plans/babel/layers.md:9`（1–9 层「蛮荒攀爬·为第 10 层备料」）与 `:10`（第 10 层「大空洞·奴隶制农耕」）。
 * 契约：本文件的**形状**由领队钉在 `#1748` 票面（comment 2026-09-30）——层元数据 `{id,type,start?}`、
 *   遭遇条目 `{encounters:[{ref,weight,elite?}],loot:[{id,weight,qty?}]}`；
 *   表内一律引**注册 id**（数值在定义面，本表只做权重与组合），抽样经 `RPG.rng`（#1710）。
 * 车道：本笔全落 dnd3 侧新文件（与 dnd-5e 火器笔 #1742 不相交）。
 *
 * 段内定标 = **house rule（非 SRD）** —— 依 #1729 裁定②：#1712 pin 表只 pin SRD **原值**，
 *   段际缩放系数不在任何源内 ⇒ 必须显式成文，否则即「未 pin 的隐藏判据」。
 */

/* ---------- 一段定标系数（house rule，非 SRD）----------
 * 取值原则（三条，可由后续段票沿用/覆盖，但必须显式）：
 *   ① 层内 CR 带 = 该层「断代梯度」位置：越靠上越强，不越段（段间由单向门分割 ⇒ 段内自洽即可）；
 *   ② 第 10 层（hub）**不设战斗遭遇**（整备区），敌人基调留白未定 ⇒ 不给权重；
 *   ③ 数值带只约束**引用注册 id 的强度**，不新造第二套数值（数值一律在 `src/dnd/dnd3/monsters/**`）。
 */
setup.DND3.SPAN1_SCALING = {
	id: 'span1',
	name: '一段（1–9 层）攀爬·定标',
	kind: 'house-rule',            // 显式：非 SRD
	crBand: [                     // 每层允许的 CR 上限（1–9 层逐层递增，第 10 层不列 = 无战斗）
		{ layer: 'L1', crMax: 0.5 },   // 鼠、犬、獾一级的小兽
		{ layer: 'L2', crMax: 0.5 },
		{ layer: 'L3', crMax: 1 },     // 狼
		{ layer: 'L4', crMax: 1 },
		{ layer: 'L5', crMax: 2 },     // 野猪、巨蜥
		{ layer: 'L6', crMax: 2 },
		{ layer: 'L7', crMax: 2 },
		{ layer: 'L8', crMax: 2 },
		{ layer: 'L9', crMax: 2 },     // 段内最深处、第 10 层门前的压力峰值
	],
	/* 资源/道具价值带（1–9 层）：段内投放物皆「就地取材」⇒ 单价上限 2 gp（简易武器价带下限）。
	 * 依据：SRD 3.5 · `Basic Rules and Legal/equipment.md:426`（木棒 0 gp）与 `:501`（矛 2 gp）。 */
	valueBand: { maxGp: 2 },
};

/* ---------- 层元数据（契约形 `{id,type,start?}`）----------
 * type：`climb`（段内攀爬层）｜`hub`（大空洞·整备区）｜`exit`（顶层出口，仅第 50 层，本段无）。
 * 本笔只落一段：L1–L9 为 climb、L10 为 hub。层 id 与遭遇表键一致（同键控，防两套命名）。
 */
/* ★ 注册进 **core 的层表注册面**（#1760 折领队裁甲）：层元数据是**内容物**，由内容侧注册；
 *   消费方（core 的 `RPG.respawn`、任意包）只读 ⇒ 包与包之间零认知（`src/README.md:13`）。 */
RPG.registerLayerMeta('span1', setup.DND3.LAYER_META_SPAN1 = [
	{ id: 'L1', type: 'climb', start: true },   // 灵魂肉身苏醒之地（`outline.md`「第 1 层是最深处」）
	{ id: 'L2', type: 'climb' },
	{ id: 'L3', type: 'climb' },
	{ id: 'L4', type: 'climb' },
	{ id: 'L5', type: 'climb' },
	{ id: 'L6', type: 'climb' },
	{ id: 'L7', type: 'climb' },
	{ id: 'L8', type: 'climb' },
	{ id: 'L9', type: 'climb' },
	{ id: 'L10', type: 'hub' },                 // 大空洞·奴隶制农耕聚落（整备区，非战斗）
]);

/* ---------- 遭遇表（1–9 层；第 10 层不设条目 = 整备区）----------
 * 纪律：怪物一律引 `DND3.<Monster>.id`（注册面），零件一律引已注册 `Item` id——
 *   本表**不内嵌数值**（数值改源只需改定义面，本表零改动，避免两套语义）。
 * 权重为**相对值**（同层内归一），`elite` 供 B2 表驱动实现取「精英标记」（本笔只标不消费）。
 * loot 的 `qty:[min,max]` 是件数区间；省略即 1 件（与 `RPG.loot` 的逐件语义一致）。
 */
setup.DND3.ENCOUNTER_SPAN1 = {
	L1: { encounters: [{ ref: 'badger', weight: 3 }, { ref: 'badger', weight: 2, elite: true }], loot: [{ id: 'coin', weight: 1 }] },
	L2: { encounters: [{ ref: 'badger', weight: 3 }, { ref: 'badger', weight: 2, elite: true }], loot: [{ id: 'coin', weight: 1 }, { id: 'herb-poultice', weight: 1 }] },
	L3: { encounters: [{ ref: 'badger', weight: 2 }, { ref: 'wolf', weight: 3 }], loot: [{ id: 'coin', weight: 1 }, { id: 'herb-poultice', weight: 1 }] },
	L4: { encounters: [{ ref: 'wolf', weight: 3 }, { ref: 'wolf', weight: 2, elite: true }], loot: [{ id: 'coin', weight: 2 }, { id: 'wood-spear', weight: 1 }, { id: 'herb-poultice', weight: 1 }] },
	L5: { encounters: [{ ref: 'wolf', weight: 2 }, { ref: 'boar', weight: 3 }], loot: [{ id: 'coin', weight: 2 }, { id: 'herb-poultice', weight: 1 }] },
	L6: { encounters: [{ ref: 'boar', weight: 3 }, { ref: 'monitor-lizard', weight: 2 }], loot: [{ id: 'coin', weight: 2 }, { id: 'wood-spear', weight: 1 }, { id: 'herb-poultice', weight: 2 }] },
	L7: { encounters: [{ ref: 'monitor-lizard', weight: 3 }, { ref: 'boar', weight: 2, elite: true }], loot: [{ id: 'coin', weight: 2 }, { id: 'herb-poultice', weight: 2 }] },
	L8: { encounters: [{ ref: 'monitor-lizard', weight: 3 }, { ref: 'monitor-lizard', weight: 2, elite: true }], loot: [{ id: 'coin', weight: 3 }, { id: 'herb-poultice', weight: 2 }] },
	L9: { encounters: [{ ref: 'boar', weight: 3, elite: true }, { ref: 'monitor-lizard', weight: 3, elite: true }], loot: [{ id: 'coin', weight: 3 }, { id: 'bone-dagger', weight: 1 }, { id: 'herb-poultice', weight: 3 }] },
};
