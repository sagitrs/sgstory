/* RPG 核心 —— 战斗相关的 Event（规则无关的回合循环）
 *
 *   BattleTurn —— 一个战斗回合（一名角色攻击一名目标）。
 *   Battle     —— 一整场战斗（turn 个回合，双方各自动出战）。
 *
 * 规则无关的关键：回合循环只负责“谁在何时行动”，判定与伤害的数学
 * 全部在各武器的 used() 里（3E 见 dnd3/items/club.js，wfrp 同理）。
 * 出局判定默认 hp 归零，其他规则包可覆写 Battle.prototype.isOut。
 */

/** 回合边界 —— 两条通路（Battle 循环 / #playerAction）共用的**唯一**实现。
 *
 * 事件：`battle:turnStart`（可**闸门**：订阅方置 `payload.cancel = true` ⇒ 该行动者本次不行动）
 *       `battle:turnEnd`（只读；payload 冻结）
 * 遗留事件 `battle:turn` 与 `BattleTurn.execute()` 保持零改（`battle:turn` 只在自动通路的
 * `BattleTurn.execute()` 内发射，交互通路**不补发**——补发会改 dnd3 交互战的可观测行为）。
 *
 * 失败处置通则：**损益可重试者吞并（本处，战斗编排点），损益不可逆者传播（结算管线）**。
 * 订阅方抛错一律吞并 + console.error，不得中断整场战斗（沿用 events.emit 既有形态）。
 * 定义级 hooks（RPG 效果的 hooks.onTurnStart/onTurnEnd）**只读**，不得置 cancel；
 * 顺序 = `c.effects` 数组序，单条抛错不中断其余（同样吞并 + console.error）。
 *
 * ⚠ 独立使用 `new RPG.BattleTurn(…).execute()` 时**不经本面**（由调用方自行调
 *   RPG.turnBoundary.start/end；tests/e2e/old-house/src/story/battles.twee 即此形态）。
 */
RPG.turnBoundary = {
	_runHooks(actor, key, payload) {
		// 只跑**行动者本人**所持效果的钩子，顺序 = `c.effects` 数组序（层级 id 取其 base 的定义）
		for (const id of actor?.effects ?? []) {
			const def = RPG.effects.get(RPG.effectSplit(id).base);
			const fn = def?.hooks?.[key];
			if (typeof fn !== 'function') continue;
			try {
				fn(actor, { battle: payload.battle, effectId: id }); // hooks 只读：改 cancel 无效
			} catch (ex) {
				console.error(`[RPG] 效果「${id}」的 ${key} 钩子出错：`, ex);
			}
		}
	},

	/** 回合开始：返回 { cancel, reason }（闸门）。cancel 只认 `=== true`；reason 只认字符串 */
	start(payload) {
		const p = { actor: payload.actor, battle: payload.battle ?? null, cancel: false, reason: null };
		RPG.events.emit('battle:turnStart', p);
		this._runHooks(p.actor, 'onTurnStart', p);
		return { cancel: p.cancel === true, reason: typeof p.reason === 'string' ? p.reason : null };
	},

	/** 回合结束（payload 冻结 ⇒ 订阅方改写无效/抛错，择一由实现定） */
	end(payload) {
		const p = Object.freeze({ actor: payload.actor, battle: payload.battle ?? null });
		RPG.events.emit('battle:turnEnd', p);
		this._runHooks(p.actor, 'onTurnEnd', p);
	},
};

