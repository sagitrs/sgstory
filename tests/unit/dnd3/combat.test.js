/* dnd3/core/combat 的单元测试：acOf（装备加成）、近战数学复用、击倒结算 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	test('dnd3 combat：acOf = 基础 AC + 已装备道具的 ac_bonus', () => {
		const c = new (R().Character)({ name: '靶甲', hp: 10, stats: { ac: 10 } });
		assert.eq(D().acOf(c), 10, '裸装');
		c.items.push({ id: 'mail', equipped: true });   // +3
		c.items.push({ id: 'boots', equipped: true });  // +1
		c.items.push({ id: 'tunic' });                  // 未装备不计
		assert.eq(D().acOf(c), 14, '铁环甲+皮靴，布衣未穿不计');
	});

	test('dnd3 combat：长剑与木棒共用同一套近战数学', () => {
		// 必中构造：bab 20；对低 AC 目标连击，两种武器都应造成伤害
		const attacker = { stats: { bab: 20, str: 14 } };
		for (const id of ['club', 'sword']) {
			const dummy = { name: '靶', hp: 100, maxHp: 100, stats: { ac: -999 } };
			let damaged = false;
			for (let i = 0; i < 10 && !damaged; i++) {
				const h = dummy.hp;
				R().createItem(id).used(dummy, attacker);
				damaged = dummy.hp < h;
			}
			assert.ok(damaged, `${id} 造成伤害（近战数学生效）`);
		}
	});

	test('dnd3 combat：装备提升防御——着甲后同攻击者更难命中（固定 RNG）', () => {
		// 固定随机源 → d20 始终掷 11（=(0.5*20)|0+1=11）
		// 天然 1/20 不会出现（固定掷 11），AC 检查正常生效：
		// 裸靶 AC 10：11+0=11 >= 10 → 每掷必中
		// 甲靶 AC 13：11+0=11 < 13 → 每掷必不中（mail ac_bonus=3 → 10+3=13）
		R().rng.set(() => 0.5);
		try {
			const attacker = { stats: { bab: 0, str: 10 } };
			const swings = 10;
			const naked = { name: '裸靶', hp: 999, maxHp: 999, stats: { ac: 10 } };
			const armored = { name: '甲靶', hp: 999, maxHp: 999, stats: { ac: 10 }, items: [{ id: 'mail', equipped: true }] };
			let n1 = 0, n2 = 0;
			for (let i = 0; i < swings; i++) {
				naked.hp = 999;
				R().createItem('club').used(naked, attacker);
				if (naked.hp < 999) n1++;
				armored.hp = 999;
				R().createItem('club').used(armored, attacker);
				if (armored.hp < 999) n2++;
			}
			assert.ok(n1 === swings, `裸靶（AC 10）掷 11 应全命中（${n1}/${swings}）`);
			assert.ok(n2 === 0, `甲靶（AC 13）掷 11 应全不中（${n2}/${swings}）`);
			assert.ok(n2 < n1, `着甲后更难命中（裸 ${n1} vs 甲 ${n2}）`);
		} finally {
			R().rng.reset();
		}
	});

	test('dnd3 combat：炸弹用灵巧不用力量，可击倒目标', () => {
		const attacker = { stats: { bab: 20, dex: 20, str: 1 } };
		const dummy = { name: '靶', hp: 6, maxHp: 6, stats: { ac: -999 } };
		let thrown = 0;
		while (dummy.hp > 0 && thrown < 10) {
			R().createItem('bomb').used(dummy, attacker);
			thrown++;
		}
		assert.ok(dummy.hp === 0, `炸弹击倒目标（投掷 ${thrown} 次）`);
	});
})();
