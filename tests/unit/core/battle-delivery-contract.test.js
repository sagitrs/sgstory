/* `sgstory#2026`（E3）· **固定交付与战果回调的引擎契约** —— 把 #2026 勘察评论
 *   （6014199843，探针档已删 ⇒ **票面折叠块为准**）里**可机械化**的面固化成判据。
 *
 * ## 为什么单开一档
 *   本档的面**横跨** 40-battle（回调序）／30-inventory（投递口）／47-outcome（战果解析器）／80-save（一次性账），
 *   与 `battle-protocol.test.js`／`entity-identity.test.js` **同族**（跨单元契约档）；
 *   ✗ 不是新入口：`build.py` 的清单**自动发现** `tests/unit/` 下的 `*.test.js`，✗ 不动工作流。
 *
 * ## 受测树锚（照 `#384` 符号锚口径：行号只是定位器）
 *   · 战果解析器        `src/core/47-outcome.js` 的 `RPG.outcomeResolver.resolve`
 *   · 掉落 → 回调的序    `src/core/40-battle.js`：`RPG.loot(enemy)` 在 `emit('battle:end', …)` **之前**
 *   · 打晕护栏          `40-battle.js` 的 `this.isOut(enemy) && !RPG.isKnockedOut(enemy)` 那一行
 *   · 投递唯一实现      `src/core/30-inventory.js` 的 `RPG.deposit`；`RPG.loot` 的**名字前置轮**（`reviveItem`）
 *   · 一次性账          `RPG.save.recordCleared`（幂等集合账；判据在 `save-contract.test.js`，本档**✗ 不重复造**）
 *
 * ## 「正反两向钉」（t4 交接口径：**无概念最易被无声加**）
 *   「某概念**不存在**」这类判据最容易变成**只绿不红**的死格 ⇒ 本档对每条「0 命中／0 调用」型
 *   判据都配一条**正控**：证明该判据**能判**（合成样本须命中），再断真实面**没命中**。
 *   口径出处：`gates.md ## C`「『没报错』不等于判过 —— 先证判据必经它要判的那条路」。
 */
