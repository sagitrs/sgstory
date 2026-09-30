/* core/05-dice 的单元测试 */
(() => {
	const R = () => setup.RPG;

	test('dice：2d4+1 解析与取值范围', () => {
		const d = R().rollDetail('2d4+1');
		assert.eq(d.count, 2, '骰数');
		assert.eq(d.rolls.length, 2, '明细长度');
		assert.ok(d.rolls.every((r) => r >= 1 && r <= 4), '单骰范围');
		assert.eq(d.total, d.rolls[0] + d.rolls[1] + 1, '总数=骰面+调整');
	});

	test('dice：纯数字为固定值', () => assert.eq(R().roll('3'), 3));

	test('dice：非法表达式抛错', () => assert.throws(() => R().roll('abc')));

	test('dice：formatMod 带符号', () => {
		assert.eq(R().formatMod(3), '+3');
		assert.eq(R().formatMod(-2), '-2');
		assert.eq(R().formatMod(0), '+0');
	});
})();
