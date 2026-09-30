/* dnd3/core/chest 的单元测试：3E 撬锁检定（判定数学在规则包，不在 core） */
(() => {
	const D = () => setup.DND3;

	test('dnd3 chest：撬锁判定的灵巧调整值与 DC 边界（注入定骰）', () => {
		const R = () => setup.RPG;
		// 固定出目 d20 = 1（0.0）⇒ roll = 1 + 灵巧调整值，逐档验 DC 12（Chest 默认 lockDC）边界：
		//   dex 1 ⇒ −5 ⇒ 1−5 = −4 < 12 必败；dex 32 ⇒ +11 ⇒ 1+11 = 12 ≥ 12 恰过（3E 面不设原始分上限）
		for (const [dex, shouldOpen, why] of [[1, false, 'dex 1（−5）⇒ −4 < 12 必败'], [32, true, 'dex 32（+11）⇒ 12 ≥ 12 恰过']]) {
			R().rng.set(() => 0.0);
			try {
				D().Player.stats.dex = dex;
				const box = new (D().Chest)({ id: `b-lock-${dex}`, name: '匣' });
				box.used(D().Player, D().Player, 'lockpick');
				assert.eq(box.opened === true, shouldOpen, why);
			} finally {
				R().rng.reset();
			}
		}
		// 固定出目 d20 = 20（0.99）⇒ 低调整值也能过（19+1+… ≥ 12）
		R().rng.set(() => 0.99);
		try {
			D().Player.stats.dex = 1;
			const box = new (D().Chest)({ id: 'b-lock-max', name: '匣' });
			box.used(D().Player, D().Player, 'lockpick');
			assert.ok(box.opened, 'd20 = 20 ⇒ 20−5 = 15 ≥ 12 必成');
		} finally {
			R().rng.reset();
			D().Player.stats.dex = 12; // 还原给后续用例
		}
	});

	test('dnd3 chest：陷阱池取值经 RPG.rng（注入后确定）', () => {
		const R = () => setup.RPG;
		// 调用面探针：每次取值读源一次；读数映射到具体池项
		let calls = 0;
		R().rng.set(() => { calls++; return 0.0; }); // index(3) ⇒ 0
		try {
			assert.eq(D().rollChestTrap().id, 'trap-needle', '0.0 ⇒ 池首');
			assert.eq(calls, 1, '一次取值恰读源 1 次');
		} finally {
			R().rng.reset();
		}
		calls = 0;
		R().rng.set(() => { calls++; return 0.999; }); // index(3) ⇒ 2
		try {
			assert.eq(D().rollChestTrap().id, 'trap-shock', '0.999 ⇒ 池末');
			assert.eq(calls, 1, '一次取值恰读源 1 次');
		} finally {
			R().rng.reset();
		}
		// 越过池尾的越域保护：index 只接受正整数
		assert.throws(() => R().rng.index(0), 'index(0) 抛错');
	});
})();
