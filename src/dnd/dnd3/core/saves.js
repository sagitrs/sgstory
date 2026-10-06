/* DND3 核心扩展 —— 豁免检定与状态效果（恐惧）
 *
 * ## 三豁免的口径（3.5）
 *   · 类型：强韧 `fortitude`、反射 `reflex`、意志 `will`（✗ 旧 B/X 的 `petrification`／`spells`）。
 *   · 总分 = **基础加值**（`stats.save_<类型>`，缺省 0）＋ 该豁免的**属性调整值** ＋ 创伤罚。
 *   · 属性对应与出处（均在 pin 面）：强韧＝体质、反射＝敏捷、意志＝感知 ——
 *     SRD 3.5 · `Basic Rules and Legal/basics-and-ability-scores.md:217`（体质 → `Fortitude saving throws`）、
 *     `:200`（敏捷 → `Reflex saving throws`）、`:262`（感知 → `Will saving throws`）。
 *   · ⚠ 字段里存的是**基础加值**（职业与生命骰给的那一份），✗ 不是总分：3.5 的 Saves 行印的是总分
 *     ⇒ 怪物档的该数由「模板 Saves 行 − 模板属性调整值」而得（算术可复核；逐只反算回模板值的判据
 *     在 `tests/unit/dnd3/monster-saves.test.js` 的 ①）。
 *   · ⚠ 本引擎**无职业与等级面** ⇒ 玩家的基础加值恒 0，其总分＝体质／敏捷／感知的调整值之和
 *     （缺面已具名：职业基础豁免加值，见 `player.js` 档头）。
 *
 * ★`sgstory#2030` ＋ `#1762` 的 B-6（**同一笔**落地，本档为规格侧）：
 *   本笔之前是 B/X 分类，且全树**无一声明** `save_*`（`dnd3/00-init.js` 的 `STAT_BLOCK` 里也没有这三个键）
 *   ⇒ 三豁免实质恒 +0（读侧 `?? 0` 兜底把缺口藏住了）。现在三处一起收口：
 *     ① 字段进 `STAT_BLOCK`（默认 0 ⇒ 玩家与怪物**逐键对称**）；② 15 只怪物按模板 Saves 行声明；
 *     ③ 恐惧豁免改用 `will`。
 *   ✗ 不留 `spells` 别名：留别名＝留第二套口径，而本引擎从未写过 `save_*`（旧档里不会有这两个键）。
 */

/* 三豁免 ⇒ 属性（3.5 口径）。本表是**唯一**口径源：测试不另抄一份映射，而是经 `DND3.save` 反算。 */
const SAVE_ABILITY = { fortitude: 'con', reflex: 'dex', will: 'wis' };

/** 豁免检定：1d20 + **基础加值 ＋ 属性调整值** ＋ 创伤罚 vs DC，返回 { success, roll, total, dc, mod, trauma }。
 *  创伤罚（`脑震荡` −1）＝ #1780 §四 C3：**只进 total／success**，✗ 不改 `mod`
 *  （该字段保持「角色自身加值」语义 —— 现在这一份含属性调整值）。 */
DND3.save = (character, type, dc) => {
	const base = character?.stats?.[`save_${type}`] ?? 0;
	const ability = SAVE_ABILITY[type];
	const mod = base + (ability ? DND3.modOf(character?.stats, ability) : 0);
	const trauma = DND3.traumaSaveMod?.(character) ?? 0;
	/* 判定式收敛（#1798 E1a）：创伤罚走 `bonus`（✗ 并入 `mod`）。
	 * ★返回形**逐键不变**（S6）：`tests/unit/core/check-roll.test.js` 钉着这六个键，本笔 ✗ 加键
	 *   —— 若要暴露「基础／属性」两段，另开键名即破 S6 ⇒ 本笔只把两段并进 `mod`。 */
	const r = RPG.checkRoll({ mod, dc, bonus: trauma,
		ctx: { purpose: 'check.save', actor: character?.name ?? null } });   // ★`#2031` 用途定位
	return { success: r.success, roll: r.roll, total: r.total, dc: r.dc, mod: r.mod, trauma };  // ★返回形逐键不变（S6）
};

/** 便捷：执行豁免并 perform 结果 */
DND3.checkSave = (character, type, dc, label = type) => {
	const r = DND3.save(character, type, dc);
	RPG.perform(`（${character.name} 对抗${label}：${r.roll}` +
		`${r.mod ? RPG.formatMod(r.mod) : ''} vs DC ${dc} → ${r.success ? '成功' : '失败'}）`);
	return r.success;
};

/* ---------- 恐惧效果（区域 12 肉团的恐惧光环） ---------- */

/** fear —— dnd3 包的效果定义（由**本包**注册，core 不代劳；见 #1713 F3）。
 *  注册后 `RPG.fear` 即定义单例，可以直接传给 gain/lose/contains（也可传 'fear'）。 */
RPG.fear = RPG.defEffect({
	id: 'fear',
	name: '恐惧',
	desc: '被恐惧笼罩，只想逃离。',
	kind: 'debuff',
});

/** 恐惧豁免：目标须过**意志**豁免，失败获得 fear 减益。
 *  ⚠ 旧形传 `'spells'`（B/X 的「法术豁免」）；本笔改 `will`（口径见档头）。
 *  ⚠ 「恐惧 ⇒ 意志豁免」这一条**pin 面没有专节**（本席核过 3E 面缓存：`basics-and-ability-scores` 只有
 *     六维 → 三豁免的对应句，`combat-ii-movement-modifiers-and-special-actions` 无论恐惧，
 *     `rules-glossary.md` 是 5E 面）⇒ 按 3.5 惯例**具名**落 `will`（✗ 不冒充照录）。
 *  dc 参数由调用方按目标挑战等级或场景决定（引擎本身无 HD 概念）。 */
DND3.fearCheck = (character, dc = 12) => {
	if (character.contains(RPG.fear)) return true; // 已恐惧
	const ok = DND3.checkSave(character, 'will', dc, '恐惧');
	if (!ok) {
		character.gain(RPG.fear);
		RPG.perform(`${character.name}被恐惧吞噬，只想逃离！`);
	}
	return ok;
};
