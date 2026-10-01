/* DND3 核心扩展 —— 3E 语义的宝箱（判定数学归这里，RPG.Chest 保持规则无关）
 *
 * dnd3 需要的“自己的 core”放本目录（src/dnd3/core/），不污染 src/core/：
 * 这里集中 3E 规则对核心类的扩展，例如给宝箱加上撬锁检定。
 */

DND3.Chest = class Chest extends RPG.Chest {};

DND3.Chest.handlers = {
	...RPG.Chest.handlers,

	/** 3E 撬锁：1d20 + 施术者灵巧调整值（stats.dex）vs lockDC；
	 *  成功≈使用钥匙（机关判定被跳过），失败永久锁死。 */
	lockpick(that) {
		/* 判定式收敛（#1798 E1a：本处原为**内联手写**，是设计稿 §三 的**首要收敛点**）。
		 *   播报的数值仍是「骰 ＋ 加值」的和（原为局部变量 `roll`，现为 `r.total`）⇒ **文案逐字不变**。 */
		const r = RPG.checkRoll({ mod: DND3.modOf(that?.stats, 'dex'), dc: this.lockDC });
		RPG.perform(`（撬锁判定：${r.total} / DC ${r.dc}）`);
		if (r.success) this.openBy();
		else this.lockNow();
	},
};
