/* core/46-battle-repeat.js（`sgstory#1914` 增量 3/3）：**重复上一次行动**。
 *
 * 口径：一键重复「上一次」—— 指**同一件、同一靶**（✗ 重新走三问）。
 *   · 件用**件号**（`slotId`）认 ⇒ 背包顺序变了也仍指那一件（下标会漂移）。
 *   · 靶用**单位号**（`42-battle-intent.js`）认 ⇒ 同名单位分得开、改名不失真。
 *   · 任一件不在（用光／换手／目标没了）⇒ **出声、不消耗行动机会、回到选择**（战斗的回路接住）。
 *
 * ⚠ 存档往返的**正确形态**（本席口径）：单位号是**会话内**量（`WeakMap` 发号），而 P0 明确
 *   **战斗中途不许存档** ⇒ 意图**不需要**入档。要保证的是「意图活在 `Battle` **实例**上」——
 *   换一场战斗即干净（✗ 模块级／类级存放 ⇒ 跨场串味，指向一个旧世界的号）。
 *
 * 装载序：本档在 `40-battle.js` **之后**（`build.py` 字典序）⇒ 只在**运行时**被调用，安全。
 */
(() => {
	/** 记下「刚刚成功的那一手」——件取**件号**、靶取**单位号**（✗ 下标／名字）。 */
	const remember = (battle, { item, target, actionClass = 'damage' } = {}) => {
		const slotId = item?.entityId ?? item?.slotId ?? null;   // ★`#1924`：实体身份（旧名 `slotId` 作读回落）
		const targetId = (target && typeof RPG.unitId?.of === 'function') ? RPG.unitId.of(target) : null;
		if (!slotId || !targetId) return null;           // 认不出身份就不记（✗ 记一个假的可重复项）
		battle.lastIntent = {
			slotId, targetId, actionClass,
			itemName: String(item?.name ?? slotId), targetName: String(target?.name ?? targetId),
		};
		return battle.lastIntent;
	};

	const last = (battle) => battle?.lastIntent ?? null;

	/** 选单项（没有可重复的 ⇒ `null`，调用方不列）。 */
	const option = (battle) => {
		const 图 = last(battle);
		if (!图) return null;
		return { text: `重复上一次：使用「${图.itemName}」打「${图.targetName}」`, value: 'repeat' };
	};

	/**
	 * 解析意图 ⇒ 可执行的一手。
	 * @param candidates 战斗给的**目标候选取源**（`(actionClass) => 数组`）—— 由战斗提供，
	 *   保证「候选只有一份来源」（✗ 本档自己再判一遍阵营）。
	 * @returns `{ok:true, item, target, itemName, targetName, actionClass}` ｜ `{ok:false, reason, detail}`
	 */
	const resolve = (battle, attacker, candidates) => {
		const 图 = last(battle);
		if (!图) return { ok: false, reason: 'no-intent', detail: '还没有可以重复的行动' };
		/* ★`dev-9` 合流裁定点名的「过期＝**具名原因**」：行动者自己没了（被打倒）也须是具名的一条，
		 *   ✗ 泛泛的失败。⚠ `replayed`（同一请求被重复消费）在本设计里**不适用**：意图是**模板**，
		 *   在**选择的那一刻**重新解析、当场执行，✗ 没有排队期。 */
		if (battle?.isOut?.(attacker)) return { ok: false, reason: 'actor-gone', detail: `${attacker?.name ?? '行动者'}已经倒下了` };
		const slots = Array.isArray(attacker?.items) ? attacker.items : [];
		const slot = slots.find((s) => (s?.entityId ?? s?.slotId) === 图.slotId);
		if (!slot) return { ok: false, reason: 'item-gone', detail: `「${图.itemName}」已经不在身上了` };
		const item = RPG.reviveItem(slot);
		const 名单 = typeof candidates === 'function' ? candidates(图.actionClass) : [];
		const target = 名单.find((c) => RPG.unitId.of(c) === 图.targetId);
		if (!target) return { ok: false, reason: 'target-gone', detail: `「${图.targetName}」已经不在了` };
		return { ok: true, item, target, itemName: 图.itemName, targetName: 图.targetName, actionClass: 图.actionClass };
	};

	RPG.repeat = Object.freeze({ remember, last, option, resolve });
})();
