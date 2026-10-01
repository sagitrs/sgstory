/* 巴别之井 · 试玩版 —— 世界地图（一段：L1–L9 攀爬层 ＋ L10 整备区 ＋ 单向门后的 L11）
 *
 * 面（层表与遭遇表同键配对，`#1748`）：`src/dnd/dnd3/core/climb.js` 的 `LAYER_META_SPAN1`（L1–L9 climb、
 *   L10 hub）与 `ENCOUNTER_SPAN1`（1–9 层遭遇/掉落表；第 10 层无条目 ⇒ 整备区不抽遭遇）。
 * 单向门法则（`docs/plans/babel/outline.md`）：**段内自由、段间封闭** ⇒
 *   L1↔L2↔…↔L9↔L10 双向（段内自由）；`L10-gate → L11` **单向**（无回边，见 `DND3.span1GateExit`）。
 *
 * ★ 第 10 层的三个地点**直接取包里的实例**（`DND3.buildSpan1Hub()`）——本文件**不重写**它们的文本
 *   （单一权威源：L10 的说法只在 `scenes/span1-hub.js` 一处）。取的是同一个 `Location` 对象，
 *   故包里对这两个入口的接线（`#1776` 的资源/聚落 API）在此**一并生效**。
 *
 * 车道：本文件是**故事面**（`stories/**`），只做装配 —— 判定数学、层表、道具全在 `src/` 里。
 */

const DND3 = setup.DND3;
const R = setup.RPG;

/* ---------- 1–9 层：层内容表 ----------
 * `gather` 是该层可采到的采集点道具 id（`#1776` 的采集点是**道具**，须先发放到背包才能采 —— 见 `actions`）。
 * 层名与描述是**故事面文本**（house rule 性质的叙事，非 SRD 条目）；层 id 与层表**逐字一致**（同键配对）。 */
const LAYERS = [
	{
		id: 'L1', name: '第 1 层 · 苏醒之地', gather: 'stone-pile', gatherLabel: '碎石堆',
		desc: '你在一堆碎石里睁开眼。头顶是望不到顶的竖井，脚下是被人踩秃的路。'
			+ '有人从这里往上爬过 —— 没爬出去的人，留在了路边。',
	},
	{
		id: 'L2', name: '第 2 层 · 倒木坡', gather: 'dead-wood', gatherLabel: '枯倒的木料',
		desc: '坡上横着几株枯死的巨木，根须还咬在岩缝里。有人用它们搭过梯子，梯子断了。',
	},
	{
		id: 'L3', name: '第 3 层 · 磷光廊', gather: 'flint-seam', gatherLabel: '燧石露头',
		desc: '岩壁上渗出淡蓝色的光，是苔藓，也是别的什么。空气里有铁锈味。',
	},
	{
		id: 'L4', name: '第 4 层 · 谷穗崖', gather: 'wild-grain', gatherLabel: '野生谷穗',
		desc: '崖边居然长着谷子 —— 风也不知道该从哪儿吹进来。有谷子，就有吃谷子的东西。',
	},
	{
		id: 'L5', name: '第 5 层 · 铜锈矿道', gather: 'copper-vein', gatherLabel: '铜矿石脉',
		desc: '矿道被人撬开过。绿色的铜锈蹭在岩壁上，像很久以前有人在这里干活。',
	},
	{
		id: 'L6', name: '第 6 层 · 兽骨阶', gather: 'stone-pile', gatherLabel: '碎石堆',
		desc: '一级一级的台阶，是用骨头垒的。不知道是兽的，还是别的。',
	},
	{
		id: 'L7', name: '第 7 层 · 无风井', gather: 'dead-wood', gatherLabel: '枯倒的木料',
		desc: '这里没有风，火把的烟直直地往上飘。静得能听见自己的心跳。',
	},
	{
		id: 'L8', name: '第 8 层 · 盐霜壁', gather: 'copper-vein', gatherLabel: '铜矿石脉',
		desc: '岩壁上结着一层白霜，舔一下是咸的。越往上，石头越凉。',
	},
	{
		id: 'L9', name: '第 9 层 · 门前', gather: 'wild-grain', gatherLabel: '野生谷穗',
		desc: '前面透出一点光 —— 那是第 10 层。最后一段路，往往是最难走的。',
	},
];

const map = new R.WorldMap({ id: 'babel' });

/** 层 id → 该层采集点（供采集动作与读数用） */
const GATHER_OF = {};
for (const L of LAYERS) GATHER_OF[L.id] = L.gather;

/**
 * 「层地点」的**唯一构造形**（一段与二段**共用** —— `babel2.js` 经 `setup.BABEL.makeLayerLocation` 复用）。
 * 三件事：① 采集点**发放**（`#1776` 明确「采集点须先在背包里」，投放归本集成票）
 *   ② 采集（`RPG.gather`）③ 遭遇（跳独立段落坐战）。
 */
