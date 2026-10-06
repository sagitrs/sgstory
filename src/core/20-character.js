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
		/* ★`sgstory#2027`：**初始效果**（声明式）—— 供「先天能力」落位（例：水元素的 `water-mastery`，
		 *   见 `monsters/water-elemental.js`）。之前只能靠模块末尾逐只 `gain()`，而 `:enginerestart` 后的
		 *   复位会把它漏掉（那种「声明层与复位层两处各写一份」正是本仓反复踩的漂移源）。
		 *   ⚠ 缺省 `[]` ⇒ 玩家与既有怪物的 `effects` 面**逐字不变**（零回归）。 */
		effects = [],
		protagonist = false,
		/* ★`sgstory#1935`（`[identity-enemies-save]`）：**持久单位号** —— 缺省 `null` ⇒ **不写键** ✓
		 *   （同 `nonlethal` 的零回归形：没参战过的角色快照逐键不变 ✓）；有号时把它**顶上水位** ✓。 */
		entityId = null,
	} = {}) {
		super();
		if (entityId != null && entityId !== '') { this.entityId = entityId; RPG.unitId?.note?.(entityId); }
		this.name = name;
		this.maxHp = maxHp;
		this.hp = Math.min(hp, maxHp);
		/** 规则数值块（字段由规则包约定：dnd3 用 ac/bab 与原始分 str…，wfrp 用 WS/Wounds…） */
		this.stats = { ...stats };
		/** 随身道具快照（Player 会被访问器桥接到 $inventory） */
		this.items = items;
		/** 角色性质标签。含 'player' 的角色在 Battle 的交互通路中由玩家亲自操作 */
		this.properties = properties;
		/** ★`sgstory#1934`（doc-3 §6.3）：**主角标记** —— 战果解析器据它判「主角死 ⇒ death」。
		 *   与 `properties` 的 `'player'` **不是一回事**：后者是「交互通路由玩家操作」，
		 *   本标记是「这一方的主控角色」（将来主角带同伴时二者会分家）。 */
		this.isProtagonist = protagonist === true;
		/** 持有的效果/减益，存 Effect 的 id 字符串（Player 桥接到 $player.effects）
		 *  ★`#2027`：初始表经 `RPG.resolveEffect` **注册即验**（未注册／形态非法 ⇒ **加载期即抛**，
		 *    同 `core/passives.js` 的「注册即验」形）—— ✗ 不等到战斗深处再以 `EFFECT_UNKNOWN` 暴露。 */
		this.effects = effects.map((e) => RPG.resolveEffect(e));
		/** 按回合计时的效果剩余回合数（id → n；纯数据 ⇒ 随 toJSON 存档）。
		 *  与 effects 同生共死：效果被移除时其条目一并删除（见 #1741 的 tickTurnDurations／clearBattleScoped） */
		this.effectTurns = {};
	}

	/** ★`sgstory#1934`（doc-3 §10.1）：**角色运行态**（战斗期状态的家）。
	 *   出处逐字：「状态存入 `actorRuntime.guard`，包含生效行动序号和到期边界」⇒ 本落形＝
	 *   `RPG.actorRuntime(actor)` 返回**每角色一份**的纯数据盒子，`guard` 就在里面。
	 *   ⚠ 纯数据（判据／存档只看数据）＋与实例**同生共死**（随 `toJSON`／`revive` 往返）。
	 *   ⚠ 惰性建：**没有运行态的角色的 `toJSON()` 输出逐键不变**（本仓有逐字节快照类断言）。 */

	get isDown() {
		/* ★`#1854`：**非致命昏迷**亦算出局（d20 语义：打晕 ≠ 打死，但都出局）。
		 *   判据是 `RPG.isKnockedOut()`（单点）—— `hp <= 0` 是**致命**出局；非致命路**不改 hp**、
		 *   只累积 `nonlethal` ⇒ 故须两条都看，否则「打晕的敌人」仍会继续行动。
		 *   ⚠ 死亡**不**由此触发：三包的 `grantDeathIfDown` 各自显式判 `hp <= 0`（✗ `isDown`）。 */
		return this.hp <= 0 || RPG.isKnockedOut(this);
	}

	/**
	 * 重载检索（两条互斥分支）：
	 *   contains(ref)   → 是否已持有该效果/减益（布尔值）
	 *       ref = 已注册的 id 串 | Effect 实例（含层级 id，如 'exhaustion:3'）
	 *       层级 base（如 'exhaustion'）⇒ **任一层级为真**（严格前缀匹配）
	 *   contains(props) → 在随身道具中检索满足全部给定属性（真值）的道具，
	 *       返回还原后的实例（例如 ['weapon', 'equipped']），没有则返回 null
	 *
	 * ⚠ 非数组、非字符串、非 Effect 实例的入参**一律抛错**（err.code='EFFECT_BAD_REF'）。
	 *   旧行为把裸 id / null / 0 / '' 当作空 props 数组 ⇒ 静默返回「首个随身道具」（恒真幽灵）；
	 *   未注册 id 同样抛错（err.code='EFFECT_UNKNOWN'）——读路径不得静默假阴性。
	 */
	contains(propsOrEffect) {
		if (Array.isArray(propsOrEffect)) {
			return (
				this.items
					.map((snapshot) => setup.RPG.reviveItem(snapshot))
					.find((item) => propsOrEffect.every((p) => item[p])) ?? null
			);
		}
		const spec = RPG.effectSpec(propsOrEffect, 'any');
		if (spec.leveled && spec.level === null) {
			const prefix = `${spec.base}:`; // 严格前缀：'exhaustionFoo' 不得命中 'exhaustion'
			return this.effects.some((id) => {
				if (!id.startsWith(prefix)) return false;
				const n = RPG.effectLevelOfId(id, spec.def);
				return n >= spec.def.levels.min && n <= spec.def.levels.max;
			});
		}
		return this.effects.includes(spec.id);
	}

	/** 获得一个效果/减益（幂等：已持有同 id 则不重复添加）
	 *  ref = 已注册的 id 串（层级效果须带层数，如 'exhaustion:3'）| Effect 实例
	 *
	 *  ⚠ **层级效果是原子升降级**（#1713 裁定 ★①甲）：gain 新层前先移除同 base 的其它层
	 *  ⇒ 同一层级效果在 c.effects 中**至多一条**，effectLevel() 的单值承诺由此成立。
	 *  （#1689 的「升降级 = lose 旧级 + gain 新级」仍可显式写，但不再是非此不可的两步。） */
	gain(ref) {
		const spec = RPG.effectSpec(ref, 'id'); // 归一化：非法形态/未注册/层级缺失或越域 ⇒ 抛错
		if (spec.leveled) {
			const prefix = `${spec.base}:`;
			this.effects = this.effects.filter((id) => !id.startsWith(prefix));
		}
		/* ★**用赋值，✗ 用 `push`**（`#1787`）：读面为纯净起见走 `effects ?? []`（✗ 读时写存档，见 player.js），
		 *   而 `?? []` **每次返回新数组** ⇒ 此处若写 `this.effects.push(id)`，则 `includes` 与 `push` 会
		 *   **各调一次 getter**，`push` 落在**弃数组**上 ⇒ **静默漏损**（实测：`gain('fear')` 后
		 *   `contains('fear')` 仍 false、`$player.effects` 仍 undefined）。
		 *   ★**这比原先的抛错更危险** —— 崩溃至少可见，静默丢失不可见。
		 *   ⇒ 改**赋值**：走 setter ⇒ 经桥接真正写回 `$player.effects`（对怪物实例则同形落字段）。
		 *   ⚠ 上面层级分支的 `filter` 赋值**本来就**走 setter（无此问题）；本条补的是**非层级路径**。 */
		if (!this.effects.includes(spec.id)) this.effects = [...this.effects, spec.id];
		return this;
	}

	/** 失去一个效果/减益（幂等：未持有不报错）
	 *  层级效果传裸 base（如 'exhaustion'）⇒ **移除全部层级**；传 'exhaustion:3' ⇒ 精确移除该层 */
	lose(ref) {
		const spec = RPG.effectSpec(ref, 'all');
		if (spec.leveled && spec.level === null) {
			const prefix = `${spec.base}:`;
			this.effects = this.effects.filter((id) => !id.startsWith(prefix));
			this.#pruneEffectTurns();          // 单点清理：不留孤儿回合数条目
			return this;
		}
		const i = this.effects.indexOf(spec.id);
		if (i !== -1) this.effects.splice(i, 1);
		this.#pruneEffectTurns();
		return this;
	}

	/** 私有：把 `effectTurns` 里已不在 `effects` 的条目清掉（#1741 MINOR-5）。
	 *  **单点**职责 —— 任何移除路径（含未来新增）都经 `lose()` ⇒ 不会留孤儿键。 */
	#pruneEffectTurns() {
		const left = this.effectTurns;
		if (left == null) return;
		for (const id of Object.keys(left)) {
			if (!this.effects.includes(id)) delete left[id];
		}
	}

	/** 层级效果的当前级数（0 = 未持有；非层级效果 ⇒ 抛错 err.code='EFFECT_NO_LEVELS'） */
	effectLevel(ref) {
		const spec = RPG.effectSpec(ref, 'any');
		if (!spec.leveled) {
			throw RPG.effectError('EFFECT_NO_LEVELS', `效果「${spec.base}」没有层级`);
		}
		for (const id of this.effects) {
			if (id.startsWith(`${spec.base}:`)) {
				const n = RPG.effectLevelOfId(id, spec.def);
				if (n >= spec.def.levels.min && n <= spec.def.levels.max) return n;
			}
		}
		return 0;
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

	/** 快照 → 实例（从 State / 存档还原，保留 hp/items/effects 等可变态）。
	 *  存档安全：SugarCube 只序列化 State.variables——角色 hp/isDown 必须
	 *  存在 State 里（如 $actors = { goblin: goblin.toJSON() }）才能进档。
	 *  推荐模式：战斗中改堆上实例 → 战毕写回 State → 读档时 revive。 */
	static revive(snapshot) {
		if (snapshot == null) throw new Error('Character.revive: 快照为空');
		const c = new RPG.Character({
			entityId: snapshot.entityId,
			name: snapshot.name,
			hp: snapshot.hp,
			maxHp: snapshot.maxHp,
			stats: { ...(snapshot.stats ?? {}) },
			items: snapshot.items ?? [],
			properties: snapshot.properties ?? [],
		});
		// 效果面按 id 串还原（存档安全）。**未注册 / 形态非法的 id 一律保留**：
		// 旧档（或未加载的 pack）里的 id 不得让读档硬抛错；注册表无法解释的形态同样保真保留，
		// 否则读档一次就丢数据（真实未知 vs 存量畸形无法区分，见 #1713 F3 / §1.3）。
		// 包侧修补（Symbol 标识等在 JSON 往返中丢失的键）——core 不认识任何包名
		for (const fn of RPG.reviveHooks ?? []) fn(c.stats);
		/* ★`#1854`：非致命累积随档还原（`toJSON` 写了才在；与 `hp` 同等待遇）。 */
		if (typeof snapshot.nonlethal === 'number') c.nonlethal = snapshot.nonlethal;
		/* ★`#1934`：主角标记与运行态（`toJSON` 写了才在 —— 与 `nonlethal` 同形，✗ 猜默认值）。 */
		if (snapshot.isProtagonist === true) c.isProtagonist = true;
		if (snapshot.runtime && typeof snapshot.runtime === 'object') c.runtime = { ...snapshot.runtime };
		c.effects = [...(snapshot.effects ?? [])];
		c.effectTurns = { ...(snapshot.effectTurns ?? {}) };
		for (const id of c.effects) {
			const known = typeof id === 'string' && RPG.effects.has(RPG.effectSplit(id).base);
			const valid = known && RPG.effectLevelOfId(id) > 0;
			const leveledBase = known && RPG.effectSplit(id).levelText === null;
			if (valid || leveledBase) continue;
			console.warn(`[RPG] 存档含未注册或不可解释的效果 id「${id}」` +
				'（可能来自旧档或未加载的 pack）；已保留。');
		}
		return c;
	}

	toJSON() {
		const o = {
			name: this.name, hp: this.hp, maxHp: this.maxHp,
			stats: this.stats, items: this.items,
			effects: this.effects, effectTurns: this.effectTurns, properties: this.properties,
		};
		/* ★`#1854`：非致命累积**是伤势态**（guest-1 裁 ②：与 `hp` 同类，✗ 瞬时）⇒ 必须进档。
		 *   ⚠ **仅在非零时写键**：`0`／`undefined` 一律不写 —— 保证「从未受过非致命伤」的角色
		 *     `toJSON()` 输出与 `#1854` 之前**逐键相同**（零回归；本仓有逐字节快照类断言）。 */
		if (this.nonlethal) o.nonlethal = this.nonlethal;
		/* ★`#1934`：主角标记与运行态**仅在非空时写键**（同 `nonlethal` 的理由：零回归）。 */
		if (this.isProtagonist) o.isProtagonist = true;
		if (this.runtime && Object.keys(this.runtime).length > 0) o.runtime = this.runtime;
		/* ★`sgstory#1935`：**持久单位号**仅在**发过号时**写键（同 `nonlethal` 的零回归形 ⇒
		 *   未参战角色快照逐键不变 ✓）；`revive` 见到它就把水位顶上 ⇒ 新发号不撞档里的号 ✓。 */
		if (typeof this.entityId === 'string' && this.entityId !== '') o.entityId = this.entityId;
		return o;
	}
};

