/* DND3 陷阱 —— 火焰喷射（宝箱死亡时释放的反击之一） */

const trapFireUsed = function (that, from) {
	const atkMod = this.stats.bab ?? 0;
	const ac = that?.stats?.ac ?? 10;
	/* ★`#2031` 六裁 3：**真陷阱**（机关）命中留 `trap.hit`；来源物＝该机关件实例（`物`）✓ —— 无行动者。 */
	const die = DND3.d20({ purpose: 'trap.hit', 物: this.entityId ?? null });
	if (die !== 20 && (die === 1 || die + atkMod < ac)) {
		this.perform(`${this.name}擦着${that.name}飞了过去` +
			`（攻击掷骰 ${die}${RPG.formatMod(atkMod)} 对 AC ${ac}）`);
		return;
	}
	const r = RPG.rollDetail(this.stats.dmg, { purpose: 'damage', 物: this.entityId ?? null, 组: 0 });   // ★`#2031`
	that.hp = Math.max(0, (that.hp ?? 0) - r.total);
	this.perform(`${that.name}受到了${r.total}点${this.stats.type}伤害` +
		`（${r.rolls.join('+')}${r.mod ? RPG.formatMod(r.mod) : ''}）！`);
};

DND3.TrapFire = RPG.defItem({
	id: 'trap-fire',
	name: '火焰喷射',
	desc: '箱夹层里压着的火焰符文。',
	stats: { bab: 4, dmg: '1d6', type: '火焰' },
	used: trapFireUsed,
});
