/* core/40-battle —— **外部提交的战斗行动**（`sgstory#2003` · `sgstory-books#280` ⑧ 的引擎侧）
 *
 * 要断的是：**「背包视图里点用道具」＝本回合的行动**（★回合真耗），而不是另开一条不占回合的路。
 * 装置：`battle.execute()` 里玩家的选择走 `attacker.choice`（DOM）⇒ 本档把 `Player.choice` 换成一个
 *   **记账桩**（记下被问到的选项、按剧本作答）——由此可读「提交有没有真的替玩家回答了那一问」。
 * ⚠ 读数一律取**真跑**的结果（hp／charges／事件条数／桩的调用记录），✗ 不读源码字面。
 *
 * 刀（记在提交信息）：把 `#choose` 里的**提交分支**拆掉（三个决定点直接问玩家）⇒ ①／③ 红；复原回绿。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	/** 一场 1 回合、玩家 vs 一只软靶的战斗（敌人的行动走自动路，不问 choice）。 */
	const 造场 = (回合 = 1) => new (R().Battle)(回合, [D().Player], [
		new (R().Character)({ name: '靶', hp: 1, maxHp: 1, stats: { dmg: '0', atkBonus: 0 } }),
	], true);

	/** 把玩家的 choice 换成记账桩：`答` 决定「玩家自己点的时候选什么」。 */
	const 装桩 = (答 = 'skip') => {
		const 记 = [];
		D().Player.choice = (options) => {
			记.push(options.map((o) => ({ text: o.text, value: o.value })));
			return Promise.resolve(答);
		};
		return 记;
	};
	const 拆桩 = () => { delete D().Player.choice; };

	/** 数回合边界（判「回合真耗」用）。 */
	const 数回合 = (fn) => {
		let n = 0;
		const 退 = R().events.on('battle:turnEnd', () => { n += 1; });
		try { return { 跑: fn(), 读: () => n, 退 }; } catch (e) { 退(); throw e; }
	};

	test('battle submit：合法提交 ⇒ 道具真生效 ＋ 玩家那次**不问**菜单（提交替玩家答了）', async () => {
		State.variables.inventory = [];
		D().Player.hp = D().Player.maxHp - 10;
		D().Player.nonlethal = 0;
		R().give('bandage');
		const 血前 = D().Player.hp;
		const 记 = 装桩('skip');
		try {
			R().rng.set(() => 0.99);
			const 场 = 造场(1);
			const r = 场.submit({ item: 'bandage' });
			assert.ok(r.ok === true, `提交应被接受，实得 ${JSON.stringify(r)}`);
			await 场.execute();
			R().rng.reset();
			assert.eq(D().Player.hp, 血前 + 5, `绷带没真生效：血 ${血前} ⇒ ${D().Player.hp}（应 +5）`);
			assert.eq(State.variables.inventory.find((x) => x.id === 'bandage')?.charges, 1, '剩余次数没落袋（应 2⇒1）');
			assert.eq(记.length, 0, `玩家那次本该由提交回答 ⇒ 不该再弹菜单（实弹 ${记.length} 次：${JSON.stringify(记)}）`);
		} finally { 拆桩(); R().rng.reset(); }
	});

	test('battle submit：**回合真耗** —— 提交那一手照样走回合边界（与手动那局成对照）', async () => {
		State.variables.inventory = [];
		D().Player.hp = D().Player.maxHp - 10;
		R().give('bandage');
		R().rng.set(() => 0.99);
		const 记 = 装桩('skip');
		let 提交局 = 0;
		try {
			const 退 = R().events.on('battle:turnEnd', () => { 提交局 += 1; });
			const 场 = 造场(1);
			场.submit({ item: 'bandage' });
			await 场.execute();
			退();
			/* 对照：同一场形、**不提交**（走桩 ⇒ 玩家「点跳过」）⇒ 事件条数应**等于**提交那局。 */
			const 对局 = 造场(1);
			let n2 = 0;
			const 退2 = R().events.on('battle:turnEnd', () => { n2 += 1; });
			await 对局.execute();
			退2();
			assert.eq(提交局, n2, `提交那局的回合边界条数（${提交局}）应与手动那局（${n2}）**相同** —— 不同就是两条账`);
			assert.ok(提交局 >= 2, `一场两单位 ⇒ 至少 2 次回合边界，实得 ${提交局}`);
		} finally { 拆桩(); R().rng.reset(); }
	});

	test('battle submit：**一次性** —— 本回合用完即废，下个回合照旧问玩家', async () => {
		State.variables.inventory = [];
		D().Player.hp = D().Player.maxHp - 10;
		D().Player.nonlethal = 0;
		R().give('bandage');
		const 记 = 装桩('skip');
		try {
			R().rng.set(() => 0.99);
			const 场 = 造场(2);                     // 两回合
			const rq = 场.submit({ item: 'bandage' });
			assert.ok(rq.ok === true, `提交应被接受，实得 ${JSON.stringify(rq)}`);
			await 场.execute();
			R().rng.reset();
			/* ★判据是**只治了一次**：提交在**第一**回合生效（+5），第二回合没有再放同样一手。 */
			assert.eq(D().Player.hp, D().Player.maxHp - 5, `应只治一次：血 ${D().Player.hp}（期望 ${D().Player.maxHp - 5}）`);
			assert.eq(State.variables.inventory.find((x) => x.id === 'bandage')?.charges, 1, '应只耗一次次数（2⇒1）');
			assert.eq(记.length, 1, `第二回合应回到手动选择（恰 1 次），实得 ${记.length} 次`);
		} finally { 拆桩(); R().rng.reset(); }
	});

	test('battle submit：**具名拒** —— 身上没有 / 命令不成形；不在战斗中走 no-battle', async () => {
		State.variables.inventory = [];
		R().give('bandage');
		const 场 = 造场(1);
		const r1 = 场.submit({ item: 'sword-quenched' });        // 不在身上
		assert.ok(r1.ok === false && r1.reason === 'no-such-item', `应 no-such-item，实得 ${JSON.stringify(r1)}`);
		assert.ok(typeof r1.text === 'string' && r1.text.length > 0, '具名拒要带**上屏文案**（✗ 静默）');
		const r2 = 场.submit({});                                 // 不成形
		assert.ok(r2.ok === false && r2.reason === 'bad-command', `应 bad-command，实得 ${JSON.stringify(r2)}`);
		const r3 = 场.submit({ item: 'bandage' }, new (R().Character)({ name: '路人', hp: 1 }));  // 不是玩家
		assert.ok(r3.ok === false && r3.reason === 'not-a-player', `应 not-a-player，实得 ${JSON.stringify(r3)}`);
		/* 战外：没有 current ⇒ 具名拒（✗ 静默 / ✗ 替战外那条路做事） */
		assert.eq(R().Battle.current, null, '不在战斗中时 Battle.current 应清空（✗ 留过期引用）');
		const r4 = R().submitBattleAction({ item: 'bandage' });
		assert.ok(r4.ok === false && r4.reason === 'no-battle', `战外应 no-battle，实得 ${JSON.stringify(r4)}`);
	});

	test('battle submit：**被拒重来 ⇒ 提交已清**（✗ 同一手被重放）', async () => {
		/* 真拒绝装置：**满血时治疗被引擎按设计拒**（`action-refused` —— 无事可做的治疗不白占一手）。
		 *   ⚠ 本席首版拿 `slingshot` 造「弹尽」⇒ 该件在 dnd3 包里**没注册** ⇒ 装置自己先炸（本档的教训：
		 *     造拒绝要用**已注册**的件；满血治疗是现成的、且不依赖任何包）。 */
		State.variables.inventory = [];
		D().Player.hp = D().Player.maxHp;
		D().Player.nonlethal = 0;
		R().give('bandage');
		const 记 = 装桩('skip');
		try {
			R().rng.set(() => 0.99);
			const 场 = 造场(1);
			const r = 场.submit({ item: 'bandage' });
			assert.ok(r.ok === true, `提交本身应被接受（走不走得通由战斗裁决），实得 ${JSON.stringify(r)}`);
			await 场.execute();
			R().rng.reset();
			/* ① 真被拒了（这是本臂的前提 —— 否则下面两条读的是别的事） */
			const 果 = 场.resultLog?.[0];
			assert.eq(果?.events?.[0]?.reason ?? 果?.reason, 'action-refused', `第一手应被拒：${JSON.stringify(果)}`);
			/* ② 被拒 ⇒ 回到选择，且**提交已清** ⇒ 只问**一次**（✗ 拿同一条重放） */
			assert.eq(记.length, 1, `被拒后应恰问一次（提交已清），实得 ${记.length} 次`);
		} finally { 拆桩(); R().rng.reset(); }
	});
})();
