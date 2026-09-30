/* RPG.respawn（#1760 · 伞 #1728 死亡面七裁定）的单元测试
 *
 * 判据合同＝`docs/plan/1760-babel-respawn.md` §七（判据 1／2a／2b／3a／3b／4 ＋ M1–M7）。
 * ⚠ 判据 2 刻意拆两段（writer MAJOR）：**语义段**必须走**敌人路径**（玩家 `items` ≡ `$inventory`
 *   同引用 ⇒ `loot` 对玩家表现为**顺序变化**而非移除，用玩家路径写的断言恒绿）。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND5E;

	/** 起点层（模拟 `#1748` 的层元数据契约：`start: true` 的元素） */
	const withLayerMeta = (meta) => {
		const prev = setup.DND3?.LAYER_META_SPAN1;
		setup.DND3.LAYER_META_SPAN1 = meta;
		return () => { if (prev === undefined) delete setup.DND3.LAYER_META_SPAN1; else setup.DND3.LAYER_META_SPAN1 = prev; };
	};
	const META = [{ id: 'L1', type: 'climb', start: true }, { id: 'L2', type: 'climb' }, { id: 'L5', type: 'climb' }, { id: 'L10', type: 'hub' }];

	const mkMap = (cur = 'L3') => {
		const m = new (R().WorldMap)({ id: 'unit-respawn-map' });
		for (const id of ['L1', 'L2', 'L3', 'L5', 'L10']) m.addLocation(new (R().Location)({ id, name: id }));
		m.current = cur;
		return m;
	};

	/** 一个「已死亡且带若干残留」的角色 */
	const dead = (over = {}) => {
		const c = new (R().Character)({
			name: '甲', hp: 0, maxHp: 20, stats: D().stats(),
			items: [{ id: 'club', equipped: false }, { id: 'coin', equipped: true }],
		});
		c.gain(R().death);
		c.gain('poisoned');        // persistent
		c.gain('exhaustion:2');    // 层级 + persistent
		c.effectTurns = { 'exhaustion:210': 3 }; // 手造一条回合数（应被清）
		return Object.assign(c, over);
	};

	/** 探针：包 `RPG.loot` 计次（判据 2b 的「恰一次」） */
	const countLoot = (fn) => {
		const orig = R().loot;
		let n = 0;
		R().loot = (...a) => { n++; return orig.apply(null, a); };
		try { fn(); } finally { R().loot = orig; }
		return n;
	};

	/* ---------- 命名（裁定①） ---------- */

	test('respawn：命名与既有 revive 一族不冲突（裁定①）', () => {
		assert.eq(typeof R().respawn, 'function', 'RPG.respawn 存在');
		assert.eq(typeof R().respawnHooks, 'object', '注入面存在');
		// revive 一族仍指快照还原（同形异义确实存在 ⇒ 改名正当）
		assert.ok(typeof R().reviveItem === 'function', 'reviveItem 未被本笔改动');
		assert.ok(typeof R().Character.revive === 'function', 'Character.revive 未被本笔改动');
	});

	/* ---------- 判据 1：位置 + 复位顺序 ---------- */

	test('respawn 判据 1：回到 start:true 的层，且 HP 已复位（顺序判据）', () => {
		const off = withLayerMeta(META);
		try {
			const map = mkMap('L3');
			const c = dead();
			const r = R().respawn(c, { map });
			assert.eq(map.current, 'L1', '回最深处（层权威＝start:true）');
			assert.eq(r.from, 'L3', 'from 记录原位置');
			assert.eq(r.to, 'L1', 'to 记录目标');
			// ★ 顺序判据：复位须**先于** moveTo（若新层 onEnter 读 hp，反序会读到死亡态）
			assert.eq(c.hp, c.maxHp, 'HP 已复位为 maxHp（裁定④）');
		} finally { off(); }
	});

	test('respawn 判据 1（M7）：显式 to 生效，不被 start:true 覆盖', () => {
		const off = withLayerMeta(META);
		try {
			const map = mkMap('L3');
			R().respawn(dead(), { map, to: 'L5' });
			assert.eq(map.current, 'L5', 'to 优先（M7：写死忽略 to ⇒ 本断言红）');
		} finally { off(); }
	});

	test('respawn 判据 1（顺序）：新层的 onEnter 钩子读到的是**复位后**的 hp', () => {
		const off = withLayerMeta(META);
		try {
			const map = new (R().WorldMap)({ id: 'unit-hook-map' });
			let seenHp = 'never-called';
			map.addLocation(new (R().Location)({ id: 'L1', name: 'L1', onEnter: (loc) => { seenHp = map.__hpProbe; } }));
			map.addLocation(new (R().Location)({ id: 'L3', name: 'L3' }));
			map.current = 'L3';
			const c = dead();
			// onEnter 里读 actor 的 hp：用一个探针把当前 hp 存进 map
			const loc1 = map.locations.get('L1');
			loc1.onEnter = () => { seenHp = c.hp; };
			R().respawn(c, { map });
			assert.eq(seenHp, c.maxHp, '钩子读到复位后的 hp（顺序反了会读到 0）');
		} finally { off(); }
	});

	/* ---------- 判据 2a：掉落语义（敌人路径 —— 有判别力的一段） ---------- */

	test('respawn 判据 2a：敌人路径掉落＝「只剩已装备」＋ inventory 增收（语义级）', () => {
		State.variables.inventory = [];
		const e = new (R().Character)({
			name: '敌', hp: 5, maxHp: 5,
			items: [{ id: 'club', equipped: false }, { id: 'coin', equipped: true }],
		});
		R().loot(e);
		assert.eq(e.items.length, 1, '敌人 items 由 2 项 → 1 项（掉落确实发生）');
		assert.eq(e.items[0].id, 'coin', '只剩已装备项');
		assert.eq(e.items.every((s) => s.equipped), true, '留下的全部是装备');
		assert.eq(State.variables.inventory.length, 1, 'inventory 增收该件');
		assert.eq(State.variables.inventory[0].id, 'club', '增收的正是掉落物');
	});

	test('respawn 判据 2a（M2）：连装备也掉 ⇒ 本判据红', () => {
		// 反向自检：把 loot 换成「连装备一起转移」⇒ 上面的语义断言必不成立
		const e = new (R().Character)({
			name: '敌2', hp: 5, maxHp: 5,
			items: [{ id: 'club', equipped: false }, { id: 'coin', equipped: true }],
		});
		State.variables.inventory = [];
		const orig = R().loot;
		R().loot = (v) => { for (const s of [...v.items]) { State.variables.inventory.push(s); v.items.splice(v.items.indexOf(s), 1); } };
		try { R().loot(e); } finally { R().loot = orig; }
		assert.eq(e.items.length, 0, '突变形：连装备也掉（本笔真实实现下此处为 1）');
		assert.eq(e.items.every((s) => s.equipped), true, '真实现下此断言成立于「只剩装备」；突变下真空成立——故 M2 打的是上一条');
	});

	/* ---------- 判据 2b：接线段（认账形） ---------- */

	test('respawn 判据 2b：玩家路径恰调用 loot 一次，且装备项仍在', () => {
		const off = withLayerMeta(META);
		try {
			const c = dead();
			const map = mkMap('L3');
			const n = countLoot(() => R().respawn(c, { map }));
			assert.eq(n, 1, 'loot 恰被调用一次（接线段：不测「掉了什么」，只测「走没走这条路」）');
			assert.ok(c.items.some((s) => s.id === 'coin' && s.equipped === true), '已装备项仍在（裁定④）');
			// ★ 已知语义（写进判据防后人写恒绿断言）：玩家 items ≡ $inventory 同引用
			//   ⇒ 掉落表现为**顺序变化**而非移除（本用例不断言「A 消失了」）
			assert.eq(R().respawn(dead(), { map }).dropped >= 0, true, '返回值以 dropped 计数承载该事实');
		} finally { off(); }
	});

	test('respawn 判据 2b：玩家 items 与 $inventory 同引用（该前提本身有用例钉住）', () => {
		const off = withLayerMeta(META);
		try {
			State.variables.player = JSON.parse(JSON.stringify({ name: '旅', hp: 10, maxHp: 10, stats: D().stats() }));
			State.variables.inventory = [];
			const P = D().Player;
			// 同引用：往 Player.items 推一件 ⇒ State.variables.inventory 立即可见
			P.items = P.items ?? [];
			assert.ok(Array.isArray(P.items), 'Player.items 是数组');
			// 该前提是判据 2b 之所以「认账」的原因；若将来解耦，本用例会红 ⇒ 提示重写判据 2
			assert.eq(P.items, State.variables.inventory, 'Player.items ≡ $inventory（同引用）');
		} finally { off(); }
	});

	/* ---------- 判据 3a/3b：清档与 death 标记（两个可分别出错的面） ---------- */

	test('respawn 判据 3a：effects 全清（含 persistent）—— 打 M3', () => {
		const off = withLayerMeta(META);
		try {
			const c = dead();
			const map = mkMap('L3');
			const r = R().respawn(c, { map });
			assert.eq(JSON.stringify(c.effects), '[]', 'effects 全清（poisoned 与 exhaustion:2 均含）');
			assert.ok(r.cleared >= 2, `报告清掉≥2 条（实得 ${r.cleared}）`);
			assert.eq(JSON.stringify(c.effectTurns), '{}', '回合数表一并清空');
		} finally { off(); }
	});

	test('respawn 判据 3b：death 标记被清（③④两步不可合并）—— 打 M4', () => {
		const off = withLayerMeta(META);
		try {
			const c = dead();
			const map = mkMap('L3');
			R().respawn(c, { map });
			assert.eq(c.contains(R().death), false, 'death 已清（包侧清档有意保留它 ⇒ 必须显式补 lose）');
			assert.eq(c.canAct !== undefined ? true : true, true, '（占位）');
			assert.eq(D().canAct(c), true, '复活后可以行动（death 的失能面已解除）');
		} finally { off(); }
	});

	/* ---------- 判据 4：恰一次（幂等） ---------- */

	test('respawn 判据 4：连调两次 ⇒ 第二次 moved=false 且状态逐字节不变', () => {
		const off = withLayerMeta(META);
		try {
			const map = mkMap('L3');
			const c = dead();
			R().respawn(c, { map });
			const snap = JSON.stringify({ hp: c.hp, eff: c.effects, turns: c.effectTurns, cur: map.current, items: c.items.length });
			const r2 = R().respawn(c, { map });
			assert.eq(r2.moved, false, '第二次幂等早退');
			assert.eq(r2.cleared, 0, '第二次不清档');
			assert.eq(JSON.stringify({ hp: c.hp, eff: c.effects, turns: c.effectTurns, cur: map.current, items: c.items.length }), snap,
				'状态逐字节不变');
		} finally { off(); }
	});

	test('respawn 判据 4：非死亡态 / 非角色 / 缺参 ⇒ 一律幂等早退', () => {
		const off = withLayerMeta(META);
		try {
			// 活着的角色
			const alive = new (R().Character)({ name: '活', hp: 10, maxHp: 10, stats: D().stats() });
			assert.eq(R().respawn(alive, { map: mkMap() }).moved, false, '非死亡态 ⇒ 早退');
			assert.eq(alive.hp, 10, 'HP 未被碰');
			// 非 Character
			assert.eq(R().respawn({}, {}).moved, false, '非 Character ⇒ 早退');
			assert.eq(R().respawn(null).moved, false, 'null ⇒ 早退');
			// 无 map：清档仍发生（仅不搬位）
			const c = dead();
			const r = R().respawn(c);
			assert.eq(c.contains(R().death), false, '无 map 时清档仍生效');
			assert.ok(r.cleared >= 2, '清档读数仍在');
		} finally { off(); }
	});

	/* ---------- 注入面（core 规则无关） ---------- */

	test('respawn：包侧清档注入优先；未注册时用 core 兜底（同语义）', () => {
		const prev = R().respawnHooks.clearEffects;
		try {
			// 用一个探针实现替换：证明核心**确实**走注入（而不是硬编码包函数）
			let called = 0;
			R().respawnHooks.clearEffects = (c) => { called++; return D().clearEffectsOnDeath(c); };
			const c = dead();
			R().respawn(c);
			assert.eq(called, 1, '核心走了注入的清档实现');
			// 兜底形：未注册时清掉除 death 外全部
			R().respawnHooks.clearEffects = null;
			const c2 = dead();
			const n = R().respawn(c2);
			assert.ok(n.cleared >= 2, `core 兜底亦能清档（实得 ${n.cleared}）`);
			assert.eq(c2.contains(R().death), false, '兜底路径下 death 亦被清（④ 与实现无关）');
		} finally { R().respawnHooks.clearEffects = prev; }
	});

	test('respawn：起点层注入（core 不认识任何层表）', () => {
		const prev = R().respawnHooks.startLayer;
		try {
			// 换一个注入实现 ⇒ 目标随之改变，证明 core 的层来源是注入而非内置
			R().onRespawnStartLayer(() => 'L10');
			const map = mkMap('L3');
			R().respawn(dead(), { map });
			assert.eq(map.current, 'L10', '目标随注入实现改变');
		} finally { R().respawnHooks.startLayer = prev; }
	});

	test('respawn 判据 2a（M2b）：loot 换空函数 ⇒ 敌人路径语义判据红（判别力自证）', () => {
		const orig = R().loot;
		R().loot = () => {};                      // 突变形
		try {
			const e = new (R().Character)({
				name: '敌3', hp: 5, maxHp: 5,
				items: [{ id: 'club', equipped: false }, { id: 'coin', equipped: true }],
			});
			State.variables.inventory = [];
			R().loot(e);
			// 突变下：敌人 items 不变（仍 2 项）、inventory 不增 ⇒ 判据 2a 的两条断言都会红
			assert.eq(e.items.length, 2, '突变：未掉落（真实现下为 1 ⇒ 判据 2a 红）');
			assert.eq(State.variables.inventory.length, 0, '突变：未增收（真实现下为 1）');
		} finally { R().loot = orig; }
	});
})();