/** 声明式定义角色（推荐）—— new Character(def) 并按 id 登记到 characters 注册表。
 *  同 id 重复注册会**如实上报**（`RPG.regWarn.报` ⇒ 加载期汇总一条 warn；与 registerItem 同理）。 */
/**
 * 还原钩子登记表（`#1758` 甲/丙形）：`revive()` 对 `stats` 的**包侧修补**点。
 *
 * 为什么需要：包的**标识**（如 `setup.DND5E.PACK` 这类 Symbol 键）**不进 JSON** ⇒ 存档往返后丢失。
 *   Symbol 是判据（如 `#1741` 闸门「只接管本包角色」）的载体，丢了就会**静默失效**。
 * core 不硬编码任何包名（零 pack 依赖）⇒ 由各包**自行注册**一个修补函数；
 *   它接收 `stats` 并**就地**重挂自己的标识（键集与 JSON 面**零变化**）。
 */
/* ---------- `#1854`：**伤害施加的唯一入口**（致命／非致命两路）----------
 *
 * 为何要单点：非致命是 d20 的**独立计数**（`nonlethal`），与 `hp` 分开 —— `hp > 0` 但 `nonlethal > hp`
 *   仍是**昏迷出局**。若三个包各自写 `that.hp = Math.max(0, …)`，非致命语义会**三份漂移**。
 *
 * ★规则出处：空手＝非致命见 pinned `27msrdcombat战斗-d20m.md:333-341`；
 *   **累积阈值不在 pin 里**（本席逐文件核过：19 个 pinned 文件中含 `nonlethal` 的 4 个均无「累积段」）
 *   ⇒ 按本仓纪律标 **house rule（非 SRD）**：**唯一**阈值 `nonlethal > hp` ⇒ **昏迷出局**。
 *     ⚠ pin 的 `nonlethal >= hp`「**踉跄**」态**本引擎不实现** —— 全仓无 `staggered` 读数
 *       ⇒ ✗ 不静默丢弃：显式记在此（与 `armed`／借机攻击 同一形：贴 pin 出处、写「不实现」）。
 */
