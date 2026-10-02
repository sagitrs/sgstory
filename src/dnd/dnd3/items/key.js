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
		this.perform(`铁钥匙不是在这里用的——得找到配得上它的锁。`);
	},
});
