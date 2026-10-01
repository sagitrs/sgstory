/* RPG 核心 —— 世界地图（有向图）与移动
 *
 * 设计原则：地图 = 数据（可校验的有向图），移动 = 行为（Event），
 * 呈现 = 视图（Scene/段落）。三者解耦：
 *   - Location 定义"这是什么地方"（描述文本、进入/离开钩子）
 *   - Exit 定义"从这里能去哪里"（链接文本、条件、副作用）
 *   - WorldMap 把它们组成一张图，提供校验与导航
 *
 * 校验在构建时执行（build-and-check），不是运行时才发现悬空链接。
 */

/* ---------- Location：图节点 ---------- */

RPG.Location = class Location extends Object {
	constructor({ id, name = id, desc = '', onEnter = null, onExit = null, actions = [] } = {}) {
		super();
		if (!id) throw new Error('Location 定义缺少 id');
		this.id = id;
		this.name = name;
		this.desc = desc;               // 场景描述（纯文本或函数）
		this.onEnter = onEnter;          // 进入副作用 (loc) => void
		this.onExit = onExit;            // 离开副作用 (loc) => void
		this.actions = actions;          // 此位置可做的事：[{text, when?, action?}]
	}

	/** 当前可用的交互（when 过滤后） */
	get availableActions() {
		return this.actions.filter((a) => !a.when || a.when());
	}
};

/* ---------- Exit：有向边 ---------- */

RPG.Exit = class Exit extends Object {
	constructor({ from, to, text, when = null, action = null } = {}) {
		super();
		if (!from || !to) throw new Error(`Exit 定义缺少 from/to（${from} → ${to}）`);
		if (typeof text !== 'string' && typeof text !== 'function') {
			throw new Error(`Exit ${from} → ${to} 缺少链接文本（text 需为字符串或返回字符串的函数）`);
		}
		this.from = from;
		this.to = to;
		this.text = text;               // 链接显示（字符串或 () => string）
		this.when = when;               // 条件 () => bool（false 隐藏）
		this.action = action;           // 移动副作用 () => void
	}
};

/* ---------- WorldMap：有向图 ---------- */

