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

/** 发放道具（同 id 可叠加时会合并剩余次数）；`n < 0` ⇒ 消耗，走 `RPG.take` */
RPG.give = (id, n = 1) => {
	const def = RPG.createItem(id); // 读默认定义（次数、可否叠加）
	const list = inv();
	if (!Number.isInteger(n)) throw new Error(`RPG.give 的 n 须为整数（收到 ${n}）——次数计数不允许小数`);
	if (n < 0) return RPG.take(id, -n); // 负数即消耗，见 RPG.take
	if (n === 0) return;
	if (def.stackable && def.charges != null) {
		const slot = list.find((s) => s.id === id);
		if (slot) {
			slot.charges += def.charges * n;
			return;
		}
	}
	for (let i = 0; i < n; i++) list.push(def.toJSON());
};

/**
 * 消耗道具（`RPG.give(id, -n)` 的实现，亦可直接调用）。
 * 语义（#1736）：
 *   - 按 id **从后往前**扣减：先扣堆叠槽的 `charges`，再整槽移除（不产生「charges ≤ 0 的残槽」）。
 *   - **不足则整体不生效**并返回 `false`（防「扣到负数」，也不做部分扣减——原子性）。
 *   - 非堆叠道具（`charges == null`）每个槽计 1 件。
 * @returns {boolean} 是否成功扣减（不足 / n ≤ 0 ⇒ false 且状态不变）
 */
RPG.take = (id, n = 1, actor = null) => {
	if (!Number.isInteger(n)) throw new Error(`RPG.take 的 n 须为整数（收到 ${n}）`);
	if (!(n > 0)) return false;
	/* `actor` 省略 ⇒ 玩家背包（旧行为，逐字节不变）；给出 ⇒ 按其 `items` 扣（#1752 统一入口用） */
	const list = actor ? (Array.isArray(actor.items) ? actor.items : null) : inv();
	if (list == null) return false;
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
	if (this.slot == null) {
		this.perform(`「${this.name}」不是可装备的物品。`);
		return;
	}
	const current = RPG.equippedIn(this.slot);
	if (current && current.id !== this.id) {
		this.perform(`「${current.name}」正占着${RPG.slotLabels[this.slot] ?? this.slot}槽——先卸下它。`);
		return;
	}
	this.equipped = true;
	this.perform(`你装备了「${this.name}」。`);
};

/** 卸下动作：清除 equipped 标记（未装备时是静默空操作） */
RPG.slotUnequip = function slotUnequip() {
	if (!this.equipped) return;
	this.equipped = false;
	this.perform(`你卸下了「${this.name}」。`);
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
	if (this.stats?.thrown == null) {
		this.perform(`「${this.name}」没有 Thrown 特性，不能投掷。`);
		return;
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
		inv().push(s); // 原样转移快照（保留剩余次数）
		slots.splice(slots.indexOf(s), 1);
	}
	RPG.perform(`你获得了：${names.join('、')}。`);
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
			setup.RPG.perform(`背包里没有「${RPG.createItem(id).name}」。`);
		} else if (r.reason === 'no-ammo') {
			const ammoId = r.item?.stats?.ammo?.id;
			const need = ammoId && RPG.items.has(ammoId) ? RPG.createItem(ammoId).name : ammoId;
			setup.RPG.perform(`没有可用的${need}了——「${r.item?.name}」打不出去。`);
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

RPG.act = (actor, itemRef, target, action = 'use', from = actor) => {
	if (actor == null || !Array.isArray(actor.items)) {
		throw new Error('RPG.act 的 actor 须是带 items 数组的角色');
	}
	const list = actor.items;
	const id = typeof itemRef === 'string' ? itemRef : itemRef?.id;
	if (typeof id !== 'string' || id === '') throw new Error('RPG.act 的 itemRef 须是 id 串或含 id 的实例');
	const slot = list.find((s) => s.id === id);
	if (!slot) return { status: 'rejected', reason: 'no-such-item' };

	const item = RPG.reviveItem(slot);

	/* 弹药（`#1765`）：**入口层扣**（不足 ⇒ rejected，零变更，且**不跑动作**）；扣成功后打
	 *   **单次扣减标记**（本次动作内有效），`DND5E.attack` 的兜底检查见标记即跳过 —— 两层检查
	 *   都在（纵深防御：残余直调 `used` 的路径被 attack 层兜住），但**同一发只扣一次**。
	 *   ★ 标记**必须**在 `finally` 里清除：否则永久残留 ⇒ 同型武器此后直调 `attack` 全跳过扣弹。 */
	if (action === 'use' && item.stats?.ammo && !RPG.take(item.stats.ammo.id, item.stats.ammo.perShot ?? 1, actor)) {
		return { status: 'rejected', reason: 'no-ammo', item };
	}
	if (action === 'use' && item.stats?.ammo) item.__ammoPaid = true;

	/* ★ **动作可以「拒绝」**（`#1776` D 席缺陷 2）：`used()` **显式 `return false`** ⇒ 视为
	 *   动作自己判定「这次做不到」（材料不足／没有产出表／没有背包／落地未注册……），
	 *   此时 **不提交**（`charges`／`equipped` 都不写回）并返回 `rejected/action-refused`。
	 *   契约：`undefined` = 成功（既有约定，绝大多数动作）；**只有 `=== false` 才算拒绝**
	 *   （✗ 不用 falsy 判定 —— 否则返回 0／''／null 的动作会被误判为拒绝）。
	 *   为何放在这里：调用方（故事侧／`scenes/*`）需要**从返回值**判成败；
	 *     原先失败与成功同为 `applied` ⇒ 只能靠 `perform` 文本，无宿主时不可读（D 席实测）。 */
	let refused = false;
	try {
		refused = item.used(target, from, action) === false;
	} finally {
		/* ★ **真 `finally`**：标记作用域 = 单次动作。无此清除 ⇒ 永久残留（见 `RPG.ammoOwed` 注）。
		 *   用 `finally`（✗ `catch`）⇒ **抛错路径也清除**（抛错与正常返回同属单次动作）。 */
		delete item.__ammoPaid;
	}
	if (refused) return { status: 'rejected', reason: 'action-refused', item };

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
	const slot = list.find((s) => s.id === item.id);
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
RPG.inventoryLabel = () => {
	const list = inv();
	if (list.length === 0) return '（空）';
	return list
		.map((s) => {
			const item = RPG.reviveItem(s);
			const label =
				item.charges != null && item.charges > 1
					? `${item.name}×${item.charges}`
					: item.name;
			return item.equipped ? `${label}（已装备）` : label;
		})
		.join('、');
};
