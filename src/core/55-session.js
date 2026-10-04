/* L1 · **GameSession**（`sgstory#1912` 交付 1 · 步 3）
 *
 * ## 形（**冻结** —— 出处：`sagitrs/sgstory#1912` 评论 `5966338996`；要改**先改那条评论**）
 *
 * ① **泵（三者都在会话上）**
 *     `mount(id, factory)` — 挂内容（factory 收 ctx，返回场景）
 *     `enter(id)`          — 进入场景：跑一次**进入副作用**（幂等的那些在此）
 *     `step()`             — 单步：消费**一条**输入 ⇒ 执行其动作 ⇒ 呈现一次
 *     `run({maxSteps})`    — 循环 step 到「输入队列空」或撞上限
 *                            ⇒ 读数 `{ steps, stopped: 'input-empty' | 'max-steps' | 'no-scene' }`
 *                            ★**停下原因必须可读**（✗ 无上限 while —— 那会把「死循环」与「跑完了」写成同一读数）
 *
 * ② **场景形**：`{ id, enter(ctx), render(ctx), actions: [{ id, when(ctx), run(ctx) }] }`
 *
 * ③ **ctx 面（会话作用域，✗ 摸全局）**：`ctx.session`（`id`／`epoch`）｜`ctx.ports`（**该会话那一份**）｜
 *     `ctx.rng`（**该会话的随机源实例**，✗ 全局 `RPG.rng`）｜`ctx.facts()`（快照＝读）＋ `ctx.commit(patch)`（写）｜
 *     `ctx.input`（`push`／`next`／`pending`）｜`ctx.emit`／`on`
 *
 * ## 为什么这样切（本重构要消灭的那类形）
 *   两个会话必须**天然不串**：状态（各持事实块）／随机源（各持实例）／事件（各持订户）／输入（各持队列）／
 *   呈现（各持收集器）。⇒ 任一项走全局，两会话就会互相看见 —— 这正是 D2／`#1801` 族「时序意外」的根。
 *   ⚠ 本档是 **L1**：**不得**出现任何宿主符号（`State`／`$`／`jQuery`／`Dialog`）⇒ 一切经 `ctx.ports` 走。
 *   ⚠ 装载序：本档排 `43/45/46` 之后（字典序），只**在运行时**被构造，✗ 装载期取用别的档产物。
 */
