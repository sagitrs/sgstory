/* DND5E 核心扩展 —— 5E 战斗数学
 *
 * 与 3E 的关键差异（这是"规则在规则包"的最佳示范）：
 *   1. 攻击掷骰 = 1d20 + 熟练度(若武器熟练) + 力量或灵巧（Finesse 武器取高者）
 *   2. 重击 = 仅天然 20；伤害时**全部伤害骰翻倍**（调整值不翻倍，与 3E 的整体 ×crit 不同）
 *   3. 护甲**替换**基础 AC：轻甲 base+dex，中甲 base+min(dex,2)，重甲 base
 *   4. 优势/劣势：掷 2d20 取高/低（本包提供 d20adv/d20dis，攻击数学暂用普通 d20）
 */

// 槽位中文名（从 00-init 移到这里，在包装内安全执行）
RPG.slotLabels.weapon = '武器';
RPG.slotLabels.body = '身体';
RPG.slotLabels.feet = '脚';

/**
 * 有效 AC：根据已装备护甲类型计算（5E 护甲替换基础值，不是加值）。
 *   护甲道具的 stats.armor 定义：
 *     { base: 11, dex: true, dexMax: null }   → 轻甲：11 + dex
 *     { base: 13, dex: true, dexMax: 2 }      → 中甲：13 + min(dex, 2)
 *     { base: 14, dex: false }                → 重甲：14（不加灵巧）
 *   未穿甲 = 10 + 灵巧调整值。
 */
DND5E.acOf = (c) => {
	const dex = DND5E.modOf(c?.stats, 'dex');
	const body = (c?.items ?? []).find((s) => s.equipped && RPG.reviveItem(s).slot === 'body');
	if (!body) return 10 + dex; // 无甲
	const armor = RPG.reviveItem(body);
	const a = armor.stats.armor ?? {};
	if (!a.dex) return a.base ?? 10;                        // 重甲：固定
	if (a.dexMax != null) return a.base + Math.min(dex, a.dexMax); // 中甲：灵巧上限
	return a.base + dex;                                    // 轻甲：全额灵巧
};

/** 击倒结算：HP 归零 → death 减益（5E 里目标应做死亡豁免，此处简化）。
 *  ⚠ **死亡 ⇒ 全档清零**（伞 #1728 死亡面裁定⑤：新肉身＝全新印出）：
 *   进入 death 前先清掉其余条件与回合数；`death` 本身保留（绷带复活的 contains(death) 依赖它）。
 *   只在**首次**进入死亡时清（幂等守卫沿用原式），故复活后再死仍会再清一次。
 *   注：dnd3 侧**不接**此语义（3E 死亡规则不同；裁定面属 5E 包）。 */
DND5E.grantDeathIfDown = (that) => {
	if (that instanceof RPG.Character && that.hp <= 0 && !that.contains(RPG.death)) {
		DND5E.clearEffectsOnDeath(that);      // #1741：死亡清档（保留 death 标记）
		that.gain(RPG.death);
	}
};

/**
 * 5E 攻击结算的**四段管线**（#1713 契约③：接点由「分散的隐式位置」变为「显式有序阶段」）
 *
 *   ① `5e.atk`     命中修正：能力调整值（Finesse/远程）、熟练度、AC 读取
 *   ② `5e.mode`    优势/劣势模式（`ctx.rollMode`）—— #1689 **P1** 的 `rollMode()` 接线点
 *   ③ `5e.resolve` 掷骰 + 命中/失手 + 暴击规则（天然 20 ⇒ 全部伤害骰翻倍）—— P3 的 autoCrit 接线点
 *   ④ `5e.damage`  伤害骰与施加（伤害修正链：`ctx.dmgMod`）—— #1690/#1693 的接线点
 *
 * 每段**独立可测**：喂同一 ctx 直接跑单段即可断言其产出（不必开整场战斗）。
 * 序的唯一权威 = stages 数组序（core 的 runPipeline 不重排）；核心只保证同一 ctx 贯穿。
 */
