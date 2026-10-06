/* DND3 核心扩展 —— 涉水状态与「御水」（Water Mastery）：3.5 水元素的涉水条件加值与惩罚
 *
 * ## 出处（pinned，逐值照录）
 *   · SRD 3.5 · `3.5 Compendium/Monsters/3.5 Monsters - E.md:370`（`Water Mastery (Ex)` 原文：
 *     水元素与其对手**都**触水 ⇒ 攻击与伤害掷骰 +1；对手**或**水元素只挨着非水地面 ⇒ −4。
 *     原文另有一句要紧的：「这些修正**不包含在**数值块里」⇒ 模板的 `Slam +4/1d6+3` 是**未计**本修正常的值。）
 *
 * ## 谁声明水态
 *   引擎**不认识地形**：涉水与否由**故事侧**按场景声明（`DND3.setWater(角色, true/false)`）。
 *   这与 `#2027` 终裁的口径一致：E6 允许玩家留在干地，E7 的浪花图**不自动**判角色浸水 ——
 *   那是故事侧的决定（`sgstory-books#399`／`#401`），引擎只按声明算修正。
 *
 * ## 不落项（house rule／本仓无该量纲 —— 逐条记名，✗ 不静默丢弃；全部见 `#2027` 的二十条对照表）
 *   · **Drench**（同 pin `:375`）：本仓无火源与驱散面 ⇒ 首版公开不落（领队预准、操作者终裁）。
 *   · **Vortex**（同 pin `:378`）：须水下 ＋ 持续形态 ＋ 范围 ⇒ 首版公开不落（同上）。
 *   · **elemental traits**（不须呼吸／免疫毒素与睡眠与麻痹与震慑／不受重击与夹击／黑暗视觉 60 尺）：
 *     本仓无呼吸、免疫、重击判定与光照消费点 ⇒ 不落（与 `monsters/bombardier-beetle.js:11` 同一记名形）。
 *   · **离水 180 尺限制**（同 pin `:377` 段）：本仓战斗无移动量纲 ⇒ 不落。
 */

/* ⚠ **不设 `scope: 'battle'`**：水态是**场景**属性（由故事侧声明，见上「谁声明水态」），
 *   ✗ 不是战斗期状态 —— 战斗结束**不清**它（换场时由故事重新声明）；若设成 battle 档，
 *   本包得再写一条 `battle:end` 清它，而那会把「人还站在水里」静默改成「上岸了」（语义错）。 */
RPG.inWater = RPG.defEffect({
	id: 'in-water', name: '涉水中',
	desc: '正站在水里（由场景声明）。',
});
RPG.waterMastery = RPG.defEffect({
	id: 'water-mastery', name: '御水', kind: 'effect', scope: 'persistent',
	desc: '水之生物：与对手同处水中时更利，离水则钝。',
});

/** 声明／撤销涉水。返回值＝角色本身（便于串联）。 */
DND3.setWater = (c, on) => {
	if (on === true) c.gain(RPG.inWater);
	else c.lose(RPG.inWater);
	return c;
};

DND3.isInWater = (c) => c?.contains?.(RPG.inWater) === true;
DND3.hasWaterMastery = (c) => c?.contains?.(RPG.waterMastery) === true;

/** 御水修正（pin `:370`）：`0` ＝ 不适用（非水之生物）；`+1` ＝ 双方皆触水；`-4` ＝ 有一方只挨着非水地面。 */
DND3.waterMasteryMod = (attacker, target) => {
	if (!DND3.hasWaterMastery(attacker)) return 0;
	return (DND3.isInWater(attacker) && DND3.isInWater(target)) ? 1 : -4;
};