RPG.BattleTurn = class BattleTurn extends RPG.Event {
	constructor(attacker, defender) {
		super();
		this.attacker = attacker;
		this.defender = defender;
	}

	/** 接口实现（继承自 Event；0 个参数）。**返回本次攻击的推进结果**（#1773）。
	 *
	 *  `#1773` 裁定（操作者 2026-10-01，案 1「拒绝不耗回合」）：`act` 被拒 ⇒ 本回合**被消耗但不推进**——
	 *  即：不攻击、不耗 `RPG.rng`、**不发 `battle:turn`**；而回合边界（`turnStart`/`turnEnd`）仍由调用方
	 *  **成对**发（防条件衰减回退，与闸门 `cancel` 分支同形）。⇒ 故返回值即「推进标记」。 */
	execute() {
		const r = this.#attack(this.attacker, this.defender);
		if (r.status === 'applied') {
			RPG.events.emit('battle:turn', {
				attacker: this.attacker,
				defender: this.defender,
			});
		}
		return r;
	}

	/** 私有函数：执行一次攻击（#前缀，外部不可访问）。
	 *
	 *  **返回推进结果**（#1773）：`{ status, reason? }`；`status === 'applied'` 才算本回合**有效推进**。
	 *  · **无武器**（只能干瞪眼）⇒ `rejected/no-weapon` —— ★与弹药不足**同规**（#1773 前它亦无条件推进，
	 *    属**零覆盖缺口**；操作者裁定「无武器分支同规」）；
	 *  · `RPG.act` 的返回**原样透传**（`rejected/no-ammo`／`rejected/action-refused` 等 ⇒ 不推进）。 */
	#attack(attacker, getDefender) {
		this.perform(`现在是${attacker.name}的回合。`);
		const weapon = attacker.contains(['weapon', 'equipped']);
		if (weapon == null) {
			this.perform(`${attacker.name}没有装备任何武器，只能干瞪眼。`);
			return { status: 'rejected', reason: 'no-weapon' };
		}
		/* ★`#1773`：**选靶延迟到此处**（`getDefender` 是 thunk），且**先做弹药只读预判** ——
		 *   因为选靶 `pick()` 会耗一个 `RPG.rng` 读数；若先选靶再被拒，「拒绝 ⇒ 不耗 rng」不成立。
		 *   预判与 `act` 闸门同口径（`RPG.ammoShort` 走 `heldTotal`，其 reduce 形与 `take` 逐字相同）。 */
		if (setup.RPG.ammoShort(attacker, weapon)) {
			this.perform(`${attacker.name}的「${weapon.name ?? weapon.id}」没有弹药 —— 这一手打不出去。`);
			return { status: 'rejected', reason: 'no-ammo', item: weapon };
		}
		const defender = typeof getDefender === 'function' ? getDefender() : getDefender;
		return setup.RPG.act(attacker, weapon.id, defender); // 统一入口（#1752）：弹药/充能副作用不再绕过
	}
};

/**
 * 重来（respawn）—— 战败角色的清算与复位（#1760 · 伞 #1728 死亡面七裁定）
 *
 * 设计稿：`docs/plan/1760-babel-respawn.md`（「裁定 → 落形 → 可判断据」三列；判据
 *   1／2a／2b／3a／3b／4 与 M1–M7 即本合同，落码逐条兑现）。
 *
 * **core 规则无关**（两条注入，与 `onReviveStats` 同族 —— core 不认识任何包）：
 *   · 起点层：读 **core 的层表注册面** `RPG.registerLayerMeta`/`RPG.startLayerId`（见下）——
 *     层表由**内容侧**注册，故 core 与各包都不认识别人的命名空间
 *   · `RPG.respawnHooks.clearEffects`  清档实现（`#1741` 的 `clearEffectsOnDeath` 在 **dnd-5e 包**内；
 *     core 不能直接调 ⇒ 由包侧注册。未注册时走 core 的无包语义兜底形）
 *
 * 顺序（三条理由见设计稿 §三，均已并入判据）：
 *   ① 幂等早退 ⇒ ② 掉落 ⇒ ③ 清档 ⇒ ④ 清 death 标记 ⇒ ⑤ HP 复位 ⇒ ⑥ 搬位置
 * ⚠ ③ 与 ④ 是**两步**：包侧清档**有意保留** death 标记（绷带复活依赖 `contains(death)`，
 *   见 `src/dnd/dnd-5e/core/conditions.js:201`）⇒ respawn 必须显式补一次 `lose(RPG.death)`。
 *   这是**实测事实**（design §五），非修辞。
 * ⚠ ⑤ 必须先于 ⑥：`moveTo` 会触发新层的 `onEnter` 钩子；若钩子读 `hp`，顺序反了会读到死亡态。
 */
RPG.respawnHooks = { clearEffects: null };

/* ---------- 层表注册面（`#1748` 层元数据契约的**归档处**）----------
 * ⚠ **为何在 core**：层表是**跨包共享的数据**，不是某个包的私有物。若让一个包直读另一个包的命名空间
 *   （首版 5E 包读 `setup.DND3.LAYER_META_SPAN1`），即违反 `src/README.md:13`
 *   「★规则包之间互不可见——共享的东西应下沉 core/」（T 席实测那处是**全仓唯一先例**）。
 *   ⇒ **注册方＝内容侧**（层元数据本就是内容物，如一段层表 `LAYER_META_SPAN1` 的拥有者 dnd3）；
 *     **消费方（core 的 respawn、任意包）只读**，包与包之间零认知。
 *   收益：单包部署时行为不再由「另一个包在不在」决定（首版会静默退化为「只清档不搬位」）。
 */
RPG.layerMeta = Object.create(null);   // 注册 id → 层表（保留注册顺序）

/** 注册一张层表（契约形见 `#1748`：`[{ id, type, start? }]`，**不校验内容**——那是内容侧的事）。 */
RPG.registerLayerMeta = (id, meta) => {
	if (typeof id !== 'string' || id === '') throw new Error('registerLayerMeta 需要非空 id');
	if (!Array.isArray(meta)) throw new Error('registerLayerMeta 的 meta 须是数组');
	/* ★重复注册**告警**（不抛）—— `#1816` MAJOR-1：原为**纯静默**覆盖，与既有形对齐。 */
	if (Object.prototype.hasOwnProperty.call(RPG.layerMeta, id)) {
		console.warn(`[RPG] 层表「${id}」重复注册：将被覆盖。`);
	}
	RPG.layerMeta[id] = meta;
	return meta;
};

