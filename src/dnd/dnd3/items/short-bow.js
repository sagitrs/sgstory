/* DND3 道具 —— 短弓（远程武器：1d6 穿刺，用灵巧，射程 80 英尺）
 * 与近战武器的区别：ranged: true → 攻击与伤害用灵巧而非力量。
 * 判定数学在 dnd3/core/combat.js 的 DND3.attack（已支持 ranged 标志）。
 */

DND3.ShortBow = RPG.defItem({
	id: 'short-bow',
	name: '短弓',
	desc: '哥布林制的粗糙短弓，射程约 80 英尺。',
	stats: {
		dmg: '1d6',
		type: 'piercing',
		range: 80,
		weight: 2,
		cost: 30,
		prof: 'martial',
		ranged: true,  // 攻击/伤害用灵巧
	},
	weapon: true,
	slot: 'weapon',
	charges: null,
	stackable: false,
	actions: {
		equip: RPG.slotEquip,
		unequip: RPG.slotUnequip,
	},
	used(that, from) {
		// 远程攻击：不检查拔出（弓不需拔出），用灵巧
		const f = from?.stats ?? {};
		const atkMod = (f.bab ?? 0) + (f.dex_mod ?? f.str_mod ?? 0);
		const ac = DND3.acOf(that);
		const die = DND3.d20();
		const noDodge = that?.noDodge === true;

		if (!noDodge && die !== 20 && (die === 1 || die + atkMod < ac)) {
			this.perform(`箭矢飞偏了，没有射中${that.name}` +
				`（攻击掷骰 ${die}${atkMod ? RPG.formatMod(atkMod) : ''} vs AC ${ac}）`);
			return;
		}

		const crit = !noDodge && die === 20 && DND3.d20() + atkMod >= ac;
		const times = crit ? 2 : 1;
		const parts = [];
		let dmg = 0;
		for (let i = 0; i < times; i++) {
			const r = RPG.rollDetail(this.stats.dmg);
			dmg += r.total;
			parts.push(r.rolls.join('+'));
		}
		if (dmg < 1) dmg = 1;
		that.hp = Math.max(0, (that.hp ?? 0) - dmg);
		DND3.grantDeathIfDown(that);
		this.perform(`${that.name}受到了${dmg}点${this.stats.type}伤害` +
			`（${parts.join('，')}${crit ? '，重击！' : ''}）`);
	},
});
