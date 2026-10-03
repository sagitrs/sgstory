/* **重复上一次行动**（`sgstory#1914` 增量 3/3 · 步五 · 收尾）。
 *
 * 口径：一键重复「上一次」—— 指**同一件、同一靶**（✗ 重新问一遍三问）。
 *   · 件用**件号**（`slotId`，步三）认 ⇒ 背包顺序变了也仍指那一件（下标会漂移）。
 *   · 靶用**单位号**（`42-battle-intent.js`）认 ⇒ 同名单位也分得开、改名不失真。
 *   · 任一件不在（用光／换手／目标没了）⇒ **出声、不消耗行动机会、回到选择**（步二的回路接住）。
 *
 * ⚠ 存档往返的**正确形态**（本席口径）：单位号是**会话内**量（`WeakMap` 发号），而 P0 明确
 *   **战斗中途不许存档** ⇒ 意图**不需要**入档。要保证的是「意图活在 `Battle` **实例**上」——
 *   换一场战斗即干净（✗ 模块级／类级存放 ⇒ 跨场串味，指向一个旧世界的号）。
 *
 * 装载序：本档在 `40-battle.js` **之后**（`build.py` 字典序）⇒ 只在**运行时**被调用，安全。
 */
(() => {
	/** 记下「刚刚成功的那一手」——件取**件号**、靶取**单位号**（✗ 下标／名字）。 */
	const 记 = (battle, { 件, 靶, 动作类 = 'damage' } = {}) => {
		const 件号 = 件?.slotId ?? null;
		const 靶号 = (靶 && typeof RPG.意图?.候选值 === 'function') ? RPG.意图.候选值(靶) : null;
		if (!件号 || !靶号) return null;                 // 认不出身份就不记（✗ 记一个假的可重复项）
		battle.上次意图 = {
			件: 件号, 靶: 靶号, 动作类,
			件名: String(件?.name ?? 件号), 靶名: String(靶?.name ?? 靶号),
		};
		return battle.上次意图;
	};

	const 取 = (battle) => battle?.上次意图 ?? null;

	/** 选单项（没有可重复的 ⇒ `null`，调用方不列）。 */
	const 选项 = (battle) => {
		const 图 = 取(battle);
		if (!图) return null;
		return { text: `重复上一次：使用「${图.件名}」打「${图.靶名}」`, value: 'repeat' };
	};

	/**
	 * 解析意图 ⇒ 可执行的一手。
	 * @param 候选 战斗给的**目标候选取源**（`(动作类) => 我方∩敌方存活`）—— 由战斗提供，
	 *   保证「候选只有一份来源」（✗ 本档自己再判一遍阵营）。
	 * @returns `{ok:true, 件, 靶, 件名, 靶名, 动作类}` ｜ `{ok:false, 理由, 详情}`
	 */
	const 解析 = (battle, attacker, 候选) => {
		const 图 = 取(battle);
		if (!图) return { ok: false, 理由: 'no-intent', 详情: '还没有可以重复的行动' };
		const slots = Array.isArray(attacker?.items) ? attacker.items : [];
		const slot = slots.find((s) => s?.slotId === 图.件);
		if (!slot) return { ok: false, 理由: 'no-such-item', 详情: `「${图.件名}」已经不在身上了` };
		const 件 = RPG.reviveItem(slot);
		const 名单 = typeof 候选 === 'function' ? 候选(图.动作类) : [];
		const 靶 = 名单.find((c) => RPG.意图.候选值(c) === 图.靶);
		if (!靶) return { ok: false, 理由: 'no-such-target', 详情: `「${图.靶名}」已经不在了` };
		return { ok: true, 件, 靶, 件名: 图.件名, 靶名: 图.靶名, 动作类: 图.动作类 };
	};

	RPG.重复 = { 记, 取, 选项, 解析 };
})();
