/* DND5E 道具 —— 旧硬币（纪念品） */

DND5E.OldCoin = RPG.defItem({
	id: 'coin', name: '旧硬币', desc: '一枚生锈的铜币。',
	stats: { value: 1 }, charges: null, stackable: false,
	used(that) { this.perform(`旧硬币只是纪念品，对${that.name}没有任何效果`); },
});
