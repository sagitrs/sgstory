/* DND3 道具 —— 铁钥匙：可在宝箱交互中跳过陷阱判定（见剧情“铁箱”段落） */

DND3.IronKey = RPG.defItem({
	id: 'iron-key',
	name: '铁钥匙',
	desc: '一把沉甸甸的铁钥匙，齿纹磨得发亮。',
	charges: null,
	stackable: false,

	used(that, from) {
		this.perform(`铁钥匙不是在这里用的——得找到配得上它的锁。`);
	},
});
