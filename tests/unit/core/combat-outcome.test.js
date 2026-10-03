/* `sgstory#1934`（doc-3 批 C）· **战果解析器**（§6.3）与**防御**（§10.1）
 *
 * 出处（逐字转录在 `sgstory#1934` 的评论里）：§6.3 `OutcomeResolver` 原案（五战果／`winner`／`casualties`／
 *   判定次序／两条优先规则）＋ §10.1 防御全文（窗口・半伤向下取整可为 0・多段分别・只限直接攻击・
 *   环境与持续不减免・不叠加・战斗结束清除）＋ §14 裁点表 ＋ §2.8（`roundLimit` 由遭遇配置声明）。
 * 本档只判**引擎靠引擎面**能判的：解析器语义、防御数值与窗口、存档往返、`roundLimit` 随条目带出。
 *   `combat-retreat-route`（撤退到合法准备区・门仍锁・无奖励）**只在 books 侧判得动** ⇒ 另笔。
 * ⚠ 族名以 **§16 官方四名**为准（`combat-reject-keeps-turn`／`combat-guard-window`／
 *   `combat-retreat-route`／`combat-five-outcomes`）。
 */
(() => {
	const R = () => setup.RPG;
	const 角色 = (名, hp, extra = {}) => new (R().Character)({ name: 名, hp, maxHp: hp, ...extra });
	/** 一名主角（`isProtagonist`）—— §6.3 的「主角死优先」靠这个标记。 */
	const 主角 = (hp) => 角色('主角', hp, { protagonist: true });

	/* ── §6.3：五战果 ＋ 判定次序 ＋ 两条优先规则 ───────────────────── */

	test('战果①【death・主角死优先】：主角 hp<=0 ⇒ death/enemies，**即使敌方也全出局**（不授奖）', () => {
		const 我 = 主角(0), 敌 = 角色('敌', 0);
		const r = R().outcomeResolver.resolve({ players: [我], enemies: [敌], completedRounds: 1, roundLimit: 8 });
		assert.eq(r.outcome, 'death', `★主角死须取 death（实得 ${JSON.stringify(r)}）`);
		assert.eq(r.winner, 'enemies', '★winner 须是 enemies');
		assert.eq(r.reason, 'protagonist-dead', '★理由须具名 protagonist-dead');
	});

	test('战果②【knockout・玩家全出局】：两个玩家都出局（主角**被打晕**✗ 非致命）⇒ knockout/enemies/players-out', () => {
		const 我 = 主角(5), 伴 = 角色('同伴', 0);
		我.nonlethal = 9;                    // 主角 hp>0 ⇒ ✗ 不触发「主角死」那条；但 isOut ⇒ 玩家全出局 ✓
		const r = R().outcomeResolver.resolve({ players: [我, 伴], enemies: [角色('敌', 9)], completedRounds: 1, roundLimit: 8 });
		assert.eq(r.outcome, 'knockout', `★玩家全出局 ⇒ knockout（实得 ${JSON.stringify(r)}）`);
		assert.eq(r.reason, 'players-out', '★理由 players-out');
	});

	test('战果③【victory】：敌方有人 hp<=0 且全出局 ⇒ victory/players/enemies-out', () => {
		const r = R().outcomeResolver.resolve({
			players: [主角(5)], enemies: [角色('敌', 0)], completedRounds: 1, roundLimit: 8,
		});
		assert.eq(r.outcome, 'victory', `★实得 ${JSON.stringify(r)}`);
		assert.eq(r.winner, 'players', '★winner 须是 players');
	});

	test('战果④【knockout・敌方全被击晕】：敌方全出局但**都还活着**（非致命）⇒ knockout/players', () => {
		const 敌 = 角色('敌', 3, {});
		敌.nonlethal = 5;                                  // 非致命累积 > hp ⇒ isKnockedOut ✓（hp 不变）
		const r = R().outcomeResolver.resolve({ players: [主角(5)], enemies: [敌], completedRounds: 1, roundLimit: 8 });
		assert.eq(r.outcome, 'knockout', `★全被击晕取 knockout（实得 ${JSON.stringify(r)}）`);
		assert.eq(r.winner, 'players', '★winner 仍是 players');
		assert.eq(r.reason, 'enemies-out', '★理由 enemies-out');
	});

	test('战果⑤【retreat】：`retreatAccepted` ⇒ retreat/none（撤退必成，✗ 不定骰）', () => {
		const r = R().outcomeResolver.resolve({
			players: [主角(5)], enemies: [角色('敌', 9)], completedRounds: 1, roundLimit: 8, retreatAccepted: true,
		});
		assert.eq(r.outcome, 'retreat', `★实得 ${JSON.stringify(r)}`);
		assert.eq(r.winner, 'none', '★撤退无胜方');
	});

	test('战果⑥【stalemate】：回合到限 ⇒ stalemate/none/round-limit', () => {
		const r = R().outcomeResolver.resolve({ players: [主角(5)], enemies: [角色('敌', 9)], completedRounds: 8, roundLimit: 8 });
		assert.eq(r.outcome, 'stalemate', `★实得 ${JSON.stringify(r)}`);
		assert.eq(r.reason, 'round-limit', '★理由 round-limit');
	});

	test('战果⑦【优先规则・敌方全出局优先于回合上限】：两者同时成立 ⇒ victory（✗ stalemate）', () => {
		const r = R().outcomeResolver.resolve({ players: [主角(5)], enemies: [角色('敌', 0)], completedRounds: 8, roundLimit: 8 });
		assert.eq(r.outcome, 'victory', `★敌方全出局须优先（实得 ${JSON.stringify(r)}）`);
	});

	test('战果⑧【未结束 ⇒ null】：三条都不成立时**不猜**（✗ 返回一个默认战果）', () => {
		const r = R().outcomeResolver.resolve({ players: [主角(5)], enemies: [角色('敌', 9)], completedRounds: 1, roundLimit: 8 });
		assert.eq(r, null, `★未结束须 null（实得 ${JSON.stringify(r)}）`);
	});

	test('战果⑨【casualties 三值】：dead／knocked-out／active 各按 hp 与 isOut 分（含**双方**）', () => {
		const 死 = 角色('死的', 0), 昏 = 角色('昏的', 3), 活 = 角色('活的', 9);
		昏.nonlethal = 5;
		const r = R().outcomeResolver.resolve({ players: [活], enemies: [死, 昏], completedRounds: 1, roundLimit: 8 });
		const 因 = r.casualties.map((c) => c.cause);
		assert.eq(因.includes('dead') && 因.includes('knocked-out') && 因.includes('active'), true,
			`★三值须各有人：dead／knocked-out／active（实得 ${JSON.stringify(r.casualties)}）`);
		assert.eq(r.casualties.length, 3, '★casualties 应含**双方**全体（玩家 1 ＋ 敌方 2）');
	});

	test('战果⑩【rules 可覆写】：自定义 `isOut` 立即改变「全出局」的判定（✗ 硬编在解析器里）', () => {
		const 敌 = 角色('敌', 9);            // 活着；覆写只把它判成出局 ⇒ 走 ③ 且因 hp>0 取 knockout
		const 无 = R().outcomeResolver.resolve({ players: [主角(5)], enemies: [敌], completedRounds: 1, roundLimit: 8 });
		/* ⚠ 覆写只作用**敌方**：全出局一律真会把「玩家全出局」那条先点着（次序在前）⇒ 判的就不是 ③ 了。 */
		const 有 = R().outcomeResolver.resolve({ players: [主角(5)], enemies: [敌], completedRounds: 1, roundLimit: 8 },
			{ isOut: (c) => c === 敌 });
		assert.eq(无, null, '★缺省规则下不该结束');
		assert.eq(有?.outcome, 'knockout', `★覆写 isOut 后应判全出局（且 hp>0 ⇒ knockout；实得 ${JSON.stringify(有)}）`);
		assert.eq(有?.reason, 'enemies-out', '★理由 enemies-out');
	});

	/* ── §10.1：防御（窗口・数值・边界）────────────────────────────── */

	test('防御①【窗口】：生效序号 <= 当前 < 到期边界 为真，到期即假（✗ 早退也✗ 晚退）', () => {
		const 我 = 主角(9);
		R().guard.arm(我, { 生效序号: 10, 到期边界: 20 });
		assert.eq(R().guard.isActive(我, 10), true, '★下界当值生效（10）');
		assert.eq(R().guard.isActive(我, 19), true, '★上界前一刻仍生效（19）');
		assert.eq(R().guard.isActive(我, 20), false, '★到期边界当值**已失效**（20）');
		assert.eq(R().guard.isActive(我, 9), false, '★生效前不生效（9）');
	});

	test('防御②【不叠加】：再 arm 一次 ⇒ **覆盖**（✗ 叠成两层/取更长窗口）', () => {
		const 我 = 主角(9);
		R().guard.arm(我, { 生效序号: 1, 到期边界: 5 });
		R().guard.arm(我, { 生效序号: 7, 到期边界: 9 });
		assert.eq(R().guard.isActive(我, 5), false, '★旧窗口须已被覆盖（5 不应再生效）');
		assert.eq(R().guard.isActive(我, 8), true, '★新窗口生效');
		assert.eq(R().guard.isActive(我, 9), false, '★新窗口到期即失效');
	});

	test('防御③【战斗结束清除】：`clear` ⇒ 状态没了（✗ 留到下一场）', () => {
		const 我 = 主角(9);
		R().guard.arm(我, { 生效序号: 1, 到期边界: 99 });
		R().guard.clear(我);
		assert.eq(R().guard.of(我), null, '★清后读不到 guard');
		assert.eq(R().guard.isActive(我, 2), false, '★清后判活为假');
	});

	test('防御④【数值·三格】：3⇒1（§16 正控）／5⇒2（分辨「半伤」与 −2／×1/3 的唯一格）／1⇒0（边界）', () => {
		const 我 = 主角(9);
		R().guard.arm(我, { 生效序号: 1, 到期边界: 99 });
		for (const [伤, 期望] of [[3, 1], [5, 2], [1, 0], [0, 0]]) {
			我.hp = 20;
			R().applyDamage(我, 伤, { direct: true });
			assert.eq(20 - 我.hp, 期望, `★${伤} 伤害经防御应为 ${期望}（实得 ${20 - 我.hp}）`
				+ ' —— 5⇒2 那一格是钉死「半伤」的：固定 −2 会给 3、×1/3 会给 1');
		}
	});

	test('防御⑤【多段分别结算】：两次 3 伤害 ⇒ 1＋1＝2（✗ 先合并成 6 再减半＝3）', () => {
		const 我 = 主角(20);
		R().guard.arm(我, { 生效序号: 1, 到期边界: 99 });
		R().applyDamage(我, 3, { direct: true });
		R().applyDamage(我, 3, { direct: true });
		assert.eq(20 - 我.hp, 2, `★多段须**分别**减半（实得总伤 ${20 - 我.hp}；若为 3 则是先合并）`);
	});

	test('防御⑥【只减直接攻击】：`direct` 缺省（环境／持续伤害）**不减**；`ignoresGuard` 也**不减**', () => {
		const 我 = 主角(20);
		R().guard.arm(我, { 生效序号: 1, 到期边界: 99 });
		R().applyDamage(我, 4);                              // 非直接：环境／持续
		assert.eq(20 - 我.hp, 4, '★非直接伤害不得减免（§10.1：默认不减免环境伤害和持续伤害）');
		我.hp = 20;
		R().applyDamage(我, 4, { direct: true, ignoresGuard: true });
		assert.eq(20 - 我.hp, 4, '★声明忽略防御的攻击不得减免');
	});

	test('防御⑦【非致命也走减伤】：`direct` 的非致命攻击按半伤累积（「实际扣 HP／非致命伤之前」）', () => {
		const 我 = 主角(10);
		R().guard.arm(我, { 生效序号: 1, 到期边界: 99 });
		R().applyDamage(我, 5, { direct: true, nonlethal: true });
		assert.eq(我.nonlethal, 2, `★非致命累积应为半伤后的 2（实得 ${我.nonlethal}）`);
		assert.eq(我.hp, 10, '★非致命不改 hp');
	});

	test('防御⑧【无防御不减】：没起防御时，直接攻击按原值扣', () => {
		const 我 = 主角(20);
		R().applyDamage(我, 5, { direct: true });
		assert.eq(20 - 我.hp, 5, '★没防御 ⇒ 原值（✗ 无条件减半）');
	});

	/* ── 存档往返 ＋ `roundLimit` ─────────────────────────────────── */

	test('往返①【防御与主角标记随档】：`toJSON` → `revive` 后仍是同一份状态', () => {
		const 我 = 主角(7);
		R().guard.arm(我, { 生效序号: 3, 到期边界: 8 });
		const 快照 = 我.toJSON();
		assert.eq(快照.isProtagonist, true, '★主角标记须进快照');
		assert.eq(JSON.stringify(快照.runtime?.guard), JSON.stringify({ 生效序号: 3, 到期边界: 8 }),
			'★防御状态须进快照（doc-3：状态存入 `actorRuntime.guard`）');
		const 回 = R().Character.revive(快照);
		assert.eq(回?.isProtagonist, true, '★还原后主角标记仍在');
		assert.eq(R().guard.isActive(回, 5), true, '★还原后防御窗口仍生效');
	});

	test('往返②【零回归】：非主角且无运行态 ⇒ `toJSON` **不写**这两个新键（逐字节快照断言不受影响）', () => {
		const 路人 = 角色('路人', 5);
		const 快照 = 路人.toJSON();
		assert.eq('isProtagonist' in 快照, false, '★非主角不写 isProtagonist 键');
		assert.eq('runtime' in 快照, false, '★空运行态不写 runtime 键');
	});

	test('roundLimit①【随条目带出・缺省 8】：层表行声明，条目可覆写', () => {
		/* ★真驱动面：注册层表（`registerLayerMeta`）＋遭遇表（`registerEncounterTable`）⇒ 真跑 `rollEncounter`。 */
		const 层 = 'unit-1934';
		R().registerLayerMeta('unit-1934-grp', [{ id: 层, type: 'climb' }]);
		R().registerEncounterTable('unit-1934-grp', {
			[层]: { roundLimit: 6, encounters: [{ ref: 'goblin', weight: 1, roundLimit: 3 }] },
		});
		const 抽出 = R().rollEncounter(层, { count: 1, tableId: 'unit-1934-grp' });
		assert.eq(抽出.length, 1, '★应抽到一条（层与表都在册）');
		assert.eq(抽出[0].roundLimit, 3, `★条目声明优先（层表 6／条目 3 ⇒ 取 3；实得 ${抽出[0].roundLimit}）`);
		/* 默认：层表与条目都没写 ⇒ **8**（§2.8 原文「当前 fight() 固定创建 8 回合」） */
		R().registerEncounterTable('unit-1934-def', { [层]: { encounters: [{ ref: 'goblin', weight: 1 }] } });
		const 默认 = R().rollEncounter(层, { count: 1, tableId: 'unit-1934-def' });
		assert.eq(默认[0].roundLimit, 8, `★都没有声明时取缺省 8（实得 ${默认[0].roundLimit}）`);
	});
})();
