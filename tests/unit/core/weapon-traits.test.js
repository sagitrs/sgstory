/* core/30-inventory 的武器特性消费点测试（#1736）：
 *   A) RPG.take / give 负数 —— 扣减语义（原子性、不足不动状态）
 *   B) stats.ammo —— 弹药要求（持弹则扣、不足则不执行且不消耗回合）
 *   C) RPG.throwItem —— 投掷后离包（SRD Thrown）
 *   D) 火器数据 —— 逐值对源（SRD 5.2.1 · equipment.md:429/437/1232）
 * 出处约定：`SRD 5.2.1 · <文件>:<行>`；数值可核见仓根 README「规则来源」pin 表。
 */
(() => {
	const R = () => setup.RPG;
	const inv = () => State.variables.inventory;
	const snapshot = () => JSON.stringify(inv());

	/* ---------- A) RPG.take / give 负数 ---------- */

	test('inventory：give 负数=消耗；同 id 叠加（charges 合并）', () => {
		R().give('bandage'); R().give('bandage'); // 2+2 = 4
		assert.eq(inv()[0].charges, 4);
		assert.eq(R().give('bandage', -1), true, '扣 1 成功');
		assert.eq(inv()[0].charges, 3, '剩余次数 -= 1');
		assert.eq(R().give('bandage', -3), true, '扣 3 成功');
		assert.eq(R().has('bandage'), false, '用尽即移除槽（不留 charges=0 残槽）');
	});

	test('inventory：give 负数【不足】⇒ false 且状态逐字节不变（原子性）', () => {
		R().give('bandage'); // charges 2
		const before = snapshot();
		assert.eq(R().give('bandage', -5), false, '不足 ⇒ 失败');
		assert.eq(snapshot(), before, '失败时不改变状态（不做部分扣减）');
	});

	test('inventory：take 非堆叠道具按件扣；n≤0 ⇒ false', () => {
		R().give('dagger'); R().give('dagger'); // 非堆叠 ⇒ 两个槽
		assert.eq(inv().filter((s) => s.id === 'dagger').length, 2);
		assert.eq(R().take('dagger', 1), true);
		assert.eq(inv().filter((s) => s.id === 'dagger').length, 1, '扣掉一槽');
		assert.eq(R().take('dagger', 0), false, 'n=0 ⇒ false');
		assert.eq(R().take('dagger', -1), false, 'n<0 ⇒ false');
	});

	test('inventory：give 正数路径不受影响（回归锚：新增槽 ＋ 合并槽 两条路径）', () => {
		R().give('bandage', 3); // 无既有槽 ⇒ 推送 3 个槽（每袋 charges=2）
		assert.eq(inv().filter((s) => s.id === 'bandage').length, 3, '无槽时逐个推送');
		R().give('bandage'); // 已有槽 ⇒ 合并进首个槽
		assert.eq(inv().filter((s) => s.id === 'bandage').length, 3, '有槽时不新增');
		const total = inv().filter((s) => s.id === 'bandage').reduce((a, s) => a + s.charges, 0);
		assert.eq(total, 8, '3×2 + 2 = 8（叠加语义未被 take 影响）');
	});

	/* ---------- B) stats.ammo ---------- */

	/** 造一把需要弹药的测试武器（规格与火器同形；不依赖具体包） */
	const defTestGun = () => R().defItem({
		id: 'unit-gun', name: '测试枪', weapon: true, slot: 'weapon', charges: null, stackable: false,
		stats: { dmg: '1d6', type: 'piercing', ranged: true, ammo: { id: 'unit-bullet' } },
		actions: { equip: R().slotEquip, unequip: R().slotUnequip },
		used() { this.perform('砰！'); },
	});

	test('inventory：ammo——持弹则每次 use 扣 1 发，且道具本身不被消耗', () => {
		defTestGun();
		R().defItem({ id: 'unit-bullet', name: '测试弹', charges: 3, stackable: true, used() {} });
		R().give('unit-gun'); R().give('unit-bullet'); // 一袋 3 发
		assert.eq(inv().find((s) => s.id === 'unit-bullet').charges, 3);
		assert.eq(R().useItem('unit-gun'), true, '第 1 发');
		assert.eq(inv().find((s) => s.id === 'unit-bullet').charges, 2);
		R().useItem('unit-gun');
		assert.eq(inv().find((s) => s.id === 'unit-bullet').charges, 1);
		assert.ok(R().has('unit-gun'), '武器仍在（ammo 不消耗武器）');
	});

	test('inventory：ammo【不足】⇒ useItem=false、不发 item:used、不消耗武器充能', () => {
		defTestGun();
		R().defItem({ id: 'unit-bullet', name: '测试弹', charges: 1, stackable: true, used() {} });
		R().give('unit-gun'); R().give('unit-bullet');
		R().useItem('unit-gun'); // 用掉唯一 1 发
		assert.eq(R().has('unit-bullet'), false, '子弹耗尽');
		let fired = 0;
		const off = R().events.on('item:used', () => { fired += 1; });
		try {
			const before = snapshot();
			assert.eq(R().useItem('unit-gun'), false, '无弹药 ⇒ 打不出去');
			assert.eq(snapshot(), before, '状态不变（不消耗回合的语义基座）');
			assert.eq(fired, 0, '不发 item:used（回合未被消耗）');
		} finally { off(); }
		R().useItem('unit-gun'); // 再试一次仍应失败（不会因为重试而成功）
		assert.eq(fired, 0);
	});

	/* ---------- C) RPG.throwItem ---------- */

	test('inventory：投掷 ⇒ 执行攻击后【离包】（SRD Thrown，equipment.md:84）', () => {
		R().give('dagger');
		assert.ok(R().has('dagger'));
		const target = { name: '靶', hp: 20, maxHp: 20, stats: { ac: -999 }, noDodge: true };
		R().useItem('dagger', target, { name: '投手', stats: { str: 10, dex: 10 } }, 'throw');
		assert.eq(R().has('dagger'), false, '掷出后离开背包');
		assert.ok(target.hp < 20, '攻击确实执行了（先掷后离手）');
	});

	test('inventory：投掷动作与 equip/unequip 同构（defItem actions 表可声明）', () => {
		assert.eq(typeof new (setup.DND5E.Dagger)().constructor.handlers.throw, 'function',
			'匕首声明了 throw 动作 ⇒ thrown 不再是死键');
	});

	/* ---------- D) 火器数据对源 ---------- */

	/* 出处：SRD 5.2.1 · equipment.md:429-434（Musket 1d12 Piercing, 500 GP, 10 lb.） */
	test('inventory：无 Thrown 特性的武器 ⇒ 拒绝投掷（解析点真实读取）', () => {
		/* 用**本用例私有 id**，避免跨用例共享 State/注册表造成假绿（#1736 自纠） */
		R().defItem({
			id: 'unit-nothrow', name: '非投掷棒', weapon: true, slot: 'weapon', charges: null, stackable: false,
			stats: { dmg: '1d4', type: 'bludgeoning' }, // 刻意无 thrown
			actions: { equip: R().slotEquip, unequip: R().slotUnequip, throw: R().throwItem },
			used() { this.perform('击中了。'); },
		});
		R().give('unit-nothrow');
		R().equip('unit-nothrow'); // 先装备 ⇒ 消除拔出检查的影响
		const target = { name: '靶', hp: 20, maxHp: 20, stats: { ac: -999 }, noDodge: true };
		R().useItem('unit-nothrow', target, { name: '投手', stats: { str: 10 } }, 'throw');
		assert.ok(R().has('unit-nothrow'), '未掷出（拒绝生效）——若删掉 stats.thrown 解析点则本断言变红');
		assert.eq(target.hp, 20, '未执行攻击');
	});
	test('5e items：火枪 1d12 穿刺 / 500 GP / 需弹药（Ammunition）', () => {
		const m = new (setup.DND5E.Musket)();
		assert.eq(m.stats.dmg, '1d12');
		assert.eq(m.stats.type, 'piercing');
		assert.eq(m.stats.cost, 500);
		assert.eq(m.stats.weight, 10);
		assert.eq(m.stats.ranged, true, '远程武器');
		assert.eq(m.stats.ammo.id, 'bullets-firearm', 'Ammunition（equipment.md:431）');
	});

	/* 出处：SRD 5.2.1 · equipment.md:437-442（Pistol 1d10 Piercing, 250 GP, 3 lb.） */
	test('5e items：手枪 1d10 穿刺 / 250 GP / 需弹药', () => {
		const p = new (setup.DND5E.Pistol)();
		assert.eq(p.stats.dmg, '1d10');
		assert.eq(p.stats.type, 'piercing');
		assert.eq(p.stats.cost, 250);
		assert.eq(p.stats.weight, 3);
		assert.eq(p.stats.ammo.id, 'bullets-firearm');
	});

	/* 出处：SRD 5.2.1 · equipment.md:1232-1236（Bullets, Firearm 10 | Pouch | 2 lb. | 3 GP） */
	test('5e items：火器子弹 一袋 10 发 / 3 GP / 2 lb.', () => {
		const b = new (setup.DND5E.BulletsFirearm)();
		assert.eq(b.charges, 10);
		assert.eq(b.stats.cost, 3);
		assert.eq(b.stats.weight, 2);
		assert.eq(b.slot, null, '弹药不可装备');
		assert.eq(b.stackable, true, '成袋可叠加');
	});

	test('5e items：火枪/手枪 的 ammo.id 指向实际注册的弹药（无悬空 id）', () => {
		for (const id of ['bullets-firearm']) {
			assert.ok(setup.RPG.items.has(id), `弹药 ${id} 已注册`);
		}
		assert.eq(R().createItem('bullets-firearm').name, '火器子弹');
	});
	test('inventory：ammo id 未注册（数据拼写错）⇒ 可读提示而非抛错', () => {
		R().defItem({ id: 'unit-badgun', name: '坏枪', weapon: true, slot: 'weapon', charges: null, stackable: false,
			stats: { dmg: '1d6', ranged: true, ammo: { id: 'unit-no-such-ammo' } },
			used() { this.perform('砰'); } });
		R().give('unit-badgun');
		let threw = null;
		let r = null;
		try { r = R().useItem('unit-badgun'); } catch (e) { threw = e.message; }
		assert.eq(threw, null, '不抛错（战斗中途不应因数据拼写错而崩）');
		assert.eq(r, false, '按「无弹药」处理 ⇒ false');
	});

	test('inventory：无 ammo 声明的武器不受弹药面影响（零回归）', () => {
		R().give('club');
		const target = { name: '靶', hp: 20, maxHp: 20, stats: { ac: -999 }, noDodge: true };
		assert.eq(R().useItem('club', target, { name: '打手', stats: { str: 12 } }), true, '无 ammo ⇒ 正常使用');
		assert.ok(target.hp < 20, '伤害已施加');
	});
})();
