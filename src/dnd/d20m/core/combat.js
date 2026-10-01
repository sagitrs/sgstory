/* D20M 核心扩展 —— d20 Modern 战斗数学（攻击 / 防御 / 击倒结算）
 *
 * 判定数学的唯一去处：武器道具的 `used()` 只做数据声明，
 * 掷骰、威胁范围与确认、防御对抗全部在这里 —— 加新武器零重复判定代码。
 * ★本文件的判定条款**逐条对源**（战斗节已入 pin 表）：`27msrdcombat战斗.md`。
 */

/** 槽位中文名（core 只存表、不认识槽名；规则包补名） */
RPG.slotLabels.weapon = '武器';
RPG.slotLabels.body = '身体';
RPG.slotLabels.feet = '脚';
RPG.slotLabels.arms = '臂'; // 义体槽（本笔自证件用；义体≠装备的缺口语义见 #1732 B5）

/**
 * 有效防御 ＝ 基础 stats.ac ＋ 全部已装备道具的 stats.ac_bonus。
 * 源文的防御式**对齐** SRD d20M · source/1Modern现代/27msrdcombat战斗.md:103
 *   （「10 + Dexterity modifier + class bonus + equipment bonus + size modifier」）
 * ★但**本笔只落了其中三项**（10／灵巧／装备加值）——**职业加值（class bonus）与体型加值未落**
 *   ⇒ 本处是 **house rule 面**（✗ 声称完全对齐），其落地牵动「职业面」（#1744 票面 ✗ 不做清单）。
 */
D20M.acOf = (c) => {
	let ac = c?.stats?.ac ?? 10;
	for (const slot of c?.items ?? []) {
		if (!slot.equipped) continue;
		ac += RPG.reviveItem(slot).stats?.ac_bonus ?? 0;
	}
	return ac;
};

/** 击倒结算：目标 HP 归零且未持有死亡减益 → 获得之（**house rule** 简化：
 *  d20 Modern 的濒死/死亡判定面本笔未落，本处只复用 core 的 RPG.death） */
D20M.grantDeathIfDown = (that) => {
	if (that instanceof RPG.Character && that.hp <= 0 && !that.contains(RPG.death)) {
		that.gain(RPG.death);
	}
};

/**
 * d20M 攻击（近战与火器共用）：
 *   未装备时先「拔出」；手被其他武器占着则本次失败（火器无需拔出）。
 *   攻击掷骰 = 1d20 + 基础攻击加值 ＋（远程／火器用**灵巧**，近战用**力量**），对抗 D20M.acOf(目标)。
 *
 * 逐条对源（战斗节 `27msrdcombat战斗.md`，本笔已入 pin 表 ⇒ 各条可机械复核）：
 *   · 判定式**对齐** SRD d20M · source/1Modern现代/27msrdcombat战斗.md:19
 *     （「rolls 1d20 and adds his or her attack bonus. If the result equals or beats the target's Defense,
 *       the character hits and deals damage」）
 *   · 远程用灵巧**对齐** SRD d20M · source/1Modern现代/27msrdcombat战斗.md:59
 *     （「a character's Dexterity modifier applies when the character attacks with a ranged weapon」）
 *   · 天然 1／20**对齐** SRD d20M · source/1Modern现代/27msrdcombat战斗.md:21
 *     （「A natural 1 … is always a miss. A natural 20 … is always a hit. A natural 20 is also always a
 *       threat—a possible critical hit.」）
 *   · 重击确认**对齐** SRD d20M · source/1Modern现代/27msrdcombat战斗.md:91
 *     （「immediately makes another attack roll with all the same modifiers … If the second roll also
 *       results in a hit against the target's Defense, the attack is a critical hit」）
 *   · 伤害修正**对齐** SRD d20M · source/1Modern现代/27msrdcombat战斗.md:77
 *     （「hits with a melee weapon **or thrown weapon**, add his or her Strength modifier to the damage」
 *       ⇒ 反向即**远程不加**；本席另做全源反向扫（`Dexterity.*damage`）无命中 ⇒ 无「远程加灵巧伤害」之说）
 *   · 伤害下限**对齐** SRD d20M · source/1Modern现代/2msrdbasics基本.md:25-27
 *     （分数向下取整；「Certain rolls, such as damage and hit points, have a minimum of 1」）
 *
 * ★**与总则的关系（本笔初稿曾登记为「待核」，现已改判）**：总则 SRD d20M · source/1Modern现代/2msrdbasics基本.md:43
 *   写「A natural 20 … is *not* an automatic success. A natural 1 … is *not* an automatic failure,
 *   **unless the rules state otherwise**」——战斗节的 `:21` **正是**那句所指的例外条款
 *   ⇒ 两处**不矛盾**，本处的天然 1／20 面**是对齐源文**，✗ 不再是 house rule。
 *   同理，伤害修正面本笔初稿按 dnd3 同形落「远程加灵巧」⇒ 已按 `:77` **改判为远程不加**
 *   （✗ 以「未 pin 战斗节」为由留偏离）。
 *
 * ★本笔**未落**（各自缺承载体，✗ 冒充）：武器非擅长 −4（`:23`）／装备加值与职业加值的不叠加细化／
 *   威胁范围的非 20 档（源武器表 `Critical` 列已有 20 档数据，本包火器即 20）。
 */
