/* `sgstory#1763` 核笔（B1+1.1/1.2）：**域刷新** —— 注册表的 `refresh` 列 ＋ `refreshDomain`
 *
 * 判据三件（票面口径）：
 *   ① 注册带域的面板 ⇒ `panelsInDomain(域)` 列出它；`refreshDomain(域)` 把它**恰渲染一次**
 *      （计数取自 `panelRenderCount`，同 B1 既有面）。
 *   ② **改一域不动他域**（票面原话）：两个域两个面板，刷新其中一个 ⇒ **另一个计数不变**。
 *   ③ 刀：让 `refreshDomain` 忽略域（退化成全量）⇒ ①/② 必红（实刀读数记在提交信息里）。
 *
 * ⚠ 核心不碰 DOM：用例**注入假 writer** 观测「写到哪个宿主、写了什么」（同 B1 既有测法），
 *   ✗ 不依赖 jQuery/DOM。注册的面板在 `finally` 里从 `RPG.panels` 摘除（✗ 不污染他格）。
 */
(() => {
	const R = () => setup.RPG;

	/** 跑一段带假 writer 的体，收尾复原 writer 与注册表。 */
	const 带假写入器 = (体) => {
		const 真写 = R().panelWriter;
		const 写 = [];
		R().panelWriter = (host, html) => { 写.push({ host, html }); return true; };
		const ids = [];
		const 注册 = (id, def) => { ids.push(id); return R().registerPanel(id, def); };
		try { return 体(写, 注册); }
		finally {
			R().panelWriter = 真写;
			for (const id of ids) R().panels.delete(id);
			R().resetPanelCounts();
		}
	};

	test('#1763 核笔①：按域注册 ⇒ panelsInDomain 列出，refreshDomain 恰渲染该域面板', () => {
		带假写入器((写, 注册) => {
			注册('t1763-hp', { name: '生命', render: () => '<b>hp</b>', host: '.p-hp', refresh: 'vitals' });
			注册('t1763-inv', { name: '背包', render: () => '<b>inv</b>', host: '.p-inv', refresh: 'items' });
			console.log('【打点B】测试体①在跑（注入写入器后 写=', 写.length, '注册数=', R().panels.size, '）');
			assert.eq(R().panelsInDomain('vitals').join(','), 't1763-hp',
				`★带域注册后面板不在该域里（实得 ${JSON.stringify(R().panelsInDomain('vitals'))}）`);
			assert.eq(R().panelDomains().join(','), 'vitals,items', '★已声明的域集合不对');
			R().resetPanelCounts();
			写.length = 0;
			const r = R().refreshDomain('vitals');
			assert.eq(r.rendered.join(','), 't1763-hp', `★按域重绘的目标不对（实得 ${JSON.stringify(r.rendered)}）`);
			assert.eq(r.无面板, false, '★明明有面板却报「无面板」');
			assert.eq(R().panelRenderCount('t1763-hp'), 1, '★该域面板没有被恰渲染一次');
			assert.eq(写.map((x) => x.host).join(','), '.p-hp', `★写到了别的宿主（实得 ${JSON.stringify(写.map((x) => x.host))}）`);
		});
	});

	test('#1763 核笔②：改一域不动他域（票面判据原话）', () => {
		带假写入器((写, 注册) => {
			注册('t1763-a', { render: () => 'A', host: '.p-a', refresh: 'vitals' });
			注册('t1763-b', { render: () => 'B', host: '.p-b', refresh: 'vitals' });
			注册('t1763-c', { render: () => 'C', host: '.p-c', refresh: 'items' });
			R().refreshPanels(null);                       // 全量一次：三者各 1
			R().resetPanelCounts();
			R().refreshDomain('vitals');
			assert.eq(R().panelRenderCount('t1763-a'), 1, '★vitals 域的第一个面板没被刷新');
			assert.eq(R().panelRenderCount('t1763-b'), 1, '★vitals 域的第二个面板没被刷新（同域应全刷）');
			assert.eq(R().panelRenderCount('t1763-c'), 0, '★改一域竟动了**他域**的面板（本票核笔的红线）');
		});
	});

	test('#1763 核笔③：域是自由串；空域/未登记域**不同形**（✗ 不静默返回空）', () => {
		带假写入器(() => {
			assert.throws(() => R().refreshDomain(''), 'refreshDomain', '★空域没有被具名拒绝');
			const r = R().refreshDomain('t1763-没有这个域');
			assert.eq(r.无面板, true, '★未声明的域没有报出「无面板」（域名打错与域里没面板必须不同形）');
			assert.eq(r.rendered.length, 0, '★未声明的域竟渲染了东西');
			assert.eq(R().panelsInDomain(null).length, 0, '★未声明域的面板集合应为空');
		});
	});
})();
