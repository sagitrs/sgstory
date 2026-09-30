/* raw */
/* DND5E 规则包 —— D&D 5e (2024 SRD) 数值块约定与命名空间
 *
 * 与 dnd3 平行的规则包，构建在 setup.RPG 之上。
 * 规则来源：https://github.com/downfallx/dnd-5e-srd-markdown
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
 */
setup.DND5E.STAT_BLOCK = {
	str_mod: 0, dex_mod: 0, con_mod: 0, // 六维调整值（前半）
	int_mod: 0, wis_mod: 0, cha_mod: 0, // 六维调整值（后半）
	ac: 10,       // 基础 AC（无甲时 10+灵巧；穿甲后由 acOf 计算）
	prof: 2,      // 熟练度加值（1-4级 +2，5-8级 +3…替代 3E 的 BAB）
	cr: 0,        // 挑战等级
};
setup.DND5E.stats = (over = {}) => ({ ...setup.DND5E.STAT_BLOCK, ...over });

/** 1d20 —— 5E 一切检定的基础 */
setup.DND5E.d20 = () => setup.RPG.roll('1d20');

/** 优势 / 劣势（5E 标志性机制：掷 2d20 取高/低） */
setup.DND5E.d20adv = () => Math.max(setup.RPG.roll('1d20'), setup.RPG.roll('1d20'));
setup.DND5E.d20dis = () => Math.min(setup.RPG.roll('1d20'), setup.RPG.roll('1d20'));
// 注意：槽位中文名（RPG.slotLabels）在 core/combat.js 的包装内设置，
// 避免在 raw 文件里引用可能未初始化的 RPG 属性。
