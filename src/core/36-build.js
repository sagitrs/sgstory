/* RPG 核心 —— 建造/合成原语最小形（#1747：一段「收集-建设-升层」的建设侧）
 *
 * ## craft / building 的边界（领队 @ #1730 裁定②「写死票面，防两套配方表」）
 *
 * ★ **权威定义在 `docs/plan/1747-span1-gather-build.md` §二**（设计稿；`merge-checklist` 第 1 条要求
 *   判定/规则行为变更须设计文档 Δ 同笔）。本文件头给**实现口径**（消费点／留痕／实测注记），
 *   设计稿给**判据与规范**，二者**不重述**；若冲突以设计稿为准。下表为**便于阅读的摘要**：
 *
 * | 面 | 输入 | 输出 | 载体 | 例子 |
 * |---|---|---|---|
 * | **craft**（合成） | **道具**（背包内） | **道具**（回背包） | **道具上的 `craft` 动作** ＋ `RPG.craftWith` | 木材＋石料 ⇒ 石斧 |
 * | **building**（建造） | **道具**（背包内） | **聚落状态**（地图/存档） | **聚落地点上的 `build` 动作** ＋ `RPG.buildAt` | 种子＋木材 ⇒ 农田（产出食物） |
 *
 * **判据一句**：**产出回到背包的是 craft，产出落到世界（地图/State）的是 building。**
 *   ⇒ 二者**共用同一套配方检索与消耗逻辑**（本文件的 `RPG.consumeRecipe`），
 *     ✗ **不各写一套配方表**（那正是裁定②要防的）。
 *
 * ## 与既有面的关系（零新 face）
 *   - 配方**就是**道具定义上的 `recipe` 字段（`{ inputs: [{id, n}], yields: [...] }`），
 *     与 `yields`（采集产出）同族、同形 ⇒ 内容侧声明式，无独立配方注册表。
 *   - 消耗输入走 `RPG.take(id, n, actor)`（**支持 actor** ⇒ 同伴/怪物也能造，复用 #1752 形）。
 *   - 产出走与采集**同一个**投递函数 `RPG.deliverYields`（见下）⇒ 「产出如何进背包」只有一处实现。
 */

/**
 * 按产出表把道具投进 `who.items`（采集与合成**共用**；唯二入口分别是 `gatherFrom` 与 `craftWith`）。
 * 产出表条目同 `RPG.gatherFrom` 的 `yields`：`{ id, n?, chance? }`。
 * @returns {string[]} 实际投递的可读串（`["石料×2", …]`）
 */
RPG.deliverYields = (who, yields, label) => {
	const bag = Array.isArray(who?.items) ? who.items : null;
	if (bag == null) return [];
	const got = [];
	for (const y of yields ?? []) {
		const chance = y.chance ?? 1;
		if (chance < 1 && RPG.rng.unit() >= chance) continue;   // 未命中：静默（概率是设计，不是错误）
		const n = typeof y.n === 'string' ? RPG.roll(y.n) : (y.n ?? 1);
		if (!(n > 0)) continue;
		if (!RPG.items.has(y.id)) {
			RPG.perform(`「${label}」的产出 id「${y.id}」未注册——跳过该项。`);
			continue;
		}
		/* ★ **投递语义必须与 `RPG.give` 同形**（✗ 不自造第二套合并逻辑）：
		 *   `give` 是「把 n 件放进背包」的既有唯一实现 —— **首次逐件建槽**、有同类槽才并入
		 *   （`30-inventory.js RPG.give`）。本函数早先自写「一次投进一个槽」，与 `give` **不一致**
		 *   ⇒ 退还输入时把 2 件并进已有的 `charges:1` 槽 ⇒ 该槽变 3（实测），
		 *   而 `take` 是「逐槽扣」⇒ 两边对不上、件数静默漂移。
		 *   现按 `give` 的形状写：玩家背包直接走 `RPG.give`（全局面），同伴/怪物写其自有数组。 */
		const count = () => bag.filter((s) => s.id === y.id).reduce((a, s) => a + (s.charges ?? 1), 0);
		const before = count();
		const def = RPG.createItem(y.id);
		if (bag === State.variables?.inventory) {
			RPG.give(y.id, n);                                        // 玩家：既有唯一实现
		} else if (def.stackable && def.charges != null) {
			const slot = bag.find((s) => s.id === y.id);
			if (slot) slot.charges += def.charges * n;                 // 同伴：同 give 的合并分支
			else for (let i = 0; i < n; i++) bag.push(def.toJSON());   // 同伴：同 give 的首次逐件
		} else {
			for (let i = 0; i < n; i++) bag.push(def.toJSON());
		}
		const gained = count() - before;
		if (gained > 0) got.push(`${def.name}×${gained}`);
	}
	return got;
};

