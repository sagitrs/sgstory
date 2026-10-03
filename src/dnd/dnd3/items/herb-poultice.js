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
	 * 接口实现：修改 that 的属性值，通过 this.perform 打印结果。
	 * ★`books#200` P0：**文案与落值同读 `DND3.applyHeal`**（治疗量的**一处源**，见 `core/heal.js`）——
	 *   原形印**名义量**（本件 `stats.hp` ＋ 施用者加成）而落值被 `maxHp` 夹过 ⇒ 满血印「受到2点治疗」
	 *   而体力条不动（差 1 点满时印 2 而实回 1，同族）。现形同「口粮」（`books#170` P2-11 的口径）：
	 *   **实回为 0 ⇒ 出声 ＋ 拒绝**（`#1776` 契约：`act` 在**扣件之前**返回 `rejected/action-refused`
	 *   ⇒ 这一份留在包里）。
	 */
	used(that, from) {
		const heal = DND3.applyHeal(this, from, that);
		if (heal === false) {
			this.perform(`${that.name}的伤已无碍 —— 这一份留着吧。`);
			return false;
		}
		this.perform(`${that.name}受到了${heal}点治疗`);
	},
});
