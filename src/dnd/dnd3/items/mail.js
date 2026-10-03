/* DND3 道具 —— 铁环甲（身体槽装备：+3 AC）
 * 战斗数值走 DND3.acOf（已装备道具的 ac_bonus 计入防御等级）。
 */

DND3.Mail = RPG.defItem({
	id: 'mail',
	name: '铁环甲',
	desc: '缝满铁环的旧背心，沉甸甸地压在肩上。',
	stats: { ac_bonus: 3, weight: 20, cost: 100, slotName: '身体' },
	charges: null,
	stackable: false,
	slot: 'body',
	actions: {
		equip: RPG.slotEquip,
		unequip: RPG.slotUnequip,
	},

	used() {
		/* ★`#1906` 笔一：瞬时说明走**通知面**（✗ 再落正文）＋ **显式拒绝**（`return false` ⇒ 不消耗）。
		 *   形同 `coin`（`books#130` D6-3 的读数形）：`perform` 两个面都写 ⇒ 玩家每点一次正文多一行。
		 *   ⚠ 能力探测（通知面未加载的环境回落 `perform`，同 `coin`）。 */
		const line = '铁环甲得穿在身上才有用——用「装备」把它穿上。';
		if (typeof RPG.pushNotice === 'function') RPG.pushNotice(line);
		else this.perform(line);
		return false;
	},
});
