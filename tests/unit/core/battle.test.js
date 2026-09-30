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
		// 调用面探针：每次读源计一次并记值。读数恒 0.999 ⇒ 敌选靶 index(2)=1 选中「乙」；
		// 同一读数使 d20=20（必中）。读源序列恰为 **7** 次：
		//   index(1)（甲选靶）· index(1)（乙选靶）· **index(2)=1（敌选乙）**
		//   ・pick(d20)=20（命中）・pick(d20)=20（重击确认）・pick(d6)=6 ・pick(d6)=6（两枚伤害骰）
		// 断言精确次数：若 `index` 绕过注入（直调 Math.random），前三次读数不会发生
		// ⇒ 计数当场不足 7 ⇒ 确定红（而非「是否打到甲」的概率红）。
		const reads = [];
		R().rng.set(() => { reads.push(0.999); return 0.999; });
		try {
			const p1 = new (R().Character)({ name: '甲', hp: 50, maxHp: 50, stats: { ac: 10 } });
			const p2 = new (R().Character)({ name: '乙', hp: 50, maxHp: 50, stats: { ac: 10 } });
			const foe = new (R().Character)({
				name: '敌', hp: 999, maxHp: 999,
				stats: { bab: 5, str: 10 }, items: [{ id: 'club', equipped: true }],
			});
			await new (R().Battle)(1, [p1, p2], [foe]).execute();
			assert.eq(p1.hp, 50, '甲未被选为目标（敌选靶读 index(2)=1）');
			assert.ok(p2.hp < 50, '乙被选为目标并受伤');
			assert.eq(reads.length, 7, `读源恰 7 次（选靶 3 ＋ 攻击 4），实得 ${reads.length}`);
		} finally {
			R().rng.reset();
		}
	});
})();
