/* core/10-item 的单元测试：Item 基类、defItem 工厂、注册表、快照往返 */
(() => {
	const R = () => setup.RPG;

	test('item：defItem 缺 id 抛错', () => assert.throws(() => R().defItem({ used() {} })));

	test('item：defItem 缺 used 抛错', () => assert.throws(() => R().defItem({ id: 'x' })));

	test('item：defItem 注册进注册表且可创建', () => {
		R().defItem({ id: 'unit-thing', name: '测试物', used() {} });
		assert.ok(R().items.has('unit-thing'));
		assert.ok(R().createItem('unit-thing') instanceof R().Item);
	});

	test('item：createItem 未注册 id 抛错', () => assert.throws(() => R().createItem('no-such')));

	test('item：快照往返（charges/equipped）', () => {
		R().give('bandage');
		const snap = State.variables.inventory[0];
		const item = R().reviveItem(snap);
		assert.eq(item.charges, snap.charges, 'charges 还原');
		assert.eq(item.equipped, false, 'equipped 还原');
	});

	test('item：未知动作不抛错（友好提示路径）', () => {
		const item = R().createItem('coin');
		item.used({ name: '测试' }, null, 'dance'); // perform 是 no-op，不抛即通过
	});
})();
