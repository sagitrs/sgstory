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
		/* ★本格是**判别格**：若实现者把攻击层 7 处裸 `return;` **全改** `return false`，
		 *   本格会红 —— 而那是**新缺陷**：「连打三下没中」会触发 `#1773` 三连护栏强制跳过回合。
		 *   ⇒ 失手是**正常结算的一支**（耗了回合、发了文案），✗ 不是拒绝。 */
		R().give('club'); R().equip('club');
		/* 造一个**必空**的攻击：目标 AC 极高 ⇒ 掷骰必失手（d20 + 命中 < AC）。 */
		const tank = new (R().Character)({ name: '铁壁', hp: 99, maxHp: 99, stats: { ac: 99 } });
		let r = null;
		for (let i = 0; i < 20 && r?.status !== 'applied'; i++) r = R().act(D().Player, 'club', tank);
		assert.eq(r?.status, 'applied', `★失手仍须是 applied（✗ 若判成 rejected ⇒ 三连护栏会误触发）：${JSON.stringify(r)}`);
	});

	/* ★本席自陈：原拟第三条「端到端 `#noteReject` 计数走向」，写成后**只断言一个未变的值**
	 *   （`rejectStreak === 5`）—— 那是**假格**（什么也没验，且会让读者以为该面已被覆盖）。
	 *   ⇒ **撤掉**（✗ 留假保险）。护栏 N=3 的既有覆盖在 `tests/unit/core/turn-economy.test.js`；
	 *   本笔的增量是**返回值契约**，由 ①② 成对把守（① 拒绝可判／② 失手✗被误判）即可闭合。 */
})();