D20M.attack = (item, that, from) => {
	const isRanged = item.stats.ranged === true;
	if (!isRanged && !item.equipped) {
		const held = RPG.equippedWeapon();
		if (held && held.id !== item.id) {
			item.perform(`你得先腾出手——「${held.name}」还握在手里。`);
			/* ★`return **false**`（`#1813` 笔 2）：拒绝（打不出去）⇒ `rejected/action-refused`。
			 *   ⚠ **✗ 与「没有击中」同改**（见下方失手支）—— 失手是「攻击**已发生**」⇒ 须留 `return;`。 */
			return false;
		}
		item.equipped = true; // 拔出武器（useItem 会提交回背包快照）
		item.perform(`你握紧了「${item.name}」。`);
	}

	const f = from?.stats ?? {};
	// 攻击掷骰：远程（含火器）用灵巧，近战用力量（见上「远程用灵巧」引用）
	const atkMod = (f.bab ?? 0) + D20M.modOf(f, isRanged ? 'dex' : 'str');
	const ac = D20M.acOf(that);
	const die = D20M.d20();
	const critMin = item.stats.critMin ?? 20;
	// 目标 noDodge（容器等对象性质，非规则量纲）：不会闪避，攻击总是命中
	const noDodge = that?.noDodge === true;

	if (!noDodge && die < critMin && (die === 1 || die + atkMod < ac)) {
		item.perform(`${item.name}没有击中${that.name}` +
			`（攻击掷骰 ${die}${atkMod ? RPG.formatMod(atkMod) : ''} vs 防御 ${ac}）`);
		return;
	}

	// 威胁（≥ stats.critMin，默认 20）⇒ 确认掷命中则伤害掷两次（见上「重击确认」引用）
	const crit = !noDodge && die >= critMin && D20M.d20() + atkMod >= ac;
	const times = crit ? (item.stats.crit ?? 2) : 1;
	// 伤害修正：仅近战／投掷加力量 —— 远程不加（见上「伤害修正」引用）
	const dmgMod = isRanged ? 0 : D20M.modOf(f, 'str');
	const parts = [];
	let dmg = 0;
	for (let i = 0; i < times; i++) {
		const r = RPG.rollDetail(item.stats.dmg);
		dmg += r.total + dmgMod;
		parts.push(r.rolls.join('+') + (dmgMod ? RPG.formatMod(dmgMod) : ''));
	}
	if (dmg < 1) dmg = 1; // 见上「伤害下限」引用

	that.hp = Math.max(0, (that.hp ?? 0) - dmg);
	D20M.grantDeathIfDown(that);

	item.perform(`${that.name}受到了${dmg}点${item.stats.type ?? '冲击'}伤害` +
		`（${parts.join('，')}${crit ? '，重击！' : ''}）`);
};
