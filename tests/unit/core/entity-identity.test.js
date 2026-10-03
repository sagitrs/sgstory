/* **实体身份**（`entityId`）—— `sgstory#1924`（`#1905` 阶段 2「实例／身份」）
 *
 * 「**一个量一个名**」（`dev-10` 的形裁定）：实例的稳定身份叫 **`entityId`** —— 它就是 `#1914` 的
 *   `slotId`（值域／发号器／高水位**全同**），只是**改名**（名字与语域相配：实体在背包／手／装备／
 *   掉落都是同一件事）。**旧名 `slotId` 只在读取边界回落**（`reviveItem`／`保号`／`act` 的入参），
 *   ✗ 不写回落成数据 ⇒ 将来收口＝删那几处回落（✗ 不是全仓找引用）。
 *
 * 本笔补三件：①快照与实例都带 `entityId`；②`act()`／`commit()` 按**实体身份**取并写回**那一件**
 *   （✗ 只按 `id` 取第一件 —— `#1905` 点名的「两件同类 [2,9] 选第二件扣第一件」）；
 *   ③旧档补发（幂等，`RPG.backfillItemIdentity()`）。
 *
 * 端到端口径见 `tests/e2e/old-house/run-baseline.mjs` 的 `[identity]` 三格（`tester-4` 的 `#1927`）。
 */
