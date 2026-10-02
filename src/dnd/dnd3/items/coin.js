/* DND3 道具 —— 旧硬币（纪念品；**可计数**的堆叠件） */

DND3.Coin = RPG.defItem({
	id: 'coin',
	name: '旧硬币',
	desc: '一枚生锈的铜币，似乎有些年头了。',
	/* ★`#1877` N-3：改**计数库存**形（与 `resources.js` 的资源／口粮同款）——
	 *   原形 `charges: null, stackable: false` 使它**永不合并**、**永不显示 `×N`**
	 *   （`inventoryLabel`／`inventoryLinks` 只在 `charges != null` 时加后缀）
	 *   ⇒ 背包里出现「旧硬币、旧硬币、旧硬币」而同屏的石料是「石料×6」（操作者复测 N-3）。
	 *   ★为何**不是**显示层的活（本席实测更正）：合并的判据在 `RPG.give` 的
	 *     `def.stackable && def.charges != null`；而 `RPG.loot` 又**绕过** `give`
	 *     直接 `inv().push()` ⇒ 不修数据模型则既合并不了、也显示不出 `×N`。
	 *   ⚠ `used()` 必须**返回 false**（✗ 抛错）：`RPG.act` 对 `action === 'use' && charges != null`
	 *     会**扣 1 件**（`30-inventory.js:368`）⇒ 若仍抛错，硬币会**每点一次少一枚**。
	 *     返回 false ＝「动作自己判定做不到」（`#1776` 契约）⇒ `act` 在**扣件之前**返回，实测不消耗。
	 *   ⚠ `stats.noBattleUse`（`#1841` 起的惯例）：纪念品在战斗中无正当用法 ⇒
	 *     ✗ 让战斗选单亮出注定被拒的「使用」（那会白耗一回合）。 */
	stats: { value: 1, noBattleUse: true }, // 价值 1 银币
	charges: 1,          // ★＝ 1 枚（同 `resources.js` 的「charges 即件数」）
	stackable: true,     // ★同 id 合并 ⇒ 计数库存

	used(that, from) {
		/* ★`books#130`（D6-3「甲形」小修）：本句只走**通知面**（✗ 再落正文）。
		 *   `perform` 会**两个面都写**（正文 ＋ `State.variables.rpgNotices`）⇒ 玩家每点一次
		 *   正文**多一行**；而本句的用途是「**为什么用不了**」的瞬时说明。
		 *   实测（tester-3 真点击，走 DOM 事件即玩家那条路）：点击后
		 *     正文 = ["＋1 旧硬币", "旧硬币只是纪念品，对无名者没有任何效果"] ｜ 同刻通知面板也有该句。
		 *   ⚠ 通道保持**缺省**（与原先 `perform` 的缺省 `'default'` 逐字相同）⇒ **通知面条目不变**，
		 *     只少掉正文那一行（✗ 改通道、✗ 改级别 —— 那会动过滤档下的可见性）。
		 *   ⚠ **能力探测**：通知面未加载的环境（`01-perform.js` 按序在 `71-notice.js` 之前）回落到
		 *     `perform`（与 `perform` 自身的既有探测同形，✗ 硬依赖）。
		 *   ⚠ `return false` **保持**：那是「拒绝 ⇒ 不消耗」的契约（✗ 抛错会走扣件路径）。 */
		const line = `旧硬币只是纪念品，对${that.name}没有任何效果`;
		if (typeof RPG.pushNotice === 'function') RPG.pushNotice(line);
		else this.perform(line);
		return false;   // ★拒绝 ⇒ 不消耗（见上注；✗ 抛错会走扣件路径）
	},
});
