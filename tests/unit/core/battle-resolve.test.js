/* **行动结果结构化**与**战用动作目录**（`sgstory#1914` 增量 3/3 · 步四）。
 *
 * A. 结果结构化 —— 现码把「被拒」表达成**返回值＋一串文案**，下游（重复行动、UI、判据）只能从字串里**猜**。
 *    票面要 `{status, consumesAction, events[]}`。
 * B. 战用动作目录 —— 「这一手算哪一类」（伤害／治疗）现由**调用方给**（`43-battle-target-policy.js` 的
 *    `动作类` 参数）⇒ 等于调用方**猜**。正解：由**道具自己声明**，目录是唯一取源。
 *    判据用 `stats.noBattleUse` 的**同族声明位**（✗ 票面原写的 `handlers.use` —— 现码注释已明确否掉：
 *    「本门从不读 `handlers.use`…69 件无一例外都有 ⇒ 结构性空集、照它实现＝零 diff」）。
 *
 * 判据（每条先写先跑，在改动前的现码上红）：
 *   ① 成功行动的结果三件齐备（`status/consumesAction/events`），✗ `undefined`／裸串。
 *   ② **被拒** ⇒ `consumesAction === false`（⇒ 未消耗行动机会）；成功 ⇒ `true`。
 *   ③ 事件里的**靶身份是单位号**（✗ 名字／文案 —— 文案一改就失真）。
 *   ④ 动作类由**道具自己声明**：声明治疗类的件 ⇒ `'heal'`；未声明 ⇒ **窄默认** `'damage'`。
 *   ⑤ `noBattleUse` 的件在目录里**没有**战斗动作（现码只在选单里筛掉，目录面还没有这个概念）。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	test('resolve ①：成功行动的结果**结构化**（status／consumesAction／events 三件齐备）', () => {
		const 果 = R().行动结果?.成功?.({ 行动者: D().Player, 道具: 'club', 靶: '獾', 动作类: 'damage' });
		assert.ok(果 && typeof 果 === 'object', `★结果不是结构化对象（实得 ${JSON.stringify(果)}）`);
		for (const k of ['status', 'consumesAction', 'events']) {
			assert.ok(k in 果, `★结果缺字段「${k}」（实得 ${Object.keys(果 ?? {}).join(',')}）`);
		}
		assert.eq(果.status, 'applied', '★成功的结果 status 应为 applied');
		assert.eq(果.consumesAction, true, '★成功的行动**消耗**行动机会');
		assert.ok(Array.isArray(果.events) && 果.events.length > 0, '★结果里没有 events（下游无从判断发生了什么）');
	});

	test('resolve ②：被拒 ⇒ consumesAction === false（未消耗行动机会）', () => {
		const 果 = R().行动结果?.被拒?.({ 行动者: D().Player, 理由: 'action-threw', 详情: '石料在战斗里用不上' });
		assert.ok(果 && typeof 果 === 'object', `★被拒的结果不是结构化对象（实得 ${JSON.stringify(果)}）`);
		assert.eq(果.status, 'rejected', '★被拒的 status 应为 rejected');
		assert.eq(果.consumesAction, false, '★被拒**不得**消耗行动机会（否则「被拒即回到选择」不成立）');
		assert.ok((果.events ?? []).some((e) => e.kind === 'refused'), '★被拒的事件里应有 kind=refused 的一条');
	});

	test('resolve ③：事件里的靶身份是**单位号**（✗ 名字／文案）', () => {
		const 靶 = new (R().Character)({ name: '獾', hp: 5 });
		const 号 = R().意图.候选值(靶);
		const 果 = R().行动结果?.成功?.({ 行动者: D().Player, 道具: 'club', 靶, 动作类: 'damage' });
		const 条 = (果?.events ?? []).find((e) => e.kind === 'action');
		assert.ok(条, '★没有 kind=action 的事件');
		assert.eq(条.targetId, 号, '★事件里的靶身份不是单位号（✗ 用名字／文案 ⇒ 改名即失真）');
		assert.ok(!String(条.targetId).includes('獾'), '★事件里的靶身份落回了名字');
	});

	test('catalog ④：动作类由**道具自己声明**；未声明 ⇒ 窄默认 damage', () => {
		const 目录 = R().战用动作;
		assert.ok(目录 && typeof 目录.类 === 'function', '★没有目录面 `RPG.战用动作.类`（调用方只能猜）');
		assert.eq(目录.类(R().createItem('club')), 'damage', '★未声明战斗类别的件应按**窄**默认 damage');
		assert.eq(目录.类(R().createItem('bandage')), 'heal', '★声明了治疗类的件没被认出来');
	});

	test('catalog ⑤：`noBattleUse` 的件在目录里**没有**战斗动作', () => {
		const 目录 = R().战用动作;
		assert.ok(目录 && typeof 目录.列 === 'function', '★没有目录面 `RPG.战用动作.列`');
		assert.eq(目录.列(R().createItem('rock')).length, 0, '★资源（noBattleUse）不该列出战斗动作');
		assert.ok(目录.列(R().createItem('club')).length > 0, '★木棒应当列出战斗动作');
	});

	test('resolve ⑥【集成】一次成功的交互攻击 ⇒ `battle.上一结果` 是**结构化结果**', async () => {
		/* ★为什么必须有这条：上面①～⑤只问**工厂／目录自己**。若战斗那条路根本不调用它们，
		 *   两者就是**死码** —— 判据全绿而实际行为零变（本席在第 15/16 例里记过同种形状）。 */
		const R2 = R(), D2 = setup.DND3;
		R2.rng.setSequence(Array.from({ length: 200 }, () => 0.99));
		State.variables.inventory = [];
		R2.give('club'); R2.equip('club');
		const P = D2.Player;
		const 存 = { hp: P.hp, nonlethal: P.nonlethal, effects: (P.effects ?? []).slice(), death: P.death, items: P.items, choice: P.choice, 背包: State.variables.inventory };
		const 敌 = new (R2.Character)({ name: '獾', hp: 9999, maxHp: 9999 });
		const 序 = ['0', 'use', '獾'];
		try {
			const battle = new (R2.Battle)(1, [P], [敌], true);
			battle.perform = () => {};
			P.choice = async (opts) => {
				const a = 序.length ? 序.shift() : 'skip';
				const hit = (opts ?? []).find((o) => typeof o?.text === 'string' && o.text.startsWith(String(a)));
				return hit ? hit.value : a;
			};
			await battle.execute();
			const 果 = battle.上一结果;
			assert.ok(果 && typeof 果 === 'object', `★战斗没有留下结构化结果（实得 ${JSON.stringify(果)}）—— 工厂成了死码`);
			assert.eq(果.status, 'applied', '★成功攻击应留下 applied');
			assert.eq(果.consumesAction, true, '★成功攻击消耗行动机会');
			const 条 = (果.events ?? []).find((e) => e.kind === 'action');
			assert.ok(条, '★结果里没有 kind=action 的事件');
			assert.eq(条.targetId, R2.意图.候选值(敌), '★集成路里的事件靶身份不是单位号（用名字 ⇒ 改名即失真）');
		} finally {
			P.hp = 存.hp; P.nonlethal = 存.nonlethal; P.effects = 存.effects; P.death = 存.death;
			P.items = 存.items; P.choice = 存.choice; State.variables.inventory = 存.背包; R2.rng.reset();
		}
	});
})();
