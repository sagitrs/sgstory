/* d20m/core/combat 的单元测试：acOf（装备加成）、攻击数学、天然 1/20 面、伤害下限
 *
 * ★本文件的「待核」两格断言的是**本笔登记的 house rule 面**（见 `src/dnd/d20m/core/combat.js`
 *   的登记注释），✗ 断言「对齐源文」——战斗节（`27msrdcombat战斗.md`）pin 后须回来改判。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.D20M;

	test('d20m combat：acOf ＝ 基础 ac ＋ 已装备道具的 ac_bonus', () => {
		R().defItem({ id: 'unit-d20m-vest', name: '试样护具', stats: { ac_bonus: 3 }, used() {} });
		const c = new (R().Character)({ name: '靶甲', hp: 10, stats: { ac: 10 } });
		assert.eq(D().acOf(c), 10, '裸装');
		c.items.push({ id: 'unit-d20m-vest', equipped: true }); // +3
		c.items.push({ id: 'prosthetic-arm' });                 // 未装备、且源文无加值 ⇒ 不计
		assert.eq(D().acOf(c), 13, '护具 +3 生效；未装备的义体不计');
	});

	test('d20m combat：火器命中与伤害确定化（固定 RNG = 0.5 ⇒ d20 掷 11、2d6 各掷 4）', () => {
		R().rng.set(() => 0.5);
		try {
			const attacker = { stats: D().stats({ bab: 0, dex: 12 }) }; // 灵巧 +1 ⇒ atkMod 1
			const target = { name: '靶', hp: 50, maxHp: 50, stats: { ac: 12 } };
			new (D().Beretta92F)().used(target, attacker);
			// 11 + 1 = 12 ≥ 12 ⇒ 命中；伤害 = (4+4) + 1 = 9 ⇒ 50 − 9 = 41
			assert.eq(target.hp, 41, '命中且伤害 9（含本笔 house rule 面的灵巧加成）');
		} finally {
			R().rng.reset();
		}
	});

	test('d20m combat：防御生效——同攻击者对高防御目标不命中（固定 RNG）', () => {
		R().rng.set(() => 0.5); // d20 恒 11
		try {
			const attacker = { stats: D().stats({ bab: 0, dex: 12 }) }; // atkMod 1 ⇒ 12
			const soft = { name: '软靶', hp: 50, maxHp: 50, stats: { ac: 12 } };
			const hard = { name: '硬靶', hp: 50, maxHp: 50, stats: { ac: 13 } };
			new (D().Beretta92F)().used(soft, attacker);
			new (D().Beretta92F)().used(hard, attacker);
			assert.ok(soft.hp < 50, 'AC 12：12 ≥ 12 ⇒ 命中');
			assert.eq(hard.hp, 50, 'AC 13：12 < 13 ⇒ 不命中');
		} finally {
			R().rng.reset();
		}
	});

	/* 出处：SRD d20M · source/1Modern现代/2msrdbasics基本.md:43（总则：天然 20 ✗ 自动成功、天然 1 ✗ 自动失败） */
	test('d20m combat：天然 1 仍判失手（本笔 house rule 面 · 见票面待核）', () => {
		R().rng.set(() => 0); // d20 恒 1
		try {
			const attacker = { stats: D().stats({ bab: 99, dex: 12 }) }; // 加值极高 ⇒ 若按总则应命中
			const target = { name: '靶', hp: 50, maxHp: 50, stats: { ac: 12 } };
			new (D().Beretta92F)().used(target, attacker);
			assert.eq(target.hp, 50, '本笔按 dnd3 同形：天然 1 必失（源文总则另有说法 ⇒ 待核）');
		} finally {
			R().rng.reset();
		}
	});

	test('d20m combat：伤害下限 1（惩罚压到 0 以下时）', () => {
		// 序列：d20 = 11（命中）；两枚 d6 = 1、1 ⇒ 2 − 5 = −3 ⇒ 取下限 1
		// （火器用**灵巧**：DEX 1 ⇒ −5；bab 12 ⇒ atkMod 7 ⇒ 11+7 = 18 ≥ 12 命中）
		R().rng.setSequence([0.5, 0, 0]);
		try {
			const attacker = { stats: D().stats({ bab: 12, dex: 1 }) };
			const target = { name: '靶', hp: 50, maxHp: 50, stats: { ac: 12 } };
			new (D().Beretta92F)().used(target, attacker);
			assert.eq(target.hp, 49, '伤害 1（下限生效）');
		} finally {
			R().rng.reset();
		}
	});

	test('d20m combat：HP 归零对 Character 挂死亡减益', () => {
		R().rng.set(() => 0.5);
		try {
			const attacker = { stats: D().stats({ bab: 0, dex: 12 }) };
			const target = new (R().Character)({ name: '靶', hp: 1, stats: { ac: 12 } });
			new (D().Beretta92F)().used(target, attacker);
			assert.eq(target.hp, 0, 'HP 归零');
			assert.ok(target.contains(R().death), '死亡减益已挂');
		} finally {
			R().rng.reset();
		}
	});
})();
