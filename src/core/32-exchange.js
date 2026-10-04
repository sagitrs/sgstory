/* 库存原子交换（sgstory#2008）。无故事价格、货币或资格；只提交纯数据背包。
 * take 的 n 沿用 RPG.take 的库存单位，give 的 n 沿用 RPG.deposit 的新品批数。
 * 接口不印 UI、不执行物品动作；仅提交后发 inventory:changed。普通异常抛出，原背包不变。
 */
RPG.exchange = (actor, offer) => {
	const rejected = (reason, extra = {}) => ({ status: 'rejected', reason, ...extra });
	const bag = actor?.items;
	if (!Array.isArray(bag)) return rejected('no-inventory');
	if (!offer || typeof offer !== 'object') return rejected('invalid-offer');
	const take = offer.take ?? [], give = offer.give ?? [];
	if (!Array.isArray(take) || !Array.isArray(give) || take.length + give.length === 0)
		return rejected('invalid-offer');
	for (const line of [...take, ...give]) {
		if (!line || typeof line.id !== 'string' || !line.id || !Number.isSafeInteger(line.n) || line.n <= 0)
			return rejected('invalid-quantity');
		if (!RPG.items.has(line.id)) return rejected('unknown-item', { id: line.id });
	}
	if (bag.some((s) => !s || typeof s.id !== 'string'
		|| (s.charges != null && (!Number.isSafeInteger(s.charges) || s.charges < 0))))
		return rejected('invalid-inventory');

	// 独立角色也可能带有读档身份；先预留，避免本笔新品撞到剩余原件。
	for (const slot of bag) RPG.noteEntityId(slot.entityId ?? slot.slotId);
	// withdraw／deposit 只改槽的顶层计数；隔离这些槽，不克隆或执行注册对象。
	const staged = bag.map((s) => ({ ...s }));
	for (const line of take) {
		if (!RPG.withdraw(staged, line.id, line.n))
			return rejected('insufficient-items', { id: line.id });
	}
	const received = [];
	for (const line of give) {
		const n = RPG.deposit(staged, line.id, line.n);
		if (!Number.isSafeInteger(n) || n <= 0) return rejected('delivery-failed', { id: line.id });
		received.push({ id: line.id, n });
	}
	if (staged.some((s) => s.charges != null && (!Number.isSafeInteger(s.charges) || s.charges < 0)))
		return rejected('invalid-inventory');
	// 唯一提交点；保留 actor.items 的数组引用及各件的稳定实体身份。
	bag.splice(0, bag.length, ...staged);
	for (const id of new Set([...take, ...give].map((line) => line.id)))
		RPG.events.emit('inventory:changed', { id, actor });
	return { status: 'applied', taken: take.map(({ id, n }) => ({ id, n })), received };
};
