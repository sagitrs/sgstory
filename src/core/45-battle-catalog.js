/* core/45-battle-catalog.js（`sgstory#1914` 增量 3/3）：**战用动作目录**。
 *
 * ## 为什么需要
 * 「这一手算哪一类」（伤害／治疗／支援）原先由**调用方给**（`43-battle-target-policy.js` 的
 * `actionClass` 参数）⇒ 等于**调用方猜**。靶策略据此选候选集：猜成伤害 ⇒ 只列敌方；猜成治疗 ⇒ 才列己方。
 * 猜错的后果是**直接的**：治疗件按伤害类列候选 ⇒ 队友不在候选里；伤害件按治疗类 ⇒ 候选含自己（自伤）。
 * ⇒ 正解：**由道具自己声明**，目录是**唯一取源**（选单与靶策略都问它，✗ 两处各判一份）。
 *
 * ## 判据位
 * `stats.noBattleUse`（同族专用声明位）。
 *   ⚠ **为何不是 `handlers.use`**（票面原写）：现码 `40-battle.js` 明确否掉 ——「本门从不读
 *   `handlers.use`（无条件 push），且 `RPG.defItem` 强制要求 `used` ⇒ 69 件无一例外都有
 *   ⇒ 结构性空集、照它实现 ＝ 零 diff」。
 *   ⚠ **为何不是 `stats.craftInput`**：那是「可作建造输入」，与「战斗中无动作」只是**恰好**重合
 *   （当前 6 件）⇒ 将来「既能建造输入又能战斗使用」的件会被误隐、「非建造输入但战斗无动作」的会漏网。
 *   ⚠ `noBattleUse` **只压「使用」**（✗ 连装备／卸下一起砍）：本席第一版写成提前 `return []`，
 *   当场把「唯一动作是装备」的件弄成零动作（`#1841 ⑤` 判据立刻咬住）。
 *
 * ## 声明形（道具侧）
 *   `RPG.defItem({ id: 'bandage', …, battleUse: { class: 'heal' } })`
 *   `class` ∈ `'damage'`（默认）｜`'heal'`｜`'support'`；未知值一律按 **`'damage'`（窄）**。
 */
(() => {
	const classOf = (item) => {
		const c = item?.battleUse?.class;
		return c === 'heal' || c === 'support' ? c : 'damage';   // 未知／未声明 ⇒ **窄**默认
	};

	/** 该件在战斗中**有哪些动作**（选单与靶策略的唯一取源）。 */
	const list = (item) => {
		const handlers = item?.constructor?.handlers;
		const out = item?.stats?.noBattleUse ? [] : [{ id: 'use', needsTarget: true, actionClass: classOf(item) }];
		if (!item.equipped && typeof handlers?.equip === 'function') {
			out.push({ id: 'equip', needsTarget: false, actionClass: 'support' });
		}
		if (item.equipped && typeof handlers?.unequip === 'function') {
			out.push({ id: 'unequip', needsTarget: false, actionClass: 'support' });
		}
		return out;
	};

	RPG.battleActions = Object.freeze({ classOf, list });
})();
