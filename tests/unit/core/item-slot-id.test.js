/* **件号**（`slotId`）—— 道具实例的稳定标识（`sgstory#1914` 增量 3/3 · 步三）。
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

	test('slotId ①：两件同类（同 id 同 charges）各有不同的号', () => {
		State.variables.inventory = [];
		R().give('sword');
		R().give('sword');
		const [a, b] = State.variables.inventory;
		assert.ok(typeof a.slotId === 'string' && a.slotId !== '', `★第一件没有号（slotId=${a.slotId}）`);
		assert.ok(typeof b.slotId === 'string' && b.slotId !== '', `★第二件没有号（slotId=${b.slotId}）`);
		assert.ok(a.slotId !== b.slotId, `★两件同类的号相同（都是 ${a.slotId}）⇒ 只能选到第一件`);
	});

	test('slotId ②：快照往返后号不变（存档往返不丢意图）', () => {
		const 快 = 旧件('sword', 3);
		const 实例 = R().reviveItem(快);
		const 号 = 实例.slotId;
		assert.ok(typeof 号 === 'string' && 号 !== '', `★补发没发生（slotId=${号}）`);
		const 再 = R().reviveItem(实例.toJSON());
		assert.eq(再.slotId, 号, '★往返后号变了 ⇒ 存读档会把意图指丢');
	});

	test('slotId ③：旧档（无号）读入 ⇒ 当场补发，两件同类**各不相同**', () => {
		const 老 = [旧件('sword', 2), 旧件('sword', 2)];      // 同 id 同 charges —— 旧形必判成同一件
		const a = R().reviveItem(老[0]);
		const b = R().reviveItem(老[1]);
		assert.ok(a.slotId && b.slotId, `★旧档补发没发生（${a.slotId} / ${b.slotId}）`);
		assert.ok(a.slotId !== b.slotId,
			`★两件同类被补成了同一个号（${a.slotId}）—— 那是按「id＋charges」回退的写法，旧档必错`);
	});

	test('slotId ④：出口保证「有号」；已有号**原样保留**（✗ 重发）', () => {
		/* 敌方背包里的裸快照（没有号 —— 敌人常由 `new Character({items:[…]})` 直接给出） */
		const 敌 = new (R().Character)({ name: '敌', items: [旧件('sword', 1)] });
		State.variables.inventory = [];
		R().loot(敌);
		const 到手 = State.variables.inventory.find((i) => i.id === 'sword');
		assert.ok(到手, '战利品没进包');
		assert.ok(typeof 到手.slotId === 'string' && 到手.slotId !== '',
			`★经 loot 转移来的件没有号（slotId=${到手.slotId}）`);
		const 号 = 到手.slotId;
		/* 再走一次：已有的号不得被换掉 */
		const 敌2 = new (R().Character)({ name: '敌2', items: [到手] });
		State.variables.inventory = [];
		R().loot(敌2);
		const 再 = State.variables.inventory.find((i) => i.id === 'sword');
		assert.eq(再?.slotId, 号, '★转移时把已有的号换掉了 ⇒ 同一件东西换了号（本席旧话「须重发」是错的）');
	});
})();
