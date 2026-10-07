/* core/06-dice-control.js（`sgstory#2031` · **A4 测试模式前置**）：**用途化骰面控制**。
 *
 * ## 这一笔做什么（规格＝`#2031` 规格交付；机制＝A1 终裁；接口细则＝`#2031` 六项终裁）
 *   让测试模式能**按用途指定原始骰面**（如「这一击出 20」），而**不**碰成功/胜利、不绕正式结算：
 *     · **调用点显式给用途**（`ctx`）⇒ 引擎按表达式补 `sides`（骰型）／`slot`（第几颗）／`组`（伤害分组）⇒ 定位键；
 *     · **未定位 ⇒ 一分额度都不消费**，且**明报未消费／未覆盖**（✗ 显示「指定已生效」）；
 *     · 只控**骰面**：AI 选靶 `index(n)`、遭遇/战利品抽取等**选择器**一律 ✗ 纳入（A1 第 11 条）。
 *
 * ## 定位键（**六裁第 4／6 条**的落法）＝ 七元组，字段各有所司
 *   `purpose`（用途，必给）｜`actor`（行动者）｜`instance`（**稳定执行实例**，由故事侧经 `场次()` 供给）｜
 *   `物`（**来源物实例**＝件的 `entityId` ⇒ 同种件多实例可辨，六裁 3 末句）｜`sides`（骰型，解析层生成）｜
 *   `slot`（**第几颗**，零基、按本次表达式展开序，六裁 6）｜`组`（**伤害分组**，缺省 0；重击两次
 *   `rollDetail` 靠它 ✗ 互撞，六裁 6）。
 *
 * ## **匹配与宽度**（冲突 2 要求「公开说明」）
 *   · **匹配**＝**逐字段相等**；调用点**未给**的字段 ⇒ **✗ 匹配该字段**（✗ 视为通配）。
 *   · **有意范围控制**＝**少写字段**（如只写 `purpose`＋`actor` ⇒ 该行动者的**每次**该用途都吃面）——
 *     这是**有意**的宽，✗ 是「猜」；**精确定位**＝把 `instance`／`物`／`slot`／`组` 也写上。
 *   · **必要字段**：`purpose` 之外**至少再给一维**（`actor`／`instance`／`物`／`slot`／`组`）⇒ 否则
 *     `DICE_ARM_TOO_BROAD`（＝「不能凭『下次 d20』猜」的机械化）。
 *   · **遗漏**：未匹配到任何臂 ⇒ 走未受新控制的正常路径，**✗ 消费**任何额度（并在账上可见）。
 *   · **冲突**：同一掷骰同时命中**多条**臂 ⇒ `DICE_ARM_AMBIGUOUS`（✗ 按注册序猜一条）。
 *   · **收据**：`arm()` 返回 `{ ok, armId, 未覆盖, 面数, sides, 定位 }`（`定位` 即该臂的字段快照 ⇒ 可审计）。
 *
 * ## 三账分记（A1「两条账」的机械化；冲突 4 的落法）
 *   **额度账**（每条臂配了几面／吃了几面／剩几面）｜**骰序账**（按发生顺序的原始面，含**单调序**与来源）｜
 *   **底层计数**（`unit()` 调用数）。★受控颗数／未受新控制颗数**与 `unit()` 调用数分列**（受控 ✗ 读 `unit()`
 *   ⇒ 三者**不是同一划分**，✗ 混成一棵）。
 *
 * ## 日志**有界**（六裁 5）：上限 `账上限`（默认 500）⇒ 超限丢**最旧**，但**必须显式标记截断**：
 *   `报告().截断 = { 已丢, 留存范围:[首序,末序], 完整 }` ⇒ ★**✗ 拿截断尾部称全历史**；
 *   额度与底层计数**不因删行缩水** ✓。日志只保**稳定标识与已发生事实**（✗ 活动对象引用、✗ 可重武装指令）。
 *
 * ## 会话作用域（冲突 1）：**控制/额度/日志/计数按测试会话独立**
 *   `会话(id)` 切当前会话；各会话各有自己的臂／账／计数／场次 ⇒ `clearAll(id)` **只清该会话**（✗ 清别人）。
 *   ★**接缝呈明（✗ 冒充已隔离）**：受控路径**✗ 读 `unit()`** ⇒ ✗ 影响底层流；但**未受新控制**的掷骰
 *   **仍走全局 `RPG.rng`**（本模块 ✗ 改 `_impl`）⇒ 本笔 ✗ 声称「正式/测试随机流已独立」；
 *   「未受新控制」**✗ 等于真随机**（旧 `setSequence` 正是当前会话的合法底层注入源）。
 *
 * ## 隔离（A1 第 3 条）：**活动控制面 ✗ 入档**
 *   本模块只住**运行期内存**（✗ 写 `State.variables` ⇒ ✗ 新增宿主触点）；生命周期清理（进入／退出／死亡／
 *   读档／切局）由**故事侧**在其钩子里调 `clearAll(会话)` ✓；已发生的骰序账是历史记录 ⇒ 故事要入测试档
 *   自取 `log()` 存（本模块 ✗ 代写档）。
 */
