/* 场景级断言框架（`#1806` 笔 2）：`loadFixture` / `dispatch` / `assertSave`
 *
 * ## 解决什么
 *   M1 的判据是「**值往返相等 ≠ 语义存活**」（E11 族）。要机械化它，需要能**毫秒级**
 *   铺设状态、派发一次动作、再**按行为**断言结果——而不是每次起一个浏览器。
 *   本文件即那三件：**铺场景** / **推一步** / **断言存档**。
 *
 * ## 与 `framework/host.js` 的分工
 *   `host.js` 提供**宿主接触面的仿真**（故事变量、导航、输出归档、存档往返）；
 *   本文件是**其上的场景层**（面向用例的动词）。⇒ 依赖方向单向：scenario → host。
 *   ★`loadFixture`/`dispatch` 走的是**真实路径**（`Save.onLoad` 处理器、`RPG.act`），
 *   不是「塞完变量直接断言」——否则场景测不出契约类缺陷（裁决、拒绝、归属）。
 *
 * ## 断言口径（票面边界 2）
 *   `assertSave` 断言的是**存档面**（进档的那一份状态），✗ 内存里的临时对象。
 *   `dispatch` 的返回值另带 `status`（`applied`/`rejected`）⇒ **行为断言**可与**状态断言**并用：
 *   只断言状态会漏掉「返回值说失败但状态已改」（或反之）这类**双写不一致**。
 *
 * ## golden 快照
 *   `snapshot()` 给出**规范投影**（键序稳定、只含存档面）；`diff(a, b)` 给出**评审可读**的
 *   前后差（逐路径 `old → new`）。⇒ 用例既可 `assertSave(expect)`，也可 `console.log(diff)`。
 */
