/* DND3 道具 —— 铁钥匙：可在宝箱交互中跳过陷阱判定（见剧情“铁箱”段落） */

DND3.IronKey = RPG.defItem({
	id: 'iron-key',
	name: '铁钥匙',
	desc: '一把沉甸甸的铁钥匙，齿纹磨得发亮。',
	charges: null,
	stackable: false,
	/* ★`#1877` P1-5②：钥匙**只在宝箱交互里用** ⇒ 战斗无动作（`used()` 本来就只出声）。 */
	stats: { noBattleUse: true },

	used(that, from) {
		/* ★`#1906` 笔一：瞬时说明走**通知面**（✗ 再落正文）＋ **显式拒绝**（`return false` ⇒ 不消耗）。
		 *   形同 `coin`（`books#130` D6-3 的读数形）：`perform` 两个面都写 ⇒ 玩家每点一次正文多一行。
		 *   ⚠ 能力探测（通知面未加载的环境回落 `perform`，同 `coin`）。 */
		const line = '铁钥匙不是在这里用的——得找到配得上它的锁。';
		if (typeof RPG.pushNotice === 'function') RPG.pushNotice(line);
		else this.perform(line);
		return false;
	},
});