/**
 * **配方消耗**：按 `recipe.inputs` 从 `who` 的背包原子扣除全部输入。
 * **原子性**（与 `RPG.take` 同族）：任一输入不足 ⇒ **整笔不生效**并返回 `null`（防「扣了一半」）。
 * @returns {string[]|null} 成功 ⇒ 被消耗的可读串列表；不足 ⇒ `null`（且状态零变更）
 */
RPG.consumeRecipe = (who, recipe) => {
	const inputs = Array.isArray(recipe?.inputs) ? recipe.inputs : null;
	if (inputs == null || inputs.length === 0) return null;
	const bag = Array.isArray(who?.items) ? who.items : [];
	/* 先**全量预检**：每一项都要够（不足即整笔放弃，✗ 不做部分扣除） */
	for (const inp of inputs) {
		const n = inp.n ?? 1;
		const total = bag.reduce((s, slot) => s + (slot.id === inp.id ? (slot.charges ?? 1) : 0), 0);
		if (total < n) return null;
	}
	/* 预检通过 ⇒ 逐项扣除（此时不可能失败；`take` 仍返回布尔，故断言之） */
	const spent = [];
	for (const inp of inputs) {
		const n = inp.n ?? 1;
		if (!RPG.take(inp.id, n, who)) throw new Error(`配方输入「${inp.id}」扣除失败（预检已通过，不应发生）`);
		const name = RPG.items.has(inp.id) ? RPG.createItem(inp.id).name : inp.id;
		spent.push(`${name}×${n}`);
	}
	return spent;
};

/**
 * **craft 共享动作**（道具上的 `actions: { craft: RPG.craftWith }`）：输入→输出**都回背包**。
 * 道具以 `recipe: { inputs:[{id,n}], yields:[{id,n}] }` 声明配方。
 * 不足 ⇒ `perform` 一行提示并返回 `false`（**不抛错**：这是正常的「材料不够」）；
 * `RPG.act` 据返回值决定是否算「已应用」——故此处返回 `false` 使调用方可判。
 */
RPG.craftWith = function craftWith(that, from) {
	const who = from ?? that;
	const recipe = this.stats?.recipe;
	if (recipe == null) {
		this.perform(`「${this.name}」没有配方——无法合成。`);
		return false;
	}
	const need = (recipe.inputs ?? []).map((i) => `${RPG.items.has(i.id) ? RPG.createItem(i.id).name : i.id}×${i.n ?? 1}`).join('、');
	const spent = RPG.consumeRecipe(who, recipe);
	if (spent == null) {
		this.perform(`材料不足：合成「${this.name}」需要 ${need}。`);
		return false;
	}
	const got = RPG.deliverYields(who, recipe.yields, this.name);
	this.perform(`用 ${spent.join('、')} 合成：${got.join('、') || '（无产出）'}。`);
	return true;
};

