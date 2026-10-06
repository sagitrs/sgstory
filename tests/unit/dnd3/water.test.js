/* dnd3/core/water 的单元测试：涉水状态与「御水」（Water Mastery）
 *
 * 出处：SRD 3.5 · `3.5 Compendium/Monsters/3.5 Monsters - E.md:370`
 *   （`Water Mastery (Ex)`：双方皆触水 ⇒ 攻击与伤害 +1；有一方只挨着非水地面 ⇒ −4）
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	const 复位 = () => {
		for (const m of [D().SmallWaterElemental, D().MediumWaterElemental]) {
			m.hp = m.maxHp; m.effects = ['water-mastery']; m.runtime = {}; m.nonlethal = 0;
		}
		D().SmallWaterElemental.items = [{ id: 'small-water-elemental-slam', equipped: true }];
		R().rng.reset();
	};

	test('dnd3 御水：三态——双方涉水 +1、有一方不涉水 −4、非御水者 0', () => {
		复位();
		const 水 = D().SmallWaterElemental;
		const 目标 = new (R().Character)({ name: '目标', stats: D().stats({}) });
		const 凡人 = new (R().Character)({ name: '凡人', stats: D().stats({}) });
		assert.eq(D().waterMasteryMod(水, 目标), -4, '双方都不涉水 ⇒ −4（原文「只挨着非水地面」）');
		D().setWater(水, true);
		assert.eq(D().waterMasteryMod(水, 目标), -4, '只有水元素涉水 ⇒ −4（要**双方都**触水才 +1）');
		D().setWater(目标, true);
		assert.eq(D().waterMasteryMod(水, 目标), 1, '双方皆触水 ⇒ +1');
		D().setWater(水, false);
		assert.eq(D().waterMasteryMod(水, 目标), -4, '退出水 ⇒ 回到 −4');
		assert.eq(D().waterMasteryMod(凡人, 目标), 0, '非御水者（凡人）恒 0');
		复位();
	});

	test('dnd3 御水：声明与撤销幂等（状态不重复、撤销后不再有）', () => {
		复位();
		const 水 = D().SmallWaterElemental;
		D().setWater(水, true); D().setWater(水, true);
		assert.eq(水.effects.filter((e) => e === 'in-water').length, 1, '涉水状态只一条');
		assert.ok(D().isInWater(水), '读面为真');
		D().setWater(水, false);
		assert.ok(!D().isInWater(水), '撤销后为假');
		复位();
	});

	test('dnd3 御水：meleeAttack 消费修正——涉水命中／干地挥空（两臂）', () => {
		复位();
		/* 小水元素 Slam 照录：atkBonus 4、dmgBonus 3（`3.5 Monsters - E.md:320` 的 Attack 行）。
		 * 固定随机源 ⇒ 每骰都掷 12（`0.55 × 20 = 11 ⇒ 12`；`0.55 × 6 = 3.3 ⇒ 4`）。
		 * 目标 AC 15：涉水时 12 ＋ 4 ＋ 1 ＝ 17 ⇒ 命中；干地时 12 ＋ 4 − 4 ＝ 12 ⇒ 挥空。 */
		R().rng.set(() => 0.55);
		const 目标 = new (R().Character)({ name: '靶子', hp: 20, maxHp: 20, stats: D().stats({ ac: 15 }) });
		const 水 = D().SmallWaterElemental;
		D().setWater(水, true); D().setWater(目标, true);
		D().meleeAttack(R().createItem('small-water-elemental-slam'), 目标, 水);
		assert.eq(目标.hp, 12, '涉水臂：命中且伤害＝1d6(4) ＋ 照录 3 ＋ 御水 1 ＝ 8 ⇒ 20 − 8');
		// 干地臂：同一掷、同一目标，只把水态撤掉
		D().setWater(水, false);
		D().meleeAttack(R().createItem('small-water-elemental-slam'), 目标, 水);
		assert.eq(目标.hp, 12, '干地臂：−4 使 12 对 AC 15 挥空 ⇒ hp 不变');
		复位();
	});

	test('dnd3 御水：非御水者不受涉水影响（反向用例）', () => {
		复位();
		R().rng.set(() => 0.55);   // 掷 12
		const 凡人 = new (R().Character)({ name: '凡人', hp: 20, maxHp: 20, stats: D().stats({ ac: 15, str: 4 }) });
		const 目标 = new (R().Character)({ name: '靶子', hp: 20, maxHp: 20, stats: D().stats({ ac: 15 }) });
		/* `atkBonus: 3` ⇒ 12 ＋ 3 ＝ 15 ≥ AC 15 ⇒ 命中；`dmg: '1'` ⇒ 恒定 1 点（御水若被误消费，伤害会变）。 */
		R().defItem({
			id: 'unit-test-club', name: '测试木棒', weapon: true, slot: 'weapon',
			stats: { dmg: '1', atkBonus: 3, dmgBonus: 0 },
			used(that, from) { return D().meleeAttack(this, that, from); },
			actions: { equip: R().slotEquip, unequip: R().slotUnequip },
		});
		D().setWater(凡人, true); D().setWater(目标, true);
		D().meleeAttack(R().createItem('unit-test-club'), 目标, 凡人);
		assert.eq(目标.hp, 19, '陆生攻击者：恰好 1 点（✗ 不得因涉水而 ±）');
		D().setWater(凡人, false);   // 同一掷、同一目标，只改攻击者的水态
		D().meleeAttack(R().createItem('unit-test-club'), 目标, 凡人);
		assert.eq(目标.hp, 18, '退出水后仍是 1 点 ⇒ 与第 5 对账：陆生攻击者两臂相同');
		复位();
	});
})();
