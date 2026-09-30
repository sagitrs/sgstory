/* d20m 车卡族（#1697 P1）：六维原始分、换算、写面越域、属性生成
 * 断言锚：**#1744 §2.9**（写面与上限）／**§2.10**（生成法＝house rule 面）—— docs/plan/1744-d20m-combat.md §四
 * （与 dnd3／dnd-5e 同构；差异面：本包 `ABILITY_MAX === null` —— MSRD 不设通用上限）
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.D20M;

	const withSeq = (seq, fn) => {
		R().rng.setSequence(seq);
		try { fn(); } finally { R().rng.reset(); }
	};

	/* 出处：SRD d20M · source/1Modern现代/3msrdabilityscores属性值.md:24（公式「(ability/2) -5 [round result down]」） */
	test('d20m chargen：换算表逐格对齐 SRD d20M（原始分 15 ⇒ +2, 8 ⇒ −1）', () => {
		const want = { 1: -5, 8: -1, 9: -1, 10: 0, 11: 0, 12: 1, 13: 1, 14: 2, 15: 2, 20: 5 };
		for (const [score, mod] of Object.entries(want)) {
			assert.eq(D().abilityMod(Number(score)), mod, `原始分 ${score} ⇒ ${mod}`);
		}
		// 源式与闭式的等价端点：奇偶各取一（(s/2)−5 向下取整 ≡ floor((s−10)/2)）
		assert.eq(D().abilityMod(21), 5, '21 ⇒ +5');
		assert.eq(D().abilityMod(undefined), 0, '缺参按缺省 10');
	});

	/* 锚：#1744 §2.9a（唯一写面 ＋ 调整值现算） */
	test('d20m chargen：写入后按原始分取调整值', () => {
		const c = { stats: D().stats() };
		D().setScore(c, 'str', 16);
		assert.eq(c.stats.str, 16, '原始分已写入');
		assert.eq(D().modOf(c.stats, 'str'), 3, '消费点读到 +3');
		assert.eq(D().modOf(c.stats, 'str'), D().abilityMod(c.stats.str), '与换算一致');
		assert.eq(D().modOf(c.stats, 'cha'), 0, '未定制的维度 ⇒ +0');
	});

	/* 锚：#1744 §2.9b（无上限）／§2.9c（越域抛错） */
	test('d20m chargen：写面无上界、下界与非整数仍抛错（越域不静默夹取）', () => {
		const c = { stats: D().stats() };
		assert.eq(D().ABILITY_MAX, null, '本包不设通用上限（ABILITY_MAX === null）');
		assert.eq(D().setScore(c, 'str', 30), 10, '越 20 不抛错（源不设上限）⇒ 换算 +10');
		assert.throws(() => D().setScore(c, 'con', 0), '低于 1 抛错');
		assert.throws(() => D().setScore(c, 'con', 12.5), '非整数抛错');
		assert.eq(c.stats.con, 10, '抛错后数值未被改动');
	});

	test('d20m chargen：默认值即中性值', () => {
		const s = D().stats();
		for (const ab of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
			assert.eq(s[ab], 10, `${ab} 默认 10`);
			assert.eq(D().modOf(s, ab), 0, `${ab} 调整值 +0`);
		}
	});

	/* ★本格断言的是**本仓登记的 house rule**（MSRD 读面未载生成法 ⇒ 借用同法并显式登记），
	 *   ✗ 断言「对齐源文」——见 src/dnd/d20m/core/chargen.js 的登记注释。 */
	test('d20m chargen：弃最低的确定性与边界（house rule 面：4d6 弃最低）', () => {
		// 四枚骰面 1、2、3、4（unit 值 =(面−1)/6）⇒ 弃 1 ⇒ 2+3+4 = 9
		withSeq([0, 1 / 6, 2 / 6, 3 / 6], () => {
			assert.eq(R().rollKeepHighest('4d6', 3).total, 9, '弃最低 ⇒ 9');
		});
		withSeq([0, 0, 0, 0], () => assert.eq(R().rollKeepHighest('4d6', 3).total, 3, '下限 3'));
		withSeq([0.99, 0.99, 0.99, 0.99], () => assert.eq(R().rollKeepHighest('4d6', 3).total, 18, '上限 18'));
	});

	test('d20m chargen：生成法产出六个落在 3–18 的值', () => {
		withSeq(Array.from({ length: 24 }, (_, i) => (i % 6) / 6), () => {
			const scores = D().rollAbilityScores();
			assert.eq(scores.length, 6, '六个值');
			assert.ok(scores.every((s) => s >= 3 && s <= 18), '各值落在 3–18');
		});
	});
})();
