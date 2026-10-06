/* DND3 核心扩展 —— 3E 擒抱（grapple）：擒抱检定、擒抱与被钉住两个状态、挣脱与钉住
 *
 * ## 为何需要（`#2027` · E6 勘察：三原语一次建对）
 *   本仓此前**没有**擒抱面 ⇒ 「改良抓握」（Improved Grab，鳄鱼咬中之后起擒抱）无处落地，
 *   `monsters/brown-bear.js:7` 与 `items/natural-attacks.js:34` 两处**已如实记「不落」**并等这一票。
 *   本次建成的三件：①「命中后追加」原语（`DND3.defOnHit`）②擒抱检定（对抗掷骰）
 *   ③擒抱／被钉住两个状态及其**已接线的后果**（攻击 −4、只能打擒抱对手、被钉住者的 AC −4）。
 *   后续 20 世界复用同一条面：狼的 Trip、蜂的 Poison、熊的 Improved Grab 都可以挂在 ① 上。
 *
 * ## 出处（pinned，逐值照录；行号由 `refs-integrity` 门逐键核）
 *   · SRD 3.5 · `Basic Rules and Legal/combat-ii-movement-modifiers-and-special-actions.md:703`（擒抱检定 = 基础攻击加值 ＋ 力量调整值 ＋ 体型特殊修正）
 *   · 同上 `:708`（体型特殊修正表）
 *   · 同上 `:713`（起手四步：借机攻击 ⇒ 触摸抓握 ⇒ 对抗检定成擒抱 ⇒ 维持）
 *   · 同上 `:737`（目标大两档以上 ⇒ 自动失去 hold 的尝试）
 *   · 同上 `:786`（擒抱中攻击你的对手：−4）
 *   · 同上 `:800`（对抗检定造成伤害：中型 1d3／小型 1d2 ＋ 力量调整值，默认**非致命**）
 *   · 同上 `:826`（挣脱：以一次攻击换取对抗擒抱检定）
 *   · 同上 `:850`（钉住：以一次攻击换取对抗检定，令对手定身 1 轮）
 *   · 同上 `:894`（被钉住：定身 1 轮；对**非钉住者**的 AC −4；可对抗检定挣脱，挣脱后**仍是擒抱**）
 *   · SRD 3.5 · `Monsters/Monsters - Animals.md:173`（鳄鱼 `Improved Grab` 原文：咬中之后可以**自由动作**起擒抱，且**不引发借机攻击**）
 *
 * ## 两个状态的 id 为何不叫 SRD 的那个词
 *   本仓的效果注册表 `RPG.effects` 是**跨包共用一张** ⇒ id 不得与别的包相撞：5E 包已登记了 `grappled`
 *   （`dnd-5e/core/conditions.js:54`）。本席首版就叫 `grappled`／`pinned` ⇒ **`tests/unit/dnd-5e/conditions.test.js` 当场红**
 *   （两条：查不到 5E 声明的 `selfRollMode`、「简化」标注也没了）—— 那两条用例同时证了两件事：
 *   ① 撞名会**后注册者胜**、5E 的定义被**静默顶掉**；② 它被门挡住了，不是只能在运行时发现。
 *   ⇒ 本包的 id 取 `grapple-hold`（被擒抱）与 `grapple-pin`（被钉住）（全局单例名为 `RPG.grappleHold`／`RPG.grapplePin`）。
 *   ⚠ 将来若要与 5E 统一命名，须先定「跨包同名如何共存」的机制（现无：一张表、后注册胜），✗ 不得直接改回。
 *
 * ## 不落项（house rule／本仓无该量纲 —— 逐条记名，✗ 不静默丢弃） *   · **借机攻击**（`:715` 第一步）与「不威胁邻格」（`:760`）：本仓战斗**无邻格与借机面**。
 *   · **触摸抓握**（`:729` 第二步）：本仓无「触摸 AC」⇒ 两处入口各自替代（改良抓握＝咬击**命中**；
 *     起手＝对抗检定），差额＝省掉一次触摸攻击掷骰。
 *   · **对非擒抱对象失去敏捷 AC 加值**（`:764`）：本仓 3E 的 AC 是**照录**（`DND3.acOf` 不含敏捷）。
 *   · **移动面**（`:768` 不能移动／`:836` 移动擒抱／鳄鱼「拖入深水并钉底」）：战斗中无移动量纲 ⇒
 *     涉水与否由故事侧声明（见 `core/water.js`），本档只按水态算修正。
 *   · **施法、使用对手武器、卸除装备、取法术材料**（`:772` 起）：本仓无施法与物品夺取面。
 *   · **回合长度**：本引擎无「1 轮」的时长计量（回合边界只管谁行动）⇒ 钉住**持续到挣脱或战斗结束**，
 *     而非原文的「1 轮」——差额具名于此（与 `pin` 的语义一并记）。
 */

