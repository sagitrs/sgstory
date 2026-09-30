/* DND3 陷阱 —— 毒针（宝箱死亡时释放的反击之一）
 * 判定：1d20 + bab vs 玩家 AC。共享逻辑在 traps.js 的 trapUsed。
 */

const trapNeedleUsed = function (that, from) {
	const atkMod = this.stats.bab ?? 0;
	const ac = that?.stats?.ac ?? 10;
	const die = DND3.d20();
	if (die !== 20 && (die === 1 || die + atkMod < ac)) {
		this.perform(`${this.name}擦着${that.name}飞了过去` +
			`（攻击掷骰 ${die}${RPG.formatMod(atkMod)} vs AC ${ac}）`);
		return;
	}
	const r = RPG.rollDetail(this.stats.dmg);
	that.hp = Math.max(0, (that.hp ?? 0) - r.total);
	this.perform(`${that.name}受到了${r.total}点${this.stats.type}伤害` +
		`（${r.rolls.join('+')}${r.mod ? RPG.formatMod(r.mod) : ''}）！`);
};

DND3.TrapNeedle = RPG.defItem({
	id: 'trap-needle',
	name: '毒针',
	desc: '藏在锁孔后的淬毒细针。',
	stats: { bab: 6, dmg: '1d4+1', type: '毒' },
	used: trapNeedleUsed,
});
