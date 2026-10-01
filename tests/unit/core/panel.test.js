/* core/72-panel 的单元测试：注册制局部刷新（能力伞首期 B1 · `#1798`）
 *
 * 纪律（承 `tests/README.md`）：
 *   · 用**本用例私有的面板**（`unit-` 前缀）隔离；`tests/unit/core/` 目录的既有文件亦注册了面板时，✗ 假定只有本用例的；
 *   · DOM 面无头是 no-op 桩 ⇒ **注入假 `jQuery`** 观测「写到哪个宿主、写了什么」——
 *     这是本模块唯一能证明「局部（✗ 整段）」的判据；
 *   · 「重绘次数」是局部刷新的**可观测面** ⇒ 单列用例钉住（`#1812`／`#1814` 要的判据）。
 */
(() => {
	const R = () => setup.RPG;

	/**
	 * 假**写回器**（契约：命中并写入 ⇒ 真值；找不到宿主 ⇒ `false`）。
	 * ★核心**不碰 DOM**（`#1804` 的宿主触点棘轮门）⇒ 观测面就是「writer 被怎么调」，
	 *   比假 jQuery 更贴近契约：判的是**本模块的语义**，✗ jQuery 的行为。
	 */
	const withFakeWriter = (hosts, fn) => {
		const orig = R().panelWriter;
		const writes = [];
		R().panelWriter = (host, html) => {
			const hit = host != null && hosts.includes(String(host));
			if (hit) writes.push([String(host), html]);
			return hit;
		};
		try { fn(); } finally { R().panelWriter = orig; }
		return writes;
	};

	/* ---------- ① 注册表 ---------- */
	test('B1：注册表（render 必填／重复注册告警不抛／未注册面板名抛错）', () => {
		const e = R().registerPanel('unit-p1', { name: '单测面板', render: () => '<i>1</i>' });
		assert.eq(e.id, 'unit-p1', '应回读 id');
		assert.eq(e.host, '[data-panel="unit-p1"]', '缺省宿主选择器应是 data-panel');
		assert.eq(R().panelRenderCount('unit-p1'), 0, '新面板计数应为 0');
		let t1 = null;
		try { R().registerPanel('unit-p2', {}); } catch (err) { t1 = err; }
		assert.ok(t1 !== null, '★render 必填（✗ 静默注册一个渲染不出东西的面板）');
		let t2 = null;
		try { R().panelHTML('unit-nope'); } catch (err) { t2 = err; }
		assert.ok(t2 !== null, '★未注册面板名应抛（面板名打错=接线错，✗ 静默空串）');
		R().registerPanel('unit-p1', { render: () => '<i>覆盖</i>' });   // 重复注册：告警不抛
		assert.eq(R().panelHTML('unit-p1'), '<i>覆盖</i>', '后注册者生效（与 defEffect 等同形）');
	});

	/* ---------- ② 局部性（★本模块的核心语义） ---------- */
	test('B1：★只重绘**指定**面板的宿主（兄弟面板不被牵连）', () => {
		R().registerPanel('unit-a', { render: () => 'A1', host: '.host-a' });
		R().registerPanel('unit-b', { render: () => 'B1', host: '.host-b' });
		R().resetPanelCounts();
		const writes = withFakeWriter(['.host-a', '.host-b'], () => {
			const r = R().refreshPanels(['unit-a']);
			assert.eq(r.rendered.join(','), 'unit-a', '只应重绘 unit-a');
			assert.eq(r.skipped.length, 0, '两个宿主都在 ⇒ 无跳过');
		});
		assert.eq(writes.length, 1, `★只应发生 1 次写入（实得 ${writes.length}）`);
		assert.eq(writes[0][0], '.host-a', '★写的宿主应是 unit-a 的（✗ 整段状态栏）');
		assert.eq(writes[0][1], 'A1', '写的内容应是该面板 render 的输出');
		assert.eq(R().panelRenderCount('unit-a'), 1, 'unit-a 计数 +1');
		assert.eq(R().panelRenderCount('unit-b'), 0, '★unit-b 应**零**重绘（局部性）');
	});

	test('B1：`null` ⇒ 全部面板；`skipped` 列出「注册了但页面上没有」的面板（✗ 静默）', () => {
		R().registerPanel('unit-a', { render: () => 'A1', host: '.host-a' });
		R().registerPanel('unit-b', { render: () => 'B1', host: '.host-b' });
		R().resetPanelCounts();
		const writes = withFakeWriter(['.host-a'], () => {
			const r = R().refreshPanels();
			assert.eq(r.rendered.join(','), 'unit-a', '找得到宿主的面板才重绘');
			assert.ok(r.skipped.includes('unit-b'), '★找不到宿主的应**列进 skipped**（让「以为刷了其实没刷」现形）');
		});
		assert.eq(writes.length, 1, '只写了一次（unit-b 的宿主不在）');
		assert.eq(R().panelRenderCount('unit-b'), 0, '跳过的面板计数不应涨');
	});

	test('B1：`into` 可指定自定义宿主（面板体写进调用点给的容器）', () => {
		R().registerPanel('unit-a', { render: () => 'A1', host: '.host-a' });
		const writes = withFakeWriter(['.custom'], () => { R().refreshPanels(['unit-a'], { into: '.custom' }); });
		assert.eq(writes[0][0], '.custom', '应写进 into 指定的宿主');
	});

	test('B1：未注册的 id 调 `refreshPanels` ⇒ 抛（✗ 静默跳过）', () => {
		let threw = null;
		const orig = R().panelWriter;
		R().panelWriter = null;              // ★即使**无呈现层**也要抛（先校验 targets，D 席 NIT-6）
		try { R().refreshPanels(['unit-not-registered']); } catch (e) { threw = e; }
		finally { R().panelWriter = orig; }
		assert.ok(threw !== null, '★未注册 id 应抛（✗ 静默无操作，哪怕没有 writer）');
	});

	test('B1：未注入 writer（无呈现层）⇒ 全部记 `skipped`（✗ 抛、✗ 假装刷了）', () => {
		R().registerPanel('unit-a', { render: () => 'A', host: '.host-a' });
		const orig = R().panelWriter;
		R().panelWriter = null;
		try {
			const r = R().refreshPanels(['unit-a']);
			assert.eq(r.rendered.length, 0, '无 writer ⇒ 不应有 rendered');
			assert.ok(r.skipped.includes('unit-a'), '无 writer ⇒ 应记 skipped（与「页面上没有宿主」同形）');
			assert.eq(R().panelRenderCount('unit-a'), 0, '跳过时计数不应涨');
		} finally { R().panelWriter = orig; }
	});

	test('B1：`write` 选项可覆盖注入的 writer（一次性写回器）', () => {
		R().registerPanel('unit-a', { render: () => 'A', host: '.host-a' });
		const seen = [];
		const r = R().refreshPanels(['unit-a'], { write: (h, v) => { seen.push([h, v]); return true; } });
		assert.eq(seen.length, 1, '应只调一次自定 write');
		assert.eq(seen[0][0], '.host-a', '宿主应是面板自己的');
		assert.eq(r.rendered.join(','), 'unit-a', 'rendered 应含该面板');
	});


	/* ---------- ③ 计数（可观测面） ---------- */
	test('B1：重绘计数逐面板累计，`panelRenderCounts()` 给全表快照', () => {
		R().registerPanel('unit-a', { render: () => 'A', host: '.host-a' });
		R().resetPanelCounts();
		withFakeWriter(['.host-a'], () => { R().refreshPanels(['unit-a']); R().refreshPanels(['unit-a']); });
		assert.eq(R().panelRenderCount('unit-a'), 2, '★「恰 N 次」可断言（局部刷新的可观测面）');
		const snap = R().panelRenderCounts();
		assert.eq(snap['unit-a'], 2, '快照应含该面板');
		assert.eq(R().panelRenderCount('unit-none'), null, '未注册 ⇒ null（✗ 0 —— 0 会被读成「注册了但没刷」）');
		R().resetPanelCounts();
		assert.eq(R().panelRenderCount('unit-a'), 0, '清零应生效');
	});
})();
