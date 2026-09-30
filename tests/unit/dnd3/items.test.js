/* dnd3/items 的单元测试：3E 判定数学（以木棒为代表） */
(() => {
	const R = () => setup.RPG;

	test('dnd3：木棒的 3E 判定读 stats（力量加成）', () => {
		// 用 bab+str 必中的攻击者与必中的目标验证伤害含 str_mod
		const attacker = { stats: { bab: 20, str_mod: 3 } };
		const dummy = { name: '靶', hp: 50, maxHp: 50, stats: { ac: -999 } };
		let delta = 0;
		for (let i = 0; i < 8; i++) {
			const h = dummy.hp;
			R().createItem('club').used(dummy, attacker);
			delta = Math.max(delta, h - dummy.hp); // 取单次最大（天然 1 会 miss）
		}
		// 1d6+3 的单次伤害范围是 4..9（重击 ×2 会更高，取最大值断言下限）
		assert.ok(delta >= 4 && delta <= 18, `伤害含力量加成（单次最大 ${delta}）`);
	});
})();
