/* core/43-battle-target-policy.js（`sgstory#1914` 增量 3/3）：**谁可以被选**。
 *
 * ## 为什么需要
 * 现码的 `targetOptions` 恒为「所有未出局者」⇒ 玩家选伤害类动作时，候选里**第一个就是自己**
 * （本席调试实测：选第一项即**打自己**，玩家 hp 直接归 0）。靶候选必须按**动作**分侧。
 *
 * ## 形（纯函数，可单测；公开面英文）
 * - `sideOf(actionClass)` ⇒ `'foes'`（伤害，默认／未知一律按它：**窄**候选比宽候选安全）
 *   ｜`'allies'`（治疗）｜`'none'`（支援类，不指定目标 ⇒ 空集，调用方据此跳过选靶）。
 * - `candidates({ attacker, actionClass, allies, foes })` ⇒ 候选数组（**保持传入次序**，✗ 重排 ——
 *   次序是玩家看到的选单次序）；治疗类**含自己**（给自己上药是常见动作），且自己**不重复出现**。
 * - `includesSelf(set, attacker)` ⇒ 自检用：某候选集是否含攻击者本人（伤害类应当为 `false`）。
 */
(() => {
	/** 动作类 → 取哪一侧。未知类按 `'foes'`（**窄**）。 */
	const sideOf = (actionClass) => (actionClass === 'heal' ? 'allies' : actionClass === 'support' ? 'none' : 'foes');

	/**
	 * @param {object} o `{ attacker, actionClass, allies, foes }`
	 * @returns {Array} 候选单位（同一数组内不重复，保持各自序列原有次序）
	 */
	const candidates = ({ attacker, actionClass, allies, foes } = {}) => {
		const side = sideOf(actionClass);
		if (side === 'none') return [];
		if (side === 'foes') return (foes ?? []).slice();
		/* 治疗类：己方全体（**含自己** —— 给自己上药是常见动作）。 */
		const mates = allies ?? [];
		if (attacker != null && !mates.includes(attacker)) return [attacker, ...mates];
		return mates.slice();
	};

	/** 自检用：某候选集是否**含**攻击者本人。 */
	const includesSelf = (set, attacker) => (set ?? []).includes(attacker);

	RPG.targetPolicy = Object.freeze({ candidates, sideOf, includesSelf });
})();
