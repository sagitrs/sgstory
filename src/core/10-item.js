/* RPG 核心 —— Item 抽象基类、注册表与声明式工厂
 *
 * Item 与 Character 共同继承于 Object（显式 extends 表达共同祖先；
 * 切勿往 Object.prototype 挂数据，会污染所有对象）。
 *
 * 子类必须实现 used(that, from) 接口：
 *   that  使用目标（受作用者：Character，或任何带 name/hp 等属性的纯对象）
 *   from  施用者/效果来源（可省略——stats 数值块可提供加成的角色，
 *         自己给自己用时 from 就是 that 本身）
 *   职责  修改 that 的属性值（副作用），并通过 this.perform(结果字符串)
 *         直接打印结果（不再返回字符串）。
 */

/** ★`#1877` P2-2：**道具拒绝错误**的工厂 —— 「玩家看白话、开发者看原文」**分两栏**。
 *
 * ## 为何要这个工厂（✗ 只是改文案）
 *   本仓既有两类错误文案，各有归属：
 *     · **契约错**（`RPG.effectError`／`RPG.stockError`，如 `EFFECT_UNKNOWN`）：读者是**作者**，
 *       文案可含票号/id —— 它们**不设**玩家通路。
 *     · **道具拒绝**（`used()` 抛错，如资源「误当消耗品」）：经由 `#1839`（战斗侧 `#actCatching`）
 *       与 `#1857`（故事页 `itemClick`）**原样上屏**（`RPG.itemRejectText` 直引 `e.message`）。
 *   ⇒ 现状把**开发者原话**（「请用采集动作（gather）」）送到了玩家眼前（`#1863`／`#1877` P2-2）。
 *   ★但**不能**简单把文案改成白话 —— 那会**丢开发者信号**（`#1863` 的口径是**降级呈现，✗ 删信息**）。
 *   ⇒ 故本工厂把两者分栏：`message` ＝ 玩家文案；`code` ＋ `devText` ＝ 开发者原文（进 console／栈／测试断言）。
 *
 * ## 契约
 *   · `e.message`：**玩家可见** —— 白话，无英文动作名／票号／源码路径（由 `tests/gates/player-text.mjs` 把守）。
 *   · `e.code`：稳定的机器可读 id（如 `'MATERIAL_NOT_USABLE'`）—— 供测试与调用方断言，**✗ 靠文案匹配**。
 *     ★**开发者信号就靠它**：`code` 直指**缺陷类别**，比逐字保存旧话术更稳（旧话术一旦改写即失同步）。
 *   · `e.extra`（可选）：附加上下文（如 `{ itemId, needAction }`）—— 同样要求**机器可读**，✗ 散文。
 *
 * ⚠ **与「返回 `false`」的分工**：`used()` 返回 `false` ＝ 动作**自己判定**这次做不到（`#1776`，
 *   正常控制流，✗ 错误，**不消耗**）；`RPG.refuse` ＝ 用法**从根本上就不成立**（误用），须响。
 *
 * ⚠ **签名只有 3 参**（`code, message, extra`）—— ✗ 再加一个「开发者原文」参数：
 *   本席首版写成 4 参（`devText` 在第 3 位），而五处调用按 3 参写 ⇒ 那个 `{...}` 对象**落进了 `devText`**
 *   （实测：`e.devText` 是个对象、`e.extra` 是 `undefined`）。★**这正是本仓「调用形与声明形须一致」的第 N 次实例**
 *   —— 由单测当场抓出。教训：**参数表越长，越容易被位置写错；能用 code 表达的就别加参数**。
 */
RPG.refuse = (code, message, extra) =>
	Object.assign(new Error(message), { code, ...(extra ? { extra } : {}) });