RPG.defPipeline({
	id: 'dnd-5e.attack',
	stages: [
		{
			id: '5e.atk',
			run(ctx) {
				const f = ctx.from?.stats ?? {};
				const isFinesse = ctx.item.stats.finesse === true;
				// 5E：Finesse 取 max(str, dex)；普通近战用 str；投掷/远程用 dex
				// ⚠ 能力值自 #1697 P1 起存**原始分**（stats.str 默认 10）⇒ 一律经 DND5E.modOf 现算调整值；
				//    不得读 *_mod 字段（该字段已废除，读它是死键 ⇒ 恒 0 的静默错值）
				ctx.abilMod = ctx.ranged
					? DND5E.modOf(f, 'dex')
					: isFinesse
						? Math.max(DND5E.modOf(f, 'str'), DND5E.modOf(f, 'dex'))
						: DND5E.modOf(f, 'str');
				ctx.prof = f.prof ?? 0; // 熟练度：简单/军用武器默认熟练（简化：prof 直接加）
				ctx.atkMod = ctx.prof + ctx.abilMod;
				ctx.ac = ctx.that?.stats?.ac ?? 10; // 5E 直接读 stats.ac（acOf 算好后写入）
			},
		},
		{
			id: '5e.mode',
			// #1689 P1：优势/劣势模式来自条件表（双向分池 + 近战/远程条件性）
			run(ctx) {
				ctx.rollMode = DND5E.rollMode(ctx.from, ctx.that, { melee: ctx.melee });
			},
		},
		{
			id: '5e.resolve',
			run(ctx) {
				const { item, that, atkMod, ac } = ctx;
				const die = ctx.roll(ctx.rollMode);
				const noDodge = that?.noDodge === true;
				if (!noDodge && die !== 20 && (die === 1 || die + atkMod < ac)) {
					item.perform(`${item.name}挥空了，没有击中${that.name}` +
						`（攻击掷骰 ${die}${atkMod ? RPG.formatMod(atkMod) : ''} 对 AC ${ac}）`);
					ctx.hit = false;
					ctx.done = true; // 失手 ⇒ 不进入伤害段
					return;
				}
				ctx.hit = true;
				ctx.die = die;
				// 5E 重击：仅天然 20，全部伤害骰翻倍（调整值不翻倍）
				ctx.crit = !noDodge && die === 20;
				ctx.diceCount = ctx.crit ? 2 : 1;
			},
		},
		{
			id: '5e.damage',
			run(ctx) {
				const { item, that, abilMod, crit } = ctx;
				const parts = [];
				let dmg = 0;
				for (let i = 0; i < ctx.diceCount; i++) {
					const r = RPG.rollDetail(item.stats.dmg);
					dmg += r.total;
					parts.push(r.rolls.join('+'));
				}
				dmg += abilMod;                        // 调整值只加一次（5E 规则）
				dmg += ctx.dmgMod ?? 0;                // 伤害修正链（#1690/#1693 在此汇入）
				if (dmg < 1) dmg = 1;
				ctx.dmg = dmg;

				/* ★`#1854`：伤害经**唯一入口** `RPG.applyDamage`（致命／非致命两路单点）。
				 *   非致命（空手打击）⇒ **不改 `hp`**、只累积 `nonlethal` ⇒ 阈值达即**昏迷出局**（`RPG.isKnockedOut`），
				 *   且**永不致死**（`grantDeathIfDown` 判的是 `hp <= 0`）⇒ 也就**不掉战利品**。
				 *   ⚠ 既定致命路**逐字不变**（`applyDamage` 缺省即 `that.hp = Math.max(0, …)`）。 */
				RPG.applyDamage(that, dmg, { nonlethal: item.stats.nonlethal === true });
				DND5E.grantDeathIfDown(that);

				const dmgType = item.stats.type ?? 'bludgeoning';
				item.perform(`${that.name}受到了${dmg}点${dmgType}伤害` +
					`（${parts.join('，')}${abilMod ? RPG.formatMod(abilMod) : ''}${crit ? '，重击！' : ''}）`);
			},
		},
	],
});

/**
 * 5E 近战/远程攻击（木棒、长剑、炸弹等共用）——**薄壳**：
 *   拔出检查 + 建 ctx + 跑管线 + 由各阶段自己 perform。
 *   攻击掷骰 = 1d20 + 熟练度(若熟练) + 力量或灵巧（Finesse 取高者）
 *   天然 20 = 重击 → **全部伤害骰翻倍**（调整值不翻倍）
 *   武器 stats.finesse: true 时用 max(力量, 灵巧)调整值 作为攻击与伤害调整值
 */
