/* core/40-battle 的单元测试：构造校验、战利品结算、isOut 钩子 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	test('battle：构造参数校验', () => {
		assert.throws(() => new (R().Battle)(0, [], []));
		assert.throws(() => new (R().Battle)(3, 'x', []));
	});

	test('battle：敌方预先全灭 → 立即结束并掉落', async () => {
		const victim = new (R().Character)({ name: '伤兵', hp: 0, items: [{ id: 'coin' }] });
		await new (R().Battle)(3, [D().Player], [victim]).execute();
		assert.ok(R().has('coin'), '战利品结算');
	});

	test('battle：isOut 钩子可覆写（规则包出局判定）', async () => {
		class PacifistBattle extends R().Battle {
			isOut() { return false; } // 永不出局 → 走满回合后僵持
		}
		const e = new (R().Character)({ name: '木桩人', hp: 1 });
		await new PacifistBattle(1, [D().Player], [e]).execute();
		assert.ok(!e.isDown, '钩子生效（无人出局）');
	});
})();
