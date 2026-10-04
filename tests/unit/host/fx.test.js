/* `sgstory#1982` 修饰宏批（`src/host/sugarcube/45-fx.js`）—— 判据：**装载真注册** ＋ **四宏注册断言** ＋ 事件 ＋ 刀
 *
 * ① **宏在产物**：从宿主仿真的**记录器**读（`window.__host.macro()`）⇒ 断走的是**真注册路**
 *    （✗ 不另写一份断言）；本条同时把 `#1981` 的**非阻塞**并进来 ⇒ 断的是**B8 四宏 ＋ 本笔三宏**的**成员关系**
 *    （✗ 不断"总数＝N" —— 那种断言会被**下一个宏笔**误伤，见 `pace.test.js` 同期改动 ✓）。
 * ② **只动自己印的那段**：三宏各发一条事件（`fx:shake`／`fx:board`／`fx:play`）；`<<board>>` 经
 *    `RPG.perform` 印「〔…〕」（叙事侧**不写裸 HTML** ✓，`#1940` §二）。
 * ③ **具名拒绝**：`<<fx 未知>>` 与**空** `<<board>>` ⇒ 抛（✗ 静默）。
 * ④ **刀**：摘 `45-fx.js` 里 `装();` 这一次调用 ⇒ ①红（实刀读数记在提交信息里 ✓）。
 *
 * ⚠ 边界（✗ 当漏）：本档只到「发事件 ＋ 名义毫秒」✓，真动画排进宿主显示队列属 0.0.3 全量 ✓。
 */
(() => {
	const R = () => setup.RPG;
	const 宏表 = () => window.__host.macro();
	const 取 = (名) => 宏表().find((x) => x.名 === 名)?.spec ?? null;

	test('修饰宏①：装载期**真的**注册上（记录器读）＋ **四宏注册断言**（B8 四宏 ＋ 本笔三宏，按**成员**断 ✗ 按总数）', () => {
		const 名们 = 宏表().map((x) => x.名);
		/* ★`#1981` 非阻塞并入：**B8 四宏**（pace/wait/type/fade）须在册 —— 按**成员**断，✗ 按总数 */
		assert.eq(['pace', 'wait', 'type', 'fade'].every((n) => 名们.includes(n)), true,
			`★B8 四宏不全（实得 ${JSON.stringify(名们)}）`);
		/* ★本笔三宏须在册（摘掉 45-fx.js 的 装(); 即红） */
		assert.eq(['shake', 'board', 'fx'].every((n) => 名们.includes(n)), true,
			`★本笔三宏没注册上（实得 ${JSON.stringify(名们)}）—— 摘掉 45-fx.js 里那次 装(); 本条即红`);
		assert.eq(名们.length >= 7, true, `★记录器里宏数不该少于 7（B8 四 ＋ 本笔三；实得 ${名们.length}）`);
		/* 具名拒绝两面 */
		assert.throws(() => 取('fx').handler.call({ args: ['unknown-thing'] }), 'fx',
			'★非法效果名没被具名拒绝（静默吞掉？）');
		assert.throws(() => 取('board').handler.call({ args: [] }), 'board',
			'★空信息板没被具名拒绝（静默印空框？）');
	});

	test('修饰宏②：三宏各发一条事件；本笔只动自己印的那段（✗ 不碰既有正文）', () => {
		const 见 = { fx: [] };
		R().events.on('fx:shake', (p) => 见.fx.push(['shake', p]));
		R().events.on('fx:board', (p) => 见.fx.push(['board', p]));
		R().events.on('fx:play', (p) => 见.fx.push(['play', p]));
		const 印 = [];
		const 原perform = R().perform;
		R().perform = (t) => { 印.push(String(t)); };
		try {
			取('shake').handler.call({ args: [] });
			取('board').handler.call({ args: ['探索点', '3/5'] });
			取('fx').handler.call({ args: ['heart'] });
		} finally { R().perform = 原perform; }
		assert.eq(见.fx.map((x) => x[0]).join(','), 'shake,board,play',
			`★三宏须各发一条事件（实得 ${JSON.stringify(见.fx.map((x) => x[0]))}）`);
		assert.eq(见.fx.find((x) => x[0] === 'board')[1].文本, '探索点 3/5', '★信息板文本须原样进事件');
		assert.eq(印.join('｜'), '〔探索点 3/5〕', `★信息板须经 perform 印「〔…〕」（✗ 裸 HTML；实得 ${JSON.stringify(印)}）`);
		assert.eq(见.fx.find((x) => x[0] === 'play')[1].名, 'heart', '★效果名须原样进事件');
	});
})();
