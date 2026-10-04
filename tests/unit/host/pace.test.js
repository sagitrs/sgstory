/* `sgstory#1977` B8 叙事节奏宏（`src/host/sugarcube/40-pace.js`）—— 判据三件（票面口径）
 *
 * ① **宏在产物**：产物里读得到四个宏名（`String(RPG.pace.装了)` —— 该函数**就在产物里**，
 *    摘掉宏注册那一行它会变成空话 ⇒ 见 ③ 的刀）。
 *    因为本仓此前没有宏注册面，宿主仿真里也**没有** `Macro` ⇒ 本用例**注入一个假 `Macro`**
 *    再调 `RPG.pace.装了()` ⇒ 断走的是**真注册路**（✗ 不是另写一份断言）。
 * ② **档位事件**：三档各发一次 `pace:set`（系数随档变）；**非法档经真宏处理器具名拒绝**；
 *    **战斗首回合自动发 `combat`**（裁甲：订阅既有 `battle:turnStart`，✗ 不新增 emit）。
 * ③ **刀**：摘 `装();` 这一次调用（或删注册）⇒ ①红（具名）。实刀读数记在提交信息里。
 *
 * ⚠ 本档最小形的**边界**（✗ 不当漏）：档位只进不出（战斗结束不回退）；`wait`/`type`/`fade`
 *   只到「发事件 ＋ 名义毫秒」这一步，✗ 不排宿主显示队列。
 */
(() => {
	const R = () => setup.RPG;      // ★本仓取法（同 tests/unit/core/*：`setup.RPG`）

	test('节奏宏①：装载期**真的**把四个宏注册上（判据取自宿主仿真的记录器）', () => {
		const 见 = window.__host.macro();
		/* ★`#1982` 折 `#1981` 非阻塞：**✗ 不断"注册表逐字等于这四串"** —— 后续宏笔（如 `45-fx.js`）一加宏，
		 *   本行就红 ⇒ 会被误读成"B8 坏了" ✗。改断**这四宏在册**（成员断 ✓）＋ 各自**都注册过**这一事实。 */
		const 名们0 = 见.map((x) => x.名);
		assert.eq(['pace', 'wait', 'type', 'fade'].every((n) => 名们0.includes(n)), true,
			`★装载期没把 B8 四宏注册上（实得 ${JSON.stringify(名们0)}）`
			+ ' —— 摘掉 `40-pace.js` 里那次 `装();` 调用，本条即红');
		const pace宏 = 见.find((x) => x.名 === 'pace').spec;
		assert.throws(() => pace宏.handler.call({ args: ['sprint'] }), 'pace',
			'★非法档没有被具名拒绝（静默吞掉？）');
		/* ★`#1982` 折 `#1981` 非阻塞：**✗ 不断"总数＝4"** —— 那种断言会被**下一个宏笔**误伤
		 *   （`45-fx.js` 一加三宏，本行就红 ⇒ 又得回来改别笔的判据 ✗）。改断**成员**：B8 四宏在册即可 ✓。 */
		assert.eq(['pace', 'wait', 'type', 'fade'].every((n) => 见.map((x) => x.名).includes(n)), true,
			'★B8 四宏须在册（按成员断；✗ 按总数 —— 后续宏笔不应让本行变红）');
	});

	test('节奏宏②：三档各发一次 pace:set，系数随档变；战斗首回合自动 combat', () => {
		const 见 = [];
		R().events.on('pace:set', (p) => 见.push(p));
		R().pace.设档('walk'); R().pace.设档('run'); R().pace.设档('combat');
		assert.eq(见.map((p) => p.档).join(','), 'walk,run,combat',
			`★三个档没有各发一次 pace:set（实得 ${JSON.stringify(见.map((p) => p.档))}）`);
		assert.eq(见[1].系数, 0.5, `★系数没随档变（run 应 0.5，实得 ${见[1].系数}）`);
		assert.eq(R().pace.名义毫秒(400) , 100, `★名义毫秒没按当前档折算（combat 400 ⇒ 100，实得 ${R().pace.名义毫秒(400)}）`);
		/* 战斗首回合 ⇒ combat（**订阅既有事件**：这里发的是 40-battle.js 那个名字） */
		R().pace.设档('walk');
		见.length = 0;
		R().events.emit('battle:turnStart', { index: 0 });
		assert.eq(R().pace.当前档(), 'combat', '★战斗首回合没自动切 combat');
		assert.eq(见.length, 1, '★自动切档没发 pace:set（判据②只认事件）');
		assert.eq(见[0].来源, 'battle', `★自动切档的来源不是 battle（实得 ${见[0].来源}）`);
	});

	test('节奏宏③：档位只进不出（最小形边界，明说不当漏）', () => {
		R().pace.设档('walk');
		R().events.emit('battle:turnStart', { index: 0 });
		R().events.emit('battle:end', {});
		assert.eq(R().pace.当前档(), 'combat',
			'★最小形约定战斗结束**不回退**（若这里变了，说明有人加了回退 ⇒ 请同步改头注与**后续版本**计划）');
		console.log('  节奏宏：四宏经真注册路 ✓｜三档各发事件＋系数 ✓｜非法档具名拒绝 ✓｜战斗首回合 combat（来源 battle）✓');
	});
})();
