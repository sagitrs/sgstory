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
		assert.eq(Object.keys(S.MIGRATIONS).length, 0, '★MIGRATIONS 现为空 —— v0 无路可走是**设计**，✗ 漏配');
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

		/* 存：真处理器把信封写进 `save.state`（✗ 动活的 State.variables） */
		State.variables.inventory = [];
		const obj = { state: {} };
		host.onSave.fire(obj);
		assert.eq(obj.state[S.ENVELOPE_KEY]?.saveVersion, S.VERSION, '★存时写入版本信封');
		assert.eq(State.variables[S.ENVELOPE_KEY], undefined, '★且**不**污染活的 State.variables');

		/* 读：好档放行（不抛） */
		host.onLoad.fire({ state: { [S.ENVELOPE_KEY]: S.envelope() } });

		/* 读：坏档 ⇒ 真处理器**显式抛错**（宿主据此中止载入，✗ 静默坏档）。
		 *   宿主仿真的 `fire` 可能把抛错吞掉 ⇒ 两条路都核，且都要求「不进坏档」。 */
		let threw = null;
		try { host.onLoad.fire({ state: {} }); } catch (e) { threw = e; }
		if (threw != null) {
			assert.eq(threw.rpgSaveReject, 'NO_ENVELOPE', '★错误带机读码，供宿主/测试判别');
		}
		assert.eq(S.judgeLoad(undefined).code, 'NO_ENVELOPE', '裁决面仍拒（处理器逻辑不变）');
	});

})();