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

	async #renderLocation() {
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
			await this.#renderLocation();
		} else {
			// 出口导航：action → moveTo → 重绘新位置
			const exit = exits[Number(picked.slice(1))];
			if (exit.action) exit.action();
			this.map.moveTo(exit.to);
			await this.#renderLocation();
		}
	}
};
