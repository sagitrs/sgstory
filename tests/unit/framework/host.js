/* SugarCube 宿主仿真：单元测试层表达引擎与宿主接触面的可断言替身
 *
 * 为什么需要本文件：引擎与 SugarCube 有三个接触面——故事变量及其历史、
 * 段落导航、按段落归档的输出。此前的环境桩把这三点都做成无操作空壳
 * （`State = { variables: {} }`、`Engine.play` 空函数、jQuery no-op），
 * 于是「导航之后旧段落仍在输出」「读档往返后类实例退化为纯对象」这类
 * 接缝缺陷在单元测试层**无法表达**，只能靠整机浏览器运行才能发现。
 *
 * 本文件把这三个接缝做成可断言的仿真对象；`framework/shims.js` 负责把
 * `State` / `SugarCube.Engine` / `Save` 三个全局指向它，`framework/harness.js`
 * 在被测物加载完成后调用一次 `install()` 接住输出。两个测试入口
 * （`unit.html` 与 `headless.mjs`）都经由这两个文件，接线自然一致。
 *
 * 设计边界（刻意保持「仿真」而非「完整引擎」）：
 *   1. 只仿真被测点用到的语义，不追求覆盖 SugarCube 的完整 API；
 *   2. 不依赖第三方库（纯 JavaScript），也**不使用 jsdom**——单元测试层的
 *      宿主仿真与浏览器无关，整机冒烟另见 `tests/e2e/`；
 *   3. 状态按文件共享，清场走 `reset()` 而非重建对象（逐用例重建会让单测
 *      时长随用例数线性增长，与门禁时长预算相抵）；
 *   4. 时间面（`State.moments` 的历史）**不实现**：全仓对 `State.moment*`
 *      的引用数为零，按「无消费点即不建面」留空。
 *
 * 本文件以 IIFE 形态加载（与 `src/**` 的包一致），只往 `window.__host` 上挂
 * 一个对象，不声明全局 `const`/`let`——避免与同页其他脚本的同名声明相撞。
 */
