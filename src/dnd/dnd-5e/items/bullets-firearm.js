/* DND5E 道具 —— 火器子弹（弹药，非武器）
 * 数值出处：SRD 5.2.1 · `equipment.md:1232-1236`「Bullets, Firearm」——
 *   一袋 10 发；`Pouch`；2 lb.；3 GP。
 * 语义：`charges: 10` 即「一袋 = 10 发」；叠加时按袋累加（`RPG.give` 的 stackable 路径）。
 *   消耗经 `RPG.take`（`stats.ammo` 的 useItem 检查）。
 */
DND5E.BulletsFirearm = RPG.defItem({
	id: 'bullets-firearm', name: '火器子弹', desc: '一袋 10 发火器子弹。',
	stats: { weight: 2, cost: 3, ammoType: 'firearm' },
	charges: 10, stackable: true, slot: null,
	used() { this.perform('弹药不能直接使用——装填到带 Ammunition 特性的武器上。'); },
});
