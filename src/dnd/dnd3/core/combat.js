/* DND3 核心扩展 —— 3E 战斗数学（近战攻击 / 防御等级 / 击倒结算）
 *
 * 判定数学的唯一去处：武器道具的 used() 只做数据声明，
 * 掷骰、重击、AC 对抗全部在这里——加新武器零重复代码。
 */

/** 3E 槽位中文名（装备竞争提示用；core 只存表不认识槽名） */
RPG.slotLabels.weapon = '武器';
RPG.slotLabels.body = '身体';
RPG.slotLabels.feet = '脚';

/**
 * 有效防御等级 = 基础 stats.ac + 全部已装备道具的 stats.ac_bonus。
 * （盔甲、包铁靴都在这里生效——衣服和鞋真正参与战斗。）
 *
 * ★`sgstory#2027`：第二参 `against` ＝**本次攻击者**（可缺省）。被钉住者对其**钉住者以外**的对手
 *   AC −4（SRD 3.5 · `Basic Rules and Legal/combat-ii-movement-modifiers-and-special-actions.md:894`）。
 *   ⚠ 缺省（`against == null` 或调用方不传）⇒ 视为「不是钉住者」⇒ **照样减** —— 这比不减安全：
 *     不知对手时按原文只差一个例外分支，✗ 不会把惩罚静默变成无。
 */
DND3.acOf = (c, against = null) => {
	let ac = c?.stats?.ac ?? 10;
	for (const slot of c?.items ?? []) {
		if (!slot.equipped) continue;
		ac += RPG.reviveItem(slot).stats?.ac_bonus ?? 0;
	}
	if (DND3.isPinned?.(c) === true && DND3.grapplePartner?.(c) !== against) ac -= 4;
	return ac;
};

/** 击倒结算：目标 HP 归零且未持有 death 减益 → 获得之（对 Character 生效） */
DND3.grantDeathIfDown = (that) => {
	if (that instanceof RPG.Character && that.hp <= 0 && !that.contains(RPG.death)) {
		that.gain(RPG.death);
	}
};

/**
 * 3E 近战攻击（木棒、长剑等近战武器共用）：
 *   未装备时先“拔出”；手被其他武器占着则本次失败。
 *   攻击掷骰 = 1d20 + BAB + 力量调整值，对抗 DND3.acOf(目标)
 *   （天然 1 必失手；≥ stats.critMin（默认 20）为重击威胁并自动命中，
 *     确认掷骰命中则伤害骰与力量调整值都 ×stats.crit——长剑 19-20/×2）。
 */
/** ★`books#212` 第 2 项：伤害类型的**玩家面**名字（单点 —— ✗ 各处再写一份映射）。
 *   3E 的三类贯穿全仓（`slashing`／`piercing`／`bludgeoning`）；未见别的物理类型 ⇒ 未知一律「物理」。 */
DND3.damageTypeLabel = (type) => ({ slashing: '挥砍', piercing: '穿刺', bludgeoning: '钝击' }[type] ?? '物理');

