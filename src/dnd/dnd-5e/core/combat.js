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
 *   未穿甲 = 10 + dex_mod。
 */
DND5E.acOf = (c) => {
	const dex = c?.stats?.dex_mod ?? 0;
	const body = (c?.items ?? []).find((s) => s.equipped && RPG.reviveItem(s).slot === 'body');
	if (!body) return 10 + dex; // 无甲
	const armor = RPG.reviveItem(body);
	const a = armor.stats.armor ?? {};
	if (!a.dex) return a.base ?? 10;                        // 重甲：固定
	if (a.dexMax != null) return a.base + Math.min(dex, a.dexMax); // 中甲：灵巧上限
	return a.base + dex;                                    // 轻甲：全额灵巧
};

/** 击倒结算：HP 归零 → death 减益（5E 里目标应做死亡豁免，此处简化） */
DND5E.grantDeathIfDown = (that) => {
	if (that instanceof RPG.Character && that.hp <= 0 && !that.contains(RPG.death)) {
		that.gain(RPG.death);
	}
};

/**
 * 5E 近战/远程攻击（木棒、长剑、炸弹等共用）：
 *   攻击掷骰 = 1d20 + 熟练度(若熟练) + 力量或灵巧（Finesse 取高者）
 *   天然 20 = 重击 → **全部伤害骰翻倍**（调整值不翻倍）
 *   武器 stats.finesse: true 时用 max(str_mod, dex_mod) 作为攻击与伤害调整值
 */
DND5E.attack = (item, that, from) => {
	// 近战武器拔出检查（复用 core 逻辑）
	if (item.slot === 'weapon' && !item.equipped) {
		const held = RPG.equippedWeapon();
		if (held && held.id !== item.id) {
			item.perform(`你得先腾出手——「${held.name}」还握在手里。`);
			return;
		}
		item.equipped = true;
		item.perform(`你握紧了「${item.name}」。`);
	}

	const f = from?.stats ?? {};
	// 5E：Finesse 武器取 max(str, dex)；普通近战用 str；投掷/远程用 dex
	const isFinesse = item.stats.finesse === true;
	const isRanged = item.stats.ranged === true;
	const abilMod = isRanged
		? (f.dex_mod ?? 0)
		: isFinesse
			? Math.max(f.str_mod ?? 0, f.dex_mod ?? 0)
			: (f.str_mod ?? 0);
	// 熟练度：简单/军用武器默认熟练（简化：prof 直接加）
	const prof = f.prof ?? 0;
	const atkMod = prof + abilMod;

	const ac = that?.stats?.ac ?? 10; // 5E 直接读 stats.ac（acOf 算好后写入）
	const die = DND5E.d20();
	const noDodge = that?.noDodge === true;

	if (!noDodge && die !== 20 && (die === 1 || die + atkMod < ac)) {
		item.perform(`${item.name}挥空了，没有击中${that.name}` +
			`（攻击掷骰 ${die}${atkMod ? RPG.formatMod(atkMod) : ''} vs AC ${ac}）`);
		return;
	}

	// 5E 重击：仅天然 20，全部伤害骰翻倍（调整值不翻倍）
	const crit = !noDodge && die === 20;
	const diceCount = crit ? 2 : 1;
	const parts = [];
	let dmg = 0;
	for (let i = 0; i < diceCount; i++) {
		const r = RPG.rollDetail(item.stats.dmg);
		dmg += r.total;
		parts.push(r.rolls.join('+'));
	}
	dmg += abilMod; // 调整值只加一次（5E 规则）
	if (dmg < 1) dmg = 1;

	that.hp = Math.max(0, (that.hp ?? 0) - dmg);
	DND5E.grantDeathIfDown(that);

	const dmgType = item.stats.type ?? 'bludgeoning';
	item.perform(`${that.name}受到了${dmg}点${dmgType}伤害` +
		`（${parts.join('，')}${abilMod ? RPG.formatMod(abilMod) : ''}${crit ? '，重击！' : ''}）`);
};
