/* DND5E 道具 —— 旧硬币（纪念品） */

DND5E.OldCoin = RPG.defItem({
	id: 'coin', name: '旧硬币', desc: '一枚生锈的铜币。',
	stats: { value: 1 }, charges: null, stackable: false,
	/* ★`books#130`：同 `dnd3/items/coin.js` —— 该句只走**通知面**（✗ 再落正文）。
	 *   ⚠ 本件**保持原形**的返回值（✗ 本笔**不**补 `return false`）：那是**用面**契约（`undefined`＝成功），
	 *     与「说明显示面」是两件事 ⇒ 另议（已在 `#130` 报出，见 PR body）。 */
	used(that) {
		const line = `旧硬币只是纪念品，对${that.name}没有任何效果`;
		if (typeof RPG.pushNotice === 'function') RPG.pushNotice(line);
		else this.perform(line);
	},
});