(() => {
	/** 深拷贝一份事实块（快照＝读；✗ 把内部引用递出去 —— 那会让「快照」变成「后门」）。 */
	const 快照 = (x) => {
		if (x == null || typeof x !== 'object') return x;
		if (Array.isArray(x)) return x.map(快照);
		const out = {};
		for (const k of Object.keys(x)) out[k] = 快照(x[k]);
		return out;
	};

	/** ★`#1933` C3：**命令期的随机消耗计数**。
	 *   把 `ctx.rng` 的方法包一层计数（每次调用 +1），**`this` 仍绑原对象**
	 *   （✗ 换成代理再调 —— `this.次` 这类自计数会错位）。
	 *   配置动词不计（`set`／`setSequence`／`reset`／`_impl`）：它们是设源与复位，✗ 不是抽取。
	 *   ★**契约**（票面 C3 那条）：拒绝**不回退**随机流（通用回退不存在）—— 本计数就是给调用方的**依据**
	 *     （「拒后流已推进 N 次」可判）；批 D 落设计文档 doc-3 §4 的 `rngAfter`（后态）时**换**本字段。
	 *   ★**归属按「发生时刻」**（`槽()` 取**当下**那条命令的计数）：命令期拿到的视图若被存下来、
	 *     在**后续**命令里才抽 ⇒ 记在**后来**那条上（✗ 记回给早已结束的那条 —— 那会报出一个死人头上的量）。 */
	const 计消耗视图 = (rng, 槽) => {
		const 配置动词 = new Set(['set', 'setSequence', 'reset', '_impl']);
		const 视图 = Object.create(Object.getPrototypeOf(rng) ?? Object.prototype);
		for (const k of Reflect.ownKeys(rng)) {
			const v = rng[k];
			if (typeof v !== 'function') { 视图[k] = v; continue; }
			/* 配置动词：**仍绑原对象**（`set`／`setSequence` 是改原对象的 `_impl`；绑到视图上就等于设了个空）——只是不计次。 */
			if (配置动词.has(k)) { 视图[k] = (...args) => Reflect.apply(v, rng, args); continue; }
			视图[k] = (...args) => { const 计 = 槽(); if (计) 计.n += 1; return Reflect.apply(v, rng, args); };
		}
		return 视图;
	};

	/** 会话级输入队列（FIFO；`pending` 是**读数**：测试据此断「B 的走完没消费 A 的」）。 */
	const 新建队列 = () => {
		const q = [];
		return {
			push(条) { q.push(条); return 条; },
			next() { return q.length ? q.shift() : null; },
			pending: () => q.length,
			_全部: () => q.slice(),
		};
	};

	/** 会话级事件面（各持订户 ⇒ 两会话不串）。 */
	const 新建事件 = () => {
		const 订 = new Map();
		return {
			on(tp, fn) {
				if (typeof fn !== 'function') throw new Error('session.on 需要函数');
				if (!订.has(tp)) 订.set(tp, new Set());
				订.get(tp).add(fn);
				return () => 订.get(tp)?.delete(fn);
			},
			emit(tp, payload) {
				const s = 订.get(tp);
				let n = 0;
				for (const fn of s ?? []) { fn(payload); n += 1; }
				return { delivered: n, topic: String(tp) };
			},
		};
	};

	/** 会话级 render 门面：**自有收集器**（✗ 动全局那份 ⇒ 两会话输出不串）。 */
	const 新建呈现 = (全局) => {
		let 收 = null;
		/* ★`#1933` C4：**命令期的呈现缓冲**（栈式 —— 命令体里若又 `step()` 一次，两层各管各的）。
		 *   口径：栈非空 ⇒ 呈现**入缓冲**（✗ 出门）；放行＝按序出门；丢弃＝原样丢掉。
		 *   `起缓冲`／`放行`／`丢弃` 是**会话内部面**（✗ 公开契约；外部只用 `output`／`render`／`setCollector`）。 */
		const 缓栈 = [];
		const 出门 = (件) => {
			if (收) { 收(件); return; }
			if (件.kind === 'output') 全局.output(件.text, 件);
			else 全局.render(件.node);
		};
		return {
			output(text, opts) {
				const 件 = { kind: 'output', text: String(text), ...(opts ?? {}) };
				if (缓栈.length) { 缓栈[缓栈.length - 1].push(件); return; }
				出门(件);
			},
			render(node) {
				const 件 = { kind: 'render', node };
				if (缓栈.length) { 缓栈[缓栈.length - 1].push(件); return; }
				出门(件);
			},
			setCollector(fn) {
				if (fn != null && typeof fn !== 'function') throw new Error('RenderPort.setCollector 需要函数或 null');
				收 = fn ?? null;
			},
			起缓冲() { 缓栈.push([]); return 缓栈.length; },
			放行() {
				const 件 = 缓栈.pop() ?? [];
				for (const x of 件) 出门(x);
				return 件.length;
			},
			丢弃() { return (缓栈.pop() ?? []).length; },
		};
	};

	RPG.GameSession = class GameSession {
		/**
		 * @param id    会话 id（读数用；✗ 参与判活 —— 判活走 `epoch`）
		 * @param ports 三端口的**这一份**（缺省取全局注册的那些）
		 * @param rng   **该会话的随机源实例**（必给：✗ 回落全局 `RPG.rng`，那会让两会话共享随机流）
		 */
		constructor({ id = 'session', ports = null, rng = null, facts = {}, objects = null } = {}) {
			if (!rng) throw new Error('GameSession 需要**自己的** rng 实例（✗ 回落全局 RPG.rng）');
			this.id = String(id);
			this._facts = 快照(facts);
			/* ★`sgstory#1967`（C2·对象态回滚）：`facts` 只覆盖**会话事实块**，而命令体常直接改**引擎对象**
			 *   （`P.hp`／件 `charges`／地图当前位置…）⇒ 拒后那些改动**仍留着** ✗（基线格 `[commit-c2]` 的现读数）。
			 *   ⇒ 会话收一个**声明面**：`objects`（函数或数组 ⇒ 返回**本次会被改的对象**）——
			 *   ★为什么是声明而不是自动扫：`core` **不许**知道 `DND3`／`BABEL`（分层禁令）⇒ 由**装载方**
			 *     点名它自己那套对象 ✓（✗ 让内核去猜玩家的位置）。 */
			this._objects = typeof objects === 'function' ? objects : (() => objects ?? []);
			this._input = 新建队列();
			this._events = 新建事件();
			this._scenes = new Map();
			this._scene = null;
			this._entered = new Set();
			this._steps = 0;
			const 全局 = {
				persist: ports?.persist ?? RPG.portOf('persist'),
				render: ports?.render ?? RPG.portOf('render'),
				lifecycle: ports?.lifecycle ?? RPG.portOf('lifecycle'),
			};
			this.ports = { persist: 全局.persist, render: 新建呈现(全局.render), lifecycle: 全局.lifecycle };
			this.rng = rng;
			this.ctx = Object.freeze({
				session: { id: this.id, get epoch() { return 全局.lifecycle.epoch(); } },
				ports: this.ports,
				rng: this.rng,
				facts: () => 快照(this._facts),
				commit: (patch) => this.commit(patch),
				input: this._input,
				emit: (tp, payload) => this._events.emit(tp, payload),
				on: (tp, fn) => this._events.on(tp, fn),
			});
		}

		/* ── 状态面（读＝快照；写＝合并补丁）────────────────────────────── */

		/** 事实块**快照**（✗ 递内部引用）。 */
		facts() { return 快照(this._facts); }

		/** 写：浅合并一层补丁（交付 3 在其上做原子性；交付 1 只留这个口）。 */
		commit(patch = {}) {
			if (patch == null || typeof patch !== 'object') throw new Error('ctx.commit 需要对象补丁');
			Object.assign(this._facts, 快照(patch));
			return this.facts();
		}

		/* ── 事件／输入（会话作用域）────────────────────────────────────── */

		on(tp, fn) { return this._events.on(tp, fn); }
		emit(tp, payload) { return this._events.emit(tp, payload); }
		get input() { return this._input; }

		/* ── 泵 ────────────────────────────────────────────────────────── */

		/** 挂内容：`factory(ctx)` ⇒ 场景。 */
		mount(id, factory) {
			if (typeof factory !== 'function') throw new Error('mount(id, factory) 需要工厂函数');
			this._scenes.set(String(id), factory);
			return this;
		}

		/** 进入场景：跑一次**进入副作用**（幂等 ⇒ 同 id 重复进入不重跑）。 */
		enter(id) {
			const key = String(id);
			const factory = this._scenes.get(key);
			if (!factory) return { entered: false, reason: 'no-scene', scene: key };
			const scene = factory(this.ctx);
			if (!scene || typeof scene !== 'object') return { entered: false, reason: 'bad-scene', scene: key };
			this._scene = scene;
			if (!this._entered.has(key)) { this._entered.add(key); scene.enter?.(this.ctx); }
			return { entered: true, scene: key };
		}

		/**
		 * ★`#1925`：**命令的原子结算** —— 把一条命令（＝一个场景动作）跑在**草稿**上，一次落定。
		 *
		 *   ① 动作体里 `ctx.commit(patch)` 写的是**本次命令的草稿**（✗ 不直接落活事实块）；
		 *      同期 `ctx.facts()` 读「**已提交事实 ＋ 草稿**」的合并视图（⇒ 动作里「写完再读」看得到
		 *      自己的写；✗ 看得到别处的半成品）。
		 *   ② 正常返回 ⇒ 草稿**一次性**并入事实块（浅合并一层，与交付 1 的 `commit` 同形）。
		 *   ③ `return false`（`#1776`：动作自己判定做不到）／抛**结构化拒绝**（`RPG.refuse` ⇒ `e.code`
		 *      是非空串，`#1921`）⇒ **丢弃草稿** ⇒ 活事实块**逐项不变**（零残留）。
		 *   ④ 抛**普通异常** ⇒ **先丢草稿、再把异常上抛**（✗ 留半态；✗ 吞真 bug —— 吞掉会把「崩了」
		 *      伪装成「被拒绝」）。
		 *
		 * ⑤ ★`#1933`（A 轨·全面化）加的两面（出处＝`sgstory#1933` 票面两条 pending 臂 ＋ 领队 2026-10-03 裁）：
		 *   · **C4 呈现时序**：命令体经 `ctx.ports.render` 印的东西**入缓冲**，结算成形才按序出门；
		 *     被拒／普通异常 ⇒ **丢弃**（屏上不得留半截）—— `step()` 里场景重渲仍走**已提交事实**（✗ 草稿）。
		 *   · **C3 随机消耗**：命令期经 `ctx.rng` 的抽取**计数**进读数 `rngDraws`。
		 *     ★**契约**＝拒绝**不回退**随机流（通用回退不存在）；本读数是调用方判「重放是否等价」的依据
		 *     （批 D 落 doc-3 §4 的 `rngAfter`（后态）时**换**该字段，✗ 并存）。
		 *  @returns `{ settled: 'applied'|'rejected', reason?, rolledBack, changed, rngDraws }`
		 *   `changed` ＝ **真正并入**事实块的**顶层键**（rejected ⇒ `[]`）；`reason` ＝ 拒绝码（供判据分辨成因）；
		 *   `rngDraws` ＝ 本次命令消耗的随机抽取次数（`when` 不适用那条路读数为 `0`）。
		 */
		#执行命令(act) {
			const 草稿 = {};
			const 键 = [];
			const 计 = { n: 0 };                        // ★C3：本次命令的随机消耗
			const 写 = (patch) => {
				if (patch == null || typeof patch !== 'object') throw new Error('ctx.commit 需要对象补丁');
				const 份 = 快照(patch);
				Object.assign(草稿, 份);
				for (const k of Object.keys(份)) if (!键.includes(k)) 键.push(k);
				return 快照({ ...this._facts, ...草稿 });
			};
			const 命令ctx = Object.freeze({
				...this.ctx,
				facts: () => 快照({ ...this._facts, ...草稿 }),
				commit: 写,
				rng: 计消耗视图(this.rng, () => this._计),   // ★C3：命令期只看得到**计数视图**（同一流、同一 this；归属按发生时刻）
			});
			this._计 = 计;                                // ★C3：开槽（命令期任何经视图的抽取都记到本条上）
			this.ports.render.起缓冲();                   // ★C4：命令体的呈现先入缓冲（✗ 出门）
			/* ★`#1967`：**对象态前像**（深拷贝；✗ 递引用 —— 那会让"前像"变成后门）。 */
			const 对象前像 = this._objects().map((o) => [o, 快照(o)]);
			/* 回滚：把每个对象**整块恢复**到前像（含**删掉**命令期新加的键 —— 「零残留」按字面做 ✓）。 */
			const 回滚对象 = () => {
				for (const [o, 前] of 对象前像) {
					if (!o || typeof o !== 'object') continue;
					/* ★数组要**先回长度**：删键只清得掉元素，`length` 还留着 ⇒ 会剩一个空槽（✗ 半态）。 */
					if (Array.isArray(o) && Array.isArray(前) && o.length !== 前.length) o.length = 前.length;
					for (const k of Object.keys(o)) if (!(k in 前)) delete o[k];
					Object.assign(o, 快照(前));
				}
			};
			let settled = 'applied', reason = null;
			try {
				if (act.run(命令ctx) === false) { settled = 'rejected'; reason = 'action-refused'; }
			} catch (e) {
				if (typeof e?.code === 'string' && e.code !== '') { settled = 'rejected'; reason = e.code; }
				else { 回滚对象(); this.ports.render.丢弃(); this._计 = null; throw e; }   // ★普通异常：**回滚对象态** ＋ 丢草稿 ＋ **丢弃半截呈现**，再上抛
			}
			if (settled !== 'applied') {
				回滚对象();                                 // ★`#1967`：被拒 ⇒ 命令体改过的对象态**回到前像**（零残留）
				this.ports.render.丢弃();                  // ★C4：被拒 ⇒ 命令体印过的**一个字都不出门**
				this._计 = null;
				return { settled, reason, rolledBack: true, changed: [], rngDraws: 计.n };
			}
			Object.assign(this._facts, 草稿);              // ★一次结算（✗ 逐项写）
			this.ports.render.放行();                      // ★C4：结算成形 ⇒ 缓冲按序出门（在场景重渲之前）
			this._计 = null;
			return { settled, rolledBack: false, changed: 键, rngDraws: 计.n };
		}

		/** 单步：消费**一条**输入 ⇒ 跑其动作（**命令**：草稿 ⇒ 原子结算，见 `#执行命令`）⇒ 呈现一次。
		 *  队列空 ⇒ 不推进（读数里说明）。★读数：交付 1 的 `{stepped, action}` 是**子集** ⇒ 既有判据不破。 */
		step() {
			if (!this._scene) return { stepped: false, reason: 'no-scene' };
			const 条 = this._input.next();
			if (条 == null) return { stepped: false, reason: 'input-empty' };
			const id = String(条.id ?? 条);
			const act = (this._scene.actions ?? []).find((a) => a.id === id && (a.when ? a.when(this.ctx) : true));
			if (!act) {
				/* 动作**不适用**（`when` 为假／没这条）⇒ **不结算**（`settled: null`）—— 判据据此把
				 * 「命令不适用」与「命令被拒」（`settled:'rejected'`）分开（✗ 两者同形）。 */
				this._scene.render?.(this.ctx);
				this._steps += 1;
				return { stepped: true, action: null, settled: null, reason: 'when-false', rolledBack: false, changed: [], rngDraws: 0 };
			}
			const 解 = this.#执行命令(act);
			this._events.emit('action', { id, session: this.id, settled: 解.settled, ...(解.reason ? { reason: 解.reason } : {}) });
			this._scene.render?.(this.ctx);
			this._steps += 1;
			return { stepped: true, action: id, ...解 };
		}

		/** 循环 step 到「输入队列空」或撞上限 ⇒ **读数里带停下原因**（✗ 死循环与跑完同形）。 */
		run({ maxSteps = 50 } = {}) {
			if (!this._scene) return { steps: 0, stopped: 'no-scene' };
			let n = 0;
			while (n < maxSteps) {
				if (this._input.pending() === 0) return { steps: n, stopped: 'input-empty' };
				this.step();
				n += 1;
			}
			return { steps: n, stopped: 'max-steps' };
		}

		/** 读数：本会话累计步数（诊断量，判据用它证「另一会话没被推进」）。 */
		steps() { return this._steps; }
	};
})();
