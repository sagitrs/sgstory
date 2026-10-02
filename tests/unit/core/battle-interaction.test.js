/* core/40-battle 交互回合的单元测试：选项构造（纯函数 buildPlayerOptions）
 * 回应检视 M5a/M5b/M5c 突变：拔掉跳过选项/装备卸下提交/动作层应转红。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	test('battle interaction：道具选项含跳过本回合 + 已装备标记', () => {
		R().give('club'); R().equip('club');
		R().give('bandage');
		const battle = new (R().Battle)(1, [D().Player], [new (R().Character)({ name: '靶', hp: 1 })], true);
		const { itemOptions } = battle.buildPlayerOptions(D().Player);
		assert.ok(itemOptions.length >= 3, `至少 3 个选项（木棒+绷带+跳过），实际 ${itemOptions.length}`);
		const skip = itemOptions.find(o => o.value === 'skip');
		assert.ok(skip, '有「跳过本回合」选项');
		const club = itemOptions.find(o => o.text.includes('木棒'));
		assert.ok(club && club.text.includes('已装备'), '已装备武器带标记');
	});

	test('battle interaction：未装备武器 → 动作集含装备选项（M5c 检测）', () => {
		R().give('club'); // 不 equip
		const battle = new (R().Battle)(1, [D().Player], [new (R().Character)({ name: '靶', hp: 1 })], true);
		const { actionOptionsFor } = battle.buildPlayerOptions(D().Player);
		const item = R().reviveItem(State.variables.inventory[0]);
		assert.ok(!item.equipped, '木棒初始未装备');
		const actions = actionOptionsFor(item);
		// M5c 突变：如果动作层被拔掉，actions 只有 [使用]，没有 [装备]
		assert.ok(actions.length >= 2, `动作集应有 ≥2 项（使用+装备），实际 ${actions.length}`);
		assert.ok(actions.some(a => a.value === 'equip'), '有装备选项');
		assert.ok(actions.some(a => a.text.includes('消耗本回合')), '装备标注消耗回合');
	});

	test('battle interaction：已装备武器 → 动作集含卸下选项', () => {
		R().give('club'); R().equip('club');
		const battle = new (R().Battle)(1, [D().Player], [new (R().Character)({ name: '靶', hp: 1 })], true);
		const { actionOptionsFor } = battle.buildPlayerOptions(D().Player);
		const item = R().reviveItem(State.variables.inventory[0]);
		assert.ok(item.equipped, '木棒已装备');
		const actions = actionOptionsFor(item);
		assert.ok(actions.some(a => a.value === 'unequip'), '有卸下选项');
		assert.ok(!actions.some(a => a.value === 'equip'), '已装备不再显示装备选项');
	});

	test('battle interaction：无装备动作的道具 → 仅「使用」（如绷带）', () => {
		R().give('bandage');
		const battle = new (R().Battle)(1, [D().Player], [new (R().Character)({ name: '靶', hp: 1 })], true);
		const { actionOptionsFor } = battle.buildPlayerOptions(D().Player);
		const item = R().reviveItem(State.variables.inventory[0]);
		const actions = actionOptionsFor(item);
		assert.eq(actions.length, 1, '绷带只有「使用」一个动作');
		assert.eq(actions[0].value, 'use', '唯一动作为使用');
	});

	test('battle interaction：装备经 useItem 提交到背包快照（M5b 检测）', () => {
		R().give('club'); // 未装备
		const before = State.variables.inventory[0].equipped;
		assert.ok(!before, '初始未装备');
		// 直接调用 useItem 的 equip 动作（模拟交互战中选择装备）
		R().useItem('club', D().Player, D().Player, 'equip');
		const after = State.variables.inventory[0].equipped;
		assert.ok(after, 'useItem equip 后背包快照的 equipped 变为 true');
		// 卸下
		R().useItem('club', D().Player, D().Player, 'unequip');
		assert.ok(!State.variables.inventory[0].equipped, 'useItem unequip 后恢复 false');
	});

	test('battle interaction：目标选项标注己方与敌方', () => {
		const enemy = new (R().Character)({ name: '敌人' });
		const ally = new (R().Character)({ name: '盟友' });
		const battle = new (R().Battle)(1, [D().Player, ally], [enemy], true);
		const { targetOptions } = battle.buildPlayerOptions(D().Player);
		const enemyOpt = targetOptions.find(o => o.value === '敌人');
		const allyOpt = targetOptions.find(o => o.value === '盟友');
		assert.ok(enemyOpt && enemyOpt.text.includes('敌方'), '敌人标注敌方');
		assert.ok(allyOpt && allyOpt.text.includes('己方'), '盟友标注己方');
	});

	/* ---------- dispatchAction 分派决策（M5b/M5d 突变检测） ---------- */

	test('battle dispatch：skip → {type:skip}，不进入目标选择（M5d）', () => {
		const d = R().Battle.dispatchAction('skip', null, null);
		assert.eq(d.type, 'skip', 'skip 分派返回 skip');
		assert.ok(!('item' in d) || d.item === null, 'skip 不携带道具');
	});

	test('battle dispatch：equip → {type:equip,item}，经 useItem 提交（M5b）', () => {
		R().give('club');
		const item = R().reviveItem(State.variables.inventory[0]);
		const d = R().Battle.dispatchAction('0', 'equip', item);
		assert.eq(d.type, 'equip', '分派返回 equip');
		assert.ok(d.item && d.item.id === 'club', '携带正确的道具');
		// 实际执行：验证 useItem 提交到背包快照
		assert.ok(!State.variables.inventory[0].equipped, '初始未装备');
		R().useItem(d.item.id, D().Player, D().Player, d.type);
		assert.ok(State.variables.inventory[0].equipped, 'equip 经 useItem 提交到快照');
	});

	test('battle dispatch：unequip → {type:unequip,item}，经 useItem 提交', () => {
		R().give('club'); R().equip('club');
		const item = R().reviveItem(State.variables.inventory[0]);
		const d = R().Battle.dispatchAction('0', 'unequip', item);
		assert.eq(d.type, 'unequip', '分派返回 unequip');
		assert.ok(State.variables.inventory[0].equipped, '初始已装备');
		R().useItem(d.item.id, D().Player, D().Player, d.type);
		assert.ok(!State.variables.inventory[0].equipped, 'unequip 经 useItem 提交到快照');
	});

	test('battle dispatch：use → {type:use,item}，进入目标选择', () => {
		R().give('club');
		const item = R().reviveItem(State.variables.inventory[0]);
		const d = R().Battle.dispatchAction('0', 'use', item);
		assert.eq(d.type, 'use', '分派返回 use');
		assert.ok(d.item && d.item.id === 'club', '携带道具');
	});

	test('battle dispatch：无动作参数 → 默认 use（只有「使用」一个选项时）', () => {
		R().give('bandage');
		const item = R().reviveItem(State.variables.inventory[0]);
		// 绷带没有 equip/unequip handler，动作层只有 use
		const d = R().Battle.dispatchAction('0', 'use', item);
		assert.eq(d.type, 'use', '默认为 use');
	});

	/* ---------- 通过 battle.execute() 驱动 #playerAction 的执行面断言 ---------- */
	/* 方法：interactive=true + properties 含 'player' → 走交互通路；
	 * 桩化 choice 返回预设序列；探针 RPG.useItem 记录调用。
	 *
	 * ⚠️ 桩化对象是 **类级单例** `setup.DND3.Player`（包内单例、跨用例长存）⇒
	 * 一律经 withPlayerStubs() 挂桩并在 finally **还原/删除**，否则泄漏会静默改写
	 * 后续用例（如 alliance/battle 的 interactive 用例）的前提（#1699）。 */
	const withPlayerStubs = async (stubs, fn) => {
		const P = setup.DND3.Player;
		const saved = new Map();
		const added = [];
		for (const k of Object.keys(stubs)) {
			if (Object.prototype.hasOwnProperty.call(P, k)) saved.set(k, P[k]);
			else added.push(k);
			P[k] = stubs[k];
		}
		try { return await fn(); } finally {
			for (const [k, v] of saved) P[k] = v;
			for (const k of added) delete P[k];   // 原本无自有属性 ⇒ 删回继承态
		}
	};

	test('battle interaction：interactive 选「装备」→ 经统一入口 act 提交（M5b）', async () => {
		const R2 = R(), D2 = setup.DND3;
		R2.give('club');
		const player = D2.Player;
		const enemy = new (R2.Character)({ name: '靶', hp: 9999, maxHp: 9999 });
		const battle = new (R2.Battle)(1, [player], [enemy], true);
		const seq = ['0', 'equip']; // ① 选道具 0 ② 选动作 equip
		battle.perform = () => {};
		/* #1752：交互通路统一经 `RPG.act`（✗ 旧 `useItem`）⇒ 断言改锚统一入口。
		 *   不变量未变：装备动作经「托管提交入口」执行、且 action 为 equip。 */
		const orig = R2.act, calls = [];
		R2.act = (actor, ref, target, act, from) => {
			calls.push([typeof ref === 'string' ? ref : ref?.id, act]);
			return orig(actor, ref, target, act, from);
		};
		try {
			await withPlayerStubs(
				{ items: State.variables.inventory, choice: async () => (seq.length ? seq.shift() : 'skip') },
				() => battle.execute()
			);
		} finally { R2.act = orig; }
		assert.ok(calls.length >= 1, '装备分支经统一入口 act 提交');
		assert.ok(calls.some(c => c[1] === 'equip'), '提交动作为 equip');
	});

	test('battle interaction：interactive 选「跳过」→ 不经 useItem、不选目标（M5d2）', async () => {
		const R2 = R(), D2 = setup.DND3;
		R2.give('club');
		const player = D2.Player;
		const enemy = new (R2.Character)({ name: '靶', hp: 9999, maxHp: 9999 });
		const battle = new (R2.Battle)(1, [player], [enemy], true);
		battle.perform = () => {};
		const orig = R2.useItem;
		let useItemCalled = false;
		R2.useItem = (...args) => { useItemCalled = true; return orig(...args); };
		let choiceCalls = 0;
		try {
			await withPlayerStubs(
				{
					items: State.variables.inventory,
					choice: async () => { choiceCalls++; return 'skip'; },
				},
				() => battle.execute()
			);
		} finally { R2.useItem = orig; }
		assert.ok(!useItemCalled, 'skip 不经 useItem');
		/* 「skip 不进入目标选择」的**直接**断言（#1699：原先只靠抛错收口，且计数变量从未断言）*/
		assert.eq(choiceCalls, 1, 'skip 后不再选目标（choice 全程只被调用 1 次）');
	});

	/* ============ `#1837`（试玩首单）：动作**抛错**不得打断整场战斗 ============
	 * 缺陷：资源的 `used()` 按**设计抛错**（`resources.js:50`「误当消耗品 use 时应当响」），
	 * 而 `RPG.act` 只有 `try/finally`（✗ catch）⇒ 异常上抛 ⇒ 打断 `execute()` 的 Promise
	 * ⇒ **整场 UI 静默冻结**（操作者实测「丢石獾无反应」：已问「对谁使用石料？」、之后再无输出）。
	 * ⇒ 修在战斗侧：`#actCatching` 把抛出转成 `rejected/action-threw`，走**既有拒绝文案通路**上屏。 */

	/** 跑一场「玩家对敌用某道具」的交互战，返回 { lines, thrown, ended } */
	const runUse = async (itemId, seq) => {
		const R2 = R(), D2 = setup.DND3;
		R2.give(itemId);
		const player = D2.Player;
		const enemy = new (R2.Character)({ name: '獾', hp: 9999, maxHp: 9999 });
		const battle = new (R2.Battle)(1, [player], [enemy], true);
		const lines = [];
		battle.perform = (t) => lines.push(String(t));
		let started = 0, ended = 0;
		const origStart = R2.turnBoundary.start, origEnd = R2.turnBoundary.end;
		/* ★成对不变量（E11 形）：`end` 次数须 == `start` 次数 —— 一场两名战斗者故各 ≥2，
		 *   故断言**等式**（✗ 硬编码 1：那是把「几个人」当不变量）。 */
		R2.turnBoundary.start = function (...a) { started++; return origStart.apply(this, a); };
		R2.turnBoundary.end = function (...a) { ended++; return origEnd.apply(this, a); };
		let thrown = null;
		try {
			await withPlayerStubs(
				{ items: State.variables.inventory, choice: async () => (seq.length ? seq.shift() : 'skip') },
				async () => { try { await battle.execute(); } catch (e) { thrown = e.message; } }
			);
		} finally { R2.turnBoundary.start = origStart; R2.turnBoundary.end = origEnd; }
		return { lines, thrown, started, ended };
	};

	test('★#1837 ①：战斗中对**资源**「使用→选目标」⇒ 不抛 ＋ 出**可读**文案（原样引道具自己的话）', async () => {
		const { lines, thrown, started, ended } = await runUse('rock', ['0', 'use', '獾']);
		assert.eq(thrown, null, '★动作抛错**不再**打断战斗（修前此处抛「石料是建设物资…」）');
		const hit = lines.find((l) => l.includes('没能出手'));
		assert.ok(hit, `★出了拒绝文案（✗ 静默冻结）：${JSON.stringify(lines)}`);
		/* ★`#1877` P2-2：玩家面文案改**白话**（✗ 英文动作名／系统话术）——
		 *   断**玩家面**有「因」（✗ 泛泛的「没能出手」）＋ **✗ 无内部术语**（英文动作名 `build`）。 */
		assert.ok(hit.includes('备料') && hit.includes('盖东西'),
			`★文案引道具自己的话（玩家看到「因」，✗ 泛泛的「没能出手」）：${hit}`);
		assert.ok(!/build|craft|gather|\u8bf7\u7528/.test(hit),
			`★玩家面✗ 出现内部术语（英文动作名／「请用…动作」）：${hit}`);
		assert.ok(lines.some((l) => l.includes('战斗结束')), '★回合照走（战斗跑到收尾，✗ 冻在第 1 回合）');
		assert.ok(started >= 2 && ended >= 2, `两方回合边界皆发（start=${started} end=${ended}）`);
		assert.eq(ended, started, '★turnEnd **成对**（异常路径亦经 #playerAction 的 finally 收尾，✗ 漏发）');
	});

	test('★#1837 ②：同一通路**回归**——武器「使用」仍正常结算（✗ 被新捕获吞掉）', async () => {
		const { lines, thrown } = await runUse('club', ['0', 'use', '獾']);
		assert.eq(thrown, null, '武器路径不抛');
		assert.ok(!lines.some((l) => l.includes('没能出手')), '★武器路径**不**落进拒绝文案（✗ 误捕）');
		assert.ok(lines.some((l) => l.includes('战斗结束')), '战斗正常收尾');
	});

	test('#1837 ③：拒绝语义未变——资源仍在背包（抛出路径零副作用）', async () => {
		await runUse('rock', ['0', 'use', '獾']);
		const slot = State.variables.inventory.find((s) => (s.id ?? s.name) === 'rock');
		assert.ok(slot, '★石料仍在背包（✗ 被误当消耗品扣掉）');
		assert.eq(slot.charges ?? 1, 1, '件数未变');
	});


	/* ============ `#1841`（`#1837` 远修）：**筛** —— 无战斗动作的道具不进选单 ============
	 * 资源类道具的 `used()` **按设计抛错** ⇒ 亮「使用」＝把玩家引到注定被拒的路
	 * （`#1839` 的**网**会出声，但**筛掉更好**）。声明形＝`stats.noBattleUse`（见下为何 ✗ 用
	 * `handlers.use` 之有无，也 ✗ 用 `stats.craftInput`）。 */

	const mkBattle = () => new (R().Battle)(1, [D().Player], [new (R().Character)({ name: '靶', hp: 1 })], true);

	test('★#1841 ①：纯资源**不进**选单；武器**仍在**且 `value` 保**原槽位下标**', () => {
		R().give('rock');   // 槽 0
		R().give('club');   // 槽 1
		R().give('wood');   // 槽 2
		const { itemOptions } = mkBattle().buildPlayerOptions(D().Player);
		assert.ok(!itemOptions.some((o) => o.text.includes('石料')), '★石料不在选单（✗ 引玩家进死路）');
		assert.ok(!itemOptions.some((o) => o.text.includes('木材')), '★木材不在选单');
		const club = itemOptions.find((o) => o.text.includes('木棒'));
		assert.ok(club, '武器仍在选单');
		/* ★本节最易错处：过滤后若**重编号**，取件会取到错的道具 */
		assert.eq(club.value, '1', '★`value` 保**原槽位下标**（木棒在槽 1，✗ 过滤后重编号为 0）');
		const slot = State.variables.inventory[Number(club.value)];
		assert.eq(slot.id ?? slot.name, 'club', '★按 `value` 取件取到的确是木棒（防重编号）');
	});

	test('★#1841 ②：零回归 —— 既有道具的选单与动作集**逐项不变**', () => {
		R().give('club');
		R().give('bandage');
		const { itemOptions, actionOptionsFor } = mkBattle().buildPlayerOptions(D().Player);
		assert.ok(itemOptions.some((o) => o.text.includes('木棒')), '木棒仍在');
		assert.ok(itemOptions.some((o) => o.text.includes('绷带')), '绷带仍在（它无 `noBattleUse`）');
		const bandage = R().reviveItem(State.variables.inventory[1]);
		assert.eq(actionOptionsFor(bandage).length, 1, '绷带仍只有 1 个动作');
		assert.eq(actionOptionsFor(bandage)[0].value, 'use', '且仍是 use');
	});

	test('★#1841 ③：资源的动作集为**空**（声明生效）', () => {
		R().give('rock');
		const { actionOptionsFor } = mkBattle().buildPlayerOptions(D().Player);
		const rock = R().reviveItem(State.variables.inventory[0]);
		assert.eq(actionOptionsFor(rock).length, 0, '★资源无任何战斗动作（`noBattleUse` 生效）');
		assert.eq(rock.stats.noBattleUse, true, '资源带 `noBattleUse` 声明');
	});

	test('★#1841 ④：**无空手能力**者只带资源 ⇒ 选单只剩「跳过」＋ **出声说明**（✗ 静默空菜单）', async () => {
		/* ★`#1854` 后本格**改了主体**：`DND3.Player` 现有「空手打击」⇒ 不再是「只剩跳过」。
		 *   本格要守的是**那条退路**本身（「没有任何战斗手段 ⇒ 出声」）⇒ 改用**无空手能力**的普通角色
		 *   （`new Character`：instance 无 `unarmed`）。⇒ 该支仍须存在（✗ 因空手落地就删掉它）。 */
		R().give('rock');
		const lines = [];
		/* ⚠ `properties: ['player']` 是**必要**的：交互通路由 `isPlayerControlled` 判（`40-battle.js`）——
		 *   缺它则走**自动**通路（不接受选单、也不出本条说明）。 */
		const plain = new (R().Character)({ name: '路人', hp: 10, maxHp: 10, stats: {}, effects: [],
			properties: ['player'] });
		plain.items = State.variables.inventory;
		const foe = new (R().Character)({ name: '靶', hp: 1 });
		const battle = new (R().Battle)(2, [plain], [foe], true);
		battle.perform = (t) => lines.push(String(t));
		const saved = plain.choice;
		plain.choice = async () => 'skip';
		try { await battle.execute(); } finally { plain.choice = saved; }
		assert.ok(lines.some((l) => l.includes('在战斗中都用不上')), `★出了说明（✗ 静默空菜单）：${JSON.stringify(lines)}`);
	});

	test('★`#1877` P1-5②：**非战斗道具不进选单**（纪念品／采集点／图纸／弹药）＋ 对照臂', () => {
		/* 动因（操作者复测）：「『旧硬币』作为战斗道具可选，使用后提示『只是纪念品…』，白白浪费一回合
		 *   —— 无用的物品仍应从战斗道具列表中过滤」。
		 *   ★判据（**声明的能力**，✗ 猜名字）：无装备路径，且 `used()` 只出声／抛「请用别的动作」
		 *     ⇒ 声明 `noBattleUse`（`#1841`／`#1844` 的既有机质，✗ 另立「纪念品」第二套权威源）。
		 *   ⚠ **对照臂是必须的**：只断言「被滤掉」无法区分「滤对了」与「选单整个坏了」。 */
		const 应滤 = ['coin', 'iron-key', 'iron-message', 'stone-pile', 'farm-plot',
			'forge-longsword', 'bullets-firearm'];
		const 应留 = ['bandage', 'ration'];                    // 真能战斗用（治疗／进食）
		const 应留但不在此列 = 'trap-fire';                     // ★陷阱**真造成伤害** ⇒ 须留（本席实测反例）
		State.variables.inventory = [...应滤, ...应留, 应留但不在此列]
			.map((id) => R().createItem(id).toJSON());
		const battle = mkBattle();
		const opts = battle.buildPlayerOptions(setup.DND3.Player).itemOptions;
		const ids = opts.map((o) => o.value);
		for (const id of 应滤) {
			assert.ok(!ids.includes(String(State.variables.inventory.findIndex((s) => s.id === id))),
				`★「${id}」不该进战斗选单（选了只是白耗一回合）：${JSON.stringify(opts.map((o) => o.text))}`);
		}
		for (const id of 应留) {
			assert.ok(opts.some((o) => o.text.includes(R().createItem(id).name)),
				`★对照臂：「${id}」能战斗用 ⇒ 须**在**选单里（否则本格测的是「选单坏了」）：${JSON.stringify(opts.map((o) => o.text))}`);
		}
		assert.ok(opts.some((o) => o.text.includes(R().createItem(应留但不在此列).name)),
			`★反例臂：陷阱**有机制效果** ⇒ ✗ 被一并滤掉（本席实测其 used() 真造成伤害）：${JSON.stringify(opts.map((o) => o.text))}`);
	});
	test('★#1841 ⑤：**唯一**动作不是 use 时须**用它**（✗ 沿用默认 `use` —— 本笔前的隐含假定）', async () => {
		/* 造一个「不可战斗用、但可装备」的道具 ⇒ 动作集恰为 `['equip']`（长度 1）
		 *   ⇒ 走真通路时**不该再问动作**、且提交的 action 须是 `equip`。
		 *   ★本笔前：`actions.length > 1` 不成立 ⇒ `action` 留在默认 `'use'` ⇒ **静默当成 use 提交**。 */
		const id = 'zz-probe-equip-only';
		R().defItem({
			id, name: '试验包', stats: { noBattleUse: true },
			used() { throw new Error('唯一动作不是 use ⇒ 不该走到 use'); },
			actions: { equip: R().slotEquip },
		});
		const battle = mkBattle();
		const lines = []; battle.perform = (t) => lines.push(String(t));
		const P = setup.DND3.Player;
		const saved = { items: P.items, choice: P.choice };
		P.items = State.variables.inventory;
		let actCalls = [];
		const origAct = R().act;
		try {
			R().give(id);
			P.choice = async () => '0';                 // 只有 1 个动作 ⇒ 不再问「做什么」
			R().act = (actor, ref, target, act, from) => { actCalls.push(act); return origAct(actor, ref, target, act, from); };
			await battle.execute();
		} finally { R().act = origAct; P.items = saved.items; P.choice = saved.choice; R().items.delete(id); }
		assert.ok(actCalls.length >= 1, '经统一入口提交');
		assert.eq(actCalls[0], 'equip', `★提交的动作是**唯一**那个（equip），✗ 默认 use（实测 ${JSON.stringify(actCalls)}）`);
	});

	test('★#1841 ⑥【同族一致棘轮】：`craftInput` ⇒ `noBattleUse`（差集须**显式**，✗ 静默分叉）', () => {
		/* ★由来（`#1844` RC · `dev-9` 抓）：首版只给 `resources.js` 的共享建造器加声明，
		 *   **漏了 `iron-ore`**（它在 `iron-lineage.js` 单独声明）⇒ `craftInput` 6 件 vs
		 *   `noBattleUse` 5 件 ⇒ `climb2.js` 掉落的铁矿在战斗选单**仍亮「使用」**（病没治）。
		 *   ★根因：本席核了 `craftInput` 的**数**，却没核它的**出处**。
		 *   ⇒ 本格把「两者**不得静默分叉**」机械化：凡 `craftInput` 必 `noBattleUse`；
		 *     若将来确有「既是建造输入、又能战斗使用」的道具，**必须**加进下面的白名单
		 *     （＝把「分叉」变成**显式决定**，✗ 靠人记得同步两处）。 */
		const 显式例外 = [];   // ← 有正当理由者列此（空 ⇒ 两集必须重合）
		const 分叉 = [];
		for (const [id] of R().items) {
			if (id.startsWith('zz-probe')) continue;
			const st = R().createItem(id)?.stats ?? {};
			if (st.craftInput && !st.noBattleUse && !显式例外.includes(id)) 分叉.push(id);
		}
		assert.eq(分叉.length, 0,
			`★建造输入件必须同时声明「战斗无动作」（✗ 静默分叉 ⇒ 选单会亮出注定被拒的「使用」）：${JSON.stringify(分叉)}`);
		/* 反向也钉：声明了 `noBattleUse` 却**不是**建造输入的件，是**正常**的（剧情道具等）
		 *   ⇒ 不作断言，仅记录数量，供将来读者判规模。 */
		let 仅无战斗 = 0;
		for (const [id] of R().items) {
			if (id.startsWith('zz-probe')) continue;
			const st = R().createItem(id)?.stats ?? {};
			if (st.noBattleUse && !st.craftInput) 仅无战斗++;
		}
		assert.ok(仅无战斗 >= 0, `（仅声明「无战斗动作」而非建造输入者：${仅无战斗} 件 —— 合法，仅记录）`);
	});

})();