RPG.WorldMap = class WorldMap extends Object {
	constructor({ id = 'world' } = {}) {
		super();
		this.id = id;
		this.locations = new Map();      // id → Location
		this.exits = [];                 // Exit[]（有向边）
		this.current = null;             // 当前位置 id
		/* ★ #1760（设计稿 §四）：「current 在堆上 ⇒ 读档即错位」的最小修——
		 *   实例字段落一份到 `State.variables.mapCurrent`（**纯字符串 id**，零改语义）。
		 *   写点单点＝下面 `moveTo`（含构造后的首次进入）；读点＝`current` getter。
		 *   本笔**只搬这一项**：`locations`／`exits`（图结构）**永不进档**——
		 *   它们由包内构建函数（`buildSpan*Hub`）**确定性重建**，故属**代码面**（裁见 #1829）。 */
		this._restoreFromState();
	}

	/** 存档键：世界地图（`id==='world'`，缺省）用 `mapCurrent`；具名地图用 `mapCurrent_<id>`。
	 *  本笔落**单地图**键（设计稿 §四）：多地图并存时各占一键 ⇒ 各图 `current` 互不覆盖。
	 *  ★**图结构**（`locations`／`exits`）一律不进档（属代码面，同一条裁定，✗ 按地图分别裁；裁见 #1829）。 */
	_stateKey() {
		return !this.id || this.id === 'world' ? 'mapCurrent' : `mapCurrent_${this.id}`;
	}

	/** 从存档恢复当前位置（实例字段在堆上 ⇒ 读档后回到初始值，故以 State 为准）。
	 *  静默策略：State 里没有该键（首次运行／旧档／非存档环境）⇒ 保持原值，不抛错。 */
	_restoreFromState() {
		const vars = typeof State === 'undefined' || State == null ? null : State.variables;
		const saved = vars == null ? undefined : vars[this._stateKey()];
		if (typeof saved === 'string' && this.current == null) this.current = saved;
		return this.current;
	}

	/** 把当前位置写回 State（**唯一写点**：`moveTo` 内调用 ⇒ 与 `current` 恒一致）。 */
	_syncToState() {
		const vars = typeof State === 'undefined' || State == null ? null : State.variables;
		if (vars == null) return;
		vars[this._stateKey()] = this.current;
	}

	/** 添加节点（重复 id 抛错） */
	addLocation(loc) {
		if (!(loc instanceof RPG.Location)) throw new Error('addLocation 需要 Location 实例');
		if (this.locations.has(loc.id)) {
			throw new Error(`地点「${loc.id}」已存在（无重复点）`);
		}
		this.locations.set(loc.id, loc);
		return loc;
	}

	/** 添加有向边（两端节点必须已存在） */
	addExit(exit) {
		if (!(exit instanceof RPG.Exit)) throw new Error('addExit 需要 Exit 实例');
		for (const end of [exit.from, exit.to]) {
			if (!this.locations.has(end)) {
				throw new Error(`Exit ${exit.from} → ${exit.to} 引用了不存在的地点「${end}」（悬空边）`);
			}
		}
		this.exits.push(exit);
		return exit;
	}

	/** 便捷批量定义：addPath({ from, to, text, when?, action? }) */
	addPath(def) { return this.addExit(new RPG.Exit(def)); }

	/** 当前位置的可用出口（when 过滤后） */
	exitsFrom(locId = this.current) {
		return this.exits.filter((e) => e.from === locId && (!e.when || e.when()));
	}

	/** 进入指定地点：onExit → 移动副作用 → onEnter → 导航 */
	moveTo(locId) {
		const target = this.locations.get(locId);
		if (!target) throw new Error(`moveTo: 不存在的地点「${locId}」`);

		// 离开当前位置
		if (this.current && this.current !== locId) {
			const from = this.locations.get(this.current);
			if (from && from.onExit) from.onExit(from);
		}

		this.current = locId;
		this._syncToState();             // ★ 单点写：实例字段与 State 同步（#1760 §四）

		// 进入新位置
		if (target.onEnter) target.onEnter(target);
		return target;
	}

	/** 渲染当前位置：描述 + 可用出口（供 Scene/passage 调用） */
	render(locId = this.current) {
		const loc = this.locations.get(locId);
		if (!loc) throw new Error(`render: 不存在的地点「${locId}」`);
		const desc = typeof loc.desc === 'function' ? loc.desc() : loc.desc;
		const exits = this.exitsFrom(locId);
		return { location: loc, desc, exits };
	}

	/**
	 * 图校验（构建时调用）：返回问题列表，空数组 = 无问题。
	 * 检查项：孤立点（无出也无入）、悬空边（addTo 已拦截，此处兜底）。
	 */
	validate() {
		const problems = [];
		const hasOut = new Set(this.exits.map((e) => e.from));
		const hasIn = new Set(this.exits.map((e) => e.to));

		for (const [id] of this.locations) {
			if (!hasOut.has(id) && !hasIn.has(id)) {
				problems.push(`孤立点：「${id}」既无出口也无入口`);
			}
		}
		for (const e of this.exits) {
			if (!this.locations.has(e.from)) problems.push(`悬空边：${e.from} → ${e.to}（from 不存在）`);
			if (!this.locations.has(e.to)) problems.push(`悬空边：${e.from} → ${e.to}（to 不存在）`);
		}
		return problems;
	}

	/** 从起点可达的所有节点（BFS） */
	reachableFrom(startId) {
		const visited = new Set([startId]);
		const queue = [startId];
		while (queue.length > 0) {
			const cur = queue.shift();
			for (const e of this.exits) {
				if (e.from === cur && !visited.has(e.to)) {
					visited.add(e.to);
					queue.push(e.to);
				}
			}
		}
		return visited;
	}

	/** 校验连通性：从起点是否可达所有节点 */
	validateConnectivity(startId) {
		const reachable = this.reachableFrom(startId);
		const unreachable = [...this.locations.keys()].filter((id) => !reachable.has(id));
		return unreachable.map((id) => `不可达：「${id}」从「${startId}」无法到达`);
	}
};

