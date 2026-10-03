/* core/47-outcome.js（`sgstory#1934` · doc-3 批 C）：**战果解析器**（`OutcomeResolver`）。
 *
 * ## 出处（逐字照抄，✗ 不加料）
 * doc-3 §6.3 原案（操作者 2026-10-03 直授领队，转录见 `sgstory#1934` 的评论）：
 *   `resolve({players, enemies, completedRounds, roundLimit, retreatAccepted}, rules)`
 *   → `{ outcome, winner, reason, casualties }`，取不到则 `null`。
 *   · 五战果名：`death` / `knockout` / `victory` / `retreat` / `stalemate`
 *   · `winner` ∈ `players` / `enemies` / `none`
 *   · `casualties: [{ actorId, cause }]`，`cause` ∈ `dead` / `knocked-out` / `active`
 *   · 判定**次序即语义**：主角死 → 玩家全出局 → 敌方全出局（分 knockout/victory）→ 撤退 → 回合上限 → `null`
 *   · 原案注释：「未抽到敌人由故事入口处理，不作为胜利。双方同时致命倒地时**主角死亡优先**，不授予奖励；
 *     敌方全出局**优先于**回合上限。」
 *
 * ## 命名（本落形的一处选择，说明在此）
 *   doc-3 写作 `class OutcomeResolver { resolve(payload, rules) }`。本仓**公开面**的既有形是英文对象
 *   （`RPG.actionResult` / `RPG.rng` / `RPG.loot`…）⇒ 本落形取 `RPG.outcomeResolver.resolve(payload, rules?)`：
 *   **语义逐条照 §6.3**（含 `rules` 的第二个位置参数），✗ 不引入第二个同义面（一量一名）。
 *
 * ## `rules`（可覆写，缺省取引擎既有语义）
 *   · `isOut(actor)`      —— 缺省＝`hp <= 0 || RPG.isKnockedOut(actor)`（与 `Battle.prototype.isOut`
 *     的缺省同源；规则包覆写 `Battle.prototype.isOut` 时，调用方应把它传进来）
 *   · `isProtagonist(actor)` —— 缺省读 `actor.isProtagonist === true`（角色实例上的标记，见 `20-character.js`）
 *   ⚠ 本档**零宿主符号**（无 `State`／`$`／`jQuery`）：入参全是调用方给的角色对象。
 */
(() => {
	/** 单位身份：优先用**单位号**（`RPG.unitId.of`），非单位（字符串等）原样。与 `44-battle-resolve.js` 同规。 */
	const unitIdOf = (x) => {
		if (x == null) return null;
		if (typeof x === 'object' && typeof RPG.unitId?.of === 'function') {
			try { return RPG.unitId.of(x); } catch { /* 非单位对象 ⇒ 落回原样 */ }
		}
		return typeof x === 'object' ? (x.entityId ?? x.slotId ?? x.id ?? null) : String(x);
	};

	/** 缺省规则：与引擎既有语义同源（`20-character.js` 的 `isDown`／`isKnockedOut`）。 */
	const 缺省规则 = Object.freeze({
		isOut: (c) => (c?.hp ?? 0) <= 0 || RPG.isKnockedOut(c),
		isProtagonist: (c) => c?.isProtagonist === true,
	});

	/** 逐角色出局原因（照 §6.3 的三值：`hp<=0` ⇒ dead；`rules.isOut` ⇒ knocked-out；否则 active）。 */
	const 逐角色 = (全体, rules) => 全体.map((actor) => ({
		actorId: unitIdOf(actor),
		cause: (actor?.hp ?? 0) <= 0 ? 'dead' : (rules.isOut(actor) ? 'knocked-out' : 'active'),
	}));

	RPG.outcomeResolver = {
		/**
		 * @param payload `{ players, enemies, completedRounds, roundLimit, retreatAccepted }`
		 * @param rules   可覆写 `{ isOut, isProtagonist }`（缺省见文件头）
		 * @returns `{ outcome, winner, reason, casualties }` 或 `null`（战斗未结束）
		 */
		resolve({
			players = [], enemies = [], completedRounds = 0, roundLimit = 0, retreatAccepted = false,
		} = {}, rules = 缺省规则) {
			const r = { ...缺省规则, ...(rules ?? {}) };
			const casualties = 逐角色([...players, ...enemies], r);
			const 结成 = (outcome, winner, reason) => ({ outcome, winner, reason, casualties });

			/* ① 主角死（★优先于一切：「双方同时致命倒地 ⇒ 主角死亡优先，不授予奖励」） */
			if (players.some((a) => r.isProtagonist(a) && (a?.hp ?? 0) <= 0)) {
				return 结成('death', 'enemies', 'protagonist-dead');
			}
			/* ② 玩家全出局 */
			if (players.length > 0 && players.every((a) => r.isOut(a))) {
				return 结成('knockout', 'enemies', 'players-out');
			}
			/* ③ 敌方全出局（★优先于回合上限）：**全被击晕**取 knockout，否则 victory */
			if (enemies.length > 0 && enemies.every((a) => r.isOut(a))) {
				const 皆昏 = enemies.every((a) => (a?.hp ?? 0) > 0);
				return 结成(皆昏 ? 'knockout' : 'victory', 'players', 'enemies-out');
			}
			/* ④ 撤退（有退路时必成 ⇒ 由调用方置 `retreatAccepted`） */
			if (retreatAccepted) return 结成('retreat', 'none', 'retreat-accepted');
			/* ⑤ 回合上限 */
			if (completedRounds >= roundLimit) return 结成('stalemate', 'none', 'round-limit');
			/* ⑥ 未结束 */
			return null;
		},

		/** 缺省规则（判据／调用方想显式引用同一份时用；✗ 别在别处再抄一份）。 */
		缺省规则,
	};
})();
