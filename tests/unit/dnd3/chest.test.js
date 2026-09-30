/* dnd3/core/chest 的单元测试：3E 撬锁检定（判定数学在规则包，不在 core） */
(() => {
	const D = () => setup.DND3;

	test('dnd3 chest：撬锁判定 ±dex 强制成败', () => {
		D().Player.stats.dex_mod = 20;
		const a = new (D().Chest)({ id: 'b3', name: '甲匣' });
		a.used(D().Player, D().Player, 'lockpick');
		assert.ok(a.opened, '必成');
		D().Player.stats.dex_mod = -20;
		const b = new (D().Chest)({ id: 'b4', name: '乙匣' });
		b.used(D().Player, D().Player, 'lockpick');
		assert.ok(b.locked, '必败');
		D().Player.stats.dex_mod = 1;
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
