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
 * ## ★A 裁定的落点：`derivedFrom`（D3 补 —— ✗ 双写）
 *   有道具背书者（弹药等）⇒ **道具为真值**、角色侧存量为**派生视图** ⇒ 视图的**唯一写点**是
 *   `RPG.syncDerivedStocks`（按道具**重算**，✗ 各自递减 ⇒ 不会漂移）。
 *   ⇒ 声明侧给 `derivedFrom:{ itemId }`；缺省（无道具背书，如生命维持/真空）⇒ **角色存量即真值**。
 *
 * ## 真值方向（§十.7-A 裁定）
 *   「**谁产生谁真值、禁止双写**」——有道具背书（弹药/纳米药剂）⇒ **道具为真值**、角色侧为**派生视图**；
 *   无道具背书（生命维持/真空）⇒ **角色存量即真值**。
 *   ⇒ 本文件只提供**读/减**原语（两侧都可用），**不预设方向**（方向属 D3 消费票）。
 *
 * ## 本档的范围（#1777）
 *   **D1（PR #1794 已合 `1ee92fb7`）**：注册表 ＋ 上述机械强制 ＋ 读/减原语 ＋ 耗尽事件（判据 2/3/4/7 ＋ E2/E3/E4/E11）。
 *   **D2（PR #1795 已合 `118c689c`）**：`scope` 的清理原语 `clearStocksScoped` ＋ 包侧 `battle:end` 接线（判据 5/6/8 ＋ E7/E8）。
 *   **D3**：三消费者各自消费（三段弹药 `#1731`／四段纳米 `#1732`／五段生命维持 `#1733`）。
 *     ★D3 修正（`#1796` RC）：**「视图唯一写点」的声明曾是假的** —— `clearStocksScoped` 的复位
 *     是**第二写点**，在「派生＋battle 档」组合下会使视图与真值**静默漂移**（已复现）。
 *     ⇒ 修法＝该组合**声明期即不可表达**（见 `defStock` 的 `STOCK_DERIVED_BATTLE`）。
 *   ⇒ `scope` 至此**有消费点**（否则即「声明了不消费」的死字段——本轮闭环）。
 */

/** 存量注册表：id → 定义（各包共用一张表，同 `RPG.items` / `RPG.effects`） */
RPG.stocks = new Map();

/** ★「本场档」的**单一判据**（D3 修正，dev-9 RC 的机械根）：`clearStocksScoped` 用、`defStock` 的
 *  组合校验也用 ⇒ **同一问题只有一个判据**（✗ 两处各写一遍 `.scope === 'battle'` 会各自演化）。 */
RPG.isBattleScoped = (def) => def?.scope === 'battle';

/** 存量面错误（与 `RPG.effectError` 同形：带 `code`，便于调用方与用例断言） */
RPG.stockError = (code, message, extra) => Object.assign(new Error(message), { code }, extra);

/** `scope` 的合法取值（§十.3） */
const STOCK_SCOPES = ['battle', 'persistent'];

