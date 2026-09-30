/* dnd-5e 道具的单元测试：SRD 数值验证、槽位系统
 * 注意：RPG.items 是共享注册表——dnd3 的同名道具会覆盖 5e 的。
 * 测试 5E 道具数值用 new DND5E.Xxx() 直接实例化。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND5E;

	test('5e items：木棒 1d4（5E SRD，非 3E 的 1d6）', () => {
		const club = new (D().Club)();
		assert.eq(club.stats.dmg, '1d4');
		assert.eq(club.slot, 'weapon');
	});

	test('5e items：匕首 1d4 + Finesse', () => {
		const dagger = new (D().Dagger)();
		assert.eq(dagger.stats.dmg, '1d4');
		assert.ok(dagger.stats.finesse, '有 Finesse 属性');
	});

	test('5e items：长剑 1d8 + Versatile', () => {
		const sword = new (D().Longsword)();
		assert.eq(sword.stats.dmg, '1d8');
		assert.ok(sword.stats.versatile, '有 Versatile 属性');
	});

	test('5e items：皮甲/链甲衫/环甲——三种护甲类型', () => {
		const leather = new (D().LeatherArmor)();
		const chain = new (D().ChainShirt)();
		const ring = new (D().RingMail)();
		assert.ok(leather.stats.armor.dex && leather.stats.armor.dexMax == null, '皮甲：轻甲');
		assert.ok(chain.stats.armor.dex && chain.stats.armor.dexMax === 2, '链甲衫：中甲');
		assert.ok(!ring.stats.armor.dex, '环甲：重甲');
	});

	test('5e items：装备槽位互斥/共存（与 dnd3 同规则）', () => {
		// 用 5e 道具 ID（注意：club/bandage 与 dnd3 共享，用不冲突的护甲测试）
		R().give('leather'); R().equip('leather');
		R().give('boots'); R().equip('boots');
		assert.ok(R().isEquipped('leather') && R().isEquipped('boots'), '身体/脚槽共存');
		R().give('chain-shirt'); R().equip('chain-shirt');
		assert.ok(!R().isEquipped('chain-shirt'), '同穿两件护甲被拒绝');
		assert.ok(R().isEquipped('leather'), '原护甲保持');
	});

	test('5e items：炸弹一次性', () => {
		// 炸弹 ID 'bomb' 与 dnd3 共享，用注册表里的版本
		// 给一发，用一发，验证消失
		const inv = State.variables.inventory;
		if (!inv) State.variables.inventory = [];
		State.variables.inventory.push({ id: 'bomb', charges: 1, equipped: false });
		assert.ok(R().has('bomb'));
		R().useItem('bomb', { name: '靶', hp: 10, maxHp: 10, stats: { ac: -999 } }, null);
		assert.ok(!R().has('bomb'), '用后消失');
	});
})();
