/* RPG 核心 —— 战斗相关的 Event（规则无关的回合循环）
 *
 *   BattleTurn —— 一个战斗回合（一名角色攻击一名目标）。
 *   Battle     —— 一整场战斗（turn 个回合，双方各自动出战）。
 *
 * 规则无关的关键：回合循环只负责“谁在何时行动”，判定与伤害的数学
 * 全部在各武器的 used() 里（3E 见 dnd3/items/club.js，wfrp 同理）。
 * 出局判定默认 hp 归零，其他规则包可覆写 Battle.prototype.isOut。
 */

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
		/** 等概率随机选取一个存活目标 */
		const pick = (group) => group[Math.floor(Math.random() * group.length)];

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
				const foes = this.players.includes(attacker)
					? alive(this.enemies)
					: alive(this.players);
				if (foes.length === 0) break; // 行动途中对方被团灭

				const isPlayerControlled =
					this.interactive &&
					(attacker.properties ?? []).includes('player');
				if (isPlayerControlled) {
					await this.#playerAction(attacker); // 交互式回合
				} else {
					new RPG.BattleTurn(attacker, pick(foes)).execute();
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
	async #playerAction(attacker) {
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
		if (chosen === 'skip') {
			this.perform(`${attacker.name}按兵不动。`);
			return;
		}
		const item = setup.RPG.reviveItem(slots[Number(chosen)]);

		// ② 选动作
		const actions = actionOptionsFor(item);
		let action = 'use';
		if (actions.length > 1) {
			this.perform(`对「${item.name}」做什么？`);
			action = await attacker.choice(actions);
		}

		// 装备/卸下：消耗整回合，直接结束（经 useItem 提交到背包快照）
		if (action === 'equip' || action === 'unequip') {
			setup.RPG.useItem(item.id, attacker, attacker, action);
			return;
		}

		// ③ 使用：选目标
		this.perform(`对谁使用${item.name}？`);
		const targetName = await attacker.choice(targetOptions);
		const everyone = [...this.players, ...this.enemies].filter((c) => !this.isOut(c));
		const target = everyone.find((c) => c.name === targetName);

		attacker.use(item, target); // 结果由 used 内部 perform 打印
	}
};
