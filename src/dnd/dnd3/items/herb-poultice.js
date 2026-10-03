/* DND3 道具 —— 草药糊（一段 1–9 层「草药」面；**house rule（非 SRD）**）
 *
 * ⚠ 数值**无源**：SRD 3.5 的装备面只有 `Healer's Kit`（`Basic Rules and Legal/equipment.md:3220`，50 gp，工具非草药），
 *   并无「草药」条目 ⇒ 依 README §三.5（不许无出处），本件全部数值按**本仓自定**处理，注释显式标注
 *   **house rule（非 SRD）**，不得写成「对齐 SRD」。
 * 定标依据（house rule，非 SRD）：单次治疗量 2 点、2 次充能——与既有 `items/bandage.js`（治疗 5／2 充能，
 *   同样标注为设计值）同族但更弱，以匹配一段的「就地取材」强度（段内定标见 `core/climb.js` 的 `SPAN1_SCALING`）。
 * 统计口径：治疗量与充能数均在**定义面**（本文件），遭遇表只引注册 id、不重复数值（防两套语义）。
 */

DND3.HerbPoultice = RPG.defItem({
	id: 'herb-poultice',
	name: '草药糊',
	desc: '把几味有消炎之效的野草嚼烂敷在伤处。粗糙，但能顶一阵。',
	stats: { hp: 2 },  // house rule（非 SRD）：单次治疗量
	battleUse: { class: 'heal' },   // ★`#1918`：**战斗用途声明** —— 治疗件的靶候选须含己方（同 `bandage.js`）
	charges: 2,        // house rule（非 SRD）：可用次数
	stackable: true,

	/**
	 * 治疗量 = 本件基础值 this.stats.hp + 施用者加成 from.stats.heal_bonus
	 * （与 `items/bandage.js` 同式；from 可省略 ⇒ 加成视为 0）。
	 */
	used(that, from) {
		const heal = this.stats.hp + (from?.stats?.heal_bonus ?? 0);
		that.hp = Math.min(that.maxHp ?? Infinity, (that.hp ?? 0) + heal);
		if (that instanceof RPG.Character && that.hp > 0 && that.contains(RPG.death)) {
			that.lose(RPG.death);
		}
		this.perform(`${that.name}受到了${heal}点治疗`);
	},
});
