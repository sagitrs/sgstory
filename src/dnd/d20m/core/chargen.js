/* D20M 车卡族 —— 原始分的写面与属性生成（#1697 P1）
 *
 * 设计依据：docs/plan/1697-character-creation.md（与 dnd3／dnd-5e **同构**：同一份 spec、同一组原语）
 *   · §决策一（写面唯一性）：唯一写面是 `commitScore`（只写、不校验）；公开入口 `setScore` 校验后交它。
 *   · §决策七（越域抛错）：越出 `D20M.ABILITY_MAX` 一律抛错，不静默夹取。
 *   · §6 原语 2（属性生成）：掷骰组合子住核心层（`RPG.rollKeepHighest`），本体系取法住本文件。
 */

/** 唯一写面：只写、不校验（内部函数；越域校验由公开入口负责） */
D20M.commitScore = (character, ability, target) => {
	character.stats[ability] = target;
	return D20M.abilityMod(target);
};

/** 单项写入：校验后交唯一写面。越域抛错，不静默夹取（本包 `ABILITY_MAX === null` ⇒ 无上界） */
D20M.setScore = (character, ability, score) => {
	const max = D20M.ABILITY_MAX;
	if (!Number.isInteger(score) || score < 1 || (max !== null && score > max)) {
		throw new Error(`原始分越域：${ability}=${score}（允许 1..${max ?? '不限'}）`);
	}
	return D20M.commitScore(character, ability, score);
};

/** 本体系的属性生成法：4d6 弃最低，掷六次。
 *  ★**house rule**：本仓已 pin 的 MSRD 读面（`README.md`「规则来源」§一 的 d20M 五份）**未载**
 *  属性生成的掷骰法 ⇒ 本笔借用同仓两包同法，并在此**显式登记**（先例：`dnd3/core/chargen.js`
 *  对同一缺口的同款登记）—— ✗ 冒充源文条目；该缺口本身留后续票（若 MSRD 另册载有生成法）。 */
D20M.rollAbilityScores = () => Array.from({ length: 6 }, () => RPG.rollKeepHighest('4d6', 3).total);