DND3.meleeAttack = (item, that, from) => {
	// 远程武器不需拔出，用灵巧
	const isRanged = item.stats.ranged === true;
	if (!isRanged && !item.equipped) {
		const held = RPG.equippedWeapon();
		if (held && held.id !== item.id) {
			item.perform(`你得先腾出手——「${held.name}」还握在手里。`);
			/* ★`return **false**`（`#1813`）：这是**拒绝**（打不出去）⇒ 交 `RPG.act` 判 `rejected/action-refused`。
			 *   ⚠ **✗ 与下面的「挥空」同改** —— 挥空是「攻击**已发生**、只是没中」⇒ 必须留 `return;`
			 *     （`undefined` ⇒ `applied`）：若也返 `false`，「连打三下没中」会触发
			 *     `#1773` 的三连护栏**强制跳过**（那是新缺陷，✗ 本票要的）。 */
			return false;
		}
		item.equipped = true; // 拔出武器（useItem 会提交回背包快照）
		item.perform(`你握紧了「${item.name}」。`);
	}

	const f = from?.stats ?? {};
	/* ★`sgstory#2027`：擒抱的目标限制（pin `:786`：擒抱中**只能打你擒抱的那名对手**）
	 *   ⇒ 其余目标**拒绝**（`return false`，与上面的「腾不出手」同规 ⇒ `RPG.act` 判 `action-refused`）。
	 *   ⚠ 无擒抱关系时恒 `null` ⇒ 既有行为**零回归**。 */
	if (DND3.grappleBlocksTarget?.(from, that) === true) {
		item.perform(`${from.name}正与${DND3.grapplePartner?.(from)?.name ?? '抓住你的对手'}扭在一起——这一手只能打他。`);
		return false;
	}
	// 远程武器用灵巧，近战用力量
	const abilMod = isRanged ? DND3.modOf(f, 'dex') : DND3.modOf(f, 'str');
	/* ★`sgstory#2027`：两件**场上**修正（都不属武器固有值，故不并入 `atkBonus`）：
	 *   · **御水**（pin `3.5 Monsters - E.md:370`：双方皆触水 +1；有一方只挨非水地面 −4）——**攻击与伤害都加**；
	 *   · **擒抱**（pin `:786`：与对手扭在一起时打对手 −4）。 */
	const 御水 = DND3.waterMasteryMod?.(from, that) ?? 0;
	const 擒抱 = DND3.grappleAttackMod?.(from, that) ?? 0;
	// 创伤罚（#1780 §四 C1：`裂伤` 在本场首回合给攻击掷骰 −1；无创伤时恒 0 ⇒ 既有行为不变）
	/* ★`#1855`：**显式攻击加值** `item.stats.atkBonus` —— 有则**照录**（✗ 不走推导）。
	 *   为何需要（本票裁定 甲，领队 guest-1 2026-10-02）：天然武器的 pinned 攻击行**含三件本仓没有的机制**
	 *     —— 体型修正、武器娴熟、单一自然攻击的 ×1.5 力调（见 `items/natural-attacks.js` 档头逐只反解）
	 *     ⇒ 若不照录，9 只里 5 只的攻击加值会与 pinned 不符（本席实测差 1~5）。
	 *   ⚠ **脱钩代价（有意）**：照录值与 `bab`／力调**不联动** ⇒ 日后改属性**不会**改它。
	 *   ⚠ 缺省（`undefined`）⇒ **逐字沿用**原式 ⇒ 既有武器／玩家面**零回归**。
	 *   ⚠ 创伤罚**仍叠加**在照录值上（伤势是**场上状态**，✗ 属武器固有值）。 */
	const atkMod = (item.stats.atkBonus ?? ((f.bab ?? 0) + abilMod)) + (DND3.traumaAttackMod?.(from) ?? 0) + 御水 + 擒抱;
	const ac = DND3.acOf(that, from);
	const die = DND3.d20({ purpose: 'attack.hit', actor: from?.name ?? null });   // ★`#2031` 用途定位
	const critMin = item.stats.critMin ?? 20;
	// 目标 noDodge（宝箱等容器的对象性质，非规则量纲）：不会闪避，攻击总是命中
	const noDodge = that?.noDodge === true;

	if (!noDodge && die < critMin && (die === 1 || die + atkMod < ac)) {
		item.perform(`${item.name}挥空了，没有击中${that.name}` +
			`（攻击掷骰 ${die}${atkMod ? RPG.formatMod(atkMod) : ''} 对 AC ${ac}）`);
		return;
	}

	const crit = !noDodge && die >= critMin && DND3.d20({ purpose: 'attack.crit', actor: from?.name ?? null }) + atkMod >= ac;
	const times = crit ? (item.stats.crit ?? 2) : 1;
	const parts = [];
	let dmg = 0;
	// 创伤罚（#1780 §四 C2：`骨裂` 给**近战伤害** −1，✗ 不作用于攻击掷骰；无创伤时恒 0）
	/* ★`sgstory#2027`：**显式伤害加值** `item.stats.dmgBonus` —— 与 `atkBonus` **同形同哲学**（照录 pinned，✗ 引擎推导）。
	 *   为何需要（`#2027` 终裁：SRD 保真）：pinned 的伤害行对**单一自然攻击**已含 ×1.5 力调（鳄鱼咬 1d8+6＝力调 +4 ×1.5；
	 *   水元素 Slam 1d6+3＝力调 +2 ×1.5），而引擎的伤害加值**恒 ×1**（见 `items/natural-attacks.js` 档头 ③）。
	 *   ⇒ 要照录就只能显式声明；缺省（`undefined`）⇒ **逐字沿用** `abilMod` ⇒ 既有武器与九只动物**零回归**。 */
	const dmgMod = (item.stats.dmgBonus ?? abilMod) + (DND3.traumaDamageMod?.(from) ?? 0) + 御水;
	for (let i = 0; i < times; i++) {
		const r = RPG.rollDetail(item.stats.dmg, { purpose: 'damage', actor: from?.name ?? null });   // ★`#2031`
		dmg += r.total + dmgMod; // 重击时调整值同样翻倍
		parts.push(r.rolls.join('+') + (dmgMod ? RPG.formatMod(dmgMod) : ''));
	}
	/* ★`books#212` 第 2／3 项（操作者试玩）：**类型名与最低伤害都要给玩家看得懂的话** ——
	 *   原先直接印 `item.stats.type`（`slashing`／`piercing`／`bludgeoning` ✗ 英文），
	 *   而「压到 1」那条规则**无声地**发生（票面：「最低伤害规则一句释义」）。
	 *   ⚠ 只做**呈现**：`dmg` 的算法一字未动 ✓。未知类型印「物理」（✗ 把英文漏到玩家面）。*/
	const 最低伤害 = dmg < 1;
	if (最低伤害) dmg = 1; // 惩罚压到 0 以下时至少造成 1 点

	/* ★`#1854`：伤害经**唯一入口** `RPG.applyDamage`（致命／非致命两路单点）。
	 *   非致命（空手打击）⇒ **不改 `hp`**、只累积 `nonlethal` ⇒ 阈值达即**昏迷出局**（`RPG.isKnockedOut`），
	 *   且**永不致死**（`grantDeathIfDown` 判的是 `hp <= 0`）⇒ 也就**不掉战利品**。
	 *   ⚠ 既定致命路**逐字不变**（`applyDamage` 缺省即 `that.hp = Math.max(0, …)`）。 */
	RPG.applyDamage(that, dmg, { nonlethal: item.stats.nonlethal === true });
	DND3.grantDeathIfDown(that);

	// 施加面（#1780 §三 A1-A5）：**重击确认命中**后按固定优先级施加一条创伤。
	// 位置在 `grantDeathIfDown` 之后 ⇒ 已倒地者不再施加（A5）；`applyTrauma` 内部再兜一次。
	if (crit) {
		DND3.applyTraumaOnCrit?.(that, {
			damage: dmg,
			maxHp: that.maxHp ?? 0,
			// 骨裂的施加条件（#1780 §三 A2；D 席 MAJOR 后订正）：**复用既有数据源**——
		// 3E 钝击类武器已声明 `stats.type === 'bludgeoning'`（如 club.js:15），✗ 依赖无人声明的 crushing 字段。
		crushing: item.stats.crushing === true || item.stats.type === 'bludgeoning',
		});
	}

	item.perform(`${that.name}受到了${dmg}点${DND3.damageTypeLabel(item.stats.type)}伤害` +
		`（${parts.join('，')}${最低伤害 ? '，最低伤害 1 点' : ''}${crit ? '，重击！' : ''}）`);

	/* ★`sgstory#2027`——“命中后追加”原语（契约与不落项见 `core/grapple.js` 档头与 `defOnHit` 注）。
	 *   位置在**伤害与创伤与文案之后** ⇒ 「命中 ⇒ 抓住」在屏上按发生顺序可读；
	 *   目标已出局者由 `DND3.runOnHit` 自行跳过（同 `#1780` A5 的惯例）。
	 *   ⚠ 件未声明 `stats.onHit` ⇒ 下面**一行不跑** ⇒ 既有武器零回归（本仓已注册的道具无一声明）。 */
	if (item.stats.onHit) {
		DND3.runOnHit?.(item.stats.onHit, { attacker: from, target: that, item, damage: dmg, crit });
	}
};
