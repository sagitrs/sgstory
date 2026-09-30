/* DND5E 车卡族 —— 原始分的写面与属性生成（#1697 P1）
 *
 * 设计依据：docs/plan/1697-character-creation.md
 *   · §决策一（写面唯一性）：唯一写面是 `commitScore`（只写、不校验）；
 *     公开入口 `setScore` 校验后交它。
 *   · §决策七（越域抛错）：越出 `DND5E.ABILITY_MAX` 一律抛错，不静默夹取。
 *   · §6 原语 2（属性生成）：掷骰组合子住核心层（`RPG.rollKeepHighest`），
 *     本体系取法住本文件（当前与 3E 同为 4d6 弃最低，便于两版各自演化）。
 */

/** 唯一写面：只写、不校验（内部函数；越域校验由公开入口负责） */
DND5E.commitScore = (character, ability, target) => {
	character.stats[ability] = target;
	return DND5E.abilityMod(target);
};

/** 单项写入：校验后交唯一写面。越域抛错，不静默夹取 */
DND5E.setScore = (character, ability, score) => {
	const max = DND5E.ABILITY_MAX;
	if (!Number.isInteger(score) || score < 1 || (max !== null && score > max)) {
		throw new Error(`原始分越域：${ability}=${score}（允许 1..${max ?? '不限'}）`);
	}
	return DND5E.commitScore(character, ability, score);
};

/** 本体系的属性生成法：4d6 弃最低，掷六次（引用：SRD 5.2.1 · character-creation.md
 *  「Ability Score Generation」——掷四枚 d6 取最高三枚之和） */
DND5E.rollAbilityScores = () => Array.from({ length: 6 }, () => RPG.rollKeepHighest('4d6', 3).total);
