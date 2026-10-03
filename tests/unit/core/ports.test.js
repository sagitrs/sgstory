/* L0 端口 · **交付 1 步 2 的正控与契约面**（`sgstory#1912`）
 *
 * 定位（说清本档**不**做什么，免得与 `tester-3` 的格重复）：
 *   · 她那面测的是**会话**（两会话的状态／随机源／事件／输入互不串 †）⇒ 本档**不碰**会话；
 *   · 本档只钉三件**装置性**的事：
 *     ① 契约面**在位且能报缺**（`portsReady`／`portMissing`／`portOf` —— 三者若静默，「端口不在」会与
 *        「端口正常」同形，无头面会把缺口读成绿）；
 *     ② `RenderPort` 的**收集器**真生效（无头可跑的前提）；
 *     ③ `LifecyclePort` 的**纪元判活**真能作废在飞（旧纪元输出不得落屏）；
 *     ④ `PersistContract` 在**无宿主**时走替身（且「版本对不上」**具名抛** ✗ 静默丢字段）。
 *
 * ⚠ 本档**不**断言「实现齐了哪些方法」——那是 `RPG.portContracts`（机器可读契约）的读数源，
 *   判据按它取（✗ 在判据里另抄一份方法名清单，那会在实现改动时静默失配）。
 */
