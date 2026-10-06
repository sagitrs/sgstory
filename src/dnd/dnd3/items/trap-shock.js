/* DND3 陷阱 —— 闪电符文（宝箱死亡时释放的反击之一） */

const trapShockUsed = function (that, from) {
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

DND3.TrapShock = RPG.defItem({
	id: 'trap-shock',
	name: '闪电符文',
	desc: '刻在箱盖内侧的闪电符文。',
	stats: { bab: 5, dmg: '1d8', type: '电击' },
	used: trapShockUsed,
});

/** 宝箱陷阱技能池（按 id 随机取一；随机取值一律经 `RPG.rng`） */
DND3.CHEST_TRAPS = ['trap-needle', 'trap-fire', 'trap-shock'];
DND3.rollChestTrap = () =>
	RPG.createItem(DND3.CHEST_TRAPS[RPG.rng.index(DND3.CHEST_TRAPS.length)]);
