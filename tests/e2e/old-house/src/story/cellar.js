/* 剧情场景示例：厨房地窖支线（story/ 在 core/、dnd3/ 之后加载）
 *
 * 包含两部分：
 *   1. 三个 Scene Event（cellar-entry ↔ cellar-box / cellar-wine）——
 *      演示 when 条件选项、action 副作用、自循环重绘、终点选项导航回 twee。
 *   2. 铁箱（RPG.Chest 陷阱宝箱）——入口在 cellar-entry，
 *      遭遇本体是 twee 段落（见 scenes.twee 的「铁箱」）。
 */

// story/ 目录只注入 (RPG, $) 别名；用到规则包时自行声明局部别名
const DND3 = setup.DND3;

// ---------- 铁箱：可战斗的容器（随机陷阱技能 + 战利品） ----------
const CHEST_LOOT = () => [{ id: 'bandage', charges: 1 }];

DND3.IronChest = new DND3.Chest({
	id: 'iron-chest',
	name: '铁箱',
	hp: 10,
	items: CHEST_LOOT(),
	skill: DND3.rollChestTrap(), // 总是持有一个随机陷阱技能
});

// 重新开始时重置铁箱，并重新随机它的技能
jQuery(document).on(':enginerestart', () => {
	DND3.IronChest.hp = 10;
	DND3.IronChest.disarmed = false;
	DND3.IronChest.locked = false;
	DND3.IronChest.opened = false;
	DND3.IronChest.items = CHEST_LOOT();
	DND3.IronChest.skill = DND3.rollChestTrap();
});

// ---------- 地窖场景 ----------
RPG.registerScene(new RPG.Scene({
	id: 'cellar-entry',
	title: '地窖入口',
	text: () => `你顺着石阶走进地窖。空气潮湿阴冷，霉味扑面而来。` +
		`角落里有一只钉死的木箱，靠墙的酒架上歪斜地插着几瓶酒，` +
		`墙角还立着一只包铁皮的箱子。`,
	choices: [
		{ text: '查看木箱', scene: 'cellar-box' },
		{ text: '检查酒架', scene: 'cellar-wine' },
		{
			text: () =>
				DND3.IronChest.locked ? '查看锁死的铁箱'
				: DND3.IronChest.isDone ? '查看敞开的铁箱'
				: '查看铁箱',
			action: () => SugarCube.Engine.play('铁箱'), // 遭遇本体是 twee 段落
		},
		{
			text: '离开地窖',
			// 回探索地图（#1749 E-1）：'厨房' 是 map 里的**地点**（map.js 的 id:'kitchen'），
			// 不是 twee 段落 —— 直接 Engine.play('厨房') 会跳到不存在的段落（死链）。
			// 地窖是从探索地图的储物间进来的，出口即回该地图（'探索' 是已注册的 MapScene）。
			action: () => SugarCube.Engine.play('探索'),
		},
	],
}));

RPG.registerScene(new RPG.Scene({
	id: 'cellar-box',
	title: '地窖木箱',
	text: '木箱的盖子被长钉钉死，但对你手里的家伙而言算不了什么。',
	choices: [
		{
			text: '用木棒撬开木箱',
			when: () => RPG.has('club') && !State.variables.boxOpened,
			action: () => {
				State.variables.boxOpened = true;
				RPG.give('coin');
				RPG.give('iron-key');
				RPG.perform('长钉呻吟着松开——箱底藏着一枚旧硬币和一把铁钥匙。');
			},
			scene: 'cellar-box', // 自循环：重绘本场景，撬开选项随之消失
		},
		{ text: '回到地窖中央', scene: 'cellar-entry' },
	],
}));

RPG.registerScene(new RPG.Scene({
	id: 'cellar-wine',
	title: '地窖酒架',
	text: () => State.variables.wineTaken
		? '酒架上只剩一层灰，刚才那卷油纸包还压在你手里。'
		: '大多数瓶子早就空了，只有一瓶用油纸裹得严严实实。',
	choices: [
		{
			text: '收起油纸包',
			when: () => !State.variables.wineTaken,
			action: () => {
				State.variables.wineTaken = true;
				RPG.give('bandage');
				RPG.perform('油纸里是一卷保存完好的急救绷带。');
			},
			scene: 'cellar-wine',
		},
		{ text: '回到地窖中央', scene: 'cellar-entry' },
	],
}));
