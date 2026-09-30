/* raw */
/* DND5E 规则包 —— D&D 5e (2024 SRD) 数值块约定与命名空间
 *
 * 与 dnd3 平行的规则包，构建在 setup.RPG 之上。
 * 规则来源：SRD 5.2.1（2024）· `downfallx/dnd-5e-srd-markdown` @ `1b4b99d…`
 *   —— 可复核锚（commit／文件／sha1）与引用形约定见仓根 `README.md`「规则来源」；
 *      归属与许可全文见 `NOTICE` / `LICENSE-CONTENT.md`（CC BY 4.0）。
 *
 * 5E 与 3.5E 的关键差异（详见 core/combat.js）：
 *   - 攻击加成 = 熟练度(prof) + 力量或灵巧（不再用 BAB）
 *   - 重击 = 仅天然 20，**全部伤害骰翻倍**（调整值不翻倍）
 *   - 护甲**替换**基础 AC（非加值）：轻甲 AC+灵巧，中甲 AC+灵巧(上限2)，重甲固定
 *   - 武器有属性标签（Finesse 可用灵巧、Versatile 双手加大骰等）
 */
setup.DND5E = {
	version: '0.1.0',
	pack: 'dnd-5e',
};

/**
 * 标准 5E 数值块：所有字段带默认值，角色之间保持**完全对称**。
 * 定义角色时一律走 DND5E.stats({ 覆盖… })，不要手写残缺的块。
 *
 * 六维存**原始分**（#1697 P1）：调整值不落字段，一律由 `DND5E.modOf(stats, 维)` 现算。
 * 原始分缺省 10 ⇒ 调整值 +0，与旧的 `*_mod: 0` 中性值等价。
 */
setup.DND5E.STAT_BLOCK = {
	str: 10, dex: 10, con: 10, // 六项原始分（前半）
	int: 10, wis: 10, cha: 10, // 六项原始分（后半）
	ac: 10,       // 基础 AC（无甲时 10+灵巧；穿甲后由 acOf 计算）
	prof: 2,      // 熟练度加值（1-4级 +2，5-8级 +3…替代 3E 的 BAB）
	cr: 0,        // 挑战等级
};
setup.DND5E.stats = (over = {}) => ({ ...setup.DND5E.STAT_BLOCK, ...over });

/**
 * 定制写入路径（`setScore`）的原始分上限＝20。
 * 引用：SRD 5.2.1 · `playing-the-game.md:58`（「Each ability has a score from 1 to 20…」）。
 * 注：静态声明路径不受此限（怪物可由 `stats()` 直接声明更高值）。
 */
setup.DND5E.ABILITY_MAX = 20;

/** 原始分 → 调整值。引用：SRD 5.2.1 · `playing-the-game.md:101`「Ability Modifiers」节与
 *  同文 `:115` 的 Ability Modifiers 表（表值 10–11⇒+0、20–21⇒+5…）；
 *  本实现为等价闭式：floor((分−10)/2)。
 *  缺参（未设该维）按缺省原始分 10 计 ⇒ +0，即旧 `?? 0` 的中性语义。 */
setup.DND5E.abilityMod = (score) => Math.floor(((score ?? 10) - 10) / 2);

/** 取某维的调整值（消费点统一走这里；`stats` 可为 undefined） */
setup.DND5E.modOf = (stats, ability) => setup.DND5E.abilityMod(stats?.[ability]);

/** 1d20 —— 5E 一切检定的基础 */
setup.DND5E.d20 = () => setup.RPG.roll('1d20');

/** 优势 / 劣势（5E 标志性机制：掷 2d20 取高/低） */
setup.DND5E.d20adv = () => Math.max(setup.RPG.roll('1d20'), setup.RPG.roll('1d20'));
setup.DND5E.d20dis = () => Math.min(setup.RPG.roll('1d20'), setup.RPG.roll('1d20'));
// 注意：槽位中文名（RPG.slotLabels）在 core/combat.js 的包装内设置，
// 避免在 raw 文件里引用可能未初始化的 RPG 属性。
