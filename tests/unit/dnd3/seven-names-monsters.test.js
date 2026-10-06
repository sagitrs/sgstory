/* 七名河 E6 的三只怪物（`#2027`）：照录值对账 ＋ 改良抓握与御水的端到端
 *
 * 对账的锚＝两只怪物档各自的「出处」行（那里逐值给了 pinned 的行号与键；本档✗ 不复述源引用
 * ——引用的单一落点是怪物档，见 `src/dnd/dnd3/monsters/crocodile.js` 与 `water-elemental.js`）。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	const 复位 = () => {
		for (const m of [D().Crocodile, D().SmallWaterElemental, D().MediumWaterElemental]) {
			m.hp = m.maxHp; m.runtime = {}; m.nonlethal = 0;
		}
		D().Crocodile.effects = [];
		D().SmallWaterElemental.effects = ['water-mastery'];
		D().MediumWaterElemental.effects = ['water-mastery'];
		D().Crocodile.items = [{ id: 'crocodile-bite', equipped: true }];
		D().SmallWaterElemental.items = [{ id: 'small-water-elemental-slam', equipped: true }];
		D().MediumWaterElemental.items = [{ id: 'medium-water-elemental-slam', equipped: true }];
		R().Battle.current = null;
		R().rng.reset();
	};

	test('七名河 E6：鳄鱼照录 pinned 数值（HP／AC／六维／CR／体型）', () => {
		复位();
		const 鳄 = D().Crocodile;
		assert.eq(鳄.maxHp, 22, 'Hit Dice 3d8+9 ⇒ 22 hp（`Animals.md:521`）');
		assert.eq(鳄.stats.ac, 15, 'Armor Class 15（`:524`）');
		assert.eq(鳄.stats.bab, 2, 'Base Attack +2（`:525`）');
		assert.eq(鳄.stats.cr, 2, 'Challenge Rating 2（`:537`）');
		assert.eq(鳄.stats.size, 'medium', 'Medium Animal（`:520`）');
		assert.eq(鳄.stats.str, 19, 'Str 19（`:532`）');
		assert.eq(鳄.stats.dex, 12, 'Dex 12');
		assert.eq(鳄.stats.con, 17, 'Con 17');
		assert.eq(鳄.stats.int, 1, 'Int 1');
		assert.eq(鳄.stats.wis, 12, 'Wis 12');
		assert.eq(鳄.stats.cha, 2, 'Cha 2');
	});

	test('七名河 E6：两型水元素照录 pinned 数值（HP／AC／六维／CR／体型）', () => {
		复位();
		const 小 = D().SmallWaterElemental, 中 = D().MediumWaterElemental;
		assert.eq(小.maxHp, 11, 'Small：2d8+2 ⇒ 11 hp（`3.5 Monsters - E.md:315`）');
		assert.eq(小.stats.ac, 17, 'Small：AC 17（`:318`）');
		assert.eq(小.stats.bab, 1, 'Small：BAB +1（`:319`）');
		assert.eq(小.stats.cr, 1, 'Small：CR 1（`:332`）');
		assert.eq(小.stats.size, 'small', 'Small Elemental');
		assert.eq(小.stats.str, 14, 'Small：Str 14（`:327`）');
		assert.eq(中.maxHp, 30, 'Medium：4d8+12 ⇒ 30 hp');
		assert.eq(中.stats.ac, 19, 'Medium：AC 19');
		assert.eq(中.stats.bab, 3, 'Medium：BAB +3');
		assert.eq(中.stats.cr, 3, 'Medium：CR 3');
		assert.eq(中.stats.size, 'medium', 'Medium Elemental');
		assert.eq(中.stats.str, 16, 'Medium：Str 16');
	});

	test('七名河 E6：御水是水元素的先天能力（声明式 effects），鳄鱼没有', () => {
		复位();
		assert.ok(D().hasWaterMastery(D().SmallWaterElemental), '小水元素带御水');
		assert.ok(D().hasWaterMastery(D().MediumWaterElemental), '中水元素带御水');
		assert.ok(!D().hasWaterMastery(D().Crocodile), '鳄鱼不带（✗ 不得因「水里的动物」误判）');
		复位();
	});

	test('七名河 E6：攻击件照录（atkBonus 与 dmgBonus 逐值），鳄鱼咬带改良抓握', () => {
		复位();
		const 咬 = R().createItem('crocodile-bite');
		assert.eq(咬.stats.atkBonus, 6, 'Bite +6（`:526`）');
		assert.eq(咬.stats.dmgBonus, 6, '1d8+6 的加值（＝力调 +4 ×1.5 ⇒ 照录）');
		assert.eq(咬.stats.onHit, 'improved-grab', '命中后追加：改良抓握');
		const 小击 = R().createItem('small-water-elemental-slam');
		assert.eq(小击.stats.atkBonus, 4, 'Small：Slam +4（`:320`）');
		assert.eq(小击.stats.dmgBonus, 3, 'Small：1d6+3 的加值');
		assert.eq(R().createItem('medium-water-elemental-slam').stats.atkBonus, 6, 'Medium：Slam +6');
		assert.eq(R().createItem('medium-water-elemental-slam').stats.dmgBonus, 4, 'Medium：1d8+4 的加值');
	});

	test('七名河 E6：水元素与鳄鱼都不带 coin（Treasure None／Animals 总则）', () => {
		复位();
		for (const [名, m] of [['鳄鱼', D().Crocodile], ['小水元素', D().SmallWaterElemental]]) {
			assert.ok(!m.items.some((s) => s.id === 'coin'), `${名}：不带 coin（掉落面为空）`);
			assert.ok(m.items.some((s) => s.equipped), `${名}：装备着天然武器（可反击）`);
		}
		复位();
	});

	test('七名河 E6 端到端：鳄鱼咬中 ⇒ 起擒抱 ⇒ 下一回合钉住（自动通路）', async () => {
		复位();
		/* 固定随机源 ⇒ 每骰掷 12（`0.55 × 20 = 11 ⇒ 12`）；1d8 ⇒ 5；1d3 ⇒ 2。 */
		R().rng.set(() => 0.55);
		const 勇者 = new (R().Character)({
			name: '试炼者', hp: 40, maxHp: 40,
			stats: D().stats({ ac: 12, str: 1 }),   // 力量极低 ⇒ 反击必空（把注意力留在擒抱上）
			items: [{ id: 'club', equipped: true }],
		});
		/* ★擒抱是**战斗期**状态（`scope: 'battle'`）⇒ 战斗收尾的 `battle:end` 会清掉它
		 *   ⇒ 「被擒住」这一事实只能在**战斗中**观察：挂一个只读的 `battle:turnEnd` 侦听器取样。 */
		let 中途被擒 = false, 中途被钉 = false;
		const 取样 = ({ actor }) => {
			if (actor !== 勇者) return;
			if (勇者.contains('grapple-hold')) 中途被擒 = true;
			if (勇者.contains('grapple-pin')) 中途被钉 = true;
		};
		R().events.on('battle:turnEnd', 取样);
		try {
			await new (R().Battle)(3, [勇者], [D().Crocodile]).execute();
		} finally {
			R().events.off('battle:turnEnd', 取样);
		}

		assert.ok(勇者.hp < 40, `咬中并造成伤害（hp=${勇者.hp}；照录的 dmgBonus 6 参与其中）`);
		assert.ok(中途被擒, '改良抓握：战斗中确被鳄鱼擒住');
		assert.ok(中途被钉, '自动通路的下一回合：被钉住（pin :850）');
		assert.ok((勇者.nonlethal ?? 0) > 0, `钉住后以非致命伤害施压（pin :800；非致命 ${勇者.nonlethal}）`);
		assert.ok(!勇者.contains('grapple-hold'), '战斗结束后状态被清（battle:end 接线）');
		复位();
	});
})();
