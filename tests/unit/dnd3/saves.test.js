/* dnd3/core/saves 的单元测试：3.5 三豁免（强韧／反射／意志）与恐惧效果
 *
 * ★`sgstory#2030` ＋ `#1762` B-6（规格侧）：本档随口径变更重写 —— 旧版断言的是 B/X 的分类
 *   （`save_spells` ＋「与六维调整值无关」）。现在：
 *     总分 = **基础加值**（`stats.save_<类型>`）＋ **该豁免的属性调整值** ＋ 创伤罚；
 *     强韧→体质、反射→敏捷、意志→感知（出处见 `src/dnd/dnd3/core/saves.js` 档头）。
 *   本档负控与正控成对：① 类型映射（三型各不同属性）② 未知名不映射（只取基础加值）
 *   ③ 缺 `stats` 不炸 ④ 属性变化即时生效（✗ 不是把调整值烤进字段）。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	test('dnd3 saves：返回形六键不变（S6；✗ 不得加键）', () => {
		const c = { stats: { save_will: 2 } };
		const r = D().save(c, 'will', 12);
		assert.eq(Object.keys(r).sort().join(','), 'dc,mod,roll,success,total,trauma', '六键');
	});

	test('dnd3 saves：总分 = 基础加值 ＋ 属性调整值（三型各连到自己的属性）', () => {
		// 六维刻意取成三个不同的调整值：体质 16(+3)、敏捷 8(−1)、感知 20(+5)
		const c = { stats: D().stats({ con: 16, dex: 8, wis: 20, save_fortitude: 1, save_reflex: 2, save_will: 3 }) };
		assert.eq(D().save(c, 'fortitude', 0).mod, 1 + 3, '强韧 ＝ 基础 1 ＋ 体质 +3');
		assert.eq(D().save(c, 'reflex', 0).mod, 2 + -1, '反射 ＝ 基础 2 ＋ 敏捷 −1');
		assert.eq(D().save(c, 'will', 0).mod, 3 + 5, '意志 ＝ 基础 3 ＋ 感知 +5');
	});

	test('dnd3 saves：未知类型不接属性（只取基础加值；✗ 不抛）', () => {
		const c = { stats: D().stats({ con: 18, save_petrification: 4 }) };
		const r = D().save(c, 'petrification', 0);
		assert.eq(r.mod, 4, '旧 B/X 名不是三豁免之一 ⇒ 本体加值原样，✗ 不加体质那一份');
		assert.eq(D().save(c, 'spells', 0).mod, 0, '旧名 spells 亦不映射（口径已换成 will）');
	});

	test('dnd3 saves：缺 stats／缺字段都不炸（缺省 0 ＋ 六维缺省 10 ⇒ +0）', () => {
		assert.eq(D().save(undefined, 'will', 0).mod, 0, '整个角色缺 ⇒ 0');
		assert.eq(D().save({}, 'will', 0).mod, 0, '缺 stats ⇒ 0');
		assert.eq(D().save({ stats: {} }, 'fortitude', 0).mod, 0, '缺字段 ⇒ 0（六维缺省 10）');
		// 默认数值块：三键都在、且默认 0
		const s = D().stats();
		assert.eq(s.save_fortitude, 0, 'STAT_BLOCK 有 save_fortitude 且默认 0');
		assert.eq(s.save_reflex, 0, 'STAT_BLOCK 有 save_reflex 且默认 0');
		assert.eq(s.save_will, 0, 'STAT_BLOCK 有 save_will 且默认 0');
	});

	test('dnd3 saves：属性是**现算**的（改了六维，调整值立刻跟着变）', () => {
		const c = { stats: D().stats({ con: 10, save_fortitude: 0 }) };
		assert.eq(D().save(c, 'fortitude', 0).mod, 0, '体质 10 ⇒ +0');
		c.stats.con = 20;
		assert.eq(D().save(c, 'fortitude', 0).mod, 5, '体质 20 ⇒ +5（✗ 未烤进字段）');
	});

	test('dnd3 saves：total = roll ＋ mod ＋ 创伤罚（受控掷骰）', () => {
		R().rng.set(() => 0.5); // 1d20 = 11
		try {
			const c = { stats: D().stats({ con: 14, save_fortitude: 1 }) };   // 1 + 2 = 3
			const r = D().save(c, 'fortitude', 12);
			assert.eq(r.roll, 11, '掷 11');
			assert.eq(r.mod, 3, 'mod ＝ 基础 1 ＋ 体质 +2');
			assert.eq(r.total, 14, 'total ＝ 11 + 3');
			assert.ok(r.success, '14 ≥ DC 12 ⇒ 成功');
			assert.ok(!D().save(c, 'fortitude', 15).success, '14 < DC 15 ⇒ 失败');
		} finally {
			R().rng.reset();
		}
	});

	test('dnd3 saves：fearCheck 失败后施加 fear 减益（走意志豁免）', () => {
		R().rng.set(() => 0.0); // 掷 1 ⇒ 必败
		try {
			const c = new (R().Character)({ name: '懦夫', hp: 10, maxHp: 10, stats: D().stats({}) });
			assert.ok(!c.contains(R().fear), '初始未恐惧');
			assert.ok(!D().fearCheck(c, 20), '意志豁免失败');
			assert.ok(c.contains(R().fear), '获得 fear 减益');
			assert.eq(c.effects.filter(e => e === 'fear').length, 1, '只施加一次');
		} finally {
			R().rng.reset();
		}
	});

	test('dnd3 saves：fearCheck 的成败**由感知驱动**（正反一对，防「名字换了、面还是死的」）', () => {
		R().rng.set(() => 0.5); // 掷 11
		try {
			const mk = (wis) => new (R().Character)({ name: '甲', hp: 10, maxHp: 10, stats: D().stats({ wis }) });
			// DC 12：感知 10（+0）⇒ 11 < 12 失败；感知 14（+2）⇒ 13 ≥ 12 成功
			const low = mk(10), high = mk(14);
			assert.ok(!D().fearCheck(low, 12), '感知 10 ⇒ 11 + 0 < 12（失败）');
			assert.ok(low.contains(R().fear), '失败 ⇒ 恐惧上身');
			assert.ok(D().fearCheck(high, 12), '感知 14 ⇒ 11 + 2 ≥ 12（成功）');
			assert.ok(!high.contains(R().fear), '成功 ⇒ 无恐惧');
		} finally {
			R().rng.reset();
		}
	});

	test('dnd3 saves：fearCheck 已恐惧时幂等（不重复施加）', () => {
		const c = new (R().Character)({ name: '已恐惧者', hp: 10, maxHp: 10, stats: D().stats({}) });
		c.gain(R().fear); // 预先施加
		assert.ok(c.contains(R().fear), '已恐惧');
		assert.ok(D().fearCheck(c, 1), '已恐惧时直接返回 true（不再掷骰）');
		assert.eq(c.effects.filter(e => e === 'fear').length, 1, '不重复 gain');
	});
})();
