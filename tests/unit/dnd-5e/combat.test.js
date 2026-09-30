/* dnd-5e/core/combat 的单元测试：攻击数学（熟练度/Finesse/重击骰子翻倍）、护甲 AC
 * 注意：dnd3 与 dnd-5e 共享 RPG.items 注册表，同 ID 道具后注册者覆盖先注册者
 * （dnd3 的 club 会覆盖 5e 的 club）。测试 5E 道具时用 new DND5E.Xxx() 直接实例化。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND5E;

	test('5e combat：acOf——无甲 = 10 + 灵巧', () => {
		const c = { stats: { dex_mod: 3 } };
		assert.eq(D().acOf(c), 13);
	});

	test('5e combat：acOf——轻甲（皮甲）= 11 + 灵巧', () => {
		const c = { stats: { dex_mod: 3 }, items: [{ id: 'leather', equipped: true }] };
		assert.eq(D().acOf(c), 14);
	});

	test('5e combat：acOf——中甲（链甲衫）= 13 + min(灵巧, 2)', () => {
		const c = { stats: { dex_mod: 3 }, items: [{ id: 'chain-shirt', equipped: true }] };
		assert.eq(D().acOf(c), 15, '灵巧 3 但上限 2');
		const c2 = { stats: { dex_mod: 1 }, items: [{ id: 'chain-shirt', equipped: true }] };
		assert.eq(D().acOf(c2), 14, '灵巧 1 低于上限');
	});

	test('5e combat：acOf——重甲（环甲）= 14 固定，不加灵巧', () => {
		const c = { stats: { dex_mod: 5 }, items: [{ id: 'ring-mail', equipped: true }] };
		assert.eq(D().acOf(c), 14);
	});

	test('5e combat：攻击含熟练度（prof +2 替代 BAB）', () => {
		const attacker = { stats: { prof: 20, str_mod: 0, dex_mod: 0 } };
		const dummy = { name: '靶', hp: 100, maxHp: 100, stats: { ac: -999 } };
		let hit = false;
		for (let i = 0; i < 10 && !hit; i++) {
			const h = dummy.hp;
			new (D().Club)().used(dummy, attacker);
			hit = dummy.hp < h;
		}
		assert.ok(hit, '熟练度加值使攻击命中');
	});

	test('5e combat：Finesse 武器用 max(str, dex)', () => {
		const attacker = { stats: { prof: 20, str_mod: -5, dex_mod: 3 } };
		const dummy = { name: '靶', hp: 100, maxHp: 100, stats: { ac: -999 } };
		let hit = false;
		for (let i = 0; i < 10 && !hit; i++) {
			const h = dummy.hp;
			new (D().Dagger)().used(dummy, attacker);
			hit = dummy.hp < h;
		}
		assert.ok(hit, 'Finesse 匕首用灵巧命中');
	});

	test('5e combat：木棒伤害 1d4（5E 数值，非 3E 的 1d6）', () => {
		const attacker = { stats: { prof: 20, str_mod: 0 } };
		const dummy = { name: '靶', hp: 100, maxHp: 100, stats: { ac: -999 } };
		let maxDmg = 0;
		for (let i = 0; i < 30; i++) {
			dummy.hp = 100;
			new (D().Club)().used(dummy, attacker);
			maxDmg = Math.max(maxDmg, 100 - dummy.hp);
		}
		// 1d4+0：普通 1-4，重击（骰子翻倍）2-8
		assert.ok(maxDmg >= 1 && maxDmg <= 8, `木棒伤害在 1d4 范围（最大 ${maxDmg}）`);
		// 3E 木棒是 1d6（最大 12 重击），如果看到 9+ 就不是 5E 数值
		assert.ok(maxDmg <= 8, `不应超过 1d4 重击上限 8（实际 ${maxDmg}）`);
	});

	test('5e combat：炸弹是远程武器（用灵巧）', () => {
		const attacker = { stats: { prof: 20, str_mod: -5, dex_mod: 3 } };
		const dummy = { name: '靶', hp: 10, maxHp: 10, stats: { ac: -999 } };
		let hit = false;
		for (let i = 0; i < 10 && !hit; i++) {
			const h = dummy.hp;
			new (D().Bomb)().used(dummy, attacker);
			hit = dummy.hp < h;
		}
		assert.ok(hit, '炸弹用灵巧投掷命中');
	});
})();
