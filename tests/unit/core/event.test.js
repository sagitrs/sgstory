/* core/15-event 的单元测试：Event 抽象基类与 execute 接口 */
(() => {
	const R = () => setup.RPG;

	test('event：Event 是抽象基类，直接实例化抛错', () =>
		assert.throws(() => new (R().Event)()));

	test('event：子类实现 execute 后可运行且 instanceof 成立', () => {
		const klass = class UnitEvent extends R().Event {
			execute() { return 42; } // 返回值仅用于断言；正式事件用 perform 输出
		};
		const ev = new klass();
		assert.ok(ev instanceof R().Event);
		assert.eq(ev.execute(), 42, 'execute 可执行');
	});

	test('event：子类未实现 execute 时抛出接口错误', () => {
		const klass = class LazyEvent extends R().Event {};
		assert.throws(() => new klass().execute());
	});
})();
