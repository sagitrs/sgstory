/* #1773 回合经济（案 1「拒绝 ⇒ 本回合被消耗但不推进」）的 T 面格 —— 判据 2/4/5 ＋ 护栏 ＋ 覆盖缺口
 *
 * 口径（领队 2026-10-01 三裁，见 `#1773` 的 T 席勘定评论）：
 *   `act` 被拒 ⇒ **不发 `battle:turn`**、**不掷攻击骰**、**不推进 `battle.rounds`**；
 *   而 **`turnStart`／`turnEnd` 仍成对发出**（防条件衰减回退 —— 与闸门 `cancel` 分支同形）；
 *   **无武器分支同规**；**选靶读数照旧**（选靶发生在 `act` 之前）——★但本实现把**弹药预判**提到选靶前
 *   （`RPG.ammoShort`，走 `heldTotal` ⇒ 与 `act` 闸门**同口径**，✗ 第二套量）⇒ 被拒者**连选靶都不发生**。
 * ★锚（实测，本席独立复跑 dev-9 的读数）：隔离格 `0/2/0`（`battle:turn`／`turnEnd`／`rng`）。
 */
(() => {
	const R = () => setup.RPG, D = () => setup.DND5E;
	let n = 0;                                   // 每格自造道具 id，避免注册表串味

	/** 造一把带弹药的测试枪 ＋ 一袋子弹（弹药数可指定） */
	const mk = (bullets = 9) => {
		n += 1;
		const bullet = `te-bullet-${n}`, gun = `te-gun-${n}`;
		R().defItem({ id: bullet, name: '测试弹', charges: bullets, stackable: true, used() {} });
		R().defItem({
			id: gun, name: '测试枪', weapon: true, slot: 'weapon', stackable: false,
			stats: { dmg: '1d6', type: 'piercing', ranged: true, ammo: { id: bullet } },
			used() { this.perform('砰！'); },
		});
		return { bullet, gun };
	};
	const CH = (name, items) => {
		const c = new (R().Character)({ name, hp: 50, maxHp: 50, stats: D().stats({ ac: 12 }) });
		c.items = items;
		return c;
	};
	/** 跑一场自动战，收集四类读数（★一律经 atch 的 rng 注入 ⇒ 读数可复现） */
	const run = async (rounds, players, enemies, logs) => {
		const r = { start: 0, end: 0, turn: 0, reads: 0, byActor: {} };
		const o1 = R().events.on('battle:turnStart', ({ actor }) => { r.start += 1; pair(r, actor, 's'); });
		const o2 = R().events.on('battle:turnEnd', ({ actor }) => { r.end += 1; pair(r, actor, 'e'); });
		const o3 = R().events.on('battle:turn', ({ attacker }) => { r.turn += 1; pair(r, attacker, 't'); });
		const pair = (rr, actor, k) => {
			const nm = actor?.name ?? '?';
			rr.byActor[nm] = rr.byActor[nm] ?? { s: 0, e: 0, t: 0 };
			rr.byActor[nm][k] += 1;
		};
		R().rng.set(() => { r.reads += 1; return 0.5; });
		try {
			const b = new (R().Battle)(rounds, players, enemies, false);
			if (logs) b.perform = (m) => logs.push(m);
			await b.execute();
		} finally { o1(); o2(); o3(); R().rng.reset(); }
		return r;
	};

	test('★#1773 隔离格：零弹＋裸靶 ⇒ `battle:turn` 0／`turnEnd` 2／`rng` **0**', async () => {
		/* 锚＝本席独立复跑 dev-9 的读数（A/C 行）。★rng **0** 是关键：**预判在选靶之前**
		 *   ⇒ 被拒者连选靶那次读数都不发生（✗ 本席原判「必为 1」——那时是旧路径，已被实测推翻）。 */
		const { gun } = mk();
		const r = await run(1, [CH('枪手', [{ id: gun, equipped: true }])], [CH('裸靶', [])]);
		assert.eq(JSON.stringify([r.turn, r.end, r.reads]), '[0,2,0]',
			'★被拒 ⇒ 不发 battle:turn；边界成对；**rng 0**（预判早于选靶）');
	});

	test('★判据 4（AI 同规）：怪物零弹 ⇒ **其**回合不发 `battle:turn`（✗ 单边）', async () => {
		/* 正对照：玩家**能**开火（有弹）⇒ 3 次；怪物**零弹**（配枪无弹）⇒ 其 3 次缺席。
		 * ⇒ `battle:turn === 3`（✗ 6）且**按行动者**可判「缺席的正是怪物」。 */
		const a = mk(9), b = mk(0);
		const p = CH('玩家', [{ id: a.gun, equipped: true }, { id: a.bullet, charges: 9 }]);
		const m = CH('怪物', [{ id: b.gun, equipped: true }]);          // ★配枪但零弹
		const r = await run(3, [p], [m]);
		assert.eq(r.byActor['玩家']?.t, 3, '玩家 3 次开火（正对照：计数器真在跑）');
		assert.eq(r.byActor['怪物']?.t ?? 0, 0, '★怪物零弹 ⇒ **其**回合不发 `battle:turn`（AI 同规）');
		assert.eq(r.byActor['怪物']?.e, 3, '★但怪物的回合边界照走（成对 ⇒ 条件衰减不回退）');
	});

	test('★覆盖缺口：**无武器**分支 ⇒ 同规（rejected）＋ 边界成对（#1773 前此分支零覆盖）', async () => {
		/* 本席 grep 既有 turn-boundary 断言：**无武器分支的回合边界零覆盖** ⇒ 它改坏也不会红。
		 *  #1773 裁定「无武器分支同规」⇒ 本格把它钉住。 */
		const r = await run(1, [CH('空手', [])], [CH('空手敌', [])]);
		assert.eq(JSON.stringify([r.turn, r.end, r.reads]), '[0,2,0]', '★无武器 ⇒ 不推进（与零弹同规）');
		assert.eq(r.byActor['空手']?.s, 1, '该行动者 `turnStart` 恰 1');
		assert.eq(r.byActor['空手']?.e, 1, '★且 `turnEnd` 恰 1 ⇒ **成对**（防后人照字面改成 start 单发）');
	});

	test('★护栏（N=3）：连续 3 次无推进 ⇒ `perform` 记日志（✗ 静默空转整场）', async () => {
		const logs = [];
		const r = await run(3, [CH('甲', [])], [CH('乙', [])], logs);   // 双方无武器 ⇒ 每次皆拒
		assert.eq(r.turn, 0, '全拒 ⇒ 无 battle:turn');
		const hits = logs.filter((m) => /连续 \d+ 次无人能行动/.test(m));
		assert.eq(hits.length, 2, `★★6 次拒绝 ÷ 上限 3 ⇒ 恰 **2** 次日志（实得 ${hits.length}）`);
		assert.ok(/强制跳过/.test(hits[0] ?? ''), '日志说明「强制跳过」');
	});

	test('★护栏：**成功推进即清零**（「连续」而非「累计」的可分辨格）', () => {
		/* 判别设计：让**成功**反复出现，把拒绝序列**切断**成永不到 3 的片段。
		 *   行动序每回合 `[玩家, 怪物]`：玩家**恒成功**（弹足）⇒ 每次成功把计数清零；怪物**恒拒**（零弹）。
		 *   ⇒ 片段最长 = 1 ⇒ **无日志**。
		 *   ★若实现误写成「**累计**达 3 即触发」（✗ 不复位）：3 回合共 3 次拒绝 ⇒ 恰达 3 ⇒ **有日志** ⇒ 本格红。
		 *   （本席首版期望写错：`[1 发弹的玩家]` 造成「成功仅一次」⇒ 其后 5 次拒绝真的连成 3 ⇒ 实得 1 次日志。
		 *     **是断言错、不是实现错**——留下此注，防后人照那个错期望改实现。） */
	test('★判据 1（交互战）：零弹使用 ⇒ **可读拒绝文案** ＋ 无 `item:used` ＋ 不发 `battle:turn`；边界成对', async () => {
		/* 与自动通路的差别：交互面**没有** `ammoShort` 预判（`#playerActionBody` 直调 `act`）⇒
		 *   拒绝文案落在这里（`#1768` MINOR 本体：三处调用点连返回值都不看 ⇒ 玩家看不到任何解释）。 */
		const { gun } = mk();
		const P = setup.DND3.Player;
		const saved = { items: P.items, choice: P.choice, hadC: Object.prototype.hasOwnProperty.call(P, 'choice') };
		const foe = CH('敌', []);
		const logs = [];
		const r = { turn: 0, end: 0, used: 0 };
		let seq = ['0', '敌'];                       // ① 选第 0 个道具（枪）② 选目标「敌」
		P.items = [{ id: gun, equipped: true }];
		P.choice = async () => (seq.length ? seq.shift() : 'skip');
		const o1 = R().events.on('battle:turn', () => { r.turn += 1; });
		const o2 = R().events.on('battle:turnEnd', () => { r.end += 1; });
		const o3 = R().events.on('item:used', () => { r.used += 1; });
		try {
			const b = new (R().Battle)(1, [P], [foe], true);
			b.perform = (m) => logs.push(m);
			await b.execute();
		} finally {
			o1(); o2(); o3();
			P.items = saved.items;
			if (saved.hadC) P.choice = saved.choice; else delete P.choice;
		}
		assert.eq(r.used, 0, '★无 `item:used`（攻击未执行）');
		assert.eq(r.turn, 0, '★交互面亦不发 `battle:turn`（被拒 ⇒ 不推进）');
		assert.ok(r.end >= 1, '★但回合边界照走（成对 ⇒ 条件衰减不回退）');
		assert.ok(logs.some((m) => /没能出手/.test(m) && /没有弹药/.test(m)),
			`★**可读拒绝文案**（含原因）——实得：${JSON.stringify(logs.filter((m) => /出手|弹药/.test(m)))}`);
	});

		return (async () => {
			const a = mk(9), b = mk(0);
			const p2 = CH('玩家', [{ id: a.gun, equipped: true }, { id: a.bullet, charges: 9 }]);
			const m = CH('怪物', [{ id: b.gun, equipped: true }]);      // 零弹 ⇒ 恒拒
			const logs = [];
			const r = await run(3, [p2], [m], logs);
			assert.eq(r.turn, 3, '玩家 3 次全成（正对照：有推进）');
			assert.eq(r.byActor['怪物']?.t ?? 0, 0, '怪物 3 次全拒（无 battle:turn）');
			assert.eq(logs.filter((x) => /连续 \d+ 次无人能行动/.test(x)).length, 0,
				'★拒绝被「成功」切断 ⇒ 无连续 3 次 ⇒ **无日志**（钉住「连续」；误写成「累计」⇒ 红）');
		})();
	});
})();
