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
		return {
			output(text, opts) {
				if (收) { 收({ kind: 'output', text: String(text), ...(opts ?? {}) }); return; }
				全局.output(text, opts);
			},
			render(node) {
				if (收) { 收({ kind: 'render', node }); return; }
				全局.render(node);
			},
			setCollector(fn) {
				if (fn != null && typeof fn !== 'function') throw new Error('RenderPort.setCollector 需要函数或 null');
				收 = fn ?? null;
			},
		};
	};

	RPG.GameSession = class GameSession {
		/**
		 * @param id    会话 id（读数用；✗ 参与判活 —— 判活走 `epoch`）
		 * @param ports 三端口的**这一份**（缺省取全局注册的那些）
		 * @param rng   **该会话的随机源实例**（必给：✗ 回落全局 `RPG.rng`，那会让两会话共享随机流）
		 */
		constructor({ id = 'session', ports = null, rng = null, facts = {} } = {}) {
			if (!rng) throw new Error('GameSession 需要**自己的** rng 实例（✗ 回落全局 RPG.rng）');
			this.id = String(id);
			this._facts = 快照(facts);
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

		/** 单步：消费**一条**输入 ⇒ 跑其动作 ⇒ 呈现一次。队列空 ⇒ 不推进（读数里说明）。 */
		step() {
			if (!this._scene) return { stepped: false, reason: 'no-scene' };
			const 条 = this._input.next();
			if (条 == null) return { stepped: false, reason: 'input-empty' };
			const id = String(条.id ?? 条);
			const act = (this._scene.actions ?? []).find((a) => a.id === id && (a.when ? a.when(this.ctx) : true));
			if (act) { act.run(this.ctx); this._events.emit('action', { id, session: this.id }); }
			this._scene.render?.(this.ctx);
			this._steps += 1;
			return { stepped: true, action: act ? id : null };
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
