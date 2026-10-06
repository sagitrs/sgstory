/* `sgstory#2025`（E2 · 设计 §4「返程的一致提交」）**实现笔**的单测。
 *
 * 六格＝t4 在 `#2025` 给的负控形（`E2-1`～`E2-4` ＋ 两条正控），按**受测树重锚、符号为准**采用：
 *   本档钉的符号＝`RPG.commitBoundary.{preview,commit,settled,ledger}`（✗ 不按行号）。
 * ⚠ 每条用例先 `净()`（宿主归档＋故事变量复位）——★冻结类那一格要靠「`$rpgCommits` 本就不存在」才有判别力。
 * ⚠ 本档 ✗ 借用别档的件（`物品` 是本档自造的同形数据）。
 */
(() => {
	const R = () => setup.RPG;
	const H = () => globalThis.__host;
	const C = () => R().commitBoundary;
	const J = (x) => JSON.stringify(x);
	const 净 = () => { H().host.reset(); H().state.reset(); };

	/** 一块**活事实**（纯数据；✗ 借故事面） */
	const 事实 = () => ({ 位置: 'L7', 机会: 3, 物品: [{ id: '铜矿', charges: 1 }], 进度: ['L6'] });
	/** 一个合法计划：位置前进一步 ＋ 扣一次机会 ＋ 加一件物 ＋ 记进度 */
	const 计划推进 = (草稿) => {
		草稿.位置 = 'L8';
		草稿.机会 = 草稿.机会 - 1;
		草稿.物品.push({ id: '铜矿', charges: 1 });
		草稿.进度.push('L7');
	};
	/** 故事侧的**结构化拒绝**（`RPG.refuse` 返回错误对象 ⇒ 本处负责**抛**） */
	const 故事拒 = (情形) => { throw R().refuse(`E2_REFUSE_${情形}`, `这一步现在做不了（${情形}）。`); };

	test('★#2025 E2-1：五种**非合法提交**逐种零副作用（✗ 位置不动／机会不扣／物品不损／进度不标）', () => {
		for (const 情形 of ['非法', '战中', '死亡', '耗尽', '取消预览']) {
			净();
			const f = 事实(); const 前 = J(f);
			if (情形 === '取消预览') {
				/* 预览合法 ⇒ **不调** `commit` ⇒ 活事实须逐字不变（「预览取消不写状态」） */
				const p = C().preview({ request: 'e2-1-取消预览', facts: f, apply: 计划推进 });
				assert.eq(p.status, 'previewed', '取消预览：预览本身合法');
				assert.eq(J(f), 前, `✗ 取消预览动了状态：${情形}`);
			} else {
				const p = C().preview({ request: `e2-1-${情形}`, facts: f, apply: () => 故事拒(情形) });
				assert.eq(p.status, 'rejected', `${情形} ⇒ 须收成**拒绝结果面**（✗ 抛）`);
				assert.eq(p.code, `E2_REFUSE_${情形}`, `${情形} ⇒ 拒绝码须具名`);
				assert.eq(J(f), 前, `✗ 非法提交动了状态：${情形}（${前} ⇒ ${J(f)}）`);
			}
			assert.eq(C().ledger().size, 0, `${情形}：✗ 不得留下「已提交事实」`);
		}
		/* ★公共面的**载荷**（✗ 只信 `preview` 当场给的那张）：票据可被故事存进 `$` **跨拍**读回 ⇒ 可被改坏／伪造 */
		净();
		const f2 = 事实(); const 前2 = J(f2);
		const 坏票 = { request: 'e2-1-坏载荷', 前像: 事实(), 计划: [1, 2] };      // ★计划是数组（✗ 纯数据对象）
		const r2 = C().commit(坏票, { facts: f2 });
		assert.eq(r2.status, 'rejected', '坏载荷票据 ⇒ 须拒（✗ 半态：删了旧键而没赋新键）');
		assert.eq(r2.code, 'COMMIT_BAD_TICKET', '拒绝码须具名');
		assert.eq(J(f2), 前2, '★坏载荷 ⇒ 活事实逐字不变');
		assert.eq(C().ledger().size, 0, '坏载荷 ⇒ ✗ 不得留下已提交事实');
	});

	test('★#2025 E2-2：**旧预览**拒绝（持物／位置已变 ⇒ ✗ 按旧预览落地；重算后可提交）', () => {
		净();
		const f = 事实();
		const p = C().preview({ request: 'e2-2', facts: f, apply: 计划推进 });
		assert.eq(p.status, 'previewed', '前置：预览成功');
		f.位置 = 'L9';                                  // ★预览之后现实变了（位置已改）
		const 变后 = J(f);
		const r = C().commit(p.ticket, { facts: f });
		assert.eq(r.status, 'rejected', '旧预览须**拒绝**（✗ 按旧预览落地）');
		assert.eq(r.code, 'COMMIT_STALE', '拒绝码须具名 COMMIT_STALE');
		assert.eq(J(f), 变后, '★拒绝旧预览 ⇒ 活事实**逐字不变**（✗ 被陈旧计划覆盖）');
		assert.eq(C().ledger().size, 0, '拒绝 ⇒ ✗ 不得留下已提交事实');
		/* ★恢复路（设计 §4「拒绝旧预览**或**重算并重新确认」）：重算 ⇒ 再确认 ⇒ 提交成功 */
		const p2 = C().preview({ request: 'e2-2', facts: f, apply: 计划推进 });
		assert.eq(p2.status, 'previewed', '重算：预览成功');
		const r2 = C().commit(p2.ticket, { facts: f });
		assert.eq(r2.status, 'applied', '重算并重新确认 ⇒ 可提交');
		assert.eq(f.位置, 'L8', '重算后的计划已落地（从 L9 起算仍为 L8 —— 本档计划是绝对赋值）');
	});

	test('★#2025 E2-3：**同一请求**重复提交 ⇒ 只发生一次，且**返回已提交事实**', () => {
		净();
		const f = 事实();
		const p = C().preview({ request: 'e2-3', facts: f, apply: 计划推进 });
		const 一 = C().commit(p.ticket, { facts: f });
		assert.eq(一.status, 'applied', '首次提交');
		const 一次后 = J(f);
		assert.eq(C().settled('e2-3') != null, true, '已提交事实可读');
		/* 同一请求**再来一次**（模拟重复回调／双击）：须零副作用并还事实 */
		const p2 = C().preview({ request: 'e2-3', facts: f, apply: 计划推进 });
		const 二 = C().commit(p2.ticket, { facts: f });
		assert.eq(二.status, 'settled', '重复请求 ⇒ 走「已提交」支（✗ 再动一次状态）');
		assert.eq(二.reused, true, '须标记 reused（调用方据此只重绘）');
		assert.eq(J(二.facts), 一次后, '★须**返回已提交事实**');
		assert.eq(J(f), 一次后, `✗ 重复提交双扣：${一次后} ⇒ ${J(f)}`);
		assert.eq(C().ledger().size, 1, '同一请求只占一条账');
		/* ★`N-1`（`dev-9`）**次序**：**去重读在载荷校验之前** ⇒「已提交的请求 ＋ 被改坏的票」
		 *   仍须**返回已提交事实**（✗ 错报 `COMMIT_BAD_TICKET`）—— 设计 §4 原文「返回已提交事实」。 */
		const 坏票 = { request: 'e2-3', 前像: 事实(), 计划: [1, 2] };
		const 三 = C().commit(坏票, { facts: f });
		assert.eq(三.status, 'settled', '★已提交的请求 ⇒ 仍须走「已提交」支（✗ 因载荷坏而错报）');
		assert.eq(三.reused, true, '须标记 reused');
		assert.eq(J(三.facts), 一次后, '★须返回已提交事实（逐字）');
		assert.eq(J(f), 一次后, '活事实仍逐字不变');
	});

	test('★#2025 E2-4：故障注入 ⇒ **不留半回城**；`publish` 失败 ⇒ 只重绘（✗ 重跑领域副作用）', () => {
		/* ⓐ 记账写不进（宿主冻结 ⇒ 写后回读不到）⇒ **回滚事实**、✗ 半态 */
		净();
		const f = 事实(); const 前 = J(f);
		const p = C().preview({ request: 'e2-4a', facts: f, apply: 计划推进 });
		Object.freeze(State.variables);                // ★假宿主：此后 `$rpgCommits` 写不进
		const r = C().commit(p.ticket, { facts: f });
		assert.eq(r.status, 'rejected', '记账失败 ⇒ 拒绝（✗ 假装成功）');
		assert.eq(r.code, 'COMMIT_LEDGER_FAILED', '拒绝码须具名');
		assert.eq(J(f), 前, `★半回城：位置已落而账未记（${前} ⇒ ${J(f)}）`);
		assert.eq(C().ledger().size, 0, '账上不得有半条');

		/* ⓐ2 宿主**静默丢写**（读得到对象、写进去留不下）⇒ 须由**写后回读**抓住（✗ 假装成功）
		 *   与 ⓐ 不同：ⓐ 的写会**抛**（冻结 ⇒ 不可扩展），这一形**不抛** —— 没有回读就跟「成功」一模一样。 */
		净();
		const h = 事实(); const 前2 = J(h);
		const p1 = C().preview({ request: 'e2-4a2', facts: h, apply: 计划推进 });
		Object.defineProperty(State.variables, 'rpgCommits', { configurable: true, get: () => ({}), set: () => {} });
		const r1 = C().commit(p1.ticket, { facts: h });
		assert.eq(r1.code, 'COMMIT_LEDGER_FAILED', '静默丢写 ⇒ 须具名拒（✗ 假装成功）');
		assert.eq(J(h), 前2, '★静默丢写也不得留下半回城（事实已落而账上没记）');

		/* ⓑ 提交成功但**发布演出**失败 ⇒ 事实与账**仍在**（只 `published:false`） */
		净();
		const g = 事实();
		const p2 = C().preview({ request: 'e2-4b', facts: g, apply: 计划推进 });
		const r2 = C().commit(p2.ticket, { facts: g, publish: () => { throw new Error('重绘失败'); } });
		assert.eq(r2.status, 'applied', '★重绘失败 ✗ 影响提交结果');
		assert.eq(r2.published, false, '须报 published:false（调用方据此只重绘）');
		assert.eq(g.位置, 'L8', '★已提交事实仍成立');
		assert.eq(C().settled('e2-4b') != null, true, '账仍在（✗ 因重绘失败回滚）');
		const 账后 = J(g);
		const r3 = C().commit(p2.ticket, { facts: g });                 // 重试（同一请求）
		assert.eq(r3.status, 'settled', '重试走「已提交」支');
		assert.eq(J(g), 账后, '★重试 ✗ 重跑领域副作用');
	});

	test('★#2025 E2-P1【正控】：接入点在场（六格可注册，✗ 死格）', () => {
		净();
		for (const m of ['preview', 'commit', 'settled', 'ledger']) {
			assert.eq(typeof C()?.[m], 'function', `★接入点缺 ${m} ⇒ 六格住在不存在的面上`);
		}
		assert.ok(Number.isInteger(C().上限) && C().上限 > 0, '上限须是正整数（有界账）');
		/* ★`N1`（`dev-9`）：**读不得写** —— 读口若顺手建出空表，`envelope().domains` 会把它记成「有落点」、
		 *   `audit().absent` 里也就看不到它了（★假落点遮住审计面）。 */
		assert.eq('rpgCommits' in State.variables, false, '前置：本格尚未写过账');
		C().settled('从没交过的请求'); C().ledger();
		assert.eq('rpgCommits' in State.variables, false, '★读口 ✗ 得建键（那会遮住 audit().absent）');
		/* 正面走一遍：这条保证上面五格的红**不是因为面不存在** */
		const f = 事实();
		const p = C().preview({ request: 'e2-P1', facts: f, apply: 计划推进 });
		assert.eq(C().commit(p.ticket, { facts: f }).status, 'applied', '正控：合法提交能成功');
		/* 反向：真写过之后键才该在（✗ 把「读不得写」写成「永不写」） */
		assert.eq('rpgCommits' in State.variables, true, '真提交之后键须在（本判据 ✗ 是「永不写」）');
	});

	test('★#2025 E2-P2【幂等对照】:同请求第二次零副作用，且**账进得了盘**（还原后仍读得到）', () => {
		净();
		const f = 事实();
		const 一 = C().commit(C().preview({ request: 'e2-P2', facts: f, apply: 计划推进 }).ticket, { facts: f });
		assert.eq(一.status, 'applied', '前置：首次提交成功');
		const 快 = J(f);
		const 二 = C().commit(C().preview({ request: 'e2-P2', facts: f, apply: 计划推进 }).ticket, { facts: f });
		assert.eq(二.status, 'settled', '第二次须报「已提交过」');
		assert.eq(J(f), 快, '第二次零副作用');
		/* ★进得了盘：`$rpgCommits` 是纯数据 ⇒ 宿主往返后 `settled()` 仍读得到（E4 的面） */
		const 盘 = JSON.parse(J(State.variables.rpgCommits));
		State.variables.rpgCommits = 盘;
		assert.eq(J(C().settled('e2-P2')), J(一.facts), '★往返后已提交事实逐字相同');
	});
})();
