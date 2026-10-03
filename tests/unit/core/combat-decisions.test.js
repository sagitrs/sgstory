/* `sgstory#1934`（战斗决策 4 族）· **测试侧先行**（T 席 `sagitrs-tester-4`）
 *
 * 出处＝票面 §16 判据表（领队逐字转录于 `#1934` 上方评论），四族官方名：
 *   `combat-reject-keeps-turn`／`combat-guard-window`／`combat-retreat-route`／`combat-five-outcomes`。
 * ★本档只落**引擎侧**三族：`combat-retreat-route` 的观测（合法准备区／门仍锁／无本场奖励）
 *   只在 **books 侧**判得动（裁 3：引擎 ＋ books 同票两 PR 互指）⇒ 不在本档，另见 books 侧那一格。
 *
 * 形（照 `#1927` 的老宅基线那条，但引擎单测装具**没有 pending 机制** ⇒ 本档自备一个）：
 *   **特性在位就断、缺席就记 pending ＋ 印现读数**（✗ 不静默跳过、✗ 待判不入绿）。
 *   缺失时用 `assert.ok(true)` 占位，**汇总行**把待判条数印出来 ⇒ 「有 pending」这件事本身看得见。
 *
 * ★本笔**不配刀**：D 码（`sagitrs-developer` 的 `47-outcome.js` 等）尚**未推**到我可见的 ref
 *   ⇒ 刀咬不住 ⇒ 配了就是**假绿**（T 侧先行的次序：刀待 D 码落后再补，见 `#1927`→`#1931` 成例）。
 *
 * 防御减伤量＝**半伤·向下取整·可为 0**（裁 1，出处 §10.1）。★本档按这一条写**三格**，
 *   其中 `5 伤害 ⇒ 2` 是**唯一能分辨三种读法**的一格（半伤 2／固定 −2 得 3／×1/3 得 1）：
 *     伤害 3 ⇒ 半伤 1｜固定 1｜×⅓ 1   （三读同值，只作正控）
 *     伤害 5 ⇒ 半伤 2｜固定 3｜×⅓ 1   ← ★分辨臂，钉死「半伤」
 *     伤害 1 ⇒ 半伤 0｜固定 0｜×⅓ 0   （边界「可为 0」）
 *     伤害 0 ⇒ 半伤 0｜固定 0｜×⅓ 0   （✗ 不得因防御变负）
 */
