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
})();
