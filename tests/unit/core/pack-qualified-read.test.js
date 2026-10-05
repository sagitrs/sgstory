/* `sgstory#1743` A₁ 支：**包限定读** —— 同 id 跨包时按包取该包自己的那件（✗ 不靠装载序）
 *
 * 病灶：两包共用一张 id 表（`RPG.items`）⇒ 同 id 后者**静默遮蔽**前者（台账 10 例）。
 * 本支给「取用面」的解法（「命名空间」那条路的第一步）：
 *   ① 件**带包标**（角色面那套 `stats[Symbol.for('rpg.pack.*')]`）⇒ 按标记判；
 *   ② 否则（**道具面现状：74 件 0 标**）⇒ 在**该包命名空间**里按「导出名 ↔ id」约例反查；
 *   ③ 判不出 ⇒ `undefined` ＋ **记入未命中台账**（✗ 不静默、✗ 不回落给别包那件）。
 * ★B 支（注册 API 知其包、道具补包标、逐项删台账）候 0.0.3 设计窗 ⇒ 本格 ✗ 不涉。
 *
 * ## 判据（五臂，★都读**真注册表/真命名空间**，✗ 不读源码文本）
 *   ①② 真冲突件 `club` ⇒ 两包各取到**各自**的类，且**逐字等于**该包导出面那一支（`setup.DND3.Club`／`setup.DND5E.Club`）；
 *   ③ **零回归**：`RPG.items.get('club')` 调用前后**同一引用**（本支纯新增）；
 *   ④ **不回落**：没有该包的件 ⇒ `undefined`；
 *   ⑤ **未命中台账**：对着**现存的 6 个真冲突道具**跑两包 ⇒ 台账须**空**（＝现状这 6 件都循「导出名↔id」约例 ✓；有不循例的才会记一笔）。
 */
(() => {
	const R = () => setup.RPG;
	const 六件 = ['bandage', 'bomb', 'boots', 'club', 'coin', 'sword'];   // 台账里的 items 6 例

	test('★#1743 A①：同 id `club` 两包各取其件（dnd3 ≠ dnd-5e，且都不是 undefined）', () => {
		const a = R().items.按包('dnd3', 'club'), b = R().items.按包('dnd-5e', 'club');
		assert.ok(a, '★dnd3 侧须取到 club（✗ undefined ⇒ 按包读没落地）');
		assert.ok(b, '★dnd-5e 侧须取到 club');
		assert.ok(a !== b, '★两包各一件 ⇒ 须是两个不同的类（跨版同物＝两对象各自 pin，`#1712`）');
	});

	test('★#1743 A②：取到的**就是那一包导出面**的那一支（逐字同一引用）', () => {
		assert.eq(R().items.按包('dnd3', 'club'), setup.DND3.Club, 'dnd3 侧须＝setup.DND3.Club');
		assert.eq(R().items.按包('dnd-5e', 'club'), setup.DND5E.Club, 'dnd-5e 侧须＝setup.DND5E.Club');
	});

	test('★#1743 A③：零回归 —— `items.get` 调用前后**同一引用**（本支纯新增）', () => {
		const 前 = R().items.get('club');
		R().items.按包('dnd3', 'club'); R().items.按包('dnd-5e', 'club'); R().items.按包('d20m', 'club');
		assert.eq(R().items.get('club'), 前, '★`get` 语义须逐字不变（按 id 取＝装载序最后注册的那件）');
	});

	test('★#1743 A④：无该包的件 ⇒ undefined（✗ 不回落给别包那件）', () => {
		assert.eq(R().items.按包('d20m', 'club'), undefined, '★d20m 没有 club ⇒ 须 undefined');
		assert.eq(R().items.按包('dnd3', '不存在的件'), undefined, '未注册的 id ⇒ undefined');
	});

	/** ★**已登记的「不循例」集**（棘轮）：现查 2 条 —— `coin`／`sword` 在 **dnd-5e** 侧没有「导出名 ↔ id」可判的类
	 *  （其定义不遵该约例）⇒ 按领队令**入池记**（✗ 不为它们硬造规则）；本臂保证**只少不增**：新增不循例件 ⇒ 红。 */
	const 已登记不循例 = [
		{ 包: 'dnd-5e', id: 'coin' }, { 包: 'dnd-5e', id: 'sword' },
	];

	test('★#1743 A⑤：现存 6 件冲突道具的两包可判性**恰如登记**（棘轮：✗ 不许新增不循例件）＋ 角色面同形', () => {
		未清台账();
		for (const id of 六件) { R().items.按包('dnd3', id); R().items.按包('dnd-5e', id); }
		const 得 = R().items.未命中().map((x) => `${x.包}／${x.id}`).sort();
		const 期 = 已登记不循例.map((x) => `${x.包}／${x.id}`).sort();
		assert.eq(JSON.stringify(得), JSON.stringify(期),
			`★未命中集须恰等于已登记的不循例集（实得 ${JSON.stringify(得)}｜期望 ${JSON.stringify(期)}）——`
			+ ' 多的那几条＝本支判不出归属的件 ⇒ 请记进池（✗ 静默放过）；少的＝已可判 ⇒ 请从登记里删');
		/* 角色面走包标那条路（10 例里的 4 例：player／goblin／goblin-boss／guard） */
		const 角 = R().characters.按包('dnd3', 'goblin'), 角5 = R().characters.按包('dnd-5e', 'goblin');
		assert.ok(角 && 角5 && 角 !== 角5, '★角色面同形：两包 goblin 各取其件');
	});

	/** 台账只增不清（设计如此）⇒ 判据开始时把它清掉，只判本格这几跑。★清法由 API 自己给（✗ 直接摸内部数组）。 */
	function 未清台账() {
		const f = R().items.清未命中;
		if (typeof f === 'function') { f(); return; }
		assert.ok(false, '★缺 `RPG.items.清未命中`（判据要能复位台账，否则读数受他格污染）');
	}
})();
