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
		/* ★`#1892` NIT（`dev-9` D RC）：**本格须真有判别力**。
		 *   原形 `hp: 1` ⇒ 木桩**永不倒**（`isDown = hp <= 0 || isKnockedOut` 两条都不成立）⇒
		 *   「撤掉 `isOut` 覆盖」也**不会红** ⇒ 断言是**空的**（零判别力，属本仓「判决死区」族）。
		 *   ⇒ 木桩改 `hp: 0`（**本应出局**的角色）＋ 断言改读 **`Battle→isOut`**（规则包的判定面）：
		 *     · 覆盖在场 ⇒ `isOut` 恒假 ⇒ 1 回合打满、断言过 ✓
		 *     · **撤掉覆盖** ⇒ `isOut(木桩)=真` ⇒ 断言**当场红** ✓（判别力实测见 PR 面）
		 *   ⚠ ✗ 断 `!e.isDown`：`isDown` 是**角色自身状态**（hp≤0 即真），与本覆盖**无关** ⇒ 断它等于断常量。 */
		const e = new (R().Character)({ name: '木桩人', hp: 0 });
		const pacifist = new (R().Character)({ name: '不打人的人', hp: 10, maxHp: 10, stats: {}, effects: [] });
		const b = new PacifistBattle(1, [pacifist], [e]);
		await b.execute();
		assert.ok(!b.isOut(e), '钩子生效（规则包判定：无人出局）');
		assert.ok(e.isDown, '对照面：该角色**自身**本应出局（hp≤0）⇒ 上面的「不出局」确由**覆盖**造成，✗ 因它本来就站着');	});

	test('battle：AI 选目标经 RPG.rng（注入后确定）', async () => {
		// 调用面探针：每次读源计一次并记值。读数恒 0.999 ⇒ 敌选靶 index(2)=1 选中「乙」；
		// 同一读数使 d20=20（必中）。读源序列 **5** 次（★`#1773` 前为 7，见下）：
		//   **index(2)=1（敌选乙）** ・pick(d20)=20（命中）・pick(d20)=20（重击确认）
		//   ・pick(d6)=6 ・pick(d6)=6（两枚伤害骰）
		// ★`#1773` 变更：甲、乙**无武器** ⇒ 二者皆 `rejected/no-weapon` ⇒ 按裁定「拒绝不推进」，
		//   他们**不再选靶**（选靶的 `RPG.rng` 读数随之为 0）⇒ 原 7 次中的 2 次（两名玩家的选靶）消失。
		// 断言精确次数：若 `index` 绕过注入（直调 Math.random），敌那次读数不会发生
		// ⇒ 计数当场不足 ⇒ 确定红（而非「是否打到甲」的概率红）。
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
			assert.eq(reads.length, 5, `读源恰 5 次（★#1773 后：敌选靶 1 ＋ 攻击 4；甲/乙无武器被拒 ⇒ 不选靶），实得 ${reads.length}`);
		} finally {
			R().rng.reset();
		}
	});
})();
