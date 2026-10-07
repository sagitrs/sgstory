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
			/* 旧行为：全局源 ⇒ 仍记进**当前会话** ✓
			 *   ★**显式装**一个标记源（✗ 依赖「此刻全局恰好可抽」—— 那是**别格留下的状态** ⇒ 实测会让本格成为
			 *     刀 `rng-reset-off` 的**越界红** ✓）。 */
			const 旧全局D = R().rng._impl;
			C().会话('s2'); C().清账();
			R().rng.set(() => 0.0);
			R().rng.pick(6);
			R().rng._impl = 旧全局D;
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
	/* ───────── ⑦⑧⑨ act 链：攻/伤骰**按源**走（`RPG.act` ⇒ 件 `used()` ⇒ 攻击层 ⇒ `DND3.d20`/`rollDetail`）─────────
	 *
	 * ★**覆盖面（须点明，✗ 让读者以为全路已判 ✓）**：⑦⑧⑨ 判的是 **melee/ranged 武器路**
	 *   （`DND3.meleeAttack` —— 长剑/木棒/骨匕/木矛/铁血/短弓/天然武器 ＋ 空手 `strike` 皆汇于此 ✓），
	 *   ★**✗ 覆盖**：陷阱三件（`trap-fire/needle/shock`）、炸弹（`bomb`）、擒抱一族（`DND3.grappleRoll`，
	 *   **在链而未透传** ⇒ 已登记）、豁免（`DND3.save`）、撬锁（`chest`）、创伤治疗（`treatTrauma`），
	 *   以及 **交互战斗路**（`Battle#actCatching` —— 代码侧已透传、判据归 A2 两卡端到端 ✓）。
	 *   ★另：`dnd-5e`／`d20m` **两包未改**（缺省＝全局 ⇒ 旧形逐字不变 ✓）⇒ 亦不在本判据面 ✓。 */

	test('★#2043 ⑦【act 链】`RPG.act(…, 源)` ⇒ **武器攻/伤骰**吃该源（件 `used()` ⇒ 攻击层一路同一份源）；全局源分毫不动', () => {
		清();
		const A = R().makeRng({ 名: 'A' });
		const 甲 = new (R().Character)({ name: '甲', hp: 99, maxHp: 99, stats: D().stats({ str: 10 }) });
		const 乙 = new (R().Character)({ name: '乙', hp: 99, maxHp: 99, stats: D().stats({ ac: 0 }) });
		const 旧全局 = R().rng._impl, 旧items = 甲.items;
		try {
			甲.items = [{ id: 'club', entityId: 'e1', equipped: true, charges: null }];
			定序(A, 0.95);                    // d20 ⇒ 20（重击威胁）＋ 确认 ⇒ 20 ⇒ 命中；1d6 ⇒ 6
			R().rng.setSequence([0.0, 0.5]);  // 全局：0.0 ⇒ d20 = 1 ⇒ **必失手**（两路可分辨 ✓）
			const r = R().act(甲, 'club', 乙, 'use', 甲, A);
			assert.eq(r.status, 'applied', `★RPG.act 须接受（实得 ${J(r)}）`);
			assert.eq(乙.hp < 99, true, '★给了源 ⇒ 攻/伤骰吃**该源**（0.95 ⇒ 命中且有伤）—— 未受伤 ⇒ 走了别处 ✗');
			assert.eq(R().rng.pick(20), 1, '★全局那份须**分毫未动**（注入序列的第一颗仍在 ⇒ 值仍是 1）');
		} finally { 甲.items = 旧items; R().rng._impl = 旧全局; 清(); }
	});

	test('★#2043 ⑧【自动回合】`RPG.BattleTurn(甲, 乙, {源})` ⇒ 该回合攻/伤骰吃**本场的源**；✗ 给 opts ⇒ `源`＝null（旧形 ✓）', () => {
		清();
		const A = R().makeRng({ 名: 'A' });
		const 甲 = new (R().Character)({ name: '甲', hp: 99, maxHp: 99, stats: D().stats({ str: 10 }) });
		const 乙 = new (R().Character)({ name: '乙', hp: 99, maxHp: 99, stats: D().stats({ ac: 0 }) });
		const 旧全局 = R().rng._impl, 旧items = 甲.items;
		try {
			甲.items = [{ id: 'club', entityId: 'e1', equipped: true, charges: null }];
			const 旧形 = new (R().BattleTurn)(甲, 乙);
			assert.eq(旧形.源, null, '★✗ 给 opts ⇒ `源`＝null（`BattleTurn(a,b).execute()` 的独立用法 ⇒ 走全局，旧行为逐字不变 ✓）');
			定序(A, 0.95);
			R().rng.setSequence([0.0, 0.5]);
			const 回 = new (R().BattleTurn)(甲, 乙, { 源: A }).execute();
			assert.eq(回.status, 'applied', `★自动回合须打得出去（实得 ${J(回)}）`);
			assert.eq(乙.hp < 99, true, '★自动回合的攻/伤骰须吃**本场的源**（✗ 全局 ⇒ 全局注入的必失手 ⇒ 无伤）');
			assert.eq(R().rng.pick(20), 1, '★全局那份须分毫未动（旧形用法才走它 ✓）');
		} finally { 甲.items = 旧items; R().rng._impl = 旧全局; 清(); }
	});

	test('★#2043 ⑨【act 链·兼容】`RPG.act(…)` **✗ 给源** ⇒ 与旧行为逐字同（走全局那份）', () => {
		清();
		const 甲 = new (R().Character)({ name: '甲', hp: 99, maxHp: 99, stats: D().stats({ str: 10 }) });
		const 乙 = new (R().Character)({ name: '乙', hp: 99, maxHp: 99, stats: D().stats({ ac: 0 }) });
		const 旧全局 = R().rng._impl, 旧items = 甲.items;
		try {
			甲.items = [{ id: 'club', entityId: 'e1', equipped: true, charges: null }];
			R().rng.setSequence(Array.from({ length: 8 }, () => 0.95));   // 全局：全 20 ⇒ 命中（一次攻击要吃好几颗：攻/确认/伤害 ✓）
			const r = R().act(甲, 'club', 乙);
			assert.eq(r.status, 'applied', `★✗ 给源须照旧可打（实得 ${J(r)}）`);
			assert.eq(乙.hp < 99, true, '★✗ 给源 ⇒ 走全局那份（旧行为 ✓）⇒ 命中 ✓');
		} finally { 甲.items = 旧items; R().rng._impl = 旧全局; 清(); }
	});

	/* ★**未落**一格：**交互战斗路**（`RPG.Battle#actCatching`，即故事侧战斗卡真正走的那条路）。
	 *   本席实测（刀 `Lf`：把 `#actCatching` 的 `, this.源` 摘掉）⇒ **套件 0 红** ⇒ 说明本路**当前无判据** ✓。
	 *   落格尝试两次皆在**装具层**受阻（「`reviveItem: 快照为空`」—— 交互路会遍历双方背包，须**完整快照**；
	 *   我按第 66 组的存-复原口径改了 `State.variables.inventory` ＋ 乙的空包，仍未过）⇒ **不硬凑** ✓：
	 *   本路的**端到端**判据归 **A2 两卡**（那正是甲案说的「**真实测试路径**」✓）⇒ 已在 PR 正文「未覆盖」登记 ✓。
	 *   ★代码侧的透传**已落**（`#actCatching` 已带 `this.源` ✓）—— 缺的是**判据**，✗ 不是实现 ✓。 */

})();
