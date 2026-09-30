/* D20M 核心扩展 —— d20 Modern 战斗数学（攻击 / 防御 / 击倒结算）
 *
 * 判定数学的唯一去处：武器道具的 `used()` 只做数据声明，
 * 掷骰、威胁范围与确认、防御对抗全部在这里 —— 加新武器零重复判定代码。
 */

/** 槽位中文名（core 只存表、不认识槽名；规则包补名） */
RPG.slotLabels.weapon = '武器';
RPG.slotLabels.body = '身体';
RPG.slotLabels.feet = '脚';
RPG.slotLabels.arms = '臂'; // 义体槽（本笔自证件用；义体≠装备的缺口语义见 #1732 B5）

/**
 * 有效防御 ＝ 基础 stats.ac ＋ 全部已装备道具的 stats.ac_bonus。
 * ★**house rule**：本笔按**此形式**落（与 dnd3 同形）。MSRD 的防御面另有「职业防御加值」
 *  （且护甲装备加值与它**不叠加**等条款），该节（防御 `8msrddefense防御.md`）**✗ 在本笔 pin 面内**
 *  ⇒ 本笔 **✗ 声称对齐**，其落地留后续票；本处只登记「本笔用的是简化式」这一事实。
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
 *  d20 Modern 的濒死/死亡判定面（`27msrdcombat战斗.md`）本笔未 pin，本处只复用 core 的 RPG.death） */
D20M.grantDeathIfDown = (that) => {
	if (that instanceof RPG.Character && that.hp <= 0 && !that.contains(RPG.death)) {
		that.gain(RPG.death);
	}
};

/**
 * d20M 攻击（近战与火器共用）：
 *   未装备时先「拔出」；手被其他武器占着则本次失败（火器无需拔出）。
 *   攻击掷骰 = 1d20 + 基础攻击加值 ＋（远程／火器用**灵巧**，近战用**力量**），对抗 D20M.acOf(目标)。
 *   ★基础判定式**对齐** SRD d20M · source/1Modern现代/2msrdbasics基本.md:37（「d20 + Modifiers vs. Target Number」）
 *   ★**待核项（本笔显式登记，✗ 冒充对齐）**：MSRD 总则（同上 :43）明说天然 20 ✗ 自动成功、
 *     天然 1 ✗ 自动失败（「unless the rules state otherwise」）；攻击面的例外条款在其战斗节
 *     （`27msrdcombat战斗.md`，本笔未 pin）⇒ 本笔**按 dnd3 同形**落「天然 1 必失 / 天然 20 必中」，
 *     记为 **house rule 面** 并在 #1744 票面登记待核；战斗节 pin 后须回来改判。
 *   伤害下限引用：SRD d20M · source/1Modern现代/2msrdbasics基本.md:25-27
 *     （分数向下取整；「Certain rolls, such as damage and hit points, have a minimum of 1」）
 *   ★**待核项 2（同步登记）**：本笔的**伤害修正**按 dnd3 同形落「近战加力量、远程加灵巧」——
 *     而 3.x 系（d20 Modern 属之）的「**远程伤害不加能力调整值**」条款在其战斗节（未 pin）
 *     ⇒ 本处同样记 **house rule 面**，✗ 声称对齐；战斗节 pin 后与上一条一并改判。
 */
D20M.attack = (item, that, from) => {
	const isRanged = item.stats.ranged === true;
	if (!isRanged && !item.equipped) {
		const held = RPG.equippedWeapon();
		if (held && held.id !== item.id) {
			item.perform(`你得先腾出手——「${held.name}」还握在手里。`);
			return;
		}
		item.equipped = true; // 拔出武器（useItem 会提交回背包快照）
		item.perform(`你握紧了「${item.name}」。`);
	}

	const f = from?.stats ?? {};
	// 远程（含火器）用灵巧，近战用力量
	const abilMod = D20M.modOf(f, isRanged ? 'dex' : 'str');
	const atkMod = (f.bab ?? 0) + abilMod;
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

	// 威胁（≥ stats.critMin，默认 20）⇒ 确认掷命中则伤害骰掷两次（MSRD 武器表「Critical」列）
	const crit = !noDodge && die >= critMin && D20M.d20() + atkMod >= ac;
	const times = crit ? (item.stats.crit ?? 2) : 1;
	const parts = [];
	let dmg = 0;
	for (let i = 0; i < times; i++) {
		const r = RPG.rollDetail(item.stats.dmg);
		dmg += r.total + abilMod;
		parts.push(r.rolls.join('+') + (abilMod ? RPG.formatMod(abilMod) : ''));
	}
	if (dmg < 1) dmg = 1; // 见上「伤害下限」引用

	that.hp = Math.max(0, (that.hp ?? 0) - dmg);
	D20M.grantDeathIfDown(that);

	item.perform(`${that.name}受到了${dmg}点${item.stats.type ?? '冲击'}伤害` +
		`（${parts.join('，')}${crit ? '，重击！' : ''}）`);
};
