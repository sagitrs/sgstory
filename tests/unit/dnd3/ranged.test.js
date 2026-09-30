/* dnd3 远程武器与短弓的单元测试（回应检视 M1/M4 突变：
 * 拔掉 ranged 分支或删除 short-bow.js 后测试应转红） */
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

	test('dnd3 ranged：meleeAttack 对 ranged 用灵巧不用力量（M1 突变检测）', () => {
		// 构造：灵巧高、力量低 → 只有 ranged 分支用灵巧才能命中
		const attacker = { stats: { bab: 20, str_mod: -10, dex_mod: 3 } };
		const dummy = { name: '靶', hp: 100, maxHp: 100, stats: { ac: 0 } };
		let hit = false;
		for (let i = 0; i < 10 && !hit; i++) {
			const h = dummy.hp;
			dummy.hp = 100;
			D().meleeAttack(new (D().ShortBow)(), dummy, attacker);
			hit = dummy.hp < 100;
		}
		// 如果 ranged 分支被拔掉（用 str -10），20-10=10 vs AC 0 仍会命中…
		// 更强的断言：灵巧为正时伤害应包含灵巧加值
		// 构造必中场景：ac=-999
		const dummy2 = { name: '必中靶', hp: 100, maxHp: 100, stats: { ac: -999 } };
		const attacker2 = { stats: { bab: 20, str_mod: -10, dex_mod: 3 } };
		new (D().ShortBow)().used(dummy2, attacker2);
		// 远程伤害 = 1d6 + dex(3)，不含 str(-10)
		// 命中时伤害应在 4..9 范围（1d6+3）
		const dmg = 100 - dummy2.hp;
		assert.ok(dmg >= 4 && dmg <= 9,
			`远程伤害 ${dmg} 应含灵巧 +3（1d6+3 = 4..9）`);
		assert.ok(dmg > 3, '伤害 > 3（若误用力量 -10 则最多 1d6-10 → 最低 1）');
	});

	test('dnd3 ranged：近战武器仍用力量（非 ranged 不受影响）', () => {
		const attacker = { stats: { bab: 20, str_mod: 3, dex_mod: -10 } };
		const dummy = { name: '靶', hp: 100, maxHp: 100, stats: { ac: -999 } };
		const club = new (D().Club)();
		club.equipped = true; // 绕过拔出检查
		club.used(dummy, attacker);
		const dmg = 100 - dummy.hp;
		// 近战伤害 = 1d6 + str(3)，不含 dex(-10)
		assert.ok(dmg >= 4 && dmg <= 9,
			`近战伤害 ${dmg} 应含力量 +3（1d6+3 = 4..9）`);
	});

	test('dnd3 ranged：短弓未装备也可直接使用（与近战需拔出的差异面）', () => {
		const attacker = { stats: { bab: 20, str_mod: 0, dex_mod: 0 } };
		const dummy = { name: '靶', hp: 100, maxHp: 100, stats: { ac: -999 } };
		const bow = new (D().ShortBow)();
		assert.ok(!bow.equipped, '初始未装备');
		// 直接调用 used() — 远程武器不应因未装备而拦截
		bow.used(dummy, attacker);
		// 应造成伤害（未被「拔出检查」拦截）
		assert.ok(dummy.hp < 100, '未装备的短弓可以射击');
	});
})();
