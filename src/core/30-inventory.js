/* RPG 核心 —— 背包与使用系统（SugarCube State 与道具实例之间的桥）
 *
 * $inventory 里存的是纯数据快照 [{id, charges, equipped}, ...]，
 * 一切修改都通过本模块进行，故事代码不需要关心还原/扣次数等细节。
 */

const inv = () => {
	const vars = State.variables;
	if (!Array.isArray(vars.inventory)) vars.inventory = [];
	return vars.inventory;
};

/** 发放道具（同 id 可叠加时会合并剩余次数）；`n < 0` ⇒ 消耗，走 `RPG.take`。
 *  ★`#1877` N-2：增减**可读提示**（`＋n 名` 一行，走正常输出通道）——「凭空多出又莫名减少」不可理解。
 *  ⚠ 只在**数量净变化**时出声（首投建槽／纯合并都算；`n===0`／投递 0 件不出声）。 */
/** ★`#1877` P1-5①（`dev-9` 阻断①折）：**「可叠加」判据的单点**。
 *   三处投递（`give` 玩家路／`deliverYields` 同伴路／`loot` 快照转移）都问这一个谓词 ——
 *   ✗ 各写一遍（那正是 `#1844` 的教训：同判据多处副本 ⇒ 改一处留三处）。
 *   ⚠ 判据＝`stackable **且** charges != null`（两者缺一即「每件一个独立条目」，如 `iron-key`）。 */
RPG.canStack = (def) => def?.stackable === true && def?.charges != null;

/** ★`sgstory#2023`（E1 · 设计 §3.2）：**堆叠兼容不只比较 id** —— 还要比较**所有影响结算的状态**
 *  （本笔这一层＝状态载荷 `state`）。⇒ 取「状态键」用于比较：无状态用 `∅`。
 *  ⚠ 键形用 `JSON.stringify`（键序由写入方与规整器固定 ⇒ 同构载荷同键）；✗ 不做深比较器（不必要）。 */
RPG.itemStateKey = (件) => (件?.state == null ? '∅' : JSON.stringify(件.state));
/** 两件的状态是否**兼容**（可同槽）；★状态不同 ⇒ 不得合并（各自独立条目、各自保号）✓ */
RPG.stateCompatible = (a, b) => RPG.itemStateKey(a) === RPG.itemStateKey(b);

/**
 * **投递的唯一实现**（`#1877` P1-5① —— `dev-9` 两轮阻断后收敛到此）：把件放进**任意背包**。
 *
 * 三处调用者**都走这里**（✗ 各处自写 —— 前两轮正是「同判据多副本 ⇒ 改一处留两处」）：
 *   · `RPG.give`（玩家发放）—— 造**新件**；N-2 的「＋n 名」提示**留**在调用方（此处静默）
 *   · `RPG.deliverYields` 的同伴/怪物路 —— 造**新件**（其「采得」文案在调用方）
 *   · `RPG.loot` 的战利品转移 —— **转移快照本身**（传 `snapshot`），保留**剩余次数**
 *
 * ★**两形态由参数显式表达**（✗ 靠调用方各自实现）：
 *   · `snapshot == null` ⇒ **造新件**：可叠加 ⇒ 单槽 `charges = def.charges * n`；否则逐件 `def.toJSON()`
 *   · `snapshot != null` ⇒ **转移快照**：可叠加 ⇒ 并进同类槽（件数取 `snapshot.charges ?? def.charges ?? 1`，
 *     并**补写 `charges`** —— 敌方快照常是裸 `{ id }`，不补则显示层认不出 `×N`）；否则原样 `push(snapshot)`
 *
 * ⚠ **为何快照不按 `def.charges` 重造**：那会把「用过的绷带」（快照 `charges: 1`）**回满**成 2 ⇒ 件数造假。
 *   有反例格钉住（`item-delta.test.js`）。
 *
 * @param bag      目标背包数组（玩家 `$inventory`／同伴/怪物的 `items`）
 * @param id       道具 id
 * @param n        件数（正整数；调用方已校验）—— `snapshot != null` 时按 1 调用（逐件转移）
 * @param snapshot 快照（**转移**语义）；缺省 ⇒ **造新件**
 * @returns number 实际入包件数
 */
/** ★`#1914`：入包**保号** —— 缺则补发、有则**原样保留**（✗ 重发：重发会让「同一件东西」换号）。
 *   ⚠ 本席**更正**交接简报里的一句旧话：曾写「`loot` 转移快照须**重发**」—— 错的。号源全局唯一，
 *   转移不产生碰撞；重发只会破坏同一性（判据④钉住「已有的号不许被换掉」）。 */
const 保号 = (snap) => {
	/* ★`#1924`：入包出口补**实体身份** `entityId`。⚠ 有号⇒**原样保留**（✗ 重发：那会让同一件换号）；
	 *   无号⇒补发。旧名 `slotId` **只在读取处认**（旧档/旧调用形），✗ 不写回落成数据。 */
	const src = snap ?? {};
	const 身份 = src.entityId ?? src.slotId ?? RPG.newEntityId();
	if (src.entityId != null || src.slotId != null) RPG.noteEntityId(身份);   // ★有号**也**顶高水位
	const 出 = { ...src, entityId: 身份 };
	delete 出.slotId;                                 // ★一个量一个名（旧名到此为止）
	/* ★`sgstory#2023` 首轮 RC（**真伤**，领队实测指出）：**状态载荷须深拷**。
	 *   浅拷（`{ ...src }`）会让「切出的那一件」与原槽**共用同一个 `state` 对象** ⇒ 改一件另一件跟着变
	 *   ⇒「同 id 不同状态 ⇒ 不合并」的判据**从此不红**（两槽状态恒等 ⇒ 恒兼容）＝判据失效。
	 *   ⚠ 修在**本处（唯一的入袋口）**：`deposit` 的三处 push ＋ `splitStack` ＋ `backfillItemIdentity`
	 *     全经此函数 ⇒ ✗ 只修 `splitStack` 一处（那会留下同形的另几处 —— `#1844` 的教训）。 */
	if (出.state !== undefined) 出.state = RPG.normalizeItemState(出.state);
	return 出;
};