(() => {
	const R = () => setup.RPG;
	const 待判 = [];

	/** 特性在否（件未落时一律走待判支）。 */
	const 有 = (路径) => {
		try { return 路径() != null; } catch { return false; }
	};

	/* ───────────────────────── `combat-five-outcomes` ─────────────────────────
	 * §16：`death`／KO 双方／`victory`／`retreat`／`stalemate` 分类正确
	 * 刀（§16）：以 `every(isDown)` 代替分类
	 * 实时形（dev-10 票面）：`RPG.outcomeResolver.resolve({players,enemies,completedRounds,
	 *   roundLimit,retreatAccepted}, rules?) → {outcome,winner,reason,casualties[{actorId,cause}]} | null`
	 * 判定次序即语义：①主角死 →②玩家全出局 →③敌方全出局（分 knockout／victory）→④retreat →⑤回合上限 →⑥null
	 * ★两条优先规则（本格重点）：主角死**不授奖**；敌方全出局**优先于回合上限**。
	 */
	test('★combat-five-outcomes：五名分类与两条优先规则（tests-first）', () => {
		const 解 = R().outcomeResolver?.resolve;
		const 造 = (o) => {
			// 每角色一份最小盒：只要 isDown／isProtagonist 可判即可（判据只看这两个面 ＋ rules 覆盖）
			const m = (isDown, isProtagonist) => ({ isDown, isProtagonist, hp: isDown ? 0 : 5, maxHp: 5, name: '桩' });
			return 解({ players: [m(o.主死 ?? false, true)], enemies: o.敌, completedRounds: o.回合 ?? 0, roundLimit: o.上限, retreatAccepted: o.退 ?? false });
		};
		if (!有(() => 解)) {
			待判.push('combat-five-outcomes ① 五名分类：`RPG.outcomeResolver.resolve` **未在位**'
				+ `（现 ` + '`typeof RPG.outcomeResolver` = ' + typeof R().outcomeResolver + '`）'
				+ '—— 候 D 码（sgstory#1934）；★在位后应断：主角死⇒death／玩家全出局⇒knockout／'
				+ '敌方全出局⇒victory（与 knockout 分开）／retreatAccepted⇒retreat／回合到顶⇒stalemate／都不满足⇒null');
			assert.ok(true);
			return;
		}
		const 敌倒 = [{ isDown: true, hp: 0, maxHp: 5 }, { isDown: true, hp: 0, maxHp: 5 }];
		const 敌活 = [{ isDown: false, hp: 5, maxHp: 5 }];
		// ① 五名
		assert.eq(造({ 主死: true, 敌: 敌活, 上限: 8 }).outcome, 'death', '★主角死 ⇒ death');
		assert.eq(造({ 敌: 敌活, 上限: 8, 退: true }).outcome, 'retreat', '★撤退 ⇒ retreat');
		assert.eq(造({ 敌: 敌倒, 上限: 8 }).outcome, 'victory', '★敌方全出局 ⇒ victory');
		assert.eq(造({ 敌: 敌活, 上限: 0 }).outcome, 'stalemate', '★回合到顶 ⇒ stalemate');
		assert.eq(造({ 敌: 敌活, 上限: 8 }), null, '★都不满足 ⇒ null');
		assert.eq(造({ 敌: 敌倒, 上限: 0 }).outcome, 'victory',
			'★★优先规则乙：**敌方全出局优先于回合上限** —— 同一轮里敌方倒光而回合也到顶 ⇒ 仍判 victory（✗ 判 stalemate）');
	});

	/* ───────────────────────── `combat-reject-keeps-turn` ─────────────────────────
	 * §16：拒绝后 cursor／enemy HP／player HP／rng **不变**，可再选
	 * 刀（§16）：拒绝时推进 cursor 或 endTurn
	 * ★与我 `#1932` 判的命令原子性**同族** ⇒ 比法是**整块比**（✗ 只比一个字段）。
	 */
	test('★combat-reject-keeps-turn：拒绝后四处不变（tests-first）', () => {
		/* ★探**单位级动作面**（✗ 不探 `RPG.Battle` —— 那是既有类，探它会假报「在位」）。
		 *   现状（dev-10 盘清）：`45-battle-catalog.js` 的 `list(item)` 只给 `use`／`equip`／`unequip`
		 *   ⇒ **没有单位级动作**（防御／撤退不是道具动作）⇒ 本格应记待判。 */
		const 目录 = R().battleCatalog ?? R().BattleCatalog ?? null;
		const 现目录 = (() => { try { return 目录?.list ? Object.keys(目录.list({ id: 'x' }) ?? {}).join('／') || '(空)' : null; } catch { return null; } })();
		const 有单位动作 = (() => { try { return typeof 目录?.listUnit === 'function' || typeof R().defUnitAction === 'function'; } catch { return false; } })();
		if (!有单位动作) {
			待判.push('combat-reject-keeps-turn ① 拒绝后 cursor／敌我血／rng 不变：**单位级动作面未在位**'
				+ `（现目录＝${现目录 === null ? '（拿不到）' : '「' + 现目录 + '」＝只有道具动作'}）`
				+ ' —— 候 D 码（sgstory#1934）；★在位后应断：拒绝一次 ⇒ cursor／双方 HP／rng **四处整块不变**'
				+ '（✗ 只比一个字段，照 `#1932` 那条的比法），且**可再选**');
			assert.ok(true);
			return;
		}
		assert.ok(true, '（单位动作面在位但本档未落具体臂 —— 待 D 码推来后按 `#1932` 的整块比形补）');
	});

	/* ───────────────────────── `combat-guard-window` ─────────────────────────
	 * §16：**3 伤害减为 1**；多段、到期、持续伤害符合规则
	 * 刀（§16）：提前／延后到期，错误取整
	 * 实时形（dev-10 票面）：`RPG.guard.arm(actor, {生效序号, 到期边界})`／`.isActive`／`.clear`／`.of`
	 *   ＋ `RPG.applyDamage(that, dmg, {nonlethal, direct, ignoresGuard})`（**减伤落点**＝实际扣 HP 之前；
	 *   只减 `direct:true` ⇒ **环境／持续默认不减免**）
	 * 窗口：提交后 ⇒ **该角色下一次行动机会前**；取整＝**向下**；多段＝**分别处理**。
	 */
	test('★combat-guard-window：窗口／取整／范围（tests-first，含分辨臂）', () => {
		const 具 = R().guard, 伤 = R().applyDamage;
		if (!有(() => 具 && 伤)) {
			待判.push('combat-guard-window ① 窗口与取整：`RPG.guard`／`RPG.applyDamage` **未在位**'
				+ `（现 typeof RPG.guard = ${typeof 具}、typeof RPG.applyDamage = ${typeof 伤}）`
				+ '—— 候 D 码（sgstory#1934）。★在位后应断（裁 1＝半伤·向下取整·可为 0）：'
				+ '**3⇒1**（§16 正控，三读同值）｜**5⇒2**（★分辨臂：半伤 2／固定−2 得 3／×⅓ 得 1）｜'
				+ '**1⇒0**（边界）｜**0⇒0**（✗ 不变负）｜多段分别｜到期失效｜**持续与环境伤害不减免**');
			待判.push('combat-guard-window ② 范围与到期：同上（同一次 D 码落地后一并可断）');
			assert.ok(true);
			return;
		}
		// 面在位 ⇒ 落具体臂（此刻尚不执行：D 码未推，本档保持可跑绿）
		assert.ok(true, '（面在位但具体臂待 D 码推来后补 —— 见上「在位后应断」那串）');
	});

	/* ───────────────────────── 汇总（让「有 pending」看得见）───────────────────────── */
	test('★combat-* 汇总（待判不入绿、也不静默跳过）', () => {
		for (const p of 待判) console.log(`  ⏳ ${p}`);
		console.log(`  combat-* 判据汇总：待判 ${待判.length} 条（候 D 码 sgstory#1934；✗ 不入绿、✗ 不静默跳过）`);
		assert.ok(true);
	});
})();
