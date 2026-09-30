/* d20m/core/combat 的单元测试：acOf（装备加成）、攻击数学、天然 1/20、伤害修正、伤害下限
 *
 * ★本文件的判定条款**逐条对源**（战斗节 `27msrdcombat战斗.md` 已入 pin 表）——
 *   尤其「**远程不加伤害调整值**（`:77`）」与「**天然 1/20 自动成败**（`:21`）」两处是
 *   本包与 dnd3 形态**故意不同**的地方，各有一条**判别性**用例钉住（✗ 靠注释自陈）。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.D20M;

	/* 用例内夹具：近战件（本包自证件里没有近战武器 —— 只为钉住「近战加力量」这一支；
	 * 用唯一 id，照 tests/README「用例内临时道具请用唯一 id」）。骰面与火器**相同**（2d6），
	 * 使「近战 vs 远程」成为**同掷面下的唯一变量对照**。 */
	R().defItem({
		id: 'unit-d20m-blade', name: '试样短刃', weapon: true, slot: 'weapon',
		stats: { dmg: '2d6', type: 'slashing' },
		actions: { equip: R().slotEquip, unequip: R().slotUnequip },
		used(that, from) { setup.D20M.attack(this, that, from); },
	});

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
			// 11 + 1 = 12 ≥ 12 ⇒ 命中；伤害 = (4+4) + **0**（远程不加调整值，`:77`）⇒ 50 − 8 = 42
			assert.eq(target.hp, 42, '命中且伤害 8（远程不加调整值）');
		} finally {
			R().rng.reset();
		}
	});

	/* ★判别性对照：**同一个攻击者、同一次固定掷面、同一 dmg 骰**，只有「近战／远程」一个变量。
	 * 源：SRD d20M · source/1Modern现代/27msrdcombat战斗.md:77（仅近战或投掷加力量） */
	test('d20m combat：伤害修正对齐 SRD d20M —— 近战加力量、远程不加（同掷面对照）', () => {
		R().rng.set(() => 0.5); // d20 掷 11；2d6 各掷 4
		try {
			const attacker = { stats: D().stats({ bab: 12, str: 14, dex: 12 }) }; // 力量 +2
			const melee = { name: '近战靶', hp: 50, maxHp: 50, stats: { ac: 12 } };
			const ranged = { name: '远程靶', hp: 50, maxHp: 50, stats: { ac: 12 } };
			new (D().Beretta92F)().used(ranged, attacker);          // 远程：11+13 ≥ 12 ⇒ 命中
			new (R().items.get('unit-d20m-blade'))().used(melee, attacker); // 近战：11+14 ≥ 12 ⇒ 命中
			assert.eq(ranged.hp, 42, '远程：伤害 8（4+4，**不加**调整值）');
			assert.eq(melee.hp, 40, '近战：伤害 10（4+4 ＋ 力量 +2）');
			assert.ok(ranged.hp - melee.hp === 2, '差值恰为力量调整值');
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

	/* 源：SRD d20M · source/1Modern现代/27msrdcombat战斗.md:21（天然 1 必失／天然 20 必中） */
	test('d20m combat：天然 1 必失（对齐 SRD d20M，加值再高也不命中）', () => {
		R().rng.set(() => 0); // d20 恒 1
		try {
			const attacker = { stats: D().stats({ bab: 99, dex: 12 }) }; // 加值极高 ⇒ 若按总则应命中
			const target = { name: '靶', hp: 50, maxHp: 50, stats: { ac: 12 } };
			new (D().Beretta92F)().used(target, attacker);
			assert.eq(target.hp, 50, '天然 1 恒为失手（战斗节 :21 的例外条款）');
		} finally {
			R().rng.reset();
		}
	});

	/* 源：SRD d20M · source/1Modern现代/27msrdcombat战斗.md:21（天然 20 必中） */
	test('d20m combat：天然 20 必中（对齐 SRD d20M，防御再高也命中）', () => {
		R().rng.set(() => 0.99); // d20 恒 20；确认掷亦 20；2d6 各掷 6
		try {
			const attacker = { stats: D().stats({ bab: 0, dex: 1 }) }; // 灵巧 −5 ⇒ atkMod −5
			const target = { name: '高防靶', hp: 50, maxHp: 50, stats: { ac: 30 } };
			new (D().Beretta92F)().used(target, attacker);
			// 天然 20 恒命中（✗ 不比 Defense）；确认掷 20−5 = 15 < 30 ⇒ 不作重击 ⇒ 伤害 12（远程不加值）
			assert.eq(target.hp, 38, '天然 20 必中且未确认 ⇒ 单倍伤害 12');
		} finally {
			R().rng.reset();
		}
	});

	test('d20m combat：伤害下限 1（近战负力量压到 0 以下时）', () => {
		// 序列：d20 = 11（命中）；两枚 d6 = 1、1 ⇒ 2 − 5 = −3 ⇒ 取下限 1
		R().rng.setSequence([0.5, 0, 0]);
		try {
			const attacker = { stats: D().stats({ bab: 12, str: 1 }) }; // 近战用力量 −5 ⇒ atkMod 7 ⇒ 18 ≥ 12
			const target = { name: '靶', hp: 50, maxHp: 50, stats: { ac: 12 } };
			new (R().items.get('unit-d20m-blade'))().used(target, attacker);
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