/**
 * ★`#1924`：**旧档实体身份补发**（幂等）—— 把「无身份」的件快照**就地**补齐
 *   （`entityId` ＋ `definitionId` ＋ `slotId` 别名，三者同源）。
 *
 * 动因：旧档（本笔之前存的）里只有 `{id, charges, equipped}`。若只在 `reviveItem` 里**临时**补号，
 *   **盘上那份**仍无身份 ⇒ 审计面（`envelope().audit()`）与逐件对账看不出「是两件里的哪一件」。
 *
 * ⚠ **幂等**：已在位者原样跳过（重跑零变化）—— 故**反复调用安全**（读档钩子、判据都可调）。
 * ⚠ **不改格式版本**：`entityId`／`definitionId` 是**派生可缺**的字段（旧读者忽略、新读者补发）
 *   ⇒ 不构成存档格式变更，`VERSION` 不动（判据：跑两遍本函数，第二次返回 0）。
 * ⚠ 只扫**件的两个落点**（当前背包 ＋ 已登记角色的 `items`）—— ✗ 扫全世界（那会把非件的对象也改）。
 * @returns number 本次实际补发的件数（0 ⇒ 无变化）
 */
RPG.backfillItemIdentity = () => {
	let 补 = 0;
	const 扫 = (bag) => {
		if (!Array.isArray(bag)) return;
		for (let i = 0; i < bag.length; i += 1) {
			const s = bag[i];
			if (s == null || typeof s !== 'object' || Array.isArray(s)) continue;
			if (typeof s.id !== 'string') continue;                     // ✗ 不是件（别把别的对象当件改）
			/* ★`sgstory#1935` ①（跨档稳定）：**先顶水位，再判要不要补** ——
			 *   原先"已在位"的行**直接 `continue`** ⇒ 不调 `noteEntityId` ⇒ 读档之后、件被取用之前
			 *   水位仍是 0 ⇒ 这时新拾取发号 = `it-1`，与**档里已有的 `it-1`** 撞号 ✗（即"跨档不稳定"的真身）。
			 *   ⚠ 水位仍住**模块级**（✗ 不写 `State`）—— `10-item.js:48-54` 的「被拒 ⇒ 存档面零变化」那条判据不动 ✓。 */
			const 见号 = s.entityId ?? s.slotId ?? null;
			if (见号 != null) RPG.noteEntityId(见号);                    // ★有号**也**顶（补与不补都顶）
			if (s.entityId != null && s.slotId === undefined) continue;   // 已在位（新名在、旧名已清）
			bag[i] = 保号(s);
			补 += 1;
		}
	};
	扫(inv());                                   // ★走本档既有取袋口（✗ 再写一处 `State.variables`：触点棘轮）
	for (const c of RPG.characters?.values?.() ?? []) 扫(c?.items);
	return 补;
};

/**
 * ★`sgstory#1935` ③·**(甲)**（领队 2026-10-04 02:59 裁）：**读档归一** —— 同槽**恰一件** `equipped`。
 *
 *   · **写口不动**：`RPG.slotEquip` 遇占槽者仍**显式拒绝**（`return false` ＋「先卸下它」）⇒
 *     玩家可见行为**不变** ✓、故事 `L20-armory` 的「收进背包（槽被占）」分支仍可达 ✓（＝裁 (甲) 的理由 ✓）。
 *   · 本函数只处理**能进来的那一种**：旧档／手改档里**同槽多件都 `equipped: true`** ✗ ⇒ 归一为
 *     **只留「最后一件」**（按袋内**数组序** ✓），其余卸下 ⇒ 「谁在装备」＝**最后一件** ✓（✗ 按数组首个）。
 *   · **幂等**：再跑一遍 ⇒ 0 变化 ✓（判据要能断这个 ✓）。
 *   · ⚠ 读槽要构造一次定义（`createItem` 会发号）—— 那是**读路径发号**，本仓既有事实
 *     （`10-item.js:48-54` 明说不把水位写进 `State`，正因如此）⇒ 不影响「被拒 ⇒ 存档面零变化」✓。
 * @returns number 本次**卸下**的件数
 */
RPG.normalizeEquipped = () => {
	let 卸 = 0;
	const 槽名 = (s) => { try { return RPG.createItem(s.id)?.slot ?? null; } catch { return null; } };
	const 扫 = (bag) => {
		if (!Array.isArray(bag)) return;
		const 末 = new Map();                                  // 槽 ⇒ **最后一件**的下标
		for (let i = 0; i < bag.length; i += 1) {
			const s = bag[i];
			if (s == null || typeof s !== 'object' || s.equipped !== true) continue;
			const 槽 = 槽名(s);
			if (槽 != null) 末.set(槽, i);
		}
		for (let i = 0; i < bag.length; i += 1) {
			const s = bag[i];
			if (s == null || typeof s !== 'object' || s.equipped !== true) continue;
			const 槽 = 槽名(s);
			if (槽 == null) continue;                           // ✗ 不是可装备的 ⇒ 不碰
			if (末.get(槽) !== i) { s.equipped = false; 卸 += 1; }
		}
	};
	扫(inv());                                   // ★同补发：走本档既有取袋口（✗ 再写一处 State 触点）
	for (const c of RPG.characters?.values?.() ?? []) 扫(c?.items);
	return 卸;
};

RPG.deposit = (bag, id, n = 1, snapshot = null) => {
	const def = RPG.createItem(id);
	const each = snapshot == null ? null : (snapshot.charges ?? def.charges ?? 1);   // 快照件数口径（同 `take`）
	if (RPG.canStack(def)) {
		/* ★`sgstory#2023`（设计 §3.2）：**同 id 但状态不同 ⇒ 不并槽**（各起一条、各自保号）。
		 *   来态＝快照给的 `state`（转移路）或定义的 `state`（造新件路）✓ —— ✗ 只按 id 找槽。 */
		const 来态 = { state: snapshot != null ? (snapshot.state ?? null) : (def.state ?? null) };
		const slot = bag.find((s) => s.id === id && RPG.stateCompatible(s, 来态));
		if (snapshot != null) {
			if (slot) { slot.charges = (slot.charges ?? 0) + each; return each; }
			bag.push(保号({ ...snapshot, charges: each }));
			return each;
		}
		if (slot) { slot.charges += def.charges * n; return def.charges * n; }
		bag.push(保号({ ...def.toJSON(), charges: def.charges * n }));
		return def.charges * n;
	}
	// 新品逐件出生，不能把同一个 def.entityId 复制到多件非堆叠物上（sgstory#2008）。
	for (let i = 0; i < n; i++) {
		const fresh = snapshot == null ? (i === 0 ? def : RPG.createItem(id)).toJSON() : snapshot;
		bag.push(保号(fresh));
	}
	return n;
};

