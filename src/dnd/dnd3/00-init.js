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
	/* ★`sgstory#2030` ＋ `#1762` B-6：**3.5 三豁免的基础加值**（强韧／反射／意志）。
	 *   总分 = 该数 ＋ 对应属性（体质／敏捷／感知）的调整值，由 `core/saves.js` 现加（✗ 不在此预算）。
	 *   出处：SRD 3.5 · `Basic Rules and Legal/basics-and-ability-scores.md:217`／`:200`／`:262`。
	 *   ⚠ 为何进默认块（✗ 只给个别角色）：本仓约定「**玩家有的字段哥布林也有**，反之亦然」
	 *     —— 该约定有机械守卫（`tests/unit/dnd3/characters.test.js` 的键集对称断言）⇒ 单给一侧会当场红。
	 *   ⚠ 缺省 0 ⇒ 总分恰为属性调整值那一份 ⇒ 旧档（缺这三键）**不炸、且拿到属性面**（读侧另有 `?? 0`）。 */
	save_fortitude: 0, save_reflex: 0, save_will: 0, // 三豁免的基础加值（总分见 core/saves.js）
	/* ★`sgstory#2027`：**体型**（擒抱的体型特殊修正读它；短名与 pin 表同形，见 `core/grapple.js`）。
	 *   为何进默认块（✗ 只给个别怪物）：本仓约定「**玩家有的字段哥布林也有**，反之亦然」
	 *   —— 该约定有机械守卫（`tests/unit/dnd3/characters.test.js` 的键集对称断言）⇒ 单给一侧会当场红。
	 *   ⚠ 缺省 `medium` ⇒ 体型修正 **0**，与旧档／未声明体型的角色**逐值同旧**（零回归）；
	 *     读侧另有 `DND3.sizeOf` 的缺省兑底（旧档缺该键时也走 medium）。 */
	size: 'medium', // 体型（fine/diminutive/tiny/small/medium/large/huge/gargantuan/colossal）
};
/** 包标识（Symbol 键）：显式标注数值块的**归属包**，供跨包判据使用（如 #1741 的闸门只接管本包角色）。
 *  ⚠ 用 Symbol 而非字符串键的理由（三条同时成立）：
 *    ① 不进 `Object.keys` ⇒ `#1697` 的「键集精确相等」用例（U9）不受影响；
 *    ② 不进 `JSON.stringify` ⇒ **存档面零变化**；
 *    ③ 但**随对象展开 `{...stats}` 保留**（Symbol 是自有可枚举属性）⇒ 经 `Character` 构造后仍在。
 *  两侧包共用 `Symbol.for` 同一键、各写各的值 ⇒ 判据可写「等于本包名」。 */
setup.DND3.PACK = Symbol.for('rpg.pack.dnd3');
	// ⚠ 每包**独立 Symbol 键**（键名带包名）：同一 stats 上两包的标识互不覆盖，
	//   判据「stats[P5]==='dnd-5e'」与「stats[P3]==='dnd3'」可同时为真而不冲突；
	//   若共用一键，后写入者会抹掉先写入者（加载序耦合）——正是 T 复审抓到的形态。

setup.DND3.stats = (over = {}) => ({ ...setup.DND3.STAT_BLOCK, ...over, [setup.DND3.PACK]: 'dnd3' });

/** 还原侧修补（#1758 丙形）：Symbol 标识不进 JSON ⇒ 存档往返 / State 快照 / Player 桥接后都会丢。
 *  本包注册一个钩子，把它**就地**重挂回去（键集与 JSON 面零变化 ⇒ 不影响键集用例与存档格式）。 */
setup.RPG.onReviveStats((stats) => {
	// ⚠ 只在 stats **呈本包形状**时重挂 —— 否则两包钩子会互相覆盖（后者胜 = 与加载序耦合）
	//   判据用本包的**独有字段**（5E 有 `prof`、3E 有 `bab`），不由注册顺序决定。
	if (!('bab' in stats)) return;
	stats[setup.DND3.PACK] = 'dnd3';
});
/** 第五档「消耗依赖」的**存量命名空间**（#1759 §十.4）——与 `DND3.Conditions` **平行**：
 *  存量是本仓**设计**（非 SRD）⇒ 独立注册表，✗ 混入 `Conditions`（否则稀释其可 pin 纯度、
 *  并使 §三 的「两层键集一致」守卫失去意义）。
 *  ⚠ 本包设计值须标权威形 `house rule（非 SRD）`（见 `tests/README` 与门的 `RE_CLAIM`）。 */
setup.DND3.Environment = {};

/** 本包声明一条存量（薄封装：绑上本包 `STAT_BLOCK` ⇒ **机械强制** B 裁定「第 5 档经 STAT_BLOCK 声明」）。
 *  返**定义记录**并登记进 `setup.DND3.Environment`（✗ 直接写 `RPG.stocks` 而漏登记本包命名空间）。 */
setup.DND3.defStock = (d) => {
	const rec = setup.RPG.defStock({ ...d, statBlock: setup.DND3.STAT_BLOCK, pack: 'dnd3' });
	setup.DND3.Environment[d.id] = rec;
	return rec;
};

/* 接线（D2 #1777）：`battle:end` ⇒ 复位 `scope:'battle'` 的存量（core ✗ 不认识包/条件 ⇒ 由包侧订阅；
 * 与 `conditions.js` 的清条件订阅**同哲学**）。
 * ★各包**只清自己声明的**（传 pack 名）：core 亦订阅 `pack=null` 那一档 ⇒ 每条接线都是**承载路径**
 *  （D2 实测：首版各包**代清全部** ⇒ 拔掉本包接线仍绿，是死码）。 */
setup.RPG.events.on('battle:end', ({ players = [], enemies = [] } = {}) => {
	for (const c of [...players, ...enemies]) {
		if (c instanceof setup.RPG.Character) setup.RPG.clearStocksScoped(c, 'dnd3');
	}
});



/** 3E 面**不设**通用属性上限（既有的定制写入路径不引入上限）——`null` 表示不校验。 */
setup.DND3.ABILITY_MAX = null;

/** 原始分 → 调整值（与 5E 同式）。引用：SRD 3.5 · `Basic Rules and Legal/basics-and-ability-scores.md:150`
 *  （Table: Ability Modifiers and Bonus Spells）；缺参按缺省原始分 10 计 ⇒ +0。 */
setup.DND3.abilityMod = (score) => Math.floor(((score ?? 10) - 10) / 2);

/** 取某维的调整值（消费点统一走这里；`stats` 可为 undefined） */
setup.DND3.modOf = (stats, ability) => setup.DND3.abilityMod(stats?.[ability]);

/** 1d20 —— 3E 检定的基础（core 只提供通用掷骰 RPG.roll） */
setup.DND3.d20 = () => setup.RPG.roll('1d20');
setup.RPG.登记包空间?.('dnd3', setup.DND3);   // ★`sgstory#1743` A₁：把本包命名空间交给 core 的登记表（✗ 让 core 去摸 setup）
