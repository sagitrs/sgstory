/* `#1877` 批次 B（机制修复）—— 物品**合并**（P1-5①）／**增减可见**（N-2）／
 * **战斗道具过滤**（P1-5②，其格在 `battle-interaction.test.js` 同族处）。
 *
 * 动因（操作者第二轮复测原文）：
 *   · 「背包仍显示『石料×1、石料×1』两个独立条目」 ⇒ 同种不合并（P1-5①）
 *   · 「翻找后背包凭空多出『碎石堆×6』（且无获得文案），采集后碎石堆又莫名 -1，增减规则对玩家不可见」 ⇒ N-2
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;
	const H = () => globalThis.__host;
	const inv = () => State.variables.inventory;
	/** 隔离前置：清宿主输出归档 + 干净背包（✗ 依赖上一个用例的残留） */
	const fresh = () => {
		H().host.reset(); H().state.reset();
		State.variables.player = { name: '甲', hp: 20, maxHp: 20, stats: D().stats(), effects: [] };
		State.variables.inventory = [];
		return H().host;
	};

	/* ---------- P1-5① 同种合并 ---------- */

	test('★#1877 P1-5①：`give(id, n)` **首投即并槽** —— 同种恒单条（✗ 「石料×1、石料×1」）', () => {
		fresh();
		R().give('rock', 2);
		assert.eq(inv().filter((s) => s.id === 'rock').length, 1,
			`★同种须单条（操作者复测的病灶＝两个独立条目）：${JSON.stringify(inv())}`);
		assert.eq(inv().find((s) => s.id === 'rock').charges, 2, '★存量守恒（2 件 = charges 2）');
		/* 反向：再来一次仍并进同槽（与首投**同形**） */
		R().give('rock', 3);
		assert.eq(inv().filter((s) => s.id === 'rock').length, 1, '★再次发放仍单条');
		assert.eq(inv().find((s) => s.id === 'rock').charges, 5, '★3 + 2 = 5');
	});

	test('★#1877 P1-5①【对照】**非堆叠**件仍逐件建槽（既有语义 ✗ 被本笔改掉）', () => {
		fresh();
		R().give('coin', 3);                       // `stackable: false`
		assert.eq(inv().filter((s) => s.id === 'coin').length, 3,
			'★非堆叠件＝每件一个独立条目（战利品语义，本笔**不动**）');
	});

	/* ---------- N-2 增减可见 ---------- */

	test('★#1877 N-2：`give` 出声「＋n 名」（✗ 凭空多出）', () => {
		const h = fresh();
		R().give('rock', 2);
		assert.ok(h.lines().some((l) => l.includes('＋2') && l.includes('石料')),
			`★发放须可见：${JSON.stringify(h.lines())}`);
		/* 合并路（已有同类槽）也须出声 —— 两条路径**都要**，✗ 只覆盖首投 */
		const n = h.lines().length;
		R().give('rock', 1);
		assert.ok(h.lines().slice(n).some((l) => l.includes('＋1') && l.includes('石料')),
			`★合并路亦须出声：${JSON.stringify(h.lines().slice(n))}`);
	});

	test('★#1877 N-2：`take` 出声「－n 名」（走 `give(id,-n)` 的负数路）', () => {
		const h = fresh();
		R().give('rock', 5);
		const n = h.lines().length;
		R().give('rock', -2);                       // 负数 ⇒ `RPG.take`
		assert.ok(h.lines().slice(n).some((l) => l.includes('－2') && l.includes('石料')),
			`★消耗须可见：${JSON.stringify(h.lines().slice(n))}`);
		/* ⚠ 不足 ⇒ 整体不生效 ⇒ **✗ 出声**（没有变化就没有提示 —— 「无声明的形」） */
		const m = h.lines().length;
		R().give('rock', -99);
		assert.eq(h.lines().length, m, `★扣减失败**不出声**：${JSON.stringify(h.lines().slice(m))}`);
	});

	test('★#1877 N-2：**采集点自扣**也出声「－1 名」（该路不经 `take` ⇒ 须显式补）', async () => {
		const h = fresh();
		R().give('stone-pile');
		const n = h.lines().length;
		await R().gather('stone-pile');
		const got = h.lines().slice(n);
		assert.ok(got.some((l) => l.includes('－1') && l.includes('碎石堆')),
			`★采集点自扣须可见（操作者的「莫名 -1」）：${JSON.stringify(got)}`);
		assert.ok(got.some((l) => l.includes('＋2') && l.includes('石料')),
			`★产出亦须可见：${JSON.stringify(got)}`);
		assert.eq(inv().find((s) => s.id === 'stone-pile').charges, 5, '★扣 1 次（6 ⇒ 5）');
		assert.eq(inv().find((s) => s.id === 'rock').charges, 2, '★得 2 石料');
	});

	test('★#1877 N-2：采尽的**末次**文案带「（已采尽）」（✗ 让玩家猜还剩几次）', async () => {
		const h = fresh();
		R().give('stone-pile');
		inv().find((s) => s.id === 'stone-pile').charges = 1;   // 只剩 1 次
		R().rng.setSequence(Array.from({ length: 20 }, () => 0.99));
		try { await R().gather('stone-pile'); } finally { R().rng.reset(); }
		assert.ok(h.lines().some((l) => l.includes('－1') && l.includes('已采尽')),
			`★末次须标已采尽：${JSON.stringify(h.lines())}`);
	});
})();