/** ★`sgstory#2023`（E1 · 设计 §3.3）：**批次按身份切分** —— 把某件（按 `entityId` 定位）切出 `n` 份，
 *  成**独立一件**。身份规则（本笔裁定，须与 §3.3「✗ 不把一个实体号复制给多件独立装备」一致）：
 *  ★**切出的新件发新号**，**留在原槽的那份沿用原号**。
 *  ⚠ 只对**可叠加件**成立（`charges != null`）：非叠加件「切分」＝另造一件同定义的新件 ⇒
 *    那会把「两件同类」写成「一件裂成两半」⇒ 具名拒 `STACK_SPLIT_NOT_STACKABLE`。
 *  ⚠ 非法入参一律**零变化**（先用 `findIndex` 与前置校验判完，再动 `charges`）✓。
 *  ⚠ 状态载荷随件走（拷贝）⇒ 切出那件与原槽状态**相同**（这正是「同状态才并槽」的另一面）✓。
 * @returns {object} 切出的那件**快照**（已入袋）；失败即抛 `RPG.refuse('STACK_SPLIT_*', …)`
 */
RPG.splitStack = (bag, entityId, n) => {
	if (!Array.isArray(bag)) throw RPG.refuse('STACK_SPLIT_BAG', 'splitStack：第一参须是背包数组');
	if (!Number.isInteger(n) || n < 1) {
		throw RPG.refuse('STACK_SPLIT_COUNT', `splitStack：切出件数须为正整数（收到 ${String(n)}）`, { n });
	}
	const i = bag.findIndex((s) => s?.entityId === entityId);
	if (i < 0) throw RPG.refuse('STACK_SPLIT_NOT_FOUND', `splitStack：袋里没有实体号 ${String(entityId)} 的件`, { entityId });
	const slot = bag[i];
	if (slot.charges == null) {
		throw RPG.refuse('STACK_SPLIT_NOT_STACKABLE', `splitStack：实体号 ${String(entityId)} 不是可叠加件（charges 为 null）⇒ 切分不适用`, { entityId });
	}
	if (n >= slot.charges) {
		throw RPG.refuse('STACK_SPLIT_WHOLE', `splitStack：切出 ${n} 份 ≥ 该槽 ${slot.charges} 份 ⇒ ✗ 不动（整件转移走别的口，切分只切小于余量）`, { n, 余: slot.charges });
	}
	slot.charges -= n;                                                        // 余量留在原槽（沿用原号）
	const 新件 = 保号({ ...slot, charges: n, entityId: RPG.newEntityId() });  // ★新号（✗ 复制原号）
	bag.push(新件);
	return 新件;
};

RPG.give = (id, n = 1) => {
	const def = RPG.createItem(id); // 读默认定义（次数、可否叠加）
	if (!Number.isInteger(n)) throw new Error(`RPG.give 的 n 须为整数（收到 ${n}）——次数计数不允许小数`);
	if (n < 0) return RPG.take(id, -n); // 负数即消耗，见 RPG.take
	if (n === 0) return;
	/* ★`#1877` P1-5①：投递收敛到 `RPG.deposit`（**唯一实现**）—— 本函数只管**归口 ＋ 提示**。
	 *   ⚠ 提示**只在此处**（`deposit` 保持静默）：`deliverYields` 有自己的「采得」文案 ⇒
	 *     提示若放进 `deposit`，采集时会**双份**（本席按此分工，✗ 让两处都出声）。 */
	const gained = RPG.deposit(inv(), id, n);
	if (gained > 0) RPG.perform(`＋${gained} ${def.name}`);   // p13: 非本两面（得/失流水 ⇒ 高频，✗ 「必须看到」的结论行 ✓）
};

/**
 * 消耗道具（`RPG.give(id, -n)` 的实现，亦可直接调用）。
 * 语义（#1736）：
 *   - 按 id **从后往前**扣减：先扣堆叠槽的 `charges`，再整槽移除（不产生「charges ≤ 0 的残槽」）。
 *   - **不足则整体不生效**并返回 `false`（防「扣到负数」，也不做部分扣减——原子性）。
 *   - 非堆叠道具（`charges == null`）每个槽计 1 件。
 * @returns {boolean} 是否成功扣减（不足 / n ≤ 0 ⇒ false 且状态不变）
 */
RPG.withdraw = (list, id, n = 1) => {
	if (!Number.isInteger(n)) throw new Error(`RPG.withdraw 的 n 须为整数（收到 ${n}）`);
	if (!(n > 0) || !Array.isArray(list)) return false;
	/* 先算总量（非堆叠每槽 1；堆叠按 charges）——不足则不动状态 */
	const total = list.reduce((s, slot) => s + (slot.id === id ? (slot.charges ?? 1) : 0), 0);
	if (total < n) return false;
	let left = n;
	for (let i = list.length - 1; i >= 0 && left > 0; i--) { // 从后往前，保持既有槽位不变动
		const slot = list[i];
		if (slot.id !== id) continue;
		if (slot.charges == null) { list.splice(i, 1); left -= 1; continue; }
		const use = Math.min(slot.charges, left);
		slot.charges -= use;
		left -= use;
		if (slot.charges <= 0) list.splice(i, 1); // 用尽即移除槽，不留 charges=0 残槽
	}
	return true;
};

/** 对真实角色背包扣减并通知；withdraw 是 exchange 暂存背包复用的静默原语。 */
RPG.take = (id, n = 1, actor = null) => {
	if (!Number.isInteger(n)) throw new Error(`RPG.take 的 n 须为整数（收到 ${n}）`);
	const list = actor ? (Array.isArray(actor.items) ? actor.items : null) : inv();
	if (!RPG.withdraw(list, id, n)) return false;
	/* ★成功扣减 ⇒ 广播（#1731 D3：**道具侧真值变动**的可观测点）。
	 *  引擎只发事件、✗ 不解释「哪些 id 算弹药」——那属内容（§十.7-C 同哲学）。
	 *  ⇒ 有道具背书的存量（A 裁定：道具为真值）在此处**重算其派生视图**，✗ 各自递减（禁双写）。 */
	/* ★归属解析（D3 修正，tester-4 RC 的**通路 2**）：省略 `actor` 时扣的是 `inv()`（旧行为，签名不动）
	 *   ⇒ 视图一侧认不出归属 ⇒ 真值/视图静默漂移（实测：`inv()` 真值 38 vs 视图 40）。
	 *  **按身份解析**：谁的 `items` **就是**刚被扣的那个数组，谁就是归属（✗ 回到调用方要传参，
	 *   也 ✗ 用 `playerActor()` 的名字/属性去猜 —— 后者有 `#1743` 的跨包同名遮蔽：两包都以 `id:'player'` 注册）。
	 *   解析不出（无角色持有该数组）⇒ `actor=null` ⇒ 订阅方**不动视图**（与「归属不可判 ⇒ 不猜」同口径）。 */
	const owner = actor ?? [...(RPG.characters?.values?.() ?? [])].find((c) => c?.items === list) ?? null;
	RPG.events.emit('inventory:changed', { id, n, actor: owner });
	/* ★`#1877` N-2：**减量可见**（与 `RPG.give` 的 `＋n 名` 同形、同频）。
	 *   动因（操作者复测）：「采集后碎石堆又莫名 -1，增减规则对玩家不可见」。
	 *   ⚠ 只在**成功**扣减后出声（✗ 不足返回 false 的那条路 —— 那没有任何变化）。 */
	const named = RPG.items.has(id) ? RPG.createItem(id).name : id;
	RPG.perform(`－${n} ${named}`);   // p13: 非本两面（得/失流水 ✓，同上）
	return true;
};

