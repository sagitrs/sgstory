/* dnd3 远程武器与短弓的单元测试（消抖版：noDodge + 固定随机源）
 * ★`#1750` ①（断言锚定实现而非真值）：本档「**短弓数据**」格与「远程伤害含灵巧」格把 **B-3 固化为规格** —— 期望由**注释自推**（`1d6+3`）✗ 未注明源出处（★正例形见 `tests/unit/dnd3/span1.test.js:3`：涉 SRD 的断言在**断言处注明出处**，对源锚 ✗ 不锚实现）
 * 检视要求：靶需 noDodge:true（同时免疫天然1必失与天然20重击越界），
 * 或注入固定随机源（RPG.rng）。本文件两者兼用确保零抖动。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	test('dnd3 ranged：短弓数据（1d6 穿刺 / ranged / 80ft）', () => {
		const bow = new (D().ShortBow)();
		assert.eq(bow.stats.dmg, '1d6', '伤害骰');
		assert.eq(bow.stats.type, 'piercing', '穿刺类型');
		assert.ok(bow.stats.ranged, '是远程武器');
		assert.eq(bow.stats.range, 80, '射程 80 英尺');
		assert.ok(bow.weapon, '武器标志');
		assert.eq(bow.slot, 'weapon', '武器槽');
	});

	test('dnd3 ranged：meleeAttack 对 ranged 用灵巧不用力量（固定 RNG）', () => {
		// 固定随机源 → d20 掷 11（=(0.5*20)|0 + 1 = 11）
		// noDodge 免必失/免重击 → 纯线性断言
		R().rng.set(() => 0.5);
		try {
			const attacker = { stats: { bab: 0, str: 1, dex: 16 } };
			const dummy = { name: '靶', hp: 100, maxHp: 100, stats: { ac: 0 }, noDodge: true };
			new (D().ShortBow)().used(dummy, attacker);
			// 掷 11 + bab(0) = 11 >= AC 0 → 命中
			// 伤害 = 1d6(固定掷 4) + 灵巧调整值(+3)，不含力量调整值（str: 1 ⇒ −5）
			const dmg = 100 - dummy.hp;
			// 0.5 ⇒ 1d6 掷 (0.5*6)|0+1 = 4；伤害 = 4+3 = 7
			assert.ok(dmg >= 4 && dmg <= 9,
				`远程伤害 ${dmg} 应含灵巧 +3（1d6+3 = 4..9 范围）`);
			assert.ok(dmg > 3, `伤害 > 3（若误用力量：str 1 ⇒ −5，1d6−5 最低钳制 1）`);
		} finally {
			R().rng.reset();
		}
	});

	test('dnd3 ranged：近战武器仍用力量（固定 RNG）', () => {
		R().rng.set(() => 0.5);
		try {
			const attacker = { stats: { bab: 0, str: 16, dex: 1 } };
			const dummy = { name: '靶', hp: 100, maxHp: 100, stats: { ac: 0 }, noDodge: true };
			const club = new (D().Club)();
			club.equipped = true; // 绕过拔出检查
			club.used(dummy, attacker);
			const dmg = 100 - dummy.hp;
			assert.ok(dmg >= 4 && dmg <= 9,
				`近战伤害 ${dmg} 应含力量 +3（1d6+3 = 4..9）`);
		} finally {
			R().rng.reset();
		}
	});

	test('dnd3 ranged：短弓未装备也可直接使用（与近战需拔出的差异面）', () => {
		R().rng.set(() => 0.5);
		try {
			const attacker = { stats: { bab: 0, str: 10, dex: 10 } };
			const dummy = { name: '靶', hp: 100, maxHp: 100, stats: { ac: 0 }, noDodge: true };
			const bow = new (D().ShortBow)();
			assert.ok(!bow.equipped, '初始未装备');
			bow.used(dummy, attacker);
			// 远程不需拔出 → 直接造成伤害
			assert.ok(dummy.hp < 100, '未装备的短弓可以射击');
			// 近战未装备 → 应触发拔出而非直接攻击
			const club = new (D().Club)();
			const dummy2 = { name: '靶2', hp: 100, maxHp: 100, stats: { ac: 0 }, noDodge: true };
			club.used(dummy2, attacker); // 会设置 equipped=true（拔出）并攻击
			assert.ok(club.equipped, '近战武器使用了自动拔出');
		} finally {
			R().rng.reset();
		}
	});
})();