/** ★`#1914`（增量 3/3）：**件号**（`slotId`）—— 同一槽位上的那**一件**东西的稳定标识。
 *   为什么不是下标：`.战报`/意图要把「所选的件」序列化下来，而下标会在「取件 ⇒ 插入/丢失 ⇒ 再取」时**漂移**
 *   （`40-battle.js` 的选项值就是下标 ⇒ 两把同耐久长剑只能选到第一把）。
 *   ⚠ 为什么不是「`id` ＋ `charges`」：两件同类同耐久**完全一样** ⇒ 那会把两件判成一件。
 *   发号是**全局单调**的；读档时把序列推到已见号**之上** ⇒ 新发号不与既有号碰撞（见 `reviveItem`）。 */
/* ★高水位住在**模块级**（✗ 写 `State.variables`）：`dev-9` 的合流裁定点名「**槽位号不复用**」须活到
 *   合流后 —— 本条由两件事共同保证：①发号**全局单调**（本处）②入包出口「**有号也顶高水位**」
 *   （`30-inventory.js` 的 `保号`）⇒ 任何**经出口**进袋的号都会把序列顶上去。
 *   ⚠ **为何不把高水位写进档**（本席实测后放弃）：`reviveItem` / `createItem` 也会发号，而它们出现在
 *   **读路径**上（如构造选项）⇒ 写 `State` 会让「**被拒 ⇒ 存档面零变化**」这条既有判据（`#1806` 笔2
 *   回填 `#1801`）变红。⇒ 取「模块级 ＋ 出口顶水位」，两边都满足。 */
RPG.itemEntitySeq = 0;
RPG.newEntityId = () => `it-${(RPG.itemEntitySeq += 1)}`;

/** 让序列**越过**读到的号（读档/旧档都走；✗ 只读不推 ⇒ 之后发号必碰撞）。 */
RPG.noteEntityId = (entityId) => {
	const n = Number(String(entityId ?? '').replace(/^it-/, ''));
	if (Number.isFinite(n) && n > RPG.itemEntitySeq) RPG.itemEntitySeq = n;
};