/** 是否因**非致命**伤害而昏迷（出局）。⚠ 与 `hp <= 0`（致命）**分开**：本函数只看非致命计数。 */
RPG.isKnockedOut = (c) => (c?.nonlethal ?? 0) > (c?.hp ?? 0);

/** ★`#1934`：**每角色一份的运行态**（惰性建；纯数据 ⇒ 随档往返）。 */
RPG.actorRuntime = (actor) => {
	if (actor == null || typeof actor !== 'object') throw new Error('RPG.actorRuntime 需要一个角色对象');
	if (!actor.runtime || typeof actor.runtime !== 'object') actor.runtime = {};
	return actor.runtime;
};

/** ★`#1934`（doc-3 §10.1）：**防御状态**（`actorRuntime.guard`）。
 *   原文口径：消耗一次行动；提交后生效，到**该角色下一次行动机会开始前**失效；**不叠加**；战斗结束清除；
 *   窗口内每次**直接攻击**最终伤害减半（多段分别结算）。⇒ 本面只管**状态与判活**，
 *   「序号怎么算」（谁是下一次行动机会）归**战斗循环**（`40-battle.js`）——那里才有回合/行动计数。
 *   ⚠ 判活用**单调行动序号**：`生效序号 <= 当前 < 到期边界`。 */