(() => {
	/** 每个会话的骰序账上限（有界 ⇒ 长局不至吃内存；超限丢**最旧**并计数，**截断须显式**）。 */
	const 账上限 = 500;
	/** **已接入**的用途 id：由各**正式落点**在装载期声明（`arm()` 据此判「未覆盖」✗ 猜）—— 与**会话无关**。 */
	const 已接入 = new Set();
	/** 会话表：会话 id ⇒ 该会话的记录（✗ 跨会话共享 ⇒ 清一个会话 ✗ 清别人）。 */
	const 会话表 = new Map();
	let 当前会话 = '默认';

	const 新记录 = () => ({
		条目: [], 账: [], 丢账: 0, 序号: 0, 未覆盖: new Set(), 场次: null,
		底层: { 调用: 0, 受控: 0, 未受新控制: 0 },
	});
	/** 取**当前会话**的记录（惰性建 ✓）。 */
	const 本 = () => {
		let r = 会话表.get(当前会话);
		if (!r) { r = 新记录(); 会话表.set(当前会话, r); }
		return r;
	};
	/** 记一条骰序账（带**单调序**；超上限丢最旧并计数）。 */
	const 记 = (c, 行) => {
		const r = 本();
		r.序号 += 1;
		r.账.push({ 序: r.序号, at: Date.now(), ...c, ...行 });
		if (r.账.length > 账上限) { r.账.shift(); r.丢账 += 1; }
	};
	/** 定位比较：**逐字段相等**（臂未给的字段 ⇒ ✗ 匹配该字段；✗ 通配、✗ 猜测）。 */
	const 相配 = (a, c) =>
		a.purpose === c.purpose
		&& (a.actor === undefined || a.actor === c.actor)
		&& (a.instance === undefined || a.instance === c.instance)
		&& (a.物 === undefined || a.物 === c.物)
		&& (a.sides === undefined || a.sides === c.sides)
		&& (a.slot === undefined || a.slot === c.slot)
		&& (a.组 === undefined || a.组 === c.组);
	/** 补全调用点的定位键：由**解析层**补 `sides`／`slot`／`组`（六裁 6：「slot 真值由骰解析层生成」）。 */
	const 定位 = (ctx, sides, slot) => ({
		...(ctx ?? {}),
		instance: ctx?.instance ?? 本().场次 ?? undefined,
		sides, slot, 组: ctx?.组 ?? 0,
	});
	/** 找**唯一**匹配臂：0 条 ⇒ `null`（走未受新控制路径）；≥2 条 ⇒ 具名拒（✗ 猜先注册的那条）。 */
	const 找 = (c) => {
		const 中 = 本().条目.filter((a) => 相配(a, c));
		if (中.length > 1) {
			throw RPG.refuse('DICE_ARM_AMBIGUOUS',
				`用途化骰：定位键同时命中 ${中.length} 条控制（${中.map((a) => a.armId).join('／')}）⇒ ✗ 猜哪条，请把臂的字段写窄`,
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

		/** **切当前会话**（各会话的臂／账／计数／场次**互相独立**）。空串/非串 ⇒ 回到 `'默认'`。 */
		会话(id) { 当前会话 = (typeof id === 'string' && id !== '') ? id : '默认'; return 当前会话; },
		/** 读当前会话 id。 */
		当前会话Id: () => 当前会话,

		/** **设当前会话的场次号**（故事侧在进入某事件／回合时设）⇒ `instance` 维度自动并入定位键。 */
		场次(id) { 本().场次 = (typeof id === 'string' && id !== '') ? id : null; return 本().场次; },
		/** 读当前会话的场次号（诊断／判据用）。 */
		当前场次: () => 本().场次,

		/**
		 * **配置一次控制**：按用途（＋定位）指定接下来的**原始骰面**。
		 *   · `faces` 须是**非空整数数组**，每面 ≥ 1；给了 `sides` 则须 ≤ `sides`（✗ 给 ⇒ 留到消费时按**实际骰型**校验）；
		 *   · `times` 缺省＝`faces.length`，且**须相等**（臂**自洽**校验，✗ 是对单次表达式 count 的约束）；
		 *   · **✗ 过宽**：`purpose` 之外**至少再给一维**（`actor`／`instance`／`物`／`slot`／`组`）；
		 *   · 用途**未被任何落点接入** ⇒ 收据 `未覆盖`（当场可见，✗ 只写日志）。
		 * @returns {{ok:true, armId:string, 未覆盖:boolean, 面数:number, sides:number|null, 定位:object}}
		 */
		arm({ purpose, actor, instance, 物, slot, 组, sides, faces, times } = {}) {
			if (typeof purpose !== 'string' || purpose === '') {
				throw RPG.refuse('DICE_ARM_BAD_PURPOSE', '用途化骰：arm 须给非空字符串 `purpose`（用途 id）');
			}
			if (actor === undefined && instance === undefined && 物 === undefined && slot === undefined && 组 === undefined) {
				throw RPG.refuse('DICE_ARM_TOO_BROAD',
					`用途化骰：arm「${purpose}」只给了用途 ⇒ 过宽（会命中该用途的**任意**消费者）⇒ 至少再给 actor／instance／物／slot／组 之一`,
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
			const r = 本();
			const 未覆盖本条 = !已接入.has(purpose);
			if (未覆盖本条) r.未覆盖.add(purpose);
			r.序号 += 1;
			const a = { armId: `arm-${r.序号}`, purpose, actor, instance, 物, slot, 组, sides,
				faces: [...faces], 已吃: 0, 面数: faces.length, at: Date.now() };
			r.条目.push(a);
			return {
				ok: true, armId: a.armId, 未覆盖: 未覆盖本条, 面数: a.面数, sides: sides ?? null,
				定位: { purpose, actor: actor ?? null, instance: instance ?? null, 物: 物 ?? null,
					sides: sides ?? null, slot: slot ?? null, 组: 组 ?? null },
			};
		},

		/** 撤掉**当前会话**的一条控制（按 `armId`）。@returns {boolean} 是否撤到。 */
		clear(armId) {
			const r = 本();
			const i = r.条目.findIndex((a) => a.armId === armId);
			if (i < 0) return false;
			const [去掉] = r.条目.splice(i, 1);
			if (!r.条目.some((a) => a.purpose === 去掉.purpose)) r.未覆盖.delete(去掉.purpose);
			return true;
		},
		/** 撤掉**某个会话**的全部控制与场次（缺省＝当前会话）⇒ ★**✗ 清别人**。
		 *  ★`B1`（`dev-10` 复核 · 真伤）：**未知会话 id** ⇒ 返 `0` 且**什么都不清** —— 原版 `?? 本()`
		 *  会**回落成「当前会话」** ⇒ 传一个不存在的 id 反而把**当前会话**清掉（「按会话独立」最常见的用法
		 *  就是按上局 id 清场）⇒ 后果是**测试模式假绿**（该会话在**无控制**下跑）。 */
		clearAll(会话id = 当前会话) {
			const r = 会话表.get(会话id);
			if (!r) return 0;
			const n = r.条目.length;
			r.条目.length = 0; r.未覆盖.clear(); r.场次 = null;
			return n;
		},
		/** 会话 id 列表（诊断用）。★注意 `clearAll()` 缺省清**当前会话**；当前会话若从未建过记录 ⇒ ✗ 有可清之物（返 0）。 */
		会话表: () => [...会话表.keys()].sort(),

		/** **骰序账**（当前会话的历史记录，按发生顺序，含**单调序**；✗ 递内部引用）。 */
		log: () => 本().账.map((x) => ({ ...x })),

		/** **清三账读数**（✗ 动控制面 —— 那是 `clearAll`；本口只把当前会话的**读数**归零）。 */
		清账() {
			const r = 本();
			r.账.length = 0; r.丢账 = 0; r.序号 = 0;      // ★单调序随账一并归零（单调性在**该窗口内**成立）
			r.底层.调用 = 0; r.底层.受控 = 0; r.底层.未受新控制 = 0;
			return true;
		},

		/** **三账读数** ＋ 未消费／未覆盖清单 ＋ **截断标记**（判据与「明报」用）。 */
		报告() {
			const r = 本();
			const 未消费 = r.条目.filter((a) => a.已吃 === 0)
				.map((a) => ({ armId: a.armId, purpose: a.purpose, 原因: '从未匹配到调用点（未定位）' }));
			return {
				会话: 当前会话, 场次: r.场次,
				额度账: r.条目.map((a) => ({
					armId: a.armId, purpose: a.purpose, actor: a.actor ?? null, instance: a.instance ?? null,
					物: a.物 ?? null, slot: a.slot ?? null, 组: a.组 ?? null, sides: a.sides ?? null,
					配置面: a.面数, 已消费: a.已吃, 剩余: a.faces.length,
				})),
				骰序账: r.账.map((x) => ({ ...x })),
				骰序条数: r.账.length,
				/* ★六裁 5：有界必**显式标记截断** ⇒ ✗ 拿截断尾部称全历史；留存范围给**单调序**区间。 */
				截断: {
					已丢: r.丢账,
					留存范围: r.账.length ? [r.账[0].序, r.账[r.账.length - 1].序] : null,
					完整: r.丢账 === 0,
				},
				/* ★冲突 4：受控颗数／未受新控制颗数 与 `unit()` 调用数**分列**（三者不是同一划分）。 */
				底层计数: { unit调用: r.底层.调用, 受控颗数: r.底层.受控, 未受新控制颗数: r.底层.未受新控制 },
				未消费,
				/* ★`F3`／冲突 5：带上**已接入表** ⇒「引擎无此骰点（如先攻）」与「有此点但本包未接入」可分辨。 */
				接入表: [...已接入].sort(),
				未覆盖: [...r.未覆盖].map((p) => ({
					purpose: p,
					原因: '该用途**不在接入表内** —— 或引擎无此骰点（如先攻），或本包未接入 ⇒ 配了也不会生效（见 `接入表`）',
				})),
			};
		},

		/* ───────── 以下为**原语内部口**（✗ 故事 API；`05-dice.js` 用）───────── */

		/** 底层计数＋1（`unit()` 每调一次记一次 —— 与骰序账**分记**；✗ 混入受控颗数）。
		 *  ★`sgstory#2043`（甲案 §二.4「准确归属」）：**按源归属** —— 全局源／无源 ⇒ 记进**当前会话**（旧行为逐字不变 ✓）；
		 *   `RPG.makeRng(...)` 的实例带 `会话` ⇒ 记进**那个会话**；带会话而该会话未立账 ⇒ **不记**别处
		 *   （其自有计数已在 `05-dice.js` 的 `unit()` 里记过 ⇒ ✗ 编两处口径）。 */
		_记底层(源) {
			if (源 && 源 !== RPG.rng) {
				const 该 = 源.会话 == null ? null : 会话表.get(源.会话);
				if (该) 该.底层.调用 += 1;
				return;
			}
			本().底层.调用 += 1;
		},

		/**
		 * **预检**（原子性：**先验后掷**）：一次 `rollDetail(expr, ctx)` 在掷**第一颗**之前，按**消费序**
		 * 逐颗验「该臂**将要吃的那一颗**」⇒ 面数不足／面域越界**整次拒**且**零部分消费**。
		 * ★六裁 6／冲突 3：一条臂可被**同一次表达式的多颗**命中（臂 ✗ 给 `slot`／`组` 时）⇒ 它按 `faces`
		 * **顺序**逐颗喂（`_落` 用 `shift()`）⇒ 预检须用**局部游标**模拟该序（✗ 一律看 `faces[0]`；
		 * 也**✗** 把「臂总面数」硬等于单次表达式 `count`）。游标是局部量 ⇒ 预检**零副作用**。
		 * @returns {boolean} 是否需要**逐颗记账**（有 `purpose` 或**本会话有任何在用控制** ⇒ `true`）
		 *  ★`sgstory#2043`：`_落` 多收**第五参 `源`**（未受新控制时的回退源）；`_预检` ✗ 收（它不掷骰 ✓）
		 */
		_预检(ctx, sides, count) {
			const r = 本();
			const 要记 = (ctx && ctx.purpose) || r.条目.length > 0;
			if (!要记) return false;
			const 游标 = new Map();                       // armId ⇒ 本表达式内**已预占**的颗数
			for (let i = 0; i < count; i++) {
				const c = 定位(ctx, sides, i);
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

		/** 逐颗落骰：命中臂 ⇒ 吃指定面（记账为「受控」）；否则走**正常随机源**（记账为「未受新控制」）。 */
		_落(ctx, sides, slot, 要记, 源) {
			const r = 本();
			const c = (ctx ?? {}).purpose ? 定位(ctx, sides, slot) : null;
			const a = c ? 找(c) : null;
			if (a) {
				const face = a.faces.shift();
				a.已吃 += 1;
				if (a.faces.length === 0) {
					const i = r.条目.indexOf(a);
					if (i >= 0) r.条目.splice(i, 1);
				}
				r.底层.受控 += 1;
				记(c, { face, source: '受控', armId: a.armId });
				return face;
			}
			const face = (源 ?? RPG.rng).pick(sides);   // ★`#2043`：未受新控制 ⇒ 回退走**本次源**（缺省＝全局 ✓）
			r.底层.未受新控制 += 1;
			if (要记) 记(c ?? {}, { face, source: c ? '未受新控制' : '未接入' });
			return face;
		},
	});
})();
