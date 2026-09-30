/* dnd3 车卡族（#1697 P1）：六维原始分、换算、写面无上限、属性生成 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	const withSeq = (seq, fn) => {
		R().rng.setSequence(seq);
		try { fn(); } finally { R().rng.reset(); }
	};

	test('dnd3 chargen：换算表逐格（U5）', () => {
		const want = { 1: -5, 8: -1, 9: -1, 10: 0, 11: 0, 12: 1, 13: 1, 14: 2, 16: 3, 20: 5 };
		for (const [score, mod] of Object.entries(want)) {
			assert.eq(D().abilityMod(Number(score)), mod, `原始分 ${score} ⇒ ${mod}`);
		}
		assert.eq(D().abilityMod(undefined), 0, '缺参按缺省 10 ⇒ +0');
	});

	test('dnd3 chargen：写入后按原始分取调整值（U6）', () => {
		const c = { stats: D().stats() };
		D().setScore(c, 'str', 16);
		assert.eq(c.stats.str, 16, '原始分已写入');
		assert.eq(D().modOf(c.stats, 'str'), 3, '消费点读到 +3');
		assert.eq(D().modOf(c.stats, 'cha'), 0, '未定制的维度 ⇒ +0');
	});

	test('dnd3 chargen：越域写入抛错且数值未被改动（U7）', () => {
		const c = { stats: D().stats() };
		assert.throws(() => D().setScore(c, 'str', 0), '低于 1 抛错');
		assert.throws(() => D().setScore(c, 'str', 12.5), '非整数抛错');
		assert.eq(c.stats.str, 10, '抛错后数值未被改动');
	});

	test('dnd3 chargen：3E 面不设通用属性上限（U8）', () => {
		assert.eq(D().ABILITY_MAX, null, '上限参数为 null（不设上界）');
		const c = { stats: D().stats() };
		D().setScore(c, 'str', 21);        // 5E 面会抛错，3E 面不抛
		assert.eq(c.stats.str, 21, '写入 21');
		assert.eq(D().modOf(c.stats, 'str'), 5, '换算给出 +5');
		D().setScore(c, 'str', 40);
		assert.eq(D().modOf(c.stats, 'str'), 15, '40 ⇒ +15（无上界）');
	});

	test('dnd3 chargen：数值块键集精确相等且不含调整值字段（U9）', () => {
		const keys = Object.keys(D().stats()).sort();
		const wants = ['ac', 'bab', 'cha', 'con', 'cr', 'dex', 'heal_bonus', 'int', 'str', 'wis'].sort();
		assert.eq(keys.join(','), wants.join(','), '键集与 §6.5 变更后逐项相等');
		assert.ok(!keys.some((k) => k.endsWith('_mod')), '不含任何以 _mod 结尾的键');
	});

	test('dnd3 chargen：默认值即中性值（U16）', () => {
		const s = D().stats();
		for (const ab of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
			assert.eq(s[ab], 10, `${ab} 默认 10`);
			assert.eq(D().modOf(s, ab), 0, `${ab} 调整值 +0`);
		}
	});

	test('dnd3 chargen：静态角色携带原始分（U11）', () => {
		// 3E 哥布林：与源条目相符的四维（SRD 3.5 · Monsters.md:11840）；Str/Dex 为 house rule（#1719）
		assert.eq(D().Goblin.stats.con, 12, 'SRD 3.5 · Goblin：CON 12');
		assert.eq(D().Goblin.stats.int, 10, 'SRD 3.5 · Goblin：INT 10');
		assert.eq(D().Goblin.stats.wis, 9, 'SRD 3.5 · Goblin：WIS 9');
		assert.eq(D().Goblin.stats.cha, 6, 'SRD 3.5 · Goblin：CHA 6');
	});

	test('dnd3 chargen：弃最低与生成法（U12/U14）', () => {
		withSeq([0, 1 / 6, 2 / 6, 3 / 6], () => {
			assert.eq(R().rollKeepHighest('4d6', 3).total, 9, '弃最低 ⇒ 9');
		});
		withSeq(Array.from({ length: 24 }, (_, i) => (i % 6) / 6), () => {
			const scores = D().rollAbilityScores();
			assert.eq(scores.length, 6, '六个值');
			assert.ok(scores.every((s) => s >= 3 && s <= 18), '各值落在 3–18');
		});
	});
})();
