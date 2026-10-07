/* `sgstory#2043`（**A2 前置 · 引擎**）：**按会话绑定的随机源接缝**单测。
 *
 * 依据：A2 随机源阻断卡终裁＝**甲案**（`books#413` 评论 `6018618509`）＋ A1 十三裁 ＋ A2 六裁。
 * 本笔只解**甲案点名的那条接缝**：①可**独立创建**随机源 ②正式骰原语**可显式**消费指定源
 * ③用途化骰控制的**未受新控制回退**与**底层计数按源归属** ④`RPG.Battle.current` **按会话**归属
 * ⑤**旧调用逐字不变**（✗ 给源／✗ 给会话 ⇒ 全走全局那份）。
 *
 * ⚠ 源是**实例态**（各自 `_impl`／计数）⇒ 每格自建新实例，✗ 依赖上格残留；全局那份用完 `reset()` ✓。
 * ⚠ `makeRng` 的实例**默认源**是 `Math.random`（动态读）⇒ 要确定性就显式 `set`／`setSequence` ✓。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;
	const C = () => R().diceControl;
	const J = (x) => JSON.stringify(x);
	/* ★本档**不**在每格尾部复位全局源 —— 每格之间**由装具**复位（`harness.js`）✓；
	 *   若本档自己顺手复位，会让刀 `rng-reset-off`（摘装具复位那一步）**少咬一格** ✗
	 *   （实测：本席首版就把它从 5 红压成 4 红 ⇒ 改成「只在**本格注入过全局序列**的两处显式复位」✓）。 */
	const 清 = () => { C().clearAll(); C().清账(); };
	const 捉 = (f) => { try { f(); return null; } catch (e) { return e; } };
	const 定序 = (源, v, n = 64) => 源.setSequence(Array.from({ length: n }, () => v));

	/* ───────── ① 独立性：两个实例（与全局）**互不影响** ───────── */

	test('★#2043 ①【独立实例】`makeRng` 造的源各有自己的序列/计数；A 抽尽 ✗ 动 B 与全局 ✓', () => {
		清();
		try {
			const A = R().makeRng({ 名: 'A' });
			const B = R().makeRng({ 名: 'B' });
			assert.eq(typeof A.pick === 'function' && typeof B.unit === 'function', true, '实例须与 `RPG.rng` **同形**（pick/unit/index/set/setSequence/reset）');
			assert.eq(A === R().rng, false, '实例 ✗ 是全局那份（否则就是共享可变源 ✗）');
			定序(A, 0.0, 1);                       // A：只够抽 1 次
			assert.eq(A.pick(20), 1, 'A 的第一颗按自己的序列 ⇒ 1（0.0 ⇒ `1+floor(0*20)`）');
			const 抛A = 捉(() => A.pick(20));
			assert.eq(抛A?.code, 'RNG_EXHAUSTED', '★A 抽尽须**具名抛**（✗ 静默回退真随机）');
			定序(B, 0.95, 2);
			assert.eq(B.pick(20), 20, '★B 用的是**自己**的序列（0.95 ⇒ 20）—— A 抽尽 ✗ 影响 B ✓');
			/* ★全局那份的判据用**行为**形（✗ 断言 `_impl === null` —— 那会让本格对「装具复位」的注入泄漏敏感，
			 *   实测它会成为刀 `rng-reset-off`／`rng-code-off` 的**越界红** ⇒ 改形 ✓。 */
			const 旧全局 = R().rng._impl;
			try {
				R().rng.setSequence([0.95, 0.95]);
				assert.eq(R().rng.pick(20), 20, '★全局那份走的是**它自己的**序列（✗ 被实例的设定顶掉 ✓ 共享可变状态 ✗）');
			} finally { R().rng._impl = 旧全局; }
			assert.eq(A.计数 >= 2, true, `实例须记**自有**计数（实得 ${A.计数}）`);
		} finally { 清(); }
	});

	/* ───────── ② 显式源：骰原语吃指定源；✗ 给源 ⇒ 旧行为 ───────── */

	test('★#2043 ②【显式源】`rollDetail(expr, ctx, 源)` 吃该源；**✗ 给源** ⇒ 与旧行为逐字同（走全局）', () => {
		清();
		const 旧implB = R().rng._impl;
		try {
			const A = R().makeRng({ 名: 'A' });
			定序(A, 0.0, 4);
			assert.eq(R().rollDetail('1d20+3', null, A).rolls[0], 1, '★给了源 ⇒ 吃该源的序列（1）');
			assert.eq(R().rollDetail('1d20+3', null, A).total, 4, '加值照算（1+3）');
			/* ✗ 给源：走全局那份（此处给它一个可分辨的序列）✓ */
			R().rng.setSequence(Array.from({ length: 8 }, () => 0.95));
			assert.eq(R().rollDetail('1d20').rolls[0], 20, '★✗ 给源 ⇒ 走全局源（20）—— 旧调用语义未变 ✓');
			assert.eq(R().roll('1d20'), 20, '`roll` 同样：✗ 给源 ⇒ 全局 ✓');
			assert.eq(R().checkRoll({ mod: 5, dc: 25 }).roll, 20, '`checkRoll` ✗ 给源 ⇒ 全局 ✓（且有 `源` 第二参位）');
			const B = R().makeRng({ 名: 'B' });
			定序(B, 0.5, 2);
			assert.eq(R().checkRoll({ mod: 0, dc: 999 }, B).roll, 11, '★给了源 ⇒ 检定骰吃**该源**（0.5 ⇒ 11），✗ 全局序列 ✓');
		} finally { R().rng._impl = 旧implB; 清(); }
	});

	/* ───────── ③ 用途化骰控制：受控颗吃臂面；未受新控制**回退走本次源** ───────── */

	test('★#2043 ③【按源归属·控制面】装了臂的颗吃臂面（与源无关）；**未受新控制**的回退走**本次源**（✗ 全局）', () => {
		清();
		const 旧implC = R().rng._impl;
		try {
			const A = R().makeRng({ 名: 'A' });
			定序(A, 0.95, 4);
			C().arm({ purpose: 'damage', actor: '甲', 组: 0, faces: [7] });
			assert.eq(R().rollDetail('1d20', { purpose: 'damage', actor: '甲', 组: 0 }, A).rolls[0], 7, '受控颗吃臂面（✗ 源）');
			assert.eq(R().rollDetail('1d6', { purpose: 'damage', actor: '甲', 组: 0 }, A).rolls[0], 6, '★臂已吃空 ⇒ 未受新控制 ⇒ 回退走**本次源**（0.95 ⇒ d6=6，✗ 全局随机）');
			/* ★反证：全局那份另给一个可分辨的序列 ⇒ 若回退误读全局，上面那颗会变成 1 ✓ */
			R().rng.setSequence([0.0]);
			assert.eq(R().rollDetail('1d6', { purpose: 'damage', actor: '甲', 组: 0 }, A).rolls[0], 6, '★回退仍走**本次源**（✗ 被全局序列顶成 1 ✓）');
		} finally { R().rng._impl = 旧implC; 清(); }
	});

	/* ───────── ④ 底层计数按源归属（给了会话 ⇒ 记进**那个**会话）───────── */

	test('★#2043 ④【底层计数按源】带 `会话` 的实例 ⇒ 计进**该会话**的底层账；全局源仍计进当前会话（旧行为 ✓）', () => {
		清();
		try {
			const S1 = R().makeRng({ 名: 'S1', 会话: 's1' });
			const S2 = R().makeRng({ 名: 'S2', 会话: 's2' });
			C().会话('s1'); C().清账();
			C().会话('s2'); C().清账();
			C().会话('s1');
			S1.pick(6); S1.pick(6);
			S2.pick(6);
			C().会话('s1');
			assert.eq(C().报告().底层计数.unit调用, 2, `★s1 的底层账须恰记 2（S1 的两颗；实得 ${C().报告().底层计数.unit调用}）`);
			C().会话('s2');
			assert.eq(C().报告().底层计数.unit调用, 1, '★s2 的底层账须记 S2 的那一颗（✗ 记进当前会话 s1）');
			/* 旧行为：全局源 ⇒ 仍记进**当前会话** ✓ */
			C().会话('s2'); C().清账();
			R().rng.pick(6);
			assert.eq(C().报告().底层计数.unit调用, 1, '★全局源的抽取仍记进**当前会话**（旧行为逐字不变 ✓）');
		} finally { 清(); }
	});

	/* ───────── ⑤ Battle：按会话的当前战斗 ＋ 选择器走本场源 ───────── */

	test('★#2043 ⑤【战斗按会话】带会话的战斗 ⇒ `currentOf(会话)` 是它且**✗ 动全局 `current`**；选择器走本场源', async () => {
		清();
		try {
			const A = R().makeRng({ 名: 'A' });
			/* ★交互通路要求玩家对象带 `properties: ['player']`（既有成文）⇒ 用**正式玩家**当甲 ✓
			 *   （本格判的是**战斗登记**这一面，✗ 判玩家隔离 —— 那属 A2 的两卡路径 ✓）。 */
			const 甲 = D().Player;
			const 乙 = new (R().Character)({ name: '乙', hp: 9999, maxHp: 9999, stats: D().stats({ ac: 99 }) });
			const 场2 = new (R().Battle)(1, [甲], [乙], true, { 源: A, 会话: 's1' });
			assert.eq(R().Battle.currentOf('s1'), null, '开场前 ⇒ 该会话无当前战斗 ✓');
			assert.eq(R().Battle.current, null, '★全局 `current` 须仍为 null（✗ 被测试局顶掉 ✓ —— 甲案 §三）');
			assert.eq(场2.会话, 's1', '战斗须记住自己的会话号');
			assert.eq(场2.源 === A, true, '战斗须持自己的源');
			/* ★「运行期在册」必须在**战斗活着的时候**看（首版我看的是战终 ⇒ 登记早已清掉 ⇒ 刀 `Ke` 抓出该空转 ✓）。
			 *   取交互战 ⇒ 它在「等玩家选择」处让出 ⇐ 那一刻正是运行期 ✓（用装具的 `withPlayerStubs` 给选择桩 ✓）。 */
			let 在册 = null, 全局 = null;
			const 旧选 = 甲.choice, 旧物 = 甲.items;
			甲.choice = async () => { 在册 = R().Battle.currentOf('s1'); 全局 = R().Battle.current; return 'skip'; };
			甲.items = State.variables.inventory;
			场2.perform = () => {};
			try { await 场2.execute(); } finally { 甲.choice = 旧选; 甲.items = 旧物; }
			assert.eq(在册, 场2, '★运行期（等玩家选择那一刻）：该会话的当前战斗**须是它**（✗ 未登记 ⇒ 测试局的提交会进正式战斗）');
			assert.eq(全局, null, '★运行期：全局 `current` 仍须为 null（✗ 被测试局顶掉）');
			assert.eq(R().Battle.currentOf('s1'), null, '战终 ⇒ 该会话的登记须**清掉**（✗ 留过期引用）');
			assert.eq(R().Battle.current, null, '★战终全局 `current` 仍为 null（✗ 被测试局写过 ✓）');
		} finally { 清(); }
	});

	/* ───────── ⑥ 旧调用兼容（✗ 给会话 ⇒ `currentOf` 即全局那份）───────── */

	test('★#2043 ⑥【兼容】`currentOf(✗ 给会话)` ⇒ 取**全局** `current`（旧调用 ✗ 变）', () => {
		清();
		try {
			assert.eq(R().Battle.currentOf(null), R().Battle.current, '✗ 给会话 ⇒ 与旧读法**同一值** ✓');
			assert.eq(R().Battle.currentOf(), R().Battle.current, '缺省参数亦然 ✓');
			assert.eq(typeof R().Battle.按会话?.get === 'function', true, '按会话的登记面须存在（Map ✓）');
			assert.eq(R().Battle.按会话.size, 0, '起手为空（✗ 串场残留）');
		} finally { 清(); }
	});
})();
