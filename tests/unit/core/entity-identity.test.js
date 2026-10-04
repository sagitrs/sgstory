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
	test('★`#1935` ① 跨档稳定：读档后**水位已顶** —— 新发号 ✗ 撞上档里已有的号', () => {
		/* ★缺口真身：`backfillItemIdentity` 对**已在位**（无需补）的行原先**直接 `continue`** ⇒ 不调
		 *   `noteEntityId` ⇒ 读档后、件被取用前水位仍是 0 ⇒ 新拾取发号 `it-1` ⇒ 撞上档里已有的 `it-1` ✗。
		 *   ★故本格刻意放**两件都已带新名**（⇒ 该函数"无事可补" ＝ 最常发生的读档形）——
		 *     只要它顺手顶了水位，新发号就**不会**落回已用过的号 ✓（这正是"跨档稳定"的可判形式 ✓）。
		 *   ⚠ 水位仍住**模块级**（`10-item.js:48-54` 那条"被拒 ⇒ 存档面零变化"不动）⇒ 本格只断"顶没顶" ✓。 */
		const R = () => setup.RPG;
		const 存袋 = State.variables.inventory;
		const 存序 = R().itemEntitySeq;
		try {
			State.variables.inventory = [
				{ id: 'sword', charges: null, equipped: false, entityId: 'it-1' },
				{ id: 'sword', charges: null, equipped: false, entityId: 'it-9' },
			];
			R().itemEntitySeq = 0;                                    // 清到 0 ⇒ "没顶上去"当场可见 ✓
			assert.eq(R().backfillItemIdentity(), 0, '本格前置：两件都已在位 ⇒ 无需补（0）');
			const 号 = R().newEntityId();
			const 档里号 = State.variables.inventory.map((s) => s?.entityId).filter(Boolean);
			assert.ok(!档里号.includes(号), `★新发号 ${号} **撞上了档里已有的号**（档里=${JSON.stringify(档里号)}）`);
			assert.ok(Number(String(号).replace(/^it-/, '')) > 9, `★新发号须越过档里最大号 9（实得 ${号}）`);
			assert.eq(R().backfillItemIdentity(), 0, '★幂等：第二遍仍零变化');
		} finally {
			State.variables.inventory = 存袋;
			R().itemEntitySeq = 存序;
		}
	});

	test('★`#1935` ③（甲）读档归一：同槽**恰一件** `equipped` —— 留**最后一件**、异槽不动、幂等', () => {
		/* 裁 (甲)（领队 2026-10-04 02:59）：**写口不动**（`slotEquip` 仍拒绝占槽者 ⇒ 玩家可见行为不变 ✓），
		 *   只把**旧档/手改档**里"同槽多件都 equipped"这种态**归一**掉 ⇒ 「谁在装备」有确定答案 ✓。 */
		const R = () => setup.RPG;
		const 存袋 = State.variables.inventory;
		try {
			State.variables.inventory = [
				{ id: 'sword', equipped: true, entityId: 'it-11' },                 // weapon 槽（**前**一件）
				{ id: 'heavy-wooden-shield', equipped: true, entityId: 'it-12' },   // shield 槽 ⇒ **异槽**，不许动
				{ id: 'club', equipped: true, entityId: 'it-13' },                  // weapon 槽（**后**一件）⇒ 该留它
			];
			const 卸 = R().normalizeEquipped();
			assert.eq(卸, 1, `★同槽两件在装 ⇒ 须卸掉 1 件（实得 ${卸}）`);
			const 装 = State.variables.inventory.filter((s) => s.equipped === true).map((s) => s.entityId);
			assert.eq(JSON.stringify(装), JSON.stringify(['it-12', 'it-13']),
				`★须留**最后一件**（weapon 槽留 club＝it-13）且**异槽不动**（实得 ${JSON.stringify(装)}）`);
			assert.eq(R().normalizeEquipped(), 0, '★幂等：第二遍零变化');
		} finally {
			State.variables.inventory = 存袋;
		}
	});

	test('★`#1935` ② 容器实例态：同定义两只**各归各**且**随档往返**（开其一 ✗ 不开其二）', () => {
		/* 裁：账在**引擎实例位**（`Chest` 的 `opened` 在实例上 ＋ `entityId` 随档 ⇒ 不另立账 ✓）。
		 *   ★旧笔之下 `Item.toJSON` 只管 `{id, charges, equipped, entityId, definitionId}` ⇒
		 *     Chest 的 `opened`／`disarmed`／`locked` **不进档** ✗ ⇒ 同定义两只读档后状态糊在一起 ✗。 */
		const R = () => setup.RPG;
		/* ⚠ 走**注册表**建（`reviveItem` 内部 `createItem(id)` 要求 id 已注册 ✗ 我第一版直接 new 未注册 id ⇒
		 *   抛「未注册的道具 id」⇒ 本格当场红 ✓）。 */
		class 测试箱 extends R().Chest { constructor(o = {}) { super({ id: 'unit-crate', name: '木箱', ...o }); } }
		R().registerItem(测试箱);
		const 造 = () => R().createItem('unit-crate');
		const 甲 = 造(), 乙 = 造();
		assert.ok(甲.entityId !== 乙.entityId, `★同定义两只容器须各有身份（实得 ${甲.entityId}／${乙.entityId}）`);
		甲.opened = true;
		const 往返 = (x) => R().reviveItem(JSON.parse(JSON.stringify(x.toJSON())));
		const 甲2 = 往返(甲), 乙2 = 往返(乙);
		assert.eq(甲2.opened, true, '★甲的「开过」须随档往返');
		assert.eq(乙2.opened, false, '★乙**不得**跟着变成「开过」（同定义两只各归各 ✓）');
		assert.eq(甲2.entityId, 甲.entityId, '★身份随档往返不变');

	test('★`#1935` 单位域持久号：存档往返后「哪一只」逐字答得出；新发号 ✗ 不撞档里已有的号', () => {
		/* `[identity-enemies-save]` 的核心：`unitId` 原为**会话内** `WeakMap` 号 ⇒ 读档后新对象＝新号 ✗。
		 *   本笔把号**写进实例**（随 `toJSON` 进档 ✓）＋ 读档时**顶水位** ✓（同 `10-item.js` 的形 ✓）。 */
		const R = () => setup.RPG;
		const 造 = (名) => new (R().Character)({ name: 名, hp: 8, maxHp: 8 });
		const 甲 = 造('獾'), 乙 = 造('獾');
		const 甲号 = R().unitId.of(甲), 乙号 = R().unitId.of(乙);
		assert.ok(甲号 !== 乙号, `★两只同源单位须各有号（实得 ${甲号}／${乙号}）`);
		assert.eq(甲.toJSON().entityId, 甲号, '★号须**写进实例**（⇒ 随 `toJSON` 进档）');
		const 甲2 = R().Character.revive(JSON.parse(JSON.stringify(甲.toJSON())));
		assert.eq(R().unitId.of(甲2), 甲号, `★存读往返后号须**逐字同**（实得 ${R().unitId.of(甲2)}）`);
		const 丙号 = R().unitId.of(造('獾'));
		assert.ok(![甲号, 乙号].includes(丙号), `★读档后新发号 ${丙号} **撞上了档里已有的号**`);
		assert.ok(!('entityId' in 造('獾').toJSON()), '★未参战角色的快照**逐键不变**（✗ 凭空冒 `entityId` 键）');
	});

})();
