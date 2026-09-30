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

	test('inventory：give/take 的 n 必须为整数（小数会污染 charges，须显式拒绝）', () => {
		/* T 席 NIT（tester-4）：原实现 `take('bandage', 0.5)` ⇒ `slot.charges -= 0.5` ⇒ charges 变 1.5
		 *   （小数进入存档面）。守卫取「显式抛错」而非静默取整：调用方传小数是**编程错误**，
		 *   静默取整会掩盖它（与 defEffect/defPipeline 的「坏输入 fail loud」同形）。 */
		R().give('bandage'); // charges = 2
		let e1 = null;
		try { R().take('bandage', 0.5); } catch (e) { e1 = e.message; }
		assert.ok(e1, 'take 收到小数 ⇒ 抛错（不静默继续）');
		assert.eq(inv().find((s) => s.id === 'bandage').charges, 2, 'charges 未被小数污染');
		let e2 = null;
		try { R().give('bandage', 0.5); } catch (e) { e2 = e.message; }
		assert.ok(e2, 'give 收到小数 ⇒ 抛错');
		assert.eq(inv().find((s) => s.id === 'bandage').charges, 2, 'charges 仍为整数');
		assert.eq(R().give('bandage', -1), true, '整数路径不受影响');
		assert.eq(inv().find((s) => s.id === 'bandage').charges, 1);
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

	test('inventory：ammo【不足】⇒ 攻击**不得执行**（目标 HP 不变）——钉住「检查先于动作」的顺序', () => {
		/* T 席 NIT（tester-4）：现有断言（返回值 false / 无 item:used / 状态不变）**不蕴含**「未开火」——
		 *   `item.used` 内部抛错或短路也能满足它们。只有**目标状态**能直接钉住顺序不变量。
		 *   判别性：把弹药检查块下移到 item.used(...) 之后（=「先开火再看有没有弹」），本用例必红。 */
		R().defItem({
			id: 'unit-gun2', name: '测试枪2', weapon: true, slot: 'weapon', charges: null, stackable: false,
			stats: { dmg: '1d6', type: 'piercing', ranged: true, ammo: { id: 'unit-bullet2' } },
			actions: { equip: R().slotEquip, unequip: R().slotUnequip },
			used(that) { that.hp -= 7; this.perform('砰！'); }, // 可观测副作用：目标掉血
		});
		R().defItem({ id: 'unit-bullet2', name: '测试弹2', charges: 1, stackable: true, used() {} });
		R().give('unit-gun2'); R().give('unit-bullet2');
		const target = { name: '靶', hp: 20, maxHp: 20, stats: { ac: -999 }, noDodge: true };
		assert.eq(R().useItem('unit-gun2', target, { name: '射手', stats: { dex: 12 } }), true, '有弹药 ⇒ 正常开火');
		assert.eq(target.hp, 13, '首次开火造成伤害（7）');
		assert.eq(R().has('unit-bullet2'), false, '弹药已耗尽');
		const hpBefore = target.hp;
		assert.eq(R().useItem('unit-gun2', target, { name: '射手', stats: { dex: 12 } }), false, '无弹药 ⇒ 返回 false');
		assert.eq(target.hp, hpBefore, '⚠ 目标不得受伤（攻击未执行）——本条才是「检查先于动作」的钉住点');
	});
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
/* ===== #1765：弹药面必须**在真战斗里生效**（跨面验收，非仅 useItem 面） =====
 * 发现经过：`#1736` 的 13 例全部经 `RPG.useItem` ⇒ 无一例覆盖战斗通路，而战斗中两条通路
 *   （自动 `#attack` / 交互 `attacker.use`）**直调 `used`** ⇒ 弹药检查被绕过（实测零弹 5 回合 125 伤害）。
 * 本组即把当时的**端到端探针**收进在册用例（tester-4 的 e2e④）。 */

test('ammo【跨面】真 Battle：零弹药 ⇒ 目标 HP 不变（e2e④ 探针收入在册）', () => {
	const D5 = setup.DND5E;
	R().rng.set(() => 0.99); // 恒 20 ⇒ 若开火必中
	R().give('musket'); R().equip('musket');
	assert.eq(R().has('bullets-firearm'), false, '前置：刻意不给弹药');
	const foe = new (R().Character)({ name: '靶', hp: 200, maxHp: 200, stats: D5.stats({ ac: 5 }) });
	const b = new (R().Battle)(5, [D5.Player], [foe], false);
	b.perform = () => {};
	b.execute();
	assert.eq(foe.hp, 200, '零弹药 ⇒ 5 回合均未开火（HP 不变）');
});

test('ammo【跨面】真 Battle：有弹药 ⇒ 每回合**恰扣 1 发**（防双扣）', () => {
	const D5 = setup.DND5E;
	for (const rounds of [1, 2, 3]) {
		State.variables = {}; // 逐轮独立
		R().rng.set(() => 0.99);
		R().give('bullets-firearm'); R().give('musket'); R().equip('musket');
		const foe = new (R().Character)({ name: '靶', hp: 9999, maxHp: 9999, stats: D5.stats({ ac: -999 }) });
		const b = new (R().Battle)(rounds, [D5.Player], [foe], false);
		b.perform = () => {};
		b.execute();
		const left = State.variables.inventory.find((s) => s.id === 'bullets-firearm')?.charges ?? 0;
		assert.eq(10 - left, rounds, `${rounds} 回合 ⇒ 恰扣 ${rounds} 发（入口层与 attack 层不得双扣）`);
		assert.ok(foe.hp < 9999, '确实开火了');
	}
});

test('ammo【跨面】残余直调 used 的路径仍被 attack 层兜住（纵深防御）', () => {
	const D5 = setup.DND5E;
	/* 用**本用例私有 id**（跨用例 State 共享，复用 `musket`/`bullets-firearm` 会被前序用例的
	 *   give/take 状态干扰 ⇒ 断言不稳；私有 id 隔离后测的才是本条不变量）。 */
	R().defItem({ id: 'unit-dr-gun', name: '兜底枪', weapon: true, slot: 'weapon', charges: null, stackable: false,
		stats: { dmg: '1d6', type: 'piercing', ranged: true, ammo: { id: 'unit-dr-bullet' } },
		actions: { equip: R().slotEquip, unequip: R().slotUnequip },
		used(that, from) { D5.attack(this, that, from); } });
	R().defItem({ id: 'unit-dr-bullet', name: '兜底弹', charges: 3, stackable: true, used() {} });
	R().rng.set(() => 0.99);
	R().give('unit-dr-gun'); R().give('unit-dr-bullet'); R().equip('unit-dr-gun');
	const shooter = D5.Player;
	const foe = new (R().Character)({ name: '靶', hp: 9999, maxHp: 9999, stats: D5.stats({ ac: -999 }) });
	const gun = R().reviveItem(State.variables.inventory.find((s) => s.id === 'unit-dr-gun'));
	const before = State.variables.inventory.find((s) => s.id === 'unit-dr-bullet').charges;
	gun.used(foe, shooter); // ★ 绕过 act：模拟未来的第三条通路
	const after = State.variables.inventory.find((s) => s.id === 'unit-dr-bullet').charges;
	assert.eq(before - after, 1, '经 attack 层兜底扣 1 发（纵深防御生效）');
	assert.ok(foe.hp < 9999, '且攻击确实发生');
});

test('ammo【跨面·回归】act 之后直调 attack 仍逐发扣减（标记不得残留）', () => {
	const D5 = setup.DND5E;
	/* ★ 本条钉住一个**真实回归**（tester-4 的 P7/P9）：首版用「以道具 id 为键的全局标记」且
	 *   `act` 无 `finally` ⇒ 标记**永久残留** ⇒ 同型武器此后任何直调 `attack` 都跳过扣弹，
	 *   `#1765` 原症状换触发条件复活（act 开 1 枪后直调 5 次，子弹仍为 8、扣 0 发）。
	 *   键改为**实例级瞬时字段** + **真 finally** 后隔离。(甲) 裁定：动作作用域传递。 */
	R().defItem({ id: 'unit-leak-gun', name: '泄漏枪', weapon: true, slot: 'weapon', charges: null, stackable: false,
		stats: { dmg: '1d6', type: 'piercing', ranged: true, ammo: { id: 'unit-leak-bullet' } },
		actions: { equip: R().slotEquip, unequip: R().slotUnequip },
		used(that, from) { D5.attack(this, that, from); } });
	R().defItem({ id: 'unit-leak-bullet', name: '泄漏弹', charges: 10, stackable: true, used() {} });
	R().rng.set(() => 0.99);
	R().give('unit-leak-gun'); R().give('unit-leak-bullet'); R().equip('unit-leak-gun');
	const foe = new (R().Character)({ name: '靶', hp: 9999, maxHp: 9999, stats: D5.stats({ ac: -999 }) });
	const shooter = D5.Player;
	R().useItem('unit-leak-gun', foe); // 经 act 开 1 枪（此处曾留下永久标记）
	const t1 = State.variables.inventory.find((s) => s.id === 'unit-leak-bullet').charges;
	for (let i = 0; i < 5; i++) {
		R().reviveItem(State.variables.inventory.find((s) => s.id === 'unit-leak-gun')).used(foe, shooter);
	}
	const t2 = State.variables.inventory.find((s) => s.id === 'unit-leak-bullet').charges;
	assert.eq(t1 - t2, 5, 'act 之后直调 5 次 ⇒ 仍扣 5 发（标记不得残留、纵深防御未被架空）');
});

test('ammo【跨面·回归】同实例复用（actor.items 持实例）⇒ finally 必须清标记', () => {
	const D5 = setup.DND5E;
	/* ★ 本条钉住 `finally` 本身。上一条用例走**快照**路径：`reviveItem` 每次新建实例，
	 *   即使不清标记也不会溢出 ⇒ 撤掉 `finally` 仍绿（实测）。**真正需要 `finally` 的是
	 *   「`actor.items` 里直接放实例」** —— `reviveItem` 见实例即原样返回 ⇒ 标记会跨动作持续，
	 *   若不清除，`act` 之后的直调 `attack` 一律被跳过（实测撤掉 `finally` ⇒ 扣 0 发）。 */
	R().defItem({ id: 'unit-fin-gun', name: '实例枪', weapon: true, slot: 'weapon', charges: null, stackable: false,
		stats: { dmg: '1d6', type: 'piercing', ranged: true, ammo: { id: 'unit-fin-bullet' } },
		actions: { equip: R().slotEquip, unequip: R().slotUnequip },
		used(that, from) { D5.attack(this, that, from); } });
	R().defItem({ id: 'unit-fin-bullet', name: '实例弹', charges: 10, stackable: true, used() {} });
	R().rng.set(() => 0.99);
	const bullets = R().createItem('unit-fin-bullet'); bullets.charges = 10;
	const gun = R().createItem('unit-fin-gun'); gun.equipped = true;
	const foe = new (R().Character)({ name: '靶', hp: 9999, maxHp: 9999, stats: D5.stats({ ac: -999 }) });
	const actor = new (R().Character)({ name: '甲', hp: 60, maxHp: 60, items: [gun, bullets], stats: D5.stats({ str: 12, dex: 12, prof: 2 }) });
	R().act(actor, gun, foe);
	assert.eq(bullets.charges, 9, 'act 开 1 枪 ⇒ 扣 1 发');
	assert.eq(gun.__ammoPaid, undefined, 'act 返回后标记须已清除（finally 生效）');
	gun.used(foe, actor); // ★ 同一实例直调：只有 finally 生效才不会跳过扣弹
	assert.eq(bullets.charges, 8, '同实例再直调 ⇒ 仍扣 1 发（标记未残留）');
});


test('ammo【跨面·回归】无 from 直调 ⇒ 扣在持有者，✗ 不得从受击者扣（D 缺陷 2）', () => {
	const D5 = setup.DND5E;
	/* ★ 钉住 developer 的缺陷 2：兜底扣减原写 `from ?? that` ⇒ 直调 `used(foe)`（无 from）时
	 *   **从受击者扣弹**（实测：射手 10→10、靶 10→9）—— 与「兜底应保证攻击者付费」相反。
	 *   修后归属顺序：① 显式 `from` → ② 受击者恰是持有者 → ③ 注册表持有者（实例／按 id）→ ④ 不扣。 */
	R().defItem({ id: 'unit-own-gun', name: '归属枪', weapon: true, slot: 'weapon', charges: null, stackable: false,
		stats: { dmg: '1d6', type: 'piercing', ranged: true, ammo: { id: 'unit-own-bullet' } },
		actions: { equip: R().slotEquip, unequip: R().slotUnequip },
		used(that, from) { D5.attack(this, that, from); } });
	R().defItem({ id: 'unit-own-bullet', name: '归属弹', charges: 10, stackable: true, used() {} });
	R().rng.set(() => 0.99);
	R().give('unit-own-gun'); R().give('unit-own-bullet'); R().equip('unit-own-gun');
	const shooter = D5.Player;
	/* 受击者**自己带 10 发同名弹药** —— 旧版正是扣到这里 */
	const foe = new (R().Character)({ name: '靶', hp: 9999, maxHp: 9999,
		items: [{ id: 'unit-own-bullet', charges: 10 }], stats: D5.stats({ ac: -999 }) });
	const gun = R().reviveItem(State.variables.inventory.find((s) => s.id === 'unit-own-gun'));
	const shooterBefore = State.variables.inventory.find((s) => s.id === 'unit-own-bullet').charges;
	const foeBefore = foe.items[0].charges;
	gun.used(foe); // ★ 直调，无 from
	const shooterAfter = State.variables.inventory.find((s) => s.id === 'unit-own-bullet').charges;
	assert.eq(foe.items[0].charges, foeBefore, '✗ 不得从受击者扣弹（旧版此处 10 → 9）');
	assert.eq(shooterBefore - shooterAfter, 1, '扣在持有者（射手）身上');
	assert.ok(foe.hp < 9999, '攻击确实发生');
});

test('ammo【跨面·回归】无人持有该武器 ⇒ 不扣弹、不开火（✗ 不回落受击者）', () => {
	const D5 = setup.DND5E;
	R().defItem({ id: 'unit-orphan-gun', name: '孤儿枪', weapon: true, slot: 'weapon', charges: null, stackable: false,
		stats: { dmg: '1d6', type: 'piercing', ranged: true, ammo: { id: 'unit-orphan-bullet' } },
		used(that, from) { D5.attack(this, that, from); } });
	R().defItem({ id: 'unit-orphan-bullet', name: '孤儿弹', charges: 5, stackable: true, used() {} });
	R().rng.set(() => 0.99);
	State.variables = {}; // 玩家背包清空 ⇒ 该枪无人持有
	const gun = R().createItem('unit-orphan-gun'); gun.equipped = true;
	const foe = new (R().Character)({ name: '靶', hp: 9999, maxHp: 9999,
		items: [{ id: 'unit-orphan-bullet', charges: 5 }], stats: D5.stats({ ac: -999 }) });
	const hp0 = foe.hp;
	gun.used(foe); // 无 from、无持有者
	assert.eq(foe.hp, hp0, '无法判定付款人 ⇒ 不开火');
	assert.eq(foe.items[0].charges, 5, '✗ 不得从受击者扣弹');
	assert.eq(R().has('unit-orphan-bullet'), false, '玩家也没被扣');
});


test('ammo【跨面·回归】受击者持**同型武器** ⇒ 扣射手、靶不动（tester-4 形态）', () => {
	const D5 = setup.DND5E;
	/* ★ 钉住 `tester-4` 的另一形态：归属解析若把**受击者**当候选并按其持有的道具 **id** 判归属，
	 *   则「受击者恰好也持一把同型枪」时会被误判为持有者 ⇒ 仍从靶扣弹
	 *   （实测射手 10→10、靶 10→9 —— **原症状换形存活**）。
	 *   正确归属只看**实例恒等**与**注册表按 id**；受击者不是候选 ⇒ 命中注册表里的射手。 */
	R().defItem({ id: 'unit-same-gun', name: '同型枪', weapon: true, slot: 'weapon', charges: null, stackable: false,
		stats: { dmg: '1d6', type: 'piercing', ranged: true, ammo: { id: 'unit-same-bullet' } },
		actions: { equip: R().slotEquip, unequip: R().slotUnequip },
		used(that, from) { D5.attack(this, that, from); } });
	R().defItem({ id: 'unit-same-bullet', name: '同型弹', charges: 10, stackable: true, used() {} });
	R().rng.set(() => 0.99);
	R().give('unit-same-gun'); R().give('unit-same-bullet'); R().equip('unit-same-gun');
	/* 受击者**持同型武器**（同 id）＋自备弹药 —— 旧版正是按武器 id 误判到这里 */
	const foe = new (R().Character)({ name: '靶', hp: 9999, maxHp: 9999,
		items: [{ id: 'unit-same-gun', equipped: true }, { id: 'unit-same-bullet', charges: 10 }],
		stats: D5.stats({ ac: -999 }) });
	const gun = R().reviveItem(State.variables.inventory.find((s) => s.id === 'unit-same-gun'));
	const shooterBefore = State.variables.inventory.find((s) => s.id === 'unit-same-bullet').charges;
	const foeBefore = foe.items.find((s) => s.id === 'unit-same-bullet').charges;
	gun.used(foe); // ★ 直调，无 from；受击者持同型武器
	const shooterAfter = State.variables.inventory.find((s) => s.id === 'unit-same-bullet').charges;
	assert.eq(foe.items.find((s) => s.id === 'unit-same-bullet').charges, foeBefore,
		'✗ 不得因受击者持同型武器而误扣到靶（旧版此处 10 → 9）');
	assert.eq(shooterBefore - shooterAfter, 1, '扣在持有者（射手）身上');
	assert.ok(foe.hp < 9999, '攻击确实发生');
});

})();
