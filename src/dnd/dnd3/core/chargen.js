/* DND3 车卡族 —— 原始分的写面与属性生成（#1697 P1）
 *
 * 设计依据：docs/plan/1697-character-creation.md
 *   · §决策一（写面唯一性）：唯一写面是 `commitScore`（只写、不校验）。
 *   · §决策七（越域抛错）：3E 面不设通用属性上限 ⇒ `DND3.ABILITY_MAX === null`
 *     （此时只校验「正整数」这一面，不设上界）。
 *   · §6 原语 2（属性生成）：组合子住核心层，取法住本文件。
 */

/** 唯一写面：只写、不校验（内部函数；越域校验由公开入口负责） */
DND3.commitScore = (character, ability, target) => {
	character.stats[ability] = target;
	return DND3.abilityMod(target);
};

/** 单项写入：校验后交唯一写面。越域抛错，不静默夹取（3E 无上界） */
DND3.setScore = (character, ability, score) => {
	const max = DND3.ABILITY_MAX;   // null ⇒ 不设上界
	if (!Number.isInteger(score) || score < 1 || (max !== null && score > max)) {
		throw new Error(`原始分越域：${ability}=${score}（允许 1..${max ?? '不限'}）`);
	}
	return DND3.commitScore(character, ability, score);
};

/** 本体系的属性生成法：4d6 弃最低，掷六次。
 *  出处说明：SRD 3.5 · `Basic Rules and Legal/basics-and-ability-scores.md:65`（「Ability Scores」节）
 *  只给属性含义与调整值表，**未载生成法** ⇒ 本仓借用 5E 同法（`character-creation.md:304`）并在此显式登记，
 *  其取舍归 #1719 评估。 */
DND3.rollAbilityScores = () => Array.from({ length: 6 }, () => RPG.rollKeepHighest('4d6', 3).total);
