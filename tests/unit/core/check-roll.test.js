/* 检定原语 `RPG.checkRoll`（`#1798` E1a）—— 设计稿 `docs/plan/1798-E1a-skillcheck.md` §二 的规范句 S1–S5
 * （＋ tester-4 于 `#1800` 评审指出的**返回形**面：S6 的「行为零变」**含返回形不变**）。
 *
 * ## 本原语的由来（`#1780` §八 未落面第 6 条）
 *   本仓原先**没有**检定原语 ⇒ 各消费点**各处手写** `d20 + 加值 >= dc`
 *   （撬锁 `chest.js`／豁免 `saves.js`·`conditions.js`／治疗检定 `traumas.js` 四处）。
 *   而 `fracture` 初版想挂「力量检定」时**无消费点可挂**（被迫改绑近战伤害）。
 *   本笔补上该层，并把四处收敛到同一判定式。
 *
 * ## ★本文件的两半（缺一不可）
 *   ① **原语自身**的形与语义（S1–S5）；
 *   ② **四个消费方**收敛后**返回形逐键不变**（S6）—— 否则「行为零变」是假话：
 *      `DND3.save` 的 `trauma`／`treatTrauma` 的 `ok` 两个键若有失，`traumas.test.js`／
 *      `span1-hub.js` 会红 ⇒ 本半把「薄壳只共用判定式、✗ 不统一对象形」钉住。
 */
