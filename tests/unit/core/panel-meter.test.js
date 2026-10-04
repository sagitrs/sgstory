/* `sgstory#1983`（A2/B2 合并票）· 核侧：面板声明 `cssVar`/`tint`/`tintOf` ＋ `meterText` 纯函数
 *
 *   ① **声明随注册被记住**（读口 `RPG.panelTint(id)`）：`{cssVar, tint, 当前键, 当前色}`。
 *   ② **色值逐字进 writer**：注入假 writer ⇒ `refreshPanels([id])` 的第三参里 `css` **逐字**等于
 *      `{[cssVar]: 表[当前键]}`（✗ 只断「调过 writer」）；缺声明 ⇒ `css === null`（「没声明」与「声明了空」不同形）。
 *   ③ **`meterText` 是纯函数且表在数据**：边界（`值 === 上界` 落该档）、升序取首条、表外 ⇒ `''`、乱序表 ⇒ 先排序。
 *
 * 刀（记在提交信息里）：(a) 把档位常量写回代码 ⇒ ③ 红（表在数据不成立）；(b) 写入处不带 `css` ⇒ ② 红。
 */
(() => {
	const R = () => setup.RPG;

	const 带面板 = (id, def, 体) => {
		const 真写 = R().panelWriter;
		const 见 = [];
		R().panelWriter = (host, html, opts) => { 见.push({ host, opts }); return true; };
		try { R().registerPanel(id, def); 体(见); }
		finally { R().panelWriter = 真写; R().panels.delete(id); R().resetPanelCounts(); }
	};

	test('1983 ①：声明随注册被记住（panelTint 读口）', () => {
		带面板('t1983-hp', {
			render: () => '<b>hp</b>', host: '.p1983', cssVar: '--hp-tint',
			tint: { 中毒: '#3f6', 魅惑: '#f6c' }, tintOf: () => '中毒',
		}, () => {
			const t = R().panelTint('t1983-hp');
			assert.eq(t.cssVar, '--hp-tint', '★cssVar 没被记住');
			assert.eq(JSON.stringify(t.tint), JSON.stringify({ 中毒: '#3f6', 魅惑: '#f6c' }), '★色板没被记住');
			assert.eq(t.当前键, '中毒', '★tintOf 的当前键没被取到');
			assert.eq(t.当前色, '#3f6', `★当前色不等于表里那一条（实得 ${t.当前色}）`);
		});
	});

	test('1983 ②：变量名与色值**逐字**进 writer；缺声明 ⇒ css 为 null', () => {
		带面板('t1983-css', {
			render: () => 'X', host: '.p1983-css', cssVar: '--hp-tint', tint: { 中毒: '#3f6' }, tintOf: () => '中毒',
		}, (见) => {
			R().refreshPanels(['t1983-css']);
			assert.eq(见.length, 1, '★writer 没被调用一次');
			assert.eq(JSON.stringify(见[0].opts.css), JSON.stringify({ '--hp-tint': '#3f6' }),
				`★CSS 对不是「变量名→色值」逐字（实得 ${JSON.stringify(见[0].opts.css)}）`);
		});
		带面板('t1983-nocss', { render: () => 'Y', host: '.p1983-nocss' }, (见) => {
			R().refreshPanels(['t1983-nocss']);
			assert.eq(见[0].opts.css, null,
				`★没声明颜色时 css 应为 null（✗ 空对象 —— 「没声明」与「声明了空」必须不同形）实得 ${JSON.stringify(见[0].opts.css)}`);
		});
	});

	test('1983 ③：meterText 纯函数 —— 边界闭在该档、升序取首、表外为空', () => {
		const 表 = [{ 上界: 5, 文案: '危险' }, { 上界: 10, 文案: '尚可' }, { 上界: 20, 文案: '良好' }];
		assert.eq(R().meterText(3, 表), '危险', '★3 应落第一档');
		assert.eq(R().meterText(5, 表), '危险', '★边界（值 === 上界）应落**该**档（≤ 闭）—— 语义要显式，✗ 让读者猜');
		assert.eq(R().meterText(6, 表), '尚可', '★6 应落第二档');
		assert.eq(R().meterText(20, 表), '良好', '★20 应落最后一档');
		assert.eq(R().meterText(21, 表), '', '★表外交白（✗ 回落最后一档）');
		assert.eq(R().meterText(3, []), '', '★空表交白');
		assert.eq(R().meterText(3, null), '', '★无表交白');
		assert.eq(R().meterText('x', 表), '', '★非数值交白');
		const 乱序 = [{ 上界: 20, 文案: '良好' }, { 上界: 5, 文案: '危险' }, { 上界: 10, 文案: '尚可' }];
		assert.eq(R().meterText(6, 乱序), '尚可', '★乱序表须按上界升序取首（✗ 按入表顺序）');
		/* ★**这条才抓得住「表在数据」**：上界**不是** 5/10/20 的自定义表 —— 若有人把档位写回代码
		 *   （`if (v <= 5) return '危险'`），本条即红（上面几条恰好会被写死的 5 蒙对 ⇒ 单独一条不够）。 */
		const 自定义 = [{ 上界: 100, 文案: '巨量' }, { 上界: 1, 文案: '涓滴' }];
		assert.eq(R().meterText(50, 自定义), '巨量', '★自定义表（上界 100/1）没被当数据用 —— 档位可能被写回了代码');
		assert.eq(R().meterText(1, 自定义), '涓滴', '★自定义表的边界落在错误的一档');
		assert.eq(R().meterText(5, 表), R().meterText(5, 表), '★同样输入两次结果不同（不是纯函数）');
	});
})();
