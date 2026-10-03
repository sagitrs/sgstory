/* DND3 治疗量（heal）—— **名义量**与**实回**的一处源（`books#200` P0 ／ `#185` 同族）
 *
 * 病灶（操作者试玩 15:07 报）：背包栏点「草药糊」印「无名者受到了2点治疗」，而体力条**不动**。
 *   因由＝`used()` 印的是**名义量**（件自身 `stats.hp` ＋ 施用者 `stats.heal_bonus`），
 *   而**落值**被 `maxHp` 夹过 —— 满血时实回 0、差 1 点满时实回 1，文案却一律报名义值。
 *
 * ★同族已有前例，本档是把它收成一处源：`items/resources.js` 的「口粮」在 `books#170` P2-11
 *   （试玩反馈）已按「算**实际**恢复量；为 0 ⇒ 出声 ＋ 拒绝（`#1776` 契约 ⇒ 不扣件）」修过，
 *   而两件治疗件（`bandage`／`herb-poultice`）**漏修** ⇒ 同一个量在本仓有三份算式。
 *
 * 消费方（✗ 各算一份）：
 *   · `items/bandage.js`／`items/herb-poultice.js`／`items/resources.js` 的 `used()` —— 落值与文案；
 *   · 故事侧治疗读数面板（`books#188` P1-4 的「预计恢复」；`books#200` 后改读本档，✗ 自算一份）。
 *
 * ⚠ 本档**不改**任何数值：名义量仍是各件 `stats.hp` ＋ 施用者 `heal_bonus`（house rule（非 SRD），
 *   数值出处见各件文件头）。
 */

/** 名义治疗量：件自身 `stats.hp` ＋ 施用者 `stats.heal_bonus`（`from` 可省 ⇒ 加成视为 0）。 */
DND3.healAmount = (item, from) =>
	Number(item?.stats?.hp ?? 0) + Number(from?.stats?.heal_bonus ?? 0);

/** **实回**：给定目标下的真增量 —— 名义量夹到 `maxHp` 之后**还剩下多少**（满血 ⇒ 0，✗ 负）。
 *  ★这是「文案该报的数」与「该不该拒绝」的**同一判据**（两处读同一个函数 ⇒ 不会再漂）。
 *  ⚠ `maxHp` 缺省按**无上限**处理（与各件原形的 `?? Infinity` 同义）。 */
DND3.healDelta = (item, from, target) => {
	const 前 = Number(target?.hp ?? 0);
	const 后 = Math.min(Number(target?.maxHp ?? Infinity), 前 + DND3.healAmount(item, from));
	return Math.max(0, 后 - 前);
};

/** 施治：把**实回**落到目标身上。**实回为 0 ⇒ 返回 false**（＝拒绝，`#1776` 契约下 `RPG.act`
 *  在**扣件之前**返回 `rejected/action-refused` ⇒ 这一份留在包里），✗ 不印「受到0点治疗」。
 *  @param opts.clearDeath 恢复到 0 以上时**是否**解除 `death` 减益，缺省 `true`（＝两件治疗件的
 *    「战地医疗」原形）。★**口粮显式传 `false`**：它原形**没有**这三行 ⇒ P0 只改「报哪个数」，
 *    ✗ **不夹带**语义变更（`dev-10` 的两树对照实验：本笔初版经本函数落值 ⇒ 口粮**顺带**获得了
 *    解除 `death` 的语义 ⇒ 由 `books#200` 的镜像票 `#1929` 裁：「老行为保留」）。
 *  @returns 实回点数（>0）｜false（无伤可治）
 *  ⚠ 文案由调用方给（各件的语气不同）—— 本函数只说**发生了多少**，✗ 不替道具说话。 */
DND3.applyHeal = (item, from, target, { clearDeath = true } = {}) => {
	const 实回 = DND3.healDelta(item, from, target);
	if (!(实回 > 0)) return false;
	target.hp = Number(target.hp ?? 0) + 实回;
	/* 战地医疗：恢复到 0 以上时解除 death 减益（治疗件原形；口粮按原样**不**做这一步） */
	if (clearDeath && target instanceof RPG.Character && target.hp > 0 && target.contains(RPG.death)) {
		target.lose(RPG.death);
	}
	return 实回;
};
