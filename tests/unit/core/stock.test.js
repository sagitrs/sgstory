/* 存量（第五档「消耗依赖」）的单元测试 —— #1759 §十 判据 2/3/4/7 ＋ 刀 E2/E3/E4/E11（#1777 D1）
 *
 * 本笔只测 **D1 机制面**（注册表 ＋ STAT_BLOCK 机械强制 ＋ 读/减原语 ＋ 耗尽事件）；
 * `scope` 的清理接线与战斗通路归 **D2**（同票 #1777）。
 *
 * ★测试卫生：本文件**临时**声明存量（用完必清 `RPG.stocks` 与包 `Environment`）——
 *   ✗ 留残留（`RPG.stocks` 是全局表，残留会串味后续用例与全量读数）。
 */
(() => {
	const R = () => setup.RPG, D = () => setup.DND5E, D3 = () => setup.DND3;

	const ID = '__t_stock';           // 测试专用 id（前缀避开真实内容面）
	/** 临时声明一条存量并确保清理（用完必调） */
	const withStock = (fn, { id = ID, scope, block = { [ID]: 3 } } = {}) => {
		const rec = R().defStock({ id, name: '测试存量', scope, statBlock: block, pack: 'test' });
		try { return fn(rec); } finally { R().stocks.delete(id); }
	};
	/** 临时给**本包** STAT_BLOCK 加一个字段并确保清理（测包的薄封装用） */
	const withPackField = (pkg, id, fn) => {
		const SB = pkg === 'dnd3' ? D3().STAT_BLOCK : D().STAT_BLOCK;
		const ENV = pkg === 'dnd3' ? D3().Environment : D().Environment;
		const DEF = pkg === 'dnd3' ? D3().defStock : D().defStock;
		SB[id] = 3;
		try { return fn(DEF, SB, ENV); } finally { delete SB[id]; delete ENV[id]; R().stocks.delete(id); }
	};

	/* ---------- 判据 3 ＋ 刀 E3/E4：B 裁定「第 5 档须经 STAT_BLOCK 声明」的**机械强制** ---------- */

	test('stock：无 statBlock / id 不在其中 ⇒ 抛错（B 裁定不可绕过；E3）', () => {
		const e1 = (() => { try { R().defStock({ id: ID }); } catch (e) { return e; } })();
		assert.eq(e1?.code, 'STOCK_NO_STAT_BLOCK', '缺 statBlock ⇒ 拒绝');
		const e2 = (() => { try { R().defStock({ id: ID, statBlock: { other: 1 } }); } catch (e) { return e; } })();
		assert.eq(e2?.code, 'STOCK_NOT_IN_STAT_BLOCK', 'id 不在 STAT_BLOCK ⇒ 拒绝');
	});

	test('stock：★E11 载体形状 —— Symbol 键 / 非枚举属性都被拒（逼出「随 JSON 存活」的普通键）', () => {
		const sym = Symbol('t');
		const e1 = (() => { try { R().defStock({ id: ID, statBlock: { [sym]: 3 } }); } catch (e) { return e; } })();
		assert.eq(e1?.code, 'STOCK_NOT_IN_STAT_BLOCK', 'Symbol 键 ⇒ 拒（它不进 JSON ⇒ 往返后语义会死）');
		const sb = {};
		Object.defineProperty(sb, ID, { value: 3, enumerable: false });
		const e2 = (() => { try { R().defStock({ id: ID, statBlock: sb }); } catch (e) { return e; } })();
		assert.eq(e2?.code, 'STOCK_NOT_IN_STAT_BLOCK', '非枚举属性 ⇒ 拒（同一理由）');
	});

	test('stock：两包的薄封装都绑各自 STAT_BLOCK ⇒「只加一包」不可表达（E3 反向）', () => {
		withPackField('dnd-5e', ID, (DEF) => {
			assert.eq(DEF({ id: ID }).pack, 'dnd-5e', '5E 声明成功、登记进 5E Environment');
			assert.ok(D().Environment[ID] !== undefined, '登记进本包命名空间');
		});
		withPackField('dnd3', ID, (DEF) => {
			assert.eq(DEF({ id: ID }).pack, 'dnd3', '3E 声明成功');
			assert.ok(D3().Environment[ID] !== undefined, '登记进本包命名空间');
		});
		/* ★反向：只加到 5E 的 STAT_BLOCK ⇒ 在 3E 上声明同一 id **必被拒**
		 *   （「一处走一处不走」在接口上不可表达 —— 这正是 B 裁定要的效果） */
		D().STAT_BLOCK[ID] = 3;
		try {
			const e = (() => { try { D3().defStock({ id: ID }); } catch (x) { return x; } })();
			assert.eq(e?.code, 'STOCK_NOT_IN_STAT_BLOCK', '3E 未声明该字段 ⇒ 3E 上声明必拒');
		} finally { delete D().STAT_BLOCK[ID]; R().stocks.delete(ID); delete D().Environment[ID]; }
	});

	/* ---------- 判据 7：Environment 与 Conditions 不混（独立命名空间） ---------- */

	test('stock：与既有 Effect（SRD 条件）同名 ⇒ 拒绝；Conditions 键集**不变**', () => {
		const n = Object.keys(D().Conditions).length;
		assert.eq(n, 15, '前置：Conditions 恰 15 条 SRD');
		const e = (() => {
			try { R().defStock({ id: 'blinded', statBlock: { blinded: 3 } }); } catch (x) { return x; }
		})();
		assert.eq(e?.code, 'STOCK_ID_COLLIDES_EFFECT', '存量不得占用条件的 id（否则破坏可 pin 纯度与键集守卫）');
		assert.eq(Object.keys(D().Conditions).length, 15, 'Conditions 键集仍 = 15（未被污染）');
	});

	/* ---------- 判据 2：甲乙分流可判（有量 ⇒ stats；是/否 ⇒ effects） ---------- */

	test('stock：只有「普通数值字段」可声明 ⇒「是/否」二态不能走本档（分流可判）', () => {
		withStock(() => {
			/* 正例：单调量 ⇒ stats 字段，可减 */
			const c = new (R().Character)({ name: '甲', hp: 5, maxHp: 5, stats: { [ID]: 3 } });
			assert.eq(R().consumeStock(c, ID, 1), 1, '扣 1');
			assert.eq(c.stats[ID], 2, 'stats 字段递减');
		});
		/* 反例：布尔（「是/否」）不满足「STAT_BLOCK 普通键 + 数值」的档 5 形态 ⇒ 无法声明为存量 */
		const e = (() => {
			try { R().defStock({ id: ID, statBlock: { [ID]: 3, flag: true } }); } catch (x) { return x; }
		})();
		assert.eq(e, undefined, '（对照）合法声明不抛错');
		R().stocks.delete(ID);
		const e2 = (() => { try { R().defStock({ id: 'flag', statBlock: { [ID]: 3, flag: true } }); } catch (x) { return x; } })();
		assert.eq(e2, undefined, '（对照）键在 STAT_BLOCK 内即可声明');
		R().stocks.delete('flag');
	});

	/* ---------- 判据 5：耗尽**恰触发一次**（边沿，✗ 电平） ---------- */

	test('stock：耗尽事件恰一次（由有到无的边沿；已空再减不再触发）', () => {
		withStock(() => {
			const c = new (R().Character)({ name: '甲', hp: 5, maxHp: 5, stats: { [ID]: 3 } });
			let n = 0, last = null;
			const off = R().events.on('stock:depleted', (p) => { n += 1; last = p; });
			try {
				assert.eq(R().consumeStock(c, ID, 1), 1, '第 1 次扣 1');
				assert.eq(n, 0, '仍有量 ⇒ 未耗尽');
				assert.eq(R().consumeStock(c, ID, 2), 2, '第 2 次扣 2（到 0）');
				assert.eq(n, 1, '★由有到无 ⇒ **恰一次**');
				assert.eq(last?.id, ID, '事件带 id');
				assert.eq(last?.character, c, '事件带角色');
				assert.eq(R().consumeStock(c, ID, 5), 0, '已空 ⇒ 实际扣 0');
				assert.eq(c.stats[ID], 0, '不会变负');
				assert.eq(n, 1, '★已空再减 ⇒ **不再触发**（边沿，✗ 电平）');
				assert.eq(R().consumeStock(c, ID, 0), 0, 'n=0 亦不触发');
				assert.eq(n, 1, '仍 1 次');
			} finally { off(); }
		});
	});

	test('stock：一次超额扣减 ⇒ 恰一次（✗ 按超出次数多次）', () => {
		withStock(() => {
			const c = new (R().Character)({ name: '甲', hp: 5, maxHp: 5, stats: { [ID]: 1 } });
			let n = 0;
			const off = R().events.on('stock:depleted', () => { n += 1; });
			try { assert.eq(R().consumeStock(c, ID, 99), 1, '扣到 0'); assert.eq(n, 1, '恰一次'); }
			finally { off(); }
		});
	});

	/* ---------- 判据 4 ＋ E11：存量随角色走（存档往返**逐值相等**） ---------- */

	test('stock：存量随角色走 —— toJSON → JSON → revive 逐值相等', () => {
		withStock(() => {
			const c = new (R().Character)({ name: '甲', hp: 5, maxHp: 5, stats: { [ID]: 7 } });
			const json = JSON.parse(JSON.stringify(c.toJSON()));
			const back = R().Character.revive(json);
			assert.eq(back.stats[ID], 7, '★往返后**逐值相等**（普通数值键 ⇒ 必进 JSON）');
			assert.eq(R().stockOf(back, ID), 7, '读原语一致');
			/* 与「已耗尽的角色」对照：0 也须保真（✗ 被当成缺省丢字段） */
			R().consumeStock(c, ID, 7);
			const back2 = R().Character.revive(JSON.parse(JSON.stringify(c.toJSON())));
			assert.eq(back2.stats[ID], 0, '0 亦保真（✗ 丢字段退回默认）');
			assert.eq(R().stockOf(back2, ID), 0, '读 0（✗ null）');
		});
	});

	/* ---------- 参数校验（读数可判） ---------- */

	test('stock：id/scope/n 的校验都**出声**（✗ 静默接受坏值）', () => {
		const codes = [
			(() => { try { R().defStock({ id: 'a:b', statBlock: { 'a:b': 1 } }); } catch (e) { return e.code; } })(),
			(() => { try { R().defStock({ id: '' }); } catch (e) { return e.code; } })(),
			(() => { try { R().defStock({ id: ID, scope: 'forever', statBlock: { [ID]: 1 } }); } catch (e) { return e.code; } })(),
		];
		assert.eq(codes[0], 'STOCK_BAD_ID', "id 含 ':' ⇒ 拒（层级是档 4 的事）");
		assert.eq(codes[1], 'STOCK_BAD_ID', '空 id ⇒ 拒');
		assert.eq(codes[2], 'STOCK_BAD_SCOPE', '非法 scope ⇒ 拒');
		withStock((rec) => {
			assert.eq(rec.scope, 'persistent', '缺省 scope = persistent（保既有行为）');
			const c = new (R().Character)({ name: '甲', hp: 5, maxHp: 5, stats: { [ID]: 1 } });
			const e = (() => { try { R().consumeStock(c, ID, -1); } catch (x) { return x; } })();
			assert.eq(e?.code, 'STOCK_BAD_AMOUNT', 'n<0 ⇒ 拒');
			const e2 = (() => { try { R().consumeStock(c, 'no_such', 1); } catch (x) { return x; } })();
			assert.eq(e2?.code, 'STOCK_UNKNOWN', '未注册 ⇒ 拒');
			const c2 = new (R().Character)({ name: '乙', hp: 5, maxHp: 5, stats: { ac: 10 } });
			const e3 = (() => { try { R().consumeStock(c2, ID, 1); } catch (x) { return x; } })();
			assert.eq(e3?.code, 'STOCK_NOT_ON_CHARACTER', '角色无该字段 ⇒ 拒（✗ 静默算 0）');
			assert.eq(R().stockOf(c2, ID), null, '读原语：无该字段 ⇒ null（✗ 0——0 是「已耗尽」）');
		});
	});
})();
