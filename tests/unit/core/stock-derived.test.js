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
	const SB = () => D().STAT_BLOCK;                 // 临时加字段用（用完必清，见各格 finally）
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

	/* ---------- D3 修正（#1796 RC）＋ 自陈缺口 ---------- */

	/* ---------- D3 修正（#1796 RC）＋ 自陈缺口 ---------- */

	/** 临时给本包 STAT_BLOCK 加字段并确保**成对**清理（存量注册表亦清）。
	 *  ★一律用**临时 id**：`defStock(同名)` 会**覆盖真定义**——本席首版在此处用真 id 做「反向」检查，
	 *    把 `firearmAmmo` 的 `derivedFrom` 冲掉了 ⇒ 另一格随之红（**自伤**，非被测物的问题）。 */
	const withFields = (ids, fn) => {
		for (const id of ids) SB()[id] = 0;
		try { return fn(); } finally {
			for (const id of ids) { delete SB()[id]; R().stocks.delete(id); delete D().Environment[id]; }
		}
	};
	const tryDef = (d) => { try { D().defStock(d); return null; } catch (x) { return x; } };

	test('★D3 RC：`derivedFrom` ＋ `scope:"battle"` ⇒ 声明期即被拒（视图与真值不得可漂移）', () => {
		/* 复现（本席实测）：派生视图的真值在**道具**（不随场清），而 battle 档复位会把它按 `initial` 重写
		 *  ⇒ `视图=4/真值=4 → 复位 → 视图=0/真值=4`，**无任何报错**。
		 *  ⇒ 修法＝该组合**声明期即不可表达**（与 B 裁定同手法），✗ 「复位时顺带 sync」（那只是搬第二写点）。 */
		withFields(['__t_rc_x', '__t_rc_a', '__t_rc_b'], () => {
			const e = tryDef({ id: '__t_rc_x', scope: 'battle', initial: 0, derivedFrom: { itemId: 'x' } });
			assert.eq(e?.code, 'STOCK_DERIVED_BATTLE', '★可表达性：声明期即拒（✗ 等运行期静默漂移）');
			/* 反向：去掉任一侧即可声明 ⇒ 禁则**恰**锁那一种组合（✗ 一刀切） */
			assert.eq(tryDef({ id: '__t_rc_a', scope: 'battle', initial: 0 }), null, '仅 battle ⇒ 合法（D2 既有用法）');
			assert.eq(tryDef({ id: '__t_rc_b', derivedFrom: { itemId: 'x' } }), null, '仅 derivedFrom ⇒ 合法（D3 既有用法）');
		});
		/* ★并核对：真声明**未被本格波及**（本席首版正是栽在这——用真 id 做反向检查会把真定义冲掉） */
		const real = R().stocks.get(ID);
		assert.eq(real?.derivedFrom?.itemId, BULLET, '★真声明的 derivedFrom 仍在（本格非破坏性）');
		assert.eq(real?.scope, 'persistent', '★真声明的 scope 仍是 persistent');
	});

	test('★自陈缺口：**非派生**存量不被 `syncDerivedStocks` 触碰（「角色存量即真值」方向的可分辨断言）', () => {
		/* 本笔自陈的 D3 判据缺口：原只测了「无字段⇒返[]」「取不出⇒不改」，**没测**「有非派生存量时 sync 不碰它」。
		 *  ⇒ 缺的正是**另一方向**（无道具背书 ⇒ 角色即真值）的**可分辨**断言：若 sync 误把非派生存量也重算，
		 *     本格必红（✗ 两方向的存量在用例上无从分辨）。 */
		withFields(['__t_self_owned'], () => {
			R().defStock({ id: '__t_self_owned', name: '自有（无道具背书）', scope: 'persistent', initial: 5,
				statBlock: SB(), pack: 'dnd-5e' });
			assert.eq(R().isDerivedStock(R().stocks.get('__t_self_owned')), false, '非派生（无 derivedFrom）');
			const c = CH(4);                                   // 带真子弹 ⇒ 触发 sync 的那个 id 认得
			SB()['__t_self_owned'] = 5;                        // 经 stats() 才在角色身上（本格直接构造）
			c.stats['__t_self_owned'] = 3;                     // 自有存量当前值
			const before = c.stats['__t_self_owned'];
			assert.eq(JSON.stringify(R().syncDerivedStocks(c, BULLET)), JSON.stringify([ID]), '本格前提：sync 认领派生那条');
			assert.eq(c.stats['__t_self_owned'], before, '★非派生存量**原样**（sync 只碰它认领的那条）');
			assert.eq(c.stats[ID], 4, '派生那条**确实**被重算了（否则本格是空转）');
			/* 再经真实通路走一遍（✗ 只直调）—— 自有存量同样不受影响 */
			R().act(c, GUN, FOE(), 'use', c);
			assert.eq(c.stats['__t_self_owned'], before, '★经真实通路后仍原样（同口径）');
			assert.eq(c.stats[ID], 3, '派生那条跟随真值到 3');
		});
	});

	test('★通路 2（tester-4 RC）：`RPG.take` **省略 actor** ⇒ 按**身份**反解归属（✗ 猜、✗ 漂移）', () => {
		/* 复现（本席实测）：`RPG.give('bullets-firearm', -2)` 走的是**省略 actor** 的旧路径
		 *  ⇒ 扣的是 `inv()` ⇒ 视图一侧认不出归属 ⇒ **真值 38 vs 视图 40**（静默漂移）。
		 *  修法＝**按身份**反解：谁的 `items` **就是**刚被扣的那个数组，谁就是归属
		 *  （✗ 用 `playerActor()` 的属性猜 —— 那有 `#1743` 的跨包同名遮蔽）。 */
		const P = R().playerActor();
		assert.ok(P != null, '前提：有玩家角色可解析');
		State.variables.inventory = [{ id: BULLET, charges: 40 }];
		assert.eq(P.items === State.variables.inventory, true, '该角色确以 `inv()` 为背包（按身份可辨）');
		P.items = State.variables.inventory;                 // 显式对齐（本格前提）
		P.stats[ID] = 40;                                    // 视图先＝真值
		R().give(BULLET, -2);                                // ★省略 actor 的消耗路径（旧行为签名不变）
		assert.eq(R().heldTotal(P, BULLET), 38, '真值（背包）已减 2');
		assert.eq(P.stats[ID], 38, '★视图**跟随**为 38（✗ 停在 40 ＝ 漂移）');

		/* ★为何「按身份」总能解析到玩家：玩家的 `items` 是 **getter，桥接到 `inv()`**
		 *  （`dnd-5e/player.js:44-48`：`get: invState`）⇒ 它与 `State.variables.inventory` **恒同一**
		 *  ⇒ 身份反解必命中。⇒ 故「不可判」只在**无玩家角色**或**非全局数组**时发生；
		 *  该分支已由上一格的 `actor:null`（直发事件）覆盖 ⇒ 此处只钉这条**桥接事实**（防后人以为靠名字猜）。 */
		assert.eq(P.items === State.variables.inventory, true, '★玩家 items 恒桥接 inv()（故身份反解必中）');
		/* ★诚实登记本格的**判别力上限**（本席突变电池实测）：把「按身份」换成 `RPG.playerActor()`
		 *  **仍然全绿**（M32）—— 因为在当前引擎里**只有玩家**桥接全局背包 ⇒ 两者**恒指向同一人**
		 *  ⇒「按身份」相对 `playerActor()` 的**唯一优势是将来性**（`#1743` 的跨包同名遮蔽一旦成真，
		 *    按身份仍正确、按 `playerActor()` 会指错），**现阶段无法用用例分辨**。
		 *  ⇒ 故此处**不声称**「按身份已被验证更优」；只声称：归属**可解析**且漂移已被消除（上一段已钉）。 */
	});
})();
