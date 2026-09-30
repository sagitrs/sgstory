/* 老宅与银怀表 —— 世界地图定义（替代 scenes.twee 的导航网） */
const DND3 = setup.DND3;
const R = setup.RPG;


const map = new R.WorldMap({ id: 'old-house' });

/* ---------- 位置 ---------- */

map.addLocation(new R.Location({
	id: 'hall', name: '门厅',
	desc: () => `门厅里立着一幅蒙尘的画像。左边是厨房，右边是书房，正前方的楼梯通向二楼。` +
		`${R.has('club') ? '' : '墙角斜靠着一根木棒。'}`,
	actions: [
		{
			text: '拾起墙角的木棒',
			when: () => !R.has('club'),
			action: () => {
				R.give('club');
				R.equip('club');
			},
		},
		{
			text: '凑近看那幅画像',
			action: () => R.perform('画框一角刻着小字：『钥匙藏在火中。』'),
		},
	],
}));

map.addLocation(new R.Location({
	id: 'kitchen', name: '厨房',
	desc: () => `灶台早已冷却，锅里发霉的汤散发着怪味。` +
		`${R.has('bandage') ? '' : '抽屉半开着，露出几卷急救绷带。'}` +
		`${R.has('bomb') ? '' : '灶台后似乎藏着什么。'}`,
	actions: [
		{
			text: '翻找抽屉里的绷带',
			when: () => !R.has('bandage'),
			action: () => R.give('bandage'),
		},
		{
			text: '灶台后摸出一枚铁皮炸弹',
			when: () => !R.has('bomb'),
			action: () => R.give('bomb'),
		},
		{
			text: '使用绷带（治疗自己）',
			when: () => R.has('bandage') && DND3.Player.hp < DND3.Player.maxHp,
			action: () => R.useItem('bandage', DND3.Player, DND3.Player),
		},
		{
			text: () => R.isEquipped('club') ? '收起木棒' : '握紧木棒',
			when: () => R.has('club'),
			action: () => R.toggleEquip('club'),
		},
	],
}));

map.addLocation(new R.Location({
	id: 'study', name: '书房',
	desc: () => `书架上的书大多成了虫子的家，角落的壁炉里堆满冷灰。`,
	actions: [
		{
			text: '翻检书架',
			action: () => R.perform('你翻了半天，只找到一本残缺的日记：『……怀表在二楼主卧的抽屉里。钥匙？我把钥匙藏进了壁炉的灰烬中……』'),
		},
		{
			text: '扒开壁炉里的灰烬',
			when: () => !State.variables.hasKey,
			action: () => {
				State.variables.hasKey = true;
				R.perform('灰烬深处，一把黄铜钥匙静静地躺着。');
			},
		},
		{
			text: '阅读桌上的《急救手册》',
			when: () => !State.variables.readManual,
			action: () => {
				State.variables.readManual = true;
				DND3.Player.stats.heal_bonus = 2;
				R.perform('你学会了更专业的包扎手法——治疗量 +2。');
			},
		},
	],
}));

map.addLocation(new R.Location({
	id: 'corridor', name: '二楼走廊',
	desc: () => `走廊尽头有两扇门：左边虚掩着，右边${State.variables.hasKey ? '可以打开' : '锁着'}。` +
		`${State.variables.trapSprung ? '' : '走廊中央有一块地板明显松动了。'}`,
	actions: [
		{
			text: '试着跳过松动的地板',
			when: () => !State.variables.trapSprung,
			action: () => {
				DND3.Player.damage(4);
				State.variables.trapSprung = true;
				R.perform('咔嚓——地板塌了一角！损失 4 点体力。');
			},
		},
	],
}));

map.addLocation(new R.Location({
	id: 'storeroom', name: '储物间',
	desc: () => `堆满杂物的储物间。${DND3.Goblin.isDown ? '哥布林瘫倒在地。' : '角落里蜷着一只哥布林。'}`,
	actions: [
		{ text: '翻找杂物堆', when: () => !R.has('coin'), action: () => R.give('coin') },
		{ text: '翻出铁环甲', when: () => !R.has('mail'), action: () => { R.give('mail'); R.equip('mail'); } },
		{ text: '拿走皮靴', when: () => !R.has('boots'), action: () => { R.give('boots'); R.equip('boots'); } },
		// —— 战斗（导航到独立段落，需要全屏渲染） ——
		{
			text: '挥棒攻击哥布林',
			when: () => R.has('club') && !DND3.Goblin.isDown,
			action: () => SugarCube.Engine.play('攻击哥布林'),
		},
		{
			text: '挑战哥布林首领（喽啰+首领）',
			when: () => R.has('club') && !DND3.GoblinBoss.isDown,
			action: () => SugarCube.Engine.play('首领战'),
		},
		{
			text: '用炸弹炸哥布林',
			when: () => R.has('bomb') && !DND3.Goblin.isDown,
			action: () => {
				R.useItem('bomb', DND3.Goblin, DND3.Player);
				if (DND3.Goblin.isDown) R.loot(DND3.Goblin);
			},
		},
		{
			text: '用绷带治疗哥布林',
			when: () => R.has('bandage') && !DND3.Goblin.isDown,
			action: () => SugarCube.Engine.play('给哥布林包扎'),
		},
		// —— 铁箱（Scene 驱动，导航到地窖入口） ——
		{
			text: '查看地窖',
			action: () => {
				State.variables.sceneId = 'cellar-entry';
				SugarCube.Engine.play('场景舞台');
			},
		},
	],
}));

map.addLocation(new R.Location({
	id: 'bedroom', name: '主卧',
	desc: () => `月光洒进房间，五斗橱的抽屉里躺着那只传说中的银色怀表。`,
	actions: [
		{
			text: '取下墙上的长剑',
			when: () => !R.has('sword'),
			action: () => { R.give('sword'); R.equip('sword'); },
		},
		{
			text: '拿起怀表，离开老宅',
			action: () => SugarCube.Engine.play('结局-月光'),
		},
	],
}));

/* ---------- 出口 ---------- */

map.addPath({ from: 'hall', to: 'kitchen', text: '去厨房' });
map.addPath({ from: 'kitchen', to: 'hall', text: '回门厅' });
map.addPath({ from: 'hall', to: 'study', text: '去书房' });
map.addPath({ from: 'study', to: 'hall', text: '回门厅' });
map.addPath({ from: 'hall', to: 'corridor', text: '上二楼' });
map.addPath({ from: 'corridor', to: 'hall', text: '下一楼' });
map.addPath({ from: 'corridor', to: 'storeroom', text: '进储物间' });
map.addPath({ from: 'storeroom', to: 'corridor', text: '回走廊' });
map.addPath({
	from: 'corridor', to: 'bedroom', text: () => State.variables.hasKey ? '用钥匙打开主卧' : '主卧锁着',
	when: () => State.variables.hasKey === true,
});
map.addPath({ from: 'bedroom', to: 'corridor', text: '回走廊' });

/* ---------- 校验 ---------- */

const problems = [...map.validate(), ...map.validateConnectivity('hall')];
if (problems.length > 0) {
	console.error('[old-house] 地图校验问题：', problems);
}

/* ---------- 注册为可玩的 MapScene ---------- */

setup.OLD_HOUSE_MAP = map;
RPG.registerScene(new R.MapScene({ id: 'explore', title: '老宅探索', map, start: 'hall' }));