const makeLayerLocation = (L) => new R.Location({
	id: L.id,
	name: L.name,
	desc: () => L.desc,
	/* 读数：本局到过的**最深**层（进层即记；✗ 用「当前层」代替，因为死亡会把人送回 L1）。 */
	onEnter: () => {
		const r = State.variables.babelRun;
		if (r) r.deepest = L.id;
	},
	actions: [
		{
			text: `在${L.gatherLabel}边翻找（找采集点）`,
			when: () => !R.has(L.gather) && !State.variables.babelGiven[L.id],
			action: () => {
				R.give(L.gather);
				State.variables.babelGiven[L.id] = true;
				R.perform(`你在一堆${L.gatherLabel}里挑了个能下手的角落。`);
			},
		},
		/* 采集本体：走 `#1776` 的 `RPG.gather`（缺省取玩家背包语义）。 */
		{
			text: `采集（${L.gatherLabel}）`,
			when: () => R.has(L.gather),
			action: () => setup.BABEL.gather(),
		},
		/* 遭遇：地图 action 跳转到独立段落（战斗要全屏渲染，同旧宅 e2e 的形）。
		 * ⚠ 层读面（`RPG.inGradient`）来自 `#1784`（`src/core/65-encounters.js`）⇒ 在此**能力探测**：
		 *   缺席时仍给出入口（点了**开发者通道**会报「装配缺口」、玩家层给白话提示；✗ 静默消失）——
		 *   ★`#1863`：开发者信号走 `console.warn`（票号/源码路径是写给接线者的），玩家层只出白话。
		 *   这与「静默不触发」的失败形相反，见 encounters.js 的依赖声明。 */
		{
			text: '遭遇（往上走之前，先看有什么挡路）',
			when: () => (typeof R.inGradient === 'function' ? R.inGradient(L.id) : true),
			action: () => SugarCube.Engine.play('遭遇战'),
		},
	],
});

for (const L of LAYERS) map.addLocation(makeLayerLocation(L));

/**
 * **接管**一个整备区（把包里的 `WorldMap` 并进本图）：地点字段与 `actions` **按引用共享**
 * （⇒ 包里对入口的接线在此一并生效，单一权威源），边**同一批实例**一并取入
 * （只取地点会得孤岛 —— 实测 `validate()` 报「孤立点 L10-settlement」）。
 * 唯一的故事侧补丁是 `onEnter` 读数钩子（记录 `deepest`）；**✗ 直接改包里的实例**
 * （那会连带污染包自己那张图）。
 */
const adoptHub = (target, hub) => {
	for (const loc of hub.locations.values()) {
		target.addLocation(new R.Location({
			id: loc.id, name: loc.name, desc: loc.desc, actions: loc.actions,
			onEnter: () => {
				const r = State.variables.babelRun;
				if (r) r.deepest = R.layerOfLocation(loc.id)?.id ?? loc.id;
			},
		}));
	}
	for (const exit of hub.exits) target.addExit(exit);
};

/* ---------- 第 10 层：整备区（取包里的实例 —— 单一权威源）---------- */
adoptHub(map, DND3.buildSpan1Hub());   // 包里已自带 `validate()`：不合法会抛

/* ---------- 边 ----------
 * 段内自由（双向）＋ 段间封闭（10→11 单向、无回边）。 */
for (let i = 0; i < LAYERS.length - 1; i++) {
	const a = LAYERS[i].id;
	const b = LAYERS[i + 1].id;
	map.addPath({ from: a, to: b, text: `向上，去第 ${i + 2} 层` });
}
map.addPath({ from: 'L9', to: 'L10-camp', text: '钻进光里（第 10 层）' });
map.addPath({ from: 'L10-camp', to: 'L9', text: '退回第 9 层（段内自由）' });
for (let i = LAYERS.length - 1; i > 0; i--) {
	const a = LAYERS[i].id;
	const b = LAYERS[i - 1].id;
	map.addPath({ from: a, to: b, text: `向下，回第 ${i} 层（段内自由）` });
}
/* ★ **10→11 单向门本体与 L11 实体均由 `babel2.js` 接**（`#1791`）：
 *   一段当年挂不上那条边（L11 尚不存在 ⇒ 悬空边、`validate()` 必红）；现在 L11 是二段的**爬层**
 *   （不再是终点）⇒ 由二段文件统一挂。 */

/* ---------- 构建时校验（build-and-check：不合法就别开故事）----------
 * 这里只校验**一段已建的部分**（连通性检查要等二段接上 ⇒ 在 `babel2.js` 末尾做全图检查）。 */
const problems = map.validate();
if (problems.length > 0) throw new Error(`[babel] 一段图不合法：${problems.join('；')}`);

/* ---------- 注册为可玩的 MapScene ---------- */
setup.BABEL = Object.assign(setup.BABEL ?? {}, {
	map,
	gatherPoints: GATHER_OF,       // 层 id → 该层采集点道具 id（遭遇/采集桥读它）
	makeLayerLocation,             // 「层地点」构造形（一段/二段共用；二段文件复用）
	adoptHub,                      // 整备区接管形（一段/二段共用）
	layerOf: () => R.layerOfLocation(map.current)?.id ?? null,
});
R.registerScene(new R.MapScene({ id: 'babel-explore', title: '巴别之井', map, start: 'L1' }));
