/* core/32-exchange；由既有 manifest 发现，测试同发布包装。 */
(() => {
	const R = () => setup.RPG;
	const bag = (...slots) => ({ items: slots });
	const snap = (a) => JSON.stringify(a.items);
	const total = (a, id) => R().heldTotal(a, id);
	const offer = { take: [{ id: 'coin', n: 10 }], give: [{ id: 'bandage', n: 1 }] };

	test('exchange：一次提交，保留背包引用、剩余身份／状态与默认充能口径', () => {
		const a = bag({ id: 'coin', charges: 15, entityId: 'it-900' },
			{ id: 'club', equipped: true, entityId: 'it-901' });
		const original = a.items;
		const r = R().exchange(a, offer);
		assert.eq(r.status, 'applied');
		assert.eq(a.items, original);
		assert.eq(total(a, 'coin'), 5);
		assert.eq(total(a, 'bandage'), 2, '发放一批是定义默认两次，不是单次');
		assert.eq(a.items[0].entityId, 'it-900');
		assert.eq(a.items[1].entityId, 'it-901');
		assert.eq(a.items[1].equipped, true);
		assert.eq(JSON.stringify(r.received), JSON.stringify([{ id: 'bandage', n: 2 }]));
	});

	test('exchange：不足及重复输入总量不足，不半扣、不半发', () => {
		const a = bag({ id: 'coin', charges: 9, entityId: 'it-902' });
		const before = snap(a);
		assert.eq(R().exchange(a, offer).reason, 'insufficient-items');
		assert.eq(snap(a), before);
		const r = R().exchange(a, { take: [{ id: 'coin', n: 5 }, { id: 'coin', n: 5 }], give: offer.give });
		assert.eq(r.reason, 'insufficient-items');
		assert.eq(snap(a), before);
	});

	test('exchange：未知定义与非法参数整笔拒绝', () => {
		const a = bag({ id: 'coin', charges: 99 });
		for (const value of [null, {}, { take: {} }, { give: [{ id: 'missing-unit-exchange', n: 1 }] },
			...[-1, 0, 0.5, NaN, Infinity, '1', Number.MAX_SAFE_INTEGER + 1].map((n) => ({ take: [{ id: 'coin', n }], give: offer.give }))]) {
			const before = snap(a);
			assert.eq(R().exchange(a, value).status, 'rejected');
			assert.eq(snap(a), before);
		}
		assert.eq(R().exchange({}, offer).reason, 'no-inventory');
		assert.eq(R().exchange(bag({ id: 'coin', charges: -2 }), offer).reason, 'invalid-inventory');
	});

	test('exchange：投递异常仍抛，所有已暂扣／暂发都不提交', () => {
		const a = bag({ id: 'coin', charges: 99 });
		const before = snap(a), deposit = R().deposit;
		let calls = 0, caught = false;
		try {
			R().deposit = (...args) => { if (++calls === 2) throw new Error('unit-delivery'); return deposit(...args); };
			try { R().exchange(a, { take: offer.take, give: [{ id: 'bandage', n: 1 }, { id: 'ration', n: 1 }] }); }
			catch (e) { caught = e.message === 'unit-delivery'; }
		} finally { R().deposit = deposit; }
		assert.ok(caught, '普通程序异常不可吞掉');
		assert.eq(snap(a), before);
	});

	test('exchange：投递返回零时拒绝，不提交支付', () => {
		const a = bag({ id: 'coin', charges: 99 }), before = snap(a), deposit = R().deposit;
		try {
			R().deposit = () => 0;
			assert.eq(R().exchange(a, offer).reason, 'delivery-failed');
		} finally { R().deposit = deposit; }
		assert.eq(snap(a), before);
	});

	test('exchange：多种输入输出、同 id 交换及独立角色背包', () => {
		const a = bag({ id: 'coin', charges: 10 }, { id: 'wood', charges: 2 });
		const playerBefore = JSON.stringify(State.variables.inventory);
		const r = R().exchange(a, { take: [{ id: 'coin', n: 3 }, { id: 'wood', n: 2 }],
			give: [{ id: 'coin', n: 1 }, { id: 'ration', n: 2 }] });
		assert.eq(r.status, 'applied');
		assert.eq(total(a, 'coin'), 8);
		assert.eq(total(a, 'wood'), 0);
		assert.eq(total(a, 'ration'), 2);
		assert.eq(JSON.stringify(State.variables.inventory), playerBefore);
	});

	test('exchange：非充能槽扣一件，新非堆叠多件各有唯一身份', () => {
		const a = bag({ id: 'iron-key', charges: null, entityId: 'it-903' },
			{ id: 'iron-key', charges: null, entityId: 'it-904' });
		const r = R().exchange(a, { take: [{ id: 'iron-key', n: 1 }], give: [{ id: 'club', n: 3 }] });
		assert.eq(r.status, 'applied');
		assert.eq(total(a, 'iron-key'), 1);
		assert.eq(a.items[0].entityId, 'it-903', '沿用 take 从后往前扣的顺序');
		const ids = a.items.filter((s) => s.id === 'club').map((s) => s.entityId);
		assert.eq(ids.length, 3);
		assert.eq(new Set(ids).size, 3, '非堆叠新品不能复制同一个号');
	});

	test('exchange：独立角色的已有高位身份在发新品前预留', () => {
		const reserved = `it-${R().itemEntitySeq + 1}`;
		const a = bag({ id: 'coin', charges: 20, entityId: reserved });
		assert.eq(R().exchange(a, offer).status, 'applied');
		assert.eq(a.items[0].entityId, reserved);
		assert.ok(a.items.find((s) => s.id === 'bandage').entityId !== reserved, '新品撞到未预留的原件');
	});

	test('exchange：失败静默，成功仅提交后按不同 id 通知', () => {
		const a = bag({ id: 'coin', charges: 15 }), seen = [];
		const off = R().events.on('inventory:changed', (e) => {
			if (e.actor === a) seen.push({ id: e.id, coin: total(a, 'coin'), bandage: total(a, 'bandage') });
		});
		try {
			assert.eq(R().exchange(a, { take: [{ id: 'coin', n: 16 }], give: offer.give }).status, 'rejected');
			assert.eq(seen.length, 0);
			assert.eq(R().exchange(a, { take: [{ id: 'coin', n: 5 }, { id: 'coin', n: 5 }], give: offer.give }).status, 'applied');
			assert.eq(seen.length, 2, '重复输入 id 不能重复发通知');
			assert.ok(seen.every((e) => e.coin === 5 && e.bandage === 2), '通知看到了半笔交易');
		} finally { off(); }
	});

	test('exchange：纯支付、纯发放也经同一提交；接口不印 UI', () => {
		const a = bag({ id: 'coin', charges: 10 });
		const before = __host.host.lines().length;
		assert.eq(R().exchange(a, { take: [{ id: 'coin', n: 4 }] }).status, 'applied');
		assert.eq(R().exchange(a, { give: [{ id: 'wood', n: 2 }] }).status, 'applied');
		assert.eq(total(a, 'coin'), 6);
		assert.eq(total(a, 'wood'), 2);
		assert.eq(__host.host.lines().length, before);
	});
})();
