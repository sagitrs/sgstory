/* core/06-dice-control.js（`sgstory#2031` · **A4 测试模式前置**）：**用途化骰面控制**。
 *
 * ## 这一笔做什么（规格＝`#2031` 规格交付评论；机制＝A1 终裁冻结，✗ 本档自选）
 *   让测试模式能**按用途指定原始骰面**（如「这一击出 20」），而**不**碰成功/胜利、不绕正式结算：
 *     · **调用点显式给用途**（`ctx`）⇒ 引擎按表达式补 `sides`（骰型）与 `slot`（第几颗）⇒ 五元定位键；
 *     · **未定位 ⇒ 一分额度都不消费**，且**明报未消费／未覆盖**（✗ 显示「指定已生效」）；
 *     · 只控**骰面**：AI 选靶 `index(n)`、遭遇/战利品抽取等**选择器**一律 ✗ 纳入（A1 第 11 条）。
 *
 * ## 三账分记（A1「骰控制必须保持的两条账」的机械化）
 *   `报告()` 给三本**分账**：**额度账**（每条 arm 配了几面／吃了几面／剩几面）｜**骰序账**（按发生顺序的原始面，
 *   含来源 `受控`／`正常`／`未接入`）｜**底层计数**（`unit()` 调用数，含 `pick`／`index`）。
 *   ★为何要分账：**✗ 能由底层计数推出「哪个消费者吃了哪颗骰」** ⇒ 三本各自读。
 *
 * ## 与旧注入（`RPG.rng.setSequence`）的共存
 *   受控路径**✗ 读 `unit()`** ⇒ ✗ 消耗旧注入序列；未受控的掷骰照旧走 `unit()`。
 *   两者**互不干扰**，各自在账上可见；`setSequence` 抽尽仍在**骰原语**抛具名码 `RNG_EXHAUSTED`（语义未动）。
 *
 * ## 隔离（A1 第 3 条）
 *   **活动控制面 ✗ 入档**：本模块只住**运行期内存**（✗ 写 `State.variables` ⇒ ✗ 新增宿主触点）。
 *   生命周期清理（进入／退出／死亡／读档／切局）由**故事侧**在其钩子里调 `clearAll()`；本模块只保证
 *   「清除 ⇒ 立刻恢复随机」可测。已发生的**骰序账**是历史记录 ⇒ 故事若要入测试档，自取 `log()` 存
 *   （本模块 ✗ 代写档，✗ 碰 `$`）。
 */
