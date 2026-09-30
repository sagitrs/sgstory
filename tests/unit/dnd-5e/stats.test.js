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

	/* 出处：SRD 5.2.1 · monsters-A-Z.md:7256-7287（「Goblin Minion」）；WIS/CHA 见同文 :7297/7301；命名映射见 README「规则来源」§三.4 */
	test('5e：哥布林数值对齐 SRD 5.2.1 · Goblin Minion（AC 12, HP 7，六维原始分见下）', () => {
		assert.eq(D().Goblin.stats.ac, 12);
		assert.eq(D().Goblin.maxHp, 7);
		assert.eq(D().Goblin.stats.str, 8, '原始分 STR 8（⇒ −1）');
		assert.eq(D().Goblin.stats.dex, 15, '原始分 DEX 15（⇒ +2）');
		assert.eq(D().Goblin.stats.wis, 8, '原始分 WIS 8（⇒ −1）');
		assert.eq(D().Goblin.stats.cha, 8, '原始分 CHA 8（⇒ −1）');
	});

	/* 出处：SRD 5.2.1 · monsters-A-Z.md:7408-7409（「Goblin Boss」）；WIS 见同文 :7449 */
	test('5e：哥布林首领数值对齐 SRD 5.2.1 · Goblin Boss（AC 17, HP 21）', () => {
		assert.eq(D().GoblinBoss.stats.ac, 17);
		assert.eq(D().GoblinBoss.maxHp, 21);
		assert.eq(D().GoblinBoss.stats.wis, 8, '原始分 WIS 8（⇒ −1）');
	});

	/* 出处：SRD 5.2.1 · monsters-A-Z.md:8753（「Guard」）——该条目的属性为 STR 13／DEX 12／CON 12（其余三项 +0）；
	 * HP/AC 为 house rule（非 SRD）（「受伤入场」变体），不在此断言对齐。 */
	test('5e：受伤的守卫属性对齐 SRD 5.2.1 · Guard（原始分见下）', () => {
		assert.eq(D().Guard.stats.str, 13);
		assert.eq(D().Guard.stats.dex, 12, 'DEX 12（⇒ +1）');
		assert.eq(D().Guard.stats.con, 12, 'CON 12（⇒ +1）');
	});

	test('5e：优势/劣势掷骰', () => {
		const adv = D().d20adv();
		const dis = D().d20dis();
		assert.ok(adv >= 1 && adv <= 20, '优势范围正确');
		assert.ok(dis >= 1 && dis <= 20, '劣势范围正确');
	});
})();
