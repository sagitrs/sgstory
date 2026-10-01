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

	test('#1806 笔1：信封记 **pack 标记**（`#1743` 跨包遮蔽解）与域落点', () => {
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

	test('#1806 笔1：无宿主环境 `install()` 为 no-op（✗ 抛错）', () => {
		/* 本仓单测 shim 的 SugarCube 无 Save ⇒ 加载期那次 install 已返回 false */
		assert.eq(typeof S.install, 'function');
		assert.eq(S.installed(), false, 'shim 无 Save ⇒ 未接入（且未抛错）');
	});

	test('#1806 笔1：装**假宿主**后 —— 存时写信封、读时拒绝坏档（显式）', () => {
		const fake = { onSave: { add: (f) => fake._s = f }, onLoad: { add: (f) => fake._l = f } };
		const prev = globalThis.SugarCube?.Save;
		try {
			globalThis.SugarCube.Save = fake;
			assert.eq(S.install(), true, '有宿主 ⇒ 接入成功');

			/* 存：信封挂进 save.state（✗ 动活的 State.variables） */
			const save = { state: {} };
			fake._s(save);
			assert.eq(save.state[S.ENVELOPE_KEY]?.saveVersion, S.VERSION, '★存时写入版本信封');
			assert.eq(State.variables[S.ENVELOPE_KEY], undefined, '★且**不**污染活的 State.variables');

			/* 读：好档放行 */
			const good = { state: { [S.ENVELOPE_KEY]: S.envelope() } };
			fake._l(good);                                   // 不抛即通过

			/* 读：坏档**显式抛错**（宿主据此中止载入，✗ 静默坏档） */
			let threw = null;
			try { fake._l({ state: {} }); } catch (e) { threw = e; }
			assert.ok(threw != null, '★无版本标记 ⇒ 抛错（显式拒绝）');
			assert.eq(threw.rpgSaveReject, 'NO_ENVELOPE', '错误带机读码，供宿主/测试判别');
		} finally {
			if (prev === undefined) delete globalThis.SugarCube.Save;
			else globalThis.SugarCube.Save = prev;
		}
	});
})();
