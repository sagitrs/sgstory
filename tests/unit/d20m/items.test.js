/* d20m 道具的单元测试：自证件的数值面与槽位面
 * （断言只看状态与异常 —— 消息文本归 e2e，见 tests/README.md）
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.D20M;

	/* 出处：SRD d20M · source/1Modern现代/25msrdequipmentweaponsandarmor武器与盔甲.md:71（「Beretta 92F (9mm autoloader)」行） */
	test('d20m items：贝瑞塔 92F 的伤害面对齐 SRD d20M（DMG 2d6, CRIT 20, RANGE 40）', () => {
		const w = new (D().Beretta92F)();
		assert.eq(w.stats.dmg, '2d6', 'Damage 列');
		assert.eq(w.stats.critMin, 20, 'Critical 列（威胁 20）');
		assert.eq(w.stats.crit, 2, '威胁确认后伤害掷两次');
		assert.eq(w.stats.range, 40, 'Range Increment 列 40 ft');
		assert.eq(w.stats.type, 'ballistic', 'Damage Type 列（火器皆 ballistic）');
		assert.eq(w.stats.weight, 3, 'Weight 列 3 lb');
		assert.eq(w.slot, 'weapon', '武器槽');
		assert.ok(w.stats.ranged === true, '远程 ⇒ 攻击用灵巧');
		assert.ok(!('cost' in w.stats), '✗ 落 cost：Purchase DC→金数的映射属后续票');
	});

	/* 出处：SRD d20M · source/4Future未来/2FutureCybernetics.md:97（「Prosthetic Arm (PL 5)」；
	 * 逐行读数见 :99 Benefit／:100 Type External／:101 Hardness/Hit Points 3/5／:102 Base Purchase DC 17） */
	test('d20m items：义体·假臂的替换面（PL 5）', () => {
		const c = new (D().ProstheticArm)();
		assert.eq(c.stats.hardness, 3, 'Hardness 3');
		assert.eq(c.stats.hp, 5, 'Hit Points 5');
		assert.eq(c.slot, 'arms', '义体槽（槽名由规则包补，core 不认识）');
		assert.ok(!('ac_bonus' in c.stats), '源文 :99「no special game benefits」⇒ ✗ 造加值');
	});

	test('d20m items：槽位中文名由规则包补全', () => {
		assert.eq(R().slotLabels.weapon, '武器');
		assert.eq(R().slotLabels.arms, '臂');
	});

	test('d20m items：同槽互斥经既有装备动作生效', () => {
		R().defItem({ id: 'unit-d20m-arm-2', name: '试样臂甲', slot: 'arms', used() {},
			actions: { equip: R().slotEquip, unequip: R().slotUnequip } });
		R().give('prosthetic-arm');
		R().give('unit-d20m-arm-2');
		R().equip('prosthetic-arm');
		assert.ok(R().isEquipped('prosthetic-arm'), '第一件装上');
		R().equip('unit-d20m-arm-2'); // 同槽已有 ⇒ 应失败（不自动换装）
		assert.ok(!R().isEquipped('unit-d20m-arm-2'), '同槽第二件未装上');
		assert.eq(R().equippedIn('arms').id, 'prosthetic-arm', '槽内仍为第一件');
	});
})();