RPG.guard = {
	/** 起防御（✗ 叠加：直接覆盖）。@param 边界 `{ 生效序号, 到期边界 }`（都是整数） */
	arm(actor, { 生效序号, 到期边界 } = {}) {
		if (!Number.isInteger(生效序号) || !Number.isInteger(到期边界)) {
			throw new Error('RPG.guard.arm 需要整数「生效序号」与「到期边界」');
		}
		RPG.actorRuntime(actor).guard = { 生效序号, 到期边界 };
		return RPG.actorRuntime(actor).guard;
	},
	/** 是否在防御窗口内。
	 *   · 给了 `当前序号` ⇒ 判**窗口**（`生效序号 <= 当前 < 到期边界`）；
	 *   · 没给 ⇒ 只判「已起且未被清」（`arm` 之后、`clear` 之前）—— 战斗循环是唯一知道序号的地方，
	 *     它不在场时**不得**替它判死（本席第一版用 `-Infinity` 当缺省 ⇒ 窗口恒假 ⇒ 防御永远不减伤 ✗，
	 *     正是本档 `防御④` 那格把它抓出来的）。 */
	isActive(actor, 当前序号 = null) {
		const g = actor?.runtime?.guard;
		if (!g) return false;
		if (当前序号 == null) return true;
		return 当前序号 >= g.生效序号 && 当前序号 < g.到期边界;
	},
	/** 清防御（战斗结束、或该角色下一次行动机会开始前由循环调用）。 */
	clear(actor) {
		if (actor?.runtime && 'guard' in actor.runtime) delete actor.runtime.guard;
	},
	/** 读原始状态（判据／文案用；✗ 别拿它当判活——判活走 `isActive`）。 */
	of: (actor) => actor?.runtime?.guard ?? null,
};
/** 施加伤害（**唯一入口**）。
 *  @param that 目标角色
 *  @param dmg  伤害值（调用方已算好，含下限与修正）
 *  @param opts.nonlethal `true` ＝ 非致命（默认 `false` ＝ 既有致命路，逐字不变）
 *  @returns `{ lethal, nonlethal, hp?, total? }` —— 供调用方写文案用（✗ 调用方自行改 `hp`）。
 *  ⚠ 本函数**不**施加 `RPG.death`：死亡判定仍由各包的 `grantDeathIfDown` 负责（`hp <= 0`）⇒
 *    非致命路**永不**致死，也**不**掉战利品（见 `40-battle.js` 的 `RPG.loot` 调用点）。 */