/* 对抗检定的重掷上限（house rule，理由见 `opposedGrapple`） */
DND3.REROLL_LIMIT = 8;

/* 体型序（SRD 3.5 · `Basic Rules and Legal/combat-ii-movement-modifiers-and-special-actions.md:708` 的列序） */
DND3.SIZES = ['fine', 'diminutive', 'tiny', 'small', 'medium', 'large', 'huge', 'gargantuan', 'colossal'];

/** 体型特殊修正（照录上述 pin 表；未知体型 ⇒ 0，与中型同） */
DND3.grappleSizeMod = (size) => ({
	fine: -16, diminutive: -12, tiny: -8, small: -4, medium: 0,
	large: 4, huge: 8, gargantuan: 12, colossal: 16,
}[size] ?? 0);

/** 读体型。⚠ 缺省 `'medium'`：旧档／未声明体型的角色**不因本笔而变**（零回归形，同 `nonlethal` 的惯例）。 */
DND3.sizeOf = (c) => c?.stats?.size ?? 'medium';

/** 擒抱检定加值 = 基础攻击加值 ＋ 力量调整值 ＋ 体型特殊修正（pin `:703`） */
DND3.grappleMod = (c) => {
	const s = c?.stats ?? {};
	return (s.bab ?? 0) + DND3.modOf(s, 'str') + DND3.grappleSizeMod(DND3.sizeOf(c));
};

/** 一次擒抱掷骰：`{ roll, mod, total }`（对抗检定 —— 不比 DC，故不用 `RPG.checkRoll`） */
DND3.grappleRoll = (c) => {
	const mod = DND3.grappleMod(c);
	const roll = RPG.roll('1d20');
	return { roll, mod, total: roll + mod };
};

/** 对抗擒抱检定（pin `:703`）：同值时**调整值高者胜**；仍同 ⇒ **重掷**（pin `:740`；重掷有上限，见下）。
 *  上限值由 `DND3.REROLL_LIMIT` 单点给出（判据可读它，✗ 不散在两处）。
 *  返回 `{ a, b, winner: 'a'|'b', rerolled }`。 */
DND3.opposedGrapple = (a, b) => {
	const 上限 = DND3.REROLL_LIMIT;
	let ra = DND3.grappleRoll(a);
	let rb = DND3.grappleRoll(b);
	let rerolled = false;
	for (let i = 0; i <= 上限; i++) {
		/* 先看**这次**：不平 ⇒ 立刻定胜负（✗ 不得先看平局条件 —— 本席首版写成
		 * 「平局才进循环体」，结果两颗骰子不同时直接掉进下面的兜底、判成尝试者失败。判据当场抓住。） */
		if (ra.total !== rb.total) return { a: ra, b: rb, winner: ra.total > rb.total ? 'a' : 'b', rerolled };
		if (ra.mod !== rb.mod) return { a: ra, b: rb, winner: ra.mod > rb.mod ? 'a' : 'b', rerolled };
		ra = DND3.grappleRoll(a); rb = DND3.grappleRoll(b); rerolled = true;
	}
	/* ★**重掷上限**（house rule，非 SRD —— 与 `#1773` 的「连续拒绝上限」同一族）：原文只说「掷到破平为止」，
	 *   那在**退化随机源**（单测的固定 `rng.set(() => 0.5)`、或余额耗尽的源）下**永不收敛** ⇒ 会挂死整场战斗。
	 *   ⇒ 掷满上限仍平 ⇒ 判**尝试者失败**（`winner: 'b'`，并且 `tie: true` 让调用方看得见这不是一次干净的败）。
	 *   ⚠ 上限值取 8：正常随机下连平 8 次的概率可忽略，而它足以挡住退化源。 */
	return { a: ra, b: rb, winner: 'b', rerolled, tie: true };
};

/** 体型差是否允许抓握：目标比尝试者**大两档及以上** ⇒ 自动失败（pin `:737`）。 */
DND3.canHold = (attacker, target) => {
	const ia = DND3.SIZES.indexOf(DND3.sizeOf(attacker));
	const it = DND3.SIZES.indexOf(DND3.sizeOf(target));
	return !(ia >= 0 && it >= 0 && it - ia >= 2);
};

