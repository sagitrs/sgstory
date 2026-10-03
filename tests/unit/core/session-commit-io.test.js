/* `sgstory#1933`（A 轨·命令提交全面化）· **命令体的两侧效面**：呈现（C4）与随机消耗（C3）
 *
 * 出处：票面两条 pending 臂（`tester-3` 在 `tests/e2e/old-house/run-baseline.mjs` 里跑出的现读数）
 *   ＋ 领队 2026-10-03 裁「本笔落 C4 呈现时序 ＋ C3 退位契约（C2 引擎对象态回滚面＝阶段 4 候选）」。
 * 病灶（两处，都是**命令体的副作用在判决点之外落地**）：
 *   · **C4**：命令体自己印的东西（`ctx.ports.render`）**当场就出门** ⇒ 被拒后屏上留着半截
 *     （她实测：拒后收集器仍收到「翻新中」1 条）。⇒ 修法：命令期**入缓冲**，结算成形才按序出门；被拒／抛异常**丢弃**。
 *   · **C3**：命令体抽了随机后拒绝 ⇒ 随机流**已推进**（通用回退不存在）⇒ 结果面至少要把
 *     「本次消耗了几次」**报出来**（＝退位契约：读数给依据，✗ 假装能退）。
 *
 * 本档判的正是这两面（e2e 那两格是 T 席的口子；这里判引擎语义，✗ 重复判装置）。
 */