RPG.Item = class Item extends Object {
	/* ★`#1914`：每个实例出生即带号（⇒ `toJSON` 恒有号，✗ 靠调用方各自补）。 */
	constructor(def) {
		super();
		if (new.target === RPG.Item) {
			throw new Error('Item 是抽象基类，请继承它或用 RPG.defItem() 声明');
		}
		if (!def || !def.id) throw new Error('道具定义缺少 id');
		this.id = def.id;
		this.name = def.name ?? def.id;
		this.desc = def.desc ?? '';
		/** 规则数值块（dnd3 填 ac/bab/原始分 str…，wfrp 填 WS/BS/Wounds…，字段由规则包约定） */
		this.stats = { ...def.stats };
		/** 剩余使用次数；null 表示无限次 */
		this.charges = def.charges ?? null;
		/* ★`#1924`（`#1905` 阶段 2「实例／身份」）：实例的稳定身份叫 **`entityId`** ——「一个量一个名」。
		 *   ⚠ 本字段就是 `#1914` 的 `slotId`（值域、发号器、高水位**全同**），只是**改名**：
		 *     让名字与语域相配（实体在背包/手/装备/掉落都是同一件事，✗ 只在「槽位里」才贴切）。
		 *   ⚠ **旧名 `slotId` 只活在三处**：①本行与 `reviveItem` 的**读取回落**（旧档/旧调用形）
		 *     ②`30-inventory` 的 `保号`／`backfillItemIdentity` 的读取回落 ③几条判据的历史注。
		 *     落成新数据一律**只写 `entityId`** ⇒ 将来收口＝删那几处回落（✗ 不是全仓找引用）。
		 *   ⚠ `id` 已是**类型身份**（`defItem` 的注册 id）⇒ ✗ 不再造同义的 `definitionId`。 */
		this.entityId = def.entityId ?? def.slotId ?? RPG.newEntityId();
		/* ★`#1914`（步四）：**战斗用途声明位** —— 由道具自己写（`45-battle-catalog.js` 读它）。
		 *   缺省 `null` ⇒ 目录按**窄**默认 `damage` 处理（⇒ 其余 63 件行为不变）。 */
		this.battleUse = def.battleUse ?? null;
		this.stackable = def.stackable !== false;
		/** 是否武器（BattleTurn 用 contains(['weapon', 'equipped']) 检索） */
		this.weapon = def.weapon === true;
		/** 装备槽：'weapon' / 'body' / 'feet'…（规则包可扩展）；null = 不可装备。
		 *  同槽互斥、异槽并存，见 30-inventory 的 slotEquip。 */
		this.slot = def.slot ?? null;
		/** 是否已装备（可变状态，随 toJSON() 持久化） */
		this.equipped = def.equipped === true;
	}

	/**
	 * 接口（动作分发器）：按 action 字符串把调用派发给对应的动作处理器
	 * （defItem 的 used / actions 处理器签名是 (that, from)）。
	 * 未注册的 action 会 perform 一行提示而不是抛错——“这个道具不能这样用”。
	 * 手写子类也可以整体覆写 used()，退回单一动作的老写法。
	 *
	 * ★**分发失败须打上 `return false`**（`#1783`，与 `slotEquip` 同族）：本函数是**动作分发器**，
	 *   「没有这个用法」＝ **拒绝**，而原先 `return;`（undefined）按 `#1776` 的契约
	 *   （`undefined` ＝ 成功、**只有 `=== false` 才算拒绝**）会被算作 `applied` ⇒ **不可判**。
	 *   ⚠ 勿与「动作自己判定做不到」混淆：那是**处理器**返回 false（如 `slotEquip` 的槽被占），
	 *     本处是**分发层面**就没有这个动作 —— 两者的对外语义相同（都是 `rejected/action-refused`）。
	 */
	used(that, from, action = 'use') {
		const handler = this.constructor.handlers?.[action];
		if (typeof handler !== 'function') {
			if (action === 'use') {
				throw new Error(`${this.constructor.name} 没有实现默认动作 used`);
			}
			this.perform(`「${this.name}」没有「${action}」这个用法。`);
			return false;   // ★ #1783：分发失败 ＝ 拒绝（✗ undefined —— 那会被算作 applied）
		}
		return handler.call(this, that, from);
	}

	/**
	 * 实例 → 纯数据快照。
	 * SugarCube 的故事变量必须可 JSON 序列化（存档、历史回退都会克隆），
	 * 类实例会丢失原型，所以 State 里永远只放快照，
	 * 要用时再用 RPG.reviveItem() 还原成实例。
	 */
	toJSON() {
		/* ★`#1924`：快照带**实体身份** `entityId`（✗ 不写旧名 `slotId` —— 落成新数据只留一个名）。
		 *   ⚠ 键序保持「`id` 在前、状态在后」的既有形状，身份插在 `id` 之后。 */
		return {
			id: this.id, entityId: this.entityId,
			charges: this.charges, equipped: this.equipped,
		};
	}
};

/** 注册道具类（添加新道具时调用；一般用 defItem 即可）。
 *  同 id 重复注册会**如实上报**（`RPG.regWarn.报` ⇒ 加载期汇总**一条** warn，含计数与逐条具名）——
 *  两包同名道具后者遮蔽前者是已知风险；单包故事不该撞它（`story.json` 的 `packs` 口）。 */
RPG.registerItem = (klass) => {
	if (!(klass?.prototype instanceof RPG.Item)) {
		throw new Error(`registerItem: ${klass?.name} 不是 Item 的子类`);
	}
	const id = new klass().id;
	if (RPG.items.has(id)) {
		RPG.regWarn.报('道具', `${id}`, `${RPG.items.get(id).name} 被覆盖`);
	}
	RPG.items.set(id, klass);
	return klass;
};

