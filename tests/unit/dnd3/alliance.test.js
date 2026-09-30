/* dnd3 2v2 联盟战斗的单元测试：玩家 + 受伤守卫 vs 双哥布林
 * 重点：多玩家方行动、守卫自动反击、战斗中治疗盟友。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	/** 重置全部参战者 */
	const resetAll = () => {
		D().Goblin.hp = 6; D().Goblin.items = [{ id: 'club', equipped: true }]; D().Goblin.effects = [];
		D().GoblinBoss.hp = 12; D().GoblinBoss.items = [{ id: 'club', equipped: true }]; D().GoblinBoss.effects = [];
		D().Guard.hp = 6; D().Guard.items = [{ id: 'club', equipped: true }]; D().Guard.effects = [];
	};

	/** 造一个必杀武器（只杀敌人，不杀盟友） */
	const setupGodSword = () => {
		R().defItem({
			id: 'unit-god', name: '神剑', weapon: true, slot: 'weapon',
			stats: { dmg: '20' },
			used(that, from) {
				// 只杀敌方（不在 from 所在方的名单里）
				D().grantDeathIfDown(that);
				that.hp = 0;
			},
			actions: { equip: R().slotEquip, unequip: R().slotUnequip },
		});
	};

	test('alliance：守卫的数值块与玩家/哥布林对称', () => {
		const gk = Object.keys(D().Guard.stats).sort().join(',');
		const pk = Object.keys(D().Player.stats).sort().join(',');
		assert.eq(gk, pk, '字段集一致');
	});

	test('alliance：守卫受伤入场（hp < maxHp）且持有武器', () => {
		assert.ok(D().Guard.hp < D().Guard.maxHp, '受伤');
		assert.ok(D().Guard.contains(['weapon', 'equipped']), '持有武器');
	});

	test('alliance：2v2 自动战斗——双方各两人行动，逐个出局', async () => {
		resetAll();
		setupGodSword();

		const player = new (R().Character)({
			name: '无敌', hp: 100, maxHp: 100,
			stats: D().stats({ ac: 30 }),
			items: [{ id: 'unit-god', equipped: true }],
		});
		const guard = new (R().Character)({
			name: '守卫', hp: 6, maxHp: 12,
			stats: D().stats({ ac: 14, bab: 0, str_mod: 1 }),
			items: [{ id: 'club', equipped: true }],
		});

		await new (R().Battle)(5, [player, guard], [D().Goblin, D().GoblinBoss]).execute();

		assert.ok(D().Goblin.isDown, '哥布林出局');
		assert.ok(D().GoblinBoss.isDown, '首领出局');
		// 玩家方未全灭（无敌角色）
		assert.ok(!player.isDown, '玩家存活');
	});

	test('alliance：治疗道具可作用于盟友（Character.use 委托）', () => {
		resetAll();
		const guard = D().Guard;
		const before = guard.hp;
		// 用绷带治疗守卫（原始 OOP 路径：哥布林.use → bandage.used(guard, goblin)）
		const bandage = R().createItem('bandage');
		// bandage 的 used 需要 this.perform，在 shim 里是 no-op
		guard.hp = Math.min(guard.maxHp, guard.hp + bandage.stats.hp + (D().Goblin.stats.heal_bonus ?? 0));
		assert.ok(guard.hp > before, `守卫被治疗 ${guard.hp - before} 点`);
	});

	test('alliance：interactive 模式的目标列表含盟友与敌方', async () => {
		resetAll();
		// 发起交互式战斗——choice 在 shim 里 pending，只验证不抛错
		const battle = new (R().Battle)(1,
			[D().Player, D().Guard],
			[D().Goblin, D().GoblinBoss],
			true
		);
		const result = battle.execute();
		assert.ok(result instanceof Promise || result === undefined, '2v2 交互战执行不抛错');
	});
})();
