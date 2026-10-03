/* L1 `GameSession` · **正控与停下原因**（`sgstory#1912` 交付 1 步 3；形出处：`#1912` 评论 `5966338996`）
 *
 * 定位（说清本档**不**做什么，避免与 `tester-3` 的四条同义重复）：
 *   · 她那四条测的是**两会话互不串**（状态／随机源／事件／输入）⇒ 本档**不重复**，只给它们**前提**；
 *   · 本档钉三件：
 *     ① **正控**：单会话下 `mount → enter → push → run` 必须能**跑完**一条最小场景（✗ 这条不成立时，
 *        「输入独立」那类断言会在**空装置**上恒真）；
 *     ② **停下原因可读且互不相同**（`input-empty`／`max-steps`／`no-scene`）—— 形明确要求「✗ 把死循环
 *        与跑完写成同一读数」；
 *     ③ 两处**具名前置**：不给 `rng` 就构造 ⇒ 具名抛（✗ 静默回落全局 ⇒ 两会话会共享随机流）；
 *        呈现走**会话自己的门面** ⇒ 只影响该会话（✗ 动全局那份）。
 */
(() => {
	const R = () => setup.RPG;

	/** 造一个会话（每个测试各造自己的 ⇒ 不共享任何全局面）。 */
	const 造会话 = (id) => {
		const 流 = { v: 0, next() { this.v += 1; return this.v; } };   // ★该会话自己的「随机源」（桩）
		return new (R().GameSession)({ id, rng: 流, ports: R().ports });
	};

	/** 一条最小场景：一个动作、一次呈现。 */
	const 挂最小场景 = (A) => A.mount('min', (ctx) => ({
		id: 'min',
		enter: (c) => { c.commit({ entered: true }); },
		render: (c) => { c.ports.render.output(`步${c.facts().n ?? 0}`); },
		actions: [{
			id: 'go',
			when: (c) => c.facts().done !== true,
			run: (c) => { c.commit({ done: true, n: (c.facts().n ?? 0) + 1 }); },
		}],
	}));

	test('会话①【正控】：`mount → enter → push → run` 跑完一条最小场景（✗ 之后别处的断言会恒真）', () => {
		const A = 造会话('A');
		挂最小场景(A);
		const 入 = A.enter('min');
		assert.eq(入.entered, true, `★enter 没进去：${JSON.stringify(入)}`);
		assert.eq(A.facts().entered, true, '★进入副作用没跑（`enter` 应当跑一次幂等的那些）');

		A.input.push({ id: 'go' });
		const 读数 = A.run({ maxSteps: 10 });
		assert.eq(读数.stopped, 'input-empty', `★停下原因不是 input-empty：${JSON.stringify(读数)}`);
		assert.eq(读数.steps, 1, `★步数应恰 1（实得 ${读数.steps}）`);
		assert.eq(A.facts().done, true, '★动作的写没落进事实块（`ctx.commit` 不通）');
	});

	test('会话②【停下原因】三条**互不相同**且各自可读（✗ 死循环与跑完同形）', () => {
		const A = 造会话('A');
		assert.eq(A.run().stopped, 'no-scene', '★未挂场景时应是 no-scene');

		挂最小场景(A);
		A.enter('min');
		assert.eq(A.run().stopped, 'input-empty', '★空队列时应是 input-empty');

		/* 一次动作只能跑一遍（`when` 之后为假）⇒ 靠 `maxSteps` 那条另造一件总能跑的动作 */
		A.mount('loop', (ctx) => ({ id: 'loop', render: () => {}, actions: [{ id: 'go', run: (c) => c.commit({ n: (c.facts().n ?? 0) + 1 }) }] }));
		A.enter('loop');
		A.input.push({ id: 'go' }); A.input.push({ id: 'go' }); A.input.push({ id: 'go' });
		const 读 = A.run({ maxSteps: 2 });
		assert.eq(读.stopped, 'max-steps', `★撞上限时应是 max-steps：${JSON.stringify(读)}`);
		assert.eq(读.steps, 2, `★步数应等于上限 2（实得 ${读.steps}）`);
		assert.eq(A.input.pending(), 1, `★上限停下后队列应还剩 1 条（实得 ${A.input.pending()}）—— 「停下」不等于「清空」`);
	});

	test('会话③【具名前置】不给 `rng` ⇒ **构造即具名抛**（✗ 静默回落全局 ⇒ 两会话共享随机流）', () => {
		let 抛 = null;
		try { new (R().GameSession)({ id: 'x', ports: R().ports }); } catch (e) { 抛 = e?.message ?? String(e); }
		assert.ok(抛 && /rng/.test(抛), `★没给 rng 却构造成功（抛＝${抛}）—— 两会话会共享随机流`);
	});

	test('会话④【呈现门面】收集器只影响**该会话**（✗ 动全局那份 ⇒ 两会话输出会串）', () => {
		const A = 造会话('A'), B = 造会话('B');
		const 收A = [], 收B = [];
		A.ports.render.setCollector((条) => 收A.push(条));
		B.ports.render.setCollector((条) => 收B.push(条));
		A.ports.render.output('A 的一行');
		B.ports.render.output('B 的一行');
		assert.eq(JSON.stringify(收A.map((x) => x.text)), JSON.stringify(['A 的一行']), `★A 的收集器：${JSON.stringify(收A)}`);
		assert.eq(JSON.stringify(收B.map((x) => x.text)), JSON.stringify(['B 的一行']), `★B 的收集器：${JSON.stringify(收B)}`);
		/* ★正控：门面确实接到全局面了（✗ 只是「两边都空」造成的假绿） */
		A.ports.render.setCollector(null);
		B.ports.render.setCollector(null);   // ★先撤下 B 的收集器（✗ 否则这行会进 B 的收集器，正控永远读 0 —— 本席第一版就栽在这）
		const 全局收 = [];
		const 全局 = R().portOf('render');
		全局.setCollector((条) => 全局收.push(条));
		try { B.ports.render.output('经全局'); assert.eq(全局收.length, 1, '★门面没接到全局呈现面'); }
		finally { 全局.setCollector(null); B.ports.render.setCollector(null); }
	});
})();