/** 起点层 id：在**已注册**层表里找第一个 `start: true` 的元素（无注册／无标记 ⇒ `null`）。
 *  「最深处」的权威＝层表里的 `start: true`，本函数只是**读取器**，不另立权威（裁定②）。 */
RPG.startLayerId = () => {
	for (const id of Object.keys(RPG.layerMeta)) {
		const hit = RPG.layerMeta[id].find((l) => l && l.start === true);
		if (hit) return hit.id;
	}
	return null;
};

/** 注册「清档」实现：`fn(character) -> 清掉的条数`（包侧，通常转发 `clearEffectsOnDeath`）。 */
RPG.onRespawnClearEffects = (fn) => {
	if (typeof fn !== 'function') throw new Error('onRespawnClearEffects 需要函数');
	RPG.respawnHooks.clearEffects = fn;
	return () => { if (RPG.respawnHooks.clearEffects === fn) RPG.respawnHooks.clearEffects = null; };
};

/** core 的无包语义兜底清档：清掉除 death 外全部效果 id，并清空回合数表。返回清掉的条数。
 *  仅在某包**未**注册 `onRespawnClearEffects` 时使用。 */
RPG.respawnClearEffectsFallback = (c) => {
	const kept = RPG.death.id;
	const before = (c.effects ?? []).length;
	c.effects = (c.effects ?? []).filter((id) => id === kept);
	if ('effectTurns' in c) c.effectTurns = {};
	return before - c.effects.length;
};

/**
 * 把战败的角色送回起点层，并清算死亡后果。
 *
 * ⚠ **玩家路径的已知语义（判据 2b）**：玩家的 `items` ≡ `$inventory`（同引用，见两包 player.js）
 *   ⇒ `RPG.loot` 的 `push` 推的正是原数组 ⇒ 掉落对玩家表现为**顺序变化**而非移除。
 *   故本函数的返回值用 **`dropped` 计数**承载该事实；「掉落＝离开持有者」的语义级判定
 *   在**敌人路径**上做（设计稿判据 2a）。
 *
 * @param c    角色（须为 Character；否则视作不适用 ⇒ 幂等早退）
 * @param opts { to?: string, map?: WorldMap }
 * @returns { moved, dropped, cleared, from, to } —— `moved:false` 表示**幂等早退**（未处于死亡态）
 */
RPG.respawn = (c, { to, map } = {}) => {
	const idle = { moved: false, dropped: 0, cleared: 0, from: null, to: null };
	// ① 幂等早退：非角色 / 未死亡 ⇒ 不碰任何状态（与 grantDeathIfDown 同形，裁定⑦）
	if (!(c instanceof RPG.Character) || !c.contains(RPG.death)) return idle;

	// ② 掉落（裁定③④）：走与敌人战败**同一函数** `RPG.loot`（只转移未装备物）
	const before = (c.items ?? []).length;
	RPG.loot(c);
	const dropped = before - (c.items ?? []).length;

	// ③ 清档（其余效果，含 persistent）—— 经注入；未注册时用 core 兜底形
	const clear = RPG.respawnHooks.clearEffects;
	const cleared = typeof clear === 'function'
		? (clear(c) ?? 0)
		: RPG.respawnClearEffectsFallback(c);

	// ④ 清 death 标记（包侧清档**有意保留**它 —— ③④ 两步不可合并）
	c.lose(RPG.death);

	// ⑤ HP 复位（必须先于 ⑥：见文件头 ⚠；值取角色自身 maxHp，裁定④）
	c.hp = c.maxHp;

	// ⑥ 搬位置（纯 id；`to` 优先 —— M7 即打这条）
	const fromId = map?.current ?? null;
	const target = to ?? RPG.startLayerId();
	if (map && target != null) map.moveTo(target);

	return { moved: target != null || map != null, dropped, cleared, from: fromId, to: target };
};

/**
 * Battle —— 一整场战斗（同样是 Event）。
 * @param turn    int               最多进行的回合数
 * @param players array<Character>  玩家方
 * @param enemies array<Character>  敌方
 * @param interactive boolean 玩家行动通路，默认 false（全自动）。
 *   true 时，properties 含 'player' 的角色不再自动攻击，
 *   而是让玩家在其全部随身道具（含已装备武器）中选一件，
 *   再在所有存活角色中选一个目标，然后调用 use。
 *
 * execute()：每个回合为双方每名存活角色实例化一个 BattleTurn 并调用其
 * execute()；攻击目标从对面存活者中等概率随机选取。
 * 一方全部出局则提前结束。结束时广播 battle:end 事件。
 * 战斗过程通过 perform 逐行打印；含玩家回合时是异步的（返回 Promise）。
 */
