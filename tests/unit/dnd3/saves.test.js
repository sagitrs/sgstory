/* dnd3/core/saves 的单元测试：豁免检定、恐惧效果（回应检视 M2/M3 突变） */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	test('dnd3 saves：save 返回四元组结构', () => {
		const c = { stats: { save_spells: 2 } };
		const r = D().save(c, 'spells', 12);
		assert.ok('success' in r && 'roll' in r && 'total' in r && 'dc' in r, '有 success/roll/total/dc');
		assert.eq(r.mod, 2, '调整值正确');
		assert.eq(r.total, r.roll + 2, 'total = roll + mod');
	});

	test('dnd3 saves：save 的成败判定（受控掷骰）', () => {
		// 注入固定 RNG：掷出 10
		const origRandom = Math.random;
		Math.random = () => 0.5; // (0.5*20)+1 = 11（向下取整 10 + 1 = 11）
		try {
			const c = { stats: { save_spells: 2 } };
			const r1 = D().save(c, 'spells', 12);
			assert.ok(r1.success, `掷 11+2=13 >= DC 12 → 成功`);
			const r2 = D().save(c, 'spells', 14);
			assert.ok(!r2.success, `掷 11+2=13 < DC 14 → 失败`);
			// 边界：恰好等于 DC
			const r3 = D().save(c, 'spells', 13);
			assert.ok(r3.success, `掷 11+2=13 == DC 13 → 成功（>=）`);
			// 无调整值
			const c0 = { stats: {} };
			const r4 = D().save(c0, 'spells', 11);
			assert.ok(r4.success, `掷 11+0=11 == DC 11 → 成功`);
		} finally {
			Math.random = origRandom;
		}
	});

	test('dnd3 saves：fearCheck 失败后施加 fear 减益', () => {
		// 注入必败 RNG
		const origRandom = Math.random;
		Math.random = () => 0.0; // 掷 1
		try {
			const c = new (R().Character)({ name: '懦夫' });
			assert.ok(!c.contains(R().fear), '初始未恐惧');
			const ok = D().fearCheck(c, 20); // DC 20 → 必败
			assert.ok(!ok, '豁免失败');
			assert.ok(c.contains(R().fear), '获得 fear 减益');
			assert.eq(c.effects.filter(e => e === 'fear').length, 1, '只施加一次');
		} finally {
			Math.random = origRandom;
		}
	});

	test('dnd3 saves：fearCheck 已恐惧时幂等（不重复施加）', () => {
		const c = new (R().Character)({ name: '已恐惧者' });
		c.gain(R().fear); // 预先施加
		assert.ok(c.contains(R().fear), '已恐惧');
		// fearCheck 对已恐惧者直接返回 true（不再掷骰）
		const ok = D().fearCheck(c, 1);
		assert.ok(ok, '已恐惧时返回 true');
		assert.eq(c.effects.filter(e => e === 'fear').length, 1, '不重复 gain');
	});

	test('dnd3 saves：fearCheck 成功时不施加减益', () => {
		const origRandom = Math.random;
		Math.random = () => 0.99; // 掷 20
		try {
			const c = new (R().Character)({ name: '勇士' });
			const ok = D().fearCheck(c, 1); // DC 1 → 必成功
			assert.ok(ok, '豁免成功');
			assert.ok(!c.contains(R().fear), '未获得 fear');
		} finally {
			Math.random = origRandom;
		}
	});
})();