(() => {
	const R = () => setup.RPG;

	test('端口①：三端口**在位**（读数＝portsReady）＋ `portMissing` 报缺**具名**＋ `portOf` 未注册**具名抛**', () => {
		const 齐 = R().portsReady();
		assert.eq(齐.length, 3, `★在位端口 ${JSON.stringify(齐)}（应 [persist,render,lifecycle]）`);

		/* 缺方法 ⇒ **具名清单**（✗ 抛错、✗ 静默接受半成品） */
		const 残 = R().portMissing('render', { output() {} });
		assert.ok(残.missing.includes('render') && 残.missing.includes('setCollector'),
			`★半成品实现的缺项清单不含预期：${JSON.stringify(残)}`);

		/* 未注册 ⇒ 取用**具名抛**（✗ 回落空实现） */
		const 存 = R().ports.lifecycle;
		delete R().ports.lifecycle;
		let 抛 = null;
		try { R().portOf('lifecycle'); } catch (e) { 抛 = e?.message ?? String(e); }
		R().ports.lifecycle = 存;
		assert.ok(抛 && /未注册/.test(抛), `★未注册却取出成功（抛＝${抛}）—— 「端口不在」与「端口正常」必须不同形`);
	});

	test('端口②：`RenderPort.setCollector` 后输出**进收集器**（✗ 落屏）', () => {
		const 收 = [];
		R().portOf('render').setCollector((条) => 收.push(条));
		try {
			R().portOf('render').output('甲行');
			R().portOf('render').render('乙块');
			assert.eq(收.length, 2, `★收集器收到 ${收.length} 条（应 2）`);
			assert.eq(收[0].text, '甲行', '★逐行输出没进收集器');
			assert.eq(收[1].kind, 'render', '★`render` 与 `output` 未分列');
		} finally { R().portOf('render').setCollector(null); }   // ★复原（✗ 把后续用例的输出吞进收集器）
	});

	test('端口③：`LifecyclePort` 纪元判活 —— `cancelPending` 后旧 token **不再算数**', () => {
		const L = R().portOf('lifecycle');
		const t0 = L._track(L._token());
		assert.eq(L.isCurrent(t0), true, '★刚登记的 token 就该算数（正控：否则下一条恒真）');
		const e0 = L.epoch();
		const 结 = L.cancelPending('换档');
		assert.ok(L.epoch() > e0, `★纪元未前进（${e0} ⇒ ${L.epoch()}）`);
		assert.eq(L.isCurrent(t0), false, '★★作废后的旧 token 仍算数 —— 旧纪元的输出会落屏');
		assert.ok(结.canceled >= 1, `★作废计数 ${结.canceled}（应 ≥1）`);
	});

	test('端口④：`PersistContract` 无宿主走替身；版本对不上**具名抛**（✗ 静默丢字段）', () => {
		const P = R().portOf('persist');
		const 事实 = { boxOpened: true, n: 3 };
		const 写 = P.save(事实, { slot: '(test)' });
		assert.ok(写?.ok === true, `★替身写失败：${JSON.stringify(写)}`);
		assert.eq(P.load('(test)'), 事实, '★替身读回与写出的不一致');
		assert.eq(P.has('(test)'), true, '★`has` 没认出刚写的档');

		/* 版本对不上 ⇒ 交给 migrate；当前只有一版 ⇒ **具名抛**（✗ 返回原样，那会把「迁移成功」与「没法迁」同形） */
		let 抛 = null;
		try { P.migrate({ 旧: 1 }, 0); } catch (e) { 抛 = e?.message ?? String(e); }
		assert.ok(抛 && /迁移链/.test(抛), `★版本不符时未具名抛（抛＝${抛}）`);

		const 语义 = P.slotSemantics();
		assert.ok(语义 && Array.isArray(语义.explicitSlots) && typeof 语义.auto === 'boolean',
			`★ slotSemantics 形状不对：${JSON.stringify(语义)}`);
	});
	
		test('端口①补：`slotSemantics` 的**语义**（声明须随**显式配置**翻面；★`maxAutoSaves` 不得被推断）', () => {
			/* 由来（`sagitrs-tester-4` 在 `#1917` 的 T 复核里**下刀验出**）：
			 *   原格只钉**形状**（`auto` 是 boolean、`explicitSlots` 是数组）⇒ 把实现**常量化**
			 *   （`return { auto: false, explicitSlots: [] }`）**照样全绿**；而契约面明写
			 *   「内核**只**依赖这份声明」⇒ 声明的**真假**此前没有格子守。
			 * ★最要紧的是最后那条**反向**钉：`maxAutoSaves` **不得**被拿来推断 `auto` ——
			 *   `src/core/80-save.js` 的 `snapshotForRestart` 会**临时**把它置 1 再复原
			 *   （引擎自己运行时就在改这个配置）⇒ 据它推断会把「引擎临时开户」误读成「宿主声明参与」。 */
			const P = R().portOf('persist');
			const 原Config = globalThis.Config;
			const 读 = (saves) => { globalThis.Config = { saves }; return P.slotSemantics(); };
			try {
				/* ① `autosave` 显式为真 ⇒ auto 真；撤掉 ⇒ 假（**翻面**） */
				assert.eq(读({ autosave: true }).auto, true, '★显式 `autosave:true` 时 auto 竟为假');
				assert.eq(读({}).auto, false, '★撤掉 `autosave` 后 auto 竟为真');
				/* ② 显式槽 ⇒ **逐字**等；撤掉 ⇒ 空（**翻面**）；数字槽按 `String` 化 */
				/* ⚠ 装具的 `assert.eq` **不做深比**（数组比引用 ⇒ `['a','b'] !== ['a','b']`）⇒ 逐字比用 `JSON.stringify`。 */
				assert.eq(JSON.stringify(读({ slots: ['a', 'b'] }).explicitSlots), JSON.stringify(['a', 'b']), '★显式槽未逐字报出');
				assert.eq(JSON.stringify(读({ slots: ['a', 3] }).explicitSlots), JSON.stringify(['a', '3']), '★槽未按 `String` 化');
				assert.eq(JSON.stringify(读({}).explicitSlots), JSON.stringify([]), '★撤掉 `slots` 后仍报出槽');
				/* ③ ★**反向**：`maxAutoSaves`（引擎自己会临时改写）**不得**被推断成 auto */
				assert.eq(读({ maxAutoSaves: 5 }).auto, false,
					'★据 `maxAutoSaves` 推了 auto —— 该配置引擎运行时自己会临时置 1（`80-save.js` 的 snapshotForRestart），据此会把「引擎临时开户」误读成「宿主声明参与」');
				console.log(`  语义读数：空⇒${JSON.stringify(读({}))}｜autosave⇒${JSON.stringify(读({ autosave: true }))}`
					+ `｜slots⇒${JSON.stringify(读({ slots: ['a', 'b'] }))}｜maxAutoSaves:5⇒auto=${读({ maxAutoSaves: 5 }).auto}`);
			} finally { globalThis.Config = 原Config; }
		});
})();
