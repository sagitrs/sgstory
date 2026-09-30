/* dnd-5e 车卡族（#1697 P1）：六维原始分、换算、写面越域、属性生成 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND5E;

	const withSeq = (seq, fn) => {
		R().rng.setSequence(seq);
		try { fn(); } finally { R().rng.reset(); }
	};

	test('dnd-5e chargen：换算表逐格（U5）', () => {
		const want = { 1: -5, 8: -1, 9: -1, 10: 0, 11: 0, 12: 1, 13: 1, 14: 2, 15: 2, 20: 5 };
		for (const [score, mod] of Object.entries(want)) {
			assert.eq(D().abilityMod(Number(score)), mod, `原始分 ${score} ⇒ ${mod}`);
		}
		// 声明版表端点：20–21 ⇒ +5（本实现为闭式 floor((分−10)/2)）
		assert.eq(D().abilityMod(21), 5, '21 ⇒ +5（表值同为 +5）');
		// 未设该维 ⇒ 按缺省 10 计 ⇒ +0（旧 `?? 0` 的中性语义）
		assert.eq(D().abilityMod(undefined), 0, '缺参按缺省 10');
	});

	test('dnd-5e chargen：写入后按原始分取调整值（U6）', () => {
		const c = { stats: D().stats() };
		D().setScore(c, 'str', 16);
		assert.eq(c.stats.str, 16, '原始分已写入');
		assert.eq(D().modOf(c.stats, 'str'), 3, '消费点读到 +3');
		assert.eq(D().modOf(c.stats, 'str'), D().abilityMod(c.stats.str), '与换算一致');
		// 未设该维的消费点读到 +0（不抛错）
		assert.eq(D().modOf(c.stats, 'cha'), 0, '未定制的维度 ⇒ +0');
	});

	test('dnd-5e chargen：越域写入抛错且数值未被改动（U7）', () => {
		const c = { stats: D().stats() };
		assert.throws(() => D().setScore(c, 'str', 0), '低于 1 抛错');
		assert.throws(() => D().setScore(c, 'str', 21), '越 20 抛错');
		assert.throws(() => D().setScore(c, 'str', 12.5), '非整数抛错');
		assert.eq(c.stats.str, 10, '抛错后数值未被改动');
	});

	test('dnd-5e chargen：静态声明路径不受上限限制（U17）', () => {
		const s = D().stats({ str: 30 });   // 怪物等静态声明可越 20（决策七）
		assert.eq(s.str, 30, '静态声明 30 不抛错');
		assert.eq(D().modOf(s, 'str'), 10, '换算给出 +10');
	});

	test('dnd-5e chargen：数值块键集精确相等且不含调整值字段（U9）', () => {
		const keys = Object.keys(D().stats()).sort();
		const wants = ['ac', 'cha', 'con', 'cr', 'dex', 'int', 'prof', 'str', 'wis'].sort();
		assert.eq(keys.join(','), wants.join(','), '键集与 §6.5 变更后逐项相等');
		assert.ok(!keys.some((k) => k.endsWith('_mod')), '不含任何以 _mod 结尾的键');
	});

	test('dnd-5e chargen：默认值即中性值（U16）', () => {
		const s = D().stats();
		for (const ab of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
			assert.eq(s[ab], 10, `${ab} 默认 10`);
			assert.eq(D().modOf(s, ab), 0, `${ab} 调整值 +0`);
		}
	});

	test('dnd-5e chargen：静态角色携带 SRD 原始分（U11）', () => {
		assert.eq(D().Goblin.stats.str, 8, 'SRD 5.2.1 · monsters-A-Z.md:7279（Goblin Minion）STR 8');
		assert.eq(D().Goblin.stats.dex, 15, 'SRD 5.2.1 · monsters-A-Z.md:7283（Goblin Minion）DEX 15');
		assert.eq(D().GoblinBoss.stats.str, 10, 'SRD 5.2.1 · monsters-A-Z.md:7431（Goblin Boss）STR 10');
		assert.eq(D().GoblinBoss.stats.dex, 15, 'SRD 5.2.1 · monsters-A-Z.md:7435（Goblin Boss）DEX 15');
	});

	test('dnd-5e chargen：弃最低的确定性（U12）', () => {
		// 注入四枚骰面 1、2、3、4（unit 值 =(面−1)/6）⇒ 弃 1 ⇒ 2+3+4 = 9
		withSeq([0, 1 / 6, 2 / 6, 3 / 6], () => {
			assert.eq(R().rollKeepHighest('4d6', 3).total, 9, '弃最低 ⇒ 9（弃最高 ⇒ 6，未排序取前三 ⇒ 6）');
		});
	});

	test('dnd-5e chargen：弃最低的边界（U13）', () => {
		// 全 1 ⇒ 3；全 6 ⇒ 18
		withSeq([0, 0, 0, 0], () => assert.eq(R().rollKeepHighest('4d6', 3).total, 3, '下限 3'));
		withSeq([0.99, 0.99, 0.99, 0.99], () => assert.eq(R().rollKeepHighest('4d6', 3).total, 18, '上限 18'));
	});

	test('dnd-5e chargen：生成法产出六个值（U14）', () => {
		withSeq(Array.from({ length: 24 }, (_, i) => (i % 6) / 6), () => {
			const scores = D().rollAbilityScores();
			assert.eq(scores.length, 6, '六个值');
			assert.ok(scores.every((s) => s >= 3 && s <= 18), '各值落在 3–18');
		});
	});

	test('dnd-5e chargen：取高枚数越域抛错（U15）', () => {
		assert.throws(() => R().rollKeepHighest('4d6', 5), 'keep 超出骰数');
		assert.throws(() => R().rollKeepHighest('4d6', 0), 'keep 低于 1');
	});
})();