DND5E.attack = (item, that, from) => {
	/* 弹药要求（`#1765` 甲形：检查**下沉到攻击层**，✗ 只放 `useItem`）
	 *   理由：两条战斗通路（自动 `#attack` / 交互 `attacker.use`）**直调 `used` ⇒ `attack`**，
	 *   绕过 `useItem` ⇒ 若检查只在 `useItem`，战斗中**永不扣弹**（`#1765` 实测：零弹 5 回合 125 伤害）。
	 *   放这里 ⇒ **任何**到达攻击的路径都被兜住（纵深防御），与 `#1752` 统一入口互补。
	 *   SRD：Ammunition「you can … make a ranged attack **only if you have ammunition**…
	 *   Each attack expends one piece」（pin: `equipment.md:68-70`）。 */
	const ammo = item.stats?.ammo;
	if (ammo && RPG.ammoOwed(item)) {
		/* ★ 扣弹对象必须是**攻击者**（弹药由射手付），✗ 不得回落到 `that`（受击者）。
		 *   起初写 `from ?? that` —— 当调用方直调 `used(foe)`（无 `from`）时会**从靶身上扣弹**
		 *   （实测：射手 10→10、靶 10→9）⇒ 兜底反成「受击者付费」，与「兜底应保证攻击者付费」
		 *   的意图相反（developer 的缺陷 2，tester-4 独立复证）。
		 *   无 `from` 时的正确归属是**道具的持有者** —— `used` 的 `this` 就是该实例；
		 *   其持有者即「背包里含此实例的角色」，由 `RPG.ammoOwner(item, that)` 解析（见 `30-inventory.js`）。
		 *   解析不出（纯数据、无人持有）⇒ **不扣**（交由调用方显式给 `from`），✗ 不从受击者扣。 */
		const owner = RPG.ammoOwner(item, from, that);
		if (owner == null || !RPG.take(ammo.id, ammo.perShot ?? 1, owner)) {
			const need = RPG.items.has(ammo.id) ? RPG.createItem(ammo.id).name : ammo.id;
			item.perform(`没有可用的${need}了——「${item.name}」打不出去。`);
			/* ★`return **false**`（`#1813` 笔 2）：这是**拒绝**（打不出去）⇒ 交 `RPG.act` 判 `rejected/action-refused`。
			 *   ⚠ **✗ 与「挥空」同改** —— 挥空是「攻击**已发生**、只是没中」⇒ 必须留 `return;`
			 *     （`undefined` ⇒ `applied`）：若也返 `false`，「连打三下没中」会触发 `#1773`
			 *     的三连护栏**强制跳过**（那是新缺陷，✗ 本票要的）。 */
			return false;
		}
	}

	// 近战武器拔出检查（复用 core 逻辑；不属结算管线：是行动前置）
	if (item.slot === 'weapon' && !item.equipped) {
		const held = RPG.equippedWeapon();
		if (held && held.id !== item.id) {
			item.perform(`你得先腾出手——「${held.name}」还握在手里。`);
			/* ★`return **false**`（`#1813` 笔 2）：这是**拒绝**（打不出去）⇒ 交 `RPG.act` 判 `rejected/action-refused`。
			 *   ⚠ **✗ 与「挥空」同改** —— 挥空是「攻击**已发生**、只是没中」⇒ 必须留 `return;`
			 *     （`undefined` ⇒ `applied`）：若也返 `false`，「连打三下没中」会触发 `#1773`
			 *     的三连护栏**强制跳过**（那是新缺陷，✗ 本票要的）。 */
			return false;
		}
		item.equipped = true;
		item.perform(`你握紧了「${item.name}」。`);
	}

	const ctx = {
		// 输入（阶段只读）
		item, that, from,
		melee: item.stats.ranged !== true,
		ranged: item.stats.ranged === true,
		// 产出（按序写入；此处给初值便于单段测试与断言中间态）
		abilMod: 0, prof: 0, atkMod: 0, ac: 10,
		rollMode: 'normal', die: null, hit: null, crit: false, diceCount: 1,
		dmgMod: 0, dmg: 0, done: false,
		// 随机入口：唯一随机源 = RPG.rng（05-dice）；优势/劣势掷 2d20 取高/低
		roll: (mode) =>
			mode === 'advantage' ? DND5E.d20adv()
				: mode === 'disadvantage' ? DND5E.d20dis()
					: DND5E.d20(),
	};
	return RPG.runPipeline('dnd-5e.attack', ctx);
};
