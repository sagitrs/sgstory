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
RPG.itemSlotSeq = 0;
RPG.newSlotId = () => `it-${(RPG.itemSlotSeq += 1)}`;

/** 让序列**越过**读到的号（读档/旧档都走；✗ 只读不推 ⇒ 之后发号必碰撞）。 */
RPG.noteSlotId = (slotId) => {
	const n = Number(String(slotId ?? "").replace(/^it-/, ""));
	if (Number.isFinite(n) && n > RPG.itemSlotSeq) RPG.itemSlotSeq = n;
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
		this.slotId = def.slotId ?? RPG.newSlotId();
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
		return { id: this.id, charges: this.charges, equipped: this.equipped, slotId: this.slotId };
	}
};

/** 注册道具类（添加新道具时调用；一般用 defItem 即可）。
 *  同 id 重复注册会 console.warn——两包同名道具后者遮蔽前者是已知风险。 */
RPG.registerItem = (klass) => {
	if (!(klass?.prototype instanceof RPG.Item)) {
		throw new Error(`registerItem: ${klass?.name} 不是 Item 的子类`);
	}
	const id = new klass().id;
	if (RPG.items.has(id)) {
		console.warn(`[RPG] 道具 id「${id}」重复注册：${RPG.items.get(id).name} 被覆盖。` +
			'如果两个规则包同名（如 club），后加载的会遮蔽先加载的——' +
			'消费方应直接用 new DND3.Club() / new DND5E.Club() 而非注册表查找。');
	}
	RPG.items.set(id, klass);
	return klass;
};

/** 按注册表创建新实例（overrides 可覆盖默认定义） */
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
	/* ★`#1914`：**有号沿用**（存档往返不丢意图）＋ 把序列推到该号之上；**旧档无号则当场补发**
	 *   —— 每件各发一个（✗ 按 `id`+`charges` 回退：旧档里两件同类会被判成同一件，判据③钉住）。 */
	if (snapshot.slotId != null) { item.slotId = snapshot.slotId; RPG.noteSlotId(item.slotId); }
	else item.slotId = RPG.newSlotId();
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
