/* DND3 —— 巴别之井「二段」：第 20 层整备区 Scene 骨架（#1778）
 *
 * 面：`docs/plans/babel/layers.md:12`（第 20 层「大空洞·封建中世纪」，非战斗区）＋ `outline.md`
 *   「单向门法则」（段间单向、段内自由）。
 * 范围（**与一段逐字同形**，照 `#1778` 票面／`#1766` 的 span1-hub 形）：只含三件 ——
 *   ① **整备点**（歇脚/使用消耗品的入口）
 *   ② **聚落建设入口**（衔接资源票 `#1747`；此处只留调用点与前置条件，不实现建设面）
 *   ③ **升层单向门 20→21**（`RPG.Exit` 有向边；单向由「无 21→20 回边」表达）
 * **不含**（留白，显式排除）：行会／骑士／佣兵团／审判所／居民 —— `layers.md:12` 的敌人基调与
 *   `:20` 的「本表前提」两项留白未裁定前不预设（照票面「行会/骑士为留白面，只留挂点」）。
 *
 * 车道：数据面（Location/Exit/Scene 定义），可挂进任何地图或 Phase 1 集成（`#1746`）。
 */

/** 第 20 层整备区地点图 —— 三地点两线（进/出各一条，均无回边）。 */
setup.DND3.buildSpan2Hub = () => {
	const map = new RPG.WorldMap({ id: 'babel-span2-hub' });

	/* ① 整备点：封建中世纪的行会外院。真语义（休息/消耗品）归 #1747。 */
	map.addLocation(new RPG.Location({
		id: 'L20-forge',
		name: '大空洞·行会外院',
		desc: '铁匠铺的烟顺着石壁往上爬。有人在打铁，有人只是在暖手。',
		actions: [
			{ text: '在炉边歇一歇（整备点）', action: () => RPG.perform('（整备：后续接消耗品与恢复规则，见 #1747）') },
		],
	}));

	/* ② 聚落建设入口：消费端归 #1747（本笔不抢定资源语义，故 when 恒真）。 */
	map.addLocation(new RPG.Location({
		id: 'L20-settlement',
		name: '封建聚落·城墙根',
		desc: '石墙垒到一半就停了——因为往上再没有路。这里的规矩比石头更硬。',
		actions: [
			{
				text: '查看工坊与料场（聚落建设入口）',
				when: () => true,
				action: () => RPG.perform('（建设：此处后续接「收集→建设→升层」闭环，#1747）'),
			},
		],
	}));

	/* ③ 升层单向门：20 → 21。单向由**无回边**表达（段内自由、段间封闭）。 */
	map.addLocation(new RPG.Location({
		id: 'L20-gate',
		name: '通往上一层的单向门',
		desc: '城墙尽头一道竖直的光。穿过它，这段路就再也回不来了。',
	}));

	map.addPath({ from: 'L20-forge', to: 'L20-settlement', text: '走向料场' });
	map.addPath({ from: 'L20-settlement', to: 'L20-gate', text: '走向石门' });
	/* ★ gate 边本体（L20→L21）**只给定义不挂图**——`L21` 归三段票，现在挂图即悬空边、`validate()` 必红。 */

	const problems = map.validate();
	if (problems.length > 0) throw new Error(`第 20 层整备区图不合法：${problems.join('；')}`);
	return map;
};

/** 升层单向门（20→21）的边定义——**只给定义，不挂图**（`L21` 实体归三段票）。
 *  单向的机械表达：全图**不存在** `L21 → L20` 的边。 */
setup.DND3.span2GateExit = () => new RPG.Exit({
	from: 'L20-gate',
	to: 'L21',
	text: '穿过单向门，升入第 21 层',
});

/* ---------- 整备区 Scene（非战斗）----------
 * 同一段的最短形：入场描述 → 两个非战斗选项（自循环重绘）。第 20 层在 `climb2.js` 的遭遇表里**无条目**。
 */
setup.DND3.Span2HubScene = () => RPG.registerScene(new RPG.Scene({
	id: 'babel-span2-hub',
	title: '第 20 层 · 封建聚落（整备）',
	text: '你从第 19 层的矿道里爬出来，闻到铁锈和炭火。城墙比记忆里的任何东西都高。',
	choices: [
		{ text: '在炉边歇一歇', scene: 'babel-span2-hub' },
		{ text: '查看工坊与料场', scene: 'babel-span2-hub' },
	],
}));
