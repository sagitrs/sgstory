/* DND3 核心扩展 —— 3E 语义的宝箱（判定数学归这里，RPG.Chest 保持规则无关）
 *
 * dnd3 需要的“自己的 core”放本目录（src/dnd3/core/），不污染 src/core/：
 * 这里集中 3E 规则对核心类的扩展，例如给宝箱加上撬锁检定。
 */

DND3.Chest = class Chest extends RPG.Chest {};

DND3.Chest.handlers = {
	...RPG.Chest.handlers,

	/** 3E 撬锁：1d20 + 施术者灵巧调整值（stats.dex_mod）vs lockDC；
	 *  成功≈使用钥匙（机关判定被跳过），失败永久锁死。 */
	lockpick(that) {
		const roll = DND3.d20() + (that?.stats?.dex_mod ?? 0);
		RPG.perform(`（撬锁判定：${roll} / DC ${this.lockDC}）`);
		if (roll >= this.lockDC) this.openBy();
		else this.lockNow();
	},
};
