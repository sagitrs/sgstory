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

	test('battle：AI 选目标经 RPG.rng（注入后确定）', async () => {
		// 调用面探针：每次读源计一次并记值。读数恒 0.999 ⇒ index(2)=1 选中「乙」；
		// 同一读数使 d20=20（必中）。**首次读数即决定选靶**（若选靶绕过 RPG.rng，
		// 本用例会随机打在甲／乙其一 ⇒ 约半数概率红）。
		const reads = [];
		R().rng.set(() => { reads.push(0.999); return 0.999; });
		try {
			const p1 = new (R().Character)({ name: '甲', hp: 50, maxHp: 50, stats: { ac: 10 } });
			const p2 = new (R().Character)({ name: '乙', hp: 50, maxHp: 50, stats: { ac: 10 } });
			const foe = new (R().Character)({
				name: '敌', hp: 999, maxHp: 999,
				stats: { bab: 5, str_mod: 0 }, items: [{ id: 'club', equipped: true }],
			});
			await new (R().Battle)(1, [p1, p2], [foe]).execute();
			assert.eq(p1.hp, 50, '甲未被选为目标（首读 0.999 ⇒ index 1）');
			assert.ok(p2.hp < 50, '乙被选为目标并受伤');
			assert.ok(reads.length >= 2, `选靶与攻击各至少读一次源（实读 ${reads.length} 次）`);
		} finally {
			R().rng.reset();
		}
	});
})();