/** **弹药是否不足**（只读**预判**，#1773）—— 供战斗侧在**选靶之前**判「这一手打不打得出去」。
 *
 *  为何需要它：`Battle` 的选靶 `pick(foes)` 会耗一个 `RPG.rng` 读数（`rng.index()` 每次读 `unit()`），
 *  若「先选靶、后被 `RPG.act` 拒」，则 `#1773` 的「拒绝 ⇒ 不耗 rng」不成立。
 *  ⇒ 本谓词把「够不够」**前置**成只读判定，与 `act` 闸门**同口径**：
 *     量口径取 `RPG.heldTotal`（其 reduce 形与 `RPG.take` 逐字相同 —— 见两处注释）。
 *  `item` 可为实例（快照）或 id 串；取不到 `stats.ammo` 定义 ⇒ 视为**不需弹药**（✗ 不误判为短）。 */
RPG.ammoShort = (actor, item, action = 'use') => {
	const id = typeof item === 'string' ? item : item?.id;
	if (typeof id !== 'string' || id === '') return false;
	const def = RPG.createItem(id);                       // 注册定义（含 stats）；快照实例可能缺 stats
	const ammo = def?.stats?.ammo;
	if (action !== 'use' || !ammo) return false;          // 非 use 或该件不需弹药 ⇒ 不短
	const need = ammo.perShot ?? 1;
	const have = RPG.heldTotal(actor, ammo.id);           // null（无背包/未声明）⇒ 判短
	return have == null || have < need;
};

/** 是否持有某道具 */
RPG.has = (id) => inv().some((s) => s.id === id);

/** 某道具当前是否已装备（剧情条件判断用） */
RPG.isEquipped = (id) => inv().some((s) => s.id === id && s.equipped);

/** 某装备槽当前已装备的道具（还原实例；没有则 null）。槽见 Item.slot。 */
RPG.equippedIn = (slotName) => {
	const s = inv().find((x) => x.equipped && RPG.reviveItem(x).slot === slotName);
	return s ? RPG.reviveItem(s) : null;
};

/** 当前已装备的武器（'weapon' 槽的便捷读取） */
RPG.equippedWeapon = () => RPG.equippedIn('weapon');

/* ---------- 共享动作库：任何道具都可在 actions 里直接引用 ---------- */

/**
 * 装备动作（槽位感知）：给道具打上 equipped 标记。
 * **同槽互斥**——该槽已有其他装备时失败（提示先卸下），不自动换装；
 * 不同槽（武器/身体/脚……）互不影响，可以同时装备。
 */
RPG.slotEquip = function slotEquip() {
	/* ★ 失败须**显式 `return false`**（`#1783`）：`#1776` 的动作契约是——`undefined` ＝ 成功、
	 *   **只有 `=== false` 才算拒绝**。本函数原先两处失败都写 `return;`（undefined）⇒ 被算作
	 *   `applied` ⇒ **装备失败不可判**（`RPG.act` 的调用方拿到的 status 恒为 applied）。
	 *   ⇒ 现改 `return false`，失败即走 `rejected/action-refused` 面（提示文案不变）。
	 *   ⚠ 同一处纪律的反面：**幂等成功仍返回 `undefined`**（见下第四种情形的注）。 */
	if (this.slot == null) {
		this.perform(`「${this.name}」不是可装备的物品。`, { channel: 'equip' });   // ★P1-3：装备类 ✓
		return false;
	}
	const current = RPG.equippedIn(this.slot);
	if (current && current.id !== this.id) {
		this.perform(`「${current.name}」正占着${RPG.slotLabels[this.slot] ?? this.slot}槽——先卸下它。`, { channel: 'equip' });
		return false;
	}
	/* ★**同槽同件**（`current.id === this.id`）⇒ 落到此处 ⇒ 幂等：把已装备的再装一次**不是失败**
	 *   （✗ 不返回 false —— 否则玩家点两次会看到「失败」提示）。故本函数有且仅有**两处** `return false`。 */
	this.equipped = true;
	this.perform(`你装备了「${this.name}」。`, { channel: 'equip' });
};

/** 卸下动作：清除 equipped 标记（未装备时是静默空操作）
 *
 * ★**「未装备就卸」是有意的幂等成功，✗ 不是漏改**（`#1783` 三席评审点名：本函数原先无任何注释，
 *   读者无从判断「有意幂等」还是「忘了写 `return false`」）。契约依据：
 *     ① 语义上**无事可做 ＝ 已达成目标**（与 `slotEquip` 的「同槽同件重装 ⇒ 幂等」**同一判据**）；
 *     ② 可达性：`unequip` 挂 26 处真件，但战斗交互通路（`40-battle.js`）**只在 `item.equipped` 时
 *        才出该选项**、`#1799` C1 的 `toggleEquip` 亦先判 `isEquipped` ⇒ **正常路径不会 dispatch 未装备的
 *        unequip**（只在「接口可被如何用」的意义上存在）。
 *   ⇒ **保持 `undefined`（成功）**，✗ 不得改成 `return false`（那会把幂等成功误报为失败）。
 *   ⚠ 对照：`slotEquip`／`throwItem` 的失败分支**有拒绝文案** ⇒ 那是**真拒绝** ⇒ `return false`。 */
RPG.slotUnequip = function slotUnequip() {
	if (!this.equipped) return;
	this.equipped = false;
	this.perform(`你卸下了「${this.name}」。`, { channel: 'equip' });
};

/**
 * 投掷动作（#1736）：把武器**掷出**——执行攻击后从背包移除该武器。
 *
 * 解析点：读 `this.stats.thrown`（非空才可投）——这是该字段的**消费点**；
 *   无 `Thrown` 特性的武器拒绝投掷（否则 `thrown` 仍是死键，D 席「旋钮生效链」不成立）。
 *
 * SRD 依据：Thrown「you can throw the weapon to make a ranged attack, and you can draw that
 *   weapon as part of the attack. If the weapon is a Melee weapon, use the same ability modifier
 *   for the attack and damage rolls that you use for a melee attack」（pin: equipment.md:84）。
 * 故此处**不复制判定数学**：仍走道具自己的 `used`（近战武器的 Finesse/力量口径本就与 SRD 一致）；
 * 本动作只负责「掷出后离开背包」这一后果。
 *
 * 用法：道具声明 `actions: { throw: RPG.throwItem }`。
 */