/* ---------- 两个状态（`scope: 'battle'` ⇒ `battle:end` 清，见文件末接线） ----------
 * ⚠ 后果**只落已接线的三处**（`meleeAttack` 的攻击 −4／只能打对手、`acOf` 的 −4），
 *   其余原文后果见档头「不落项」——✗ 不为了「看起来完整」加无消费点的字段。 */
RPG.grappleHold = RPG.defEffect({
	id: 'grapple-hold', name: '被擒抱', kind: 'debuff', scope: 'battle',
	desc: '正与对手扭在一起：只能攻击那名对手，且攻击掷骰 −4。',
});
RPG.grapplePin = RPG.defEffect({
	id: 'grapple-pin', name: '被钉住', kind: 'debuff', scope: 'battle',
	desc: '被对手按住定身：对钉住者以外的对手 AC −4，轮到自己时只能挣脱。',
});

/* ---------- 关系记录（纯数据 ⇒ 随 `toJSON` 往返；只存**单位号**，✗ 不存对象引用）---------- */
const 关系 = (c) => {
	const box = RPG.actorRuntime(c);
	if (!box.grapple || typeof box.grapple !== 'object') box.grapple = {};
	return box.grapple;
};

/** 处于擒抱中的对手（双向可查）：返回**对方角色**或 `null`。
 *  ⚠ 号 → 角色的反查只认**本场战斗的名册**（`RPG.Battle.current`）：擒抱是战斗期状态，
 *    战斗不在场 ⇒ 返回 `null`（✗ 不建第二份名册）。 */
DND3.grapplePartner = (c) => {
	const g = c?.runtime?.grapple;
	if (!g) return null;
	const id = g.holds ?? g.heldBy ?? null;
	if (id == null) return null;
	const 名册 = [...(RPG.Battle.current?.players ?? []), ...(RPG.Battle.current?.enemies ?? [])];
	return 名册.find((u) => RPG.unitId.of(u) === id) ?? null;
};

/** 是否正被某人抓住 */
DND3.isHeld = (c) => c?.contains?.(RPG.grappleHold) === true;
/** 是否正**抓着**某人（不论是否已钉住） */
DND3.isHolding = (c) => c?.runtime?.grapple?.holds != null;
/** 是否正**钉着**某人（抓着且已压制） */
DND3.isPinning = (c) => c?.runtime?.grapple?.pins != null;
/** 是否被钉住 */
DND3.isPinned = (c) => c?.contains?.(RPG.grapplePin) === true;
/** 是否处于任一擒抱角色（抓人或被抓）——「擒抱中」的统称 */
DND3.isGrappling = (c) => DND3.isHeld(c) || c?.runtime?.grapple?.holds != null;

/** 释放（原文「可**自由动作**释放被钉住者」，见 pin `:886` 段；本档把它做成显式 API）。
 *  只清自己这一侧的关系；对手侧由 `结束擒抱` 一并收。 */
DND3.releaseGrapple = (c, { silent = false } = {}) => {
	const mine = 关系(c);
	const opp = DND3.grapplePartner(c);
	if (opp) {
		/* 两侧三键全清（对称）：谁抓谁、谁钉谁都在这里收尾 —— 只清一侧会留半条关系（下次 `contains` 与记录不一致） */
		const 对面的 = 关系(opp);
		对面的.holds = null;
		对面的.heldBy = null;
		对面的.pins = null;
		opp.lose(RPG.grappleHold);
		opp.lose(RPG.grapplePin);
	}
	mine.holds = null;
	mine.heldBy = null;
	mine.pins = null;
	c.lose(RPG.grappleHold);
	c.lose(RPG.grapplePin);
	if (!silent && opp) RPG.perform(`${c.name}松开了${opp.name}。`);
	return true;
};

