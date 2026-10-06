/* core/33-commit.js（`sgstory#2025` E2 · 设计 §4「返程的一致提交」）：**返程一致提交边界**。
 *
 * ## 这一笔做什么（范围＝`#2025` 票面裁定，✗ 本席自选）
 *   设计 §4 把「可靠提交边界」列为**引擎职责**（「引擎提供**或复用**一个可靠提交边界…重复提交保护」），
 *   五域编排（位置／物品／效果／机会／进度各归谁）归**故事**（`S6`）。⇒ 本档只落**两件**：
 *     ② **二次确认**：`preview` 记**前像** ⇒ `commit` 前**再确认前像未变**，✗ 不套用陈旧计划；
 *     ③ **去重**：**请求身份** ＋ **已提交事实表**（本笔唯一新数据结构），重复请求**零副作用**并**返回已提交事实**。
 *   以及承载二者的**统一提交**：事实**一次落定**（✗ 逐项写）、②失败**回滚**（✗ 留半回城）。
 *
 * ## 形（公开面英文；与仓内既有面 `RPG.exchange`／`RPG.act`／`RPG.deposit` 同族）
 *   `RPG.commitBoundary.preview({ request, facts, apply })` → **票据**（纯数据：`{ request, 前像, 计划 }`）
 *   `RPG.commitBoundary.commit(ticket, { facts, publish })` → 结果面 `{ status, code?, facts?, published? }`
 *   `RPG.commitBoundary.settled(request)` → 已提交事实的快照（✗ 无 ⇒ `null`）
 *   `RPG.commitBoundary.ledger()` → 已提交表的读口（诊断／判据用）
 *
 * ## 三处**有意**的选择（都写在这里，✗ 让读者猜）
 *   ① **票据是纯数据**（`✗` 不夹活引用、`✗` 不夹函数）⇒ 故事可把它存进 `$` 跨拍（预览→玩家确认→提交），
 *      重新进入场景后仍可提交；`facts`／`publish` 在**提交时**传入（⇒ 前像对得上才落）。
 *   ② **拒绝走「结果面」**（结构化拒绝 `RPG.refuse` 收成 `{ status:'rejected', code }`，✗ 抛）——
 *      提交入口的调用方是段落／场景，✗ 应被异常打断；**普通异常照抛**（与 `55-session.js` 的第 ④ 条同形）。
 *   ③ **记账写后回读**：写完须**读得回来**，读不回 ⇒ 视为失败并**回滚事实**（本仓「写后回读」纪律；
 *      宿主冻结／配额满时静默丢写的形态**不得**留下「事实已落、账上没记」的半态）。
 *
 * ## 两条**边界**（细则在此，✗ 只留在 PR 正文里 —— 正文不随源码走）
 *   · **两个入口的错形不同（有意）**：`preview` 的入参是**代码面**（故事当场写的）⇒ 错即**具名抛**
 *     （`RPG.refuse`）；`commit` 的入参是**数据面**（票据可能从 `$` 读回、可被改坏／伪造）⇒ 错即
 *     **结果面**（`COMMIT_BAD_*`）。⇒ 一个量一个名，✗ 让「误用」与「坏数据」走同一形。
 *   · **去重是窗口，✗ 绝对**：账**有界**（＝`上限`，默认 200，超限丢**最旧**）⇒ 只有**最近** `上限` 笔
 *     请求的重复提交受保护；更早的请求号被重放⇒**会再执行一次**。故事若要长程幂等，须自持键（✗ 挤进本表）。
 *   · **`facts` 必须是与 `preview` 同一块活事实**：传**副本**不会改到你的活状态，但账上**仍记为已提交**
 *     （⇒ 症状是「交易静默没发生」）⇒ 故事侧 ✗ 传副本（引擎在此处**故意不猜**：副本与活块在数据上不可分）。
 *
 * ## 与宿主／存档的关系
 *   `✗ 本档不建第二套存档`：已提交表落 `$rpgCommits`（**引擎自有键**，域 `byPack`，见 `80-save.js` 的 `DOMAINS`），
 *   纯数据 ⇒ 由既有序列化宿主带进档 ✓。无 `State` 环境（纯 core 判据）⇒ 退回**本模块内存账**（同形，✗ 抛）。
 */
