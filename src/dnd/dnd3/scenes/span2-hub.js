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
 * ★ **#1791（二段故事面扩展）在此接上真 API**（原为占位 `perform`）：
 *   ① 整备 ⇒ 创伤的**解除通路** `DND3.treatTrauma`（治疗检定 DC 15/18，加值取 `stats.heal_bonus`）
 *      ＋「用掉一件恢复物」（与一段同形 —— ✗ 不发明第二套休息规则）；
 *   ② 料场 ⇒ 领**锻造图纸**（`#1788` 的 6 张）＋取木料（一段的 `dead-wood` 采集点）；
 *   ③ **锻造台** ⇒ 用图纸 `RPG.act(…, 'craft')` 出铁器（`#1788` 的 `craft` 共享动作）；
 *      图纸清单**从注册面派生**（`stats.forgeBlueprint` 标记）——✗ 在此硬编码第二套 id 表。
 *   ④ 单向门 20→21 **仍只定义不挂图**（`L21` 归三段票；挂图即悬空边、`validate()` 必红）。
 *
 * 车道：数据面（Location/Exit/Scene 定义），可挂进任何地图或 Phase 1 集成（`#1746`）。
 */

/** 二段锻造图纸的**派生清单**（从注册面取，✗ 场景侧硬编码 id 表 —— 单一权威源）。
 *  判据是道具自带的 `stats.forgeBlueprint` 标记（`items/iron-lineage.js` 的 `forgeItem` 所加）。 */
setup.DND3.span2Blueprints = () => [...RPG.items.keys()]
	.filter((id) => RPG.createItem(id).stats?.forgeBlueprint === true)
	.sort();

/** 第 20 层整备区地点图 —— 三地点两线（进/出各一条，均无回边）。 */
setup.DND3.buildSpan2Hub = () => {
	const map = new RPG.WorldMap({ id: 'babel-span2-hub' });

	/* ① 整备点：封建中世纪的行会外院。真语义（休息/消耗品）归 #1747。 */
	map.addLocation(new RPG.Location({
		id: 'L20-forge',
		name: '大空洞·行会外院',
		desc: '铁匠铺的烟顺着石壁往上爬。有人在打铁，有人只是在暖手。',
		actions: [
			{
				text: '在炉边歇一歇（整备：处理伤口、用掉一件恢复物）',
				action: () => {
					const c = RPG.playerActor();
					if (!c) return RPG.perform('你还没有身体可以歇。');
					/* 与一段同形（`span1-hub.js`）：治疗检定 DC 15/18，加值取角色的治疗加值。 */
					const mod = c.stats?.heal_bonus ?? 0;
					const held = Object.keys(DND3.Traumas).filter((id) => c.contains(id));
					if (held.length === 0) RPG.perform(`${c.name}在炉边坐下。身上的伤还不算碍事。`);
					for (const id of held) {
						const r = DND3.treatTrauma(c, id, { mod });
						RPG.perform(r.ok
							? `你把${DND3.Traumas[id].name}处理了（治疗检定 ${r.total} ≥ DC ${r.dc}）。`
							: `${DND3.Traumas[id].name}没处理好（治疗检定 ${r.total} < DC ${r.dc}）——得再试。`);
					}
					const item = ['herb-poultice', 'bandage', 'ration'].find((id) => RPG.has(id));
					if (item) RPG.useItem(item, c, c);
					else if (held.length === 0) RPG.perform('炉边没有能用的东西 —— 烤一会儿火罢了。');
				},
			},
			/* **锻造台**：拿手里的图纸打铁（`#1788` 的配方 ⇒ `#1776` 的 craft 共享动作）。
			 *  一次动作打一件：逐张图纸试 ⇒ 材料不够的会在 `craftWith` 里被拒（输入**原子回退**）。 */
			{
				text: '在锻造台上打一件铁器（用图纸）',
				when: () => DND3.span2Blueprints().some((id) => RPG.has(id)),
				action: () => {
					const c = RPG.playerActor();
					if (!c) return RPG.perform('你还没有身体可以打铁。');
					const made = [];
					for (const id of DND3.span2Blueprints()) {
						if (!RPG.has(id)) continue;
						const r = RPG.act(c, id, c, 'craft');
						if (r?.status === 'applied') made.push(RPG.createItem(id).stats?.recipe?.yields?.[0]?.id);
					}
					const names = [...new Set(made)].filter((id) => RPG.items.has(id)).map((id) => RPG.createItem(id).name);
					RPG.perform(names.length > 0
						? `炉火压下去，打出了：${names.join('、')}。`
						: '料不够 —— 图纸还在手里。');
				},
			},
		],
	}));

	/* ② 聚落建设入口：消费端归 #1747（本笔不抢定资源语义，故 when 恒真）。 */
	map.addLocation(new RPG.Location({
		id: 'L20-settlement',
		name: '封建聚落·城墙根',
		desc: '石墙垒到一半就停了——因为往上再没有路。这里的规矩比石头更硬。',
		actions: [
			{
				/* 料场：① 领**锻造图纸**（`#1788` 的 6 张，逐个补齐）② 取一段木料（复用一段的采集点）。 */
				text: '在料场里翻找（图纸与木料）',
				action: () => {
					const missing = DND3.span2Blueprints().filter((id) => !RPG.has(id));
					for (const id of missing) RPG.give(id);
					if (!RPG.has('dead-wood')) RPG.give('dead-wood');
					RPG.perform(missing.length > 0
						? `你从料场翻出 ${missing.length} 张图纸，顺手拖来一段干木。`
						: '料场里只剩下碎木头 —— 图纸你都有了。');
				},
			},
			{
				text: '采集（枯倒的木料）',
				when: () => RPG.has('dead-wood'),
				action: () => RPG.gather('dead-wood'),
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
