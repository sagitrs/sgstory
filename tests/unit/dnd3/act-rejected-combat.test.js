/* `#1813` 笔 1（dnd3）：`used()` 层**攻击结算拒绝**须**可判** —— 与 `dnd-5e`／`d20m` 同笔
 *
 * 缺陷：攻击层在「打不出去」（腾不出手／没弹药）时**只 `return;`**（`undefined`）⇒ `#1776` 契约
 *   把它算作 **`applied`** ⇒ `40-battle.js #noteReject` **清零 `rejectStreak`** ⇒ `#1773` 的
 *   三连拒绝护栏在这一面**失效**。
 * 本笔：攻击层 4 处「拒绝」改 `return false`，**并**让 13 件武器的 `used()` **转发**该返回值
 *   —— ★任一侧单独改**无效**（返回值被丢弃）。
 *
 * ★本档的**判别格是对照格**（②）：只有它能照出「把**失手**也当拒绝」的错误实现。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;
	const mkFoe = () => new (R().Character)({ name: '靶', hp: 99, maxHp: 99, stats: { ac: 10 } });

	test('★#1813 ①（正例·腾出手）：持 A 用未装备的 B ⇒ `rejected/action-refused`（✗ 算作推进）', () => {
		R().give('sword'); R().equip('sword');      // A：已握在手里
		R().give('club');                            // B：未装备 ⇒ 腾不出手
		const r = R().act(D().Player, 'club', mkFoe());
		assert.eq(r?.status, 'rejected', `★拒绝须**可判**（✗ 被算作 applied）：${JSON.stringify(r)}`);
		assert.eq(r?.reason, 'action-refused', '理由为动作自己拒绝');
	});

	test('★★#1813 ②（对照·挥空）：攻击**已发生**只是没中 ⇒ 必须仍为 `applied`', () => {
		/* ★本格是**对照格**：钉「失手 ✗ 拒绝」。若实现者把攻击层裸 `return;` **全改** `return false`，
		 *   本格会红 —— 而那是**新缺陷**（「连打三下没中」会触发 `#1773` 三连护栏强制跳过回合）。
		 *
		 * ⚠⚠ **本格首版是**概率格**，已按 D 席（`dev-9`）RC 重写**：首版用「目标 AC 极高 ⇒ 必失手」＋
		 *   `for` 循环最多 20 次 —— **两处都错**：
		 *     ① 天然 20 **绕过**失手分支（`die < critMin` 不成立 ⇒ 命中）⇒ 「AC 极高必失手」**不成立**；
		 *     ② `for` 循环恰在「1/20 命中那次」退出并断言绿 ⇒ 突变下 **3/8 次仍绿**（实测）—— **概率格**。
		 *   ⇒ 改为**确定性**：注入 `rng` 序列（掷骰恒 1）＋ **单次** `act`，并加**前置断言**
		 *     「靶确实没掉血」以证这次走的**正是**失手路径（范本：既有 `#1783 ⑨`，`tests/unit/core/slot-equip-refused.test.js:135`）。 */
		R().give('coin');                                   // 先初始化背包（供 give/revive 路径）
		const p = new (R().Character)({ name: '甲', hp: 20, maxHp: 20,
			items: [{ id: 'sword', equipped: true, charges: null, effects: [] }], stats: { ac: 12 } });
		p.effects = [];                                     // `traumaAttackMod` 会读它
		const foe = new (R().Character)({ name: '靶', hp: 10, maxHp: 10,
			items: [{ id: 'coin' }], stats: { ac: 25 } });
		/* ★掷骰恒 1 ⇒ **确定**失手（`1 + mod < 25`）。
		 * ★长度理由（`sgstory#1953`）：「失手」**不等于这一回合不再抽随机数** —— 敌方仍要出手、
		 *   命中判定后还有伤害骰 ⇒ 一个完整回合**至少**再来几次。旧形只给 4 个 ⇒ 抽到尽时报
		 *   `RPG.rng：注入序列已耗尽`（被本档的 catch 接住 ⇒ 不红 ✗ 但成了**潜在陷阱**：
		 *   接住面一收窄它就变崩）。⇒ 取**上限式**：够跑完一整回合且留余量；值仍是 0.0（语义不变 ✓）。 */
		R().rng.setSequence(Array.from({ length: 64 }, () => 0.0));
		try {
			const r = R().act(p, 'sword', foe, 'use');
			assert.eq(foe.hp, 10, '前置：确实**没命中**（靶未掉血）⇒ 本格测的正是「挥空」这条路径');
			assert.eq(r?.status, 'applied', `★失手仍须是 applied（✗ 判成 rejected ⇒ 三连护栏会误触发）：${JSON.stringify(r)}`);
		} finally {
			R().rng.reset();                                // 测试卫生：rng 用完必复位
		}
	});

	/* ★本席自陈：原拟第三条「端到端 `#noteReject` 计数走向」，写成后**只断言一个未变的值**
	 *   （`rejectStreak === 5`）—— 那是**假格**（什么也没验，且会让读者以为该面已被覆盖）。
	 *   ⇒ **撤掉**（✗ 留假保险）。护栏 N=3 的既有覆盖在 `tests/unit/core/turn-economy.test.js`；
	 *   本笔的增量是**返回值契约**，由 ①② 成对把守（① 拒绝可判／② 失手✗被误判）即可闭合。 */
})();