/**
 * 声明一条存量（第五档）。推荐形态（与 `defEffect` / `defItem` 同）。
 *
 * def = { id, name?, desc?, scope?, unit?, statBlock, pack? }
 *   id        必填：非空字符串，**不得含「:」**（层级是档 4 的事，见 17-effect 的同款校验）
 *   initial   `scope:'battle'` **必需**：本场结束复位到此值（✗ 猜值）；其他档可选（仅作元数据）
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
	/* ★`initial` 是 `scope:'battle'` 的**复位值**（`clearStocksScoped` 用）⇒ 该档**必需**：
	 *  否则「本场清除」无从实现，只能猜一个值（0？未声明？）⇒ 语义含糊。
	 *  非 battle 档给 `initial` 亦合法（仅作元数据），但给了就须为有限数。 */
	if (scope === 'battle' && !Number.isFinite(def.initial))
		throw RPG.stockError('STOCK_NO_INITIAL',
			`defStock「${def.id}」的 scope 为 battle ⇒ 须给 initial（有限数）——复位值不可猜（#1759 §十.3）`);
	if (def.initial !== undefined && !Number.isFinite(def.initial))
		throw RPG.stockError('STOCK_BAD_INITIAL',
			`defStock「${def.id}」的 initial 应为有限数：${String(def.initial)}`);
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
	/* ★A 裁定：有道具背书者须**显式**声明 `derivedFrom`（否则会被误当「角色即真值」而双写） */
	if (def.derivedFrom !== undefined) {
		const it = def.derivedFrom?.itemId;
		if (typeof it !== 'string' || it === '')
			throw RPG.stockError('STOCK_BAD_DERIVED_FROM',
				`defStock「${def.id}」的 derivedFrom 须为 { itemId: '非空串' }：${JSON.stringify(def.derivedFrom)}`);
	}
	/* ★★D3 修正（dev-9 RC）：`derivedFrom` ＋ `scope:'battle'` **禁止组合**。
	 *  机理：视图的真值是**道具**（不随场清），而 battle 档会把它**复位为 `initial`**
	 *  ⇒ 复位后视图与真值**静默漂移**（本席实测复现：`视图=4/真值=4 → 复位 → 视图=0/真值=4`，
	 *    且**无任何报错**）。⇒ 修法＝**声明期即不可表达**（与 B 裁定「一处走一处不走」同手法），
	 *    ✗ 靠「复位时顺带 sync 一下」——那只是把第二写点搬个地方，视图仍可被别的路径写。 */
	if (def.derivedFrom !== undefined && RPG.isBattleScoped({ scope }))
		throw RPG.stockError('STOCK_DERIVED_BATTLE',
			`defStock「${def.id}」不得同时给 derivedFrom 与 scope:'battle' —— 派生视图的真值在道具（不随场清），`
			+ '复位会使其与真值静默漂移（#1796 RC／#1759 §十.7-A：禁双写）');
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

/**
 * 战斗结束清理（`scope:'battle'` 的存量**复位为 `initial`**；`persistent` 不受影响）。
 *
 * ★与条件面的 `DND5E.clearBattleScoped`（`conditions.js:188`）**平行且同判据**：
 *   `def.scope !== 'battle' ⇒ 保留`（缺省即 `persistent` ⇒ 自动走「保留」⇒ 不破既有行为）。
 * ★core **不认识任何包/条件**：本函数只按 `RPG.stocks` 的定义办事；接线由**各自**的订阅方负责（§十.7-C 同哲学）。
 *
 * ★★`pack` 参数是**归属过滤**（D2 实测补入——本席的突变电池抓出的真洞）：
 *   首版**无此参** ⇒ 首个触发的订阅方会**代清所有包**的存量 ⇒ 每个包的接线**都不是承载路径**
 *   （实测：拔掉 5E 的 `battle:end` 接线，5E 存量**照样被 3E 的订阅清掉** ⇒ 那条接线是**死码**、用例恒绿）。
 *   ⇒ 与 B 裁定同精神（「一处走一处不走」不可表达）：**各包只清自己声明的**。
 *   形：`pack === undefined` ⇒ 清**全部**（手动/测试用，兼容无参调用）；
 *       `pack === null` ⇒ 只清**无包归属**的（core 级，由 core 自身订阅）；
 *       `pack === '<名>'` ⇒ 只清 `def.pack === '<名>'` 的。
 * ★复位（✗ 删除字段）：存量字段由 `STAT_BLOCK` 声明 ⇒ 该键**必须继续存在**。若 `delete`：
 *   ① 破坏 `#1697` U9「数值块键集精确相等」守卫；② 读原语从「已耗尽 `0`」退化为「本角色无此存量 `null`」
 *   ——**两者语义不同**（§十.3 三态要求可分辨）。故置回初值。
 *
 * 返回**被复位的 id 列表**（读数用；✗ 只返布尔——「清了几条」正是判据 6 要的读数）。
 */
RPG.clearStocksScoped = (c, pack = undefined) => {
	const reset = [];
	const stats = c?.stats;
	if (!stats || typeof stats !== 'object') return reset;   // 无 stats ⇒ 无事可做（✗ 抛错：容器/跨包角色参战是常态）
	for (const [id, def] of RPG.stocks) {
		if (!RPG.isBattleScoped(def)) continue;               // persistent（含缺省）⇒ 保留（判据见 `isBattleScoped`）
		if (pack !== undefined && def.pack !== pack) continue; // ★归属过滤：只清本包声明的
		if (Object.keys(stats).includes(id)) stats[id] = def.initial;
		else continue;                                        // 该角色没这个存量（跨包角色）⇒ 不碰（✗ 凭空加字段）
		reset.push(id);
	}
	return reset;
};