(() => {
	/** 已提交表的**有界**上限（照 `71-notice.js` 的 `rpgNotices` 同形：超限丢最旧）。 */
	const 上限 = 200;

	/** 深拷（读口）—— ✗ 把内部引用递出去（与 `55-session.js` 的 `快照` 同形）。 */
	const 快照 = (x) => {
		if (x == null || typeof x !== 'object') return x;
		if (Array.isArray(x)) return x.map(快照);
		const 出 = {};
		for (const k of Object.keys(x)) 出[k] = 快照(x[k]);
		return 出;
	};

	/** 可序列化闸（**同一道**用于前像与计划）：拒函数／`undefined`／`NaN`／类实例／循环 ⇒ 具名拒。
	 *   理由同 `10-item.js` 的 `规整载荷`：脏值写到盘上才在下次读档爆，那时症状离病因极远。 */
	const 规整 = (v, 路径 = 'facts', 见 = new WeakSet()) => {
		if (v === null) return null;
		const t = typeof v;
		if (t === 'string' || t === 'boolean') return v;
		if (t === 'number') {
			if (!Number.isFinite(v)) throw RPG.refuse('COMMIT_NOT_SERIALIZABLE', `提交面在 ${路径} 处不是有限数（${String(v)}）`, { 路径 });
			return v;
		}
		if (Array.isArray(v)) {
			if (见.has(v)) throw RPG.refuse('COMMIT_NOT_SERIALIZABLE', `提交面在 ${路径} 处有循环引用`, { 路径 });
			见.add(v);
			return v.map((x, i) => 规整(x, `${路径}[${i}]`, 见));
		}
		if (t === 'object') {
			const 壳 = Object.getPrototypeOf(v);
			if (壳 !== Object.prototype && 壳 !== null) {
				throw RPG.refuse('COMMIT_NOT_SERIALIZABLE', `提交面在 ${路径} 处是类实例（${v?.constructor?.name ?? '?'}）⇒ ✗ 不可序列化`, { 路径 });
			}
			if (见.has(v)) throw RPG.refuse('COMMIT_NOT_SERIALIZABLE', `提交面在 ${路径} 处有循环引用`, { 路径 });
			见.add(v);
			const 出 = {};
			for (const k of Object.keys(v)) 出[k] = 规整(v[k], `${路径}.${k}`, 见);
			return 出;
		}
		throw RPG.refuse('COMMIT_NOT_SERIALIZABLE', `提交面在 ${路径} 处含不可序列化的值（${t}）`, { 路径, 类型: t });
	};

	/** 无 `State` 环境（纯 core）的**内存账** —— 同形，使判据在 node 里也跑得动（✗ 抛、✗ 静默丢）。 */
	const 内存账 = {};

	/** 取已提交表。`建` ＝ 缺时是否**建**（默认 `true`）。
	 *  ★**读口一律传 `false`（读不得写）**：`settled()`／`ledger()` 若顺手建出空表，`envelope().domains`
	 *    会把它记成「有落点」、`audit().absent` 里也就看不到它了 ⇒ **假落点遮住审计面**（`dev-9` 的 N1 实测）。 */
	const 记账 = (建 = true) => {
		if (typeof State === 'undefined') return 内存账;
		/* ★取账**不得抛**：宿主可能冻结变量表／配额满（写不进是**常态故障**，✗ 异常）。
		 *   取不到 ⇒ 返 `undefined` ⇒ 下游（读口防御、写口 read-back）各自按「没有账」处理。 */
		try {
			const vars = State.variables;
			const 账 = vars.rpgCommits;
			if (账 == null || typeof 账 !== 'object' || Array.isArray(账)) {
				if (!建) return undefined;
				vars.rpgCommits = {};
			}
			return vars.rpgCommits;
		} catch { return undefined; }
	};

	/** 取某请求的**已提交事实**（✗ 无 ⇒ `null`）。 */
	const 条 = (账, request) => {
		const v = 账?.[request];
		return (v != null && typeof v === 'object' && typeof v.facts === 'object') ? v : null;
	};

	/** 一次落定：把 `目标` 的内容**整体**换成 `源`（保留数组／对象**自身引用** ⇒ 别处持有的视图不失效）。
	 *  ★**前提**：`源` 必须是**已过 `规整` 的纯数据对象**（本档两个调用点用的正是票据的 `前像`／`计划` ——
	 *    两者都在 `preview` 里过 `规整`，且 `commit` 入口**再规整一次** ✓）。
	 *    ⚠ 未满足前提（数组／类实例／带环）时，「删旧键」与「赋新键」两轮会**不成对** ⇒ 得「删了旧键
	 *    而没赋上新键」的**半态** ⇒ 故此处**具名抛**（✗ 静默半态 —— 半态比抛更难查）。 */
	const 一次落定 = (目标, 源) => {
		if (源 == null || typeof 源 !== 'object' || Array.isArray(源)) {
			throw new Error('一次落定：源须是已规整的纯数据对象（✗ 数组／类实例／空）');
		}
		for (const k of Object.keys(目标)) if (!(k in 源)) delete 目标[k];
		for (const k of Object.keys(源)) 目标[k] = 快照(源[k]);
	};

	/** 有界剪枝：超上限丢**最旧**（按 `at`；同刻按插入序 ⇒ 稳定读数）。 */
	const 剪枝 = (账) => {
		const 名 = Object.keys(账);
		if (名.length <= 上限) return;
		名.sort((a, b) => ((账[a]?.at ?? 0) - (账[b]?.at ?? 0)) || (名.indexOf(a) - 名.indexOf(b)));
		for (const k of 名.slice(0, 名.length - 上限)) delete 账[k];
	};

	const 拒 = (code, message, extra) => ({ status: 'rejected', code, message, ...extra });

	RPG.commitBoundary = Object.freeze({
		上限,

		/**
		 * ① **预览**：记**前像** ＋ 在**草稿**上算**变更计划** ⇒ 返**票据**（纯数据）。
		 *   ⚠ 活事实**零接触**（一切在草稿上）⇒ 预览取消＝不留痕（设计 §4「预览取消不写状态」）。
		 *   故事侧的不合法（战中／死亡／耗尽／政策不许…）由 `apply` 用 `RPG.refuse(code, …)` 表态
		 *   ⇒ 收成结果面（`✗` 抛），且**仍未碰活事实** ✓。
		 * @param {{request:string, facts:object, apply:(草稿:object)=>void}} 入参
		 * @returns {{status:'previewed', ticket:{request,前像,计划}} | {status:'rejected', code:string, …}}
		 */
		preview({ request, facts, apply } = {}) {
			if (typeof request !== 'string' || request === '') throw RPG.refuse('COMMIT_BAD_REQUEST', 'commitBoundary.preview：request 须是非空字符串（请求身份，去重的键）');
			if (facts == null || typeof facts !== 'object' || Array.isArray(facts)) throw RPG.refuse('COMMIT_BAD_FACTS', 'commitBoundary.preview：facts 须是对象（活事实块）');
			if (typeof apply !== 'function') throw RPG.refuse('COMMIT_BAD_APPLY', 'commitBoundary.preview：apply 须是函数（在草稿上算变更计划）');
			const 前像 = 规整(facts, 'facts');
			const 计划 = 规整(facts, 'facts');
			try {
				apply(计划);                              // ★只在草稿上（活事实零接触）
			} catch (e) {
				/* 结构化拒绝（`RPG.refuse` ⇒ `e.code` 非空串）收成结果面；普通异常照抛（✗ 吞真 bug）。 */
				if (typeof e?.code === 'string' && e.code !== '') return 拒(e.code, String(e.message ?? e.code));
				throw e;
			}
			return { status: 'previewed', ticket: Object.freeze({ request, 前像, 计划: 规整(计划, '计划') }) };
		},

		/**
		 * ② **提交**：去重 → **二次确认**（前像须未变）→ **统一提交**（一次落定 ＋ 记账 ＋ **写后回读**）→ 发布。
		 *   · 重复请求 ⇒ `{ status:'settled', reused:true, facts:<已提交事实> }`，**零副作用** ✓
		 *   · 前像已变 ⇒ `{ status:'rejected', code:'COMMIT_STALE' }`，**零副作用**（✗ 按旧预览落地）✓
		 *   · 记账失败（写后回读不到）⇒ **回滚事实** ＋ `{ code:'COMMIT_LEDGER_FAILED' }`（✗ 半回城）✓
		 *   · `publish` 抛 ⇒ 事实**仍在**（只 `published:false`）⇒ 调用方**只重绘**，✗ 不重跑领域副作用 ✓
		 * @param {{request,前像,计划}} ticket `preview` 给的票据
		 * @param {{facts:object, publish?:(事实:object)=>void}} 入参 `facts` 须是**同一**块活事实
		 */
		commit(ticket, { facts, publish } = {}) {
			if (ticket == null || typeof ticket !== 'object' || typeof ticket.request !== 'string' || ticket.request === '') {
				return 拒('COMMIT_BAD_TICKET', 'commitBoundary.commit：票据须是 preview 返回的那张（含非空 request）');
			}
			if (facts == null || typeof facts !== 'object' || Array.isArray(facts)) {
				return 拒('COMMIT_BAD_FACTS', 'commitBoundary.commit：facts 须是对象（与 preview 同一块活事实）');
			}
			/* ★公共面的**载荷**校验（✗ 只信 `preview` 当场给的那张）：票据可能被故事存进 `$` **跨拍**读回
			 *   （⇒ 可被改坏／伪造）⇒ 入口处**再规整一次**：非对象 ⇒ `COMMIT_BAD_TICKET`（结果面，✗ 抛）；
			 *   坏值（函数／NaN／类实例／环）⇒ `COMMIT_BAD_TICKET`（✗ 把 `COMMIT_NOT_SERIALIZABLE` 漏给下游）。 */
			let 前像, 计划;
			try {
				if (ticket.前像 == null || typeof ticket.前像 !== 'object' || Array.isArray(ticket.前像)
					|| ticket.计划 == null || typeof ticket.计划 !== 'object' || Array.isArray(ticket.计划)) {
					throw new Error('票据载荷须是对象（前像／计划）');
				}
				前像 = 规整(ticket.前像, '前像');
				计划 = 规整(ticket.计划, '计划');
			} catch (e) {
				return 拒('COMMIT_BAD_TICKET', `commitBoundary.commit：票据载荷不可用（${e?.message ?? e}）`);
			}
			/* ③ 去重：这个请求交过了 ⇒ 直接还**已提交事实**（✗ 再动一次状态） */
			const 账 = 记账(false);                     // ★读口（✗ 无则不建）
			const 旧 = 条(账, ticket.request);   // ★账取不到（宿主冻结／配额满）⇒ 此处仍只是「无旧账」
			if (旧) return { status: 'settled', reused: true, code: 'COMMIT_ALREADY_SETTLED', facts: 快照(旧.facts) };

			/* ② 二次确认：提交前状态须与预览时**逐字**相同（✗ 套用陈旧计划） */
			const 当下 = 规整(facts, 'facts');
			if (JSON.stringify(当下) !== JSON.stringify(前像)) {
				return 拒('COMMIT_STALE', 'commitBoundary.commit：提交前状态与预览时不同 ⇒ 拒绝旧预览（请重算并重新确认）', {
					差异: { 预览时: 前像, 提交前: 当下 },
				});
			}

			/* 统一提交：ⓐ事实一次落定 ⓑ记账（**写后回读**）—— ⓑ失败 ⇒ ⓐ回滚 */
			try {
				一次落定(facts, 计划);
				const 账2 = 记账();
				账2[ticket.request] = { at: Date.now(), facts: 快照(计划) };
				剪枝(账2);
				if (!条(记账(), ticket.request)) throw new Error('记账写入未生效（写后回读不到）');
			} catch (e) {
				一次落定(facts, 前像);                       // ★回滚：✗ 留半回城
				return 拒('COMMIT_LEDGER_FAILED', `记账失败，事实已回滚（${e?.message ?? e}）`);
			}

			/* 发布演出（✗ 领域副作用）：失败 ⇒ 事实与账**仍在**（只 `published:false`）⇒ 调用方只重绘 */
			let published = true, 发布错 = null;
			if (typeof publish === 'function') {
				try { publish(快照(计划)); } catch (e) { published = false; 发布错 = String(e?.message ?? e); }
			}
			return { status: 'applied', facts: 快照(计划), published, ...(发布错 ? { publishError: 发布错 } : {}) };
		},

		/** ③ 读口：某请求的**已提交事实**（✗ 无 ⇒ `null`）。★读不得写（✗ 建空表 —— 那会遮住 `audit().absent`）。 */
		settled(request) {
			const 条2 = 条(记账(false), request);
			return 条2 ? 快照(条2.facts) : null;
		},

		/** 读口（诊断／判据）：已提交表的形状读数。★读不得写（同上）。 */
		ledger() {
			const 账 = 记账(false) ?? {};
			const 名 = Object.keys(账);
			return { size: 名.length, requests: 名.slice(), 上限 };
		},
	});
})();
