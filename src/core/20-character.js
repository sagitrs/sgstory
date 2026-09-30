/* RPG 核心 —— Character（冒险者 / 怪物 / NPC 的通用抽象）
 *
 * 与 Item 共同继承于 Object。
 * State（$变量）里建议存 toJSON() 出来的纯数据；需要方法时用
 * Character.of(纯对象) 临时包一层，或像 dnd3/player.js 那样做访问器桥接。
 */

RPG.Character = class Character extends Object {
	constructor({
		name = '无名者',
		hp = 10,
		maxHp = hp,
		stats = {},
		items = [],
		properties = [],
	} = {}) {
		super();
		this.name = name;
		this.maxHp = maxHp;
		this.hp = Math.min(hp, maxHp);
		/** 规则数值块（字段由规则包约定：dnd3 用 ac/bab/str_mod，wfrp 用 WS/Wounds…） */
		this.stats = { ...stats };
		/** 随身道具快照（Player 会被访问器桥接到 $inventory） */
		this.items = items;
		/** 角色性质标签。含 'player' 的角色在 Battle 的交互通路中由玩家亲自操作 */
		this.properties = properties;
		/** 持有的效果/减益，存 Effect 的 id 字符串（Player 桥接到 $player.effects） */
		this.effects = [];
	}

	get isDown() {
		return this.hp <= 0;
	}

	/**
	 * 重载检索：
	 *   contains(effect) → 是否已持有该效果/减益（布尔值）
	 *   contains(props)  → 在随身道具中检索满足全部给定属性（真值）的道具，
	 *                      返回还原后的实例（例如 ['weapon', 'equipped']），
	 *                      没有则返回 null
	 */
	contains(propsOrEffect) {
		if (propsOrEffect instanceof RPG.Effect) {
			return this.effects.includes(propsOrEffect.id);
		}
		const props = Array.isArray(propsOrEffect) ? propsOrEffect : [];
		return (
			this.items
				.map((snapshot) => setup.RPG.reviveItem(snapshot))
				.find((item) => props.every((p) => item[p])) ?? null
		);
	}

	/** 获得一个效果/减益（幂等：已持有则不重复添加） */
	gain(effect) {
		if (!(effect instanceof RPG.Effect)) {
			throw new Error(`gain 的参数应是 Effect 实例，收到：${effect}`);
		}
		if (!this.contains(effect)) this.effects.push(effect.id);
		return this;
	}

	/** 失去一个效果/减益 */
	lose(effect) {
		if (!(effect instanceof RPG.Effect)) {
			throw new Error(`lose 的参数应是 Effect 实例，收到：${effect}`);
		}
		const i = this.effects.indexOf(effect.id);
		if (i !== -1) this.effects.splice(i, 1);
		return this;
	}

	/**
	 * 接口（所有 Character 实例从父类继承）：
	 * 让本角色使用道具，作用于目标 that。
	 *   第 1 参 item：Item 实例
	 *   第 2 参 that：任意目标对象（Object）
	 * 效果：委托调用 item.used(that, this) —— this 即施用者 from，
	 * 因此目标可获得本角色 stats 数值块里的加成。
	 * 结果由 item.used 内部 perform 打印，本方法不返回值。
	 */
	use(item, that) {
		if (!(item instanceof RPG.Item)) {
			throw new Error(`Character.use 的第 1 个参数必须是 Item 实例，收到的是 ${item}`);
		}
		item.used(that, this);
	}

	/** 治疗 n 点，返回实际恢复量 */
	heal(n) {
		const before = this.hp;
		this.hp = Math.min(this.maxHp, this.hp + n);
		return this.hp - before;
	}

	/** 扣除 n 点，返回实际扣血量 */
	damage(n) {
		const before = this.hp;
		this.hp = Math.max(0, this.hp - n);
		return before - this.hp;
	}

	/** 纯对象 → Character 实例 */
	static of(plain) {
		return new RPG.Character(plain);
	}

	toJSON() {
		return { name: this.name, hp: this.hp, maxHp: this.maxHp, stats: this.stats };
	}
};

/** 声明式定义角色（推荐）—— new Character(def) 并按 id 登记到 characters 注册表 */
RPG.defCharacter = (def) => {
	const c = new RPG.Character(def);
	if (def && def.id) RPG.characters.set(def.id, c);
	return c;
};