/* ---------- MapScene：把地图渲染成可选的场景 ---------- */

/**
 * MapScene = Scene + WorldMap：
 *   用 choice 渲染当前位置的描述与出口选项，
 *   玩家选择出口后执行 Exit.action → MapScene.moveTo → 自循环重绘。
 *
 * 用法：
 *   const map = new RPG.WorldMap({ id: 'old-house' });
 *   map.addLocation(new RPG.Location({ id: 'hall', desc: '门厅' }));
 *   map.addPath({ from: 'hall', to: 'kitchen', text: '去厨房' });
 *   RPG.registerScene(new RPG.MapScene({ id: 'map', map, start: 'hall' }));
 */
RPG.MapScene = class MapScene extends RPG.Scene {
	constructor({ id, title, map, start, chain = false } = {}) {
		super({ id, title, text: '', choices: [], chain });
		if (!(map instanceof RPG.WorldMap)) throw new Error('MapScene 需要 WorldMap 实例');
		if (!map.locations.has(start)) throw new Error(`MapScene 起点「${start}」不在地图上`);
		this.map = map;
		this.startId = start;
	}

	async execute() {
		if (!this.map.current) this.map.moveTo(this.startId);
		await this.#renderLocation();
	}

	/* 本次重绘所属的段落（`#1749` D2 段落边界检测用）：进入 `#renderLocation` 时记下
	 * 「这一屏画在哪个段落」；玩家选项的 action 返回后若段落已变，说明 action 内做了
	 * 导航（`Engine.play` 到战斗／结局等独立段落）——此时旧地图这一屏已随段落退场，
	 * 不得再把地图与选项画进新段落。判据取 `State.passage`（引擎真实接口：`enginePlay`
	 * 内同步 `State.create` 更新）；取不到时以 `null` 表示「不判定」，退回旧行为。 */
	#passageAtRender = null;

	/* 段落是否已在本次选择期间被导航走（`#1749` D2）。任一读数缺失 ⇒ 不判定（`false`）。 */
	#leftPassage() {
		const now = State?.passage ?? null;
		return this.#passageAtRender != null && now != null && now !== this.#passageAtRender;
	}

	async #renderLocation() {
		this.#passageAtRender = State?.passage ?? null;
		const { desc, exits } = this.map.render();
		const loc = this.map.locations.get(this.map.current);

		this.perform(`【${loc.name}】`);
		if (desc) this.perform(desc);

		// 交互选项（此位置可做的事，自循环重绘）
		const actions = loc.availableActions;
		// 出口选项（去别的地方）
		if (actions.length === 0 && exits.length === 0) {
			this.perform('没有可以做的事，也没有可以去的方向。');
			return;
		}

		const options = [
			...actions.map((a, i) => ({
				text: typeof a.text === 'function' ? a.text() : a.text,
				value: `a${i}`,
			})),
			...exits.map((e, i) => ({
				text: typeof e.text === 'function' ? e.text() : e.text,
				value: `e${i}`,
			})),
		];
		const picked = await this.choice(options);

		if (picked.startsWith('a')) {
			// 位置交互：执行 action → 自循环重绘（状态变化后选项自动更新）
			const act = actions[Number(picked.slice(1))];
			if (act.action) act.action();
			// 段落边界检测（#1749 D2）：action 若导航去了别的段落，本屏所属段落已退场，
			// 再重绘即为「跨段渲染」——把旧地图画进新段落。仅在同一段落内才自循环重绘。
			if (!this.#leftPassage()) await this.#renderLocation();
		} else {
			// 出口导航：action → moveTo → 重绘新位置
			const exit = exits[Number(picked.slice(1))];
			if (exit.action) exit.action();
			this.map.moveTo(exit.to);
			await this.#renderLocation();
		}
	}
};
