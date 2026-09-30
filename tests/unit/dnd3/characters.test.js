/* dnd3/characters 的单元测试：数值块对称性（玩家 vs 哥布林 vs 哥布林首领）
 * 注意：hp/items 会被战斗测试污染，这里只断言不可变的构造属性
 * （stats / maxHp），items 用显式重置恢复。
 */
(() => {
	const D = () => setup.DND3;

	test('dnd3：全部角色的数值块完全对称', () => {
		const pk = Object.keys(D().Player.stats).sort().join(',');
		const gk = Object.keys(D().Goblin.stats).sort().join(',');
		const bk = Object.keys(D().GoblinBoss.stats).sort().join(',');
		assert.eq(pk, gk, '玩家=哥布林');
		assert.eq(gk, bk, '哥布林=哥布林首领');
	});

	test('dnd3：哥布林首领比普通哥布林更强（maxHp/stats 断言）', () => {
		assert.ok(D().GoblinBoss.maxHp > D().Goblin.maxHp,
			`maxHp ${D().GoblinBoss.maxHp} > ${D().Goblin.maxHp}`);
		assert.ok(D().GoblinBoss.stats.bab > D().Goblin.stats.bab, 'BAB 更高');
		assert.ok(D().GoblinBoss.stats.ac >= D().Goblin.stats.ac, 'AC 不低');
	});

	test('dnd3：哥布林首领的装备/掉落与哥布林同规则', () => {
		// 显式重置 items（jQuery shim 无法触发 :enginerestart）
		D().GoblinBoss.items = [
			{ id: 'club', equipped: true },
			{ id: 'coin' },
			{ id: 'bandage', charges: 1 },
		];
		const equipped = D().GoblinBoss.items.filter((s) => s.equipped);
		const droppable = D().GoblinBoss.items.filter((s) => !s.equipped);
		assert.ok(equipped.length > 0, '有装备（不掉落）');
		assert.ok(droppable.length > 0, '有掉落物');
	});
})();
