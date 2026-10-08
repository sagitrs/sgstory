/* core/10-item `defItem` ＋ core/30-inventory `itemCountSuffix` —— **声明面（`stats`）在类上可读**（`sgstory#2057`）
 *
 * 病（`books#402` 协查 · 斧头耐久）：`itemCountSuffix`（`30-inventory.js`）读
 *   `RPG.items.get(item.id)?.stats?.durability`，而 `RPG.items.get(id)` 回的是 `defItem` 造的 **Item 子类（类）**；
 *   声明原先只活在 `defItem` 的 `defaults` **闭包**里（类上只挂 `handlers`）⇒ **类上恒读不到** ⇒
 *   斧头／铁铲／矿镐恒印「×6」，而应印「（耐久 N）」。实读（books main ＋ pin `ffd790fd`）：
 *   `R.give('axe')` ⇒ `RPG.inventoryLabel()` = **`斧头×6`** ✗。
 *
 * ★要断三件：
 *   ① **声明可达**：`RPG.items.get(id).stats.durability === true`（类上读得到）；
 *   ② **显示面真生效**（本条的病）：`itemCountSuffix(**快照**)` ⇒ `（耐久 6）` —— ★判据必须用**快照**
 *      （背包里躺的就是它，且**它没有 `stats`** ⇒ 只能靠类那条路 ✓；用实例判会**绕过**本缺陷）；
 *   ③ **零回归**：无声明 ⇒ `×N`；`charges == null` ⇒ 空后缀；采集点（`handlers.gather`）⇒「（还可采 N 次）」
 *      **优先于** durability（顺序即语义）；且类上的 `stats` 是**拷贝**（✗ 与实例共享同一对象）。
 *
 * 刀（记在 `tests/unit/framework/knives.mjs` 的 `item-decl-stats-off`）：摘掉 `klass.stats = …` 那一行 ⇒
 *   ①②（第二条是本笔的病面）须具名红。
 */
(() => {
	const R = () => setup.RPG;
	const J = JSON.stringify;
	const AXE = '__t2057-axe', PLAIN = '__t2057-plain', POINT = '__t2057-point', INF = '__t2057-inf';
	R().defItem({ id: AXE, name: '试斧', stackable: false, charges: 6, stats: { durability: true }, used() { return false; } });
	R().defItem({ id: PLAIN, name: '试件', charges: 3, used() { /* 无声明 */ } });
	R().defItem({ id: INF, name: '无限件', used() { /* charges 缺省 ⇒ null */ } });
	/* ★采集点那一支的判据读**类的** `handlers.gather`（`defItem` 由 `used` ＋ `actions` 合成）
	 *   ⇒ 采集动作要经 `actions:` **入表**（✗ 不是同名的 `handlers:` 键 —— 那个会被当 `defaults` 落到实例上） */
	R().defItem({ id: POINT, name: '试采集点', charges: 5, stackable: false, stats: { durability: true },
		actions: { gather() {} }, used() { return false; } });

	test('#2057 声明面：`stats` 在**类**上可读（`defItem` 的声明 ✗ 只活在闭包里）', () => {
		const 类 = R().items.get(AXE);
		assert.ok(类, '定义应已注册');
		assert.ok(类.stats, `★类上应能读到声明面 \`stats\`（实得 ${J(类.stats)}）—— 闭包里的声明对外不可读即本条之病`);
		assert.eq(类.stats.durability, true, '★声明值应逐字可读');
		/* ★类上的 stats 是**拷贝**：与实例侧各一份（✗ 共享同一对象 ⇒ 一边改会串到另一边） */
		const 件 = R().createItem(AXE);
		assert.ok(件.stats !== 类.stats, '★类上的 stats 与实例的 stats 应是两份（浅拷贝）');
		类.stats.durability = false;
		assert.eq(件.stats.durability, true, '★改类上的声明 ✗ 不得改到已建实例（实例是出生时的快照）');
		类.stats.durability = true;
	});

	test('#2057 显示面：`itemCountSuffix(**快照**)` 须印「（耐久 N）」（✗ 「×N」）', () => {
		/* ★用快照（＝背包里躺的那条）：它**没有** `stats` ⇒ 只有「类上可读」这一条路能救它 */
		const 快照 = { id: AXE, entityId: 'it-t2057', charges: 6, equipped: false };
		assert.eq(R().itemCountSuffix(快照), '（耐久 6）',
			'★快照应印「（耐久 6）」（实得 ' + J(R().itemCountSuffix(快照)) + '）—— 这正是 books#402 协查报的那面');
		assert.eq(R().itemCountSuffix(R().reviveItem(快照)), '（耐久 6）', '★实例侧同形（两条路都绿）');
	});

	test('#2057 零回归：无声明 ⇒ `×N`；无计数概念 ⇒ 空后缀；采集点 ⇒ 优先「（还可采 N 次）」', () => {
		/* ★本格**只**放「与声明无关的既有行为」（零回归面）—— ★✗ 在此放「有声明 ⇒ 耐久形」那类对照：
		 *   那些依赖本笔的修 ⇒ 会把刀的**期望红集**撑宽（刀要咬得**恰恰好**，多咬一格就说明格与格串了）。 */
		assert.eq(R().itemCountSuffix({ id: PLAIN, charges: 3 }), '×3', '无声明 ⇒ 逐字不变「×N」');
		assert.eq(R().itemCountSuffix({ id: INF }), '', '`charges == null` ⇒ 空后缀（逐字不变）');
		assert.eq(R().itemCountSuffix({ id: POINT, charges: 5 }), '（还可采 5 次）', '★采集点那一支**优先**于 durability（顺序即语义）');
	});
})();