(function (root) {
	'use strict';

	if (!root.__host) throw new Error('framework/scenario.js 需要先加载 framework/host.js');
	if (!root.setup?.RPG) throw new Error('framework/scenario.js 须在被测物（dist/bundle.js）之后加载');

	const H = root.__host;
	const RPG = () => root.setup.RPG;

	/* ---------- 规范投影：只取「进档」的那一份，且键序稳定 ---------- */

	/** 稳定键序的深克隆（对象键排序；数组保持序——序是语义）。
	 *
	 * ★**循环引用须给可读错误**（自审发现）：`State.variables` 里若出现自引用对象，
	 *   朴素递归会以 `RangeError: Maximum call stack size exceeded` 收场 —— 栈溢出**不指出
	 *   是哪条路径**，无从定位。而循环引用本身就是**非法存档态**（`JSON.stringify` 同样会炸）
	 *   ⇒ 此处主动检出并**指名路径**，把「不可序列化」这一事实变成可诊断信息。 */
	const canonical = (value, _seen = new Set(), _path = '$') => {
		if (Array.isArray(value)) {
			if (_seen.has(value)) throw new Error(`存档面含**循环引用**：${_path}（不可序列化 ⇒ 该状态本身进不了档）`);
			_seen.add(value);
			const out = value.map((v, i) => canonical(v, _seen, `${_path}[${i}]`));
			_seen.delete(value);
			return out;
		}
		if (value === null || typeof value !== 'object') return value;
		if (_seen.has(value)) throw new Error(`存档面含**循环引用**：${_path}（不可序列化 ⇒ 该状态本身进不了档）`);
		_seen.add(value);
		const out = {};
		for (const k of Object.keys(value).sort()) out[k] = canonical(value[k], _seen, `${_path}.${k}`);
		_seen.delete(value);
		return out;
	};

	/** 不入档的键（易变/运行时态；工料单 `#1812` §二 口径 3：纯代码 def 与总线不进档） */
	const VOLATILE = new Set(['__unitResult', '__tests']);

	/** 当前**存档面**的规范投影（= 进档的那一份状态，读自 `State.variables`） */
	const snapshot = () => {
		const v = root.State?.variables ?? {};
		const out = {};
		for (const k of Object.keys(v)) {
			if (VOLATILE.has(k)) continue;
			out[k] = canonical(v[k]);
		}
		return out;
	};

	/** 投影的**规范串**（比较与 golden 都用它 —— 单一比较口径，✗ 各处自比）。
	 *  @param snap 省略时取当前存档面；给值则用该值（★须是**快照对象**，✗ 传 digest 自身）。 */
	const digest = (snap) => {
		/* ★显式拦截「传 digest 自身」这类误用（`#1820` D 席 NIT-5）：字符串会被静默算成
		 *   「引号串的 digest」⇒ 比较永不等且看不出原因。宁可当**类型错**斥回。 */
		if (typeof snap === 'string') {
			throw new TypeError('digest() 收到字符串 —— 它要的是**快照对象**（`snapshot()` 的返回值）；'
				+ '若要比较两个 digest，请直接比字符串本身。');
		}
		return JSON.stringify(canonical(snap === undefined ? snapshot() : snap));
	};

	/* ---------- 可读 diff（golden 快照的对外表达） ---------- */

	const typeOf = (x) => (x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x);

	/** 逐路径收集差异：`{path, before, after}`（✗ 只给「不相等」这种无信息结论） */
	const collectDiffs = (a, b, path, acc) => {
		if (typeOf(a) !== typeOf(b)) { acc.push({ path, before: a, after: b }); return acc; }
		if (Array.isArray(a)) {
			const n = Math.max(a.length, b.length);
			for (let i = 0; i < n; i++) collectDiffs(a[i], b[i], `${path}[${i}]`, acc);
			return acc;
		}
		if (a !== null && typeof a === 'object') {
			const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
			for (const k of keys) collectDiffs(a[k], b[k], path ? `${path}.${k}` : k, acc);
			return acc;
		}
		if (a !== b) acc.push({ path, before: a, after: b });
		return acc;
	};

	const show = (x) => (x === undefined ? '(缺席)' : JSON.stringify(x));

	/** 前后状态差的可读文本（评审/失败信息用；无差 ⇒ 空串） */
	const diff = (before, after) => collectDiffs(canonical(before), canonical(after), '', [])
		.map((d) => `${d.path}: ${show(d.before)} → ${show(d.after)}`)
		.join('\n');

	/* ---------- 三件：铺场景 / 推一步 / 断言存档 ---------- */

	/**
	 * 铺一个场景（**走真实读档路径**）。
	 * @param fixture ① `{state:{…}}`（存档对象形）② 裸状态对象 ③ 已注册的 fixture 名
	 * @returns 装入后的存档面投影
	 */
	const loadFixture = (fixture) => {
		const obj = typeof fixture === 'string'
			? (() => {
				const f = fixtures[fixture];
				if (f == null) throw new Error(`未注册的 fixture：「${fixture}」（已注册：${Object.keys(fixtures).join('、') || '（无）'}）`);
				return f;
			})()
			: fixture;
		if (obj == null || typeof obj !== 'object') {
			throw new Error(`loadFixture 需要存档对象/裸状态/已注册名，收到：${show(obj)}`);
		}
		/* 存档对象形（含 `state` 键）⇒ 走 host 的读流程（**含 onLoad 裁决**）；
		 * 裸状态 ⇒ 直接落变量（用例铺前置状态，✗ 无契约面） */
		if (Object.prototype.hasOwnProperty.call(obj, 'state')) H.save.load(obj);
		else H.state.set(H.save.roundtrip(obj));
		return snapshot();
	};

	/** 注册具名 fixture（供多处复用；✗ 各用例各写一份前置状态） */
	const fixtures = {};

	/**
	 * 推进一步（**走真实动作入口** `RPG.act`）。
	 * @param step `{item, action='use', target, actor}`（`item` 可为 id 串或实例）
	 * @returns `{ok, status, reason, before, after, delta, lines}`
	 */
	const dispatch = (step = {}) => {
		const actor = step.actor ?? RPG().playerActor();
		if (actor == null) throw new Error('dispatch：解析不出 actor（先 loadFixture 或注册玩家角色）');
		const before = snapshot();
		/* ★`#1877` N-2 修：切点用**行数**，✗ **块数**（`outputs.length`）。
		 *   病灶（本席实测暴露）：输出块**保持打开并累积**（`host.append` 只在块关闭时才新建块）
		 *   ⇒ 动作若把行追加进**已打开的块**，`slice(块数)` 会把本次行**一起切掉** ⇒ `lines` **恒空**。
		 *   触发条件＝「动作**之前**已有输出」——`#1877` N-2 给 `RPG.give` 加了一行「＋n 名」提示后
		 *   `scenarioWith` 里的 `give('coin')` 就会先建块 ⇒ 该档当场红（**假阴性**）。
		 *   ⚠ 这是**潜在**缺陷：此前凡「动作前有输出」的用例都会静默读到空 lines（✗ 是「没输出」）。 */
		const outStart = H.host.outputs.reduce((n, b) => n + b.lines.length, 0);
		let result;
		try {
			result = RPG().act(actor, step.item, step.target ?? actor, step.action ?? 'use');
		} catch (e) {
			result = { status: 'threw', error: e };
		}
		const after = snapshot();
		return {
			ok: result?.status === 'applied',
			status: result?.status,
			reason: result?.reason,
			error: result?.error,
			before,
			after,
			delta: diff(before, after),
			/* 本次动作产生的输出行（供断言「玩家看到了什么」，✗ 只信内部分支）。
			 * ⚠ 语义：含动作**引发的一切**输出 —— 若动作里导航了（`Engine.play`），
			 *   新段落的行**也在内**（它们同样是本次动作的结果）。要只看原段落，
			 *   请改用 `H.host.lines(<段落名>)`。 */
			lines: H.host.outputs.flatMap((b) => b.lines).slice(outStart),
		};
	};

	/**
	 * 断言当前**存档面**与期望一致（golden）；不一致 ⇒ 抛错并附**逐路径 diff**。
	 * @param expected 期望的存档面（可为**部分**：只比对给出的路径，`opts.partial` 默认 true）
	 */
	const assertSave = (expected, opts = {}) => {
		const now = snapshot();
		const partial = opts.partial !== false;
		if (!partial) {
			if (digest(now) !== digest(expected)) {
				throw new Error(`存档面不符（全量）：\n${diff(expected, now) || '(键序差异以外无差异?)'}`);
			}
			return now;
		}
		/* 部分比对：只走 expected 给出的路径 —— 仍用同一 canonical/diff 口径。
		 * ★`exp` 必须**逐层传入**（✗ 闭包捕获外层 `expected` —— 那会让递归永不收敛）。 */
		const pick = (obj, exp) => {
			if (exp === null || typeof exp !== 'object') return obj;
			if (Array.isArray(exp)) {
				return Array.isArray(obj) ? exp.map((e, i) => pick(obj[i], e)) : obj;
			}
			const out = {};
			for (const k of Object.keys(exp)) out[k] = pick(obj == null ? undefined : obj[k], exp[k]);
			return out;
		};
		const gotSubset = pick(now, expected);
		const want = canonical(expected);
		if (digest(gotSubset) !== digest(want)) {
			throw new Error(`存档面不符（部分）：\n${diff(want, gotSubset)}`);
		}
		return now;
	};

	root.__scenario = {
		loadFixture, dispatch, assertSave,
		snapshot, diff, digest, canonical,
		fixtures,
		/** 注册 fixture（返回注册名，便于链式/内联用） */
		fixture(name, state) {
			if (typeof name !== 'string' || name === '') throw new Error('fixture 名须是非空字符串');
			if (state == null || typeof state !== 'object') throw new Error(`fixture「${name}」的 state 须是对象`);
			fixtures[name] = state;
			return name;
		},
		/** 清空已注册 fixture（用例之间隔离） */
		clearFixtures() { for (const k of Object.keys(fixtures)) delete fixtures[k]; },
	};
})(typeof globalThis !== 'undefined' ? globalThis : window);
