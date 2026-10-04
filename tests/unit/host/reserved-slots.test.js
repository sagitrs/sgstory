/* ── ★`sgstory#1938`（对接 `sagitrs/sgstory-books#210`）：**保留槽的决策层** ──
 *
 *   为什么要**决策层**与**呈现层**分开：宿主浏览器的存档行由 vendored SugarCube 造（`vendor/format.js`
 *   ✗ 可改），而「哪些槽是**保留槽**（系统自己用的快存／战前保底）」这件事**不该在引擎里再写死一份**
 *   —— 故事侧已有唯一取源：`stories/babel/src/world/encounters.js:182`
 *       const 槽位 = Object.freeze({ 快存: 3, 战前保底: 4, 手动: 5 });
 *   ⇒ 引擎只**读**它（`setup.BABEL.槽位`），✗ 不复制数值 ✓。
 *
 *   ⚠ 本档只断**决策**（纯函数：给「槽号取值」⇒ 得「保留集」），✗ 不断 DOM ——
 *     `tests/unit/framework/host.js` 档头明写「**不使用 jsdom**」⇒ 真 DOM 的那一面归 `tests/e2e/**` ✓。
 *
 *   ⚠ 红形：本档对**尚不存在的面**用「守卫式取用 ＋ 具名断言」⇒ 缺面时给的是**具名红**，
 *     ✗ 不是 `TypeError` 崩（崩 ≠ 具名红；本弧吃过 ✓）。 */

(() => {
	/** ★决策层入口（本笔要落的那个面）。缺席 ⇒ 返回 `undefined`（由各格具名报出）。 */
	const 取 = () => setup.RPG?.reservedSlots;
	/** 造一个干净的故事侧槽位表（✗ 依赖故事侧当前值，测完复原）。 */
	const 装槽位 = (值) => {
		const 旧 = setup.BABEL?.槽位;
		if (!setup.BABEL) setup.BABEL = {};
		if (值 === undefined) delete setup.BABEL.槽位;
		else setup.BABEL.槽位 = 值;
		return () => { if (旧 === undefined) delete setup.BABEL.槽位; else setup.BABEL.槽位 = 旧; };
	};

	test('保留槽①【决策层在位】：引擎须有「保留槽集」的判定面', () => {
		const f = 取();
		assert.eq(typeof f === 'function', true,
			'★决策层缺席：`setup.RPG.reservedSlots` 尚不存在（本格即该面第一条判据；✗ 以崩代红）');
	});

	test('保留槽②【一处源】：保留槽号取自故事侧 `setup.BABEL.槽位`，✗ 引擎再写死', () => {
		const f = 取();
		if (typeof f !== 'function') { assert.eq('决策层缺席', '在场', '★决策层缺席（同①）'); return; }
		const 复原 = 装槽位({ 快存: 3, 战前保底: 4, 手动: 5 });
		try {
			assert.eq(JSON.stringify(f()), JSON.stringify([3, 4]),
				`★保留槽须＝故事侧的「快存／战前保底」（实得 ${JSON.stringify(f())}）`);
			// ★反向：改故事侧一处源 ⇒ 判定**须跟着走**（✗ 写死就照不出来）
			setup.BABEL.槽位 = { 快存: 12, 战前保底: 13, 手动: 40 };
			assert.eq(JSON.stringify(f()), JSON.stringify([12, 13]),
				`★改故事侧槽号后判定没跟着走（实得 ${JSON.stringify(f())}）—— 那说明引擎里另写死了一份 ✗`);
		} finally { 复原(); }
	});

	test('保留槽③【手动槽不在保留集】：普通手写槽 ✗ 不得被当成保留槽', () => {
		const f = 取();
		if (typeof f !== 'function') { assert.eq('决策层缺席', '在场', '★决策层缺席（同①）'); return; }
		const 复原 = 装槽位({ 快存: 3, 战前保底: 4, 手动: 5 });
		try {
			assert.eq(f().includes(5), false, `★手动槽 5 被算进保留集（实得 ${JSON.stringify(f())}）`);
		} finally { 复原(); }
	});

	test('保留槽④【缺失／非法 ⇒ 具名退默认】：读不到故事侧槽位时须出声，✗ 静默猜', () => {
		const f = 取();
		if (typeof f !== 'function') { assert.eq('决策层缺席', '在场', '★决策层缺席（同①）'); return; }
		const 复原 = 装槽位(undefined);
		const 原warn = console.warn; const 出声 = [];
		console.warn = (...a) => { 出声.push(String(a[0] ?? '')); };
		let 果 = null; let 抛 = null;
		try { 果 = f(); } catch (e) { 抛 = String(e?.message ?? e); } finally { console.warn = 原warn; 复原(); }
		assert.eq(抛, null, `★读不到槽位时**不得抛**（那是环境条件，须落默认并出声）：${抛}`);
		assert.eq(Array.isArray(果), true, `★须返回数组（实得 ${JSON.stringify(果)}）`);
		assert.eq(出声.length > 0, true, `★读不到故事侧槽位须**出声**（✗ 静默取默认 —— 「静默」与「明账」必须不同形）：${JSON.stringify(果)}`);
	});
})();
