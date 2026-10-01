/* D3（#1777／#1731 三段弹药）：有道具背书的存量 ⇒ **道具真值 / 角色侧派生视图**（A 裁定）
 *
 * §十.5 两层：发生面＝item 快照 `charges`；汇总面＝角色 `stats.firearmAmmo`（本票新增）。
 * ★A 裁定「谁产生谁真值、禁止双写」⇒ 角色侧是**派生视图**，其**唯一写点**是按道具**重算**
 *   （`RPG.syncDerivedStocks`），✗ 两层各自递减（会漂移且无事可判）。
 *
 * ★本文件的头三格**必须**用**真货**（`musket` / `bullets-firearm`）：存量声明绑的是**真 id**
 *   （`derivedFrom:{itemId:'bullets-firearm'}`）——我首版用自造 id ⇒ `syncDerivedStocks` 认不出
 *   ⇒ 三格全红。**红得对**：自造 id 本就不该被这条存量认领（口径即「认领看 itemId」）。
 */
(() => {
	const R = () => setup.RPG, D = () => setup.DND5E;
	const ID = 'firearmAmmo';
	const BULLET = 'bullets-firearm', GUN = 'musket';

	/** 带真火器＋真子弹的角色（子弹袋按 `charges` 给发数） */
	const CH = (bullets, name = '甲') => new (R().Character)({
		name, hp: 30, maxHp: 30, stats: D().stats({}),
		items: bullets == null ? null
			: [{ id: GUN, charges: null, equipped: true }, { id: BULLET, charges: bullets }],
	});
	/** 一个像样的靶（attack 需要 hp/AC 等） */
	const FOE = () => new (R().Character)({ name: '靶', hp: 50, maxHp: 50, stats: D().stats({}) });

	test('A 裁定（道具侧）：开火扣**道具真值** ⇒ 派生视图**跟随重算**（✗ 两层各自递减）', () => {
		const c = CH(4);
		c.stats[ID] = R().heldTotal(c, BULLET);                 // 视图初值＝真值
		assert.eq(JSON.stringify([c.stats[ID], R().heldTotal(c, BULLET)]), '[4,4]', '前置：视图＝真值');

		const r = R().act(c, GUN, FOE(), 'use', c);              // 开火（走统一入口 ⇒ 扣弹在入口层）
		assert.eq(r.status, 'applied', '未拒绝（真值充足）');
		assert.eq(R().heldTotal(c, BULLET), 3, '★**真值**（道具）已减 1');
		assert.eq(c.stats[ID], 3, '★派生视图**跟随重算**为 3（✗ 自己再减一次 ⇒ 会变 2＝双写）');
	});

	test('A 裁定（道具侧）：一袋耗尽 ⇒ 真值与视图**同步归零**（✗ 一方走一方不走）', () => {
		const c = CH(2);
		c.stats[ID] = R().heldTotal(c, BULLET);
		R().act(c, GUN, FOE(), 'use', c);
		R().act(c, GUN, FOE(), 'use', c);
		assert.eq(JSON.stringify([R().heldTotal(c, BULLET), c.stats[ID]]), '[0,0]', '★两侧同归零');
		/* 再开火 ⇒ 弹药不足 ⇒ 拒绝（`#1765` 面既有行为）；此处核**视图**不被搅动 */
		const r = R().act(c, GUN, FOE(), 'use', c);
		assert.eq(r.reason, 'no-ammo', '不足 ⇒ rejected/no-ammo');
		assert.eq(c.stats[ID], 0, '★不足 ⇒ 视图保持 0（✗ 变负/回弹）');
	});

	test('★有道具背书 ⇒ 角色侧**手改会被重算覆盖**（视图性，✗ 独立真值）', () => {
		const c = CH(3);
		c.stats[ID] = 3;
		c.stats[ID] = 999;                                      // 手改视图
		R().syncDerivedStocks(c, BULLET);                        // 按真值重算
		assert.eq(c.stats[ID], 3, '★被真值覆盖 ⇒ 证明它是**派生**的（若为独立真值，此处会留在 999）');
	});
	test('同步归属与边界：无对应道具/无背包/无 actor 事件 ⇒ 不猜（✗ 静默归零）', () => {
		const bullet = BULLET;
		/* ① 角色没这个存量 ⇒ 不碰（✗ 凭空加字段） */
		const thin = new (R().Character)({ name: '瘦', hp: 1, maxHp: 1, stats: { ac: 10 } });
		assert.eq(JSON.stringify(R().syncDerivedStocks(thin, bullet)), '[]', '无存放字段 ⇒ 返 []');
		assert.eq('firearmAmmo' in thin.stats, false, '★确实没被加上');
		/* ② 无背包 ⇒ 取不出真值 ⇒ 保留现值（✗ 归零） */
		const c = new (R().Character)({ name: '乙', hp: 1, maxHp: 1, stats: D().stats({ [ID]: 7 }), items: null });
		assert.eq(R().heldTotal(c, bullet), null, '无背包 ⇒ 真值取不出（null）');
		assert.eq(JSON.stringify(R().syncDerivedStocks(c, bullet)), '[]', '取不出 ⇒ 不改');
		assert.eq(c.stats[ID], 7, '★保留现值（✗ 被当 0 清掉）');
		/* ③ `inventory:changed` **不带 actor** ⇒ 归属不可判 ⇒ 不动视图（走 `syncDerivedStocks(null)` 的构造安全） */
		const d = CH(5);
		d.stats[ID] = 5;
		R().events.emit('inventory:changed', { id: bullet, n: 1, actor: null });   // 归属不明
		assert.eq(d.stats[ID], 5, '★归属不明 ⇒ 不猜（事件不带 actor 时不动）');
		/* ④ 口径一致：`heldTotal` 与 `RPG.take` 同口径（非堆叠每槽 1／堆叠按 charges） */
		const e = new (R().Character)({ name: '戊', hp: 5, maxHp: 5, stats: D().stats({ [ID]: 0 }),
			items: [{ id: bullet, charges: 2 }, { id: bullet, charges: 3 }, { id: bullet, charges: null }] });
		assert.eq(R().heldTotal(e, bullet), 6, '堆叠 2+3 ＋ 非堆叠 1 ＝ 6（同 take 的口径）');
	});

	test('★口径实测：`RPG.take` 的扣减与 `heldTotal` 的重算**逐次相符**（✗ 两套口径漂移）', () => {
		const bullet = BULLET;
		/* 多槽（含堆叠与非堆叠混合）——这是两套口径最容易分岔的地方 */
		const c = new (R().Character)({ name: '己', hp: 9, maxHp: 9, stats: D().stats({}),
			items: [{ id: bullet, charges: 2 }, { id: bullet, charges: null }, { id: bullet, charges: 3 }] });
		for (let i = 0; i < 6; i++) {
			const before = R().heldTotal(c, bullet);
			const ok = R().take(bullet, 1, c);
			const after = R().heldTotal(c, bullet);
			assert.eq(ok, true, `第 ${i + 1} 次扣减成功`);
			assert.eq(after, before - 1, `★take 后 heldTotal 恰减 1（前 ${before} ⇒ 后 ${after}）`);
		}
		assert.eq(R().heldTotal(c, bullet), 0, '扣尽为 0');
		assert.eq(R().take(bullet, 1, c), false, '再扣 ⇒ false（不足）');
	});
})();
