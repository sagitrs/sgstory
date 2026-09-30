/* dnd3/items 的单元测试：3E 判定数学（以木棒为代表） */
(() => {
	const R = () => setup.RPG;

	test('dnd3：木棒的 3E 判定读 stats（注入定骰，验力量加成入伤害）', () => {
		// 注入定骰：d20 = 11（0.5，必中且非重击）、1d6 = 4（0.5）
		// ⇒ 单次伤害应为 4 + 力量调整值（STR 16 ⇒ +3）= 7，且**恰为 7**：
		//   若实现忽略力量（如读已不存在的 str_mod ⇒ +0），伤害会是 4 ⇒ 本断言必红
		const R = setup.RPG;
		R.rng.set(() => 0.5);
		try {
			const attacker = { stats: { bab: 20, str: 16 } };
			const dummy = { name: '靶', hp: 50, maxHp: 50, stats: { ac: -999 } };
			R.createItem('club').used(dummy, attacker);
			assert.eq(50 - dummy.hp, 7, '单次伤害 = 1d6(4) + 力量 +3 = 7');
		} finally {
			R.rng.reset();
		}
	});
})();