/** 按注册表创建新实例（overrides 可覆盖默认定义） */
/** ★`sgstory#1743` A 支（**包限定读**的底座）：读一件**包标记**。
 *
 *   背景：两包共用一张 id 表 ⇒ 同 id 后者遮蔽前者（`#1743` 台账 10 例）⇒ 故事侧「按包取用」只能靠
 *   那包自己的 Symbol 键（`setup.DND3.PACK ＝ Symbol.for('rpg.pack.dnd3')` 这类）现读。
 *   本帮手把「怎么读」收成一处（★**一个量只留一个名字**）：
 *     ① 对象的 `stats` 里找**任何** `Symbol.for('rpg.pack.*')` 键 ⇒ 取它的**值**当包名（如 `'dnd3'`）；
 *     ② **没有**包标记 ⇒ 记 `'core'`（core 侧**不设**包 Symbol ✓ —— 这是**约定**，B 支候 0.0.3 设计窗收口）；
 *     ③ 传实例或类都行（传类则**探一个实例**，并按类**缓存** ⇒ 不反复消耗 `entityId`）。
 *   ⚠ 边界：判据是「`Symbol.keyFor(sym)` 以 `rpg.pack.` 开头」⇒ 只看**全局注册**的 Symbol（`Symbol.for` 才进注册表 ✓）。
 */
const 包缓存 = new WeakMap();
RPG.包标记 = (物) => {
	if (!物) return null;
	if (包缓存.has(物)) return 包缓存.get(物);
	let 目标 = 物;
	if (typeof 物 === 'function') {              // 传**类** ⇒ 探一个实例（✗ 改调用方语义）
		try { 目标 = new 物(); } catch { return null; }
	}
	const 块 = 目标?.stats ?? 目标?.definition?.stats ?? null;
	let 包 = null;
	if (块 && typeof 块 === 'object') {
		for (const sym of Object.getOwnPropertySymbols(块)) {
			const k = Symbol.keyFor(sym);
			if (k && k.startsWith('rpg.pack.')) { 包 = 块[sym] ?? k.slice('rpg.pack.'.length); break; }
		}
	}
	包 = 包 ?? 'core';                            // ★无标记 ⇒ core（约定；见上 ②）
	if (typeof 物 === 'function') 包缓存.set(物, 包);
	return 包;
};

/** ★`sgstory#1743` A 支：**包限定读** —— 同 id 跨包时取**那一包**自己的件（✗ 不靠装载序）。
 *   · `包` 取包名（`'dnd3'`／`'dnd-5e'`／`'core'`…）；无包标记者按 `'core'` 计（见 `RPG.包标记`）；
 *   · 取不到 ⇒ **`undefined`** —— ✗ **不**回落到「另一包那件」：那正是本票要治的**静默遮蔽** ✓。
 *   ★零回归：纯新增，✗ 不改 `get`／`set`／注册路径的任何行为（判据同批钉住）。
 */
/** ★`sgstory#1743` A₁：**包命名空间发现** —— 在 `setup` 上找「`stats()` 会盖 `<包>` 标」的那个命名空间。
 *   为什么需要：**道具的 `stats` 目前一件都不带包标**（`#1743` 实测：74 件带标 **0**；角色 13 件全带 ✓），
 *   故道具面判不出归属 ⇒ 退到「在那包的**导出名**里按 id 反查」这条非破坏的路 ✓（✗ 不动注册路径）。
 *   ★只读探测（`stats({})` 是纯的）；探测失败一律跳过（✗ 不静默当命中）；结果按包缓存。
 */
const 包空间表 = new Map();
RPG.包空间 = (包) => {
	if (包空间表.has(包)) return 包空间表.get(包);
	let 命中 = null;
	try {
		for (const k of Object.keys(globalThis.setup ?? {})) {
			const ns = globalThis.setup[k];
			if (!ns || typeof ns.stats !== 'function') continue;
			let 块 = null;
			try { 块 = ns.stats({}); } catch { continue; }
			for (const sym of Object.getOwnPropertySymbols(块 ?? {})) {
				const key = Symbol.keyFor(sym);
				if (key && key.startsWith('rpg.pack.') && (块[sym] ?? key.slice('rpg.pack.'.length)) === 包) { 命中 = ns; break; }
			}
			if (命中) break;
		}
	} catch { 命中 = null; }
	包空间表.set(包, 命中);
	return 命中;
};