(() => {
	const R = () => setup.RPG;
	const inv = () => State.variables.inventory;
	/** 清空背包并**重建玩家角色的背包桥接**（理由见 `dnd3/resources.test.js` 的 `clean`）。 */
	const clean = () => {
		State.variables = { inventory: [] };
		for (const c of R().characters.values()) {
			if (Array.isArray(c.items) && (c.properties ?? []).includes('player')) c.items = State.variables.inventory;
		}
	};
	const 桩靶 = () => ({ id: 'stub-target', name: '桩靶', hp: 9999, maxHp: 9999, isDown: false, items: [] });
	const 件数 = (id) => inv().filter((s) => s.id === id).length;

	test('identity：实例与快照带 `entityId`，两件同类**各自不同**，且✗ 不写旧名 `slotId`', () => {
		clean();
		R().give('club');
		R().give('club');
		const [a, b] = inv();
		assert.ok(typeof a.entityId === 'string' && a.entityId !== '',
			`★快照没有实体身份（实得 ${JSON.stringify(a.entityId)}）—— 身份未在位`);
		assert.ok(a.entityId !== b.entityId,
			`★两件同类被给了同一个身份（都是 ${a.entityId}）⇒ 分不出「哪一件」`);
		assert.ok(a.slotId === undefined,
			`★新数据里又出现了旧名 \`slotId\`（${a.slotId}）—— 一个量一个名，旧名只在读回落`);
		const 实例 = R().createItem('club');
		assert.ok(typeof 实例.entityId === 'string' && 实例.entityId !== '', '实例出生即带实体身份');
		assert.ok(实例.slotId === undefined, '活对象上也只叫新名');
	});

	test('★identity：`act()` 按实体身份取那一件（[2,9] 选第二件 ⇒ 扣第二件）', () => {
		clean();
		R().give('club');
		R().give('club');
		const [a, b] = inv();
		a.charges = 2;
		b.charges = 9;
		const r = R().act(R().playerActor(), b, 桩靶(), 'use');       // ★传**第二件的快照**
		assert.eq(r?.status, 'applied', `前置：本件须能落地（实得 ${r?.status}）`);
		const 后 = inv().filter((s) => s.id === 'club').map((s) => s.charges);
		assert.eq(JSON.stringify(后), JSON.stringify([2, 8]),
			`★选第二件须扣**第二件**（实得 ${JSON.stringify(后)}，应 [2,8]）—— 只按 id 取会扣到第一件`);
		assert.eq(r?.item?.entityId, b.entityId, '结果里的件就是被选的那一件（身份可对账）');
		/* 反例臂：传**第一件** ⇒ 扣第一件（✗ 不是「怎么传都扣第二件」） */
		a.charges = 2;
		b.charges = 9;
		R().act(R().playerActor(), a, 桩靶(), 'use');
		assert.eq(JSON.stringify(inv().filter((s) => s.id === 'club').map((s) => s.charges)),
			JSON.stringify([1, 9]), '传第一件 ⇒ 扣第一件');
	});

	test('identity：传**没有身份**的对象 ⇒ 按 `id` 取（既有调用形不变，具名一格）', () => {
		clean();
		R().give('club');
		inv()[0].charges = 3;
		const r = R().act(R().playerActor(), { id: 'club' }, 桩靶(), 'use');     // 只带 id（临时实例/桩）
		assert.eq(r?.status, 'applied', `无身份的对象仍须按 id 落地（实得 ${r?.status}）`);
		assert.eq(inv()[0].charges, 2, '无身份 ⇒ 按 id 取（✗ 不得因为「没有身份」而拒绝）');
	});

	test('★identity：身份**在场但已不在包里** ⇒ 具名拒绝 `item-gone`（✗ 静默取第一件）', () => {
		clean();
		R().give('club');
		R().give('club');
		const [a, b] = inv();
		a.charges = 2;
		const 号 = b.entityId;
		inv().splice(1, 1);                                    // 第二件已经不在身上了
		const 前 = JSON.stringify(inv());
		const r = R().act(R().playerActor(), { id: 'club', entityId: 号 }, 桩靶(), 'use');
		assert.eq(r?.status, 'rejected', `★身份找不到时须拒绝（实得 ${r?.status}）`);
		assert.eq(r?.reason, 'item-gone',
			`★理由须**具名**（实得 ${JSON.stringify(r?.reason)}）—— ✗ 不许静默退回「取第一件」，`
			+ '那正是冒烟锚测到的「传第一件与传第二件返回逐字相同」');
		assert.eq(JSON.stringify(inv()), 前, '★拒绝路径零副作用（第一件未被误扣）');
	});

	test('identity：快照往返（`toJSON` → `reviveItem`）身份**逐字不变**', () => {
		const 实例 = R().reviveItem({ id: 'club', charges: 3, equipped: false });
		assert.ok(typeof 实例.entityId === 'string' && 实例.entityId !== '',
			`★旧形快照未补发身份（entityId=${实例.entityId}）`);
		const 再 = R().reviveItem(实例.toJSON());
		assert.eq(再.entityId, 实例.entityId, '★往返后实体身份变了 ⇒ 存读档会把「哪一件」指丢');
	});

	test('identity：旧档（只有旧名 `slotId`）⇒ **读回落**沿用那个号（✗ 重发）', () => {
		const 实例 = R().reviveItem({ id: 'club', charges: 3, equipped: false, slotId: 'it-9001' });
		assert.eq(实例.entityId, 'it-9001', '★旧档的号须**沿用** —— 重发会让「同一件东西」换号');
		assert.ok(实例.slotId === undefined, '回到活对象只叫新名');
		const 两 = [R().reviveItem({ id: 'club', charges: 2, equipped: false }),
			R().reviveItem({ id: 'club', charges: 2, equipped: false })];
		assert.ok(两[0].entityId !== 两[1].entityId,
			`★旧档两件同类被补成了同一个身份（${两[0].entityId}）—— 那是按「id＋charges」回退的写法`);
	});

	test('★identity：`backfillItemIdentity()` 幂等（第二次返回 0、快照逐字不变）', () => {
		clean();
		/* 直接铺**旧形**快照（模拟旧档读入后的 State） */
		inv().push({ id: 'club', charges: 2, equipped: false }, { id: 'club', charges: 9, equipped: false });
		/* ⚠ 计数是**全域**的（函数也扫已登记角色的 `items` —— 单测里那些角色是全局单例、别的用例喂过旧形件）
		 *   ⇒ 只断「至少补了这两件」，✗ 不断死总数（那会把别的用例的夹具算进来）。 */
		const 补 = R().backfillItemIdentity();
		assert.ok(补 >= 2, `★这两件旧形快照应被补发（实得补发 ${补} 件）`);
		assert.ok(inv().every((s) => typeof s.entityId === 'string' && s.slotId === undefined),
			'补发后每件都有实体身份，且旧名已清');
		assert.eq(new Set(inv().map((s) => s.entityId)).size, 2, '两件身份互异（✗ 补成同一个）');
		const 一次 = JSON.stringify(inv().map((s) => ({ ...s })));
		const 二次 = R().backfillItemIdentity();
		assert.eq(二次, 0, `★第二次应零变化（幂等；实得 ${二次}）`);
		assert.eq(JSON.stringify(inv().map((s) => ({ ...s }))), 一次, '★重跑后快照**逐字不变**');
		assert.eq(件数('club'), 2, '补发 ✗ 增减件数');
	});
})();
