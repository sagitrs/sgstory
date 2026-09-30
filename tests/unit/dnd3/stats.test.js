/* dnd3/00-init 的单元测试：标准数值块 */
(() => {
	const D = () => setup.DND3;

	test('dnd3：stats 填满全部字段且可覆盖', () => {
		const s = D().stats({ ac: 15 });
		assert.eq(Object.keys(s).length, Object.keys(D().STAT_BLOCK).length, '字段数一致');
		assert.eq(s.ac, 15, '覆盖生效');
		assert.eq(s.str_mod, 0, '默认值生效');
	});
})();
