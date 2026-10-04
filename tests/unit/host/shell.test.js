/* `sgstory#1763` 第 2 件（壳）· `src/host/sugarcube/50-shell.js` —— 判据三件
 *
 *   ① **常驻挂载**：`挂载面板()` 把**已注册且可见**的面板各挂一次；**隐藏的不挂**；
 *      四个面（挂载／跳过／隐藏／无写入器）**分开报**（✗ 不混成一个数组 —— 那会把「没挂上」读成绿）。
 *   ② **显隐入设置**：`设可见(id,false)` 落进 `State.variables.settings.panels[id]`（随档往返的落点），
 *      `可见(id)` 读得出；**未注册 id 具名抛**（接线错 ≠ 设置动作）。
 *   ③ **叙事列独立滚动**：`滚动样式()` 是**纯函数**，断串（含叙事列选择器与 `overflow`）—— ✗ 依赖 DOM。
 *
 * 刀（记在提交信息里）：让 `挂载面板` 忽略可见性 ⇒ ①红（隐藏面板被挂上）。
 */
(() => {
	const R = () => setup.RPG;

	/** 带假写入器的体：收尾复原 writer／计数／注册表／设置键（✗ 不污染他格）。 */
	const 带假写入器 = (体) => {
		const 真写 = R().panelWriter;
		const 写 = [];
		R().panelWriter = (host, html, opts) => { 写.push({ host, html, opts }); return true; };
		const ids = [];
		const 注册 = (id, def) => { ids.push(id); return R().registerPanel(id, def); };
		const 真设置 = R().panelHTML ? null : null;
		const 旧设置 = State.variables.settings?.panels;
		try { return 体(写, 注册); }
		finally {
			R().panelWriter = 真写;
			for (const id of ids) R().panels.delete(id);
			R().resetPanelCounts();
			if (State.variables.settings != null) {
				if (旧设置 === undefined) delete State.variables.settings.panels;
				else State.variables.settings.panels = 旧设置;
			}
		}
	};

	test('#1763 壳①：挂载只到「已注册且可见」的面板，四个面分开报', () => {
		带假写入器((写, 注册) => {
			注册('t1763s-a', { render: () => 'A', host: '.s-a', refresh: 'vitals' });
			注册('t1763s-b', { render: () => 'B', host: '.s-b', refresh: 'vitals' });
			R().shell.设可见('t1763s-b', false);              // b 隐藏
			R().resetPanelCounts();
			写.length = 0;
			const r = R().shell.挂载面板();
			/* ★注册表是**全局**的（别的格也注册了面板）⇒ 只断**本格**这两个 id，✗ 不断整个数组 */
			const 我的挂载 = r.挂载.filter((x) => x.startsWith('t1763s-'));
			assert.eq(我的挂载.join(','), 't1763s-a', `★本格面板的挂载面不对（实得 ${JSON.stringify(我的挂载)}／隐藏 ${JSON.stringify(r.隐藏)}）`);
			assert.eq(r.隐藏.join(','), 't1763s-b', '★隐藏的面板没有出现在「隐藏」面里（四个面必须分开报）');
			assert.eq(r.无写入器, false, '★注入了写入器却报「无写入器」');
			assert.eq(R().panelRenderCount('t1763s-a'), 1, '★可见面板没有被恰挂一次');
			assert.eq(R().panelRenderCount('t1763s-b'), 0, '★隐藏的面板竟被挂上了');
			assert.eq(写.filter((x) => x.host === '.s-a' || x.host === '.s-b').map((x) => x.host).join(','), '.s-a',
				`★本格面板写到了不该写的地方（实得 ${JSON.stringify(写.map((x) => x.host))}）`);
			R().shell.设可见('t1763s-b', true);
			assert.eq(R().shell.可见('t1763s-b'), true, '★设回可见后读不出');
		});
	});

	test('#1763 壳②：显隐落进 State 的随档落点；未注册 id 具名抛', () => {
		带假写入器((写, 注册) => {
			注册('t1763s-c', { render: () => 'C', host: '.s-c' });
			assert.eq(R().shell.可见('t1763s-c'), true, '★缺省应可见（✗ 只有显式 false 才算隐藏）');
			R().shell.设可见('t1763s-c', false);
			assert.eq(State.variables.settings?.panels?.['t1763s-c'], false,
				'★显隐没有落进 State.variables.settings.panels（随档往返的落点）');
			assert.eq(R().shell.可见('t1763s-c'), false, '★设隐藏后读口没变');
			assert.throws(() => R().shell.设可见('t1763s-没有这个面板', false), 'setVisible',
				'★未注册 id 没被具名拒绝（面板名打错是接线错）');
		});
	});

	test('#1763 壳③：叙事列独立滚动＝样式声明的纯函数（含选择器与 overflow）', () => {
		const css = R().shell.滚动样式();
		assert.ok(css.includes('#passages'), `★样式里没有叙事列选择器（实得 ${JSON.stringify(css.slice(0, 60))}）`);
		assert.ok(/overflow/.test(css), '★样式里没有 overflow（那就不是「独立滚动」）');
		assert.eq(R().shell.滚动样式(), css, '★同样输入两次结果不同（不是纯函数）');
		assert.eq(R().shell.常驻区, '#story-caption', '★常驻区选择器变了（改它就改这一处，判据据它断）');
	});
})();
