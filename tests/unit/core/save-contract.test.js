/* core/80-save 的单元测试：M1 存档契约（`#1806` 笔 1）
 *
 * 纪律：
 *   · **往返判据守 E11**（票面边界 2）——断言**行为**（系统还认得它），✗ 只比快照值相等
 *     （值相等 ≠ 语义存活：`player.effects` 存的是 id 串，还原链断掉时值仍「相等」）；
 *   · 迁移链用 `judgeLoad` 的 `ctx` 注入口直测（✗ 为测试去改模块真值）；
 *   · 宿主接入（`install`）用**装上去的假宿主**测，✗ 依赖真 SugarCube。
 */
(() => {
	const R = () => setup.RPG;
	const S = R().save;

	/* ---------- ① 往返：**行为**等价（✗ 只比值） ---------- */

	/** 宿主往返的等价物：`State.marshalForSave`/`unmarshalForSave` 即 JSON 深克隆 */
	const hostRoundTrip = () => {
		const snap = JSON.parse(JSON.stringify(State.variables));
		State.variables = {};
		Object.assign(State.variables, JSON.parse(JSON.stringify(snap)));
	};

	test('#1806 笔1：往返后**装备态仍被系统认得**（行为断言，✗ 只比值）', () => {
		R().give('coin');                       // 触发 inv() 初始化
		State.variables.inventory.length = 0;
		R().give('sword');
		R().equip('sword');
		assert.eq(R().equippedWeapon()?.id, 'sword', '前置：已装备 sword');

		hostRoundTrip();

		/* ★行为：不是「快照里 equipped 字段还是 true」，而是**读面还能解析出来** */
		assert.eq(R().isEquipped('sword'), true, '★往返后 isEquipped 仍为真');
		assert.eq(R().equippedWeapon()?.id, 'sword', '★往返后 equippedWeapon() 仍解析得出（id→实例还原链活着）');
		/* 且还原出的是**实例**（有方法），✗ 裸快照 —— 这正是「值相等 ≠ 语义存活」的分界 */
		assert.eq(typeof R().equippedWeapon()?.used, 'function', '★还原出的是实例（有 used 方法），不是裸对象');
	});

	test('#1806 笔1：往返后**地图位置**仍生效（域 3）', () => {
		State.variables.mapCurrent = 'kitchen';
		hostRoundTrip();
		assert.eq(State.variables.mapCurrent, 'kitchen', '位置 id 往返');
	});

	test('#1806 笔1：往返后**有界通知缓冲**存活（域 5；★不逐字比数组——工料单陷阱 4）', () => {
		const N = R().notice ?? R().notices;
		if (N?.push) {
			N.push({ kind: 'info', text: '测试通知' });
			const n1 = State.variables.rpgNotices.length;
			hostRoundTrip();
			assert.eq(State.variables.rpgNotices.length, n1, '长度往返（✗ 不比整数组对象）');
		} else {
			assert.ok(Array.isArray(State.variables.rpgNotices ?? []), '通知域存在（该构建未挂通知 API 时至少形态成立）');
		}
	});

	/* ---------- ② 显式拒绝（票面：过老 ⇒ 拒绝，✗ 静默坏） ---------- */

	test('#1806 笔1：**无版本标记**的存档 ⇒ 显式拒绝（可读文案）', () => {
		const r = S.judgeLoad(null);
		assert.eq(r.ok, false, 'null 信封 ⇒ 拒');
		assert.eq(r.code, 'NO_ENVELOPE');
		assert.ok(/拒绝/.test(r.message) || /旧版/.test(r.message), `文案可读：${r.message}`);

		const r2 = S.judgeLoad({ pack: 'dnd3' });          // 有信封但无版本号
		assert.eq(r2.ok, false, '无 saveVersion ⇒ 拒（✗ 猜成 v1）');
		assert.eq(r2.code, 'NO_ENVELOPE');

		const r3 = S.judgeLoad({ saveVersion: 'v1' });      // 非整数
		assert.eq(r3.ok, false, '版本非整数 ⇒ 拒');
	});

	test('#1806 笔1：**来自更新版本**的存档 ⇒ 显式拒绝（✗ 尽力载入）', () => {
		const r = S.judgeLoad({ saveVersion: S.VERSION + 5 });
		assert.eq(r.ok, false, '未来版本 ⇒ 拒');
		assert.eq(r.code, 'TOO_NEW');
		assert.ok(r.message.includes(String(S.VERSION + 5)), `文案含版本号：${r.message}`);
	});

	test('#1806 笔1：**过旧且无迁移路径** ⇒ 显式拒绝（✗ 静默坏档 = M1 原病）', () => {
		/* VERSION=1 且 MIGRATIONS 暂无 v0→v1 ⇒ 这一路径就是「迁移链缺失」的真实形态 */
		const r = S.judgeLoad({ saveVersion: 1 }, { version: 3, migrations: {}, ready: () => true });
		assert.eq(r.ok, false, '缺 v1→v2 ⇒ 拒');
		assert.eq(r.code, 'TOO_OLD');
	});

	/* ---------- ③ 迁移链（逐级；✗ 跳级） ---------- */

	test('#1806 笔1：迁移链**逐级执行**且可标为当前版本', () => {
		const seen = [];
		const migrations = {
			1: (p) => { seen.push(1); return { ...p, m1: true }; },
			2: (p) => { seen.push(2); return { ...p, m2: true }; },
		};
		const r = S.judgeLoad({ saveVersion: 1 }, { version: 3, migrations, ready: () => true });
		assert.eq(r.ok, true, '有完整链 ⇒ 迁成');
		assert.eq(seen.join(','), '1,2', '★逐级且按序（✗ 跳级）');
		assert.eq(r.payload.saveVersion, 3, '结果标记为当前版本');
		assert.eq(r.payload.m1, true, '第 1 级生效');
		assert.eq(r.payload.m2, true, '第 2 级生效');
	});

	test('#1806 笔1：已是当前版本 ⇒ 原样通过（✗ 空跑迁移）', () => {
		const r = S.judgeLoad(S.envelope());
		assert.eq(r.ok, true, '本版信封自洽');
		assert.eq(r.payload.saveVersion, S.VERSION);
	});

	/* ---------- ④ 时序前提（工料单陷阱 1：还原须在包注册之后） ---------- */

	test('#1806 笔1：**注册表未就位** ⇒ 拒绝载入（时序前提不满足）', () => {
		const r = S.judgeLoad({ saveVersion: 1 }, { ready: () => false });
		assert.eq(r.ok, false, '包未注册 ⇒ 拒（效果/道具 id 无法解释）');
		assert.eq(r.code, 'NOT_READY');
	});

	test('#1806 笔1：真环境注册表**已就位**（本包加载后即满足前提）', () => {
		assert.eq(S.ready(), true, 'items/effects/characters/stocks 皆在');
	});

	/* ---------- ⑤ 域契约审计（让「格式说支持、实现没有」可见） ---------- */

	test('#1806 笔1：`audit()` 报出**预留下**的域（flags 现不存在）与版本', () => {
		const a = S.audit({});
		assert.eq(a.version, S.VERSION);
		assert.ok(a.reserved.includes('flags'), `★flags 是预留位（工料单 §〇.9）：${a.reserved}`);
		assert.ok(a.absent.length > 0, '空状态 ⇒ 全部声明域皆「未落地」（可见，✗ 静默）');
		assert.eq(S.audit({ player: {}, inventory: [] }).absent.includes('player'), false, '有落点 ⇒ 不再报缺');
	});

	/* ---------- ⑤·补 声明的边界（`#1817` D 席 RC：声明＞实现 ⇒ 逐条钉住） ---------- */

	test('#1806 笔1：★VERSION 自 1 起 ⇒ **v0 结构性不可达**（`MIGRATIONS[0]` 不留占位）', () => {
		/* D 席 RC：注释里若留 `// 0: …（有旧档时在此补）`，会承诺一个**永远跑不到**的扩展点
		 * —— `judgeLoad` 的 `v < 1` 守卫把 v0 判为「没有版本标记」。
		 * 本格**钉住该语义**（v0 与被拒绝同义），使「本格式自 v1 起、不存在 v0」成为可验事实。 */
		const r = S.judgeLoad({ saveVersion: 0 });
		assert.eq(r.ok, false, 'v0 不是可迁移档');
		assert.eq(r.code, 'NO_ENVELOPE', '★v0 与「无版本标记」同义（而非 TOO_OLD）');
		/* ★`#1822` ③（D 席 MINOR，dev-9 指出）：原断 `Object.keys(MIGRATIONS).length === 0` ——
		 *   **网撒得比主张大**：本格的主张只是「**v0 不留迁移位**」，而原式把**任何**迁移都禁掉了。
		 *   一旦**合法地**加一级迁移（如 `1:` 即 v1→v2 —— 正是票面边界 3 要求的动作），它会**误红**。
		 *   ⇒ 改为断**主张本身**：`!('0' in MIGRATIONS)`（v0 无路可走）。 */
		assert.eq('0' in S.MIGRATIONS, false, '★v0 **无迁移位**（= 本格主张；✗ 不断「表为空」——那会禁掉合法的 v1→v2）');
	});

	test('#1806 笔1：★`pack` 是**已记未用**（本笔只记录，✗ 不做比对）—— 该事实**可见**', () => {
		/* D 席 RC 裁 (乙)：收窄声明，并把「已记未用」显式登记 ⇒ 读者不会把「已记」误读成「已解决」。 */
		const a = S.audit({});
		assert.ok(Array.isArray(a.recordedNotCompared), 'audit 报出「已记未用」集合');
		assert.ok(a.recordedNotCompared.includes('pack'), `★pack 在册：${a.recordedNotCompared}`);
		/* 反向钉住「确实没比」：换包信封**照样放行**（若日后落地比对，本格须随之改 + 配双向格） */
		const r = S.judgeLoad({ saveVersion: S.VERSION, pack: '某个别的包' });
		assert.eq(r.ok, true, '★当前：换包**不拦**（＝未实现比对，与 recordedNotCompared 一致）');
	});

	test('#1806 笔1：信封记 **pack 标记**（跨包遮蔽的**第一步**）与域落点', () => {
		State.variables.inventory = [];
		const e = S.envelope();
		assert.eq(e.saveVersion, S.VERSION, '带版本号');
		assert.ok(typeof e.pack === 'string' && e.pack.length > 0, `带来源包标记：${e.pack}`);
		assert.ok(e.domains.includes('inventory'), '已落地的域进 domains');
		assert.ok(!e.domains.includes('flags'), '★未落地的域**不得**谎报为已存');
	});

	/* ---------- ⑤·补二 故事侧域登记口（`#1902`：`books#132` 的 `$span1Arc`） ---------- */

	test('#1902：故事侧登记域 ⇒ 进 envelope().domains 与 audit()（✗ 谎报已存、✗ 覆盖内置）', () => {
		assert.eq(S.declareDomain('span1Arc', 'byPack'), true, '新名 ⇒ 登记成功');
		assert.eq(S.declareDomain('span1Arc', 'byPack'), false, '同名重复 ⇒ false（幂等，✗ 静默改语义）');
		assert.eq(S.declareDomain('player', 'player'), false, '★内置域**不得**被故事侧覆盖');
		assert.eq(S.declareDomain('', 'byPack'), false, '空串拒绝');
		assert.eq(S.declareDomain(1, 'byPack'), false, '非字符串拒绝');
		/* ★判别性：域快照**只记「有没有落点」**——登记 ≠ 谎报已存（与 `flags` 同一条约束） */
		assert.ok(S.envelope({ span1Arc: { farms: 0 } }).domains.includes('span1Arc'), '已登记且**有落点**的键进 domains');
		assert.ok(!S.envelope({}).domains.includes('span1Arc'), '★登记过但**没写过**的键**不得**报为已存');
		assert.ok(S.audit({}).absent.includes('span1Arc'), 'audit：已声明但未写 ⇒ 见 absent（可见，✗ 静默）');
		assert.eq(S.DOMAINS.span1Arc, 'byPack', '★导出的 DOMAINS 是**合并视图**（✗ 陈旧面：读者据它判「有无此域」会答错）');
		assert.eq(S.DOMAINS.player, 'player', '★合并视图**不丢内置键**（登记口 ✗ 变成替换）');
	});

	/* ---------- ⑤·补 纯环境健壮性（✗ `State` 未声明即抛） ---------- */

	test('#1806 笔1：**无 `State` 全局**时各入口不抛（`?.` 不防未声明标识符）', () => {
		/* `State?.variables` 只防 null/undefined —— `State` **未声明**时仍抛 ReferenceError。
		 * 纯 core / node 环境正是这一形 ⇒ 模块须走 `typeof State` 防护（与 `71-notice.js` 同形）。 */
		const prev = globalThis.State;
		try {
			delete globalThis.State;
			const e = S.envelope();                       // 默认参走安全访问器
			assert.eq(e.saveVersion, S.VERSION, 'envelope() 在无 State 时仍给出信封');
			assert.ok(Array.isArray(e.domains) && e.domains.length === 0, '无 State ⇒ 域落点为空（✗ 抛）');
			assert.eq(S.audit().version, S.VERSION, 'audit() 不抛');
			assert.eq(typeof S.currentPack(), 'string', 'currentPack() 不抛');
		} finally {
			globalThis.State = prev;
		}
	});

	/* ---------- ⑥ 宿主接入（幂等；✗ 无宿主时抛错） ---------- */

	/* 宿主无关：本格不假设环境里有没有 `Save` —— 单测 shim 起初没有，而 `#1806` 笔 2 的
	 * 宿主仿真会提供 `Save` ⇒ 断言「一定是 false」会在两笔之间互相绊倒。
	 * 故断言**不变量**：接入状态 ⇔ 当前宿主是否存在；且**任何情况下都不得抛**。 */
	test('#1806 笔1：`install()` 不抛；接入状态与宿主存在性一致（宿主无关）', () => {
		/* ★探测须**镜像 `install()` 的查找**：`SugarCube.Save ?? 全局 Save`（shims 设的是后者） */
		const probe = globalThis.SugarCube?.Save ?? globalThis.Save;
		const hasHost = probe?.onSave?.add != null;
		let ret = null;
		try { ret = S.install(); } catch (e) { assert.ok(false, `install() 不得抛：${e.message}`); }
		assert.eq(S.installed(), hasHost, `接入状态应与宿主存在性一致（hasHost=${hasHost}）`);
		assert.eq(ret, false, '二次调用幂等（或：无宿主时返回 false）—— 两种情形都不抛');
	});

	test('#1806 笔1：驱动**真实注册的**处理器 —— 存时写信封、裁决面拒坏档', () => {
		/* 走 `install()` 实际注册的那套处理器（✗ 自造 handler 自测自）⇒ 本格同时证明
		 * 「模块加载时确实接上了宿主」。 */
		const host = globalThis.SugarCube?.Save ?? globalThis.Save;
		if (host?.onSave?.fire == null) {
			assert.eq(S.installed(), false, '无宿主 ⇒ 未接入（且 install 未抛）');
			return;
		}
		assert.eq(S.installed(), true, '★宿主在位 ⇒ 模块加载时已接入（安装确实发生）');

		/* 存：真处理器把信封挂 **`save` 顶层**（✗ `save.state` ——
		 *   那是引擎的 `{index, history, …}` 结构，混入会被变量表读到；`#1820` D 席 RC 裁甲） */
		State.variables.inventory = [];
		const obj = { state: {} };
		host.onSave.fire(obj);
		assert.eq(obj[S.ENVELOPE_KEY]?.saveVersion, S.VERSION, '★存时写入版本信封（顶层）');
		assert.eq(obj.state[S.ENVELOPE_KEY], undefined, '★且**不**写进 state（✗ 污染变量表）');
		assert.eq(State.variables[S.ENVELOPE_KEY], undefined, '★且**不**污染活的 State.variables');

		/* 读：好档放行（不抛）—— 信封从**顶层**取 */
		host.onLoad.fire({ state: {}, [S.ENVELOPE_KEY]: S.envelope() });

		/* 读：坏档 ⇒ 真处理器**显式抛错**（宿主据此中止载入，✗ 静默坏档）。
		 *   宿主仿真的 `fire` 可能把抛错吞掉 ⇒ 两条路都核，且都要求「不进坏档」。 */
		let threw = null;
		try { host.onLoad.fire({ state: {} }); } catch (e) { threw = e; }
		if (threw != null) {
			assert.eq(threw.rpgSaveReject, 'NO_ENVELOPE', '★错误带机读码，供宿主/测试判别');
		}
		assert.eq(S.judgeLoad(undefined).code, 'NO_ENVELOPE', '裁决面仍拒（处理器逻辑不变）');
	});

	/* ═══ `#1859`（P0）：存档须**并入当前段落的活跃变量**（✗ 只存 `_history` 的旧快照）═══
	 *
	 * 引擎行为（本席读 SC 2.37 源码 ＋ jsdom 实证）：`State.variables` ⟶ `_active.variables`；
	 *   `marshalForSave()` ⟶ `clone(_history)` ⇒ **不含活跃变量** ⇒ 自环段落（按钮不导航，如巴别地图）
	 *   期间的写入**从不进 `_history`** ⇒ 存档只捕获「进入该段落那一刻」的快照（操作者实测的 P0）。
	 * ⇒ 契约的 `onSave` 用**活跃变量**覆盖存档里**当前时刻**的 `variables`。 */

	test('★#1859：onSave 把**活跃变量**并入存档的**当前时刻**（✗ 只存旧快照）', () => {
		const host = globalThis.SugarCube?.Save ?? globalThis.Save;
		if (host?.onSave?.fire == null) { assert.ok(true, '无宿主 ⇒ 本条不适用'); return; }
		/* 造**真 SugarCube 形**的存档对象（`{index, history:[{title, variables}]}`）。 */
		const obj = { state: { index: 1, history: [
			{ title: 'L1 苏醒', variables: { mapCurrent_babel: 'L1' } },
			{ title: '探索', variables: { mapCurrent_babel: 'L1' } },   // ← 进入该段落时的**旧快照**
		] } };
		/* 「当前段落期间的写入」：只落活跃变量表，✗ 落 history（这就是缺陷的形态） */
		State.variables.mapCurrent_babel = 'L4';
		State.variables.marked = 'live';
		try {
			host.onSave.fire(obj);
			/* ★判据：当前时刻拿到**活跃**变量 */
			assert.eq(obj.state.history[1].variables.mapCurrent_babel, 'L4',
				'★当前时刻须并入活跃变量（✗ 旧快照 L1 ⇒ 读档后位置回退）');
			assert.eq(obj.state.history[1].variables.marked, 'live', '当前段落期间的**任何**新键同样并入');
			/* ★反例：**其它**时刻不得被波及（只碰 `index` 指向的那一个） */
			assert.eq(obj.state.history[0].variables.mapCurrent_babel, 'L1',
				'其它时刻**保持原样**（✗ 把整条历史都刷成活跃变量）');
			assert.eq(obj.state.history[0].variables.marked, undefined, '其它时刻不沾新键');
		} finally {
			delete State.variables.marked;
			delete State.variables.mapCurrent_babel;
		}
	});

	test('#1859：`save.state` 非 `{index, history}` 形（仿真／旧档）⇒ **静默 no-op**（✗ 抛错、✗ 抹掉）', () => {
		const host = globalThis.SugarCube?.Save ?? globalThis.Save;
		if (host?.onSave?.fire == null) { assert.ok(true, '无宿主 ⇒ 本条不适用'); return; }
		/* ⚠ 仿真与旧档是**扁平** state（变量直挂 state）⇒ 不得在此路径上改动它 */
		const flat = { state: { hp: 7 } };
		const empty = { state: {} };
		const noState = {};
		State.variables.probe = 'x';
		try {
			host.onSave.fire(flat);
			host.onSave.fire(empty);
			host.onSave.fire(noState);
			assert.eq(flat.state.hp, 7, '扁平 state **原样保留**（✗ 被覆盖或抹掉）');
			assert.eq(Object.keys(empty.state).length, 0, '空 state 不被塞入变量');
			assert.eq(noState.state, undefined, '无 state 的对象不被凭空加 state');
			/* 三者的信封仍须照常挂上（本条只验**变量并入**的形不匹配路径 ⇒ 信封不受影响） */
			assert.eq(flat[S.ENVELOPE_KEY]?.saveVersion, 1, '信封照常写（形不匹配 ✗ 阻断信封）');
		} finally { delete State.variables.probe; }
	});

	/* ---------- ★`sgstory#1936`（轨B·显式进度）：进度账**读口**三面（第三面＝三消费方归 books/dev-10） ----------
	 * 本读口是**纯函数**（入参 `stateVars`，缺省取 `vars()`）⇒ 判据直接喂**字面量**，✗ 不污染 `State`。
	 * ⚠ 本档基线是 **CRLF** ⇒ 改本档**必须**按字节级写（我第一版用 text 模式写 ⇒ 整档被翻成 LF ⇒ 行尾门当场红 ✓）。 */
	test('★`#1936` 进度账读口①【往返】：新键在位 ⇒ 读它（形状固定／集合去重／**给的是快照**）', () => {
		const 账 = (v) => S.progress(v);
		assert.eq(JSON.stringify(账({ rpgProgress: { run: { cleared: ['L9', 'boss:不眠者'] } } })),
			JSON.stringify({ run: { cleared: ['L9', 'boss:不眠者'] } }), '新键在位 ⇒ 逐字读出（形状固定 `{run:{cleared:[]}}`）');
		assert.eq(JSON.stringify(账({ rpgProgress: { run: { cleared: ['a', 'a', 'b'] } } })),
			JSON.stringify({ run: { cleared: ['a', 'b'] } }), '「已过＝集合」⇒ 同 id 重复只算一次');
		/* ★快照：读口**不得**递内部引用（否则调用方一改，账就跟着变 —— 与 `55-session` 的 `facts()` 同旨） */
		const 读 = 账({ rpgProgress: { run: { cleared: ['a'] } } });
		读.run.cleared.push('偷偷加的');
		assert.eq(JSON.stringify(账({ rpgProgress: { run: { cleared: ['a'] } } })),
			JSON.stringify({ run: { cleared: ['a'] } }), '★读口须给**快照**（改返回值 ✗ 不得回头影响账）');
	});

	test('★`#1936` 进度账读口②a【旧名回落】：旧档**不迁移也读得出**（旧形 ⇒ 合成同一形状）', () => {
		const 账 = (v) => S.progress(v);
		/* 旧形＝`babelRun.bosses`（`books#180` 的进度账），只有 `'victory'` 算「已过」 */
		assert.eq(JSON.stringify(账({ babelRun: { bosses: { L9: 'victory', L5: 'defeat' } } })),
			JSON.stringify({ run: { cleared: ['L9'] } }), '★旧形 ⇒ **合成同一形状**（只认 `victory`）');
		assert.eq(JSON.stringify(账({})), JSON.stringify({ run: { cleared: [] } }), '两者皆无 ⇒ **空账**（✗ 抛）');
		assert.eq(JSON.stringify(账({ babelRun: { bosses: null } })), JSON.stringify({ run: { cleared: [] } }), '旧形坏值 ⇒ 空账（✗ 崩）');
	});

	test('★`#1936` 进度账读口②b【新旧同时在 ⇒ **新键优先**】：✗ 合并（两套真值是最坏的结局）', () => {
		const 账 = (v) => S.progress(v);
		assert.eq(JSON.stringify(账({ rpgProgress: { run: { cleared: ['新'] } }, babelRun: { bosses: { 旧: 'victory' } } })),
			JSON.stringify({ run: { cleared: ['新'] } }), '★新键在位 ⇒ 只读新键（✗ 把旧键并进来）');
	});

	/* ---------- ★`#1936` **写口**（与读口对称）：写新键、读新键；旧名只在读档回落 ---------- */
	test('★`#1936` 进度账写口③【往返 ＋ **幂等**】：写后读得到；重复写同 id ⇒ 账**逐字不变**', () => {
		const 箱 = {};
		assert.eq(JSON.stringify(S.recordCleared('L9', 箱)), JSON.stringify({ run: { cleared: ['L9'] } }), '写后**立刻**读得到');
		assert.eq(JSON.stringify(S.progress(箱)), JSON.stringify({ run: { cleared: ['L9'] } }), '往返：写口与读口**形状逐字同**');
		S.recordCleared('L9', 箱); S.recordCleared('L9', 箱);
		assert.eq(JSON.stringify(S.progress(箱)), JSON.stringify({ run: { cleared: ['L9'] } }), '★重复写同 id ⇒ **幂等**（集合语义）');
		/* ★★这条是**有牙**的那条：只断**读口**不够 —— 读口本来就 `new Set()` 去重 ⇒ 写口不守幂等**也**读不出来
		 *   （★我第一版只断读口 ⇒ 那把「幂等守卫摘掉」刀下下去**零红** ✗ ⇒ 格没牙）。
		 *   ⇒ 断**档里存的东西**：集合语义须**按字面**存（✗ 靠读口"顺手去重" ✗ —— 存进去的重复会随档带走）。 */
		assert.eq(JSON.stringify(箱.rpgProgress.run.cleared), JSON.stringify(['L9']),
			'★档里**不得**存重复（写口须自己守幂等，✗ 只靠读口去重）');
		S.recordCleared('L5', 箱);
		assert.eq(JSON.stringify(S.progress(箱)), JSON.stringify({ run: { cleared: ['L9', 'L5'] } }), '★后写的 id 续在后面（顺序稳定）');
	});

	test('★`#1936` 进度账写口④【旧形**归并一次**，此后只读新键】：老档进度✗ 不许因一笔而丢', () => {
		const 档 = { babelRun: { bosses: { L9: 'victory', L3: 'defeat' } } };
		assert.eq(JSON.stringify(S.recordCleared('L7', 档)), JSON.stringify({ run: { cleared: ['L9', 'L7'] } }),
			'★旧形在位时写一笔 ⇒ **归并**（旧形里只有 `victory` 的算过），✗ 丢掉老档的已过');
		assert.ok(档.rpgProgress != null, '★写的是**新键**（✗ 写旧键 ⇒ 造出第二个真值源）');
		/* ★闭环证据：此后**只**读新键 —— 我往旧形里再塞一个"已过"，读数**不得**跟着变 */
		档.babelRun.bosses.暗改 = 'victory';
		assert.eq(JSON.stringify(S.progress(档)), JSON.stringify({ run: { cleared: ['L9', 'L7'] } }),
			'★新键在位之后 ⇒ 旧形的后续改动**不可见**（两套真值不可能同时成立）');
	});

	test('★`#1936` 进度账写口⑤【坏宿主不崩】：传入一个空对象 ⇒ 照写它并返回账（✗ 抛）', () => {
		const 空 = {};
		const 得 = S.recordCleared('X', 空);
		assert.eq(JSON.stringify(得), JSON.stringify({ run: { cleared: ['X'] } }), '空对象照样能当账写（判据/单测即这么用）');
		assert.eq(JSON.stringify(空.rpgProgress), JSON.stringify({ run: { cleared: ['X'] } }), '确实落在**新键**上');
	});

})();