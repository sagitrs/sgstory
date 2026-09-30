/* core/05-dice 的单元测试 */
(() => {
	const R = () => setup.RPG;

	test('dice：2d4+1 解析与取值范围', () => {
		const d = R().rollDetail('2d4+1');
		assert.eq(d.count, 2, '骰数');
		assert.eq(d.rolls.length, 2, '明细长度');
		assert.ok(d.rolls.every((r) => r >= 1 && r <= 4), '单骰范围');
		assert.eq(d.total, d.rolls[0] + d.rolls[1] + 1, '总数=骰面+调整');
	});

	test('dice：纯数字为固定值', () => assert.eq(R().roll('3'), 3));

	test('dice：非法表达式抛错', () => assert.throws(() => R().roll('abc')));

	test('dice：formatMod 带符号', () => {
		assert.eq(R().formatMod(3), '+3');
		assert.eq(R().formatMod(-2), '-2');
		assert.eq(R().formatMod(0), '+0');
	});

	/* ── 随机源注入点（#1706）的四用例：契约见 docs/plan/1697-character-creation.md §决策五 ── */

	test('dice rng：注入序列后的骰面映射确定（U1）', () => {
		R().rng.setSequence([0.0, 0.5]);
		const d = R().rollDetail('2d6');
		assert.eq(d.rolls[0], 1, '第 1 枚：0.0 ⇒ 1');
		assert.eq(d.rolls[1], 4, '第 2 枚：0.5 ⇒ 4（1+floor(0.5*6)）');
		assert.eq(d.total, 5, '总分 1+4');
	});

	test('dice rng：默认源动态读取＋调用面计次（U2）', () => {
		const orig = Math.random;
		try {
			// ① 加载之后替换全局源 ⇒ 仍须生效（定义时冻结的实现必红）
			R().rng.reset();
			Math.random = () => 0.99;
			assert.eq(R().roll('1d20'), 20, '替换后 d20 = 20（0.99 ⇒ 20）');
			Math.random = () => 0.0;
			assert.eq(R().roll('1d20'), 1, 'reset 后再替换亦生效（0.0 ⇒ 1）');

			// ② 调用面计次：每次掷骰恰好向源取一次，不重复读、不缓存
			let calls = 0;
			Math.random = () => { calls++; return 0.5; };
			assert.eq(R().roll('1d20'), 11, '0.5 ⇒ 11');
			assert.eq(calls, 1, '单颗骰调用源 1 次');
			calls = 0;
			R().roll('2d6');
			assert.eq(calls, 2, '两颗骰调用源 2 次');

			// ③ 注入函数同样计次（证明 pick 不会额外多读）
			let n = 0;
			R().rng.set(() => { n++; return 0.5; });
			assert.eq(R().roll('1d20'), 11, '注入函数：0.5 ⇒ 11');
			assert.eq(n, 1, '注入函数恰好调用 1 次');
		} finally {
			Math.random = orig;
		}
	});

	test('dice rng：前置挂点清除注入（U3）', () => {
		R().rng.setSequence([0.0]);
		assert.eq(R().roll('1d20'), 1, '注入序列生效（0.0 ⇒ 1）');
		window.__resetState();   // harness 的用例前置挂点
		const orig = Math.random;
		Math.random = () => 0.99;
		try {
			assert.eq(R().roll('1d20'), 20, '挂点复位后回到默认源（注入不残留）');
		} finally {
			Math.random = orig;
		}
	});

	test('dice rng：序列耗尽即抛错，不静默回退（U4）', () => {
		// 耗尽 ⇒ 抛错（而不是落回真随机：这里把默认源设成 0.99 ⇒ 静默回退会得 20）
		const orig = Math.random;
		Math.random = () => 0.99;
		try {
			R().rng.setSequence([0.5]);
			assert.eq(R().roll('1d6'), 4, '0.5 ⇒ 4');
			assert.throws(() => R().roll('1d6'), '序列耗尽须抛错而非回退默认源');
			assert.throws(() => R().roll('1d6'), '耗尽后仍抛错（不重复末值）');
		} finally {
			Math.random = orig;
		}
		// 契约第 1／2 项：set 只收函数；setSequence 只收非空数组
		assert.throws(() => R().rng.set([0.1, 0.2]), 'set 拒绝非函数');
		assert.throws(() => R().rng.setSequence([]), 'setSequence 拒绝空数组');
	});
})();
