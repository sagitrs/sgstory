/* dnd3/items/resources 的单元测试（#1747：资源采集＋聚落最小形）
 *
 * 面：① 采集（`RPG.gatherFrom`）② 建造（`RPG.buildAt`）③ 收获（`RPG.harvest`）
 *     ④ craft/building 的边界（`src/core/36-build.js` 文件头是权威定义）
 * 数值：本笔的**全部数值为 house rule（非 SRD）**（一段资源在 SRD 3.5 无源，见 `resources.js` 文件头）
 *   ⇒ 断言只测**状态与异常**（`tests/README.md` 的口径），✗ 不测「该数值是对的」。
 *
 * ⚠ 本文件是 **LF**（与同批的 `bone-dagger.js` / `span1.test.js` 一致；`dnd3/items/` 目录内两种行尾并存，
 *   本笔采「与该目录新增文件一致」的一侧 —— 改行尾会造整档伪 diff，见 `tests/README.md` 纪律 8）。
 */
(() => {
	const R = () => setup.RPG;
	const D3 = () => setup.DND3;
	const inv = () => State.variables.inventory;
	/** **总件数**（跨槽求和）：`RPG.give(id, n)` 首次发放**逐件建槽**（n 个槽、每槽 charges=1，
	 *  只有同类槽已存在才并入），故 `inv().find(...).charges` 只读到**首槽**、不是总数。
	 *  本文件的断言一律用本函数读总量 —— 断言的对象是「件数」这一**语义**，✗ 不是槽的排布。 */
	const total = (id) => inv().filter((s) => s.id === id).reduce((a, s) => a + (s.charges ?? 1), 0);
	/** 清空背包与农田，并**重建玩家角色的背包桥接**。
	 *  ⚠ 为何必须重建（本笔实测踩到）：harness 的 `__resetState` 是 `State.variables = {}`
	 *  ——**整体替换**对象 ⇒ 两包 player 的 `items`（它桥接到 `State.variables.inventory`，
	 *  见 `player.js`）仍指向**被替换掉的旧数组** ⇒ `RPG.act` 在旧数组里找道具、找不到
	 *  （症状：`useItem` 明明有货却得「背包里没有」；`RPG.give` 写进新数组而角色看不见）。
	 *  ⇒ 本用例每个开头都调 `clean()` 重建该引用，以维持「角色背包 ≡ State 背包」这一不变量。 */
	const clean = () => {
		State.variables = { inventory: [] };
		for (const c of R().characters.values()) {
			if (Array.isArray(c.items) && (c.properties ?? []).includes('player')) c.items = State.variables.inventory;
		}
	};

	/* ---------- ① 资源本身：形态与「不是消耗品」的铁律 ---------- */

	test('resources：资源是道具（甲案）——可堆叠计数、不可装备、不能直接 use', () => {
		clean();
		assert.ok(R().items.has('rock'), '石料已注册（注册面=Items）');
		const rock = R().createItem('rock');
		assert.eq(rock.stackable, true, '可堆叠（计数库存）');
		assert.eq(rock.charges, 1, 'charges=1 是「一件」的载体（give 的合并分支据此累加）');
		assert.eq(rock.slot, null, '无装备槽 ⇒ 不可装备');
		assert.ok(rock.stats.craftInput === true, 'craftInput 标记（建造据此检索输入）');
		/* ★ 铁律：资源不是消耗品 —— 误 use 必须**响**（✗ 不静默什么都不做）。
		 *   ⚠ 须**先持有**：`useItem` 对不在背包里的道具走「背包里没有」分支（返回 false、不抛），
		 *   那测不到本铁律（本席首版即漏给，实测得 `threw=null`）。 */
		R().give('rock');
		let threw = null;
		try { R().useItem('rock'); } catch (e) { threw = e.message; }
		/* ★`#1877` P2-2：玩家面白话（✗ 系统话术「请用于建造」） */
		assert.ok(/备料/.test(threw ?? ''), `误 use 须抛**玩家可读**错误（实得：${threw}）`);
		assert.ok(!/建造|build/.test(threw ?? ''), `✗ 玩家面出现内部术语（实得：${threw}）`);
	});

	test('resources：计数库存的**总量**可读（槽数由 `give` 决定，见下注）', () => {
		clean();
		/* ⚠ 实证（既有语义，非本笔引入）：`RPG.give(id, n)` **首次发放逐件 push**（n 个槽、
		 *   每槽 `charges:1`），**只有同类槽已存在才并入**（`bandage` 的既有用例正是靠
		 *   「先给 1 件建槽、再给第 2 次才合并」得到 4）。
		 *   ⇒ 本笔**不断言槽数**（那是 `give` 的实现细节，不是资源的语义）；
		 *     只断言**总量**= 件数，且 `take` 按总量正确扣减。 */
		R().give('rock', 4);
		const total = () => inv().filter((s) => s.id === 'rock').reduce((a, s) => a + (s.charges ?? 1), 0);
		assert.eq(total('rock'), 4, '总量 = 4 件（✗ 不断言「只有一个槽」）');
		R().take('rock', 3);
		assert.eq(total('rock'), 1, 'take 按总量扣（逐槽扣、跨槽正确）');
	});

	/* ---------- ② 采集：产出、扣次、采空 ---------- */

	test('采集：产出进背包，且**采集点自身扣 1 次**（同一动作两件事）', () => {
		clean();
		R().rng.set(() => 0.1);        // 概率产出须命中（wild-grain 的 0.7 门）
		R().give('stone-pile');
		const r = R().gather('stone-pile');
		assert.eq(r?.status, 'applied', '采集经统一入口 act ⇒ applied');
		assert.eq(total('rock'), 2, '石料堆产出 2 件（house rule）');
		assert.eq(total('stone-pile'), 5, '采集点由 6 扣至 5（★ 采一次耗一分）');
	});

	test('采集：采空即**摘槽**（槽消失 ⇒ 「这层采过了」可由背包读出）', () => {
		clean();
		R().rng.set(() => 0.1);
		R().give('flint-seam');        // charges=2
		R().gather('flint-seam');
		R().gather('flint-seam');
		assert.eq(R().has('flint-seam'), false, '采空后槽被摘（✗ 不留 charges=0 残槽）');
		assert.eq(total('tinder'), 2, '两次产出都到手');
		const again = R().gather('flint-seam');
		assert.eq(again?.status, 'rejected', '再采 ⇒ 拒绝（no-such-item）');
		assert.eq(again?.reason, 'no-such-item', '理由是「没有这件道具」');
	});

	test('采集：charges=null 的采集点是**无限次**（不扣、不摘）', () => {
		clean();
		R().defItem({
			id: 'unit-inf-vein', name: '无限矿脉', charges: null, stackable: false,
			stats: { yields: [{ id: 'rock', n: 1 }] },
			actions: { gather: R().gatherFrom },
			used() { throw new Error('不该被 use'); },
		});
		R().give('unit-inf-vein');
		R().gather('unit-inf-vein');
		R().gather('unit-inf-vein');
		assert.eq(inv().find((s) => s.id === 'unit-inf-vein')?.charges, null, 'charges 恒为 null');
		assert.eq(total('rock'), 2, '两次都产出了');
	});

	test('采集：概率未命中 ⇒ **不扣次**（静默跳过，✗ 不算「采过」）', () => {
		clean();
		R().rng.set(() => 0.99);       // 恒 > 0.7 ⇒ wild-grain 未命中
		R().give('wild-grain');        // charges=4
		const r = R().gather('wild-grain');
		assert.eq(total('wild-grain'), 4, '什么都没采到 ⇒ 不扣次（否则空手也耗资源）');
		assert.eq(R().has('seed'), false, '未命中 ⇒ 无产出');
		assert.eq(r?.status, 'applied', '动作本身仍算执行（只是产出为空）');
	});

	test('采集：产出 id 未注册（数据拼写错）⇒ 跳过并提示，✗ 不抛错', () => {
		clean();
		R().defItem({
			id: 'unit-badnode', name: '错表采集点', charges: null, stackable: false,
			stats: { yields: [{ id: 'unit-not-registered', n: 1 }] },
			actions: { gather: R().gatherFrom },
			used() { throw new Error('不该被 use'); },
		});
		R().give('unit-badnode');
		let threw = null, r = null;
		try { r = R().gather('unit-badnode'); } catch (e) { threw = e.message; }
		assert.eq(threw, null, '数据拼写错不该让故事崩');
		assert.eq(r?.status, 'applied', '动作仍完成（该项被跳过）');
	});

	test('采集：无玩家角色（纯 core）⇒ 返回 false，✗ 不抛错', () => {
		clean();
		const saved = R().playerActor;
		R().playerActor = () => null;   // 模拟纯 core 场景（无注册玩家）
		let threw = null, r = 'unset';
		try { r = R().gather('stone-pile'); } catch (e) { threw = e.message; }
		finally { R().playerActor = saved; }
		assert.eq(threw, null, '不抛错');
		assert.eq(r, false, '与「背包里没有」同形（false）');
	});

	/* ---------- ③ 建造（building）：消耗输入、产出落世界 ---------- */

	test('建造：种子 ⇒ 农田（消耗输入、农田 +1、★ 产出**不**回背包）', () => {
		clean();
		R().give('seed', 3);
		R().give('farm-plot');
		const before = D3().farmCount();
		const r = R().act(R().playerActor(), 'farm-plot', R().playerActor(), 'build');
		assert.eq(r?.status, 'applied', '建造成功');
		assert.eq(D3().farmCount(), before + 1, '农田数（世界态）＋1');
		assert.eq(total('seed'), 1, '扣 2 份种子（3 → 1）');
		assert.eq(R().has('farm-plot'), true, '图纸仍在（charges=null ⇒ 可反复用；✗ 建造不消耗图纸）');
	});

	test('建造：材料不足 ⇒ 失败、**零变更**（✗ 半扣）', () => {
		clean();
		R().give('seed', 1);            // 需要 2，只有 1
		R().give('farm-plot');
		const before = D3().farmCount();
		const r = R().act(R().playerActor(), 'farm-plot', R().playerActor(), 'build');
		assert.eq(D3().farmCount(), before, '农田未增（原子性）');
		assert.eq(total('seed'), 1, '种子未扣（不足 ⇒ 整笔不生效）');
		assert.ok(r, '仍返回结果对象');
	});

	test('建造：落地效果**未注册** ⇒ 失败且**输入未扣**（早退，✗ 不进消耗）', () => {
		clean();
		R().defItem({
			id: 'unit-orphan-plan', name: '无落地图纸', charges: null, stackable: false,
			stats: { plan: { id: 'unit-no-such-build', inputs: [{ id: 'seed', n: 2 }] } },
			actions: { build: R().buildAt },
			used() { throw new Error('不该被 use'); },
		});
		R().give('seed', 2);
		R().give('unit-orphan-plan');
		const r = R().act(R().playerActor(), 'unit-orphan-plan', R().playerActor(), 'build');
		assert.ok(r, '返回结果体');
		assert.eq(total('seed'), 2, '输入未扣（在「落地未注册」这一分支上**先于消耗**即早退）');
	});

	test('建造：落地函数**返回 false** ⇒ 失败且**退还输入**（本笔定义：失败不留损）', () => {
		clean();
		/* ★ 这一条才测得到「退还」：必须让 `land()` **真的被调用并返回 false**
		 *  （上一条走的是「落地未注册」早退分支，`consumeRecipe` 都没跑 ⇒ 退还语句不可达，
		 *   撤掉退还仍全绿 = **空刀**，本席实测发现后补本用例）。 */
		let called = 0;
		R().registerBuild('unit-fail-build', () => { called += 1; return false; });
		R().defItem({
			id: 'unit-fail-plan', name: '必败图纸', charges: null, stackable: false,
			stats: { plan: { id: 'unit-fail-build', inputs: [{ id: 'seed', n: 2 }] } },
			actions: { build: R().buildAt },
			used() { throw new Error('不该被 use'); },
		});
		R().give('seed', 2);
		R().give('unit-fail-plan');
		const r = R().act(R().playerActor(), 'unit-fail-plan', R().playerActor(), 'build');
		assert.eq(called, 1, '落地函数被调用恰一次');
		assert.ok(r, '返回结果体');
		assert.eq(total('seed'), 2, '★ 输入被**退还**（失败不留损；撤掉退还 ⇒ 本断言红）');
	});

	test('建造：registerBuild 拒绝空 id / 非函数（注册面守卫）', () => {
		let e1 = null, e2 = null;
		try { R().registerBuild('', () => true); } catch (e) { e1 = e.message; }
		try { R().registerBuild('x', 'not-a-function'); } catch (e) { e2 = e.message; }
		assert.ok(/非空 id/.test(e1 ?? ''), '空 id 被拒');
		assert.ok(/需要函数/.test(e2 ?? ''), '非函数被拒');
	});

	/* ---------- ④ 收获：world → 背包（闭环的收口） ---------- */

	test('收获：农田数 ⇒ 口粮数（闭环最短链的收口），无田 ⇒ false', () => {
		clean();
		assert.eq(D3().farmCount(), 0, '前置：无田');
		assert.eq(R().harvest(), false, '无田 ⇒ false（且不产出口粮）');
		assert.eq(R().has('ration'), false, '无产出');
		/* 开一块田再收 */
		R().give('seed', 2); R().give('farm-plot');
		R().act(R().playerActor(), 'farm-plot', R().playerActor(), 'build');
		assert.eq(D3().farmCount(), 1, '1 块田');
		assert.eq(R().harvest(), true, '有田 ⇒ 收成成功');
		assert.eq(total('ration'), 1, '1 块田 ⇒ 1 份口粮');
	});

	test('口粮：可食用（恢复 house rule 数值的 HP），且是消耗品（use 扣 1）', () => {
		clean();
		R().give('ration');            // charges=1（一件）
		const target = { name: '甲', hp: 5, maxHp: 20 };
		R().useItem('ration', target);
		assert.eq(target.hp, 7, '恢复 2 HP（house rule 值）');
		assert.eq(R().has('ration'), false, '吃完即离包');
	});

	/* ---------- ⑤ craft/building 边界（权威定义在 src/core/36-build.js 文件头） ---------- */

	test('边界：craft 产出**回背包**；building 产出**落世界**（两者共用配方消耗）', () => {
		clean();
		/* craft 侧：用 defItem 现造一个「石料×2 ⇒ 木材×1」的合成件（产出回背包） */
		R().defItem({
			id: 'unit-recipe', name: '试验配方', charges: null, stackable: false,
			stats: { recipe: { inputs: [{ id: 'rock', n: 2 }], yields: [{ id: 'wood', n: 1 }] } },
			actions: { craft: R().craftWith },
			used() { throw new Error('不该被 use'); },
		});
		R().give('rock', 2); R().give('unit-recipe');
		const r1 = R().act(R().playerActor(), 'unit-recipe', R().playerActor(), 'craft');
		assert.eq(r1?.status, 'applied', 'craft 执行');
		assert.eq(R().has('rock'), false, '输入被消耗');
		assert.eq(total('wood'), 1, '产出**回背包**（craft 的判据）');
		/* building 侧：产出落世界（农田），背包里**不出现**农田这个道具 */
		R().give('seed', 2); R().give('farm-plot');
		const farmBefore = D3().farmCount();
		R().act(R().playerActor(), 'farm-plot', R().playerActor(), 'build');
		assert.eq(D3().farmCount(), farmBefore + 1, '产出落世界（building 的判据）');
		assert.eq(R().has('farm'), false, '世界态**不是**道具（✗ 不出现在背包）');
	});

	test('边界：两条路共用 `consumeRecipe` 的**原子性**（✗ 不各写一套配方逻辑）', () => {
		clean();
		/* 输入不足 ⇒ 两条路都整笔不生效；且都不留半扣 */
		R().defItem({
			id: 'unit-r2', name: '试验配方2', charges: null, stackable: false,
			stats: { recipe: { inputs: [{ id: 'rock', n: 2 }, { id: 'wood', n: 1 }], yields: [{ id: 'tinder', n: 1 }] } },
			actions: { craft: R().craftWith },
			used() { throw new Error('x'); },
		});
		R().give('rock', 5); R().give('wood', 0); R().give('unit-r2');   // wood 缺
		R().act(R().playerActor(), 'unit-r2', R().playerActor(), 'craft');
		assert.eq(total('rock'), 5, '★ 另一项（rock）**未被半扣**');
		assert.eq(R().has('tinder'), false, '无产出');
	});

	test('consumeRecipe：无输入表 ⇒ null（✗ 不静默当「成功且什么也不扣」）', () => {
		clean();
		assert.eq(R().consumeRecipe(R().playerActor(), null), null, '无配方 ⇒ null');
		assert.eq(R().consumeRecipe(R().playerActor(), { inputs: [] }), null, '空输入 ⇒ null');
	});

	/* ---------- ⑥ 闭环（票面验收：采集→背包→建设→产出 可玩） ---------- */

	test('闭环：采集种子 ⇒ 建造农田 ⇒ 收获口粮（最短链一次跑通）', () => {
		clean();
		R().rng.set(() => 0.1);        // 概率产出必中
		R().give('wild-grain');        // 采种子的（charges=4）
		R().give('farm-plot');
		/* ① 采集：两次 ⇒ 2 份种子 */
		R().gather('wild-grain');
		R().gather('wild-grain');
		assert.eq(total('seed'), 2, '采到 2 份种子');
		/* ② 建造：种子 ×2 ⇒ 农田 ×1 */
		R().act(R().playerActor(), 'farm-plot', R().playerActor(), 'build');
		assert.eq(D3().farmCount(), 1, '农田建成');
		assert.eq(R().has('seed'), false, '种子耗尽（输入被消耗）');
		/* ③ 收获：农田 ⇒ 口粮 */
		R().harvest();
		assert.eq(total('ration'), 1, '闭环收口：口粮到手');
	});

	/* ---------- ⑦ #1776 D 席四缺陷的回归（契约面） ---------- */

	test('契约：动作 `return false` ⇒ act 报 `rejected/action-refused` 且**不提交**（D 缺陷2）', () => {
		clean();
		R().give('farm-plot');            // 有图纸、无种子 ⇒ buildAt 会 return false
		const before = inv().length;
		const r = R().act(R().playerActor(), 'farm-plot', R().playerActor(), 'build');
		assert.eq(r?.status, 'rejected', '失败动作**不得**被报成 applied（旧版此处为 applied）');
		assert.eq(r?.reason, 'action-refused', '拒绝理由可判（调用方据此判成败）');
		assert.eq(inv().length, before, '★ 拒绝 ⇒ **不提交**（道具状态零变更）');
	});

	test('契约：成功动作仍为 `applied`（✗ 不因新契约而误报）', () => {
		clean();
		R().rng.set(() => 0.1);
		R().give('stone-pile');
		const r = R().gather('stone-pile');
		assert.eq(r?.status, 'applied', '正常采集仍是 applied');
		assert.eq(total('rock'), 2, '产出照旧');
	});

	test('契约：`return 0` ⇒ 仍 `applied`（★ 严判 `=== false` 的**唯一区分点**）', () => {
		clean();
		/* ★ 本条是「`=== false` vs `== false`」的**唯一刀**（`#1776` D 席 NIT-1）：
		 *   `undefined` 面**两式同判**（都不算拒绝）⇒ 只盖 undefined 的用例在 `== false` 突变下仍全绿
		 *   （实测：把 `=== false` 改成 `== false` ⇒ 全量 **304/0**，判据不可假）。
		 *   而 `0`/`''`（以及 `null`/`NaN`）正是两式的分界：严判把它们当**成功**（动作没说要拒绝），
		 *   松判会把它们误判成 rejected ⇒ 调用方以为动作失败。
		 *   此处钉 `0`（`''` 同理，见下一条）。 */
		R().defItem({
			id: 'unit-zero-item', name: '返回 0 的动作', charges: null, stackable: false,
			stats: {}, actions: {},
			used() { return 0; },   // ★ 不是 false ⇒ 不得被当拒绝
		});
		R().give('unit-zero-item');
		const r = R().act(R().playerActor(), 'unit-zero-item', R().playerActor(), 'use');
		assert.eq(r?.status, 'applied', '`return 0` ⇒ applied（松判 `== false` 会误报 rejected）');
	});

	test('契约：`return \'\'` ⇒ 仍 `applied`（同族：空串也是 falsy 但非拒绝）', () => {
		clean();
		R().defItem({
			id: 'unit-empty-item', name: '返回空串的动作', charges: null, stackable: false,
			stats: {}, actions: {},
			used() { return ''; },
		});
		R().give('unit-empty-item');
		const r = R().act(R().playerActor(), 'unit-empty-item', R().playerActor(), 'use');
		assert.eq(r?.status, 'applied', '`return \'\'` ⇒ applied（同 `0` 的分界）');
	});

	test('契约：`return undefined`（多数动作）视作成功（✗ 不用 falsy 判定）', () => {
		clean();
		R().defItem({
			id: 'unit-void-item', name: '无返回动作', charges: null, stackable: false,
			stats: {}, actions: {}, used() { /* 不 return ⇒ undefined */ },
		});
		R().give('unit-void-item');
		const r = R().act(R().playerActor(), 'unit-void-item', R().playerActor(), 'use');
		assert.eq(r?.status, 'applied', 'undefined ⇒ 成功（若用 falsy 判定会被误判为拒绝）');
	});

	test('D 缺陷3：落地函数**抛错** ⇒ 输入被退还且异常照常传播', () => {
		clean();
		R().registerBuild('unit-throw-build', () => { throw new Error('落地炸了'); });
		R().defItem({
			id: 'unit-throw-plan', name: '炸图', charges: null, stackable: false,
			stats: { plan: { id: 'unit-throw-build', inputs: [{ id: 'seed', n: 2 }] } },
			actions: { build: R().buildAt },
			used() { throw new Error('不该被 use'); },
		});
		R().give('seed', 2);
		R().give('unit-throw-plan');
		let threw = null;
		try { R().act(R().playerActor(), 'unit-throw-plan', R().playerActor(), 'build'); } catch (e) { threw = e.message; }
		assert.eq(threw, '落地炸了', '异常照常传播（✗ 不吞）');
		assert.eq(total('seed'), 2, '★ 输入已**退还**（旧版此处为 0 ⇒ 材料净损）');
	});

	test('D 缺陷4：收获**清空**农田 ⇒ 第二次收获无产出（✗ 不可站着反复收）', () => {
		clean();
		R().give('seed', 2); R().give('farm-plot');
		R().act(R().playerActor(), 'farm-plot', R().playerActor(), 'build');
		assert.eq(D3().farmCount(), 1, '1 块田');
		assert.eq(R().harvest(), true, '第一次收获成功');
		assert.eq(D3().farmCount(), 0, '★ 收后清空（需重新开垦）');
		assert.eq(R().harvest(), false, '第二次收获失败（无田）');
		assert.eq(total('ration'), 1, '因此口粮仍只有 1（旧版连收会累加）');
	});

	test('D 缺陷4：收获累计记进 `span1Harvests`（供叙事，非资源）', () => {
		clean();
		R().give('seed', 4); R().give('farm-plot');
		R().act(R().playerActor(), 'farm-plot', R().playerActor(), 'build');
		R().act(R().playerActor(), 'farm-plot', R().playerActor(), 'build');   // 2 块田
		R().harvest();
		assert.eq(State.variables.span1Harvests, 2, '累计收成 = 2（本次 2 块田）');
	});
})();