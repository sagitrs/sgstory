/* DND3 道具 —— 绷带（治疗型，2 次充能）。声明式写法见 RPG.defItem。 */

DND3.Bandage = RPG.defItem({
	id: 'bandage',
	name: '绷带',
	desc: '亚麻绷带和一小罐药膏，能让伤口好受一些。',
	stats: { hp: 5 }, // 单次治疗量（3E 数值块）
	battleUse: { class: 'heal' },   // ★`#1914` 步四：**战斗用途声明** —— 靶候选须含己方
	charges: 2,

	/**
	 * 接口实现：修改 that 的属性值，通过 this.perform 打印结果。
	 * ★`books#200` P0：**文案与落值同读 `DND3.applyHeal`**（治疗量的**一处源**，见 `core/heal.js`）——
	 *   原形印**名义量**（`stats.hp` ＋ 施用者加成）而落值被 `maxHp` 夹过 ⇒ 满血印「受到2点治疗」
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
