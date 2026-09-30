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

RPG.Item = class Item extends Object {
	constructor(def) {
		super();
		if (new.target === RPG.Item) {
			throw new Error('Item 是抽象基类，请继承它或用 RPG.defItem() 声明');
		}
		if (!def || !def.id) throw new Error('道具定义缺少 id');
		this.id = def.id;
		this.name = def.name ?? def.id;
		this.desc = def.desc ?? '';
		/** 规则数值块（dnd3 填 ac/bab/str_mod…，wfrp 填 WS/BS/Wounds…，字段由规则包约定） */
		this.stats = { ...def.stats };
		/** 剩余使用次数；null 表示无限次 */
		this.charges = def.charges ?? null;
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
	 */
	used(that, from, action = 'use') {
		const handler = this.constructor.handlers?.[action];
		if (typeof handler !== 'function') {
			if (action === 'use') {
				throw new Error(`${this.constructor.name} 没有实现默认动作 used`);
			}
			this.perform(`「${this.name}」没有「${action}」这个用法。`);
			return;
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
		return { id: this.id, charges: this.charges, equipped: this.equipped };
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
