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

	/* ============ `#1906` 笔一：拒绝契约的**结果面**（C1／C2／C3）============
	 * 三格的共同口径：**拒绝走 `RPG.act` 的返回值**（✗ 抛出去）、**零副作用**、瞬时说明走**通知面**。
	 * ⚠ 契约面须用 `RPG.act`：`RPG.useItem` 那条壳把拒绝吞成 `false` ⇒ 读不到 `code`。 */
	const H = () => globalThis.__host;
	const D = () => setup.DND3;
	/** 干净前置：宿主输出归档归零 ＋ 空背包 ＋ 一个玩家角色（✗ 依赖上一用例的残留）。 */
	const 净 = () => {
		H().host.reset(); H().state.reset();
		State.variables.player = { name: '甲', hp: 20, maxHp: 20, stats: D().stats(), effects: [] };
		State.variables.inventory = [];
	};
	const 槽 = (id) => State.variables.inventory.find((s) => s.id === id);

	test('★`#1906` C1：拒绝 ⇒ `rejected/action-refused` 且**零副作用**（充能／装备态不动）', () => {
		净();
		const actor = R().playerActor();
		/* ① 结构化拒绝（`RPG.refuse`）的件 */
		R().give('rock', 3);
		const 前1 = 槽('rock').charges;
		const r1 = R().act(actor, 'rock', actor, 'use');
		assert.eq(r1.status, 'rejected', '误用须判拒绝');
		assert.eq(r1.reason, 'action-refused', '拒绝原因须是 action-refused');
		assert.eq(r1.code, 'MATERIAL_NOT_USABLE', '★`code` 须随**结果**返回（✗ 只活在异常里）');
		assert.eq(槽('rock').charges, 前1, `★拒绝却扣了件（${前1} ⇒ ${槽('rock').charges}）`);
		/* ② `used() return false` 的件（coin 是计数库存 ⇒ 读它的 charges） */
		R().give('coin');
		const 前2 = 槽('coin').charges;
		const r2 = R().act(actor, 'coin', actor, 'use');
		assert.eq(r2.status, 'rejected', 'coin 误用须判拒绝');
		assert.eq(槽('coin').charges, 前2, `★return false 的件也被扣（${前2} ⇒ ${槽('coin').charges}）`);
		/* ③ 装备态：**盾**（`ARMOR_NOT_USABLE` 那一支：`used()` 走 `RPG.refuse`）拒绝前后 `equipped` 不变。
		 *   ⚠ 别拿 `mail`／`boots`／`scale-mail` 作这臂 —— 那三件是**另一支**（提示 ＋ `return false`，无 code）；
		 *     两支的 code 有无不同，正是 C1 与 C3 各自要断的事。 */
		R().give('buckler');
		const r3 = R().act(actor, 'buckler', actor, 'use');
		assert.eq(r3.status, 'rejected', '防具误用须判拒绝');
		assert.eq(r3.code, 'ARMOR_NOT_USABLE', '盾的 code');
		assert.eq(槽('buckler').equipped, false, '★拒绝却改了装备态');
	});

	test('★`#1906` C2：拒绝的瞬时说明**只走通知面** ⇒ 正文行数不变（✗ 每点一次多一行）', () => {
		净();
		const actor = R().playerActor();
		R().give('boots');
		const 前段 = H().host.lines().length;
		const r = R().act(actor, 'boots', actor, 'use');
		assert.eq(r.status, 'rejected', '防具误用须判拒绝');
		assert.eq(H().host.lines().length, 前段,
			`★正文多了一行（${前段} ⇒ ${H().host.lines().length}）—— 瞬时说明该走通知面（同 coin 那件）`);
		assert.ok(R().notices({ limit: 5 }).some((n) => /穿上/.test(n.text)),
			'★通知面没有该句（那玩家就什么也看不到）');
		/* 对照臂：**结构化拒绝**的白话走 `perform` ⇒ **会**落正文 —— 证明本判据读得出两种通道的分别 */
		R().give('rock');
		const 段2 = H().host.lines().length;
		R().act(actor, 'rock', actor, 'use');
		assert.ok(H().host.lines().length > 段2,
			'对照臂：结构化拒绝的白话应落正文（✗ 则本判据分不开「通知面」与「正文面」）');
	});

	test('★`#1906` C3：B／C 五件**显式拒绝** —— `act` 判 `rejected`（✗ 走成 `applied`）', () => {
		净();
		const actor = R().playerActor();
		for (const id of ['iron-key', 'iron-message', 'boots', 'mail', 'scale-mail']) {
			R().give(id);
			const r = R().act(actor, id, actor, 'use');
			assert.eq(r.status, 'rejected', `「${id}」误用须判拒绝（✗ 走成 applied 会扣件／记使用）`);
			assert.eq(r.reason, 'action-refused', `「${id}」拒绝原因`);
			assert.ok(R().notices({ limit: 10 }).some((n) => n.text.length > 0), `「${id}」须有玩家面说明`);
		}
	});
})();
