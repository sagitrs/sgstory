/* **行动结果**的结构化形（`sgstory#1914` 增量 3/3 · 步四）。
 *
 * 为什么要有它：现码把「成功／被拒」表达成**返回值＋一串文案**（`r?.status === 'rejected'` 之类），
 *   下游（重复行动、UI、判据）只能从字串里**猜**。票面要 `{status, consumesAction, events[]}`。
 *
 * 口径（与「被拒即回到选择」成对照）：
 *   · `成功` ⇒ `status:'applied'`、**`consumesAction: true`**（本回合照常消耗）
 *   · `被拒` ⇒ `status:'rejected'`、**`consumesAction: false`**（⇒ 未消耗行动机会，可由上层重来）
 *
 * `events` 里放**结构化**事实（✗ 文案）：`kind` 区分何者，`actorId`／`targetId` 用**单位号**，
 *   `itemId` 用**件号**（`slotId`，见 `10-item.js`）—— 三者都是「改名／换文案也不失真」的身份量。
 *   ⚠ 事件里的 `actorId`/`targetId` 走 `RPG.意图.候选值`（`42-battle-intent.js`）⇒ 号源只有一份。
 *   ⚠ 装载序：本档排在 `40-battle.js` **之后**（`build.py` 按字典序）⇒ 调用都发生在**运行时**，安全。
 */
(() => {
	/** 身份量：优先用**单位号**（`RPG.意图`）；非单位（如道具 id 字串）原样返回。 */
	const 单位号 = (x) => {
		if (x == null) return null;
		if (typeof x === 'object' && typeof RPG.意图?.候选值 === 'function') {
			try { return RPG.意图.候选值(x); } catch { /* 非单位对象 ⇒ 落回原样 */ }
		}
		return typeof x === 'object' ? (x.slotId ?? x.id ?? null) : String(x);
	};

	/** 件号：给实例取 `slotId`；给字串（道具 id）原样（判据与桩常用字串）。 */
	const 件号 = (x) => (x && typeof x === 'object' ? (x.slotId ?? x.id ?? null) : (x ?? null));

	RPG.行动结果 = {
		/** 行动落地（或被正常消耗：跳过／装备／卸下）。`kind` 区分：`'action'|'equip'|'skip'`。 */
		成功({ 行动者 = null, 道具 = null, 靶 = null, 动作类 = 'damage', 事件 = null } = {}) {
			return {
				status: 'applied',
				consumesAction: true,
				events: 事件 ?? [{
					kind: 'action',
					actorId: 单位号(行动者),
					itemId: 件号(道具),
					targetId: 单位号(靶),
					actionClass: 动作类,
				}],
			};
		},

		/** 被拒 —— **不消耗**行动机会，上层可回到选择。 */
		被拒({ 行动者 = null, 理由 = 'unknown', 详情 = '' } = {}) {
			return {
				status: 'rejected',
				consumesAction: false,
				events: [{ kind: 'refused', actorId: 单位号(行动者), reason: String(理由), detail: String(详情) }],
			};
		},
	};
})();
