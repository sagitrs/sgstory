/* RPG 核心 —— 存量（Stock）：duration 第五档「消耗依赖」的**机制面**（#1759 §十 定义 / #1777 D1 落码）
 *
 * ## 定义（权威源：`docs/plan/1689-5e-conditions.md` §十 —— **单一权威源**，✗ 在此复述）
 *   档 5「消耗依赖」：**单调递减/累加的量**；**存量归零 ⇒ 触发「耗尽」**。
 *   与档 4（层数递进）的区别：档 4 **可升可降**（exhaustion 0–6），档 5 **单调**。
 *
 * ## 载体（§十.2 甲乙分流 ＋ §十.7-B 裁定）
 *   存量 ⇒ 落 **`stats`**（单调量）；「是/否」二态 ⇒ 落 `effects`。
 *   ★**且必须经包的 `STAT_BLOCK` 声明**（B 裁定：「第 5 档经 STAT_BLOCK 声明 ⇒ 统一覆盖 NPC」）。
 *     本文件把该条**机械化**（✗ 靠约定）：`defStock` 校验 id 出现在
 *     **`Object.keys(def.statBlock)`** 中，否则**抛错** ⇒
 *       ① 「一处走一处不走」在接口上**不可表达**；
 *       ② 用 `Object.keys`（✗ `in`）⇒ 逼出**普通可枚举字符串键** ⇒ 该键**必随 `JSON.stringify` 存活**
 *          （Symbol 键／非枚举属性都会被拒）⇒ `Character.revive()` 后**语义自动存活**（#1759 §十.6「载体形状」/ E11）。
 *     为什么这条要紧：字段进 `STAT_BLOCK` ⇒ 该包**所有**角色（含 NPC）经 `stats()` 自动获得；
 *     且 `Character.revive()` 经 `RPG.onReviveStats` 重建 `stats` 时**自动存活**（#1758 丙形）。
 *
 * ## 边界（§十.7-C 裁定）
 *   **引擎只提供「存量 ＋ 耗尽事件」**；**后果由内容订阅声明**（保引擎通用，与 `Conditions` 可 pin 纯度同哲学）。
 *   ⇒ 本文件**不实现**任何具体后果（不扣 HP／不加条件／不写日志／不判死）。
 *
 * ## 真值方向（§十.7-A 裁定）
 *   「**谁产生谁真值、禁止双写**」——有道具背书（弹药/纳米药剂）⇒ **道具为真值**、角色侧为**派生视图**；
 *   无道具背书（生命维持/真空）⇒ **角色存量即真值**。
 *   ⇒ 本文件只提供**读/减**原语（两侧都可用），**不预设方向**（方向属 D3 消费票）。
 *
 * ## 本档的范围（#1777）
 *   **D1（本笔）**：注册表 ＋ 上述机械强制 ＋ 读/减原语 ＋ 耗尽事件（判据 2/3/4/7 ＋ E2/E3/E4/E11）。
 *   **D2**：`scope` 的清理接线（`battle:end` 清 `'battle'` 档）＋ 战斗通路接入（判据 5/6/8 ＋ E7/E8）。
 *   故 `scope` 在 D1 **只声明与校验**（其消费点见 D2）—— ✗ 视作死字段（同一票内闭环）。
 */

/** 存量注册表：id → 定义（各包共用一张表，同 `RPG.items` / `RPG.effects`） */
RPG.stocks = new Map();

/** 存量面错误（与 `RPG.effectError` 同形：带 `code`，便于调用方与用例断言） */
RPG.stockError = (code, message, extra) => Object.assign(new Error(message), { code }, extra);

/** `scope` 的合法取值（§十.3） */
const STOCK_SCOPES = ['battle', 'persistent'];

/**
 * 声明一条存量（第五档）。推荐形态（与 `defEffect` / `defItem` 同）。
 *
 * def = { id, name?, desc?, scope?, unit?, statBlock, pack? }
 *   id        必填：非空字符串，**不得含「:」**（层级是档 4 的事，见 17-effect 的同款校验）
 *   scope     `'battle' | 'persistent'`（缺省 `'persistent'` ＝**保既有行为**）；消费点见 D2
 *   unit      可读单位（如「发」「小时」）——仅供展示，引擎不用
 *   statBlock **必填**：本包的 `STAT_BLOCK`；`id` 须是它的**普通可枚举字符串键**（见文件头：B 裁定 ＋ E11）
 *   重复 id   ⇒ `console.warn` ＋ 覆盖（与 `defEffect` 一致）
 */
