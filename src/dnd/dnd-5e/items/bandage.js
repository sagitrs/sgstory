/* DND5E 道具 —— 治疗包（绷带和药膏，恢复 5 HP） */

DND5E.Bandage = RPG.defItem({
	id: 'bandage', name: '治疗包', desc: "绷带和药膏（5E 治疗工具包风格）。",
	stats: { hp: 5 },
	charges: 2,
	used(that, from) {
		const heal = this.stats.hp;
		that.hp = Math.min(that.maxHp ?? Infinity, (that.hp ?? 0) + heal);
		if (that instanceof RPG.Character && that.hp > 0 && that.contains(RPG.death)) {
			that.lose(RPG.death);
		}
		this.perform(`${that.name}恢复了${heal}点HP`);
	},
});