RPG.Battle = class Battle extends RPG.Event {
	constructor(turn, players, enemies, interactive = false) {
		super();
		if (!Number.isInteger(turn) || turn < 1) {
			throw new Error(`Battle 的第 1 个参数应是正整数回合数，收到：${turn}`);
		}
		if (!Array.isArray(players) || !Array.isArray(enemies)) {
			throw new Error('Battle 的第 2、3 个参数应是 Character 数组');
		}
		this.rounds = turn;
		this.players = players;
		this.enemies = enemies;
		this.interactive = interactive === true;
		/* ★`#1773` 死锁护栏：**连续**「本次无推进」的次数（不分行动者 —— 领队裁「全局」）。
		 *   每场由 `execute()` 开头清零（✗ 跨场串味）。达 `REJECT_LIMIT` ⇒ 记日志并清零。 */
		this.rejectStreak = 0;
	}

	/** 连续拒绝上限（`#1773` 护栏 N=3）：达此数 ⇒ 强制跳过并**记日志**（✗ 静默）。 */
	static get REJECT_LIMIT() { return 3; }

	/** `#1773` 护栏：登记一次「本次无推进」；成功推进 ⇒ 计数归零。
	 *  ⚠ 在「拒绝已不推进」的新语义下，本护栏的**实际效果是可见性**（`perform` 日志）：
	 *    外层的 `for (round …)` 照走 ⇒ 不会真死锁（全员拒绝 ⇒ 跑到 `this.rounds` 后以「僵持」收场）。
	 *    它的价值在**让「有人一直在被拒」这件事可见**（✗ 静默地空转整场）。 */
	/** ★`#1837`（试玩首单）：`RPG.act` **可以抛** —— 道具的 `used()` 按设计抛错（资源的「误当消耗品」
	 *   `src/dnd/dnd3/items/resources.js:50`「明确抛错（而非静默）—— 误当消耗品 use 时应当响」），
	 *   而 `RPG.act` 自身只有 `try/finally`（`30-inventory.js:353`，**finally 清标记但不 catch**）
	 *   ⇒ 抛出**上抛**；战斗循环是 `async` 的 `await` 链（`execute()`）⇒ **抛出即打断 Promise**
	 *   ⇒ **整场战斗 UI 静默冻结**（实测：已问「对谁使用石料？」、之后再无输出；操作者侧即「无反应」）。
	 *
	 *   ⇒ 在**战斗侧**收口：把「动作抛出」转成 `rejected/action-threw` 结果，交**既有拒绝文案通路**上屏
	 *     —— 设计要的「**响**」到此才真正到达玩家（原先只在控制台里响）。
	 *   ⚠ **只包 `RPG.act` 这一调用**（✗ 包整个回合体）：其它异常仍须**上抛** ——
	 *     那是真缺陷，吞掉它会把「崩了」伪装成「动作被拒」。
	 *   ⚠ 属性 `message` 取自异常本身（道具作者写给自己玩家的文案）⇒ **原样**上屏，✗ 改写。 */
	#actCatching(actor, itemRef, target, action) {
		try {
			return setup.RPG.act(actor, itemRef, target, action);
		} catch (e) {
			/* ★**留痕**（`dev-10` D 席 MINOR，`#1841` 折）：本捕获是为「**按设计**抛错」的道具备的（资源
			 *   「误当消耗品」），但 `used()` 里的**真 bug** 也走到这里 ⇒ 只上屏会把「**代码崩了**」
			 *   显示成「按设计拒绝」，读者无从分辨 ⇒ **两面都留**：玩家看**文案**（上屏）、
			 *   作者看**栈**（控制台），✗ 只留其一。 */
			console.error('[RPG] 动作抛错（战斗侧已转为可读拒绝；此栈供排查是否为真 bug）:', e);
			return { status: 'rejected', reason: 'action-threw', itemRef, message: e?.message ?? String(e) };
		}
	}

	/** `#1837`：动作用抛错拒绝时的**可读**文案（原样引道具自己的话，见 `#actCatching`） */
	#throwText(attacker, r) {
		return `${attacker.name}这一手没能出手：${r.message} —— 本回合就此过去。`;
	}
	/** ★`#1854`：空手打击的**收口**（与 `#actCatching` 同旨 —— 抛错 ⇒ 可读拒绝，✗ 打断整场战斗）。
	 *  包侧 `strike(actor, target)` 契约与 `RPG.act` 同形：`undefined` ＝ 成功；`false` ＝ 拒绝。 */
	#strikeCatching(actor, target, un) {
		try {
			return un.strike(actor, target) === false
				? { status: 'rejected', reason: 'action-refused' }
				: { status: 'applied' };
		} catch (e) {
			/* 与 `#actCatching` 同形：玩家看**文案**、作者看**栈** */
			console.error('[RPG] 空手打击抛错（战斗侧已转为可读拒绝；此栈供排查是否为真 bug）:', e);
			return { status: 'rejected', reason: 'action-threw', message: e?.message ?? String(e) };
		}
	}

	#noteReject(attacker, r) {
		if (r?.status === 'applied') { this.rejectStreak = 0; return; }
		this.rejectStreak += 1;
		if (this.rejectStreak >= RPG.Battle.REJECT_LIMIT) {
			/* ★`#1863`：玩家层**白话**（✗ 票号／机制词「护栏·强制跳过」）；`rejectStreak` 的计数是**诊断量**，
			 *   留在实例字段里（`#1773` 护栏本体见上注），✗ 上屏。信息只**降级呈现**（「连着几回合没人动得了手」），✗ 删。 */
			this.perform(`连着几回合都没人动得了手——${attacker.name}这一回合也就这么过去了。`);
			this.rejectStreak = 0;
		}
	}

	/** 出局判定钩子：默认 HP 归零出局；wfrp 等规则包可覆写为昏迷/崩溃等 */
	isOut(c) {
		return c.isDown;
	}

	async execute() {
		this.rejectStreak = 0; // ★`#1773`：护栏计数**每场清零**（✗ 跨场串味）
		const alive = (group) => group.filter((c) => !this.isOut(c));
		/** 等概率随机选取一个存活目标（随机取值一律经 `RPG.rng`，见 §决策五 契约） */
		const pick = (group) => group[RPG.rng.index(group.length)];

		for (let round = 1; round <= this.rounds; round++) {
			if (alive(this.players).length === 0 || alive(this.enemies).length === 0) {
				break; // 一方全出局，战斗提前结束
			}
			this.perform(`【第 ${round} 回合】`);
			// 本回合行动名单：双方每名存活角色各行动一次。
			// 行动者契约是 Character——宝箱（Chest）等容器可以参战挨打，但没有回合
			const actors = [...alive(this.players), ...alive(this.enemies)].filter(
				(c) => c instanceof RPG.Character
			);
			for (const attacker of actors) {
				if (this.isOut(attacker)) continue; // 回合内被击倒的角色失去本次行动

				// ── 回合边界（F1：闸门与 turnStart **先于选靶**，被拦回合不消耗 RPG.rng 读数）──
				const gate = RPG.turnBoundary.start({ actor: attacker, battle: this });
				if (gate.cancel) {
					this.perform(`${attacker.name}无法行动${gate.reason ? `（${gate.reason}）` : ''}。`);
					RPG.turnBoundary.end({ actor: attacker, battle: this });
					continue;
				}

				const foes = this.players.includes(attacker)
					? alive(this.enemies)
					: alive(this.players);
				if (foes.length === 0) { // 行动途中对方被团灭（仍收尾回合边界）
					RPG.turnBoundary.end({ actor: attacker, battle: this });
					break;
				}

				const isPlayerControlled =
					this.interactive &&
					(attacker.properties ?? []).includes('player');
				if (isPlayerControlled) {
					await this.#playerAction(attacker); // 交互式回合（turnEnd 在通路的 finally）
				} else {
					// F2：自动通路的收尾同样包 try/finally（与交互通路的 finally **对称**）——
					// 武器 used() 等结算抛错时仍发 turnEnd，回合边界不因异常而漏（抛错本身照常传播）
					try {
						/* ★`#1773`（案 1「拒绝不耗回合」）：选靶传 **thunk** —— 只有真打得出去时才取靶
						 *  （否则 `pick()` 的 rng 读数会白耗）。返回值 `status` 决定本回合是否**推进**：
						 *   `applied` ⇒ 已发 `battle:turn`、已耗 rng；`rejected` ⇒ 三者皆无（不攻击/不耗 rng/
						 *   不发 `battle:turn`），但**回合边界照走**（`start`/`end` 成对，防条件衰减回退）。 */
						const r = new RPG.BattleTurn(attacker, () => pick(foes)).execute();
						this.#noteReject(attacker, r);
					} finally {
						RPG.turnBoundary.end({ actor: attacker, battle: this });
					}
				}
			}
		}

		// 战利品结算：战败的敌方（Character/Chest）身上未装备的道具归玩家；
		// 装备与技能不会掉落（见 RPG.loot）
		for (const enemy of this.enemies) {
			/* ★`#1854`：**打晕 ≠ 打死** ⇒ 非致命昏迷者**不掉落**（MSRD 语义；且未施加 `RPG.death`）。
			 *   `RPG.isKnockedOut` 单点判定（`hp` 未变、`nonlethal > hp`）⇒ 与致命路分开。 */
			if (this.isOut(enemy) && !RPG.isKnockedOut(enemy) && Array.isArray(enemy.items)) RPG.loot(enemy);
		}

		const playersAlive = alive(this.players).length > 0;
		const enemiesAlive = alive(this.enemies).length > 0;
		/* `#1798` B4：这是**结论行** ⇒ 走 `battle-end` 通道（`key`）——「仅关键」档下仍进正文。 */
		this.perform(
			!playersAlive
				? '战斗结束：你方全部倒下了……'
				: !enemiesAlive
					/* ★`#1854`：**全被非致命打晕** ⇒ 文案说「打晕」而非「击败」（打晕 ≠ 打死，玩家可见文本须一致）。
					 *   ⚠ 混编（有的死、有的晕）仍说「击败」—— 那是最保守的读法（✗ 逐敌列举）。 */
					? (this.enemies.length > 0 && this.enemies.every((e) => RPG.isKnockedOut(e))
						? '战斗结束：敌方被打晕了。'
						: '战斗结束：敌方被击败！')
					: `战斗结束：${this.rounds} 个回合后双方仍在僵持。`,
			{ channel: 'battle-end' }
		);

		RPG.events.emit('battle:end', {
			players: this.players,
			enemies: this.enemies,
		});
	}

	/**
	 * 构造交互回合的选项集合（纯函数，可单元测试）。
	 * 返回 { itemOptions, actionOptionsFor(item), targetOptions }。
	 */
	buildPlayerOptions(attacker) {
		const slots = attacker.items;

		/** 该道具在**战斗中**有哪些动作。
		 *  ★`#1841`（`#1837` 远修）：**声明了 `stats.noBattleUse` 的道具不亮「使用」**。
		 *    动因：资源类道具的 `used()` **按设计抛错**（「误当消耗品 use 时应当响」）⇒ 亮「使用」
		 *    等于把玩家引到一条注定被拒的路（`#1839` 的网会出声，但**筛掉更好**）。
		 *  ⚠ **判据为何不是 `handlers.use` 之有无**：本门**从不读** `handlers.use`（无条件 push），
		 *    且 `RPG.defItem` 强制要求 `used`（`10-item.js:125`）⇒ 69 个已注册道具**无一例外**都有
		 *    `handlers.use` ⇒ 那种判据**结构性空集**、照它实现 ＝ **零 diff**。
		 *  ⚠ **判据为何不是 `stats.craftInput`**：其语义是「可作建造输入」，与「战斗中没有动作」只是
		 *    **恰好相关**（当前 6 件重合）⇒ 将来「既是建造输入又能战斗使用」的道具会被**误隐藏**，
		 *    「非建造输入但战斗无动作」（剧情道具）又**漏网** ⇒ 用**专用声明**把意图写明。
		 *  ⚠ 默认取「**可用**」⇒ 其余 63 件行为**逐项不变**（零回归）。 */
		const actionOptionsFor = (item) => {
			const actions = [];
			if (!item.stats?.noBattleUse) actions.push({ text: `使用${item.name}`, value: 'use' });
			const handlers = item.constructor.handlers;
			if (!item.equipped && typeof handlers?.equip === 'function') {
				actions.push({ text: `装备「${item.name}」（消耗本回合）`, value: 'equip' });
			}
			if (item.equipped && typeof handlers?.unequip === 'function') {
				actions.push({ text: `卸下「${item.name}」（消耗本回合）`, value: 'unequip' });
			}
			return actions;
		};

		/* ★`#1841`：**零战斗动作**的道具**不列**进选单（✗ 列了就是**死路**：选中却无事可做）。
		 *   ★`value` 必须保**原槽位下标**（✗ 过滤后重编号）—— 下游按 `slots[Number(chosen)]` 取件，
		 *     重编号会**取错道具**（本笔最易写错的一处）。 */
		const itemOptions = [];
		slots.forEach((slot, i) => {
			const item = setup.RPG.reviveItem(slot);
			if (actionOptionsFor(item).length === 0) return;
			itemOptions.push({ text: `${item.name}${item.equipped ? '（已装备）' : ''}`, value: String(i) });
		});
		/* ★`#1854`：**空手打击**常驻项（形同 `skip`：不占背包槽、与 items 枚举并存）。
		 *   动因：纯资源背包（`noBattleUse` 全筛掉）时选单只剩「跳过」⇒ 操作者实测卡 8 回合僵局。
		 *   ★能力来自**角色类**（`attacker.constructor.unarmed`）—— 各包在自己 `Player` 上声明（✗ core 猜包名）：
		 *     三包攻击函数**签名同为 `(item, that, from)`** ⇒ 包侧只需给一个合成 item ＋ 转发。
		 *   ⚠ 缺声明（普通 `Character`／未接线的包）⇒ **不出现**（零回归）。 */
				/* ⚠ 读**实例自有**属性（✗ 只读 `constructor.unarmed`）—— 本席实测：`DND3.Player` 是 `defCharacter`
		 *   产出的**实例**（`attacker.constructor.name === 'Character'`）⇒ 写在 `Player` 上的 `unarmed` 是
		 *   **实例自有**属性、类上取不到。⇒ 两形都取（兼容将来改成子类的写法）。 */
		const unarmedOpt = attacker.unarmed ?? attacker.constructor?.unarmed ?? null;
		if (unarmedOpt) itemOptions.push({ text: unarmedOpt.text ?? '空手打击', value: 'unarmed' });
		itemOptions.push({ text: '（跳过本回合）', value: 'skip' });

		const everyone = [...this.players, ...this.enemies].filter((c) => !this.isOut(c));
		const targetOptions = everyone.map((c) => ({
			text: `${c.name}（${this.players.includes(c) ? '己方' : '敌方'}）`,
			value: c.name,
		}));

		return { itemOptions, actionOptionsFor, targetOptions };
	}

	/**
	 * 私有函数：玩家控制的交互式回合。
	 * 流程：选道具 → 选动作（使用/装备/卸下）→ 若使用则选目标 → 执行。
	 * 装备/卸下消耗整回合（不走目标选择）；使用武器时自动拔出（不额外消耗）。
	 * 选项构造在 buildPlayerOptions()（可测试纯函数），本方法只做交互与执行。
	 */
	/**
	 * 分派决策（纯函数，可单元测试）。
	 * 根据 chosen（道具选择）和 action（动作选择）返回执行指令：
	 *   { type: 'skip' }           → 跳过回合，不消耗资源
	 *   { type: 'equip', item }    → 装备，经 useItem 提交，消耗回合
	 *   { type: 'unequip', item }  → 卸下，经 useItem 提交，消耗回合
	 *   { type: 'unarmed' }       → 空手打击（`#1854`：**无 item**），进入目标选择
 *   { type: 'use', item }      → 使用，进入目标选择
	 */
	static dispatchAction(chosen, action, item) {
		if (chosen === 'skip') return { type: 'skip' };
		if (chosen === 'unarmed') return { type: 'unarmed' };   // ★`#1854`：空手（**无 item**）
		if (action === 'equip') return { type: 'equip', item };
		if (action === 'unequip') return { type: 'unequip', item };
		return { type: 'use', item };
	}

	async #playerAction(attacker) {
		// 回合末钩子在**所有出口**统一收尾（3 个 return ＋ 未来可能的抛错；turnStart 由调用方循环发）
		try {
			await this.#playerActionBody(attacker);
		} finally {
			RPG.turnBoundary.end({ actor: attacker, battle: this });
		}
	}

	async #playerActionBody(attacker) {
		const slots = attacker.items;
		/* ★`#1854`：**空手可用时不得早退** —— 这条早退正是操作者卡死的那条路径
		 *   （纯资源背包：`noBattleUse` 把它们全筛掉 ⇒ `itemOptions` 只剩「跳过」）。 */
		if (slots.length === 0 && !(attacker.unarmed ?? attacker.constructor?.unarmed)) {
			this.perform(
				`现在是${attacker.name}的回合。${attacker.name}没有任何道具，只能干瞪眼。`
			);
			return;
		}

		const { itemOptions, actionOptionsFor, targetOptions } = this.buildPlayerOptions(attacker);

		// ① 选道具
		/* ★`#1841`：背包里**没有一件**在战斗中有动作（如只带资源）⇒ 出声说明，
		 *   ✗ 让玩家对着只剩「（跳过本回合）」的菜单猜为何没有选项。
		 *   （`itemOptions` 恒含「跳过」⇒ 长度 1 ＝ 无可用道具。） */
		if (itemOptions.length === 1) this.perform(`${attacker.name}背包里的东西，在战斗中都用不上。`);
		this.perform(`现在是${attacker.name}的回合，请选择道具：`);
		const chosen = await attacker.choice(itemOptions);
		const item = (chosen === 'skip' || chosen === 'unarmed')
			? null : setup.RPG.reviveItem(slots[Number(chosen)]);

		// ② 选动作
		let action = 'use';
		if (item) {
			const actions = actionOptionsFor(item);
			if (actions.length > 1) {
				this.perform(`对「${item.name}」做什么？`);
				action = await attacker.choice(actions);
			} else if (actions.length === 1) {
				/* ★`#1841`：**唯一**那个动作就是它 —— ✗ 沿用上面的默认值（那隐含假定「≤1 个就是 use」：
				 *   本笔之前的代码正是如此，**只删选单项会静默 no-op**）。 */
				action = actions[0].value;
			}
			/* `actions.length === 0`（声明了 `noBattleUse` 却仍被选中 —— 只有桩/异常输入会走到）：
			 *   **有意留 `'use'`**，让道具自己的 `used()` 裁决 ⇒ 由 `#1839` 的 `#actCatching` 兜成**可读拒绝**。
			 *   ★两层是**筛**（本笔，玩家够不到）＋**网**（`#1839`，真抛错也出声且回合照走），✗ 择一。 */
		}

		// ③ 分派执行（决策在 dispatchAction，纯函数可测）
		const dispatch = RPG.Battle.dispatchAction(chosen, action, item);
		if (dispatch.type === 'skip') {
			this.perform(`${attacker.name}按兵不动。`);
			return;
		}
		if (dispatch.type === 'unarmed') {
			/* ★`#1854`：**空手打击** —— 走与 `use` 支同一形的目标选择；执行经**收口**（抛错 ⇒ 可读拒绝，
			 *   与 `#1839` 的 `#actCatching` 同旨）＋ `#noteReject`（拒绝计数照走 ⇒ `#1773` 护栏有效）。
			 *   ⚠ 空手**无 item** ⇒ 不经 `RPG.act`（无 charges／无弹药／无提交面）⇒ 直接调包侧 `strike`。 */
			const un = attacker.unarmed ?? attacker.constructor.unarmed;
			this.perform(`${attacker.name}挥拳出击 —— 对谁？`);
			const tn = await attacker.choice(targetOptions);
			const all = [...this.players, ...this.enemies].filter((c) => !this.isOut(c));
			const tgt = all.find((c) => c.name === tn);
			const rUn = this.#strikeCatching(attacker, tgt, un);
			if (rUn?.status === 'rejected') {
				if (rUn.reason === 'action-threw') this.perform(this.#throwText(attacker, rUn));
				else this.perform(`${attacker.name}这一手没能出手 —— 本回合就此过去。`);
			}
			this.#noteReject(attacker, rUn);
			return;
		}

		if (dispatch.type === 'equip' || dispatch.type === 'unequip') {
			/* ★`#1837`：本支与 use 支**同类**（都直面 `RPG.act` 的抛出面）⇒ 一并收口
			 * ⚠ `r?.`（`dev-10` D 席 · `#1841` 折）：**纯防御** —— 本席实测 `RPG.act` **不返 `false`**
			 *   （坏 `actor`／`itemRef` 一律**抛**；其余返 `{status,…}` ⇒ 经 `#actCatching` 后**恒为对象**）。
			 *   ★原文写「无玩家角色等形下可返回 `false`」是**错的**，已更正（`#1844` RC 自查 · `dev-9` 点）
			 *   —— **留一条假理由比不写更坏**：后来者会按它去防一个不存在的形。
			 *   ★另核 `#noteReject(attacker, r)` 收 falsy 亦**安全**（`r?.status` ⇒ 非 `applied` ⇒ 计数递增）。*/
			const r = this.#actCatching(attacker, dispatch.item.id, attacker, dispatch.type); // 统一入口（#1752）
			if (r?.reason === 'action-threw') this.perform(this.#throwText(attacker, r));
			this.#noteReject(attacker, r);
			return;
		}

		// 使用：选目标
		this.perform(`对谁使用${dispatch.item.name}？`);
		const targetName = await attacker.choice(targetOptions);
		const everyone = [...this.players, ...this.enemies].filter((c) => !this.isOut(c));
		const target = everyone.find((c) => c.name === targetName);

		/* ★`#1773` 判据 1（交互战）：`rejected` ⇒ 出**可读拒绝文案**（✗ 静默丢弃返回值 ——
		 *   那正是 `#1768` 审查提的 MINOR 本体：三处调用点连读数都没有）。
		 *   「本回合被消耗但不推进」的语义与自动通路一致：`battle:turn` 交互面本就不发，
		 *   而回合边界（`start`/`end`）由 `#playerAction` 的 `finally` **成对照发**（防条件衰减回退）。 */
		const r = this.#actCatching(attacker, dispatch.item.id, target); // 统一入口（#1752）
		if (r?.status === 'rejected') {
			/* ★`#1837`：抛出**单独一句**（✗ 塞进下面那个括号位 —— 道具自带文案已含括号，再套会嵌套）；
			 *   且**原样**用道具自己的话 ⇒ 玩家看到的是「为何不能用石料」的**因**，✗ 泛泛的「没能出手」。 */
			if (r?.reason === 'action-threw') this.perform(this.#throwText(attacker, r));
			else this.perform(`${attacker.name}这一手没能出手${r.reason === 'no-ammo' ? '（没有弹药）' : r.reason === 'no-such-item' ? '（道具不在身上）' : r.reason === 'action-refused' ? '（动作自己拒绝了）' : ''} —— 本回合就此过去。`);
		}
		this.#noteReject(attacker, r);
	}
};
