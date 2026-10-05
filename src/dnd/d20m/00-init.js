/* raw */
/* D20M 规则包 —— d20 Modern（MSRD）数值块约定与命名空间
 *
 * 与 dnd3 / dnd-5e 平行的规则包，构建在 setup.RPG 之上。
 * 规则来源：Modern System Reference Document（MSRD）· `qt911025/d20m-srd-zhcn` @ `1733391d…`
 *   —— 可复核锚（commit／文件／行数／sha1-16）与引用形约定见仓根 `README.md`「规则来源」§一；
 *      归属与许可全文见 `NOTICE` 与 `LICENSE-CONTENT.md` 第四节（OGL 1.0a，§15 照录）。
 *
 * ★包纯度（#1712 裁定）：`d20m` 只放 MSRD 面对象与数值 —— 跨版同物（如「手枪」在本包与 5E 面）
 *   ＝**两个对象、各自 pin**（Goblin↔Goblin Minion 通则），✗ 互相搬运。
 * ★消费方守则（`src/README.md` 已知边界 F2）：直接用 `new D20M.Beretta92F()` 实例化，
 *   ✗ 走 `RPG.createItem(id)` —— 各包共用一张注册表，同 id 后者静默覆盖前者。
 * ★别名由**目录名**唯一决定（build.py）：`src/dnd/d20m/**` ⇒ `setup.D20M`（包内 ✗ 自选短名）。
 */
setup.D20M = {
	version: '0.1.0',
	pack: 'd20m',
};

/**
 * 标准 d20M 数值块：所有字段带默认值，角色之间保持**完全对称**。
 * 定义角色时一律走 D20M.stats({ 覆盖… })，不要手写残缺的块。
 *
 * 六维存**原始分**（#1697 P1）：调整值不落字段，一律由 `D20M.modOf(stats, 维)` 现算。
 * 原始分缺省 10 ⇒ 调整值 +0，与既有两包的中性缺省等价。
 * ★本笔（#1744 骨架）**不落**的面（各自牵动 core 或战斗数学，走后续票）：职业防御加值、
 *   非致命伤害、（nonlethal 档）、巨额伤害阈值、（massive damage 阈值）、行动点（action points）。
 */
setup.D20M.STAT_BLOCK = {
	str: 10, dex: 10, con: 10, // 六项原始分（前半）
	int: 10, wis: 10, cha: 10, // 六项原始分（后半）
	ac: 10, // 基础防御；**house rule**：本笔按「10 ＋ 灵巧 ＋ 装备加值」落，MSRD 的职业防御加值未落
	bab: 0, // 基础攻击加值（MSRD 的 nonheroic 机器人取「3/4 总 Hit Dice」，由数据声明）
	cr: 0, // 挑战等级
};
setup.D20M.stats = (over = {}) => ({ ...setup.D20M.STAT_BLOCK, ...over });

/** 属性上限：MSRD **不设**通用上限。引用：SRD d20M · source/1Modern现代/3msrdabilityscores属性值.md:68（「Ability scores can increase with no limit.」）
 *  ⇒ `null` ＝ 与 dnd3 同语义（只校验正整数，不设上界）。同文 :14「normal human range is 3 to 18」
 *  是**描述性**口径（人类常态范围），✗ 作硬上界 —— 两者 ✗ 混读。 */
setup.D20M.ABILITY_MAX = null;

/** 原始分 → 调整值。引用：SRD d20M · source/1Modern现代/3msrdabilityscores属性值.md:24（公式「(ability/2) -5 [round result down]」）
 *  本实现为**等价闭式** floor((分−10)/2)（两式对全部整数等价）；同文 :25 的「round down」总则见
 *  `src/dnd/d20m/core/combat.js` 的引用点。缺参（未设该维）按缺省原始分 10 计 ⇒ +0。 */
setup.D20M.abilityMod = (score) => Math.floor(((score ?? 10) - 10) / 2);

/** 取某维的调整值（消费点统一走这里；`stats` 可为 undefined） */
setup.D20M.modOf = (stats, ability) => setup.D20M.abilityMod(stats?.[ability]);

/** 1d20 —— d20M 一切检定的基础。引用：SRD d20M · source/1Modern现代/2msrdbasics基本.md:37（「d20 + Modifiers vs. Target Number」）
 *  （core 只提供通用掷骰 RPG.roll；带规则色彩的便利函数归规则包） */
setup.D20M.d20 = () => setup.RPG.roll('1d20');
// 注意：槽位中文名（RPG.slotLabels）在 core/combat.js 的包装内设置，
// 避免在 raw 文件里引用可能未初始化的 RPG 属性。
setup.RPG.登记包空间?.('d20m', setup.D20M);   // ★`sgstory#1743` A₁：把本包命名空间交给 core 的登记表（✗ 让 core 去摸 setup）