RPG.throwItem = function throwItem(that, from) {
	/* ★失败须**显式 `return false`**（`#1783` —— 与 `slotEquip` **同族、同层、同契约**）：
	 *   本条有**明确的拒绝文案**（「没有 Thrown 特性，不能投掷」）⇒ 语义上就是**拒绝**，
	 *   ✗ 不能是 `undefined`（那会被 `#1776` 契约算作 `applied` ⇒ 调用方判不出失败）。
	 *   ⚠ 可达性：唯一挂 `throw:` 的真件是 `dagger`，而它有 `thrown: '20/60'` ⇒ 该分支**对真内容面
	 *   不可达**；但**接口必须正确**（与 `slotEquip` 的「不是可装备物」分支**同一判据、同一适用**）。 */
	if (this.stats?.thrown == null) {
		this.perform(`「${this.name}」没有 Thrown 特性，不能投掷。`, { channel: 'item-refuse' });   // ★P1-3：用法拒绝 ✓
		return false;
	}
	this.used(that, from); // 先掷（走该武器的既有攻击路径），再离手
	RPG.take(this.id, 1); // 掷出即离开背包（SRD：thrown 武器经投掷使用）
};

/** 槽位中文名表（提示文案用）。core 不认识具体槽名——由规则包补全：
 *  RPG.slotLabels.weapon = '武器' 之类。 */
RPG.slotLabels = {};

/**
 * 战利品结算：把目标（Character / Chest）身上**未装备**的道具转移给玩家。
 * 规则：物品会掉落；装备与技能不会掉落。
 */
RPG.loot = (victim) => {
	const slots = victim.items;
	if (!Array.isArray(slots) || slots.length === 0) return;
	const dropped = slots.filter((s) => !s.equipped);
	if (dropped.length === 0) return;
	const names = dropped.map((s) => RPG.reviveItem(s).name);
	for (const s of dropped) {
		/* ★`#1877` P1-5①：**掉落走同一投递**（✗ 原形无条件 `push` ⇒ `coin` 永不合并，
		 *   而 `coin` 的**唯一**来源就是本函数 ⇒ `#1880` 的计数库存形落不了地）。 */
		/* ★`#1877` P1-5①（`dev-9` 阻断① · 领队裁甲形）：**收敛到 `RPG.deposit` 的快照形** ——
		 *   本函数不再自写合并逻辑（✗ 同判据多副本）。`snapshot` 形会保留**剩余次数**（✗ 回满）。 */
		RPG.deposit(inv(), s.id, 1, s);
		slots.splice(slots.indexOf(s), 1);
	}
	/* `#1798` B4：产出是**结论行** ⇒ 走 `loot` 通道（`key`）。 */
	RPG.perform(`你获得了：${names.join('、')}。`, { channel: 'loot' });
};

/**
/**
 * 使用道具（**玩家背包**语义的薄壳）——保留原签名与返回值，内部走统一入口 `RPG.act`。
 *
 * 为何保留：战外/故事侧大量调用形如 `RPG.useItem('bandage', that, from)`——签名里
 *   没有「施术者」（默认即玩家）。**不破坏既有调用方**是本次统一的前提。
 *
 * 与 `RPG.act` 的关系（#1752 M1-②）：
 *   `useItem(id, that, from, action)` ≡ `act(玩家角色, id, that, action)`
 *   ⇒ **四路同源**：战外（本壳）／交互战／自动战／同伴 最终都落到 `act`。
 *
 * 语义（与旧实现一致，仅载体改为「玩家角色」）：
 *   `item.used(that, from, action)` → 提交可变状态 → 发事件；
 *   只有默认动作 `use` 消耗充能（装备/卸下不耗次数）。
 *   弹药要求（#1736）：`stats.ammo` 存在时须持有足够弹药；不足 ⇒ 提示并 `return false`
 *   （不消耗回合、不发 `item:used`）。SRD：Ammunition「only if you have ammunition…」
 *   （pin: `equipment.md:68-70`）。
 */
RPG.useItem = (id, that, from, action = 'use') => {
	const actor = RPG.playerActor();
	if (!actor) return false; // 未注册玩家角色（纯 core 场景）⇒ 与「背包里没有」同形
	const r = RPG.act(actor, id, that, action, from);
	if (r.status === 'rejected') {
		if (r.reason === 'no-such-item') {
			setup.RPG.perform(`背包里没有「${RPG.createItem(id).name}」。`, { channel: 'item-refuse' });
		} else if (r.reason === 'no-ammo') {
			const ammoId = r.item?.stats?.ammo?.id;
			const need = ammoId && RPG.items.has(ammoId) ? RPG.createItem(ammoId).name : ammoId;
			setup.RPG.perform(`没有可用的${need}了——「${r.item?.name}」打不出去。`, { channel: 'item-refuse' });
		}
		return false;
	}
	return true;
};

/**
 * 取**玩家角色**（供 core 内部把「玩家背包语义」的操作路由到正确的角色实例）。
 * ★ 已知耦合（developer 缺陷 3）：查找键是 `properties` 含 `'player'`，而 5E／3E 两包
 *   **都以 `id: 'player'` 注册**（`defCharacter` 会告警并**覆盖**先前登记 —— 同 `#1743` 的
 *   「跨包 id 冲突／注册面静默遮蔽」形态）⇒ 本函数命中「后加载」的那个。
 *   **今日无功能差异**：两包的 `items` 都桥接同一条 `State.variables.inventory`。
 *   **若某包的背包桥分家，此处会静默指向错误的角色** ⇒ 届时应改为**显式传入** actor，
 *   或按包名解析。在此之前，消费方不得依赖「返回的一定是某特定包的 Player」。
 */
RPG.playerActor = () =>
	[...(RPG.characters?.values?.() ?? [])].find((c) => (c.properties ?? []).includes('player')) ?? null;


/** 装备 = 对道具执行 equip 动作（语义由道具的 actions 定义） */
RPG.equip = (id) => RPG.useItem(id, null, null, 'equip');

/** 卸下 = unequip 动作 */
RPG.unequip = (id) => RPG.useItem(id, null, null, 'unequip');