/* 接线（core 只订阅**自己**那一档：无包归属的存量）。各包订阅自己那档（见各包 `00-init.js`）——
 * 两条路径**各自承载**：拔掉任一条，只影响该档 ⇒ 突变可判（D2 实测：首版无此分档 ⇒ 拔掉包侧接线仍绿）。 */
RPG.events.on('battle:end', ({ players = [], enemies = [] } = {}) => {
	for (const c of [...players, ...enemies]) {
		if (c instanceof RPG.Character) RPG.clearStocksScoped(c, null);
	}
});

/** 本存量是否**有道具背书**（⇒ 角色侧是派生视图，真值在道具上）。 */
RPG.isDerivedStock = (def) => typeof def?.derivedFrom?.itemId === 'string' && def.derivedFrom.itemId !== '';

/** 取「角色持有的某道具**总存量**」——口径**逐字同** `RPG.take`（非堆叠每槽 1；堆叠按 `charges`），
 *  ✗ 另立一套（两处口径若不同 ⇒ 按真值重算出来的视图与实际扣减**必然漂移**）。 */
RPG.heldTotal = (character, itemId) => {
	const list = Array.isArray(character?.items) ? character.items : null;
	if (list == null) return null;                       // 无背包 ⇒ 取不出真值（✗ 猜 0）
	return list.reduce((s, it) => s + (it.id === itemId ? (it.charges ?? 1) : 0), 0);
};

/**
 * 按**道具侧真值**重算某角色的派生视图（A 裁定唯一写点 ⇒ ✗ 双写）。
 *
 * ★归属口径：取 `character.items` —— 与 `RPG.take(id, n, actor)` 的 `actor.items` **同一口径**；
 *   且 `RPG.take` 在**省略 `actor`** 时按**身份**（谁的 `items` 就是被扣的那个数组）反解归属（D3 修正，
 *   见其注），✗ 用 `playerActor()` 的属性去猜（`#1743` 跨包同名遮蔽）。
 *   仍解析不出（无角色持有该数组）⇒ 事件 `actor=null` ⇒ 此处**不猜、直接跳过**。
 * ★幂等：同状态重算 ⇒ 同值（可反复调用）。
 * 返回被改写的存量 id 列表（读数用）。
 */
RPG.syncDerivedStocks = (character, itemId) => {
	const stats = character?.stats;
	if (!stats || typeof stats !== 'object') return [];
	const done = [];
	for (const [id, def] of RPG.stocks) {
		if (!RPG.isDerivedStock(def) || def.derivedFrom.itemId !== itemId) continue;
		if (!Object.keys(stats).includes(id)) continue;   // 本角色无此存量（跨包角色）⇒ 不碰（✗ 凭空加字段）
		const total = RPG.heldTotal(character, itemId);
		if (total == null) continue;                      // 取不出真值 ⇒ 保留现值（✗ 归零）
		stats[id] = total;
		done.push(id);
	}
	return done;
};

/* 接线：`inventory:changed`（core 在 `RPG.take` **成功**时发）⇒ 重算派生视图。
 * ★引擎**只发事件、✗ 不解释**「哪些 id 算弹药」——那属内容（§十.7-C 同哲学）。
 *
 * ⚠ **此处曾有一道 `if (actor == null) return;` 前置守卫，已删**（D3 实测更正）。
 *   当初以为它是「归属不明 ⇒ 不猜」的承载点；但**它谁也不承载**：`syncDerivedStocks` 对 null 角色
 *   由构造即安全（`character?.stats` 取不到 ⇒ `stats` 非对象 ⇒ 开头即 `return []`）。
 *   本席的突变电池抓出它：删掉 ⇒ **全量单测逐字不变**（`fail=0`）⇒ 是**冗余层**（死代码）。
 *   ⇒ 与 `#1793` 同族处理：**删**并在此留痕，✗ 静默删（否则后人会重新加回"防御性"的空守卫）。 */
RPG.events.on('inventory:changed', ({ id, actor } = {}) => RPG.syncDerivedStocks(actor, id));
