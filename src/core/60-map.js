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

/** ★**单点**读取 `State.variables`（无 `State` 环境 ⇒ `null`）。
 *  触点门（`#1804`）按**出现次数**防加深 ⇒ 三处各自直接读会被记为 3 处；此处收成 1 处（本笔顺手**降低**：原为 2）。
 *  ⚠ 必须区分「无 `State`」与「`State` 有但变量为空」：前者**不得**当成空表用（覆盖会抹掉存档）。 */
const stateVars = () => (typeof State === 'undefined' || State == null ? null : (State.variables ?? null));

RPG.WorldMap = class WorldMap extends Object {
	constructor({ id = 'world' } = {}) {
		super();
		this.id = id;
		this.locations = new Map();      // id → Location
		this.exits = [];                 // Exit[]（有向边）
		this._current = null;            // 当前位置 id（**后备**：State 里有值时以 State 为准，见 `current`）
		/* ★`#1859`（P0）：`current` 是**访问器**（State 为准）—— 实例在堆上，读档只替换 `State.variables`
		 *   ⇒ 若读的是字段，读档后它**仍是旧位置**（操作者实测「存 L2 → 推进 L4 → 读 ⇒ 仍停 L4」）。
		 *   `#1760` §四 的判据原文即「`State.variables.mapCurrent` 与 `map.current` **始终一致**」
		 *   ＋「往返后**可从 State 恢复**（不依赖实例）」—— 原实现只在**构造时**恢复 ⇒ 该判据被违约。
		 *   ⇒ 定形：**读**以 State 为准（无 State 环境回落后备字段）；**写**经 setter 同步（写点仍是单点）。
		 *   设计稿原文（`:60`「读点＝`current` getter」）**本就如此要求**，本笔是把实现对齐到它。 */
		/* ★ #1760（设计稿 §四）：「current 在堆上 ⇒ 读档即错位」的最小修——
		 *   实例字段落一份到 `State.variables.mapCurrent`（**纯字符串 id**，零改语义）。
		 *   写点单点＝下面 `moveTo`（含构造后的首次进入）；读点＝`current` getter。
		 *   本笔**只搬这一项**：`locations`／`exits`（图结构）**按设计不进档**——
		 *   它们由构建路径（包内 `buildSpan*Hub` ＋ 故事侧 `world/babel*.js`）**确定性重放**，故属**代码面**。
		 *   判据与**重议触发条件**见 `80-save.js`「进档判据」（裁见 #1829）。 */
		this._restoreFromState();
	}

	/** 当前位置 id（**State 为准**；无 `State` 的环境回落后备字段）。
	 *  ★为何是访问器：见构造器注释（`#1859` —— 读档替换的是 `State.variables`，实例字段会陈旧）。
	 *  ⚠ `State` 里有值即以它为准（✗ 用 `??` 合并：空串等假值不应把位置判丢，故只认**字符串**）。 */
	get current() {
		const vars = stateVars();
		const saved = vars == null ? undefined : vars[this._stateKey()];
		return typeof saved === 'string' ? saved : this._current;
	}

	/** 写：只更新**后备字段**（✗ 不在此同步 `State`）。
	 *  ★写点仍是**单点** `moveTo`（`#1760` §四：`moveTo` 内 `_syncToState()`）——
	 *    直接赋值（构造期摆位、测试夹具）**不得**写档：那是「写点单点」这条设计不变式的边界
	 *    （既有格 `mapCurrent：moveTo 单点同步` 明钉「构造不写」，本席首版在此同步 State ⇒ 该格当场红）。
	 *
	 *  ★`#1864` 折（dev-9 NIT）：**直接赋值不写档** —— `map.current = 'L3'` 只改后备字段，
	 *    State **静默不动**（看似生效、实则读档即回旧值）。⇒ 唯一写点是 `moveTo`（调 `_syncToState()` —— 全档**仅此一处**）。
	 *    ✗ 不要在此加同步：那会破「写点单点」不变式（上条格当场红）。 */
	set current(locId) {
		this._current = locId;
	}

	/** 存档键：世界地图（`id==='world'`，缺省）用 `mapCurrent`；具名地图用 `mapCurrent_<id>`。
	 *  本笔落**单地图**键（设计稿 §四）：多地图并存时各占一键 ⇒ 各图 `current` 互不覆盖。
	 *  ★**图结构**（`locations`／`exits`）一律**按设计不进档**（属代码面，同一条裁定，✗ 按地图分别裁；
	 *    判据／重议触发见 `80-save.js`「进档判据」；裁见 #1829）。 */
	_stateKey() {
		return !this.id || this.id === 'world' ? 'mapCurrent' : `mapCurrent_${this.id}`;
	}

	/** 从存档恢复当前位置（实例字段在堆上 ⇒ 读档后回到初始值，故以 State 为准）。
	 *  静默策略：State 里没有该键（首次运行／旧档／非存档环境）⇒ 保持原值，不抛错。 */
	_restoreFromState() {
		/* ★`#1864` 折（dev-9 MINOR）：「收成**单点**」只收了一半 —— 本处仍直读 `State.variables`
		 *   ⇒ 触点门按**出现次数**计，漏掉这一处 「计数下降」就是**假的**（读数 2 而非 1）。
		 *   ⇒ 与 `get current`／`_syncToState` 同走 `stateVars()`（本档唯一的 `State` 直读点）。 */
		const vars = stateVars();
		const saved = vars == null ? undefined : vars[this._stateKey()];
		if (typeof saved === 'string') this._current = saved;   // ★只是**后备**缓存；权威仍是 State（见 `current` 访问器）
		return this.current;
	}

	/** 把当前位置写回 State（**唯一写点**：`moveTo` 内调用 ⇒ 与 `current` 恒一致）。 */
	_syncToState() {
		const vars = stateVars();
		if (vars == null) return;
		/* ⚠ 写**后备字段**（✗ `this.current` —— 那是**访问器**，会读到 State 的旧值再写回 ⇒ 位置永不推进；
		 *   本席首版即栽在此，单测 11 红当场抓到）。 */
		vars[this._stateKey()] = this._current;
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
	/* ★`#1855`（P2-3 探索视图·替换式 甲案）：场景头只在进场时印一次 ⇒ 本字段记录上次印过的地点。 */
	#headerLoc = null;

	/* 段落是否已在本次选择期间被导航走（`#1749` D2）。任一读数缺失 ⇒ 不判定（`false`）。 */
	#leftPassage() {
		const now = State?.passage ?? null;
		return this.#passageAtRender != null && now != null && now !== this.#passageAtRender;
	}

	async #renderLocation() {
		this.#passageAtRender = State?.passage ?? null;
		/* ★`#1859`（台账 P1-1／P1-2「刷新族」）：**就地重绘后刷新状态栏面板**。
		 *   面板的填充点是 `:passagedisplay`（故事侧 `ui/panels.js`）——而本场景**自环重绘不导航**
		 *   ⇒ 地图整段期间面板**一次都不刷新** ⇒ 实测：位置面板恒显第 1 层，即便已走到 L2／L4；
		 *   采集/装备后的「背包」面板同理（P1-1）。
		 *   ⇒ 在**每次画完一屏**的地方统一补一次刷新（✗ 让每个 action 各自记得调）。
		 *   ⚠ 能力探测（无呈现层／未加载面板域 ⇒ 静默跳过）：与 `refreshPanels` 的无宿主语义一致。 */
		RPG.refreshPanels?.();
		const { desc, exits } = this.map.render();
		const loc = this.map.locations.get(this.map.current);

		/* ★`#1855`（P2-3 探索视图·替换式）：**场景头只在进场时印一次**。
		 *   此前无条件印 ⇒ 而动作是**自环重绘**（见下方注释） ⇒ 同层重复动作 ⇒ 【层名】＋desc **整段堆叠**（复测 3 次实测）。
		 *   判据：同层重复动作後【层名】出现次数 **恒 1**；离层再回 ⇒ 再印一次（各自正确）。
		 *   ⚠ 乙案（固定不滚的场景头 DOM）属 **0.0.2+**（探索页结构） ⇒ 本笔 ✗ 做。 */
		if (this.map.current !== this.#headerLoc) {
			this.perform(`【${loc.name}】`);
			if (desc) this.perform(desc);
			this.#headerLoc = this.map.current;
		}

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
			/* ★`#1855` 折单（`developer-10` RC）：**动作已导航离开**（战斗／结局等独立段落）⇒ 清场景头记录，
			 *   使**下次进场**（战斗出口 `Engine.play('探索')`）重印场景头 —— ✗ 否则「**战斗回来场景头消失**」：
			 *   场景单例 ＋ 回来时**段落名与上次渲染相同**（都是 `探索`）⇒ `#leftPassage()` 判定失灵 ✗ ⇒ 只能靠**这条显式清**。
			 *   可达面：胜／僵持／早退三分支（死亡不中 —— respawn 走 `moveTo` ⇒ 地点变 ⇒ 本就会印 ✓）。 */
			else this.#headerLoc = null;
		} else {
			// 出口导航：action → moveTo → 重绘新位置
			const exit = exits[Number(picked.slice(1))];
			if (exit.action) exit.action();
			this.map.moveTo(exit.to);
			await this.#renderLocation();
		}
	}
};
