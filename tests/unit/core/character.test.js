/* core/20-character 的单元测试 */
(() => {
	const R = () => setup.RPG;

	test('character：heal/damage 钳制到 [0, maxHp]', () => {
		const c = new (R().Character)({ name: '甲', hp: 8, maxHp: 10 });
		assert.eq(c.heal(5), 2, '治疗量钳制');
		assert.eq(c.heal(99), 0, '满血不超治');
		assert.eq(c.damage(99), 10, '扣血钳制到 0');
		assert.ok(c.isDown);
	});

	test('character：gain/contains/lose 幂等', () => {
		const c = new (R().Character)({ name: '乙' });
		assert.ok(!c.contains(R().death));
		c.gain(R().death); c.gain(R().death);
		assert.ok(c.contains(R().death));
		assert.eq(c.effects.length, 1, '不重复添加');
		c.lose(R().death);
		assert.ok(!c.contains(R().death));
	});

	test('character：contains 重载——按属性检索随身道具', () => {
		const c = new (R().Character)({ name: '丙', items: [{ id: 'club', equipped: true }] });
		assert.eq(c.contains(['weapon', 'equipped']).id, 'club');
		assert.eq(c.contains(['weapon', 'equipped', 'xxx']), null, '未命中返回 null');
	});

	test('character：use 拒绝非 Item 参数', () => {
		const c = new (R().Character)({ name: '丁' });
		assert.throws(() => c.use('不是道具', c));
	});
})();