(function (root) {
	'use strict';

	/* ---------- 输出面：按段落归档 ---------- */

	/* 输出归档的形态：每个段落一个输出块 `{ passage, navigated, open, lines }`。
	 * 段落标识取导航动作给出的名字——本仿真不认识故事段落的内容，认识的是
	 * 「第几次导航」，这已足够表达「旧段落的输出是否失效」。
	 *
	 * 捕获点：`Object.prototype.perform`（引擎里一切消息的唯一出口，见
	 * `src/core/01-perform.js`）。捕获发生在**调用时**而非 DOM 落地时——
	 * 单元测试层不渲染 DOM，故按「逻辑输出顺序」归档；真实的 DOM 落地时机
	 * 由整机冒烟覆盖。 */
	const host = {
		/** 段落输出归档（阅读顺序即数组序） */
		outputs: [],
		/** 当前输出应落入的段落标识；初始表示「尚未进入任何命名段落」 */
		currentPassage: '(无段落)',

		/** 取段落输出块：名字省略时取当前段落的「后行」块，无则 null */
		blockOf(passage) {
			if (passage !== undefined) {
				for (let i = this.outputs.length - 1; i >= 0; i--) {
					if (this.outputs[i].passage === passage) return this.outputs[i];
				}
				return null;
			}
			const last = this.outputs[this.outputs.length - 1];
			if (!last) return null;
			/* 该块已关闭（如刚导航完）⇒ 当前段落的输出尚未开始，返回空视图 */
			return last.open === false ? null : last;
		},

		/** 当前段落的全部输出行（未进入命名段落时为空数组） */
		lines(passage) {
			const block = this.blockOf(passage);
			return block ? block.lines.slice() : [];
		},

		/** 全部段落输出块（阅读顺序，浅拷贝） */
		blocks() {
			return this.outputs.slice();
		},

		/** 已导航到的段落名序列（按导航次序，可重复） */
		passages() {
			return this.outputs.filter((b) => b.navigated).map((b) => b.passage);
		},

		/** 末次导航的段落名；从未导航过则返回 null */
		lastPassage() {
			const list = this.passages();
			return list.length ? list[list.length - 1] : null;
		},

		/** 记录一行输出（`perform` 经此写入；只进当前打开的块） */
		append(text) {
			const last = this.outputs[this.outputs.length - 1];
			if (!last || last.open === false) {
				this.outputs.push({
					passage: this.currentPassage,
					navigated: false,
					open: true,
					lines: [text],
				});
			} else {
				last.lines.push(text);
			}
			return text;
		},

		/** 清场：清空输出与当前位置 */
		reset() {
			this.outputs = [];
			this.currentPassage = '(无段落)';
			return this;
		},
	};

	/* ---------- 故事变量面：State.variables ＋ 导航即克隆 ---------- */

	/* `State.variables` 是**故事变量**（进存档）。SugarCube 在每次导航
	 * （`Engine.play`／历史回退）时经由 moment 机制定格一份快照。本仿真保留其
	 * 两个可观察后果：
	 *   1. 导航之后，此前从 `State.variables` 取得的引用**不再回写**故事变量——
	 *      写入旧引用的值进不了新段落，也进不了存档；
	 *   2. 快照是**深克隆**：快照里的对象与故事变量不共享引用。
	 * 这两点正是「导航后仍在改旧变量」类缺陷的判据。 */

	let variables = {};
	const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

	const state = {
		/** 故事变量的当前值（读 = 拿引用；写须经 set/adopt 才成新绑定） */
		variables,

		/** 定格一份深克隆快照（等价于「导航时定格当前状态」） */
		snapshot() {
			return clone(variables);
		},

		/** 以快照**替换**故事变量的绑定（导航即克隆的落点；此后旧引用是孤儿） */
		adopt(snapshot) {
			variables = clone(snapshot) ?? {};
			state.variables = variables;
			return variables;
		},

		/** 整体替换故事变量（用例铺设前置状态用） */
		set(next) {
			variables = next ?? {};
			state.variables = variables;
			return variables;
		},

		/** 清场：故事变量回到空对象 */
		reset() {
			return state.set({});
		},
	};

	/* ---------- 导航面：Engine.play ---------- */

	/* 导航语义（与 SugarCube 可观察行为对齐的部分）：
	 *   1. 记录本次导航的目标段落名；
	 *   2. 把上一个输出块**关闭**（`open = false`）——旧段落的后续输出不再
	 *      追加到它，也不会出现在新段落里；
	 *   3. 故事变量按「导航即克隆」定格；
	 *   4. 通知导航钩子，供用例或故事侧接线观察段落边界。 */
	const navigateHooks = [];

	const engine = {
		/** 已发生的导航记录：`[{ passage, at }]`（at = 序号，便于断言次序） */
		navigations: [],

		/** 注册导航钩子（返回退订函数） */
		onNavigate(fn) {
			if (typeof fn !== 'function') {
				throw new Error(`Engine.onNavigate 需要函数，收到：${typeof fn}`);
			}
			navigateHooks.push(fn);
			return () => {
				const i = navigateHooks.indexOf(fn);
				if (i >= 0) navigateHooks.splice(i, 1);
			};
		},

		/** 导航到段落：关闭旧块 → 记录 → 定格故事变量 → 通知钩子 */
		play(passage) {
			if (typeof passage !== 'string' || passage === '') {
				throw new Error(`Engine.play 需要非空的段落名，收到：${String(passage)}`);
			}
			const prev = host.outputs[host.outputs.length - 1];
			if (prev && prev.open !== false) prev.open = false;

			host.currentPassage = passage;
			const at = engine.navigations.length;
			engine.navigations.push({ passage, at });
			host.outputs.push({ passage, navigated: true, open: true, lines: [] });

			/* 导航即克隆：新段落读到的是新快照，旧引用成为孤儿 */
			state.adopt(variables);
			for (const fn of navigateHooks.slice()) fn(passage, at);
			return passage;
		},

		/** 清场：清空导航记录与输出（不触碰故事变量） */
		reset() {
			host.reset();
			engine.navigations = [];
			return engine;
		},
	};

	/* ---------- 存档面：Save 与「原型退化」语义 ---------- */

	/* SugarCube 的存档 = 故事变量的 JSON 序列化。**关键语义**：读档后的对象是
	 * **纯对象**（原型为 `Object.prototype`），类实例的方法与原型链不复存在——
	 * 一切依赖 `instanceof` 或原型方法的代码在读档后失效。`roundtrip()` 即返回
	 * JSON 往返后的新对象，供用例断言该退化。 */
	/** 处理器集合（形如 SugarCube 的 `Save.onSave`：`add` / `delete` / `clear` / `size`） */
	const makeHandlers = () => {
		const set = new Set();
		return {
			add(fn) {
				if (typeof fn !== 'function') {
					throw new TypeError(`处理器须是函数，收到：${typeof fn}`);
				}
				set.add(fn);
				return set;
			},
			delete: (fn) => set.delete(fn),
			clear: () => set.clear(),
			/** 触发全部处理器（快照副本 ⇒ 处理器内增删不影响本次遍历） */
			fire: (...args) => [...set].forEach((fn) => fn(...args)),
			get size() { return set.size; },
		};
	};

	const save = {
		/** 序列化（与存档同形：JSON 字符串） */
		serialize(value) {
			return JSON.stringify(value === undefined ? null : value);
		},

		/** 反序列化（不复活原型——与 SugarCube 读档一致） */
		deserialize(text) {
			const parsed = typeof text === 'string' ? JSON.parse(text) : text;
			return parsed == null ? {} : parsed;
		},

		/** 存读往返：读回的永远是纯对象 */
		roundtrip(value) {
			return save.deserialize(save.serialize(value));
		},

		/* ---------- 处理器面：`Save.onSave` / `Save.onLoad`（SugarCube 公开 API） ----------
		 * 引擎的存取流程把**处理器**插在两个位置：
		 *   · 存：先由 `State.marshalForSave()` 取 `save.state`，**再**跑 onSave 处理器
		 *     —— 处理器可就地**增补** `save`（如在 `save.state` 下挂版本信封）；
		 *   · 读：先跑 onLoad 处理器（**此时 `State` 尚未还原** —— 处理器正是用来**裁决**的），
		 *     通过后再 `State.unmarshalForSave(save.state)`。
		 * ⇒ 这层可断言性使「存档契约」（版本裁决、拒绝路径）能在单测里**真被驱动**：
		 *   注册一个会拒绝的处理器，`load()` 就必须炸出可读错误（✗ 静默坏档）。 */

		onSave: makeHandlers(),
		onLoad: makeHandlers(),

		/** 造一份存档对象：`state` 取故事变量的深克隆，**再**跑 onSave 处理器。
		 *  （对应引擎的存流程：`marshalForSave()` → `onSaveHandlers.forEach(...)`） */
		make(extra = {}) {
			const obj = { ...extra, state: save.roundtrip(variables) };
			save.onSave.fire(obj);
			return obj;
		},

		/** 载入一份存档对象：**先**跑 onLoad 处理器（裁决；此时故事变量**尚未**还原），
		 *  通过后再还原 `state`。（对应引擎的读流程；处理器抛错 ⇒ 载入中止 ⇒ 显式拒绝） */
		load(obj) {
			save.onLoad.fire(obj);
			state.adopt(obj == null ? {} : obj.state);
			return state.variables;
		},
	};

	/* ---------- 安装：接住 `perform` 的输出 ---------- */

	let installed = false;

	/**
	 * 把 `Object.prototype.perform` 的输出镜像进本仿真的归档。
	 * 须在**被测物加载之后**调用（该方法是引擎定义的）；重复调用无副作用。
	 * 原始行为完整保留——本函数只做观察，不改变输出语义。
	 */
	const install = () => {
		if (installed) return install;
		const desc = Object.getOwnPropertyDescriptor(Object.prototype, 'perform');
		if (!desc || typeof desc.value !== 'function') {
			throw new Error('宿主仿真接不上输出面：Object.prototype.perform 尚未定义（须在被测物加载后 install）');
		}
		const original = desc.value;
		Object.defineProperty(Object.prototype, 'perform', {
			...desc,
			value: function perform(text) {
				if (typeof text === 'string') host.append(text);
				return original.apply(this, arguments);
			},
		});
		installed = true;
		return install;
	};

	/** 清场全部仿真面（用例之间共享同一份宿主，由此统一复位）。
	 *
	 *  ★**不清 `save.onSave/onLoad` 处理器**：它们是**装载期订阅**（被测物加载时注册一次，
	 *  如存档契约的版本信封），按用例清掉会让此后所有用例静默失去该行为 ——
	 *  那是「测试互相污染」的另一种形态（表现为「第一个用例过了，后面全没信封」）。 */
	const reset = () => {
		host.reset();
		state.reset();
		engine.navigations = [];
		navigateHooks.length = 0;
		return root.__host;
	};

	/* `sgstory#1977` B8：宿主仿真补一个 **`Macro` 记录器**。引擎此前没有宏注册面（全 `src/` `Macro.add` 0 命中），
	 *   而 `src/host/sugarcube/40-pace.js` 在**装载期**就注册四个宏 ⇒ 仿真里没有 `Macro` 时会**静默跳过**
	 *   （那条路就永远测不到、判据①会变成假绿）。★位置必须在**本档顶层**：`install()` 的形是「被测物装载**后**接输出面」，
	 *   而宏注册发生在被测物**装载时** ⇒ 记录器必须早于它。 */
	root.Macro = root.Macro ?? {
		注册表: [],
		add(名, spec) { this.注册表.push({ 名, spec }); },
		_清() { this.注册表.length = 0; },
	};
	root.__host = { host, state, engine, save, install, reset,
		macro: () => root.Macro.注册表, get installed() { return installed; } };
})(typeof globalThis !== 'undefined' ? globalThis : window);