/** 导出名 ↔ id 的**归一键**：`HerbPoultice` ↔ `herb-poultice`（✗ 大小写／连字符／下划线之别）。 */
const 归一键 = (x) => String(x).replace(/[-_\s]/g, '').toLowerCase();

/** ★**未命中台账**（`#1743`：✗ 不静默）—— 按包反查失败时记一笔，供判据／人读。
 *   形：`[{ 包, id, 何以 }]`；★只增不清（读得到「本局有没有不循例的件」✓）。 */
const 未命中 = [];
RPG.items.未命中 = () => 未命中.map((x) => ({ ...x }));
RPG.items.清未命中 = () => { 未命中.length = 0; };   // 判据用（复位台账；★设计上台账只增不清）

/** ★`sgstory#1743` A₁：**包限定读** —— 同 id 跨包时取**那一包**自己的件（✗ 不靠装载序）。
 *   ① 该件若**带包标**（角色面那套机制）⇒ 直接按标记判（O(1)）；
 *   ② 否则（道具面现状）⇒ 在**该包的命名空间**里按「导出名 ↔ id」约例反查（✗ 不实例化 ⇒ 不消耗 `entityId`）；
 *   ③ 判不出 ⇒ 返回 `undefined` **并记入未命中台账**（✗ **不**回落给「另一包那件」—— 那正是本票要治的静默遮蔽）。
 *   ★零回归：纯新增，✗ 不改 `get`／`set`／注册路径的任何行为。
 */
/** ★`sgstory#1743` A₁ 的**通用形**：在**包的命名空间**里按「导出名 ↔ id」约例取那一支。
 *   ★为何通用：**两张注册表都只留赢家**（`items` 与 `characters` 各一张单表）⇒ 「包标」只答得了「赢家属于谁」，
 *     答不了「输家是谁」⇒ 角色面与道具面**都**得走这条路（本席实测：`characters.get('goblin')` 恒是 dnd3 那件 ✓）。
 *   ★`基类` 用来排除同名的非目标导出（道具传 `RPG.Item`、角色传 `RPG.Character`）。✗ 不实例化 ⇒ 不消耗 `entityId`。
 */
RPG.按包从空间 = (包, id, 基类) => {
	const ns = RPG.包空间(包);
	if (!ns || typeof 基类 !== 'function') return undefined;
	const 目标 = 归一键(id);
	for (const k of Object.keys(ns)) {
		const v = ns[k];
		/* ① **类形**（道具面：导出的是类）⇒ 按「导出名 ↔ id」约例匹配 ✓（类上无 `.id`，只能靠名字 ✓） */
		if (typeof v === 'function' && v.prototype instanceof 基类 && 归一键(k) === 目标) return v;
		/* ② **实例形**（角色面：`defCharacter` 返回实例）⇒ 先试 `.id`（本席实测**常为 undefined** ✗），
		 *   再退到**同一个命名约例** —— 实例面上唯一可靠的可判物就是它的**导出名** ✓。 */
		if (v && typeof v === 'object' && v instanceof 基类) {
			if (v.id === id || 归一键(k) === 目标) return v;
		}
	}
	return undefined;
};

/** ★`sgstory#1743` A₁：**包限定读**（道具面）—— 同 id 跨包时取**那一包**自己的件（✗ 不靠装载序）。
 *   ① 赢家若**带包标**且正是所求包 ⇒ 直接给（O(1)）；
 *   ② 否则在**该包命名空间**里按「导出名 ↔ id」约例反查（道具面现状走这条 ✓）；
 *   ③ 判不出 ⇒ `undefined` **并记入未命中台账**（✗ 不静默、✗ 不回落给别包那件）。
 *   ★零回归：纯新增，✗ 不改 `get`／`set`／注册路径的任何行为。
 */
