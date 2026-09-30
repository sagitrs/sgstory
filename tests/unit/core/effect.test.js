/* core/17-effect 的单元测试：Effect/Debuff 与 death 实例 */
(() => {
	const R = () => setup.RPG;

	test('effect：Effect 缺 id 抛错', () => assert.throws(() => new (R().Effect)({})));

	test('effect：Debuff 继承 Effect', () =>
		assert.ok(R().Debuff.prototype instanceof R().Effect));

	test('effect：death 是 Debuff 实例且 id 为 death', () => {
		assert.ok(R().death instanceof R().Debuff);
		assert.eq(R().death.id, 'death');
	});
})();