RPG.applyDamage = (that, dmg, { nonlethal = false, direct = false, ignoresGuard = false } = {}) => {
	/* ★`#1934`（doc-3 §10.1）：**防御减伤** —— 位置就在「重击倍率与固定伤害修正**之后**、
	 *   实际扣 HP／非致命伤**之前**」（调用方给的是**已算好的最终伤害**）⇒ 落点是本函数。
	 *   · 只减**直接攻击**（`direct:true`）：环境伤害与持续伤害**默认不减免**（照原文）；
	 *   · 特殊攻击可声明 `ignoresGuard:true` 忽略防御（照原文）；
	 *   · **半伤·向下取整·允许 0**（照原文：3→1、1→0）⇒ `Math.floor(dmg / 2)`；
	 *   · 创伤阈值读**减伤后**的伤害 ⇒ 因为下游拿到的就是本函数用的这个 `dmg`（✗ 原伤害）。 */
	if (direct && !ignoresGuard && RPG.guard.isActive(that)) dmg = Math.floor(Number(dmg ?? 0) / 2);
	if (nonlethal) {
		/* 非致命**独立计数**，✗ 不碰 `hp`（打晕 ≠ 打死）。 */
		that.nonlethal = (that.nonlethal ?? 0) + dmg;
		return { lethal: false, nonlethal: true, total: that.nonlethal };
	}
	that.hp = Math.max(0, (that.hp ?? 0) - dmg);
	return { lethal: true, nonlethal: false, hp: that.hp };
};

RPG.reviveHooks = [];

/** 注册一个「还原时修补 stats」的钩子；返回注销函数（幂等注册由调用方负责） */
RPG.onReviveStats = (fn) => {
	if (typeof fn !== 'function') throw new Error('onReviveStats 需要函数');
	RPG.reviveHooks.push(fn);
	return () => {
		const i = RPG.reviveHooks.indexOf(fn);
		if (i !== -1) RPG.reviveHooks.splice(i, 1);
	};
};

/** ★`sgstory#1743` A 支：角色的**包限定读**（形与 `RPG.items.按包` 同 —— 帮手共用 `RPG.包标记` ✓）。 */
RPG.characters.按包 = (包, id) => {
	const c = RPG.characters.get(id);
	if (!c) return undefined;
	if ((RPG.包标记?.(c) ?? null) === 包) return c;                 // 赢家正好是所求包 ⇒ 直给
	return RPG.按包从空间?.(包, id, RPG.Character);                 // 否则去那包的命名空间反查
};

RPG.defCharacter = (def) => {
	const c = new RPG.Character(def);
	if (def && def.id) {
		if (RPG.characters.has(def.id)) {
			RPG.regWarn.报('角色', `${def.id}`, `已存在，将被覆盖`);
		}
		RPG.characters.set(def.id, c);
	}
	return c;
};
