/* `sgstory#2023`（E1 · 设计 §3「实例状态与堆叠契约」）与 `sgstory#2024`（E4 · 存档域与还原契约）**实现笔**的单测。
 *
 * 本笔扩的两层（最小扩展，其余不扩 —— 依据见 `#2023` 预勘评论）：
 *   ①**实例状态载荷** `state`：可序列化纯数据；`toJSON` **只在非空时写**（既有件快照逐字不变）；坏值两侧具名拒。
 *   ②**并槽判据 ＋ 批次按身份切分**：状态不同**不得合并**；`splitStack` 切出者**发新号**、原槽沿用原号。
 * 以及与 E4 的交界：载荷须进得了**盘**（宿主序列化面）、版本裁决面**具名拒且零副作用**。
 *
 * ⚠ 样本用**本档临时定义**的 id（`__t2023-*`）—— ✗ 借用引擎自带的件（那些件的定义会随内容笔漂移）。
 * ⚠ 每条用例先 `fresh()`（宿主输出归档 ＋ 干净背包），✗ 依赖上一条的残留。
 */
(() => {
	const R = () => setup.RPG;
	const H = () => globalThis.__host;
	const inv = () => State.variables.inventory;
	const J = (x) => JSON.stringify(x);
	/** 隔离前置：清宿主输出归档与故事变量，装一个干净背包 */
	const fresh = () => {
		H().host.reset(); H().state.reset();
		State.variables.player = { name: '甲', hp: 20, maxHp: 20, stats: {}, effects: [] };
		State.variables.inventory = [];
	};
	/** 跑一段代码并**取出**它抛的错（✗ 让断言型异常混进来 —— 那会看不出是「没拒」还是「拒错了」） */
	const 捉 = (f) => { try { f(); return null; } catch (e) { return e; } };

	/* ---------- ① 载荷：往返、四者分开、深拷 ---------- */

	test('★#2023 E1①：状态载荷**往返保留**；定义 id／实体身份／状态／次数**四者分开**；`toJSON` 深拷', () => {
		fresh();
		R().defItem({ id: '__t2023-round', name: '试件', stackable: true, charges: 3, used() {} });
		const 件 = R().createItem('__t2023-round', { state: { 脆: false, 来源: '城镇' } });
		const 快 = 件.toJSON();
		assert.eq(J(快.state), J({ 脆: false, 来源: '城镇' }), '快照须带状态载荷（✗ 只在活对象上）');
		const 回 = R().reviveItem(JSON.parse(J(快)));
		assert.eq(J(回.state), J({ 脆: false, 来源: '城镇' }), '★往返后状态逐字保留');
		assert.eq(回.entityId, 快.entityId, '★实体身份随件走（✗ 换号）');
		assert.eq(回.id, 快.id, '定义 id 是**类型**身份（与实体身份分开）');
		assert.eq(回.toJSON().charges, 快.charges, '次数与状态分开记账');
		/* 改状态 ✗ 改身份、✗ 改次数（§3 原文：四者须分开） */
		回.state = R().normalizeItemState({ 脆: true });
		assert.eq(回.entityId, 快.entityId, '★改状态 ✗ 改身份');
		assert.eq(回.toJSON().charges, 快.charges, '★改状态 ✗ 改次数');
		/* 深拷（✗ 递引用）：改快照那份 ✗ 动到活对象那份 */
		const 快2 = 件.toJSON();
		快2.state.脆 = true;
		assert.eq(件.state.脆, false, '★`toJSON` 须深拷（✗ 递引用：改快照不该改到活对象）');
		assert.eq(件.toJSON().state.脆, false, '反复取快照仍不受影响');
	});

	test('★#2023 E1①【零回归】无状态件的快照**逐字同旧形**；旧档缺 `state` ⇒ `null`（★✗ 当「已稳定」）', () => {
		fresh();
		R().give('rock', 2);
		const 槽 = inv().find((s) => s.id === 'rock');
		assert.eq(Object.prototype.hasOwnProperty.call(槽, 'state'), false,
			'★无状态的件 ✗ 多写 `state` 键（既有快照须逐字不变）');
		assert.eq(J(R().reviveItem(槽).toJSON()), J(槽), '★无状态件往返**逐字**不变（零回归）');
		/* 旧档形：只有 id 与次数（无 entityId、无 state） */
		const 回 = R().reviveItem({ id: 'rock', charges: 4 });
		assert.eq(回.state, null, '★缺 `state` ⇒ `null`＝「尚无状态」（✗ 不静默当「已稳定」—— 设计 §3 原文）');
		assert.ok(typeof 回.entityId === 'string' && 回.entityId.length > 0, '旧档缺号 ⇒ 当场补发（既有回落）');
		assert.eq(回.charges, 4, '次数照旧沿用');
	});

	test('★#2023 E1①：坏载荷**具名拒**（写侧与读侧都拒）—— ✗ 悄悄洗白成更有利状态', () => {
		fresh();
		R().defItem({ id: '__t2023-bad', used() {} });
		const 例 = (v, 名) => {
			const e = 捉(() => R().createItem('__t2023-bad', { state: v }));
			assert.ok(e, `${名} ⇒ 须拒`);
			return e;
		};
		assert.eq(例({ f() {} }, '含函数').code, 'ITEM_STATE_NOT_SERIALIZABLE', '含函数 ⇒ 具名 code');
		assert.eq(例({ n: NaN }, 'NaN').code, 'ITEM_STATE_NOT_SERIALIZABLE', 'NaN ⇒ 具名 code');
		assert.eq(例({ u: undefined }, 'undefined 值').code, 'ITEM_STATE_NOT_SERIALIZABLE', 'undefined 值 ⇒ 具名 code');
		assert.eq(例({ d: new Date() }, '类实例').code, 'ITEM_STATE_NOT_SERIALIZABLE', '类实例 ⇒ 具名 code');
		assert.eq(例([1, () => {}], '数组里含函数').code, 'ITEM_STATE_NOT_SERIALIZABLE', '数组内也逐层校验');
		const 环 = {}; 环.自 = 环;
		assert.eq(例(环, '循环引用').code, 'ITEM_STATE_CYCLIC', '循环引用 ⇒ 具名 code（✗ 栈溢出）');
		/* 读侧：坏档里的坏载荷同样具名拒（✗ 静默当 null） */
		assert.eq(捉(() => R().reviveItem({ id: '__t2023-bad', state: { f() {} } })).code,
			'ITEM_STATE_NOT_SERIALIZABLE', '★读侧坏载荷 ⇒ 具名拒');
		/* 写侧：活对象被改脏 ⇒ `toJSON` 也拒（✗ 让脏值上盘） */
		const 件 = R().createItem('__t2023-bad');
		件.state = { f() {} };
		assert.eq(捉(() => 件.toJSON()).code, 'ITEM_STATE_NOT_SERIALIZABLE', '★写侧脏载荷 ⇒ 具名拒（✗ 上盘）');
		/* 公开规整口：`undefined` 视同缺省 ⇒ `null`（✗ 抛） */
		assert.eq(R().normalizeItemState(undefined), null, '规整口把 undefined 视同缺省');
		assert.eq(J(R().normalizeItemState({ a: [1, 'x', true, null] })), J({ a: [1, 'x', true, null] }),
			'合法载荷原样保留');
	});

	/* ---------- ② 并槽判据：同 id 不同状态不得合并 ---------- */

	test('★#2023 E1②：同 id **不同状态不得合并**（两条各持自号）；同状态仍并槽（沿用既有批次约定）', () => {
		fresh();
		R().defItem({ id: '__t2023-stack', name: '试件', stackable: true, charges: 5, used() {} });
		const 投 = (charges, state) => R().deposit(inv(), '__t2023-stack', 1, { id: '__t2023-stack', charges, state });
		投(2, { 脆: false });
		投(3, { 脆: false });
		assert.eq(inv().filter((s) => s.id === '__t2023-stack').length, 1, '同状态 ⇒ 并槽（既有约定不动）');
		assert.eq(inv().find((s) => s.id === '__t2023-stack').charges, 5, '数量相加（2+3）');
		投(1, { 脆: true });
		const 两条 = inv().filter((s) => s.id === '__t2023-stack');
		assert.eq(两条.length, 2, '★同 id 不同状态 ⇒ **两条**（✗ 混栈）');
		assert.ok(两条[0].entityId !== 两条[1].entityId, '★两条各持自号（✗ 复制同号）');
		assert.eq(R().stateCompatible(两条[0], 两条[1]), false, '判据自证：状态不兼容');
		/* 再来一件乙态 ⇒ 并进乙槽（✗ 并进甲槽、✗ 又起一条） */
		投(2, { 脆: true });
		const 两条2 = inv().filter((s) => s.id === '__t2023-stack');
		assert.eq(两条2.length, 2, '仍两条（✗ 三条）');
		assert.eq(两条2.filter((s) => s.state?.脆 === true)[0].charges, 3, '乙态槽 1+2＝3');
		assert.eq(两条2.filter((s) => s.state?.脆 === false)[0].charges, 5, '甲态槽不受影响');
		/* 无状态件仍按 id 并槽（✗ 被本笔改成「一律不合并」） */
		R().give('rock', 2);
		assert.eq(inv().filter((s) => s.id === 'rock').length, 1, '无状态件并槽语义不变');
	});

	/* ---------- ③ 批次按身份切分 ---------- */

	test('★#2023 E1③：`splitStack` 切出**独立一件**（新号）／原槽**沿用原号**／余量守恒；非法入参具名拒且零变化', () => {
		fresh();
		R().defItem({ id: '__t2023-split', name: '试件', stackable: true, charges: 9, used() {} });
		R().deposit(inv(), '__t2023-split', 1, { id: '__t2023-split', charges: 7, state: { 脆: false } });
		const 槽 = inv().find((s) => s.id === '__t2023-split');
		const 原号 = 槽.entityId;
		const 新件 = R().splitStack(inv(), 原号, 3);
		assert.eq(新件.charges, 3, '切出 3 份');
		assert.ok(新件.entityId !== 原号, '★切出者发**新号**（✗ 不把同一个号复制给两件独立装备 —— §3.3 红线）');
		assert.eq(槽.entityId, 原号, '★留在原槽的那份沿用原号');
		assert.eq(槽.charges, 4, '余量守恒（7−3）');
		assert.eq(J(新件.state), J(槽.state), '★状态随件走（切出者与原槽同状态 —— 正是「同状态才并槽」的另一面）');
		assert.eq(inv().filter((s) => s.id === '__t2023-split').length, 2, '袋里两条');
		assert.eq(R().splitStack(inv(), 新件.entityId, 1).charges, 1, '切出那件**自己也能再切**（号已入高水位）');
		/* 非法入参：**先判后改** ⇒ 零变化（逐字对比） */
		const 前 = J(inv());
		for (const [名, f] of [
			['n=0', () => R().splitStack(inv(), 原号, 0)],
			['n 为小数', () => R().splitStack(inv(), 原号, 1.5)],
			['n ≥ 余量', () => R().splitStack(inv(), 原号, 4)],
			['未知实体号', () => R().splitStack(inv(), 'it-不在袋里的号', 1)],
			['第一参非数组', () => R().splitStack(null, 原号, 1)],
		]) {
			const e = 捉(f);
			assert.ok(e && String(e.code).startsWith('STACK_SPLIT_'), `${名} ⇒ 具名拒（实得 ${e && e.code}）`);
			assert.eq(J(inv()), 前, `${名} ⇒ **零变化**`);
		}
		/* 非叠加件 ⇒ 切分不适用（✗ 把「两件同类」写成「一件裂成两半」） */
		R().give('iron-key', 1);
		const 键 = inv().find((s) => s.id === 'iron-key');
		assert.eq(捉(() => R().splitStack(inv(), 键.entityId, 1)).code, 'STACK_SPLIT_NOT_STACKABLE',
			'非叠加件 ⇒ 具名拒');
	});

	/* ---------- ④ 与 E4 的交界：进得了盘、裁决面具名拒且零副作用 ---------- */

	test('★#2024 E4：载荷进得了**盘**（宿主序列化面）；未知／坏版本**具名拒**且**零副作用**', () => {
		fresh();
		R().defItem({ id: '__t2024-item', name: '试件', stackable: true, charges: 2, used() {} });
		R().deposit(inv(), '__t2024-item', 1, { id: '__t2024-item', charges: 2, state: { 脆: true, 来源: '城镇' } });
		assert.eq(inv().filter((s) => s.id === '__t2024-item').length, 1, '域 1（背包）里有落点');
		/* 宿主序列化＝`State.variables` 的 JSON 往返（`80-save.js:14` 的分工：宿主管序列化/反序列化） */
		const 盘 = JSON.parse(J(State.variables));
		const 回 = 盘.inventory.find((s) => s.id === '__t2024-item');
		assert.eq(J(回.state), J({ 脆: true, 来源: '城镇' }), '★载荷进得了盘（✗ 只在活对象上）');
		assert.eq(J(R().reviveItem(回).state), J({ 脆: true, 来源: '城镇' }), '从盘还原后仍在');
		/* 域键快照：只记「该域此刻有没有落点」（✗ 记值 —— 值由宿主序列化） */
		const 封 = R().save.envelope();
		assert.ok(封.domains.includes('inventory'), '域键快照记到 inventory');
		assert.ok(!封.domains.includes('flags'), '★没落点的域 ✗ 混进快照（`flags` 现不存在 ⇒ 预留位）');
		assert.eq(封.saveVersion, 1, '信封带版本');
		/* 版本裁决：未知／坏版本一律具名拒（✗ 猜、✗ 默认稳定） */
		const 判 = (v) => (v === '__null__' ? R().save.judgeLoad(null) : R().save.judgeLoad({ saveVersion: v, pack: 封.pack, domains: 封.domains }));
		for (const v of ['__null__', undefined, null, '2', 2.5, 'abc', 0, -1, {}]) {
			const r = 判(v);
			assert.eq(r.ok, false, `版本 ${J(v)} ⇒ 须拒`);
			assert.eq(r.code, 'NO_ENVELOPE', `版本 ${J(v)} ⇒ 具名 code（实得 ${r.code}）`);
		}
		assert.eq(判(99).code, 'TOO_NEW', '高于本版 ⇒ TOO_NEW（具名）');
		assert.eq(判(1).ok, true, '本版 ⇒ 放行');
		/* 裁决是**纯函数**：拒之后真值**逐字未变**（✗ 静默丢物 —— 坏档取自夹具，✗ 动真档） */
		assert.eq(J(State.variables.inventory), J(inv()), '裁决不动背包真值');
		assert.eq(inv().filter((s) => s.id === '__t2024-item')[0].charges, 2, '件数不变');
	});

	test('★#2024 E4【正控对照】:裁决面**读得懂**的信封放行，且审计口能看见「已声明但没落点」的域', () => {
		fresh();
		const 封 = R().save.envelope();
		assert.eq(R().save.judgeLoad(封).ok, true, '本版信封 ⇒ 放行');
		const 审 = R().save.audit(State.variables);
		assert.ok(Array.isArray(审.absent), 'audit 给出 absent 账（✗ 静默）');
		assert.ok(审.absent.includes('mapCurrent') || 审.absent.includes('sceneId'),
			`★声明了却还没落点的域须**可见**（实得 ${J(审.absent)}）`);
	});
})();
