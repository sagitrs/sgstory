
/* 存量 —— D2（#1777）：`scope` 清理 ＋ 判据 5 的**确定性**（2000 轮 0.000%）＋ E7/E8
 *
 * 判据 6（§十.6）：'battle' 跨 battle:end ⇒ **清**；'persistent' ⇒ **存**；未声明 ⇒ 走缺省且**行为＝既有**。
 * 判据 5 后半：`RPG.rng` 注入固定序列 ⇒ **2000 轮 0.000% 不一致率**。
 * E7：靶＝耗尽事件（C 裁）＋ **两侧各一刀**（A 裁：道具侧 / 角色侧各一个真值面）。
 * E8：`battle:end` 清理。
 */
(() => {
	const R = () => setup.RPG, D = () => setup.DND5E;

	const B = '__t_battle_stock';     // scope: 'battle'（带回执复位值）
	const P = '__t_persist_stock';    // scope: 'persistent'
	const DEF = '__t_default_stock';  // 未声明 scope ⇒ 走缺省
	const IDS = [B, P, DEF];

	/** 临时把三条存量加进两包 STAT_BLOCK（✗ 只加一包：那会被判据 3 的对称守卫抓住——本笔不重复测它） */
	const SB = () => D().STAT_BLOCK;
	const withStocks = (fn) => {
		for (const id of IDS) SB()[id] = 0;
		try {
			D().defStock({ id: B, name: 'battle 档', scope: 'battle', unit: '份', initial: 5 });
			D().defStock({ id: P, name: 'persistent 档', scope: 'persistent', unit: '份' });
			D().defStock({ id: DEF, name: '缺省 scope', unit: '份' });     // ✗ 不给 scope
			return fn();
		} finally {
			for (const id of IDS) { delete SB()[id]; delete D().Environment[id]; R().stocks.delete(id); }
		}
	};
	/** 本包角色（stats 走包的 stats() ⇒ 三条存量都在，✗ 手搓对象） */
	const CH = (over = {}) => new (R().Character)({
		name: '甲', hp: 10, maxHp: 10,
		stats: D().stats({ [B]: 5, [P]: 5, [DEF]: 5, ...over }),
	});

	/* ---------- 判据 6：三态（★三态**各自独立**断言，照 §十.3 与 #1730 三判据） ---------- */

	test('stock scope 三态：battle 跨场⇒复位 ｜ persistent⇒存 ｜ 缺省⇒＝既有（照 conditions 同判据）', () => {
		withStocks(() => {
			const c = CH();
			R().consumeStock(c, B, 3); R().consumeStock(c, P, 3); R().consumeStock(c, DEF, 3);
			assert.eq(JSON.stringify([c.stats[B], c.stats[P], c.stats[DEF]]), '[2,2,2]', '前置：三条都已消耗到 2');

			/* ★判据①（先断言「存」的一侧，防"全清"蒙混）：persistent 与缺省**都不受** battle:end 影响 */
			const q = CH();
			R().consumeStock(q, P, 3); R().consumeStock(q, DEF, 3); R().consumeStock(q, B, 3);
			R().events.emit('battle:end', { players: [q], enemies: [] });
			assert.eq(JSON.stringify([q.stats[P], q.stats[DEF]]), '[2,2]', '★persistent 跨场仍存（值原样）');
			assert.eq(q.stats[B], 5, '★battle 档复位为 initial=5');
			/* 判据③：缺省 ⇒ 行为＝既有（既有＝跨场保留 ⇒ 缺省须为 persistent） */
			assert.eq(R().stocks.get(DEF).scope, 'persistent', '★缺省 scope 确实是 persistent（＝既有行为）');

			/* 判据②：**经真实事件通路**（✗ 直调 clearStocksScoped）＋ 复位不是 delete ⇒ 键仍在 */
			const before = Object.keys(q.stats).sort().join(',');
			assert.ok(Object.keys(q.stats).includes(B), '★键仍在（复位 ✗ 删除）');
			assert.eq(Object.keys(q.stats).sort().join(','), before, '★键集**逐字未变**（⇒ #1697 U9 键集守卫不受影响）');

			/* 跨「两场」：再次耗尽后再跨场，仍复位 ⇒ 幂等 */
			R().consumeStock(q, B, 5);
			assert.eq(q.stats[B], 0, '本场耗空');
			R().events.emit('battle:end', { players: [q], enemies: [] });
			assert.eq(q.stats[B], 5, '★下一场结束仍复位（幂等；✗ 只在首场生效）');
		});
	});

	test('★stock scope：归属过滤 —— 各包只清自己声明的（✗ 首个订阅方代清全部）', () => {
		/* ★本格是**突变电池抓出的真洞的回归**：首版 `clearStocksScoped` 无 `pack` 参 ⇒ 首个触发的订阅方
		 *  会把**所有包**的存量都清掉 ⇒ 每个包的 `battle:end` 接线都**不是承载路径**（拔掉仍绿＝死码）。
		 *  修法＝归属过滤 ＋ core 亦订阅自己那一档（`pack=null`）⇒ 每条接线**各自承载**。 */
		const A = '__t_pk_a', Bb = '__t_pk_b', C = '__t_pk_c';
		for (const id of [A, Bb, C]) SB()[id] = 0;
		try {
			R().defStock({ id: A, scope: 'battle', initial: 9, statBlock: SB(), pack: 'dnd-5e' });
			R().defStock({ id: Bb, scope: 'battle', initial: 9, statBlock: SB(), pack: 'dnd3' });
			const c = new (R().Character)({ name: '甲', hp: 3, maxHp: 3, stats: D().stats({ [A]: 1, [Bb]: 1 }) });
			/* 按 3E 的归属清 ⇒ 只清 dnd3 那条 */
			assert.eq(JSON.stringify(R().clearStocksScoped(c, 'dnd3')), JSON.stringify([Bb]), '★只清 dnd3 档');
			assert.eq(JSON.stringify([c.stats[A], c.stats[Bb]]), '[1,9]', '★dnd-5e 那条**未被代清**');
			/* 按 5E 的归属清 ⇒ 只清 dnd-5e 那条 */
			assert.eq(JSON.stringify(R().clearStocksScoped(c, 'dnd-5e')), JSON.stringify([A]), '★只清 dnd-5e 档');
			assert.eq(JSON.stringify([c.stats[A], c.stats[Bb]]), '[9,9]', '两条各由各自归属清');
			/* `pack=null` ⇒ 只清无归属的（✗ 波及有归属的） */
			R().defStock({ id: C, scope: 'battle', initial: 4, statBlock: SB() });    // ✗ 不给 pack
			const c2 = new (R().Character)({ name: '乙', hp: 3, maxHp: 3, stats: D().stats({ [A]: 1, [C]: 1 }) });
			assert.eq(JSON.stringify(R().clearStocksScoped(c2, null)), JSON.stringify([C]), '★pack=null 只清无归属档');
			assert.eq(c2.stats[A], 1, '★有归属的未被 core 那一档波及');
			/* ★再把 **两条订阅** 经真实事件走一遍（✗ 只直调函数）——一次事件、两条路径、各清各档：
			 *  否则拔掉 core 的 `pack=null` 接线**仍然全绿**（突变电池实测）⇒ 那条接线会成为死码。 */
			const c3 = new (R().Character)({ name: '丙', hp: 3, maxHp: 3, stats: D().stats({ [A]: 1, [C]: 1 }) });
			R().events.emit('battle:end', { players: [c3], enemies: [] });
			assert.eq(JSON.stringify([c3.stats[A], c3.stats[C]]), '[9,4]',
				'★一次事件两条路径：core 清无归属档（C→4）＋ 本包订阅清本包档（A→9）；'
				+ '拔掉任一条 ⇒ 对应那档停在原位 ⇒ 必红');
		} finally {   // ★清理**必须**在 finally：断言抛错若跳过清理，临时字段会漏进 STAT_BLOCK ⇒ 把 U9 键集守卫打红（本席实测踩到）
			for (const id of [A, Bb, C]) { delete SB()[id]; R().stocks.delete(id); }
		}
	});

	test('stock scope：clearStocksScoped 的读数与边界（返被复位 id 列表；无 stats ⇒ 不抛）', () => {
		withStocks(() => {
			const c = CH();
			R().consumeStock(c, B, 1);
			const got = R().clearStocksScoped(c);
			assert.eq(JSON.stringify(got), JSON.stringify([B]), '★读数＝恰好 [被复位的那条]（✗ 含 persistent）');
			/* 边界：容器/跨包角色参战是常态 ⇒ 无 stats 不该抛 */
			assert.eq(JSON.stringify(R().clearStocksScoped({ name: '宝箱' })), '[]', '无 stats ⇒ 返 []（✗ 抛）');
			assert.eq(JSON.stringify(R().clearStocksScoped(null)), '[]', 'null ⇒ 返 []（✗ 抛）');
			/* 边界：本包角色若**没有**该存量字段 ⇒ 不碰（✗ 凭空加字段） */
			const thin = new (R().Character)({ name: '瘦', hp: 1, maxHp: 1, stats: { ac: 10 } });
			assert.eq(JSON.stringify(R().clearStocksScoped(thin)), '[]', '无该字段 ⇒ 不凭空加');
			assert.eq(Object.keys(thin.stats).includes(B), false, '★确实没被加上');
		});
	});

	test('stock scope：battle 档缺 initial ⇒ 声明即被拒（复位值不可猜）', () => {
		SB()[B] = 0;
		try {
			const e = (() => {
				try { D().defStock({ id: B, scope: 'battle' }); } catch (x) { return x; }
			})();
			assert.eq(e?.code, 'STOCK_NO_INITIAL', '★battle 档无 initial ⇒ 拒（否则复位只能猜 0/未声明）');
			const e2 = (() => {
				try { D().defStock({ id: B, scope: 'persistent', initial: 'x' }); } catch (x) { return x; }
			})();
			assert.eq(e2?.code, 'STOCK_BAD_INITIAL', 'initial 非数 ⇒ 拒');
		} finally { delete SB()[B]; R().stocks.delete(B); delete D().Environment[B]; }
	});

	/* ---------- 判据 5 后半：注入固定序列 ⇒ 2000 轮 0.000% 不一致率 ---------- */

	test('stock 确定性：RPG.rng 注入 ⇒ 2000 轮耗尽读数**逐轮一致**（0.000%）', () => {
		withStocks(() => {
			/** 一轮：扣到 0 并记录「耗尽事件次数」＋终值 ⇒ 一个可比较的读数元组 */
			const oneRound = () => {
				const c = CH();
				let n = 0;
				const off = R().events.on('stock:depleted', (p) => { if (p.id === B) n += 1; });
				try {
					let took = 0;
					for (let i = 0; i < 7; i++) took += R().consumeStock(c, B, 1);   // 故意多扣 2 次（须仍只触发一次）
					return { n, took, left: c.stats[B] };
				} finally { off(); }
			};
			/* 臂 A：注入固定序列（本档的写路径**本就不该读 rng** ⇒ 这同时是一条「无隐式随机」的检验） */
			R().rng.setSequence(Array.from({ length: 2100 }, (_, i) => ((i * 37) % 97) / 97));
			const A = [];
			for (let i = 0; i < 2000; i++) A.push(oneRound());
			R().rng.reset();
			/* 臂 B：默认源（Math.random）——同代码再跑 2000 轮 */
			const Bv = [];
			for (let i = 0; i < 2000; i++) Bv.push(oneRound());
			/* ★先证明两臂**真的可分辨**（本席纪律：对照实验开跑前须自证两臂不同；此处臂 A 的注入序列
			 *  与臂 B 的默认源是**不同取样面** ⇒ 若代码真读了 rng，两臂读数**必**有差） */
			const key = (r) => `${r.n}|${r.took}|${r.left}`;
			const uniqA = new Set(A.map(key)), uniqB = new Set(Bv.map(key));
			/* 反面：确实换个注入序列 ⇒ 上面的「无差」不是因为两臂恒等 */
			R().rng.setSequence([0.999999]);
			const probe = R().rng.unit();
			R().rng.reset();
			assert.eq(probe, 0.999999, '★注入真的生效（否则「两臂同值」是假绿）');
			assert.eq(uniqA.size, 1, `★臂 A 2000 轮读数**全同**：${[...uniqA][0]}`);
			assert.eq(uniqB.size, 1, `臂 B 同读数 ⇒ 0.000% 不一致率`);
			assert.eq([...uniqA][0], [...uniqB][0], '★两臂读数**相等** ⇒ 与随机源无关（本档不读 rng）');
			const [r0] = A;
			assert.eq(JSON.stringify([r0.n, r0.took, r0.left]), '[1,5,0]', '读数形：耗尽恰 1 次、实扣 5（超额不扣）、终值 0');
		});
	});

	/* ---------- E7：耗尽事件 —— 两侧各一刀（A 裁） ---------- */

	test('★E7：两侧各一刀 —— 道具侧真值 / 角色侧真值（A 裁：谁产生谁真值、禁止双写）', () => {
		withStocks(() => {
			/* ① 角色侧真值（无道具背书，如生命维持）：递减落 stats ⇒ 耗尽事件来自角色存量 */
			const c = CH();
			let n = 0;
			const off1 = R().events.on('stock:depleted', (p) => { if (p.id === B) n += 1; });
			R().consumeStock(c, B, 5);
			off1();
			assert.eq(JSON.stringify([n, c.stats[B]]), '[1,0]', '①角色侧：恰一次＋归零');

			/* ② 道具侧真值（有道具背书，如弹药）：道具是**真值**、角色侧是**派生视图** ⇒
			 *    **递减点落在真值所在侧**（角色存量经 consumeStock **同步**该视图，✗ 各自独立双写） */
			const ITEM_T = '__t_item_backed';
			SB()[ITEM_T] = 0;
			try {
				D().defStock({ id: ITEM_T, name: '弹药（道具背书）', scope: 'persistent', initial: 2 });
				const c2 = CH({ [ITEM_T]: 2 });
				const item = { name: '手枪', charges: 2, owner: c2 };     // 道具侧真值（charges 是既有 item 级存量）
				let n2 = 0;
				const off2 = R().events.on('stock:depleted', (p) => { if (p.id === ITEM_T) n2 += 1; });
				/* 开火：道具 charges 递减 ⇒ **同一笔**把角色侧派生视图同步（单点写入 ⇒ 无双写分歧） */
				const fire = () => {
					item.charges -= 1;
					R().consumeStock(c2, ITEM_T, 1);      // 视图同步（真值仍是 item.charges）
				};
				fire(); fire();
				off2();
				assert.eq(JSON.stringify([item.charges, c2.stats[ITEM_T]]), '[0,0]', '②道具侧：真值与视图**同归零**（✗ 一方走一方不走）');
				assert.eq(n2, 1, '②道具侧：耗尽**恰一次**');
			} finally { delete SB()[ITEM_T]; R().stocks.delete(ITEM_T); delete D().Environment[ITEM_T]; }
		});
	});

	test('★3E 接线亦承载（对称性：两包各自订阅，✗ 只测 5E）', () => {
		/* ★本格补一处**真实洞**（突变电池实测）：只测 5E ⇒ 拔掉 **3E** 的 `battle:end` 接线**仍然全绿**
		 *  ⇒ 那条接线会是死码。两包对称交付 ⇒ 两包**各自**须有承载用例。 */
		const SB3 = () => setup.DND3.STAT_BLOCK;
		const X = '__t_pk3';
		SB3()[X] = 0;
		try {
			setup.DND3.defStock({ id: X, name: '3E battle 档', scope: 'battle', initial: 6 });
			const c = new (R().Character)({ name: '丁', hp: 3, maxHp: 3, stats: setup.DND3.stats({ [X]: 2 }) });
			R().events.emit('battle:end', { players: [c], enemies: [] });
			assert.eq(c.stats[X], 6, '★3E 的 battle:end 订阅复位本包 battle 档（拔掉 ⇒ 停在 2 ⇒ 红）');
			assert.eq(setup.DND3.Environment[X] !== undefined, true, '登记进 3E 命名空间');
		} finally { delete SB3()[X]; delete setup.DND3.Environment[X]; R().stocks.delete(X); }
	});

	/* ---------- E8：battle:end 清理（经**真实战斗**发射，✗ 手发事件） ---------- */

	test('★E8：battle:end 由真实 Battle 发射 ⇒ battle 档复位（✗ 只测手发事件）', async () => {
		await (async () => {
			let ok = false;
			await (async () => {
				for (const id of IDS) SB()[id] = 0;
				try {
					D().defStock({ id: B, name: 'battle 档', scope: 'battle', unit: '份', initial: 5 });
					D().defStock({ id: P, name: 'persistent 档', scope: 'persistent' });
					const p = CH(); R().consumeStock(p, B, 4); R().consumeStock(p, P, 4);
					const foe = new (R().Character)({ name: '敌', hp: 0, maxHp: 1, stats: D().stats({}) });
					await new (R().Battle)(1, [p], [foe]).execute();   // 敌方 hp=0 ⇒ 立即全灭 ⇒ 走完 send ⇒ 发 battle:end
					assert.eq(p.stats[B], 5, '★战斗真的结束 ⇒ battle 档已复位（5，✗ 1）');
					assert.eq(p.stats[P], 1, 'persistent ⇒ 保留（1，✗ 被复位成 5）');
					ok = true;
				} finally { for (const id of IDS) { delete SB()[id]; delete D().Environment[id]; R().stocks.delete(id); } }
			})();
			assert.ok(ok, '前提：战斗走完');
		})();
	});
})();
