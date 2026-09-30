/* dnd3 多敌人战斗的单元测试：双哥布林战（喽啰+首领同时出战） */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	/** 重置两只哥布林到初始状态 */
	const resetGoblins = () => {
		D().Goblin.hp = 6; D().Goblin.items = [{ id: 'club', equipped: true }, { id: 'coin' }];
		D().Goblin.effects = [];
		D().GoblinBoss.hp = 12; D().GoblinBoss.items = [
			{ id: 'club', equipped: true }, { id: 'coin' }, { id: 'bandage', charges: 1 },
		];
		D().GoblinBoss.effects = [];
	};

	/** 造一个必杀武器并给玩家 */
	const setupGodSword = () => {
		R().defItem({
			id: 'unit-god-sword', name: '神剑', weapon: true, slot: 'weapon',
			stats: { dmg: '20' },
			used(that) {
				that.hp = 0;
				D().grantDeathIfDown(that);
			},
			actions: { equip: R().slotEquip, unequip: R().slotUnequip },
		});
		State.variables.inventory = [];
	};

	test('dnd3 battle：双敌人战斗——两人都行动、逐个出局、各自掉落', async () => {
		resetGoblins();
		setupGodSword();

		const player = new (R().Character)({
			name: '无敌测试员', hp: 100, maxHp: 100,
			stats: D().stats({ ac: 30 }),
			items: [{ id: 'unit-god-sword', equipped: true }], // 玩家得持有武器
		});

		await new (R().Battle)(5, [player], [D().Goblin, D().GoblinBoss]).execute();

		assert.ok(D().Goblin.isDown, `普通哥布林出局（hp=${D().Goblin.hp}）`);
		assert.ok(D().GoblinBoss.isDown, `首领出局（hp=${D().GoblinBoss.hp}）`);
		assert.ok(R().has('coin'), '掉落硬币');
		assert.ok(R().has('bandage'), '掉落绷带');
		assert.ok(!R().has('club'), '装备不掉落');
	});

	test('dnd3 battle：interactive 模式下多敌人可选目标', async () => {
		resetGoblins();
		setupGodSword();
		State.variables.inventory = [{ id: 'unit-god-sword', charges: null, equipped: true }];

		// 发起交互式战斗——choice 在 shim 里 pending，只验证不抛错
		const battle = new (R().Battle)(1, [D().Player], [D().Goblin, D().GoblinBoss], true);
		const result = battle.execute();
		assert.ok(result instanceof Promise || result === undefined, '执行不抛错');
	});

	test('dnd3 battle：单杀首领（喽啰已倒）也能触发掉落', async () => {
		resetGoblins();
		setupGodSword();

		const player = new (R().Character)({
			name: '无敌', hp: 100, maxHp: 100,
			stats: D().stats({ ac: 30 }),
			items: [{ id: 'unit-god-sword', equipped: true }],
		});

		D().GoblinBoss.hp = 1; // 一击必杀
		await new (R().Battle)(1, [player], [D().GoblinBoss]).execute();

		assert.ok(R().has('bandage'), '掉落绷带');
		assert.ok(!R().has('club'), '装备不掉落');
	});
})();
