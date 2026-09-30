/* core/00-namespace 的单元测试：命名空间、三张注册表、事件总线 */
(() => {
	const R = () => setup.RPG;

	test('namespace：命名空间与三张注册表就位', () => {
		assert.eq(typeof R(), 'object');
		assert.ok(R().items instanceof Map, '道具注册表');
		assert.ok(R().characters instanceof Map, '角色注册表');
		assert.ok(R().scenes instanceof Map, '场景注册表');
	});

	test('namespace：事件总线 on/emit 携带载荷', () => {
		let got = null;
		const off = R().events.on('unit:event', (e) => { got = e; });
		R().events.emit('unit:event', { x: 1 });
		assert.eq(got && got.x, 1, '收到载荷');
		off();
	});

	test('namespace：off 取消订阅', () => {
		let n = 0;
		const off = R().events.on('unit:off', () => { n++; });
		off();
		R().events.emit('unit:off', {});
		assert.eq(n, 0, '取消后不再收到');
	});

	test('namespace：监听器抛异常不影响其他监听器（隔离）', () => {
		let ok = false;
		R().events.on('unit:err', () => { throw new Error('boom'); });
		R().events.on('unit:err', () => { ok = true; });
		R().events.emit('unit:err', {}); // 第一个抛错，第二个仍应执行
		assert.ok(ok, '后续监听器照常运行');
	});
})();
