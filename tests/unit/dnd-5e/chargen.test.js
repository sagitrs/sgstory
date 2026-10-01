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
		/* ★本列是 **STAT_BLOCK 字段台账**：凡新增/删除字段，**同笔**在此登记（✗ 静默改块）。
		 *  `firearmAmmo` 系本仓首个第 5 档「消耗依赖」存量字段（`#1777` D3／`#1731`），
		 *  定义见 `docs/plan/1689-5e-conditions.md` §十.1/§十.2（house rule，非 SRD）。 */
		const wants = ['ac', 'cha', 'con', 'cr', 'dex', 'firearmAmmo', 'int', 'prof', 'str', 'wis'].sort();
		assert.eq(keys.join(','), wants.join(','), '键集与 §6.5 变更后逐项相等');
		assert.ok(!keys.some((k) => k.endsWith('_mod')), '不含任何以 _mod 结尾的键');
	});

	test('dnd-5e chargen：第五档存量字段（#1759 §十）已声明且经 STAT_BLOCK 覆盖全部角色（U18）', () => {
		/* ★本格补 `#1777` D1 的 B 裁定之**机械面**：存量字段须进 STAT_BLOCK ⇒ **统一覆盖 NPC**。
		 *  字段集本身由 **U9** 作台账（✗ 此处再列一份：两份台账会各自漂移）；
		 *  本格只核**覆盖面**：声明的每一条存量，须出现在 `stats()` **与每个静态 NPC** 的 stats 里。 */
		const mine = [...setup.RPG.stocks.entries()].filter(([, d]) => d.pack === 'dnd-5e').map(([id]) => id);
		assert.ok(mine.length > 0, '本包至少声明了一条存量（否则本格是空转）');
		const keys = Object.keys(D().stats());
		for (const id of mine) {
			assert.ok(keys.includes(id), `STAT_BLOCK 声明了「${id}」`);
			/* ★B 裁定：经 STAT_BLOCK ⇒ **统一覆盖** —— 静态声明的 NPC 也须带上该字段 */
			for (const n of ['Player', 'Goblin', 'GoblinBoss', 'Guard']) {
				const s = D()[n].stats;
				assert.ok(s != null, `${n} 有 stats`);
				assert.ok(id in s, `★${n} 也被覆盖（B 裁定：✗ 一处走一处不走）`);
			}
		}
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
