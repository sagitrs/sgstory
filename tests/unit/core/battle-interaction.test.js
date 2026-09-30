/* core/40-battle 交互回合的单元测试：选项构造（纯函数 buildPlayerOptions）
 * 回应检视 M5a/M5b/M5c 突变：拔掉跳过选项/装备卸下提交/动作层应转红。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	test('battle interaction：道具选项含跳过本回合 + 已装备标记', () => {
		R().give('club'); R().equip('club');
		R().give('bandage');
		const battle = new (R().Battle)(1, [D().Player], [new (R().Character)({ name: '靶', hp: 1 })], true);
		const { itemOptions } = battle.buildPlayerOptions(D().Player);
		assert.ok(itemOptions.length >= 3, `至少 3 个选项（木棒+绷带+跳过），实际 ${itemOptions.length}`);
		const skip = itemOptions.find(o => o.value === 'skip');
		assert.ok(skip, '有「跳过本回合」选项');
		const club = itemOptions.find(o => o.text.includes('木棒'));
		assert.ok(club && club.text.includes('已装备'), '已装备武器带标记');
	});

	test('battle interaction：未装备武器 → 动作集含装备选项（M5c 检测）', () => {
		R().give('club'); // 不 equip
		const battle = new (R().Battle)(1, [D().Player], [new (R().Character)({ name: '靶', hp: 1 })], true);
		const { actionOptionsFor } = battle.buildPlayerOptions(D().Player);
		const item = R().reviveItem(State.variables.inventory[0]);
		assert.ok(!item.equipped, '木棒初始未装备');
		const actions = actionOptionsFor(item);
		// M5c 突变：如果动作层被拔掉，actions 只有 [使用]，没有 [装备]
		assert.ok(actions.length >= 2, `动作集应有 ≥2 项（使用+装备），实际 ${actions.length}`);
		assert.ok(actions.some(a => a.value === 'equip'), '有装备选项');
		assert.ok(actions.some(a => a.text.includes('消耗本回合')), '装备标注消耗回合');
	});

	test('battle interaction：已装备武器 → 动作集含卸下选项', () => {
		R().give('club'); R().equip('club');
		const battle = new (R().Battle)(1, [D().Player], [new (R().Character)({ name: '靶', hp: 1 })], true);
		const { actionOptionsFor } = battle.buildPlayerOptions(D().Player);
		const item = R().reviveItem(State.variables.inventory[0]);
		assert.ok(item.equipped, '木棒已装备');
		const actions = actionOptionsFor(item);
		assert.ok(actions.some(a => a.value === 'unequip'), '有卸下选项');
		assert.ok(!actions.some(a => a.value === 'equip'), '已装备不再显示装备选项');
	});

	test('battle interaction：无装备动作的道具 → 仅「使用」（如绷带）', () => {
		R().give('bandage');
		const battle = new (R().Battle)(1, [D().Player], [new (R().Character)({ name: '靶', hp: 1 })], true);
		const { actionOptionsFor } = battle.buildPlayerOptions(D().Player);
		const item = R().reviveItem(State.variables.inventory[0]);
		const actions = actionOptionsFor(item);
		assert.eq(actions.length, 1, '绷带只有「使用」一个动作');
		assert.eq(actions[0].value, 'use', '唯一动作为使用');
	});

	test('battle interaction：装备经 useItem 提交到背包快照（M5b 检测）', () => {
		R().give('club'); // 未装备
		const before = State.variables.inventory[0].equipped;
		assert.ok(!before, '初始未装备');
		// 直接调用 useItem 的 equip 动作（模拟交互战中选择装备）
		R().useItem('club', D().Player, D().Player, 'equip');
		const after = State.variables.inventory[0].equipped;
		assert.ok(after, 'useItem equip 后背包快照的 equipped 变为 true');
		// 卸下
		R().useItem('club', D().Player, D().Player, 'unequip');
		assert.ok(!State.variables.inventory[0].equipped, 'useItem unequip 后恢复 false');
	});

	test('battle interaction：目标选项标注己方与敌方', () => {
		const enemy = new (R().Character)({ name: '敌人' });
		const ally = new (R().Character)({ name: '盟友' });
		const battle = new (R().Battle)(1, [D().Player, ally], [enemy], true);
		const { targetOptions } = battle.buildPlayerOptions(D().Player);
		const enemyOpt = targetOptions.find(o => o.value === '敌人');
		const allyOpt = targetOptions.find(o => o.value === '盟友');
		assert.ok(enemyOpt && enemyOpt.text.includes('敌方'), '敌人标注敌方');
		assert.ok(allyOpt && allyOpt.text.includes('己方'), '盟友标注己方');
	});
})();