(() => {
	const R = () => setup.RPG;

	/** 每格自造会话（✗ 共享全局面）。流带**抽取面**（`next`）与**配置面**（`set`／`setSequence`／`reset`／`_impl`）。 */
	const 造会话 = (id) => new (R().GameSession)({
		id,
		rng: {
			次: 0,
			_impl: null,
			next() { this.次 += 1; return `抽${this.次}`; },
			set(fn) { this._impl = fn; return this; },            // 配置动词：✗ 计次
			setSequence(v) { this._序 = [...v]; return this; },   // 配置动词：✗ 计次
			reset() { this._impl = null; return this; },          // 配置动词：✗ 计次
		},
	});

	/** 一个能**自己印**、能**抽随机**、且行为可注入的命令场景。 */
	const 挂印抽格 = (A, 行为) => A.mount('print-roll', () => ({
		id: 'print-roll',
		enter: (c) => { c.commit({ 值: '旧' }); },
		render: () => {},
		actions: [{ id: '翻新', run: 行为 }],
	}));

	/** 就绪：进场景 ＋ 推一条输入（`行为` 由各格给）。 */
	const 就绪 = (A, 行为) => {
		挂印抽格(A, 行为);
		A.enter('print-roll');
		A.input.push({ id: '翻新' });
	};

	/** 收命令体印出的东西，**并记下到达那一刻的事实块**（「延后到结算后才出门」只有这样才判得动）。 */
	const 装收 = (A) => {
		const 收 = [];
		A.ports.render.setCollector((o) => 收.push({ 件: o, 当时: JSON.stringify(A.facts()) }));
		return 收;
	};

	/* ── C4：呈现时序 ───────────────────────────────────────────── */

	test('C4①【正例·延后到结算后】：命令体印的两行按序到达，且**到达时事实块已是新值**', () => {
		const A = 造会话('A');
		const 收 = 装收(A);
		就绪(A, (c) => {
			c.commit({ 值: '新' });
			c.ports.render.output('第一行');
			c.ports.render.render({ node: 'x' });
			c.ports.render.output('第二行');
		});
		const 读数 = A.step();
		assert.eq(读数.settled, 'applied', `★应 applied（实得 ${JSON.stringify(读数)}）`);
		assert.eq(收.map((x) => x.件.text ?? x.件.kind).join('／'), '第一行／render／第二行',
			`★命令体的三件应按序出门（实得 ${JSON.stringify(收.map((x) => x.件))}）`);
		assert.eq(收.every((x) => JSON.parse(x.当时).值 === '新'), true,
			'★每一件到达时事实块都应是**新值**（⇒ 出门在结算之后，✗ 在判决点之前）');
	});

	test('C4②【负例·`return false`】：命令体印过的**一条都不出门**，事实块逐项不变', () => {
		const A = 造会话('A');
		const 收 = 装收(A);
		就绪(A, (c) => {
			c.commit({ 值: '新' });
			c.ports.render.output('半截：翻新中');
			return false;
		});
		const 前 = JSON.stringify(A.facts());
		const 读数 = A.step();
		assert.eq(读数.settled, 'rejected', '★应 rejected');
		assert.eq(读数.rolledBack, true, '★须报回滚');
		assert.eq(收.length, 0, `★被拒 ⇒ 屏上**不得留半截**（实得 ${JSON.stringify(收.map((x) => x.件))}）`);
		assert.eq(JSON.stringify(A.facts()), 前, '被拒 ⇒ 事实块逐项不变');
	});

	test('C4③【负例·结构化拒绝】：同上（`RPG.refuse` 那一路也走同一个丢弃）', () => {
		const A = 造会话('A');
		const 收 = 装收(A);
		就绪(A, (c) => {
			c.ports.render.output('半截');
			throw R().refuse('PRINT-JAMMED', '印不出来。');
		});
		const 读数 = A.step();
		assert.eq(读数.reason, 'PRINT-JAMMED', `★理由须原样带出（实得 ${JSON.stringify(读数)}）`);
		assert.eq(收.length, 0, '★结构化拒绝 ⇒ 半截同样不得出门');
	});

	test('C4④【负例·普通异常】：丢半截 ＋ **原样上抛**（✗ 吞成 rejected）', () => {
		const A = 造会话('A');
		const 收 = 装收(A);
		就绪(A, (c) => { c.ports.render.output('半截'); throw new Error('打印之后崩了'); });
		let 抛 = null;
		try { A.step(); } catch (e) { 抛 = e; }
		assert.eq(!!抛 && /打印之后崩了/.test(String(抛.message)), true,
			`★普通异常须上抛（实得 ${抛 ? 抛.message : '**没抛**'}）`);
		assert.eq(收.length, 0, '★抛之前印的半截也不得出门（✗ 只保事实块）');
	});

	test('C4⑤【正控·非命令路径不受影响】：`when` 不适用时场景重渲照常出门', () => {
		const A = 造会话('A');
		const 收 = 装收(A);
		挂印抽格(A, (c) => { c.commit({ 值: '新' }); });
		A.enter('print-roll');
		A.step();                                        // 真跑一次 ⇒ 值变「新」
		A.ports.render.output('场景重渲');                // ★命令**之外**的印：应当场出门
		assert.eq(收.length >= 1 && 收[收.length - 1].件.text === '场景重渲', true,
			'★非命令期的呈现不该被缓冲（缓冲只围命令体，✗ 围整个会话）');
	});

	/* ── C3：随机消耗读数（退位契约）──────────────────────────────── */

	test('C3①【正例】：成功命令抽两次 ⇒ `rngDraws` 报 2，且**流真的被消耗**（自计数同增）', () => {
		const A = 造会话('A');
		就绪(A, (c) => { const a = c.rng.next(); const b = c.rng.next(); c.commit({ 抽: [a, b] }); });
		const 读数 = A.step();
		assert.eq(读数.rngDraws, 2, `★须报出本次消耗 2 次（实得 ${JSON.stringify(读数)}）`);
		assert.eq(A.rng.次, 2, '★流本身也须真被消耗（视图 ✗ 另起一条流）');
		assert.eq(JSON.stringify(A.facts().抽), JSON.stringify(['抽1', '抽2']), '★抽取值应落进事实块');
	});

	test('C3②【负例·退位契约】：被拒 ⇒ 读数**报出已消耗的次数**（流已推进，✗ 假装能退）', () => {
		const A = 造会话('A');
		const 收 = 装收(A);
		就绪(A, (c) => {
			c.rng.next(); c.rng.next();
			c.commit({ 抽: '不该落' });
			throw R().refuse('ROLL-JAMMED', '骰子卡住了。');
		});
		const 读数 = A.step();
		assert.eq(读数.settled, 'rejected', '★应 rejected');
		assert.eq(读数.rngDraws, 2, `★被拒也要报消耗量（契约就是这条读数；实得 ${JSON.stringify(读数)}）`);
		assert.eq(A.facts().抽, undefined, '★被拒 ⇒ 抽取值不得落（草稿丢弃）');
		assert.eq(A.rng.次, 2, '★流不回退（通用回退不存在）⇒ 自计数仍是 2');
		assert.eq(收.length, 0, '被拒 ⇒ 半截呈现也不出门');
	});

	test('C3③【边界·不适用】：`when` 为假那条路读数为 `0`', () => {
		const A = 造会话('A');
		就绪(A, () => {});
		A.step();                                        // 第一次：跑（什么都不做）
		A.input.push({ id: '翻新' });
		A.step();                                        // 第二次：`when`… 本场景无 `when` ⇒ 仍跑
		const B = 造会话('B');
		B.mount('g', () => ({ id: 'g', actions: [{ id: 'x', when: () => false, run: () => {} }] }));
		B.enter('g');
		B.input.push({ id: 'x' });
		const 读数 = B.step();
		assert.eq(读数.reason, 'when-false', '★须走不适用那条路');
		assert.eq(读数.rngDraws, 0, `★不适用 ⇒ 消耗 0（实得 ${JSON.stringify(读数)}）`);
	});

	test('C3⑤【归属按**发生时刻**】：命令期的视图被存下来、在**后续**命令里才抽 ⇒ 记在**当次**那条上', () => {
		const A = 造会话('A');
		let 存 = null;
		就绪(A, (c) => { 存 = c.rng; c.commit({ 值: '新' }); });     // 第一条命令：把视图存下（本条抽 0 次）
		const 一 = A.step();
		assert.eq(一.rngDraws, 0, `★第一条没抽 ⇒ 报 0（实得 ${JSON.stringify(一)}）`);
		A.mount('later', () => ({ id: 'later', render: () => {}, actions: [{ id: 'go', run: (c) => { 存.next(); 存.next(); c.commit({ 值: '新2' }); } }] }));
		A.enter('later');
		A.input.push({ id: 'go' });
		const 二 = A.step();
		assert.eq(二.rngDraws, 2, `★后续命令里的抽取应记在**当次**（实得 ${JSON.stringify(二)}）`
			+ ' —— 记回给早已结束的那条就是把量报在死人头上');
		assert.eq(A.rng.次, 2, '★流本身也被消耗了 2 次（✗ 视图另起一条流）');
	});

	test('C3④【配置动词不计次】：命令体内 `set`／`setSequence`／`reset` ✗ 不得算作抽取', () => {
		const A = 造会话('A');
		就绪(A, (c) => {
			c.rng.set(() => 0.5);
			c.rng.setSequence([0.1, 0.2]);
			c.rng.reset();
			c.rng.next();
			c.commit({ 值: '新' });
		});
		const 读数 = A.step();
		assert.eq(读数.rngDraws, 1, `★只有 ` + '`next`' + ` 算抽取（实得 ${JSON.stringify(读数)}）`);
		assert.eq(A.rng._impl, null, '★配置动词须作用在**原流**上（✗ 作用在一个视图壳上 —— 那等于设了个空）');
		assert.eq(A.rng._序 && A.rng._序.length, 2, '★`setSequence` 的写入须落在原流上（同上）');
	});
})();