/**
 * **统一动作入口**（`#1752` M1-②）：`RPG.act(actor, itemRef, target, action)`。
 *
 * 与 `RPG.useItem` 的差别（为何不能沿用后者）：
 *   `useItem` 的检索面固定在**玩家背包**（`State.variables.inventory`）——
 *   它只能服务「玩家用自己背包里的东西」。战斗里**怪物也用武器**（`weapon.used` 旧路径），
 *   其 `items` 是**自有数组**而非玩家背包 ⇒ 直接改用 `useItem` 会让怪物攻击失败
 *   （实测：`#1737` 返工时 4 例红——怪物在玩家背包里找不到自己的武器）。
 *
 * 语义：
 *   1. **按施术者的 `actor.items` 检索**（快照数组；玩家侧经 bridge 视图即 `$inventory`）；
 *   2. `itemRef` 可为**实例**（取 `.id`）或 **id 字符串**；
 *   3. **原子提交**：拒绝（无此物／无弹药／动作抛错）时**零变更**并返回 `rejected`；
 *   4. **成本后置**：先跑动作，再提交 `equipped`／`charges` 回快照，**最后**发 `item:used`；
 *   5. 动作抛错向上传播（与 `runPipeline` 同形：**损益不可逆者传播**），且**不提交**。
 *
 * @returns {{status:'applied'|'rejected', item?:object, reason?:string}}
 *   调用方按 `status` 判断，**不依赖** `item:used` 事件的存在（防「假成功事件」D20）。
 */
/**
 * attack 层弹药**兜底**判定：`true` ⇒ 本发尚未扣弹、可扣。
 * ★ 键是**实例上的瞬时字段**（`item.__ammoPaid`）＋ `RPG.act` 的**真 `finally`** 清除。
 *   起初曾用「以道具 id 为键的全局 `Set`」——**那是错的**：`act` 无 `finally` ⇒ 标记**永久残留**，
 *   同型武器此后任何**直调 `attack`** 都跳过扣弹 ⇒ `#1765` 原症状（战斗里弹药不减）**换触发条件复活**
 *   （tester-4 的 P7/P9 实测：`act` 开 1 枪后直调 5 次 `used`，子弹仍为 8、扣 0 发）。
 *   实例级键 ＋ `finally` ⇒ 作用域严格 = **单次动作**，跨角色／跨动作自动隔离。
 */
RPG.ammoOwed = (item) => item.__ammoPaid !== true;

/**
 * 解析**弹药该记在谁头上**（`#1765` 兜底路径的归属判定）。
 * 顺序：① 显式 `from` → ② 注册表**唯一**持有者（实例恒等优先，其次按 id）→ ③ `null`。
 *
 * ★ 原则：**只有「唯一可判」才付费；判不出、或判出多于一个 ⇒ 不扣、不开火。**
 *   宁可不出手，不可让他人付费 —— 归属错误（尤其判到受击者头上）比不攻击更坏。
 * ★ **为何不把受击者（`that`）当候选**：受击者常持同型武器／同名弹药，按其 id 判会把归属
 *   误判到受击者头上（`tester-4` 第二形态：受击者持同型枪 ⇒ 射手 10→10、靶 10→9）。
 * ★ **为何多持有者不取「最后一个」**：同 id 不同实例无法区分谁在开火，取任一都是臆断
 *   （`developer` 第三轮：双持有者且受击者后注册 ⇒ 倒序恰命中受击者，射手 10→10、靶 10→9）。
 * ★ 为什么需要本函数：`DND5E.attack` 的兜底在 `used(foe)`（无 `from`）被直调时拿到
 *   `from === undefined`；若写成 `from ?? that` 就会**从受击者扣弹**（developer 缺陷 2 实测：
 *   射手 10→10、靶 10→9）—— 兜底的本意是保证**攻击者**付费。
 */
RPG.ammoOwner = (item, from, that) => {
	if (from != null) return from; // ① 显式施术者优先（最常见：act / 战斗直调都传 from）
	const chars = RPG.characters;
	const list = chars == null ? [] : (typeof chars.values === 'function' ? [...chars.values()] : Object.values(chars));
	const holds = (who) => Array.isArray(who?.items) && who.items.some((s) => s === item);
	/* ★ **唯一才判**（本笔四轮迭代的收敛形）：实例恒等命中恰 1 个 ⇒ 用它；否则看按 id 命中恰 1 个
	 *   （快照路径：`reviveItem` 每次新建实例 ⇒ 实例恒等不命中）。**其余一切情况 ⇒ `null`（不扣）**：
	 *   无人持有、多角色共持**同一实例**、多角色持**同 id 不同实例** —— 三者都不可判谁在开火。
	 *   ★ 早先为「共持实例」单列一行守卫（②′），实测**删掉后测试仍全绿**：因按 id 分支同样命中
	 *   ≥2 ⇒ 返回 `null` —— 该守卫是**冗余分支（死代码）**，已删，只留这一处歧义判定。
	 *   反面教训（`developer` 第三轮）：曾写「按 id 从后往前取最后登记者」，双持有者时恰命中
	 *   **受击者**（射手 10→10、靶 10→9）—— 「取任一」没有依据，歧义必须判 `null`。 */
	const holdsId = (who) => Array.isArray(who?.items) && who.items.some((s) => s?.id === item.id);
	const byInstance = list.filter(holds);
	if (byInstance.length === 1) return byInstance[0]; // ② 实例恒等且唯一 ⇒ 无歧义
	const byId = byInstance.length === 0 ? list.filter(holdsId) : [];
	if (byId.length === 1) return byId[0]; // ③ 按 id 且唯一 ⇒ 可判（快照路径的常见形）
	return null; // ④ 无人持有／歧义（≥2）⇒ 不扣、不开火
};

