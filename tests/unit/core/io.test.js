/* core/01-perform 与 core/02-choice 的单元测试（IO 接口契约） */
(() => {
	test('io：perform/choice 挂在 Object.prototype 且不可枚举', () => {
		assert.eq(typeof Object.prototype.perform, 'function');
		assert.eq(typeof Object.prototype.choice, 'function');
		assert.eq(Object.prototype.choice.length, 1, 'choice 接收 1 个参数');
		assert.ok(!Object.getOwnPropertyDescriptor(Object.prototype, 'perform').enumerable);
	});

	test('io：perform 拒绝非字符串', () => assert.throws(() => ({}).perform(123)));

	test('io：choice 拒绝空选项（异步）', () => assert.rejects(({}).choice([])));

	test('io：choice 拒绝不合规选项（异步）', () =>
		assert.rejects(({}).choice([{ text: 'a', value: 1 }])));
})();
