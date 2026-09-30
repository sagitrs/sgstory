/* dnd-5e 数值块与基础约定的单元测试 */
(() => {
	const D = () => setup.DND5E;

	test('5e：stats 填满全部字段且可覆盖', () => {
		const s = D().stats({ ac: 15 });
		assert.eq(Object.keys(s).length, Object.keys(D().STAT_BLOCK).length, '字段数一致');
		assert.eq(s.ac, 15, '覆盖生效');
		assert.eq(s.prof, 2, '默认熟练度 +2');
	});

	test('5e：全部角色数值块完全对称', () => {
		const names = ['Player', 'Goblin', 'GoblinBoss', 'Guard'];
		const first = Object.keys(D()[names[0]].stats).sort().join(',');
		for (const n of names.slice(1)) {
			assert.eq(Object.keys(D()[n].stats).sort().join(','), first, `${n} 不对称`);
		}
	});

	test('5e：哥布林数值对齐 SRD（AC 12, HP 7, STR -1, DEX +2）', () => {
		assert.eq(D().Goblin.stats.ac, 12);
		assert.eq(D().Goblin.maxHp, 7);
		assert.eq(D().Goblin.stats.str_mod, -1);
		assert.eq(D().Goblin.stats.dex_mod, 2);
	});

	test('5e：哥布林首领数值对齐 SRD（AC 17, HP 21）', () => {
		assert.eq(D().GoblinBoss.stats.ac, 17);
		assert.eq(D().GoblinBoss.maxHp, 21);
	});

	test('5e：优势/劣势掷骰', () => {
		const adv = D().d20adv();
		const dis = D().d20dis();
		assert.ok(adv >= 1 && adv <= 20, '优势范围正确');
		assert.ok(dis >= 1 && dis <= 20, '劣势范围正确');
	});
})();