(() => {
	const R = () => setup.RPG;

	/** 一个**无随机**的战斗前置：敌方已出局 ⇒ `execute()` 不掷任何骰子（✗ 不用必杀剑 ⇒ ✗ 不依赖命中率）。 */
	const 新角色 = (名, hp, extra = {}) => new (R().Character)({ name: 名, hp, maxHp: hp, ...extra });
	const 备币敌 = (extra = {}) => 新角色('契约敌', 0, { items: [{ id: 'coin' }], ...extra });

	/* ══════ ① `battle:end` 载荷形：只有 players／enemies（★无战果字段） ══════
	 * 勘察读数：载荷键集恰 `{players, enemies}`（无 outcome）；战果须由故事按解析器自取。
	 * ⚠ 本格钉的是**故事侧依赖**（S4／S5 的消费码照此写）：引擎将来若给载荷加战果字段，
	 *   本格**会红** —— 那时**该红**：它意味着 S4／S5 的消费码可以简化，须同步改那两票。 */
	test('★#2026 ①：`battle:end` 载荷只有 players／enemies（战果不在载荷里）', async () => {
		const 载荷 = [];
		const 退订 = R().events.on('battle:end', (p) => 载荷.push(p));
		try {
			const 我 = 新角色('契约测试员', 10);
			const 敌 = 备币敌();
			await new (R().Battle)(3, [我], [敌]).execute();
			assert.eq(载荷.length, 1, '恰发一次 battle:end');
			assert.eq(Object.keys(载荷[0]).sort().join(','), 'enemies,players',
				`★载荷键集须恰是 players／enemies（实得 ${JSON.stringify(Object.keys(载荷[0]))}）`);
			assert.ok(载荷[0].players.includes(我) && 载荷[0].enemies.includes(敌),
				'★载荷里的 players／enemies 须就是**参战那批角色对象**（故事据它自行判战果）');
		} finally { 退订(); }
	});

	/* ══════ ② 掉落**先于**回调：回调到达时战利品已在背包（★回调里撤不回来） ══════
	 * 勘察读数：事件序 deposit 序 1 ⇒ battle:end 序 2。本条是 S4「交付口设计须知」的机械形。 */
	test('★#2026 ②：掉落先于回调 —— battle:end 到达时战利品**已入袋**', async () => {
		let 回调时袋 = null;
		const 敌 = 备币敌();
		const 退订 = R().events.on('battle:end', () => {
			回调时袋 = JSON.stringify(State.variables.inventory ?? []);
		});
		try {
			State.variables.inventory = [];
			await new (R().Battle)(3, [新角色('契约测试员', 10)], [敌]).execute();
		} finally { 退订(); }
		assert.ok(回调时袋 != null, '前置：battle:end 已到达');
		assert.ok(回调时袋.includes('"coin"'),
			`★回调到达时 coin 须**已在背包**（实得 ${回调时袋}）⇒ 掉落先于回调，故事无法在回调里「撤」`);
		assert.eq(JSON.stringify(敌.items), '[]', '未装备道具已离开尸体（同一笔掉落）');
	});

	/* ══════ ③ 打晕 ≠ 打死 ⇒ 打晕者**不掉落**（40-battle.js 的 `isKnockedOut` 护栏） ══════
	 * `#1854` 的 MSRD 语义；本格补的是**战斗面**（既有 `inventory.test.js` 只判「装备不掉落」）。 */
	test('★#2026 ③：被打晕的敌人不掉落（打晕 ≠ 打死）', async () => {
		State.variables.inventory = [];
		const 昏敌 = 新角色('昏敌', 6, { items: [{ id: 'coin' }] });
		昏敌.nonlethal = 10;                                  // 非致命 > hp ⇒ 打晕（hp 不变）
		assert.ok(R().isKnockedOut(昏敌), '前置：确为**打晕**（✗ 死亡）');
		assert.ok(昏敌.isDown, '前置：打晕者算「出局」（本场战斗因此立即结束）');
		await new (R().Battle)(3, [新角色('契约测试员', 10)], [昏敌]).execute();
		assert.ok(!R().has('coin'), '★打晕者**不掉落**（coin 不得进玩家背包）');
		assert.eq(JSON.stringify(昏敌.items), '[{"id":"coin"}]', '战利品留在晕倒者身上（✗ 被取走）');
	});

	/* ══════ ④ `RPG.loot` 的失败面：抛点在**投递轮之前** ⇒ 不产生半投递 ══════
	 * 勘察读数（P8）：抛点＝名字前置轮（`reviveItem`）⇒ `RPG.deposit` 调用 **0** 次、
	 *   `$inventory` 与尸体**两处都不变**。⚠ 「正反两向」：正向＝**抛得出来**（能看见失败），
	 *   反向＝**两处状态逐字不变**（✗ 半投递）。 */
	test('★#2026 ④：`loot` 遇未注册 id ⇒ **投递轮之前**就抛（两处状态逐字不变）', () => {
		State.variables.inventory = [];
		const 尸体 = 新角色('带坏件的尸体', 0, { items: [{ id: 'coin' }, { id: 'e3-未注册道具' }] });
		let 抛 = null;
		try { R().loot(尸体); } catch (e) { 抛 = String(e?.message ?? e); }
		assert.ok(抛 != null, '正向：未注册 id ⇒ **具名抛**（✗ 静默跳过）');
		assert.ok(/未注册的道具/.test(抛), `正向：抛文案须具名（实得 ${抛}）`);
		assert.eq(JSON.stringify(State.variables.inventory), '[]', '反向：$inventory 逐字不变（✗ 半投递）');
		assert.eq(JSON.stringify(尸体.items), '[{"id":"coin"},{"id":"e3-未注册道具"}]',
			'反向：尸体上两件都还在（coin ✗ 被先取走）');
	});

	/* ══════ ⑤ 防回归锚 A：引擎**不消费**战果解析器（它只给故事用） ══════
	 * 正反两向：反向＝整场战斗里 `resolve` **0 次**被调；正向＝**直接调用可得战果**（判据面活着）。 */
	test('★#2026 ⑤：`outcomeResolver` —— 引擎 0 调（★解析器是给故事用的）', async () => {
		let 调用 = 0;
		const 原 = R().outcomeResolver.resolve;
		R().outcomeResolver.resolve = function (...a) { 调用 += 1; return 原.apply(this, a); };
		try {
			await new (R().Battle)(3, [新角色('契约测试员', 10)], [备币敌()]).execute();
		} finally { R().outcomeResolver.resolve = 原; }
		assert.eq(调用, 0, '反向：引擎不得自行调 resolve（战果由**故事**取；引擎若调它 ⇒ 本格红，须同步改 S4／S5 判据）');
		const 正 = R().outcomeResolver.resolve({ players: [新角色('我', 10)], enemies: [新角色('敌', 0)] });
		assert.eq(正.outcome, 'victory', '正向：判据面活着（直接调用拿得到战果）');
	});

	/* ══════ ⑥ 防回归锚 B：引擎**没有容量面**（容量是故事政策） ══════
	 * 正向＝「失败可见」那条路是活的（未注册 id 具名抛）；反向＝投递**不因容量失败**、公开面无容量名。 */
	test('★#2026 ⑥：引擎无容量面 —— 投递不因容量失败', () => {
		const 巨袋 = Array.from({ length: 5000 }, (_, i) => ({ id: 'x' + i }));
		assert.eq(R().deposit(巨袋, 'coin', 1), 1, '正向：5000 槽的袋子照样收下（✗ 无「装不下」这一态）');
		assert.eq(巨袋.length, 5001, '正向：确已入袋');
		let 抛 = null;
		try { R().deposit([], 'e3-未注册道具'); } catch (e) { 抛 = String(e?.message ?? e); }
		assert.ok(/未注册的道具/.test(抛 ?? ''), '正向：唯一的失败形态（未注册 id）**看得见**（✗ 静默失败）');
		const 面 = Object.keys(R()).filter((k) => 名面命中(k));
		assert.eq(JSON.stringify(面), '[]', `反向：引擎公开面不得有容量名（实得 ${JSON.stringify(面)}）；若将来引入 ⇒ 本格红，须同步改 S4`);
	});

	/* ══════ ⑦ 防回归锚 C：「领取／已领」概念在引擎里**不存在** ══════
	 * 一次性交付的账由**故事**持有（`recordCleared` 已有判据 ⇒ `save-contract.test.js`，本档 ✗ 重复造）；
	 * 引擎既无「已领」字段，投递也不留任何这类事实。 */
	test('★#2026 ⑦：引擎无「领取／已领」概念（投递只写背包）', () => {
		/* 先证 matcher **能判**（✗ 死区）——这是本条「正反两向」的正向那一半 */
		assert.eq(名面命中('e3ClaimedRewards'), true, '正向：matcher 对合成样本须命中（✗ 只绿不红的死格）');
		assert.eq(名面命中('coin'), false, '反向：matcher 对无关名须放过（✗ 一律命中＝没有判别力）');

		State.variables.inventory = [];
		const 键前 = Object.keys(State.variables).sort().join(',');
		R().give('coin', 1);
		assert.ok(R().has('coin'), '前置：投递确实发生了');
		const 新键 = Object.keys(State.variables).sort().filter((k) => !键前.split(',').includes(k));
		assert.eq(JSON.stringify(新键.filter(名面命中)), '[]',
			`反向：投递新增的 $ 键里**不得有**「领取／容量」名（实得 ${JSON.stringify(新键)}）`);
		assert.ok(新键.every((k) => k === 'rpgNotices' || k === 'inventory'),
			`反向：投递只写「背包 ＋ 通知」两处（实得 ${JSON.stringify(新键)}）`);
		const 命中 = [...Object.keys(R()), ...Object.keys(State.variables)].filter((k) => 名面命中(k));
		assert.eq(JSON.stringify(命中), '[]', `反向：公开面与存档面均无「领取／容量」名（实得 ${JSON.stringify(命中)}）`);
	});

	/** 名面 matcher（判「这个概念有没有一个名字」）—— 本档三条「0 命中」型判据共用**一份**。 */
	function 名面命中(名) {
		return /claim|领取|已领|容量|capacity/i.test(String(名));
	}
})();
