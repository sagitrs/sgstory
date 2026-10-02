/* 场景级断言框架（`#1806` 笔 2）的用例：`loadFixture` / `dispatch` / `assertSave`
 *
 * 三件套要证明的三件事：① 毫秒级「铺场景 → 推一步 → 断言存档」，且走**真实路径**
 * （`Save.onLoad` 裁决、`RPG.act` 入口），✗ 不是「塞完变量直接断言」；② 失败信息
 * **可诊断**（逐路径 `old → new`）；③ 能**回填真实缺陷**（票面「bug 复现 ＝ 三行场景」）。
 *
 * 纪律：断言守 **E11 形**（行为 `status` 与状态存档面**并断**——只断一边会漏掉双写不一致）；
 * 私有探针件用完**清注册表**（`#1807` 的教训）；fixture 用完清空。
 */
(() => {
	const R = () => setup.RPG;
	const SC = () => globalThis.__scenario;
	const H = () => globalThis.__host;

	const probes = [];
	const probe = (def) => { probes.push(def.id); return R().defItem(def); };
	const cleanProbes = () => { for (const id of probes.splice(0)) R().items.delete(id); SC().clearFixtures(); };

	/** 玩家背包（走全局 `$inventory`——`slotEquip` 的槽判定读的是它） */
	const scenarioWith = (...snapshots) => {
		R().give('coin');
		const inv = State.variables.inventory;
		inv.length = 0;
		for (const s of snapshots) inv.push(s);
		return R().playerActor();
	};

	/* ---------- ① 铺场景 ---------- */

	test('#1806 笔2：`loadFixture` 铺**裸状态**（用例前置）', () => {
		SC().loadFixture({ hp: 12, inventory: [] });
		assert.eq(State.variables.hp, 12, '状态已落');
		assert.eq(SC().snapshot().hp, 12, 'snapshot 读得到');
	});

	test('#1806 笔2：`loadFixture` 走**真实读档路径**（`Save.onLoad` 处理器会跑）', () => {
		let ran = 0;
		const fn = () => { ran++; };
		H().save.onLoad.add(fn);
		try {
			/* ★经 `save.make()` 造存档对象 —— 它**先跑 onSave**（`#1806` 笔 1 的信封若已接入，
			 *   就在这里被挂上），故本形同时也是「契约已接入」时的**合法档**形。 */
			const obj = H().save.make();
			obj.state.hp = 7;
			SC().loadFixture(obj);
			assert.eq(ran, 1, '★onLoad 处理器被触发（✗ 「塞变量」式旁路）');
			assert.eq(State.variables.hp, 7, '状态已还原');
		} finally { H().save.onLoad.delete(fn); }
	});

	test('★#1806 笔2×笔1 联动：**无信封的存档被契约拒绝**（两笔合拢后的真实行为）', () => {
		/* 笔 1 的 `install()` 注册了裁决处理器；笔 2 的 `loadFixture` 走真实读档路径
		 * ⇒ 二者合拢后，「没有版本信封的档」应当**在单测里就被拦**（✗ 静默载入）。
		 * ⚠ 若契约未接入（本档也可独立运行），则无处理器 ⇒ 不拦 —— 两条路都核。 */
		const rpgSave = R().save;
		const contractOn = rpgSave != null && rpgSave.installed();
		let threw = null;
		try { SC().loadFixture({ state: { hp: 1 } }); } catch (e) { threw = e; }
		if (contractOn) {
			assert.ok(threw != null, '★契约在位 ⇒ 无信封的档必须被拒（✗ 静默载入）');
			assert.eq(threw.rpgSaveReject, 'NO_ENVELOPE', '机读码可判别');
		} else {
			assert.eq(threw, null, '契约未接入 ⇒ 无处理器，不拦（本档可独立运行）');
		}
	});

	test('#1806 笔2：具名 fixture 复用；未注册名**报错且列出已注册**', () => {
		SC().fixture('基本局', { hp: 20, inventory: [] });
		SC().loadFixture('基本局');
		assert.eq(SC().snapshot().hp, 20, '具名 fixture 生效');
		let msg = '';
		try { SC().loadFixture('不存在的局'); } catch (e) { msg = e.message; }
		assert.ok(msg.includes('未注册的 fixture'), `应报未注册：${msg}`);
		assert.ok(msg.includes('基本局'), `★应列出已注册的（可诊断）：${msg}`);
	});

	/* ---------- ①b 具名夹具登记面（`#1878`）---------- */

	test('#1878：`registerFixture` 收**函数**（惰性）—— ✗ 注册时求值、✗ 共享引用', () => {
		/* ★立档理由：`setup.DND3.stats()` 的返回块含 Symbol 键（`[PACK]:'dnd3'`），
		 *   而 inline JSON **表达不了 Symbol** ⇒ 用 inline 建的角色态丢 pack 标记 ⇒ 跨包同名遮蔽判不出（**假绿**）。
		 *   函数形在**故事侧环境就绪后**求值 ⇒ 标记保住。 */
		let calls = 0;
		SC().registerFixture('f-计数', () => { calls++; return { hp: 7, inventory: [] }; });
		assert.eq(calls, 0, '★注册**不**调用（惰性 —— 此刻求值会把 Symbol/故事态冻住）');
		SC().loadFixture('f-计数');
		assert.eq(calls, 1, 'loadFixture 才求值');
		assert.eq(State.variables.hp, 7, '状态已落');
		/* ★每次新建 ⇒ 用例之间天然隔离（对象形是共享引用 ⇒ 跨用例污染） */
		SC().loadFixture('f-计数');
		assert.eq(calls, 2, '★再 load 再求值（✗ 复用同一份）');
	});

	test('#1878：`resolveFixture` **不克隆** ⇒ 保住 Symbol 标记；inline JSON 形**必丢**（假绿的机械判据）', () => {
		/* ★本席**改过一次本格**（如实记）：首版断言 `loadFixture('具名')` 能保住 Symbol —— **错**。
		 *   实测：`loadFixture` 对裸状态走 `H.state.set(H.save.roundtrip(obj))`（**JSON 往返**）
		 *   ⇒ Symbol 键在 `JSON.stringify` 里**根本不出现** ⇒ 具名形一样丢。
		 *   ⇒ 真正保住标记的是**不克隆的那条路**：`resolveFixture(name)` 返回故事侧**刚求值出来的活对象**
		 *     （消费方直接赋给 `State.variables` ⇒ 标记随引用留住）。
		 *   ★这也定了消费侧的用法：runner 要标记就得走 `resolveFixture` ＋**直接赋值**，✗ 走 `loadFixture`。 */
		const PACK = Symbol.for('unit.pack');
		SC().registerFixture('f-带标记', () => {
			const stats = { ac: 12 };
			stats[PACK] = 'dnd3';                 // 模拟 `setup.DND3.stats()` 的 `[PACK]: 'dnd3'`
			return { stats, inventory: [] };
		});
		assert.eq(SC().resolveFixture('f-带标记').stats[PACK], 'dnd3',
			'★`resolveFixture`（不克隆）⇒ pack 标记**在**');
		/* 对照臂 ①：同一份状态走 JSON 往返（`loadFixture` 的路）⇒ 标记消失 */
		const viaJson = H().save.roundtrip(SC().resolveFixture('f-带标记'));
		assert.eq(viaJson.stats[PACK], undefined,
			'★JSON 往返 ⇒ pack 标记**没了**（Symbol 不进 JSON —— 这正是「用错形 ⇒ 假绿」的机械证据）');
		/* 对照臂 ②：inline 对象直接写（也是 JSON 形的一员）：`scenarios.json` 的 inline 无法表达 Symbol */
		assert.eq(JSON.parse(JSON.stringify({ stats: { ac: 12 }, [PACK]: 'dnd3' }))[PACK], undefined,
			'★inline JSON 形**表达不了** Symbol（`[PACK]` 键在 stringify 时即被丢弃）');
	});

	test('#1878：`registerFixture` 的契约（名字非空、须给函数、`resolveFixture` 只读）', () => {
		let msg = '';
		try { SC().registerFixture('', () => ({})); } catch (e) { msg = e.message; }
		assert.ok(msg.includes('非空字符串'), `空名须拒：${msg}`);
		msg = '';
		try { SC().registerFixture('f-坏', { hp: 1 }); } catch (e) { msg = e.message; }
		assert.ok(msg.includes('须给函数') && msg.includes('fixture(name, state)'),
			`★给对象须拒**并指向旧形**（可诊断）：${msg}`);
		SC().registerFixture('f-读', () => ({ hp: 3 }));
		assert.eq(SC().resolveFixture('f-读').hp, 3, 'resolveFixture 求值');
		assert.eq(SC().resolveFixture('没有这个名'), undefined, '★缺名 ⇒ undefined（✗ 抛：只读面不该中断）');
	});

	/* ---------- ② 推一步 ---------- */

	test('#1806 笔2：`dispatch` 返回 status ＋ 前后存档面 ＋ 可读 delta ＋ 输出行', () => {
		probe({ id: 'unit-herb', name: '单测药草', charges: 1, stackable: true, stats: { hp: 3 },
			used(that) { that.hp = (that.hp ?? 0) + 3; this.perform(`用了${this.name}`); } });
		const p = scenarioWith({ id: 'unit-herb', charges: 1, equipped: false });
		p.hp = 10;
		const r = SC().dispatch({ item: 'unit-herb' });
		assert.eq(r.status, 'applied', '动作成功');
		assert.ok(r.delta.includes('hp'), `★delta 指到具体路径：${r.delta}`);
		assert.ok(r.lines.some((l) => l.includes('单测药草')), `★lines 给出玩家可见输出：${JSON.stringify(r.lines)}`);
		cleanProbes();
	});

	test('★`#1877` N-2 修：`dispatch` 的 `lines` 切点按**行数**（✗ 块数）—— 动作前已有输出时不得吞掉本次行', () => {
		/* ★本格钉的是**框架自身的潜在缺陷**（由 `#1877` N-2 暴露）：
		 *   输出块**保持打开并累积**（`host.append` 只在块关闭时才新建块）⇒ 旧实现按 `outputs.length` 切片，
		 *   动作若把行追加进**已打开的块**，`slice(块数)` 会把本次行**一起切掉** ⇒ `lines` **恒空**。
		 *   触发条件＝「动作**之前**已有输出」——`#1877` N-2 给 `RPG.give` 加了一行「＋n 名」后，
		 *   `scenarioWith` 里的 `give('coin')` 就会先建块 ⇒ 该档当场红（**假阴性**：把「有输出」读成「没输出」）。
		 *   ⚠ 判别力：把切点改回 `outputs.length` ⇒ 本格必红。 */
		probe({ id: 'unit-herb-lines', name: '单测药草甲', charges: 1, stackable: true, stats: { hp: 3 },
			used(that) { that.hp = (that.hp ?? 0) + 3; this.perform(`用了${this.name}`); } });
		const p = scenarioWith({ id: 'unit-herb-lines', charges: 1, equipped: false });
		p.hp = 10;
		/* ① 先制造「活动作之前的输出」（打开着的块）——正是旧实现吞行的条件 */
		R().give('rock', 1);
		assert.ok(H().host.lines().length > 0, '前置：动作**之前**已有输出（块已打开）');
		/* ② 再推一步：本次行须**只**含本次动作的 */
		const r = SC().dispatch({ item: 'unit-herb-lines' });
		assert.eq(r.status, 'applied', '动作成功');
		assert.ok(r.lines.some((l) => l.includes('单测药草甲')),
			`★块已打开时仍须给出本次行（✗ 恒空 —— 旧实现按块数切）：${JSON.stringify(r.lines)}`);
		assert.ok(!r.lines.some((l) => l.includes('＋1') && l.includes('石料')),
			`★且**不**含动作之前的行：${JSON.stringify(r.lines)}`);
		cleanProbes();
	});
	test('#1806 笔2：`dispatch` 走**真实入口** `RPG.act`（未注册 id ⇒ 引擎的拒绝）', () => {
		scenarioWith();
		const r = SC().dispatch({ item: '绝无此物' });
		assert.eq(r.status, 'rejected', '引擎拒绝');
		assert.eq(r.reason, 'no-such-item', '★用的是引擎的 reason（✗ 本档自造判定）');
		assert.eq(r.delta, '', '★拒绝 ⇒ 存档面零变化（delta 为空串）');
	});

	/* ---------- ③ 断言存档（golden） ---------- */

	test('#1806 笔2：`assertSave` 部分比对；失败信息指到路径与前后值', () => {
		SC().loadFixture({ hp: 5, sceneId: '探索', 其它: '不管' });
		SC().assertSave({ hp: 5 });
		let msg = '';
		try { SC().assertSave({ hp: 6 }); } catch (e) { msg = e.message; }
		assert.ok(msg.includes('hp'), `失败信息应指到路径：${msg}`);
		assert.ok(msg.includes('5') && msg.includes('6'), `★并给出前后值：${msg}`);
	});

	test('#1806 笔2：`assertSave` 全量比对能抓到**多出来的键**', () => {
		SC().loadFixture({ a: 1, b: 2 });
		SC().assertSave({ a: 1, b: 2 }, { partial: false });
		let msg = '';
		try { SC().assertSave({ a: 1 }, { partial: false }); } catch (e) { msg = e.message; }
		assert.ok(msg.includes('b'), `★全量比对应抓出多余的键：${msg}`);
	});

	test('#1806 笔2：`snapshot` 键序稳定 ⇒ 同一状态不同插入序得同一 digest', () => {
		SC().loadFixture({ z: 1, a: { y: 2, b: 3 } });
		const d1 = SC().digest();
		SC().loadFixture({ a: { b: 3, y: 2 }, z: 1 });
		assert.eq(SC().digest(), d1, '★键序不影响比较（✗ 各处自比会假红）');
	});

	test('#1806 笔2：`diff` 逐路径可读；无差 ⇒ 空串', () => {
		const a = { hp: 10, inv: [{ id: 'x', charges: 2 }] };
		const b = { hp: 10, inv: [{ id: 'x', charges: 1 }, { id: 'y' }] };
		const d = SC().diff(a, b);
		assert.ok(d.includes('inv[0].charges: 2 → 1'), `路径级：${d}`);
		assert.ok(d.includes('inv[1]: (缺席)'), `★缺席也是可读态：${d}`);
		assert.eq(SC().diff(a, a), '', '无差 ⇒ 空串');
	});

	/* ---------- ④ 真实缺陷回填 ---------- */

	test('★#1806 笔2 回填 `#1801`：**弹药拒绝 ⇒ 零副作用**（行为＋状态并断）', () => {
		probe({ id: 'unit-gun', name: '单测枪', charges: null, stackable: false,
			weapon: true, slot: 'weapon', stats: { ammo: { id: 'unit-bullet', perShot: 1 } },
			used() { return false; }, actions: {} });
		probe({ id: 'unit-bullet', name: '单测弹', charges: 1, stackable: true, used() {} });
		scenarioWith({ id: 'unit-gun', charges: null, equipped: true },
			{ id: 'unit-bullet', charges: 2, equipped: false });
		const before = SC().snapshot();
		const r = SC().dispatch({ item: 'unit-gun', action: 'use' });
		assert.eq(r.status, 'rejected', '行为：动作被拒');
		assert.eq(r.reason, 'action-refused', '行为：原因是动作自己拒绝');
		assert.eq(r.delta, '', '★拒绝路径：存档面零变化（`#1801` 原病：拒绝却已扣弹）');
		assert.eq(SC().digest(SC().snapshot()), SC().digest(before), '★与动作前逐字节同');
		cleanProbes();
	});

	test('★#1806 笔2 回填 `#1783`：**槽被占 ⇒ 拒绝**且零副作用（行为＋状态并断）', () => {
		probe({ id: 'unit-a', name: '单测甲', charges: null, stackable: false, slot: 'weapon',
			weapon: true, used() {}, actions: { equip: R().slotEquip, unequip: R().slotUnequip } });
		probe({ id: 'unit-b', name: '单测乙', charges: null, stackable: false, slot: 'weapon',
			weapon: true, used() {}, actions: { equip: R().slotEquip, unequip: R().slotUnequip } });
		const p = scenarioWith({ id: 'unit-a', charges: null, equipped: false },
			{ id: 'unit-b', charges: null, equipped: false });
		assert.eq(SC().dispatch({ item: 'unit-a', action: 'equip', target: p }).status, 'applied', '前置：甲装上');
		const r = SC().dispatch({ item: 'unit-b', action: 'equip', target: p });
		assert.eq(r.status, 'rejected', '★槽被占 ⇒ 拒绝（`#1783` 修前为 applied ＝ 不可判）');
		/* 部分比对：只核装备态这两个路径（快照项另有 charges 等键，全量比会噪音化） */
		SC().assertSave({ inventory: [{ id: 'unit-a', equipped: true }, { id: 'unit-b', equipped: false }] });
		cleanProbes();
	});

	test('★#1806 笔2：宿主存档面 —— onSave 增补信封、onLoad **拒绝坏档**（显式）', () => {
		const onSave = (s) => { s.state.__env = { saveVersion: 1 }; };
		const onLoad = (s) => { if (!s?.state?.__env) throw new Error('拒绝：无版本信封'); };
		H().save.onSave.add(onSave);
		H().save.onLoad.add(onLoad);
		try {
			State.variables.hp = 9;
			const obj = H().save.make();
			assert.eq(obj.state.__env?.saveVersion, 1, '★存时信封已挂进 save.state');
			assert.eq(State.variables.__env, undefined, '★且不污染活的故事变量');
			H().save.load(obj);
			assert.eq(State.variables.hp, 9, '好档还原');
			let threw = null;
			try { H().save.load({ state: {} }); } catch (e) { threw = e; }
			assert.ok(threw != null, '★坏档 ⇒ 处理器抛错（载入中止）');
		} finally {
			H().save.onSave.delete(onSave);
			H().save.onLoad.delete(onLoad);
		}
	});

	/* ---------- ⑤ ★与笔 1 合拢后的**地基判据**（`#1820` D 席 MAJOR） ---------- */

	test('★合拢：往返后 `snapshot()` **不含信封键**（信封在 save 顶层，✗ 变量表）', () => {
		/* 笔 1 的 `install()` 是**装载期订阅**（本档与之合拢后常驻）⇒ 若它把版本信封写进
		 * `save.state`，仿真的 `load()` 会把整个 `state` 当变量表 adopt ⇒ 信封**泄漏进
		 * `State.variables`**、进而污染 `snapshot()`/`digest()`（本档首版即此，被 D 席探针抓出）。
		 * 真实引擎 `unmarshalForSave` 只认 `state` 的四个已知键 ⇒ **信封挂 `save` 顶层**才不污染。 */
		const rpgSave = R().save;
		if (rpgSave?.installed == null || !rpgSave.installed()) {
			/* 笔 1 未接入（本档可独立运行）⇒ 无信封可言，判据退化 */
			return;
		}
		/* ★经 `host.state.set`（✗ `State.variables = …` 直接赋值 —— 那只改属性、不改仿真的闭包绑定，
		 *   本格首版即栽在此，正是 D 席 NIT-4 的同款坑）。 */
		H().state.set({ hp: 7, sceneId: '探索', inventory: [] });
		const obj = H().save.make();
		H().save.load(obj);
		const snap = SC().snapshot();
		assert.eq(snap[rpgSave.ENVELOPE_KEY], undefined,
			`★变量表里**不得**出现信封键「${rpgSave.ENVELOPE_KEY}」（泄漏即 snapshot/digest 被污染）`);
		assert.eq(State.variables[rpgSave.ENVELOPE_KEY], undefined, '★`State.variables` 同样不得含它');
		assert.eq(snap.hp, 7, '原有状态仍在（泄漏修复不得顺手丢状态）');
		assert.ok(obj[rpgSave.ENVELOPE_KEY] != null, '★信封确实**写了**（只是写在 save 顶层）');
	});

	test('★合拢：`digest` 在多次往返下**稳定**（单一比较口径的地基）', () => {
		const rpgSave = R().save;
		SC().loadFixture({ hp: 7, sceneId: '探索', inventory: [] });
		const d0 = SC().digest();
		for (let i = 0; i < 8; i++) {
			/* 逐次「存→读」等价于反复读档；信封里的 `at` 每次都变 ⇒ 一旦泄漏，digest 必漂 */
			const obj = H().save.make();
			H().save.load(obj);
			assert.eq(SC().digest(), d0, `★第 ${i + 1} 次往返后 digest 不得变（泄漏会让它逐次漂移）`);
		}
		assert.ok(rpgSave != null, '（笔 1 在否都成立：本格只依赖「往返不得改变可比较状态」）');
	});

	test('#1806 笔2：用例之间 fixture/注册表不互相污染（本档自身的卫生）', () => {
		assert.eq(Object.keys(SC().fixtures).length, 0, '★上一个用例的 fixture 已清');
		assert.eq(R().items.has('unit-gun'), false, '★探针件已清（✗ 泄漏进真树扫描）');
	});
})();