RPG.act = (actor, itemRef, target, action = 'use', from = actor, 源 = null) => {
	if (actor == null || !Array.isArray(actor.items)) {
		throw new Error('RPG.act 的 actor 须是带 items 数组的角色');
	}
	const list = actor.items;
	const id = typeof itemRef === 'string' ? itemRef : itemRef?.id;
	if (typeof id !== 'string' || id === '') throw new Error('RPG.act 的 itemRef 须是 id 串或含 id 的实例');
	/* ★`#1924`（`#1905` 点名的「身份歧义」）：传进来的是**带实体身份的对象**（实例或 State 快照）
	 *   ⇒ 按身份取**那一件**；✗ 只按 `id` 取第一件 —— 那会让「两件同类（剩余次数 [2,9]）选第二件
	 *   却扣第一件」。`entityId` 与旧名 `slotId` 同值 ⇒ 两形都认。
	 *   ⚠ **对象没有身份**时（如临时 `new DND3.Club()`／只带 `id` 的桩）仍按 `id` 取 —— 兼容既有调用形；
	 *     身份**在场但在本角色包里找不到**时同样回落 `id`（既有调用方可能传的是别处的快照）。 */
	const 身份 = (itemRef != null && typeof itemRef === 'object')
		? (itemRef.entityId ?? itemRef.slotId ?? null) : null;         // 旧名只作**读回落**
	const slot = 身份 != null
		? list.find((s) => (s?.entityId ?? s?.slotId) === 身份)
		: list.find((s) => s.id === id);                               // 无身份 ⇒ 按 id（既有调用形）
	/* ★`#1924`：**身份在场却找不到** ⇒ **具名拒绝**（`item-gone`），✗ **不许**静默退回「取第一件」
	 *   —— 那正是 `#1927` 冒烟锚测到的「传第一件与传第二件返回逐字相同」。理由名与
	 *   `46-battle-repeat.js` 的同族一致（那里早就用 `item-gone` 表达「这件已经不在身上了」）。 */
	if (!slot) {
		return { status: 'rejected', reason: 身份 != null ? 'item-gone' : 'no-such-item' };
	}

	const item = RPG.reviveItem(slot);

	/* 弹药（`#1765` 立、`#1801` 改）：**接受之后**才扣（✗ 先前是「先扣、后判接受」）。
	 *
	 * ★ `#1801` 修的缺陷：原形在**扣弹之后**才跑动作，而动作可以**显式拒绝**（`used()` 返回 `false`，
	 *   如 `#1776` 建造的「材料不足」）⇒ **拒绝却已消耗弹药**（实测 9→8，静默无报错）。
	 *   修法＝三步形，把「够不够」做成**只读预判**，「接受」与「真扣」之间**不留副作用窗口**：
	 *     ① 只读预判（`RPG.ammoShort`，量取自 `RPG.heldTotal` ⇒ 与 `RPG.take` **同一口径**、✗ 第二套量）
	 *     ② 置**单次扣减标记** → 跑动作（动作内 `DND5E.attack` 的兜底见标记即跳过）
	 *     ③ 动作**接受**了才真扣
	 *   ⇒ 拒绝路径（`no-ammo`／`action-refused`）**一律零副作用**。
	 *
	 * ★ 标记为何仍在「跑动作」之前置位：它是 `DND5E.attack` 兜底检查的依据（纵深防御：残余直调
	 *   `used` 的路径被 attack 层兜住），**且必须**在 `finally` 里清除 —— 否则永久残留 ⇒ 同型武器
	 *   此后直调 `attack` 全跳过扣弹。⚠ **不可**把 `RPG.take` 挪到动作之后而**不**同步这些性质：
	 *   那会让动作执行期间标记未置 ⇒ 兜底**再扣一次**（一发两扣）。 */
	const needsAmmo = action === 'use' && item.stats?.ammo;
	if (needsAmmo && RPG.ammoShort(actor, item)) {
		return { status: 'rejected', reason: 'no-ammo', item };
	}
	if (needsAmmo) item.__ammoPaid = true;

	/* ★ **动作可以「拒绝」**（`#1776` D 席缺陷 2）：`used()` **显式 `return false`** ⇒ 视为
	 *   动作自己判定「这次做不到」（材料不足／没有产出表／没有背包／落地未注册……），
	 *   此时 **不提交**（`charges`／`equipped` 都不写回）并返回 `rejected/action-refused`。
	 *   契约：`undefined` = 成功（既有约定，绝大多数动作）；**只有 `=== false` 才算拒绝**
	 *   （✗ 不用 falsy 判定 —— 否则返回 0／''／null 的动作会被误判为拒绝）。
	 *   为何放在这里：调用方（故事侧／`scenes/*`）需要**从返回值**判成败；
	 *     原先失败与成功同为 `applied` ⇒ 只能靠 `perform` 文本，无宿主时不可读（D 席实测）。 */
	let refused = false;
	let 拒绝码 = null, 拒绝附加 = null;
	try {
		refused = item.used(target, from, action, 源) === false;
	} catch (e) {
		/* ★`#1906` 笔一：**结构化拒绝**（`RPG.refuse` ⇒ `e.code` 是非空串）在这里收成**结果面**。
		 *   为什么收在此：契约面要求调用方**从返回值**判成败（`#1776`）；而「误用」是 `refuse`（用法
		 *   从根本上不成立，须响）—— 照旧抛出去，战外的调用方只能 try/catch（`RPG.useItem` 那条壳就把它
		 *   吞成 `false`），玩家面也只剩一个异常。⇒ 与 `used() return false` 走**同一条拒绝路**
		 *   （`rejected/action-refused`），只多带 `code`／`extra` 两个**机器可读**字段。
		 *   ⚠ **普通异常照旧抛**（✗ 吞真 bug）：只有 `code` 是非空**字符串**才算结构化拒绝。
		 *   ⚠ 玩家面白话＝`e.message`，经 `perform` 送出（正文 ＋ 通知面两落，与 `#1877` 同一条通路）。 */
		/* ★`sgstory#1957`（`#1953` 的 ③ 裁定）：`RNG_EXHAUSTED` **除外** —— 抽尽是**测试仪器条件**
		 *   （注入序列用尽），✗ 不是玩家的「误用」；本支会把 `e.message` 经 `perform` 送**玩家屏**
		 *   ⇒ 那会把开发者话术印给玩家 ✗。⇒ 让它在 `RPG.act` 处照旧抛，交给战斗侧的 `#actCatching`
		 *   收成 `action-threw` ＋ 码值（✗ 玩家面不出声）✓。 */
		if (typeof e?.code === 'string' && e.code !== '' && e.code !== 'RNG_EXHAUSTED') {
			refused = true;
			拒绝码 = e.code;
			拒绝附加 = e.extra ?? null;
			if (typeof e.message === 'string' && e.message !== '') RPG.perform(e.message, { channel: 'item-refuse' });   // ★P1-3：结构化拒绝（用法不成立）✓
		} else {
			throw e;
		}
	} finally {
		/* ★ **真 `finally`**：标记作用域 = 单次动作。无此清除 ⇒ 永久残留（见 `RPG.ammoOwed` 注）。
		 *   用 `finally`（✗ `catch`）⇒ **抛错路径也清除**（抛错与正常返回同属单次动作）。 */
		delete item.__ammoPaid;
	}
	if (refused) {
		return { status: 'rejected', reason: 'action-refused', item,
			...(拒绝码 ? { code: 拒绝码 } : {}), ...(拒绝附加 ? { extra: 拒绝附加 } : {}) };
	}

	/* ③ 动作**接受** ⇒ 此刻才真扣（`#1801`：拒绝路径至此已全部返回 ⇒ 弹药零损失） */
	if (needsAmmo) RPG.take(item.stats.ammo.id, item.stats.ammo.perShot ?? 1, actor);

	/* 提交回快照：`equipped` 与 `charges` 都须写回（★ 曾在只写 equipped 时导致「充能永不消耗」） */
	item.equipped = item.equipped === true;
	if (action === 'use' && item.charges != null) item.charges -= 1;
	RPG.commit(actor, item);
	if (action === 'use' && item.charges != null && item.charges <= 0) {
		const at = list.indexOf(slot);
		if (at >= 0) list.splice(at, 1); // 用尽即移除槽（与旧 useItem 同语义）
	}
	RPG.events.emit('item:used', { id, name: item.name, action, target, from: actor, actor });
	return { status: 'applied', item };
};

