/* **件号**（`entityId`）—— 道具实例的稳定标识（`sgstory#1914` 增量 3/3 · 步三）。
 *
 * 为什么需要它：本增量要求「重复行动」指**同一件**东西、且把所选件**序列化**进意图
 *   （`{actorId, itemSlotId, actionId, targetId, requestId}`）。现有快照只有 `{id, charges, equipped}`
 *   ⇒ **两把同耐久的长剑区分不出** ⇒ 只能用**下标** ✗ —— 而下标会在「取件 ⇒ 插入/丢失 ⇒ 再取」时漂移。
 *
 * 判据（每条先写先跑，**在改动前的现码上红**）：
 *   ① 两件同类（同 id、同 charges）各有**不同**的号。
 *   ② 快照往返（`toJSON` → `reviveItem`）后号**不变**（否则存档往返就把意图指丢了）。
 *   ③ **旧档**（无号的快照，`#1914` 之前存的）读入 ⇒ 当场**补发**，且两件同类**各不相同**
 *      —— ✗ 不得按「`id` ＋ `charges`」当成同一件（那正是旧档里两件同类会被判成一件的成因）。
 *   ④ 入包**唯一出口**保证「有号」：经 `loot` 转移来的件也有号；**已有的号原样保留**（✗ 重发）。
 *      ★本席更正交接简报里的一句旧话：曾写「`loot` 转移快照须**重发**」—— 那是错的。号源是**全局**
 *      唯一，转移不产生碰撞；重发反而**破坏「同一件东西」的同一性**（玩家会看到同一把剑换了号）。
 */
(() => {
	const R = () => setup.RPG;

	/** 造一个「无号」的旧档快照（模拟 `#1914` 之前存下的档）。 */
	const 旧件 = (id, charges) => ({ id, charges, equipped: false });

	test('entityId ①：两件同类（同 id 同 charges）各有不同的号', () => {
		State.variables.inventory = [];
		R().give('sword');
		R().give('sword');
		const [a, b] = State.variables.inventory;
		assert.ok(typeof a.entityId === 'string' && a.entityId !== '', `★第一件没有号（entityId=${a.entityId}）`);
		assert.ok(typeof b.entityId === 'string' && b.entityId !== '', `★第二件没有号（entityId=${b.entityId}）`);
		assert.ok(a.entityId !== b.entityId, `★两件同类的号相同（都是 ${a.entityId}）⇒ 只能选到第一件`);
	});

	test('entityId ②：快照往返后号不变（存档往返不丢意图）', () => {
		const 快 = 旧件('sword', 3);
		const 实例 = R().reviveItem(快);
		const 号 = 实例.entityId;
		assert.ok(typeof 号 === 'string' && 号 !== '', `★补发没发生（entityId=${号}）`);
		const 再 = R().reviveItem(实例.toJSON());
		assert.eq(再.entityId, 号, '★往返后号变了 ⇒ 存读档会把意图指丢');
	});

	test('entityId ③：旧档（无号）读入 ⇒ 当场补发，两件同类**各不相同**', () => {
		const 老 = [旧件('sword', 2), 旧件('sword', 2)];      // 同 id 同 charges —— 旧形必判成同一件
		const a = R().reviveItem(老[0]);
		const b = R().reviveItem(老[1]);
		assert.ok(a.entityId && b.entityId, `★旧档补发没发生（${a.entityId} / ${b.entityId}）`);
		assert.ok(a.entityId !== b.entityId,
			`★两件同类被补成了同一个号（${a.entityId}）—— 那是按「id＋charges」回退的写法，旧档必错`);
	});

	/** 取最大号（**按数值**比 —— ✗ 字典序：`'it-10' < 'it-9'` 会骗人）。 */
	const 最大号 = (袋) => (袋 ?? []).map((s) => s.entityId).filter(Boolean)
		.map((id) => Number(String(id).replace(/^it-/, ''))).filter(Number.isFinite)
		.reduce((m, n) => Math.max(m, n), 0);

	test('entityId ⑤【配对不变式】删最高号件 ⇒ 新投递 !== 旧号；**存档往返后再走一遍**', () => {
		/* ★本条的由来：`dev-9` 在 `#1915` 的合流裁定里点名「**槽位号不复用**」必须活到合流后，
		 *   且要求**两条配对**（✗ 只断「互异」—— 那会被「计数器被移出存档」这类改法骗过）。 */
		const 走一遍 = (标) => {
			const 前 = State.variables.inventory.map((s) => s.entityId);
			const 最高 = 最大号(State.variables.inventory);
			State.variables.inventory = State.variables.inventory.filter((s) => s.entityId !== `it-${最高}`);
			R().give('sword');
			const 新 = State.variables.inventory.map((s) => s.entityId).find((id) => !前.includes(id));
			assert.ok(新, `${标}：新投递没有拿到号（${JSON.stringify(State.variables.inventory)}）`);
			/* ★断言取「**不在既有集合里**」，✗ 只断「≠ 被删的那个」：
			 *   本席实测——只断「≠旧最高」时，把计数器**清零**（＝高水位不跨往返）照样绿
			 *   （重发 it-1 恰不等于旧最高 it-3）⇒ 那正是 `dev-9` 警告的「只断互异会被骗过」。 */
			const 既 = new Set(State.variables.inventory.map((s) => s.entityId).filter((x) => x !== 新));
			assert.ok(!既.has(新), `${标}：**新号撞上了既有件**（新=${新}）—— 号被复用了`);
			assert.ok(新 !== `it-${最高}`, `${标}：**号被复用了**（新=${新}／旧最高=it-${最高}）`);
		};
		State.variables.inventory = [];
		R().give('sword'); R().give('sword'); R().give('rock');
		走一遍('删最高号件后');
		/* ★存档往返：整袋走一遍 `toJSON` → `reviveItem`，再走同一断言 */
		State.variables.inventory = State.variables.inventory.map((s) => R().reviveItem(s).toJSON());
		走一遍('存档往返后');
	});

	test('entityId ④：出口保证「有号」；已有号**原样保留**（✗ 重发）', () => {
		/* 敌方背包里的裸快照（没有号 —— 敌人常由 `new Character({items:[…]})` 直接给出） */
		const 敌 = new (R().Character)({ name: '敌', items: [旧件('sword', 1)] });
		State.variables.inventory = [];
		R().loot(敌);
		const 到手 = State.variables.inventory.find((i) => i.id === 'sword');
		assert.ok(到手, '战利品没进包');
		assert.ok(typeof 到手.entityId === 'string' && 到手.entityId !== '',
			`★经 loot 转移来的件没有号（entityId=${到手.entityId}）`);
		const 号 = 到手.entityId;
		/* 再走一次：已有的号不得被换掉 */
		const 敌2 = new (R().Character)({ name: '敌2', items: [到手] });
		State.variables.inventory = [];
		R().loot(敌2);
		const 再 = State.variables.inventory.find((i) => i.id === 'sword');
		assert.eq(再?.entityId, 号, '★转移时把已有的号换掉了 ⇒ 同一件东西换了号（本席旧话「须重发」是错的）');
	});
})();
