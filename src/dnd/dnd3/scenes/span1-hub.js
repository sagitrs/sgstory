/* DND3 —— 巴别之井「一段」：第 10 层整备区 Scene 骨架（#1748）
 *
 * 面：`docs/plans/babel/layers.md:10`（第 10 层「大空洞·奴隶制农耕」，非战斗区）＋ `outline.md`
 *   「单向门法则」（段间单向、段内自由；终局「回井」由古代文明代为执行）。
 * 范围（**最小形**，照 #1748）：只含三件 ——
 *   ① **整备点**（歇脚/使用消耗品的入口，只做入口，不造系统）
 *   ② **聚落建设入口**（衔接资源聚落票 #1747；此处只留调用点与前置条件，不实现建设面）
 *   ③ **升层单向门 10→11**（`RPG.Exit` 有向边；单向由「无 11→10 回边」表达）
 * **不含**（留白，显式排除）：居民／剧情／献祭兽／建筑树——`outline.md` 的「大空洞的居民来源」与
 *   `layers.md` 的「本表前提」两项留白未裁定前不预设。
 *
 * 车道：本文件是**数据面**（Location/Exit/Scene 定义），可挂进任何地图或 Phase 1 集成（#1746）；
 *   试玩载体（Twee/JS 形态、仓落点）归 #1746 裁定，本笔不预设。
 */

/** 第 10 层整备区的地点图 —— 三个地点，两条边（进/出各一条，均单向且无回边）。 */
setup.DND3.buildSpan1Hub = () => {
	const map = new RPG.WorldMap({ id: 'babel-span1-hub' });

	/* ① 整备点：非战斗区的歇脚处。这里是「使用消耗品／回血」的**入口**——
	 *    真正的休息语义（回血多少、是否消耗资源）归 #1747 的资源/聚落最小形；
	 *    本笔只保证「有一个可与之交互的地点」，不发明第二套休息规则。 */
	map.addLocation(new RPG.Location({
		id: 'L10-camp',
		name: '大空洞·营火',
		desc: '大空洞的底部支着一排兽皮棚。有火，有石凳，也有人不说话地看着你。',
		actions: [
			{ text: '在火边歇一歇（整备点）', action: () => RPG.perform('（整备：后续接消耗品与恢复规则，见 #1747）') },
		],
	}));

	/* ② 聚落建设入口：衔接 #1747 的「种子→农田→食物产出」最短闭环。
	 *    `when` 只做**前置条件的表达示范**（本笔不定义资源 id，故条件恒真）——
	 *    资源 id 与消耗端由 #1747 落地后替换此处的 `when`，避免本笔抢定资源语义。 */
	map.addLocation(new RPG.Location({
		id: 'L10-settlement',
		name: '农耕聚落·围栏',
		desc: '低矮的石圈围着几畦翻好的土。这里的秩序是别人替你决定的。',
		actions: [
			{
				text: '查看开垦的地（聚落建设入口）',
				when: () => true,
				action: () => RPG.perform('（建设：此处后续接「收集→建设→升层」闭环，#1747）'),
			},
		],
	}));

	/* ③ 升层单向门：10 → 11。单向由**无回边**表达（段内各层照常通行、段间封闭，见 outline「单向门法则」）。 */
	map.addLocation(new RPG.Location({
		id: 'L10-gate',
		name: '通往上一层的单向门',
		desc: '石壁上裂开一道竖直的光。穿过它，这段路就再也回不来了。',
	}));

	map.addPath({ from: 'L10-camp', to: 'L10-settlement', text: '走向围栏' });
	map.addPath({ from: 'L10-settlement', to: 'L10-gate', text: '走向石门' });
	/* ★ 单向门本体：L10 → L11。`L11` 由下一段的层元数据提供（本笔不建 11 层实体），
	 *   故此处**不** addPath（那会造悬空边、`validate()` 必红）。成的形状在 `span1GateExit()` 里给出，
	 *   供 #1746 在完整地图上接线时使用；本笔用用例证明「该边无反向」。 */

	/* 构建时校验：无孤立点、无悬空边（core 的 build-and-check 原则） */
	const problems = map.validate();
	if (problems.length > 0) throw new Error(`第 10 层整备区图不合法：${problems.join('；')}`);
	return map;
};

/** 升层单向门（10→11）的边定义——**只给定义，不挂图**（11 层实体归二段票）。
 *  供 #1746 接线：`fullMap.addExit(DND3.span1GateExit())`（届时 L11 已存在 ⇒ 不悬空）。
 *  单向的机械表达：全图**不存在** `L11 → L10` 的边（段内自由、段间封闭）。 */
setup.DND3.span1GateExit = () => new RPG.Exit({
	from: 'L10-gate',
	to: 'L11',
	text: '穿过单向门，升入第 11 层',
});

/* ---------- 整备区 Scene（非战斗）----------
 * 只做「入场描述 → 两个非战斗选项 → 升层」的最短形；选项的 action 都指向 #1747 的接线点。
 * 不设战斗选项、不设敌人（第 10 层在 `core/climb.js` 的遭遇表里**无条目**）。
 */
setup.DND3.Span1HubScene = () => RPG.registerScene(new RPG.Scene({
	id: 'babel-span1-hub',
	title: '第 10 层 · 农耕聚落（整备）',
	text: '你从第 9 层的黑暗里爬出来，第一次看见天光——尽管那只是穹顶上的磷石。'
		+ '大空洞里有人在耕作，有人在搬运石料，没有人抬头看你。',
	choices: [
		{ text: '在火边歇一歇', scene: 'babel-span1-hub' },   // 自循环重绘：整备入口
		{ text: '查看开垦的地', scene: 'babel-span1-hub' },   // 自循环重绘：建设入口
	],
}));