RPG.items.按包 = (包, id) => {
	const klass = RPG.items.get(id);
	if (!klass) return undefined;
	if (RPG.包标记(klass) === 包) return klass;
	const 得 = RPG.按包从空间(包, id, RPG.Item);
	if (得) return 得;
	未命中.push({ 包, id, 何以: RPG.包空间(包) ? '该包命名空间里没有「导出名 ↔ id」约例可判的类' : '找不到该包的命名空间（包未加载？）' });
	return undefined;
};

RPG.createItem = (id, overrides) => {
	const klass = RPG.items.get(id);
	if (!klass) throw new Error(`未注册的道具 id: ${id}`);
	return new klass(overrides);
};

/** 快照 → 实例（从 State / 存档还原） */
RPG.reviveItem = (snapshot) => {
	if (snapshot == null) throw new Error('reviveItem: 快照为空');
	if (typeof snapshot.used === 'function') return snapshot; // 已经是实例
	const item = RPG.createItem(snapshot.id);
	if (snapshot.charges != null) item.charges = snapshot.charges;
	item.equipped = snapshot.equipped === true;
	/* ★`sgstory#1935` ②：容器实例态还原（**只在对象真有这三项时** ⇒ ✗ 不把普通件写脏）✓ */
	for (const k of ['opened', 'disarmed', 'locked']) if (snapshot[k] !== undefined && k in item) item[k] = snapshot[k];
	/* ★`#1914`：**有号沿用**（存档往返不丢意图）＋ 把序列推到该号之上；**旧档无号则当场补发**
	 *   —— 每件各发一个（✗ 按 `id`+`charges` 回退：旧档里两件同类会被判成同一件，判据③钉住）。
	 *   ★`#1924`：同一处把**实体身份**（`entityId`）与**定义**（`definitionId`）补齐 —— 三者同源：
	 *   `entityId` ＝ 旧名 `slotId` 的那个号（`snapshot.slotId` 亦接受）。 */
	/* ★`#1924`：本处是**旧名的读取边界之一** —— 旧档快照只带 `slotId` ⇒ 认（一处回落），
	 *   回到活对象上只叫 `entityId`（✗ 不写回旧名）。 */
	const 身份 = snapshot.entityId ?? snapshot.slotId ?? null;
	if (身份 != null) { item.entityId = 身份; RPG.noteEntityId(身份); }
	else item.entityId = RPG.newEntityId();
	return item;
};

/**
 * 声明式定义道具（推荐）——自动合成类并注册，免去样板。
 * 一个道具可以有**多种使用方式**：used 是默认动作（action='use'），
 * 其余动作写在 actions 里，用字符串名区分（equip / unequip / read……）：
 *
 *   RPG.defItem({
 *     id: 'club', name: '木棒', weapon: true,
 *     used(that, from) { …默认动作：攻击… },
 *     actions: {
 *       equip: RPG.slotEquip,         // 共享动作库（槽位感知），见 30-inventory
 *       unequip: RPG.slotUnequip,
 *     },
 *   });
 *
 * 调用方：item.used(that, from, 'equip') 或托管路径
 * RPG.useItem(id, that, from, action)。复杂道具仍可手写 class。
 */
RPG.defItem = (def) => {
	if (!def || !def.id) throw new Error('defItem 定义缺少 id');
	if (typeof def.used !== 'function') {
		throw new Error(`defItem「${def.id}」必须提供 used(that, from)（默认动作）`);
	}
	const { used, actions = {}, ...defaults } = def;
	const klass = class extends RPG.Item {
		constructor(overrides) {
			super({ ...defaults, ...overrides });
		}
	};
	// 动作表挂在类上（静态）：实例经 JSON 克隆也不会丢处理器
	klass.handlers = { use: used, ...actions };
	Object.defineProperty(klass, 'name', { value: `Item:${def.id}` });
	return RPG.registerItem(klass);
};