/**
 * **building**（建造）的效果注册面：产出**落到世界**，故 core 不知道「农田是什么」——
 *   由内容侧注册「建造项 → 落地函数」。这与 `#1741` 的清档注入、`#1760` 的层表注册面同族：
 *   **core 提供机制与注册面，语义由内容侧给**。
 *
 * 落地函数签名 `(actor, opts) => boolean`：**返回 false ⇒ 建造失败**（材料不退，由调用方决定是否重试）。
 * 注册 id 即建造项 id（如 `'farm'`），与道具 `recipe` 配合：道具声明配方（输入），
 * 建造项声明**落地效果**（输出到世界）——**一处定输入、一处定输出，都在内容侧，core 只搬运**。
 */
RPG.buildEffects = Object.create(null);

/** 注册建造落地函数：`RPG.registerBuild('farm', (actor) => { …改 State/地图… })`。 */
RPG.registerBuild = (id, fn) => {
	if (typeof id !== 'string' || id === '') throw new Error('registerBuild 需要非空 id');
	if (typeof fn !== 'function') throw new Error('registerBuild 需要函数');
	/* 重复注册**告警**（不抛）：与 `registerItem`／`defCharacter` 的既有处理同形
	 *   —— 后注册者覆盖先注册者，但**不静默**（`#1776` D 席 N-4：与 `#1743` 的跨包 id
	 *   静默遮蔽同族；热重载／多包场景下最需要这条线索）。 */
	if (RPG.buildEffects[id] && RPG.buildEffects[id] !== fn) {
		console.warn(`[RPG] 建造项「${id}」重复注册：将被覆盖。`);
	}
	RPG.buildEffects[id] = fn;
	return fn;
};

/**
 * **building 共享动作**（聚落地点上的 `actions: { build: RPG.buildAt }`）：
 * 消耗道具输入 ⇒ 调**建造落地函数**把产出写进世界。
 * 道具以 `plan: { id, inputs:[…] }` 声明工程（id 指向 `RPG.registerBuild` 的落地函数）。
 */
RPG.buildAt = function buildAt(that, from) {
	const who = from ?? that;
	const plan = this.stats?.plan;
	if (plan == null) {
		this.perform(`「${this.name}」没有工程图纸——无法建造。`);
		return false;
	}
	const land = RPG.buildEffects[plan.id];
	if (typeof land !== 'function') {
		this.perform(`建造项「${plan.id}」未注册落地效果——无法建造。`);
		return false;
	}
	const need = (plan.inputs ?? []).map((i) => `${RPG.items.has(i.id) ? RPG.createItem(i.id).name : i.id}×${i.n ?? 1}`).join('、');
	const spent = RPG.consumeRecipe(who, { inputs: plan.inputs });
	if (spent == null) {
		this.perform(`材料不足：建造需要 ${need}。`);
		return false;
	}
	/* ★ 落地函数的**两条失败路径都要退还**（`#1776` D 席缺陷 3）：
	 *   ① 返回 `false`（自己判定做不成）；② **抛错**（内容侧 bug／下游异常）。
	 *   起初只处理了 ① ⇒ ② 时输入已扣且不退 ⇒ **材料净损**（D 席实测）。
	 *   抛错路径**退还后原样再抛**（✗ 不吞）：与 `45-pipeline` 的「损益不可逆者传播」同形 ——
	 *   退还让「失败不留损」成立，重抛让 bug 不被静默。 */
	const refund = () => RPG.deliverYields(who, (plan.inputs ?? []).map((i) => ({ id: i.id, n: i.n ?? 1 })), this.name);
	let landed;
	try {
		landed = land(who, { plan });
	} catch (ex) {
		refund();
		this.perform(`建造「${this.name}」时出错——材料已退回。`);
		throw ex;
	}
	if (!landed) {
		/* 落地失败（返回 false）：退还输入（本笔定义：失败不留损） */
		refund();
		this.perform(`建造「${this.name}」未成——材料已退回。`);
		return false;
	}
	this.perform(`用 ${spent.join('、')} 建成：${this.name}。`);
	return true;
};