(() => {
	const R = () => setup.RPG;

	/* ---------- S1：判定统一形 `success === (total >= dc)`（含边界） ---------- */

	test('checkRoll S1：`success === (total >= dc)`，且**边界 `total === dc` ⇒ 成功**（3E/5E 皆「≥」）', () => {
		/* 用固定骰面把 `roll` 钉死：`1d1` 恒出 1 ⇒ `total = 1 + mod`，可控。 */
		const r0 = R().checkRoll({ die: '1d1', mod: 0, dc: 1 });
		assert.eq(r0.success, true, 'total 1 === dc 1 ⇒ 成功（边界取「≥」）');
		const r1 = R().checkRoll({ die: '1d1', mod: 0, dc: 2 });
		assert.eq(r1.success, false, 'total 1 < dc 2 ⇒ 失败');
		const r2 = R().checkRoll({ die: '1d1', mod: 5, dc: 6 });
		assert.eq(r2.total, 6, 'total = roll + mod = 1 + 5');
		assert.eq(r2.success, true, '加值把边界顶过 ⇒ 成功');
	});

	/* ---------- S2：加值来源由**调用方**给（core 不认识 stats 字段语义） ---------- */

	test('checkRoll S2：`mod` 由调用方传入 ⇒ 同一骰面下**不同 mod 得不同 total**（core 不读 stats）', () => {
		const base = R().checkRoll({ die: '1d1', mod: 0, dc: 99 });
		const plus = R().checkRoll({ die: '1d1', mod: 7, dc: 99 });
		assert.eq(base.total, 1, 'mod=0 ⇒ total 即骰值');
		assert.eq(plus.total, 8, 'mod=7 ⇒ total +7');
		/* ★本原语的形里**没有** character/stats 参 ⇒ 结构上不可能去猜字段语义 */
		assert.eq(R().checkRoll.length, 0, '参数是单个对象（✗ 位置参数）⇒ 不接收 character');
	});

	/* ---------- S3：骰面族由调用方给（d20m 是百分骰） ---------- */

	test('checkRoll S3：`die` 可换族 —— `1d100` 的读数落在 1..100（✗ 硬编 d20）', () => {
		for (let i = 0; i < 40; i++) {
			const r = R().checkRoll({ die: '1d100', dc: 101 });
			assert.ok(r.roll >= 1 && r.roll <= 100, `1d100 的 roll 越域：${r.roll}`);
			assert.eq(r.die, '1d100', '返回形带回 `die`（供调用方核口径）');
		}
	});

	/* ---------- S4：返回形（★测试员指出的面：`total` 是**含加值的和**，✗ 裸 roll） ---------- */

	test('checkRoll S4：返回六键俱在，且 `total` ＝ 含 `mod`＋`bonus` 的**和**（✗ 裸 `roll`）', () => {
		const r = R().checkRoll({ die: '1d1', mod: 3, bonus: 4, dc: 8 });
		assert.eq(Object.keys(r).sort().join(','), 'bonus,dc,die,mod,roll,success,total',
			'七键：success/roll/mod/bonus/total/dc/die');
		assert.eq(r.roll, 1, 'roll ＝ 裸骰值');
		assert.eq(r.total, 8, 'total ＝ roll + mod + bonus ＝ 1 + 3 + 4（★若写成裸 roll ⇒ 1 ⇒ 红）');
		assert.eq(r.success, true, 'total 8 >= dc 8 ⇒ 成功');
		/* ★`bonus` 与 `mod` **分离**：3E 的「豁免加值」与「创伤罚」是两个来源，
		 *   合账会丢失「罚不改 mod」的既有语义（见 `saves.js` 的注）。 */
		assert.eq(r.mod, 3, 'mod 保持「角色自身加值」语义（✗ 被罚污染）');
		assert.eq(r.bonus, 4, 'bonus 独立带回（3E 的 trauma 罚走这里）');
	});

	/* ---------- S5：无副作用 ---------- */

	test('checkRoll S5：**无副作用** —— 调用前后角色 hp/effects/items 逐字不变', () => {
		const D = () => setup.DND5E;
		const c = new (R().Character)({ name: '丙', hp: 10, maxHp: 10, stats: D().stats({ ac: 12 }) });
		c.items = [{ id: 'coin', charges: 3 }];
		c.gain('bleeding');
		const snap = JSON.stringify([c.hp, c.effects, c.items, c.stats]);
		R().checkRoll({ die: '1d1', mod: 2, dc: 5 });
		assert.eq(JSON.stringify([c.hp, c.effects, c.items, c.stats]), snap,
			'纯判定 ⇒ 不写任何状态（写路径仍归调用方）');
		c.lose('bleeding');   // 测试卫生：清掉本格加的 effect
	});

	/* ---------- S6（tester-4 指出的面）：四个消费方收敛后**返回形逐键不变** ---------- */

	test('★S6：四个消费方收敛后**返回形逐键不变**（薄壳只共用判定式，✗ 不统一对象形）', () => {
		const D = () => setup.DND5E, D3 = () => setup.DND3;

		/* ① `DND5E.save` ⇒ { success, roll, mod, dc }（4 键） */
		const s5 = (() => {
			const c = new (R().Character)({ name: '甲', hp: 10, maxHp: 10, stats: D().stats({}) });
			return D().save(c, 'dex', 10);
		})();
		assert.eq(Object.keys(s5).sort().join(','), 'dc,mod,roll,success', '5E save 形：success/roll/mod/dc');

		/* ② `DND3.save` ⇒ { success, roll, total, dc, mod, trauma }（★`trauma` 键须在） */
		const s3 = (() => {
			const c = new (R().Character)({ name: '乙', hp: 10, maxHp: 10, stats: D3().stats({}) });
			/* 类型名随 `#2030`／B-6 换成 3.5 三豁免之一；本刀判的是**键集**，✗ 与类型同名无关。 */
			return D3().save(c, 'will', 15);
		})();
		assert.eq(Object.keys(s3).sort().join(','), 'dc,mod,roll,success,total,trauma',
			'★3E save 形含 `trauma`（`traumas.test.js` 读它 ⇒ 掉了就红）');

		/* ③ `DND3.treatTrauma` ⇒ { ok, ... }（★键名是 `ok`，✗ 不是 `success`） */
		const t = (() => {
			const c = new (R().Character)({ name: '丁', hp: 10, maxHp: 10, stats: D3().stats({}) });
			c.gain('bleeding');
			const r = D3().treatTrauma(c, 'bleeding', { mod: 99 });   // 加值给足 ⇒ 必成
			return r;
		})();
		assert.eq(Object.keys(t).sort().join(','), 'dc,ok,removed,roll,total',
			'★treatTrauma 形用 `ok`（`span1-hub.js` 读 `r.ok` ⇒ 改成 success 就红）');
		assert.eq(t.ok, true, '加值 99 ⇒ 治愈（顺带核判定式仍活）');
		assert.eq(t.removed, 'bleeding', '成功 ⇒ removed ＝ 该 id');

		/* ④ `traumas` 的「未持有」早返回分支：形含额外 `why` 键（本笔 ✗ 未动该分支） */
		const t2 = (() => {
			const c = new (R().Character)({ name: '戊', hp: 10, maxHp: 10, stats: D3().stats({}) });
			return D3().treatTrauma(c, 'bleeding', { mod: 0 });
		})();
		assert.eq(t2.why, 'not-held', '未持有 ⇒ 早返回带 `why`（本笔未动该路径）');
		assert.eq(t2.roll, 0, '未持有 ⇒ 不掷骰（roll 0）');
	});
})();