/** 建立擒抱（hold）。`fromHit` ＝ 该次尝试由**命中**触发（改良抓握的形）。 */
DND3.hold = (attacker, target, { fromHit = false } = {}) => {
	if (attacker == null || target == null || attacker === target) return false;
	if (DND3.isGrappling(attacker) || DND3.isGrappling(target)) {
		RPG.perform(`${target.name}已经在擒抱里了——这一次抓不住。`);
		return false;
	}
	if (!DND3.canHold(attacker, target)) {
		/* pin `:737`：目标大两档及以上 ⇒ **自动失败**（且不再掷骰 —— 掷了只是白耗 rng 读数） */
		RPG.perform(`${attacker.name}抓不住${target.name}——对手体型大出太多。`);
		return false;
	}
	const 对抗 = DND3.opposedGrapple(attacker, target);
	if (对抗.winner !== 'a') {
		RPG.perform(`${attacker.name}抓住了${target.name}，却没能按住（擒抱检定 ${对抗.a.total} 对 ${对抗.b.total}）。`);
		return false;
	}
	target.gain(RPG.grappleHold);
	关系(attacker).holds = RPG.unitId.of(target);
	关系(target).heldBy = RPG.unitId.of(attacker);
	RPG.perform(`${attacker.name}擒住了${target.name}（擒抱检定 ${对抗.a.total} 对 ${对抗.b.total}）` +
		`${fromHit ? '' : '，并顺势撞了一下'}。`);
	/* pin `:731`（Step 3）：起手成功者**额外造成一次徒手伤害**。
	 *   ⚠ 改良抓握**不走这一支**：它的原文（Animals:173）只说「establish a hold」，✗ 不含伤害。 */
	if (!fromHit) DND3.grappleDamageRoll(attacker, target);
	return true;
};

/** 以对抗检定造成伤害（pin `:800`）：中型 1d3／小型 1d2 ＋ 力量调整值，默认**非致命**。 */
DND3.grappleDamageRoll = (attacker, target) => {
	const 面 = DND3.sizeOf(attacker) === 'small' ? '1d2' : '1d3';
	const 伤 = RPG.roll(面) + DND3.modOf(attacker?.stats ?? {}, 'str');
	RPG.applyDamage(target, 伤, { nonlethal: true });
	DND3.grantDeathIfDown(target);
	RPG.perform(`${attacker.name}在擒抱中撞了${target.name}一下（非致命 ${伤} 点）。`);
	return 伤;
};

/** 钉住（pin `:850`）：以一次攻击换取对抗检定；成功 ⇒ 目标**被钉住**。 */
DND3.pinOpponent = (c) => {
	const opp = DND3.grapplePartner(c);
	if (opp == null || 关系(c).holds == null) {
		RPG.perform(`${c.name}没有抓着手里的对手，钉不住人。`);
		return false;
	}
	if (DND3.isPinned(opp)) return false;   // 已钉住 ⇒ 无需重钉（本回合空过，由调用方记账）
	const 对抗 = DND3.opposedGrapple(c, opp);
	if (对抗.winner !== 'a') {
		RPG.perform(`${c.name}想把${opp.name}按住，却被挣开了（擒抱检定 ${对抗.a.total} 对 ${对抗.b.total}）。`);
		return false;
	}
	opp.gain(RPG.grapplePin);
	关系(c).pins = RPG.unitId.of(opp);
	RPG.perform(`${c.name}把${opp.name}按定住了（擒抱检定 ${对抗.a.total} 对 ${对抗.b.total}）。`);
	return true;
};

/** 挣脱（pin `:826`／`:897`）：以一次攻击换取对抗检定。
 *  · 被**钉住** ⇒ 只解钉（原文：挣脱后**仍是擒抱**）；· 被**抓住** ⇒ 整个擒抱结束。 */
DND3.escapeGrapple = (c) => {
	const opp = DND3.grapplePartner(c);
	if (opp == null) return false;
	const 对抗 = DND3.opposedGrapple(c, opp);
	if (对抗.winner !== 'a') {
		RPG.perform(`${c.name}没能挣脱${opp.name}（擒抱检定 ${对抗.a.total} 对 ${对抗.b.total}）。`);
		return false;
	}
	if (DND3.isPinned(c)) {
		c.lose(RPG.grapplePin);
		关系(opp).pins = null;
		RPG.perform(`${c.name}从${opp.name}的压制下挣了出来（擒抱检定 ${对抗.a.total} 对 ${对抗.b.total}）——仍在擒抱中。`);
		return true;
	}
	DND3.releaseGrapple(opp, { silent: true });
	RPG.perform(`${c.name}挣脱了${opp.name}的擒抱（擒抱检定 ${对抗.a.total} 对 ${对抗.b.total}）。`);
	return true;
};

/** 攻击掷骰的擒抱修正（pin `:786`）：与对手扭在一起时打对手 **−4**；与本次目标不构成擒抱 ⇒ 0。 */
DND3.grappleAttackMod = (attacker, target) => {
	if (attacker == null || target == null || !DND3.isGrappling(attacker)) return 0;
	return DND3.grapplePartner(attacker) === target ? -4 : 0;
};

/** 本目标是否被擒抱规则**禁止**（pin `:786`：擒抱中只能打你擒抱的那名对手）。
 *  返回 `true` ＝ 禁止。⚠ 只给**判据**，玩家面的文案由调用处写（与 `combat.js` 其它拒绝点同形：
 *  每处拒绝用自己的话，✗ 不让公共助手居中转一手文案）。 */
