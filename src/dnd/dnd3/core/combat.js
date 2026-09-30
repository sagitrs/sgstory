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
 */
DND3.acOf = (c) => {
	let ac = c?.stats?.ac ?? 10;
	for (const slot of c?.items ?? []) {
		if (!slot.equipped) continue;
		ac += RPG.reviveItem(slot).stats?.ac_bonus ?? 0;
	}
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
DND3.meleeAttack = (item, that, from) => {
	// 远程武器不需拔出，用灵巧
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
	// 远程武器用灵巧，近战用力量
	const abilMod = isRanged ? (f.dex_mod ?? 0) : (f.str_mod ?? 0);
	const atkMod = (f.bab ?? 0) + abilMod;
	const ac = DND3.acOf(that);
	const die = DND3.d20();
	const critMin = item.stats.critMin ?? 20;
	// 目标 noDodge（宝箱等容器的对象性质，非规则量纲）：不会闪避，攻击总是命中
	const noDodge = that?.noDodge === true;

	if (!noDodge && die < critMin && (die === 1 || die + atkMod < ac)) {
		item.perform(`${item.name}挥空了，没有击中${that.name}` +
			`（攻击掷骰 ${die}${atkMod ? RPG.formatMod(atkMod) : ''} vs AC ${ac}）`);
		return;
	}

	const crit = !noDodge && die >= critMin && DND3.d20() + atkMod >= ac;
	const times = crit ? (item.stats.crit ?? 2) : 1;
	const parts = [];
	let dmg = 0;
	for (let i = 0; i < times; i++) {
		const r = RPG.rollDetail(item.stats.dmg);
		dmg += r.total + abilMod; // 重击时调整值同样翻倍
		parts.push(r.rolls.join('+') + (abilMod ? RPG.formatMod(abilMod) : ''));
	}
	if (dmg < 1) dmg = 1; // 惩罚压到 0 以下时至少造成 1 点

	that.hp = Math.max(0, (that.hp ?? 0) - dmg);
	DND3.grantDeathIfDown(that);

	item.perform(`${that.name}受到了${dmg}点${item.stats.type ?? '钝击'}伤害` +
		`（${parts.join('，')}${crit ? '，重击！' : ''}）`);
};
