/* dnd-5e/core/combat 的单元测试：攻击数学（熟练度/Finesse/重击骰子翻倍）、护甲 AC
 * 注意：dnd3 与 dnd-5e 共享 RPG.items 注册表，同 ID 道具后注册者覆盖先注册者
 * （dnd3 的 club 会覆盖 5e 的 club）。测试 5E 道具时用 new DND5E.Xxx() 直接实例化。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND5E;

	test('5e combat：acOf——无甲 = 10 + 灵巧', () => {
		const c = { stats: { dex: 16 } };
		assert.eq(D().acOf(c), 13);
	});

	test('5e combat：acOf——轻甲（皮甲）= 11 + 灵巧', () => {
		const c = { stats: { dex: 16 }, items: [{ id: 'leather', equipped: true }] };
		assert.eq(D().acOf(c), 14);
	});

	test('5e combat：acOf——中甲（链甲衫）= 13 + min(灵巧, 2)', () => {
		const c = { stats: { dex: 16 }, items: [{ id: 'chain-shirt', equipped: true }] };
		assert.eq(D().acOf(c), 15, '灵巧 3 但上限 2');
		const c2 = { stats: { dex: 12 }, items: [{ id: 'chain-shirt', equipped: true }] };
		assert.eq(D().acOf(c2), 14, '灵巧 1 低于上限');
	});

	test('5e combat：acOf——重甲（环甲）= 14 固定，不加灵巧', () => {
		const c = { stats: { dex: 20 }, items: [{ id: 'ring-mail', equipped: true }] };
		assert.eq(D().acOf(c), 14);
	});

	test('5e combat：攻击含熟练度与能力调整值（定骰＋AC 判别面）', () => {
		// 判别构造：固定 d20 = 11（0.5），靶 AC 12（不再用 −999 必中靶）。
		//   prof 2 + STR 10(+0) ⇒ 13 ≥ 12 命中；prof 0 ⇒ 11 < 12 哑火；prof 2 + STR 16(+3) ⇒ 16 命中。
		//   若实现忽略能力调整值或熟练度，相应一档必红。
		const run = (stats) => {
			setup.RPG.rng.set(() => 0.5);
			try {
				const dummy = { name: '靶', hp: 100, maxHp: 100, stats: { ac: 12 } };
				new (D().Club)().used(dummy, { stats });
				return 100 - dummy.hp;
			} finally {
				setup.RPG.rng.reset();
			}
		};
		assert.ok(run({ prof: 2, str: 10 }) > 0, 'prof 2 ⇒ 11+2 = 13 ≥ AC 12 命中');
		assert.eq(run({ prof: 0, str: 10 }), 0, 'prof 0 ⇒ 11 < AC 12 哑火（熟练度确实入算）');
		assert.ok(run({ prof: 0, str: 16 }) > 0, 'prof 0 + STR 16(+3) ⇒ 14 ≥ AC 12 命中（能力调整值入算）');
	});

	test('5e combat：Finesse 武器用 max(str, dex)（定骰＋AC 判别面）', () => {
		// 固定 d20 = 11，靶 AC 12：匕首为 Finesse ⇒ 取 max(STR, DEX)。
		//   STR 1(−5) / DEX 16(+3) ⇒ 11+3 = 14 ≥ 12 命中；若误用力量 ⇒ 11−5 = 6 < 12 哑火。
		const run = (stats) => {
			setup.RPG.rng.set(() => 0.5);
			try {
				const dummy = { name: '靶', hp: 100, maxHp: 100, stats: { ac: 12 } };
				new (D().Dagger)().used(dummy, { stats });
				return 100 - dummy.hp;
			} finally {
				setup.RPG.rng.reset();
			}
		};
		assert.ok(run({ prof: 0, str: 1, dex: 16 }) > 0, '取灵巧：11+3 = 14 ≥ AC 12 命中');
		assert.ok(run({ prof: 0, str: 16, dex: 1 }) > 0, '取力量：11+3 = 14 ≥ AC 12 命中（证明确为 max，而非只认灵巧）');
		assert.eq(run({ prof: 0, str: 1, dex: 1 }), 0, '两者皆低：11−5 = 6 < AC 12 哑火');
	});

	test('5e combat：木棒伤害 1d4（5E 数值，非 3E 的 1d6）', () => {
		const attacker = { stats: { prof: 20, str: 10 } };
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

	test('5e combat：炸弹是远程武器（用灵巧不用力量）——定骰＋AC 判别面', () => {
		// 判别构造：固定 d20 = 11（0.5），靶 AC 12，prof = 0。
		//   用灵巧（DEX 16 ⇒ +3）：11 + 3 = 14 ≥ 12 ⇒ 命中，伤害 1d6 + 3 = 7（5E 调整值入伤害）；
		//   若误用力量（STR 1 ⇒ −5）：11 − 5 = 6 < 12 ⇒ 哑火；
		//   若忽略能力调整值（+0）：11 < 12 ⇒ 哑火。
		const run = (stats) => {
			setup.RPG.rng.set(() => 0.5);
			try {
				const dummy = { name: '靶', hp: 30, maxHp: 30, stats: { ac: 12 } };
				new (D().Bomb)().used(dummy, { stats });
				return 30 - dummy.hp;
			} finally {
				setup.RPG.rng.reset();
			}
		};
		assert.eq(run({ prof: 0, str: 1, dex: 16 }), 7, '用灵巧：11+3 = 14 ≥ AC 12 ⇒ 命中，伤害 1d6(4)+灵巧(+3) = 7');
		assert.eq(run({ prof: 0, str: 20, dex: 1 }), 0, '仅力量：11+(−5) = 6 < AC 12 ⇒ 哑火');
		assert.eq(run({ prof: 0, str: 10, dex: 10 }), 0, '无调整值：11+0 = 11 < AC 12 ⇒ 哑火');
	});
})();
