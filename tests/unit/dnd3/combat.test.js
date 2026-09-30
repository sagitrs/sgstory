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
		const attacker = { stats: { bab: 20, str_mod: 2 } };
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

	test('dnd3 combat：装备提升防御——着甲后同攻击者更难命中（统计）', () => {
		const attacker = { stats: { bab: 0, str_mod: 0 } }; // 命中需 1d20 >= AC
		const swings = 200;
		const hitCount = (target) => {
			let hits = 0;
			for (let i = 0; i < swings; i++) {
				const h = target.hp;
				target.hp = Math.min(target.maxHp, target.hp); // 保持可继续挨打
				R().createItem('club').used(target, attacker);
				if (target.hp < h) hits++;
				target.hp = target.maxHp; // 重置继续统计
			}
			return hits;
		};
		const naked = { name: '裸靶', hp: 999, maxHp: 999, stats: { ac: 10 } };
		const armored = { name: '甲靶', hp: 999, maxHp: 999, stats: { ac: 10 }, items: [{ id: 'mail', equipped: true }] };
		const n1 = hitCount(naked);   // AC 10 → 期望 ~50%
		const n2 = hitCount(armored); // AC 13 → 期望 ~35%
		// 统计断言：200 掷时均值差 ~30、σ ~10，n2 < n1 的置信度 >99.9%
		assert.ok(n2 < n1, `着甲后被命中更少（裸 ${n1} vs 甲 ${n2}，共 ${swings} 掷）`);
	});

	test('dnd3 combat：炸弹用灵巧不用力量，可击倒目标', () => {
		const attacker = { stats: { bab: 20, dex_mod: 5, str_mod: -5 } };
		const dummy = { name: '靶', hp: 6, maxHp: 6, stats: { ac: -999 } };
		let thrown = 0;
		while (dummy.hp > 0 && thrown < 10) {
			R().createItem('bomb').used(dummy, attacker);
			thrown++;
		}
		assert.ok(dummy.hp === 0, `炸弹击倒目标（投掷 ${thrown} 次）`);
	});
})();
