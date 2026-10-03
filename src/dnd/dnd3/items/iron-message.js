/* DND3 道具 —— 锻造图（二段 11–19 层的**投放资源**；**house rule（非 SRD）**）
 *
 * ⚠ 数值**无源**（**house rule（非 SRD）**）：同 `resources.js` 的资源族 —— 3E 装备面无此条目。依 README §三.5
 *   显式标注 **house rule（非 SRD）**，不得写成「对齐 SRD」。
 * 形制依据：`layers.md:11` 的段内投放明列「**锻造图**」⇒ 它是本段的**资源类**投放物（同铁锭），
 *   按 #1729 裁定①（资源即 Item 甲案）落为**不可装备、可叠加**的道具。
 * ⚠ **与 craft 原语的关系**（`#1730` 裁定② 的甲案：craft ＝「带输入的 useItem」）：本件**只是那张图纸**，
 *   不含配方实现 —— 配方形态（`recipe: { from: [...], to: ... }`）归 craft 实现票；本笔只落注册 id，
 *   使第 20 层 hub 的建设入口有东西可消耗（消费端归 `#1747`）。⇒ **无消费点即不声明配方**（防死键，同 #1736 判据 1）。
 */

DND3.IronMessage = RPG.defItem({
	id: 'iron-message',
	name: '锻造图',
	desc: '一张画满尺寸与火候的牛皮。看得懂的人，能让铁听话。',
	/* ★`#1877` P1-5②：锻造图是**给工坊看的纸** ⇒ 战斗无动作。 */
	stats: { value: 5, noBattleUse: true },   // house rule（非 SRD）：单价 5 gp（贵于铁锭，因它是「技术」而非「材料」）
	charges: null,
	stackable: true,
	slot: null,            // 资源不可装备

used(that, from) {
		/* ★`#1906` 笔一：瞬时说明走**通知面**（✗ 再落正文）＋ **显式拒绝**（`return false` ⇒ 不消耗）。
		 *   形同 `coin`（`books#130` D6-3 的读数形）：`perform` 两个面都写 ⇒ 玩家每点一次正文多一行。
		 *   ⚠ 能力探测（通知面未加载的环境回落 `perform`，同 `coin`）。 */
		const line = '锻造图是给工坊看的——它自己是张纸。';
		if (typeof RPG.pushNotice === 'function') RPG.pushNotice(line);
		else this.perform(line);
		return false;
	},
});
