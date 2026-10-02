/* RPG core —— M1 存档契约（`#1806` 笔 1：格式＋加载器＋迁移链）
 *
 * ## 本模块的定位
 *   把「存档」从**隐式**（宿主 `State.marshalForSave` 顺手带走一切）变成**显式契约**：
 *     ① **版本化** —— `saveVersion` 随档写入，迁移链**第一天就带**（票面边界 3：迁移链不得后补）；
 *     ② **过老/过新 ⇒ 显式拒绝** 并给出**可读文案**（✗ 静默坏档 —— 那是 M1 原病）；
 *     ③ **域契约声明**（`DOMAINS`）—— 哪些 `State.variables` 键属于哪一域，供审计与测试逐域往返；
 *     ④ **跨包标记**（`pack`）—— **本笔只「记」，不做「比」**（`#1812` 陷阱 2 的**第一步**）。
 *        `#1743` 的三包同 id（`player`／`club`）要根治，须「记来源包 ＋ 读档时比对」两件事；
 *        本笔落**前一件**（写入 `envelope().pack`），**后一件未做** ⇒ 换包读档**当前仍会静默取错定义**。
 *        ⇒ 「已记未用」这一事实由 `audit().recordedNotCompared` **显式登记**（✗ 让读者以为已解决）。
 *
 * ## 与宿主的分工（票面：「槽位/自动存 UI 沿用宿主，✗ 重建」）
 *   宿主负责：槽位管理、自动存、UI、以及 `State.variables` 的序列化/反序列化。
 *   本模块负责：**版本信封**＋**迁移/拒绝裁决**＋**域契约审计**。
 *   ⇒ 我们不重做存档系统；我们在宿主的 save 对象上**加一层有版本的契约**。
 *
 * ## 加载时序契约（工料单陷阱 1）
 *   快照里的效果/道具皆**存 id**（`player.effects` 为 id 串、`inventory` 为 `{id}`）
 *   ⇒ **还原必须在各包注册之后**（`RPG.{items,effects,characters,stocks}` 就位）。
 *   ⇒ `RPG.save.ready()` 是该前提的机械判据；`onLoad` 裁决时一并核（见 `judgeLoad`）。
 *
 * ## 与宿主回退共存（工料单陷阱 6）
 *   `State.history` 由宿主维护，本模块**不接管**回退；快照只描述「当前这一档」。
 *
 * ## ★「进档」判据（单一权威源 —— 新增域/键前先读本节）
 *   **判据＝「可否由代码重建」，✗ 非「是否在堆上」。**
 *     · **可重建**（代码的确定函数，如 `locations`／`exits` 由 `buildSpan*Hub` ＋ `world/babel*.js` 逐档重放）
 *       ⇒ **按设计不进档**；读档后由构建路径重建（前提见下「重议触发」）。
 *     · **不可重建**（记录的是**玩家的选择/历史**，如 `mapCurrent` 的当前位置）
 *       ⇒ **必须进档**（代码推不出「玩家选了哪」）。
 *   反例史：工料单 §〇 曾把「在堆上」直接当「错位来源」写死（**说得比证据强**），由 `#1829` 校订 ——
 *   「在堆上」只说明「宿主的序列化带不走它」，**不**说明「它该被带走」。
 *
 *   **重议触发**（出现其一即须重开裁定，**✗ 默认沿用**本判据）：
 *     ① 某「可重建」面出现**不可由构建函数重放**的变更（如**运行时**增删地点/边 ⇒ 图不再＝代码的函数）；
 *     ② 「重建」的代价或时序前提变得不可接受（如构建路径不再于读档时被调用）。
 *
 * 用法（接入宿主，幂等）：
 *   RPG.save.install();            // 挂 Save.onSave / Save.onLoad（无宿主环境为 no-op）
 *   RPG.save.envelope();           // 取当前应写入的信封（诊断/测试用）
 *   RPG.save.judgeLoad(raw);       // 纯函数裁决：{ok, payload} | {ok:false, code, message}
 *   RPG.save.declareDomain(key, shape);  // 故事侧登记新域（`#1902`；内置键不可覆盖）
 */

