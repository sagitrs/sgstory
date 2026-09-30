/* core/41-chest 的单元测试：机制（无判定——判定在规则包，见 dnd3.test.js） */
(() => {
	const R = () => setup.RPG;

	test('chest：是一个 Item，且满足战斗目标契约（isDown）', () => {
		const c = new (R().Chest)({ id: 'unit-box', name: '测试箱', hp: 0 });
		assert.ok(c instanceof R().Item);
		assert.ok(c.isBroken && c.isDown, 'isDown 与 isBroken 同构');
	});

	test('chest：openBy 掉落战利品并结束交互', () => {
		const c = new (R().Chest)({ id: 'b1', name: '箱', items: [{ id: 'coin' }] });
		c.openBy();
		assert.ok(c.opened && c.disarmed && c.isDone);
		assert.ok(R().has('coin'));
	});

	test('chest：lockNow 永久锁死', () => {
		const c = new (R().Chest)({ id: 'b2', name: '箱' });
		c.lockNow();
		assert.ok(c.locked && c.isDone);
	});

	test('chest：core 没有 lockpick 动作（判定留在规则包）', () => {
		const c = new (R().Chest)({ id: 'b5', name: '素箱' });
		c.used({ name: '测试者' }, null, 'lockpick'); // 未注册动作 → 友好提示，不抛错
		assert.ok(!c.locked && !c.opened, '状态不变');
	});
})();