(() => {
	/** 骰序账上限（**有界** ⇒ 长局不至吃内存；超限丢**最旧**并计数 —— 与 `71-notice.js` 的 `rpgNotices` 同形）。 */
	const 账上限 = 500;
	/** **已接入**的用途 id：由各**正式落点**在装载期声明（`arm()` 据此判「未覆盖」✗ 猜）。 */
	const 已接入 = new Set();
	/** 在用的控制条目（运行期内存，✗ 入档）。 */
	const 条目 = [];
	/** 骰序账（按发生顺序）。 */
	const 账 = [];
	let 丢账 = 0;
	/** **未覆盖清单**：被 `arm` 要求、却**没有任何落点接入**的用途 id（A1 要求「须明确报未覆盖」）。 */
	const 未覆盖 = new Set();
	/** **当前场次号**（故事侧给的稳定事件号，如战斗回合号）—— `instance` 维度的**供给口**
	 *  （✗ 引擎自造自增号：那会跨读档漂移）。运行控制 ⇒ ✗ 入档；`clearAll()` 一并清。 */
	let 当前场次 = null;
	let 编号 = 0;
	/** 底层计数：`unit()` 总调用数 —— 与上面两本**分记**（✗ 由它反推骰面）。 */
	const 底层 = { 调用: 0, 受控: 0, 正常: 0 };

	const 记 = (行) => {
		账.push(行);
		if (账.length > 账上限) { 账.shift(); 丢账 += 1; }
	};
	/** 定位比较：**逐字段相等**（条目未给的字段 ⇒ ✗ 匹配该字段；✗ 通配、✗ 猜测）。 */
	const 相配 = (a, c) =>
		a.purpose === c.purpose
		&& (a.actor === undefined || a.actor === c.actor)
		&& (a.instance === undefined || a.instance === c.instance)
		&& (a.sides === undefined || a.sides === c.sides)
		&& (a.slot === undefined || a.slot === c.slot);
	/** 找**唯一**匹配条目：0 条 ⇒ `null`（走正常随机）；≥2 条 ⇒ 具名拒（✗ 猜先注册的那条）。 */
	const 找 = (c) => {
		const 中 = 条目.filter((a) => 相配(a, c));
		if (中.length > 1) {
			throw RPG.refuse('DICE_ARM_AMBIGUOUS',
				`用途化骰：定位键同时命中 ${中.length} 条控制（${中.map((a) => a.armId).join('／')}）⇒ ✗ 猜哪条，请把 arm 的字段写窄`,
				{ 定位: { ...c }, 命中: 中.map((a) => a.armId) });
		}
		return 中[0] ?? null;
	};

	RPG.diceControl = Object.freeze({
		账上限,

		/** 某**正式落点**声明「我接了这个用途」（装载期调用一次）。⇒ `arm()` 据此判「未覆盖」。 */
		接入(purpose) {
			if (typeof purpose === 'string' && purpose) 已接入.add(purpose);
			return [...已接入].sort();
		},
		/** 已接入用途表（判据与诊断用）。 */
		接入表: () => [...已接入].sort(),

		/** **设当前场次号**（故事侧在进入某事件／回合时设；进／出／读档时 `clearAll()` 清）。
		 *  ⇒ 各落点不必逐处穿参，`instance` 维度自动并入定位键（✗ 给 ⇒ 该维度按「未给」匹配）。 */
		场次(id) { 当前场次 = (typeof id === 'string' && id !== '') ? id : null; return 当前场次; },
		/** 读当前场次号（诊断／判据用）。 */
		当前场次: () => 当前场次,

		/**
		 * **配置一次控制**：按用途（＋定位）指定接下来的**原始骰面**。
		 *   · `faces` 须是**非空整数数组**，每面 ≥ 1；给了 `sides` 则须 ≤ `sides`（✗ 给 ⇒ 留到消费时按**实际骰型**校验）；
		 *   · `times` 缺省＝`faces.length`，且**须相等**（✗ 允许不等 ⇒ 免得「配 3 面只吃 2 面」）；
		 *   · **✗ 过宽**：`purpose` 之外**至少再给一个消费者维度**（`actor`／`instance`／`slot`）
		 *     —— 这正是 A1 第 10 条「不能仅凭『下次 d20』猜测」的机械化；
		 *   · 用途**未被任何落点接入** ⇒ 收据 `未覆盖`（当场可见，✗ 只写日志）。
		 * @returns {{ok:true, armId:string, 未覆盖:boolean, 面数:number, sides:number|null}}
		 *   ✗ 合法 ⇒ 抛 `RPG.refuse('DICE_ARM_*')`（✗ 部分启用）
		 */
		arm({ purpose, actor, instance, slot, sides, faces, times } = {}) {
			if (typeof purpose !== 'string' || purpose === '') {
				throw RPG.refuse('DICE_ARM_BAD_PURPOSE', '用途化骰：arm 须给非空字符串 `purpose`（用途 id）');
			}
			if (actor === undefined && instance === undefined && slot === undefined) {
				throw RPG.refuse('DICE_ARM_TOO_BROAD',
					`用途化骰：arm「${purpose}」只给了用途 ⇒ 过宽（会命中该用途的**任意**消费者）⇒ 至少再给 actor／instance／slot 之一`,
					{ purpose });
			}
			if (sides !== undefined && (!Number.isInteger(sides) || sides < 2)) {
				throw RPG.refuse('DICE_ARM_BAD_SIDES', `用途化骰：sides 须是 ≥2 的整数（收到 ${String(sides)}）`, { sides });
			}
			if (!Array.isArray(faces) || faces.length === 0
				|| faces.some((f) => !Number.isInteger(f) || f < 1 || (sides !== undefined && f > sides))) {
				throw RPG.refuse('DICE_ARM_BAD_FACES',
					`用途化骰：faces 须是非空整数数组且每面 ≥1（给了 sides 时还须 ≤ sides=${String(sides)}）—— 收到 ${JSON.stringify(faces)}`,
					{ faces, sides: sides ?? null });
			}
			if (times !== undefined && times !== faces.length) {
				throw RPG.refuse('DICE_ARM_LENGTH_MISMATCH',
					`用途化骰：times=${String(times)} 与 faces.length=${faces.length} 不等 ⇒ ✗ 启用（免得「配 N 面只吃 M 面」）`,
					{ times, 面数: faces.length });
			}
			const 未覆盖本条 = !已接入.has(purpose);
		if (未覆盖本条) 未覆盖.add(purpose);
			编号 += 1;
			const a = { armId: `arm-${编号}`, purpose, actor, instance, slot, sides, faces: [...faces],
				已吃: 0, 面数: faces.length, at: Date.now() };
			条目.push(a);
			return { ok: true, armId: a.armId, 未覆盖: 未覆盖本条, 面数: a.面数, sides: sides ?? null };
		},

		/** 撤掉一条控制（按 `armId`）。@returns {boolean} 是否撤到。 */
		clear(armId) {
			const i = 条目.findIndex((a) => a.armId === armId);
			if (i < 0) return false;
			条目.splice(i, 1);
			return true;
		},
		/** 撤掉**全部**控制（故事侧的生命周期钩子用：进入／退出／死亡／读档／切局）。 */
		clearAll() { const n = 条目.length; 条目.length = 0; 未覆盖.clear(); 当前场次 = null; return n; },

		/** **骰序账**（历史记录，按发生顺序；✗ 递内部引用）。 */
		log: () => 账.map((x) => ({ ...x })),

		/** **清三账读数**（✗ 动控制面 —— 那是 `clearAll`；本口只把**读数**归零：骰序账／丢账／底层计数）。
		 *  用途：故事侧开**新场次**时另起一本账；判据取「本格增量」时先归零。 */
		清账() { 账.length = 0; 丢账 = 0; 底层.调用 = 0; 底层.受控 = 0; 底层.正常 = 0; return true; },

		/** **三账读数** ＋ 未消费／未覆盖清单（判据与「明报」用）。 */
		报告() {
			const 未消费 = 条目.filter((a) => a.已吃 === 0)
				.map((a) => ({ armId: a.armId, purpose: a.purpose, 原因: '从未匹配到调用点（未定位）' }));
			return {
				额度账: 条目.map((a) => ({
					armId: a.armId, purpose: a.purpose, actor: a.actor ?? null, instance: a.instance ?? null,
					slot: a.slot ?? null, sides: a.sides ?? null, 配置面: a.面数, 已消费: a.已吃, 剩余: a.faces.length,
				})),
				骰序账: 账.map((x) => ({ ...x })),      // ★`F2`：规格 §五 要的是**账**（条数另有 `骰序条数`）
				骰序条数: 账.length, 骰序丢账: 丢账,
				/* ★`F2`：底层 `unit()` 调用与「受控颗数」**不是同一划分**（受控 ✗ 读 `unit()`）⇒ 两者并列，✗ 混成一棵。 */
				底层计数: { unit调用: 底层.调用, 受控颗数: 底层.受控, 正常颗数: 底层.正常 },
				未消费,
				/* ★`F3`：把**已接入表**带进报告 ⇒「引擎**无此骰点**」与「**有此点但本包未接入**」可分辨（✗ 混成一句）。 */
				接入表: [...已接入].sort(),
				未覆盖: [...未覆盖].map((p) => ({
					purpose: p,
					原因: '该用途**不在接入表内** —— 或引擎无此骰点（如先攻），或本包未接入 ⇒ 配了也不会生效（见 `接入表`）',
				})),
			};
		},

		/* ───────── 以下为**原语内部口**（✗ 故事 API；`05-dice.js` 用）───────── */

		/** 底层计数＋1（`RPG.rng.unit` 每调一次记一次 —— 与骰序账**分记**）。 */
		_记底层() { 底层.调用 += 1; },

		/**
		 * **预检**（原子性：**先验后掷**）：一次 `rollDetail(expr, ctx)` 在掷**第一颗**之前，
		 * 把该表达式的每颗骰与该次的定位键一起验一遍 ⇒ 面数不足／越界**整次拒**且**零部分消费**。
		 * @returns {boolean} 是否需要**逐颗记账**（有 `purpose` 或**有任何在用的控制** ⇒ `true`）
		 */
		_预检(ctx, sides, count) {
			const 要记 = (ctx && ctx.purpose) || 条目.length > 0;
			if (!要记) return false;
			/* ★`F1`（`developer` 首轮 RC，**真伤**）：须校验「**这一颗将要吃的**」那一面 ——
			 *   一条臂可被**同一次表达式的多颗**命中（臂 ✗ 给 `slot` 时）⇒ 它按 `faces` **顺序**逐颗喂
			 *   （`_落` 用 `shift()`）。**原版一律取 `faces[0]`** ⇒ 第 2 颗及其后**从未被校验**：
			 *   `arm({purpose:'damage', actor:'甲', faces:[3, 99]})` ＋ `2d6` ⇒ 掷出 `[3, 99]`（d6 出 99 ⇒ 真进结算 ✗）。
			 *   ⇒ 用**局部游标**模拟本表达式的消费序（✗ 改臂自身 ⇒ 预检**零副作用**：抛出即整次拒且零消费）。 */
			const 游标 = new Map();                       // armId ⇒ 本表达式内**已预占**的颗数
			for (let i = 0; i < count; i++) {
				const c = { ...(ctx ?? {}), instance: ctx?.instance ?? 当前场次 ?? undefined, sides, slot: i };
				const a = ctx?.purpose ? 找(c) : null;
				if (!a) continue;
				const 已占 = 游标.get(a.armId) ?? 0;
				const face = a.faces[已占];
				游标.set(a.armId, 已占 + 1);
				if (face === undefined) {
					throw RPG.refuse('DICE_ARM_EXHAUSTED', `用途化骰：控制 ${a.armId} 的面已吃空（✗ 半掷）`, { armId: a.armId });
				}
				if (face > sides) {
					throw RPG.refuse('DICE_FACE_OUT_OF_RANGE',
						`用途化骰：控制 ${a.armId} 的第 ${已占 + 1} 面 ${face} 超出本次骰型 d${sides} ⇒ 整次拒（✗ 部分消费）`,
						{ armId: a.armId, face, sides, 第几面: 已占 + 1 });
				}
			}
			return true;
		},

		/** 逐颗落骰：匹配到控制 ⇒ 吃指定面（并记账）；否则走**正常随机源**（并在有账时记「正常」）。 */
		_落(ctx, sides, slot, 要记) {
			const c = (ctx ?? {}).purpose
				? { ...ctx, instance: ctx.instance ?? 当前场次 ?? undefined, sides, slot }
				: null;
			const a = c ? 找(c) : null;
			if (a) {
				const face = a.faces.shift();
				底层.受控 += 1;
				a.已吃 += 1;
				if (a.faces.length === 0) {
					const i = 条目.indexOf(a);
					if (i >= 0) 条目.splice(i, 1);
				}
				记({ at: Date.now(), ...c, face, source: '受控', armId: a.armId });
				return face;
			}
			const face = RPG.rng.pick(sides);
			底层.正常 += 1;
			if (要记) {
				记({ at: Date.now(), ...(c ?? {}), face, source: c ? '正常' : '未接入' });
			}
			return face;
		},
	});
})();