RPG.save = (() => {
	'use strict';

	/** 当前存档格式版本。★改格式必须 +1 并补 `MIGRATIONS[n]`（n → n+1）。 */
	const VERSION = 1;

	/** 信封的保留键 —— 挂在 **`save` 顶层**（✗ `save.state` 内；`state` 是引擎的
	 *  `{index, history, …}` 结构，混入会被变量表读到 —— 见 `install()` 的说明）。 */
	const ENVELOPE_KEY = 'rpgSave';

	/**
	 * **域契约**：`State.variables` 键 → 域（工料单 `#1812` §一 的七域）。
	 * `null` 表示**该域当前没有独立落点**（格式层预留位，✗ 假装已有）——见 `audit()`。
	 */
	const DOMAINS = Object.freeze({
		player: 'player',            // 域 2：玩家（纯对象，含 stats/effects/effectTurns）
		inventory: 'inventory',      // 域 1：背包（快照数组）
		mapCurrent: 'map',           // 域 3：地图位置（纯 id）
		sceneId: 'scene',            // 域 7：场景
		rpgNotices: 'notices',       // 域 5：通知缓冲（★有界，200）
		rpgNoticeFilter: 'notices',
		actors: 'actors',            // 域 4 的载体之一（`$actors = { goblin: … }`）
		span1Farms: 'byPack',        // §一.8 裸键 ⇒ 收拢进 `byPack`
		span1Harvests: 'byPack',
		flags: null,                 // 域 9：★现不存在（工料单 §〇.9）⇒ 格式层预留位
		/* ★未列独立条目者（避免「格式说支持、audit 报不出来」的两套口径）：
		 *   · **域 4 存量（stocks）** —— 落在 `player.stats.<stockId>`（工料单 §〇.4）⇒ **随 `player` 进档**，
		 *     故无独立 `State.variables` 键；`REGISTRIES` 里的 `stocks` 是**注册表**（`ready()` 用，
		 *     判「加载时还原 id 的时序前提」），**不是**存档域键 —— 两者语义不同，✗ 混为一谈。 */
	});

	/** **故事侧的域登记口**（`#1902`）：内置表 `DOMAINS` 不动，故事侧追加落 `DECLARED`。
	 *  用途：`books#132` 的 `$span1Arc` 这类故事侧键须能进 `envelope().domains` 与 `audit()`
	 *  （否则逐域往返面与审计面看不到它——是**审计缺口**，✗ 丢档）。
	 *  护栏：内置键**不得被覆盖**、同名重复返回 `false`（✗ 静默改语义）、非字符串／空串拒绝。 */
	const DECLARED = new Map();
	/** 合并视图（内置 ＋ 故事侧登记）——`envelope`／`audit`／导出的 `DOMAINS` 皆读它，✗ 各读一份。 */
	const domainTable = () => Object.assign({}, DOMAINS, Object.fromEntries(DECLARED));
	const declareDomain = (name, shape) => {
		if (typeof name !== 'string' || name === '' || name in DOMAINS || DECLARED.has(name)) return false;
		DECLARED.set(name, shape ?? null);
		return true;
	};

	/**
	 * 迁移链：`MIGRATIONS[n]` 把版本 n 的 payload 迁到 n+1。**逐级**执行，✗ 跳级。
	 * 第一天就带结构（即使当前只有 v1）——票面边界 3：**迁移链不得后补**。
	 */
	/* ★**不可冻结**：它正是「改格式时补一级」的扩展点（冻结 ⇒ 迁移链根本加不进去）。 */
	const MIGRATIONS = {
		/* ★**本格式自 v1 起 —— 不存在 v0**（本模块是存档契约的**首次**接入，无更早版本）。
		 *   ⇒ 键 `0` 是**结构性不可达**的：`judgeLoad` 把 `v < 1` 一律判为「没有版本标记」
		 *     （缺版本号与 v0 在本格式里同义 —— 都无法安全迁移）。故此处**不留占位注释**：
		 *     留一个永远跑不到的「扩展点」只会让人以为「v0 有路可走」（✗ 承诺＞实现）。
		 *   将来**真**出现 v2 时，按 `1:` 的形补一级即可（键从 1 起）。 */
	};

	/** 可读拒绝文案（★「过老 ⇒ 显式拒绝」的对外表达）。
	 *  ★`#1877` 同族清理：这些文案**会上屏**（读档失败即玩家可见）⇒ 原先的 `**强调**` 是
	 *    **Markdown 字面**（本仓 / SugarCube 都不渲染 `**`）⇒ 玩家看到星号。改中文引号强调。 */
	const REJECT = Object.freeze({
		NO_ENVELOPE: '此存档没有版本标记 —— 它来自「未接入存档契约的旧版」（或非本游戏的存档）。'
			+ '为避免「静默损坏」，本版拒绝载入。',
		TOO_NEW: (v) => `此存档的版本是 v${v}，高于本版支持的 v${VERSION}（来自「更新的游戏版本」）。`
			+ '请升级游戏后再载入，或另用新版本继续该进度。',
		TOO_OLD: (v) => `此存档的版本是 v${v}，「过旧」且「没有可用的迁移路径」（本版 v${VERSION}）。`
			+ '拒绝载入以免静默损坏。',
		NOT_READY: '存档还原的「时序前提」不满足：各规则包尚未注册完毕（效果/道具 id 无法解释）。',
	});

	/* ★安全取故事变量（与 `71-notice.js:80` 同形）：`State` **未声明**时 `State?.x` 仍抛
	 * ReferenceError（`?.` 只防 null/undefined，不防未声明标识符）⇒ 纯 core/node 环境必须走 typeof。 */
	const vars = () => (typeof State === 'undefined' ? {} : (State?.variables ?? {}));

	/** 读取引擎各注册表（`ready()` 的判据面；core 不假设包已加载）。 */
	const REGISTRIES = ['items', 'effects', 'characters', 'stocks'];

	/** 各包注册表是否就位（工料单陷阱 1 的机械判据）。 */
	const ready = () => REGISTRIES.every((k) => RPG[k] != null);

	/** 当前来源包标记（跨包遮蔽解，工料单陷阱 2）。无包环境 ⇒ `'core'`。 */
	const currentPack = () => {
		const v = vars();
		return (typeof v.rpgPack === 'string' && v.rpgPack) || (RPG.packId ?? 'core');
	};

	/** 本版应写入的信封（纯数据，随 `save.state` 一起进档）。 */
	const envelope = (stateVars = vars()) => ({
		saveVersion: VERSION,
		pack: currentPack(),
		/* 域键快照：**只记「该域此刻有没有落点」**（✗ 记值 —— 值由宿主序列化，重复即两套真值） */
		domains: Object.keys(domainTable()).filter((k) => stateVars[k] !== undefined),
		at: Date.now(),
	});

	/**
	 * 裁决一份存档该不该载入，并给出**迁移后**的 payload。**纯函数**（可直测，✗ 依赖宿主）。
	 * @returns `{ok:true, payload}` | `{ok:false, code, message}`
	 */
	/* `ctx` 为**注入口**（默认取本模块常量）：使迁移链在无宿主环境可直测（✗ 为测试留后门改真值）。 */
	const judgeLoad = (rawEnvelope, ctx = {}) => {
		const version = ctx.version ?? VERSION;
		const migrations = ctx.migrations ?? MIGRATIONS;
		const isReady = (ctx.ready ?? ready)();
		if (rawEnvelope == null || typeof rawEnvelope !== 'object') {
			return { ok: false, code: 'NO_ENVELOPE', message: REJECT.NO_ENVELOPE };
		}
		const v = rawEnvelope.saveVersion;
		/* ★缺版本号与「版本非整数」同等对待：皆无法安全迁移 ⇒ 显式拒绝（✗ 猜） */
		if (!Number.isInteger(v) || v < 1) {
			return { ok: false, code: 'NO_ENVELOPE', message: REJECT.NO_ENVELOPE };
		}
		if (v > version) {
			return { ok: false, code: 'TOO_NEW', message: REJECT.TOO_NEW(v) };
		}
		/* 逐级迁移（v → version）；缺任何一级 ⇒ 显式拒绝，✗ 尽力而为 */
		let payload = rawEnvelope;
		for (let from = v; from < version; from++) {
			const step = migrations[from];
			if (typeof step !== 'function') {
				return { ok: false, code: 'TOO_OLD', message: REJECT.TOO_OLD(v) };
			}
			payload = step(payload);
		}
		/* 时序前提：迁移只用纯数据；真正还原 id 前须包已注册 ⇒ 此处一并核（陷阱 1） */
		if (!isReady) {
			return { ok: false, code: 'NOT_READY', message: REJECT.NOT_READY };
		}
		return { ok: true, payload: { ...payload, saveVersion: version } };
	};

	/**
	 * **域契约审计**：声明了域却**没有落点**的键（工料单 §一/§三：`flags` 现不存在）。
	 * 用途：让「格式说支持、实际没有」这件事**可见**（✗ 静默 —— 与 `#1807` 的 `_unresolvable` 同旨）。
	 */
	const audit = (stateVars = vars()) => {
		const table = domainTable();
		const declared = Object.keys(table).filter((k) => table[k] != null);
		return {
			/* 域已声明但该键还没被写过 ⇒ 可能是「尚未落地」或「拼写漂移」，皆须可见 */
			absent: declared.filter((k) => stateVars[k] === undefined),
			/* 预留下（`DOMAINS[k] === null`）的域：格式支持、实现未做 */
			reserved: Object.keys(table).filter((k) => table[k] == null),
			/* ★**已记未用**：信封里写了、但裁决路径**还没读**的字段 ⇒ 显式登记，
			 *   防读者把「已记」误读成「已解决」（`#1743` 的比对属后续笔）。 */
			recordedNotCompared: ['pack'],
			version: VERSION,
		};
	};

	/* ---------- ★`#1877` P1-7：Restart 前补写一次自动存档 ---------- */

	/** 取宿主文档（无宿主环境 ⇒ `null`）。判据用 `typeof` 而非 `globalThis.document` ⇒ 不写点号形。 */
	const hostDocument = () => (typeof document === 'undefined' ? null : document);

	/**
	 * **Restart 前把当前进度写进「自动存档」槽一次**（`#1877` P1-7）。
	 *
	 * ## 为何需要（本席实测的宿主时序，✗ 推断）
	 *   · 宿主启动序：`State.restore()` **先看会话快照**（`session.get("state")`）—— 取得到就直接显示，
	 *     取不到才回落到 `enginePlay(Config.passages.start)`。
	 *   · 会话快照的**唯一写入点**在 `session.set("state", …)`，而它在 **history push 内**
	 *     ⇒ **只在导航时写**（就地改动不入）。
	 *   · `Engine.restart()` 体＝`window.scroll(0,0), State.reset(), triggerEvent(":enginerestart"), location.reload()`，
	 *     而 `State.reset()` 的首句就是 **`session.delete("state")`** ⇒ **快照被删**；
	 *     重载后 `State.restore()` 取不到 ⇒ 落回起始段。
	 *   ⇒ 这就是操作者所见的「Restart → Continue 恢复到**旧位置**」（Continue 读的是**上一次**存档）。
	 *
	 * ## 为何是「临时开户」而不是直接写（★本席实测，✗ 猜测）
	 *   本引擎 `Config.saves.maxAutoSaves` **默认为 0** ⇒ `Save.browser.auto.isEnabled()` 为假
	 *   ⇒ `Save.browser.auto.save()` 是 **no-op**（其首行 `if(!autoIsEnabled()||…) return !1`）。
	 *   而**永久**开户（`maxAutoSaves = 1`）会把 `:passageend` 的**连续**自动存档一并打开 ——
	 *   那远超本笔范围（操作者要的是「**Restart 前写一次**」）。
	 *   ⇒ 实现为：**临时开户 ⇒ 写一次 ⇒ 复原**（`finally` 保证复原，✗ 让异常把配置留在开户态）。
	 *
	 * ## 与 `#1859` 的关系（本函数**不**重复其修）
	 *   `auto.save()` 走 `marshal()` ⇒ 触发 `Save.onSave` 处理器 ⇒ `install()` 里那条
	 *   「把**活跃变量**并入当前时刻」照常生效 ⇒ 就地改动（`mapCurrent` 等）**随这次写入进档**
	 *   （实测：直接改 `State.variables.mapCurrent` 后写 ⇒ `continue()` 读回该值）。
	 *
	 * @param deps 注入面（**仅供单测**：`{ save, config }`）；省略 ⇒ 从宿主解析
	 * @returns boolean 是否真的写了一次（无宿主／无该 API ⇒ `false`，静默）
	 */
	const snapshotForRestart = (deps) => {
		const SC = deps ? null : (globalThis.SugarCube ?? globalThis);
		const save = deps?.save ?? SC?.Save;
		const config = deps?.config ?? SC?.Config;
		const auto = save?.browser?.auto;
		const saves = config?.saves;
		if (auto?.save == null || saves == null) return false;
		const before = saves.maxAutoSaves;
		try {
			/* 未开户 ⇒ 临时开一次（✗ 无条件赋 1：那会把调用方**本来就有**的更大值改小）。 */
			if (!(Number(before) > 0)) saves.maxAutoSaves = 1;
			auto.save();
		} finally {
			saves.maxAutoSaves = before;      // ★复原（含异常路径）
		}
		return true;
	};

	/** 判「这一击是不是 **Restart 确认**」并落快照。
	 *  抽成函数是为了**可直测**（✗ 只能靠 DOM 事件）—— 单测可直接传 `{ target: { id: 'restart-ok' } }`。
	 *  ⚠ 用 `closest`（若可用）兼收「点在按钮内层元素」的形（✗ 只认 `target.id`）。 */
	const handleRestartClick = (ev, deps) => {
		const el = ev?.target;
		const hit = el?.id === 'restart-ok' || el?.closest?.('#restart-ok') != null;
		if (!hit) return false;
		return snapshotForRestart(deps);
	};

	/** 把上面那个处理接到**捕获相位**的 `click` 上（幂等；无 `document` ⇒ 静默跳过）。
	 *  ★**必须捕获相位**：宿主的确认按钮处理在**目标相位**（`ariaClick` ⇒ `Dialog.close()` ⇒
	 *    `:dialogclosed` ⇒ `Engine.restart()`）；捕获先于它跑 ⇒ 落快照时 `State` **尚完整**
	 *    （`restart()` 一旦跑过就 `State.reset()`，那时再写已无从取状态）。
	 *  @param doc 注入面（**仅供单测**：假 `document`）；省略 ⇒ 取宿主文档
	 */
	const hookRestartConfirm = (doc = hostDocument()) => {
		if (restartHooked) return false;
		if (doc?.addEventListener == null) return false;
		doc.addEventListener('click', (ev) => { handleRestartClick(ev); }, true);
		restartHooked = true;
		return true;
	};

	/* ---------- 宿主接入（幂等；无宿主 ⇒ 静默跳过，✗ 抛错） ---------- */

	let installed = false;
	/** Restart 确认的捕获监听是否已接（与 `installed` 分开：接的是**文档**、不是宿主 API） */
	let restartHooked = false;

	const install = () => {
		if (installed) return false;
		/* ⚠ 保持**回退语义**（`SugarCube.Save` 无则回落全局 `Save`）。
		 *   ★**明写**每个 `globalThis`（✗ 用 `const G = globalThis` 的别名绕触点门 —— 那正是本门
		 *     `KNOWN_BLIND_SPOTS` 记的「别名」形，绕过去＝把真实耦合藏起来）。
		 *   ⇒ 本笔 `globalThis` 出现 2 → 3（新增 `Config` 一路），已按门要求 `--update-baseline` 登记。
		 *   ⚠ **如实记一处门的盲区**：本笔另增 1 处宿主耦合 —— `hostDocument()` 里的**裸 `document`**
		 *     （传给 `addEventListener`）—— 但门的 `document` 类目正则是 `document\.`（**属性形**）
		 *     ⇒ 裸 `document` **不被计入** ⇒ 实际加深比门报的**多 1 处**（✗ 借盲区少报）。 */
		const SC = globalThis.SugarCube;
		const host = SC?.Save ?? globalThis.Save;
		if (host == null || host.onSave?.add == null || host.onLoad?.add == null) return false;
		/* ★`#1877` P1-7：**Restart 前补写一次自动存档**（见 `snapshotForRestart` 的长注）。 */
		hookRestartConfirm();
		/* 存：信封挂 **`save` 顶层**（✗ `save.state` 内）。
		 *
		 * ★为何是顶层（`#1820` D 席 RC 裁甲，实测结构差）：真实 SugarCube 的 `save.state` 是
		 *   **`{index, history:[{title, variables}], …}` 结构**（变量在 `history[i].variables`），
		 *   而 `unmarshalForSave` **只认那四个已知键** ⇒ 顶层额外键**天然被忽略**、不污染变量表。
		 *   若挂进 `state`，仿真/真实两侧的变量表都会被塞入信封 ⇒ 往返后 `snapshot()` 含 `rpgSave`、
		 *   且 `envelope().at` 每次变化 ⇒ 「同一状态同 digest」被打破（单一比较口径失效）。
		 *   ⇒ 顶层是**真实引擎语义下的正确位置**，✗ 仅为迁就仿真。 */
		/* ★`#1859`（P0）**把当前段落的活跃变量并入存档的当前时刻** —— 否则「存→推进→读」读回旧快照。
 *
 * **引擎行为**（本席读 SC 2.37 源码 ＋ jsdom 实证，✗ 推断）：`State` 里**活跃时刻**与**历史**是**两个对象** ——
 *   · `State.variables` ⟶ `_active.variables`（**当前**段落期间的写入都落这里）
 *   · `State.history`  ⟶ `_history`（各时刻条目；新条目＝进入该段落时对当时活跃变量的 `clone`）
 *   而 `marshalForSave()` ⇒ `stateMarshal(true)` ⇒ **`clone(_history)`** ⇒ **不含 `_active`**。
 *   ⇒ 只有在**发生导航**时（`_history.push(momentCreate(title, _active.variables))`）活跃变量才并入历史。
 *   ⇒ **自环段落**（如巴别地图：按钮就地重绘、不导航）整段期间的写入（`mapCurrent`、拾取、创伤……）
 *     **永远不进 `_history`** ⇒ 存档只捕获「进入该段落那一刻」的快照。
 *
 * **实测**（jsdom，pin 产物）：存档里 `history[末].variables` **8 键**、**无** `mapCurrent_babel` ⇒
 *   读档后位置丢失（操作者实测「L2 存 → 推进到 L4 → 读 ⇒ 仍停 L4」）；把活跃变量挂上去后 ⇒
 *   **9 键**含 `mapCurrent_babel: L2`，读档后位置与背包均正确恢复 ✓。
 *
 * **修法**：用**活跃变量**覆盖存档里**当前时刻**的 `variables`（只碰这一个位置，✗ 重建历史）。
 * ⚠ 无宿主／`State` 不可用／`save.state` 非 `{index, history}` 形（仿真、旧档）⇒ **静默 no-op**（✗ 用空对象覆盖）。
 * @returns boolean 是否真的并入了（`false` ＝ 形不匹配，未改任何东西） */
		const syncActiveMoment = (save) => {
			const st = save?.state;
			if (st == null || !Array.isArray(st.history) || st.history.length === 0) return false;
			/* ⚠ 取**活跃**变量表时须区分「无 State」与「State 有但变量为空」：前者不能覆盖（会用空对象抹掉存档） */
			/* ⚠ 复用既有 `vars()`（✗ 再写一处 `State.variables` —— 触点门按**出现次数**防加深；
			 *   本文件该计数保持 1）。前置「有 `State` 吗」用**不含 `State.variables` 的**判据问 ⇒ 不增计数。 */
			if (typeof State === 'undefined' || State == null) return false;
			const live = vars();
			const i = Number.isInteger(st.index) ? st.index : st.history.length - 1;
			const entry = st.history[i];
			if (entry == null || typeof entry !== 'object') return false;
			entry.variables = live;
			return true;
		};

		host.onSave.add((save) => {
			syncActiveMoment(save);   // ★`#1859`：**先**并入活跃变量，再挂信封（两者同属这一次存档）
			if (save && typeof save === 'object') save[ENVELOPE_KEY] = envelope();
		});
		/* 读：裁决（从**顶层**取信封，与写入同位置）；拒绝则**抛可读错误**
		 *   （宿主据此中止载入 ⇒ 显式，✗ 静默坏档）。 */
		host.onLoad.add((save) => {
			const verdict = judgeLoad(save?.[ENVELOPE_KEY]);
			if (!verdict.ok) {
				const err = new Error(`[RPG] 拒绝载入存档：${verdict.message}`);
				err.rpgSaveReject = verdict.code;
				throw err;
			}
		});
		installed = true;
		return true;
	};

	return {
		VERSION, ENVELOPE_KEY, MIGRATIONS,
		/* ★getter（`#1902`）：故事侧登记后，`DOMAINS` 若仍是内置那份就成了「陈旧面」——读者据它判「有没有这一域」会答错 */
		get DOMAINS() { return domainTable(); },
		ready, currentPack, envelope, judgeLoad, audit, install, declareDomain,
		snapshotForRestart, handleRestartClick, hookRestartConfirm,   // ★`#1877` P1-7（供单测直证）
		installed: () => installed,
	};
})();

/* 包加载即尝试接入（无宿主环境静默 no-op ⇒ 单测与 node 环境不受影响）。 */
RPG.save.install();