DND3.grappleBlocksTarget = (attacker, target) => {
	if (!DND3.isGrappling(attacker)) return false;
	const opp = DND3.grapplePartner(attacker);
	return !(opp != null && opp === target);
};

/* ---------- ① 「命中后追加」原语 ----------
 * 契约：攻击件声明 `stats.onHit: '<id>'`；`meleeAttack` 在**命中并结算伤害之后**调用注册的处理函数。
 *   · 返回 `false` ⇒ 没有发生（调用方无需理）；返回 `true` ⇒ 已发生（文案由处理函数自己出）。
 *   · 目标**已出局**（死／昏迷）⇒ **不调用**（同 `#1780` A5 的「已倒地者不再施加」惯例）。
 *   · 处理函数**抛错**照本仓通例处置：**吞并 ＋ console.error**（战斗编排点不因一条特技崩掉整场）。 */
DND3.onHitHandlers = new Map();

DND3.defOnHit = (def) => {
	if (!def || typeof def.id !== 'string' || def.id === '') throw new Error('defOnHit 需要一个非空 id');
	if (typeof def.run !== 'function') throw new Error(`defOnHit「${def.id}」缺少 run`);
	if (DND3.onHitHandlers.has(def.id)) RPG.regWarn.报('命中追加', def.id, '已存在，将被覆盖');
	DND3.onHitHandlers.set(def.id, def);
	return def;
};

DND3.runOnHit = (id, ctx) => {
	const def = DND3.onHitHandlers.get(id);
	if (!def) { console.error(`[RPG] 未注册的命中追加 id「${id}」`); return false; }
	if (ctx?.target?.isDown === true) return false;
	try {
		return def.run(ctx) !== false;
	} catch (e) {
		console.error(`[RPG] 命中追加「${id}」抛错（战斗侧已吞并）：`, e);
		return false;
	}
};

/* 改良抓握（Improved Grab）——《Monsters - Animals.md:173》鳄鱼条：咬中之后**自由动作**起擒抱、不引发借机攻击。
 *   ⚠ 本仓无借机面 ⇒ 那一半无处落（见档头不落项），本处理函数只管「咬中 ⇒ 起擒抱」。 */
DND3.defOnHit({ id: 'improved-grab', run: ({ attacker, target }) => DND3.hold(attacker, target, { fromHit: true }) });

/* ---------- 自动通路的回合动作（core 的挂点，见 `40-battle.js` 的 `RPG.battleTurnAction`）----------
 *  斗中之人的合法选择由本函数给出；返回 `null` ⇒ 本路不接管（走原有武器路）。
 *   · **被抓住** ⇒ 挣脱（pin `:826`：以一次攻击换取对抗检定）；
 *   · **正抓着人** ⇒ 未钉住则钉住（pin `:850`），已钉住则撞一下（pin `:800`）。
 *  ⚠ 玩家侧（交互通路）的菜单接线归故事侧 S5；引擎侧这条面服务**自动通路**（含怪物）。 */
DND3.turnAction = (attacker) => {
	if (!(attacker instanceof RPG.Character)) return null;
	/* 挣脱：**本次行动已发生**（掷了对抗检定、也上了屏）⇒ `applied`，与「挥空」同规（✗ 不是 rejected）。 */
	if (DND3.isHeld(attacker)) {
		DND3.escapeGrapple(attacker);
		return { status: 'applied', reason: 'grapple-escape' };
	}
	if (DND3.isHolding(attacker)) {
		const opp = DND3.grapplePartner(attacker);
		if (opp != null && !DND3.isPinned(opp)) { DND3.pinOpponent(attacker); return { status: 'applied', reason: 'grapple-pin' }; }
		if (opp != null) { DND3.grappleDamageRoll(attacker, opp); return { status: 'applied', reason: 'grapple-damage' }; }
	}
	return null;
};
RPG.battleTurnAction = (attacker) => DND3.turnAction(attacker);

/* 战斗结束 ⇒ 清两个状态与关系记录（pack 侧订阅；core 不认识包的效果，同 #1777 的 `battle:end` 惯例）。 */
RPG.events.on('battle:end', ({ players = [], enemies = [] } = {}) => {
	for (const c of [...players, ...enemies]) {
		if (!(c instanceof RPG.Character)) continue;
		c.lose(RPG.grappleHold);
		c.lose(RPG.grapplePin);
		if (c.runtime?.grapple) c.runtime.grapple = {};
	}
});
