/* 老宅木箱支线 · **会话侧薄桥**（`sgstory#1912` 交付 1 · 行 ④「两会话状态／随机源／事件／输入互不串」）
 *
 * ## 它是什么
 *   把「地窖木箱」那一手的**形**（一次性奖励 ＋ 前置守卫 ＋ 一次随机抽取 ＋ 一次呈现）
 *   搬到 `GameSession` 的会话面上，好让 `run-baseline.mjs` 的 ④ 格有东西可驱动。
 *
 * ## 为什么是**另写一份**而不是包住那份全局 fixture（`src/story/cellar.js`）
 *   那份写的是 `State.variables.*` ＋ 全局 `choice`（全局装置面）。**照原样包进会话 ⇒ 它改的仍是
 *   全局态**，会话自己的 `facts()` 一动不动 ⇒ 「两会话互不串」那几条断言会在**空装置**上恒真
 *   （＝假绿）。⇒ 本档写**会话侧同形件**：同一件事（守卫／一次性奖励／随机抽取／出声），
 *   写口换成 `ctx.commit`／`ctx.rng`。**全局那条路径仍是那一份真 fixture 在判**（本档另三格）。
 *
 * ## 刀（`run-baseline.mjs --selftest` 用）
 *   四处「每会话一份」各占**一行**、形如 `单例.X ?? 本会话那份`；刀把 `??` 换成 `??=`（写回单例）
 *   ⇒ 两面共用同一件 ⇒ 恰好红一格。**桥是装置，不是被测物**：刀改的是「接线接错了会话」这一族
 *   现实事故（✗ 不改引擎）。
 */
globalThis.__sess = (() => {
	const R = () => setup.RPG;
	const 注册表 = Object.create(null);   // id → 会话（本桥自己的登记，✗ 引擎面）
	const 单例 = Object.create(null);     // 刀把某一面钉成共享：`??` → `??=`（写回单例）

	/** 计数随机源（读数：`次`）—— 每会话一份。 */
	const 造计数流 = (id) => ({ 名: id, 次: 0, next() { this.次 += 1; return `${id}#${this.次}`; } });

	/** 建一个会话：随机源、登记各一份。端口取引擎注册的那一份（引擎会为每会话新建呈现门面）。 */
	const 建会话 = (id) => {
		const rng = 单例.rng ?? 造计数流(id);
		const A = new (R().GameSession)({ id, rng, facts: { 会话: id } });
		注册表[id] = A;
		return A;
	};

	/** ① 状态写口：写进**本会话**的事实块（按 `ctx.session.id` 找回它自己那个会话）。 */
	const 提交 = (ctx, patch) => (单例.写 ?? 注册表[ctx.session.id]).commit(patch);
	/** ② 事件：订在**本会话**上。 */
	const 订 = (s, tp, fn) => (单例.订到 ?? s).on(tp, fn);
	/** ③ 输入：推进**本会话**的队列。 */
	const 推 = (s, 条) => (单例.推到 ?? s).input.push(条);

	/** 木箱格的**会话侧同形件**：进入副作用 ＋ 带守卫的一次性动作 ＋ 随机抽取 ＋ 呈现。 */
	const 挂木箱格 = (A) => A.mount('cellar-box', (ctx) => ({
		id: 'cellar-box',
		enter: (c) => { c.commit({ 进入: (c.facts().进入 ?? 0) + 1 }); },
		render: (c) => { c.ports.render.output(`木箱：${c.facts().开过 ? '已开' : '未开'}`); },
		actions: [{
			id: 'open-box',
			when: (c) => c.facts().开过 !== true,
			run: (c) => { 提交(c, { 开过: true, 绷带: (c.facts().绷带 ?? 0) + 1, 掷: c.rng.next() }); },
		}],
	}));

	/** 无守卫的**探针格**：事件／输入两条面要点「想跑就跑」，✗ 受木箱那条 `when` 干扰
	 *  （守卫为假时 `step` **不 emit** ⇒ 「跑两条应收 2 次」会冤红）。 */
	const 挂探针格 = (A) => A.mount('probe', (ctx) => ({
		id: 'probe',
		actions: [{ id: 'ping', run: (c) => { 提交(c, { 次数: (c.facts().次数 ?? 0) + 1 }); } }],
	}));

	/**
	 * ★`sgstory#1925`（交付 3/3）**命令提交的试点格**：木箱开箱走**一条命令**（＝一个场景动作），
	 *   三笔效果（开箱／发奖／标记）**全写草稿**、由 `step()` **一次结算**；任一步拒绝/中断 ⇒ **零残留**。
	 *
	 * ⚠ 与 `挂木箱格` 的关键差别（✗ 不是重复装置）：
	 *   · 本格**走 `ctx.commit`**（＝命令体的**草稿**写口）—— 那正是本票要判的那条路；
	 *     `挂木箱格` 走 `提交(c, …)`（交付 1 的「每会话一份」薄桥，它直调**会话**的 `commit`，
	 *     用刀把某一面钉成共享 ⇒ 判「两会话互不串」）。两者判**不同的面**，✗ 不互相取代。
	 *   · `行为` 缺省＝三笔都写（正例）；给 `行为` ⇒ 由调用方注入拒绝/中断（判据的负例臂用）。
	 */
	const 挂命令木箱格 = (A, 行为 = null) => A.mount('cellar-commit', (ctx) => ({
		id: 'cellar-commit',
		enter: (c) => { c.commit({ chest: 'closed', loot: [], marked: false }); },
		render: (c) => { c.ports.render.output(`命令木箱：${c.facts().chest === 'open' ? '已开' : '未开'}`); },
		actions: [{
			id: 'open-chest',
			when: (c) => c.facts().chest === 'closed',
			run: 行为 ?? ((c) => {
				c.commit({ chest: 'open' });            // ① 开箱
				c.commit({ loot: ['绷带', '硬币'] });    // ② 发奖
				c.commit({ marked: true });             // ③ 标记
			}),
		}],
	}));

	return { 建会话, 挂木箱格, 挂探针格, 挂命令木箱格, 订, 推 };
})();
