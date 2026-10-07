/* DND3 道具 —— 铁皮炸弹（消耗品：投掷武器，1d6 火焰，用灵巧不用力量）
 * 一次性（charges: 1），对宝箱等 noDodge 目标必定命中——炸箱是它的经典用法。
 */

DND3.Bomb = RPG.defItem({
	id: 'bomb',
	name: '铁皮炸弹',
	desc: '裹着铁皮的黑色圆球，引线散发着硫磺味。扔之前最好想清楚。',
	stats: { dmg: '1d6', type: '火焰', range: 10, weight: 1, cost: 20 },
	charges: 1,
	stackable: false,

	used(that, from, 源 = null) {
		const f = from?.stats ?? {};
		const atkMod = (f.bab ?? 0) + DND3.modOf(f, 'dex'); // 投掷武器用灵巧
		const ac = DND3.acOf(that);
		/* ★`#2031` 六裁 3（**纠正**）：炸弹是**角色投掷武器**（用 `from` 的 BAB/DEX）⇒ 命中归 `attack.hit`，✗ 因独立文件便叫陷阱。 */
		const die = DND3.d20({ purpose: 'attack.hit', actor: from?.name ?? null, 物: this.entityId ?? null }, 源);
		const noDodge = that?.noDodge === true;

		if (!noDodge && die !== 20 && (die === 1 || die + atkMod < ac)) {
			this.perform(`炸弹落在${that.name}脚边滚了两圈——哑火了` +
				`（攻击掷骰 ${die}${atkMod ? RPG.formatMod(atkMod) : ''} 对 AC ${ac}）`);
			return;
		}
		const r = RPG.rollDetail(this.stats.dmg, { purpose: 'damage', actor: from?.name ?? null, 物: this.entityId ?? null, 组: 0 }, 源);   // ★`#2031`
		that.hp = Math.max(0, (that.hp ?? 0) - r.total);
		DND3.grantDeathIfDown(that);
		this.perform(`轰！${that.name}受到了${r.total}点${this.stats.type}伤害（${r.rolls.join('+')}）`);
	},
});
