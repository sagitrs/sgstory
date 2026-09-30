/* DND3 道具 —— 旧硬币（纪念品，无限次）。非治疗型与 charges: null 的示范。 */

DND3.Coin = RPG.defItem({
	id: 'coin',
	name: '旧硬币',
	desc: '一枚生锈的铜币，似乎有些年头了。',
	stats: { value: 1 }, // 价值 1 银币
	charges: null,
	stackable: false,

	used(that, from) {
		this.perform(`旧硬币只是纪念品，对${that.name}没有任何效果`);
	},
});