/**
 * 把动作里改过的**可变状态**写回施术者的道具快照（`RPG.act` 的提交步）。
 * 提交 `equipped` 与 `charges` 两项（`charges <= 0` 的**槽移除**由 `act` 负责，它需 `splice`）。
 */
RPG.commit = (actor, item) => {
	const list = actor?.items;
	if (!Array.isArray(list)) return;
	/* ★`#1924`：写回须**同名回同一件** —— 身份优先（✗ 只按 `id` 取第一件：那会把「第二件的数」写到
	 *   第一件上，实测 `[2,9]` 选第二件 ⇒ `[8,9]`）。无身份者（临时实例/桩）仍按 `id`。 */
	const 身份 = item?.entityId ?? item?.slotId ?? null;
	const slot = (身份 != null
		? list.find((s) => (s?.entityId ?? s?.slotId) === 身份)
		: undefined) ?? list.find((s) => s.id === item?.id);
	if (!slot) return;
	slot.equipped = item.equipped === true;
	/* ★ `charges` 亦须提交：只写 `equipped` 会让动作里 `item.charges -= 1` 只改到还原出的
	 *   实例、快照不动 ⇒ **充能永不消耗**（实测：`useItem('bandage')` 后快照 charges 仍为原值）。
	 *   `charges <= 0` 的**槽移除**由 `RPG.act` 负责（需 splice 该槽）。 */
	if (item.charges != null) slot.charges = item.charges;
};

/** 切换装备状态：已装备 → 卸下；未装备 → 装备 */
RPG.toggleEquip = (id) =>
	RPG.isEquipped(id) ? RPG.unequip(id) : RPG.equip(id);

/** 状态栏用：背包内容的可读名称（“绷带×2（已装备）”这种） */
/**
 * **件数后缀的单点**（`#1862` ②：背包行——采集点的 `×N` 读不出「还能采几次」）。
 *
 * 判据取**动作表**（`klass.handlers.gather` ⇒ 这是一处**采集点**），✗ 不取「有 `stats.yields`」：
 *   后者是**数据面**的形状（建造器把产出表放 `stats` 是打包约定），而「能不能采集」是**行为面**的事实。
 *   ★本席实测（本仓全部注册件扫一遍）：`stats.yields` 非空且 `charges != null` 的件**恰好就是 5 个采集点**
 *     ⇒ 今天两个判据**同解**；取行为面是因为它**不依赖**那个打包约定（`yields` 若挪到别处，前者会静默失准）。
 *
 * ⚠ **语义覆写**：采集点的 `charges` 是**可采次数**（`RPG.act` 采一次扣一次），✗ 与「充能件还剩几次用」同义
 *   ⇒ 一律写成「（还可采 N 次）」，让两种语义在**同一行**上可分辨（`#1862` 第 2 项的原话：「碎石堆×5 玩家不明其义」）。
 *   `charges == null` ⇒ 无后缀（无限次／无计数概念的件与既有形**逐字不变**）。
 *
 * @param item 快照（有 `id`）或 `Item` 实例
 * @returns string 后缀（可能为空串）—— ✗ 含前导空格（调用方拼）
 */
RPG.itemCountSuffix = (item) => {
	if (item?.charges == null) return '';
	const 定义 = RPG.items.get(item.id);
	const isGatherPoint = typeof 定义?.handlers?.gather === 'function';
	if (isGatherPoint) return `（还可采 ${item.charges} 次）`;
	/* ★`books#212` 第 3 项（操作者试玩：「铁铲×6」实为**剩余次数** ⇒ 与数量区分）：件可**声明**
	 *   `stats.durability === true` ⇒ 印「（耐久 N）」✓ —— 与「×N」（堆叠数量）在同一行上可分辨 ✓。
	 *   ⚠ 声明制（✗ 按 `charges` 一概而论）：绷带／草药糊等的 `charges` 是**件数**，改成"耐久"会造新误读 ✗。 */
	if (定义?.stats?.durability === true) return `（耐久 ${item.charges}）`;
	return `×${item.charges}`;
};

RPG.inventoryLabel = () => {
	const list = inv();
	if (list.length === 0) return '（空）';
	return list
		.map((s) => {
			const item = RPG.reviveItem(s);
			/* `#1836`：充能件**一律**显式 `×N`（含 `×1`）—— 原形 `> 1` 让「还剩 1 次」与「无充能概念（`charges:null`）」的件
			 * **文本全同**（玩家看不出前者只剩一次）。
			 * ★**为何不做「（已用尽）」分支（取更强判据）**：新形对 `charges === 0` **亦自解释**（渲染 `×0`）
			 * ⇒ 本设计**不依赖**「所有扣减路径都记得摘槽」这条未来不变式（dev-9 实测：0 充能槽可被造出、并渲染为 `×0`）。
			 * 附带事实（**佐证，✗ 非依赖**）：正常用尽路径确实摘槽 —— ① `RPG.take`（本文件 `slot.charges <= 0 ⇒ splice`）
			 * ② `RPG.act` 的 `'use'` 分支（同判据）③ `35-gather.js` 采空**自摘**（采集不走 `use` ⇒ 动作自行摘槽）。 */
			/* ★`#1862` ②：后缀由 `RPG.itemCountSuffix` **单点**给出（采集点 ⇒「（还可采 N 次）」、其余 ⇒ `×N`）。
			 *   ✗ 在此自写 —— 本文件与 `70-ui.js` 的 `inventoryLinks()` 必须**逐字同形**（有单测把守），
			 *   后缀若有第二处副本，两行文本会静默分叉。 */
			const label = item.name + RPG.itemCountSuffix(item);
			return item.equipped ? `${label}（已装备）` : label;
		})
		.join('、');
};