RPG.defStock = (def) => {
	if (!def || typeof def.id !== 'string' || def.id === '')
		throw RPG.stockError('STOCK_BAD_ID', 'defStock 的 id 应是非空字符串');
	if (def.id.includes(':'))
		throw RPG.stockError('STOCK_BAD_ID', `defStock 的 id 不得含「:」（层级是档 4 的事）：${def.id}`);
	const scope = def.scope ?? 'persistent';
	if (!STOCK_SCOPES.includes(scope))
		throw RPG.stockError('STOCK_BAD_SCOPE',
			`defStock「${def.id}」的 scope 应是 ${STOCK_SCOPES.join(' | ')}：${String(scope)}`);
	/* ★B 裁定：必须经 `STAT_BLOCK` 声明（✗ 逐角色旁挂）——否则「统一覆盖 NPC」不成立 */
	if (def.statBlock === undefined || def.statBlock === null || typeof def.statBlock !== 'object')
		throw RPG.stockError('STOCK_NO_STAT_BLOCK',
			`defStock「${def.id}」须给 statBlock（本包的 STAT_BLOCK）—— 存量必须经 STAT_BLOCK 声明（#1759 §十.7-B）`);
	/* ★用 `Object.keys`（✗ `in`）：只接受**普通可枚举字符串键** ⇒ 该键必随 JSON 存活（E11 / §十.6「载体形状」） */
	if (!Object.keys(def.statBlock).includes(def.id))
		throw RPG.stockError('STOCK_NOT_IN_STAT_BLOCK',
			`defStock「${def.id}」不在本包 STAT_BLOCK 的**普通可枚举字符串键**中 ⇒ 须先加为该包的 STAT_BLOCK 字段`
			+ '（#1759 §十.7-B；且须是普通键，Symbol/非枚举会在存档往返后丢失）');
	/* ★§十.4 / 判据 7：存量的命名空间**独立于** Conditions/effects（混入会稀释 pin 纯度＋破坏两层键集守卫） */
	if (RPG.effects.has(def.id))
		throw RPG.stockError('STOCK_ID_COLLIDES_EFFECT',
			`defStock「${def.id}」与既有 Effect（条件）同名 ⇒ 存量须用独立命名空间（#1759 §十.4 / 判据 7）`);
	if (RPG.stocks.has(def.id))
		console.warn(`[RPG] 存量「${def.id}」重复注册：${RPG.stocks.get(def.id).name ?? def.id} 被覆盖。`);
	/* 定义是**元数据**（真值在角色的 `stats` 字段里）⇒ 冻结的普通对象即可，✗ 需实例类 */
	const rec = Object.freeze({ ...def, scope, pack: def.pack ?? null });
	RPG.stocks.set(def.id, rec);
	return rec;
};

/** 读存量值：**直读**角色 `stats` 的字段（✗ 缓存/镜像）—— 真值只在一处（`stats`）。
 *  非数值（未声明/非本包角色）⇒ `null`（✗ 静默给 0：0 是「已耗尽」，语义不同）。 */
RPG.stockOf = (c, id) => {
	const v = c?.stats?.[id];
	return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/**
 * 减存量（本档唯一的**写**原语）。返回**实际扣减量**（`0` ＝已空、一点没扣）。
 *   · 不足 ⇒ 扣到 `0`（✗ 负数）
 *   · **耗尽事件是「由有到无」的边沿，✗ 电平** ⇒ 恰触发**一次**；已为 0 时再减**不再触发**
 *   · 引擎**只发事件**（`stock:depleted`），后果由内容订阅（§十.7-C）
 */
RPG.consumeStock = (c, id, n = 1) => {
	if (!RPG.stocks.has(id))
		throw RPG.stockError('STOCK_UNKNOWN', `未注册的存量：${id}（先 defStock）`);
	if (!Number.isFinite(n) || n < 0)
		throw RPG.stockError('STOCK_BAD_AMOUNT', `consumeStock 的 n 应是非负有限数：${String(n)}`);
	const cur = c?.stats?.[id];
	if (typeof cur !== 'number' || !Number.isFinite(cur))
		throw RPG.stockError('STOCK_NOT_ON_CHARACTER',
			`角色上没有数值存量「${id}」（须经本包 STAT_BLOCK ＋ stats() 构造）`);
	const took = Math.min(n, Math.max(0, cur));
	const next = cur - took;
	c.stats[id] = next;
	/* 边沿判定：`cur > 0 && next === 0` ⇒ 恰一次（✗「next === 0」恒真式——那会在已空时反复触发） */
	if (cur > 0 && next === 0) {
		RPG.events.emit('stock:depleted', { character: c, id, def: RPG.stocks.get(id) });
	}
	return took;
};
