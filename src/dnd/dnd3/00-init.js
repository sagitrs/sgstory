/* raw */
/* DND3 规则包 —— D&D 3.5 数值块约定与命名空间（构建在 setup.RPG 之上）
 *
 * stats 数值块字段约定（角色 / 道具通用）：
 *   角色：ac（防御等级）bab（基础攻击加成）str_mod（力量调整值）
 *         heal_bonus（治疗加成）cr（挑战等级）
 *   武器：dmg（伤害骰 '1d6'）crit（重击倍率 ×2）range（射程增量）
 *         weight / cost / type / prof
 * 判定规则：攻击掷骰 = 1d20 + bab + str_mod，对抗目标 ac；
 *   天然 1 必失手、天然 20 必命中并做重击确认（见 items/club.js）。
 */
setup.DND3 = {
	version: '0.1.0',
	pack: 'dnd3',
};

/**
 * 标准 3E 数值块：所有字段带默认值，角色之间保持**完全对称**
 * （玩家有的字段哥布林也有，反之亦然）。定义角色时一律走
 * DND3.stats({ 覆盖… })，不要手写残缺的块。
 */
setup.DND3.STAT_BLOCK = {
	str_mod: 0, dex_mod: 0, con_mod: 0, // 六维调整值（前半）
	int_mod: 0, wis_mod: 0, cha_mod: 0, // 六维调整值（后半）
	ac: 10, // 防御等级
	bab: 0, // 基础攻击加成
	heal_bonus: 0, // 治疗加成
	cr: 0, // 挑战等级
};
setup.DND3.stats = (over = {}) => ({ ...setup.DND3.STAT_BLOCK, ...over });

/** 1d20 —— 3E 检定的基础（core 只提供通用掷骰 RPG.roll） */
setup.DND3.d20 = () => setup.RPG.roll('1d20');
