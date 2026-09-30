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

	/** 接口实现（继承自 Event；0 个参数）。结果通过 perform 打印，不返回值。 */
	execute() {
		this.#attack(this.attacker, this.defender);
		RPG.events.emit('battle:turn', {
			attacker: this.attacker,
			defender: this.defender,
		});
	}

	/** 私有函数：执行一次攻击（#前缀，外部不可访问） */
	#attack(attacker, defender) {
		this.perform(`现在是${attacker.name}的回合。`);
		const weapon = attacker.contains(['weapon', 'equipped']);
		if (weapon == null) {
			this.perform(`${attacker.name}没有装备任何武器，只能干瞪眼。`);
			return;
		}
		weapon.used(defender, attacker); // 攻击结果由武器自己 perform（规则在这里）
	}
};

/**
 * 重来（respawn）—— 战败角色的清算与复位（#1760 · 伞 #1728 死亡面七裁定）
 *
 * 设计稿：`docs/plan/1760-babel-respawn.md`（「裁定 → 落形 → 可判断据」三列；判据
 *   1／2a／2b／3a／3b／4 与 M1–M7 即本合同，落码逐条兑现）。
 *
 * **core 规则无关**（两条注入，与 `onReviveStats` 同族 —— core 不认识任何包）：
 *   · `RPG.respawnHooks.startLayer`    起点层解析（层权威在 `#1748` 的层元数据契约内，core 不另立）
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
RPG.respawnHooks = { startLayer: null, clearEffects: null };

/** 注册「起点层」解析器：`fn(character) -> 层 id`。各包/故事调用（层权威在各自的层元数据内）。 */
RPG.onRespawnStartLayer = (fn) => {
	if (typeof fn !== 'function') throw new Error('onRespawnStartLayer 需要函数');
	RPG.respawnHooks.startLayer = fn;
	return () => { if (RPG.respawnHooks.startLayer === fn) RPG.respawnHooks.startLayer = null; };
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
	const target = to ?? (typeof RPG.respawnHooks.startLayer === 'function' ? RPG.respawnHooks.startLayer(c) : null);
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
	}

	/** 出局判定钩子：默认 HP 归零出局；wfrp 等规则包可覆写为昏迷/崩溃等 */
	isOut(c) {
		return c.isDown;
	}

	async execute() {
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
						new RPG.BattleTurn(attacker, pick(foes)).execute();
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
		this.perform(
			!playersAlive
				? '战斗结束：你方全部倒下了……'
				: !enemiesAlive
					? '战斗结束：敌方被击败！'
					: `战斗结束：${this.rounds} 个回合后双方仍在僵持。`
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
			setup.RPG.useItem(dispatch.item.id, attacker, attacker, dispatch.type);
			return;
		}

		// 使用：选目标
		this.perform(`对谁使用${dispatch.item.name}？`);
		const targetName = await attacker.choice(targetOptions);
		const everyone = [...this.players, ...this.enemies].filter((c) => !this.isOut(c));
		const target = everyone.find((c) => c.name === targetName);

		attacker.use(dispatch.item, target); // 结果由 used 内部 perform 打印
	}
};
