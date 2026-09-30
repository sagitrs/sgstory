/* DND3 道具 —— 绷带（治疗型，2 次充能）。声明式写法见 RPG.defItem。 */

DND3.Bandage = RPG.defItem({
	id: 'bandage',
	name: '绷带',
	desc: '亚麻绷带和一小罐药膏，能让伤口好受一些。',
	stats: { hp: 5 }, // 单次治疗量（3E 数值块）
	charges: 2,

	/**
	 * 接口实现：修改 that 的属性值，通过 this.perform 打印结果。
	 * 治疗量 = 道具基础值 this.stats.hp + 施用者加成 from.stats.heal_bonus
	 * （from 可省略或没有该字段时加成视为 0。）
	 */
	used(that, from) {
		const heal = this.stats.hp + (from?.stats?.heal_bonus ?? 0);
		that.hp = Math.min(that.maxHp ?? Infinity, (that.hp ?? 0) + heal);
		// 战地医疗：目标恢复到 0 以上时，解除 death 减益
		if (that instanceof RPG.Character && that.hp > 0 && that.contains(RPG.death)) {
			that.lose(RPG.death);
		}
		this.perform(`${that.name}受到了${heal}点治疗`);
	},
});
