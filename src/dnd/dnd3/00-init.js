/* raw */
/* DND3 规则包 —— D&D 3.5 数值块约定与命名空间（构建在 setup.RPG 之上）
 *
 * stats 数值块字段约定（角色 / 道具通用）：
 *   角色：ac（防御等级）bab（基础攻击加成）六项**原始分**（str…cha）
 *         heal_bonus（治疗加成）cr（挑战等级）
 *   武器：dmg（伤害骰 '1d6'）crit（重击倍率 ×2）range（射程增量）
 *         weight / cost / type / prof
 * 判定规则：攻击掷骰 = 1d20 + bab + 力量调整值，对抗目标 ac；
 *   天然 1 必失手、天然 20 必命中并做重击确认（见 items/club.js）。
 *
 * 规则来源：SRD 3.5 · `Obsidian-TTRPG-Community/DnD-3.5-SRD-Markdown` @ `70a6b26…`
 *   —— 可复核锚与引用形约定见仓根 `README.md`「规则来源」；许可见
 *      `LICENSE-CONTENT.md`（OGL 1.0a）与 `NOTICE`。
 */
setup.DND3 = {
	version: '0.1.0',
	pack: 'dnd3',
};

/**
 * 标准 3E 数值块：所有字段带默认值，角色之间保持**完全对称**
 * （玩家有的字段哥布林也有，反之亦然）。定义角色时一律走
 * DND3.stats({ 覆盖… })，不要手写残缺的块。
 *
 * 六维存**原始分**（#1697 P1）：调整值不落字段，一律由 `DND3.modOf(stats, 维)` 现算。
 * 原始分缺省 10 ⇒ 调整值 +0，与旧的 `*_mod: 0` 中性值等价。
 */
setup.DND3.STAT_BLOCK = {
	str: 10, dex: 10, con: 10, // 六项原始分（前半）
	int: 10, wis: 10, cha: 10, // 六项原始分（后半）
	ac: 10, // 防御等级
	bab: 0, // 基础攻击加成
	heal_bonus: 0, // 治疗加成
	cr: 0, // 挑战等级
};
setup.DND3.stats = (over = {}) => ({ ...setup.DND3.STAT_BLOCK, ...over });

/** 3E 面**不设**通用属性上限（既有的定制写入路径不引入上限）——`null` 表示不校验。 */
setup.DND3.ABILITY_MAX = null;

/** 原始分 → 调整值（与 5E 同式）。引用：SRD 3.5 · `Basic Rules and Legal/basics-and-ability-scores.md:150`
 *  （Table: Ability Modifiers and Bonus Spells）；缺参按缺省原始分 10 计 ⇒ +0。 */
setup.DND3.abilityMod = (score) => Math.floor(((score ?? 10) - 10) / 2);

/** 取某维的调整值（消费点统一走这里；`stats` 可为 undefined） */
setup.DND3.modOf = (stats, ability) => setup.DND3.abilityMod(stats?.[ability]);

/** 1d20 —— 3E 检定的基础（core 只提供通用掷骰 RPG.roll） */
setup.DND3.d20 = () => setup.RPG.roll('1d20');
