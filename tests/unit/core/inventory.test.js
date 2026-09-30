/* core/30-inventory 的单元测试：give/has、装备槽（互斥/共存）、充能、战利品 */
(() => {
	const R = () => setup.RPG;

	test('inventory：give/has 与充能合并', () => {
		R().give('bandage');
		R().give('bandage'); // 2+2
		assert.ok(R().has('bandage'));
		assert.eq(State.variables.inventory[0].charges, 4, '同 id 合并次数');
	});

	test('inventory：同槽互斥——已有武器时 equip 动作失败（不自动换手）', () => {
		R().defItem({
			id: 'unit-knife', name: '小刀', weapon: true, slot: 'weapon', used() {},
			actions: { equip: R().slotEquip, unequip: R().slotUnequip },
		});
		R().give('club'); R().equip('club');
		R().give('unit-knife'); R().equip('unit-knife');
		assert.ok(R().isEquipped('club'), '木棒保持装备');
		assert.eq(State.variables.inventory.find((s) => s.id === 'unit-knife').equipped, false, '小刀未装备');
		R().unequip('club');
		R().equip('unit-knife');
		assert.ok(R().isEquipped('unit-knife'), '腾手后可装备');
	});

	test('inventory：异槽共存——武器/身体/脚可同时装备', () => {
		R().give('club'); R().equip('club');       // weapon
		R().give('mail'); R().equip('mail');       // body
		R().give('boots'); R().equip('boots');     // feet
		assert.ok(R().isEquipped('club') && R().isEquipped('mail') && R().isEquipped('boots'));
		assert.eq(R().equippedIn('weapon').id, 'club');
		assert.eq(R().equippedIn('body').id, 'mail');
		assert.eq(R().equippedIn('feet').id, 'boots');
	});

	test('inventory：身体槽互斥——布衣与铁环甲不能同穿', () => {
		R().give('tunic'); R().equip('tunic');
		R().give('mail'); R().equip('mail'); // 同槽 → 失败
		assert.ok(R().isEquipped('tunic'), '布衣保持装备');
		assert.ok(!R().isEquipped('mail'), '铁环甲未装备');
		R().unequip('tunic');
		R().equip('mail');
		assert.ok(R().isEquipped('mail'), '脱下布衣后可穿甲');
	});

	test('inventory：useItem 只有 use 动作消耗充能', () => {
		R().give('bandage');
		R().useItem('bandage', { name: 'X', hp: 0, maxHp: 9 }, null); // use：5 治疗
		assert.eq(State.variables.inventory[0].charges, 1, 'use 扣 1 次');
		R().useItem('bandage', null, null, 'equip'); // 绷带无 equip 动作
		assert.eq(State.variables.inventory[0].charges, 1, '非 use 不扣');
	});

	test('inventory：loot 只转移未装备的道具', () => {
		const victim = new (R().Character)({
			name: '戊', items: [{ id: 'club', equipped: true }, { id: 'coin' }],
		});
		R().loot(victim);
		assert.ok(R().has('coin'), '掉落硬币');
		assert.ok(!R().has('club'), '装备不掉落');
		assert.eq(victim.items.length, 1, '装备留在尸体上');
	});
})();
