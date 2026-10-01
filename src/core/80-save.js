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
 * 用法（接入宿主，幂等）：
 *   RPG.save.install();            // 挂 Save.onSave / Save.onLoad（无宿主环境为 no-op）
 *   RPG.save.envelope();           // 取当前应写入的信封（诊断/测试用）
 *   RPG.save.judgeLoad(raw);       // 纯函数裁决：{ok, payload} | {ok:false, code, message}
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

	/** 可读拒绝文案（★「过老 ⇒ 显式拒绝」的对外表达）。 */
	const REJECT = Object.freeze({
		NO_ENVELOPE: '此存档没有版本标记 —— 它来自**未接入存档契约的旧版**（或非本游戏的存档）。'
			+ '为避免**静默损坏**，本版拒绝载入。',
		TOO_NEW: (v) => `此存档的版本是 v${v}，高于本版支持的 v${VERSION}（来自**更新的游戏版本**）。`
			+ '请升级游戏后再载入，或另用新版本继续该进度。',
		TOO_OLD: (v) => `此存档的版本是 v${v}，**过旧**且**没有可用的迁移路径**（本版 v${VERSION}）。`
			+ '拒绝载入以免静默损坏。',
		NOT_READY: '存档还原的**时序前提不满足**：各规则包尚未注册完毕（效果/道具 id 无法解释）。',
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
		domains: Object.keys(DOMAINS).filter((k) => stateVars[k] !== undefined),
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
		const declared = Object.keys(DOMAINS).filter((k) => DOMAINS[k] != null);
		return {
			/* 域已声明但该键还没被写过 ⇒ 可能是「尚未落地」或「拼写漂移」，皆须可见 */
			absent: declared.filter((k) => stateVars[k] === undefined),
			/* 预留下（`DOMAINS[k] === null`）的域：格式支持、实现未做 */
			reserved: Object.keys(DOMAINS).filter((k) => DOMAINS[k] == null),
			/* ★**已记未用**：信封里写了、但裁决路径**还没读**的字段 ⇒ 显式登记，
			 *   防读者把「已记」误读成「已解决」（`#1743` 的比对属后续笔）。 */
			recordedNotCompared: ['pack'],
			version: VERSION,
		};
	};

	/* ---------- 宿主接入（幂等；无宿主 ⇒ 静默跳过，✗ 抛错） ---------- */

	let installed = false;

	const install = () => {
		if (installed) return false;
		const host = globalThis.SugarCube?.Save ?? globalThis.Save;
		if (host == null || host.onSave?.add == null || host.onLoad?.add == null) return false;
		/* 存：信封挂 **`save` 顶层**（✗ `save.state` 内）。
		 *
		 * ★为何是顶层（`#1820` D 席 RC 裁甲，实测结构差）：真实 SugarCube 的 `save.state` 是
		 *   **`{index, history:[{title, variables}], …}` 结构**（变量在 `history[i].variables`），
		 *   而 `unmarshalForSave` **只认那四个已知键** ⇒ 顶层额外键**天然被忽略**、不污染变量表。
		 *   若挂进 `state`，仿真/真实两侧的变量表都会被塞入信封 ⇒ 往返后 `snapshot()` 含 `rpgSave`、
		 *   且 `envelope().at` 每次变化 ⇒ 「同一状态同 digest」被打破（单一比较口径失效）。
		 *   ⇒ 顶层是**真实引擎语义下的正确位置**，✗ 仅为迁就仿真。 */
		host.onSave.add((save) => {
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
		VERSION, ENVELOPE_KEY, DOMAINS, MIGRATIONS,
		ready, currentPack, envelope, judgeLoad, audit, install,
		installed: () => installed,
	};
})();

/* 包加载即尝试接入（无宿主环境静默 no-op ⇒ 单测与 node 环境不受影响）。 */
RPG.save.install();
