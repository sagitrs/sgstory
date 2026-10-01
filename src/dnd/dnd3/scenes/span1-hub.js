/* DND3 —— 巴别之井「一段」：第 10 层整备区 Scene 骨架（#1748）
 *
 * 面：`docs/plans/babel/layers.md:10`（第 10 层「大空洞·奴隶制农耕」，非战斗区）＋ `outline.md`
 *   「单向门法则」（段间单向、段内自由；终局「回井」由古代文明代为执行）。
 * 范围（**最小形**，照 #1748）：只含三件 ——
 *   ① **整备点**（歇脚/使用消耗品的入口，只做入口，不造系统）
 *   ② **聚落建设入口**（衔接资源聚落票 #1747；此处只留调用点与前置条件，不实现建设面）
 *   ③ **升层单向门 10→11**（`RPG.Exit` 有向边；单向由「无 11→10 回边」表达）
 *
 * ★ **#1746（试玩版集成）在此接上真 API**（原为占位 `perform`）：
 *   ① 整备 ⇒ 创伤的**解除通路** `DND3.treatTrauma`（治疗检定 DC 15/18，加值取 `stats.heal_bonus`）
 *      ＋「用掉一件恢复物」（`RPG.useItem`，有就用、没有就只是坐着 —— ✗ 不发明第二套休息规则）；
 *      这条正是 `#1780` §八.2 记的「hub 解除闭环」缺口，此处补上**具名调用点**。
 *   ② 建设 ⇒ `#1776` 的「图纸（道具）＋ 落地效果」形：发图纸 `farm-plot` ⇒ `RPG.act(…, 'build')` ⇒
 *      收获 `RPG.harvest()`（读 `span1Farms`）。前置条件用**真凭据**（有没有图纸/有没有田），✗ 恒真占位。
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
			{
				text: '在火边歇一歇（整备：处理伤口、用掉一件恢复物）',
				action: () => {
					const c = RPG.playerActor();
					if (!c) return RPG.perform('你还没有身体可以歇。');
					/* ① 创伤的解除通路（`#1780` §五 H1）：治疗检定 DC 15/18，加值取角色的治疗加值。
					 *   `treatTrauma` 自己掷骰、自己比对 DC（判定数学在包里），此处只负责**发起**与播报。 */
					const mod = c.stats?.heal_bonus ?? 0;
					const held = Object.keys(DND3.Traumas).filter((id) => c.contains(id));
					if (held.length === 0) RPG.perform(`${c.name}在火边坐下。身上的伤还不算碍事。`);
					for (const id of held) {
						const r = DND3.treatTrauma(c, id, { mod });
						RPG.perform(r.ok
							? `你把${DND3.Traumas[id].name}处理了（治疗检定 ${r.total} ≥ DC ${r.dc}）。`
							: `${DND3.Traumas[id].name}没处理好（治疗检定 ${r.total} < DC ${r.dc}）——得再试。`);
					}
					/* ② 用掉一件恢复物：**有就用**（入口语义），✗ 不在此定义恢复规则本身。 */
					const item = ['herb-poultice', 'bandage', 'ration'].find((id) => RPG.has(id));
					if (item) RPG.useItem(item, c, c);
					else if (held.length === 0) RPG.perform('火边没有能用的东西 —— 坐一会儿罢了。');
				},
			},
		],
	}));

	/* ② 聚落建设入口：`#1776` 的「种子→田垄→口粮」最短闭环（图纸是道具、落地效果在 `registerBuild`）。
	 *    `when` 用**真凭据**（有没有图纸／有没有田）—— `#1748` 当时的恒真占位已在本笔换掉。 */
	map.addLocation(new RPG.Location({
		id: 'L10-settlement',
		name: '农耕聚落·围栏',
		desc: '低矮的石圈围着几畦翻好的土。这里的秩序是别人替你决定的。',
		actions: [
			{
				/* 建设载体：图纸是**道具**（`#1776` 甲案：资源即 Item）⇒ 先领图纸（=前置条件**可判**）。 */
				text: '领一块田垄的图纸',
				when: () => !RPG.has('farm-plot'),
				action: () => {
					RPG.give('farm-plot');
					RPG.perform('管事的丢给你一块木牌：『东边第三畦，归你了。』');
				},
			},
			{
				text: '开垦一畦田（需种子×2）',
				when: () => RPG.has('farm-plot'),
				action: () => RPG.act(RPG.playerActor(), 'farm-plot', RPG.playerActor(), 'build'),
			},
			{
				text: '收获（田里有东西才有得收）',
				when: () => DND3.farmCount() > 0,
				action: () => RPG.harvest(),
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
