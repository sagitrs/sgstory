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
/** 包标识（Symbol 键）：显式标注数值块的**归属包**，供跨包判据使用（如 #1741 的闸门只接管本包角色）。
 *  ⚠ 用 Symbol 而非字符串键的理由（三条同时成立）：
 *    ① 不进 `Object.keys` ⇒ `#1697` 的「键集精确相等」用例（U9）不受影响；
 *    ② 不进 `JSON.stringify` ⇒ **存档面零变化**；
 *    ③ 但**随对象展开 `{...stats}` 保留**（Symbol 是自有可枚举属性）⇒ 经 `Character` 构造后仍在。
 *  两侧包共用 `Symbol.for` 同一键、各写各的值 ⇒ 判据可写「等于本包名」。 */
setup.DND5E.PACK = Symbol.for('rpg.pack.dnd-5e');
	// ⚠ 每包**独立 Symbol 键**（键名带包名）：同一 stats 上两包的标识互不覆盖，
	//   判据「stats[P5]==='dnd-5e'」与「stats[P3]==='dnd3'」可同时为真而不冲突；
	//   若共用一键，后写入者会抹掉先写入者（加载序耦合）——正是 T 复审抓到的形态。

setup.DND5E.stats = (over = {}) => ({ ...setup.DND5E.STAT_BLOCK, ...over, [setup.DND5E.PACK]: 'dnd-5e' });

/** 还原侧修补（#1758 丙形）：Symbol 标识不进 JSON ⇒ 存档往返 / State 快照 / Player 桥接后都会丢。
 *  本包注册一个钩子，把它**就地**重挂回去（键集与 JSON 面零变化 ⇒ 不影响键集用例与存档格式）。 */
setup.RPG.onReviveStats((stats) => {
	// ⚠ 只在 stats **呈本包形状**时重挂 —— 否则两包钩子会互相覆盖（后者胜 = 与加载序耦合）
	//   判据用本包的**独有字段**（5E 有 `prof`、3E 有 `bab`），不由注册顺序决定。
	if (!('prof' in stats)) return;
	stats[setup.DND5E.PACK] = 'dnd-5e';
});
/** 第五档「消耗依赖」的**存量命名空间**（#1759 §十.4）——与 `DND5E.Conditions` **平行**：
 *  存量是本仓**设计**（非 SRD）⇒ 独立注册表，✗ 混入 `Conditions`（否则稀释其可 pin 纯度、
 *  并使 §三 的「两层键集一致」守卫失去意义）。
 *  ⚠ 本包设计值须标权威形 `house rule（非 SRD）`（见 `tests/README` 与门的 `RE_CLAIM`）。 */
setup.DND5E.Environment = {};

/** 本包声明一条存量（薄封装：绑上本包 `STAT_BLOCK` ⇒ **机械强制** B 裁定「第 5 档经 STAT_BLOCK 声明」）。
 *  返**定义记录**并登记进 `setup.DND5E.Environment`（✗ 直接写 `RPG.stocks` 而漏登记本包命名空间）。 */
setup.DND5E.defStock = (d) => {
	const rec = setup.RPG.defStock({ ...d, statBlock: setup.DND5E.STAT_BLOCK, pack: 'dnd-5e' });
	setup.DND5E.Environment[d.id] = rec;
	return rec;
};


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
