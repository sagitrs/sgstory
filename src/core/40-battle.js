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
	#noteReject(attacker, r) {
		if (r?.status === 'applied') { this.rejectStreak = 0; return; }
		this.rejectStreak += 1;
		if (this.rejectStreak >= RPG.Battle.REJECT_LIMIT) {
			this.perform(`★连续 ${this.rejectStreak} 次无人能行动 ⇒ ${attacker.name} 本回合强制跳过（#1773 护栏）。`);
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
			if (this.isOut(enemy) && Array.isArray(enemy.items)) RPG.loot(enemy);
		}

		const playersAlive = alive(this.players).length > 0;
		const enemiesAlive = alive(this.enemies).length > 0;
		/* `#1798` B4：这是**结论行** ⇒ 走 `battle-end` 通道（`key`）——「仅关键」档下仍进正文。 */
		this.perform(
			!playersAlive
				? '战斗结束：你方全部倒下了……'
				: !enemiesAlive
					? '战斗结束：敌方被击败！'
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
		const itemOptions = slots.map((slot, i) => {
			const item = setup.RPG.reviveItem(slot);
			return { text: `${item.name}${item.equipped ? '（已装备）' : ''}`, value: String(i) };
		});
		itemOptions.push({ text: '（跳过本回合）', value: 'skip' });

		const actionOptionsFor = (item) => {
			const actions = [{ text: `使用${item.name}`, value: 'use' }];
			const handlers = item.constructor.handlers;
			if (!item.equipped && typeof handlers?.equip === 'function') {
				actions.push({ text: `装备「${item.name}」（消耗本回合）`, value: 'equip' });
			}
			if (item.equipped && typeof handlers?.unequip === 'function') {
				actions.push({ text: `卸下「${item.name}」（消耗本回合）`, value: 'unequip' });
			}
			return actions;
		};

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
	 *   { type: 'use', item }      → 使用，进入目标选择
	 */
	static dispatchAction(chosen, action, item) {
		if (chosen === 'skip') return { type: 'skip' };
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
		if (slots.length === 0) {
			this.perform(
				`现在是${attacker.name}的回合。${attacker.name}没有任何道具，只能干瞪眼。`
			);
			return;
		}

		const { itemOptions, actionOptionsFor, targetOptions } = this.buildPlayerOptions(attacker);

		// ① 选道具
		this.perform(`现在是${attacker.name}的回合，请选择道具：`);
		const chosen = await attacker.choice(itemOptions);
		const item = chosen === 'skip' ? null : setup.RPG.reviveItem(slots[Number(chosen)]);

		// ② 选动作
		let action = 'use';
		if (item) {
			const actions = actionOptionsFor(item);
			if (actions.length > 1) {
				this.perform(`对「${item.name}」做什么？`);
				action = await attacker.choice(actions);
			}
		}

		// ③ 分派执行（决策在 dispatchAction，纯函数可测）
		const dispatch = RPG.Battle.dispatchAction(chosen, action, item);
		if (dispatch.type === 'skip') {
			this.perform(`${attacker.name}按兵不动。`);
			return;
		}
		if (dispatch.type === 'equip' || dispatch.type === 'unequip') {
			const r = setup.RPG.act(attacker, dispatch.item.id, attacker, dispatch.type); // 统一入口（#1752）
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
		const r = setup.RPG.act(attacker, dispatch.item.id, target); // 统一入口（#1752）
		if (r?.status === 'rejected') {
			this.perform(`${attacker.name}这一手没能出手${r.reason === 'no-ammo' ? '（没有弹药）' : r.reason === 'no-such-item' ? '（道具不在身上）' : r.reason === 'action-refused' ? '（动作自己拒绝了）' : ''} —— 本回合就此过去。`);
		}
		this.#noteReject(attacker, r);
	}
};
