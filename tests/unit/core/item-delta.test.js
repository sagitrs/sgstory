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
		/* ⚠ 样本用 `iron-key`（`charges: null, stackable: false`）—— ★本席原先用 `coin`，
		 *   rebase 到 main 后**当场红**：`#1880` 已把 coin 改成**计数库存形**（`#1877` N-3 前置件）
		 *   ⇒ 它不再是「非堆叠件」的样本。⇒ 换样本（✗ 改断言去迁就）。 */
		fresh();
		R().give('iron-key', 3);
		assert.eq(inv().filter((s) => s.id === 'iron-key').length, 3,
			'★非堆叠件＝每件一个独立条目（本笔**不动**该语义）');
	});

	/* ---------- P1-5① 判据单点（★`dev-9` 阻断①）---------- */

	test('★#1877 P1-5①【三路一致】玩家 `give`／同伴 `deliverYields`／`loot` **形态须一致**', () => {
		/* ★立档理由（`dev-9` 阻断①）：本笔把 `give` 的首投改成**单槽**后，
		 *   `deliverYields` 的**同伴/怪物分支**仍是旧形（无同类槽 ⇒ `for(i<n) push` ⇒ n 个槽）
		 *   ⇒ **同一 id、同一 n，因 `who` 不同而形态分叉**（玩家「石料×2」1 槽 / 同伴「石料×1、石料×1」2 槽），
		 *   而下游 `take`／`count()` 按**总量**读 ⇒ 两边对不上。本格把「三路一致」钉住。
		 *   ⚠ 三路**语义**不同（前两者造新件／`loot` 转移快照），但**形态**（槽数与 charges）须一致 ——
		 *     判据由 `RPG.canStack(def)` 单点回答（✗ 三处各写一遍，那正是 `#1844` 的教训）。 */
		fresh();
		/* ① 玩家路 */
		R().give('rock', 2);
		const 玩家 = JSON.stringify(inv());
		/* ② 同伴路（`bag !== State.variables.inventory` ⇒ 走 `deposit`） */
		const companion = { name: '同伴', hp: 10, items: [] };
		R().deliverYields(companion, [{ id: 'rock', n: 2 }], '测试');
		const 同伴 = JSON.stringify(companion.items);
		/* ③ 战利品路（快照转移，件数口径 `charges ?? def.charges ?? 1`） */
		fresh();
		const foe = new (R().Character)({ name: '哥布林', hp: 0,
			items: [{ id: 'rock' }, { id: 'rock' }] });
		R().loot(foe);
		const 战利品 = JSON.stringify(inv());
		/* 三路的 id 不同（rock/rock/rock），比**形状**：都须是单槽且 charges 2 */
		const 形状 = (json) => json.replace(/"id":"[^"]+"/, '"id":"X"');
		assert.eq(形状(同伴), 形状(玩家),
			`★同伴路形态须与玩家路一致（✗ 因 who 分叉）：${同伴} vs ${玩家}`);
		assert.eq(inv().find((s) => s.id === 'rock').charges, 2, '★战利品路亦单槽 charges 2');
		assert.eq(inv().filter((s) => s.id === 'rock').length, 1, '★战利品路单槽');
	});

	test('★#1877 P1-5①【判据单点】`RPG.canStack` —— 三路共用同一谓词（✗ 各写一遍）', () => {
		/* 判据＝`stackable **且** charges != null`（两者缺一即「每件一个独立条目」）。 */
		const D3 = () => setup.DND3;
		assert.eq(R().canStack(R().createItem('rock')), true, '资源（stackable ＋ charges）⇒ 可叠加');
		assert.eq(R().canStack(R().createItem('iron-key')), false, '钥匙（charges null）⇒ 不可叠加');
		assert.eq(R().canStack(null), false, '无 def ⇒ 判否（✗ 抛错 —— 调用方在缺件时也要能问）');
	});

	/* ---------- N-2 增减可见 ---------- */

	/* ---------- P1-5① 战利品路径（★本席 rebase 后发现：`loot` 绕过 `give`）---------- */

	test('★#1877 P1-5①【战利品】`loot` 也并槽 —— ★`coin` 的**唯一**来源就是它（N-3 的另一半）', () => {
		/* ★立档理由：`#1880` 已把 `coin` 改成**计数库存形**（`stackable ＋ charges: 1`，N-3 前置件），
		 *   并在注释里写「真机症状候 P1-5」。本席 rebase 后实测：**那条路仍不合并** ——
		 *   `RPG.loot` 用 `inv().push(s)` **绕过** `RPG.give` ⇒ 硬币永远堆成「旧硬币、旧硬币、旧硬币」
		 *   （`charges != null` 才加 `×N` 后缀，而敌方快照常是**裸 `{ id }`** ⇒ 连后缀都没有，
		 *    实测显示「旧硬币×1、旧硬币×1、旧硬币×1」）。⇒ 本格即 `#1880` 等的那个 P1-5。 */
		const h = fresh();
		const foe = new (R().Character)({ name: '哥布林', hp: 0,
			items: [{ id: 'coin' }, { id: 'coin' }, { id: 'coin' }] });
		R().loot(foe);
		assert.eq(inv().filter((s) => s.id === 'coin').length, 1,
			`★战利品同类须并槽（✗ 绕过 give 就堆三条）：${JSON.stringify(inv())}`);
		assert.eq(inv().find((s) => s.id === 'coin').charges, 3, '★3 枚 ⇒ charges 3（且**须写进快照**，否则显示层认不出）');
		assert.ok((R().inventoryLabel?.() ?? '').includes('旧硬币×3'),
			`★显示层须出 ×3（这正是 N-3 要的）：${R().inventoryLabel?.()}`);
		assert.ok(h.lines().some((l) => l.includes('旧硬币')), '获得文案仍在（既有行为）');
	});

	test('★#1877 P1-5①【战利品·反例】用过的件**不得回满**（✗ 换用 `RPG.give` 会按 def 重造）', () => {
		/* ⚠ 本格钉的是**修法的边界**：`loot` 转移的是**快照本身**（保留**剩余次数**），
		 *   而 `RPG.give` 会按 `def.charges` 造**新**快照 ⇒ 换成它会把「用过的绷带」回满。
		 *   （绷带 `charges: 2` ⇒ 快照 `charges: 1` ＝ 用过一袋。） */
		fresh();
		const foe = new (R().Character)({ name: '哥布林', hp: 0,
			items: [{ id: 'bandage', charges: 1 }, { id: 'bandage', charges: 1 }] });
		R().loot(foe);
		const total = inv().filter((s) => s.id === 'bandage').reduce((n, s) => n + (s.charges ?? 1), 0);
		assert.eq(total, 2, `★合计须为 2（✗ 回满成 4 ⇒ 那是件数造假）：${JSON.stringify(inv())}`);
	});

	test('★#1877 P1-5①【战利品·对照】非堆叠件原样转移；**装备件仍不掉落**', () => {
		fresh();
		const foe = new (R().Character)({ name: '哥布林', hp: 0, items: [
			{ id: 'stone-pile', charges: 6 },      // 非堆叠 ⇒ 原样（含剩余 6 次）
			{ id: 'coin' },                        // 堆叠 ⇒ 落槽
			{ id: 'club', equipped: true },        // 装备 ⇒ ✗ 不掉落（既有规则）
		] });
		R().loot(foe);
		const pile = inv().find((s) => s.id === 'stone-pile');
		assert.eq(pile?.charges, 6, '★非堆叠件原样转移（剩余次数保留）');
		assert.ok(!inv().some((s) => s.id === 'club'), '★装备件不掉落（既有语义，本笔不动）');
	});

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
