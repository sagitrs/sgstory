/* core/44-battle-resolve.js（`sgstory#1914` 增量 3/3）：**行动结果**的结构化形。
 *
 * 为什么要有它：现码把「成功／被拒」表达成**返回值＋一串文案**，下游（重复行动、UI、判据）只能从
 * 字串里**猜**。票面要 `{status, consumesAction, events[]}`。
 *
 * 口径（与「被拒即回到选择」成对照）：
 *   · `applied`  ⇒ `status:'applied'`、**`consumesAction: true`**（本回合照常消耗）
 *   · `rejected` ⇒ `status:'rejected'`、**`consumesAction: false`**（⇒ 未消耗行动机会，可由上层重来）
 *
 * `events` 里放**结构化**事实（✗ 文案）：`kind` 区分何者，`actorId`／`targetId` 用**单位号**
 *   （`RPG.unitId`），`itemId` 用**件号**（`slotId`，见 `10-item.js`）—— 三者都是「改名／换文案
 *   也不失真」的身份量。
 *   ⚠ 装载序：本档排在 `40-battle.js` **之后**（`build.py` 按字典序）⇒ 调用都发生在**运行时**，安全。
 *
 * ⚠ 命名：公开面与字段英文（`RPG.actionResult`／`applied`／`rejected`／`actor`／`item`／`target`／
 *   `actionClass`／`events`）—— 仓内既有引擎面（`RPG.deposit`／`canStack`／`noticeChannel`…）皆英文；
 *   本席最初写成中文面，自审时改回。中文只留在注释、局部短变量与**给玩家看的报文**里。
 */
(() => {
	/** 身份量：优先用**单位号**；非单位（如道具 id 字串）原样返回。 */
	const unitIdOf = (x) => {
		if (x == null) return null;
		if (typeof x === 'object' && typeof RPG.unitId?.of === 'function') {
			try { return RPG.unitId.of(x); } catch { /* 非单位对象 ⇒ 落回原样 */ }
		}
		return typeof x === 'object' ? (x.entityId ?? x.slotId ?? x.id ?? null) : String(x);   // ★`#1924`：新名优先（旧名读回落）
	};

	/** 件号：给实例取 `slotId`；给字串（道具 id）原样（判据与桩常用字串）。 */
	const itemRef = (x) => (x && typeof x === 'object' ? (x.entityId ?? x.slotId ?? x.id ?? null) : (x ?? null));

	RPG.actionResult = {
		/** 行动落地（或被正常消耗：跳过／装备／卸下）。`kind` 区分：`'action'|'equip'|'skip'`。 */
		applied({ actor = null, item = null, target = null, actionClass = 'damage', events = null } = {}) {
			return {
				status: 'applied',
				consumesAction: true,
				events: events ?? [{
					kind: 'action',
					actorId: unitIdOf(actor),
					itemId: itemRef(item),
					targetId: unitIdOf(target),
					actionClass,
				}],
			};
		},

		/** 被拒 —— **不消耗**行动机会，上层可回到选择。 */
		rejected({ actor = null, reason = 'unknown', detail = '' } = {}) {
			return {
				status: 'rejected',
				consumesAction: false,
				events: [{ kind: 'refused', actorId: unitIdOf(actor), reason: String(reason), detail: String(detail) }],
			};
		},
	};
})();
