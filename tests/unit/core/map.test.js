/* core/60-map 的单元测试：有向图校验、移动、条件出口、MapScene */
(() => {
	const R = () => setup.RPG;

	/** 造一张测试地图：A ↔ B → C（C 是死胡同） */
	const makeMap = () => {
		const map = new (R().WorldMap)({ id: 'unit' });
		map.addLocation(new (R().Location)({ id: 'a', name: 'A', desc: '房间A' }));
		map.addLocation(new (R().Location)({ id: 'b', name: 'B', desc: '房间B' }));
		map.addLocation(new (R().Location)({ id: 'c', name: 'C', desc: '房间C' }));
		map.addPath({ from: 'a', to: 'b', text: '去B' });
		map.addPath({ from: 'b', to: 'a', text: '回A' });
		map.addPath({ from: 'b', to: 'c', text: '去C（死胡同）' });
		return map;
	};

	/* ---------- 图结构校验 ---------- */

	test('map：重复节点抛错（无重复点保证）', () => {
		const map = new (R().WorldMap)();
		map.addLocation(new (R().Location)({ id: 'x' }));
		assert.throws(() => map.addLocation(new (R().Location)({ id: 'x' })), '重复 id');
	});

	test('map：悬空边抛错（引用不存在的节点）', () => {
		const map = new (R().WorldMap)();
		map.addLocation(new (R().Location)({ id: 'a' }));
		assert.throws(() => map.addPath({ from: 'a', to: 'ghost', text: '去幽灵' }), 'to 不存在');
		assert.throws(() => map.addPath({ from: 'ghost', to: 'a', text: '从幽灵来' }), 'from 不存在');
	});

	test('map：validate 检测孤立点', () => {
		const map = new (R().WorldMap)();
		map.addLocation(new (R().Location)({ id: 'a' }));
		map.addLocation(new (R().Location)({ id: 'orphan' })); // 孤立
		map.addPath({ from: 'a', to: 'a', text: '自环' });
		const problems = map.validate();
		assert.ok(problems.some((p) => p.includes('orphan')), `检测到孤立点: ${problems}`);
	});

	test('map：validateConnectivity 检测不可达', () => {
		const map = makeMap();
		// 加一个不可达的节点
		map.addLocation(new (R().Location)({ id: 'island' }));
		const unreachable = map.validateConnectivity('a');
		assert.ok(unreachable.some((p) => p.includes('island')), `检测到不可达: ${unreachable}`);
	});

	test('map：完整连通图无问题', () => {
		const map = makeMap();
		assert.eq(map.validate().length, 0, '无孤立/悬空');
		assert.eq(map.validateConnectivity('a').length, 0, '从 A 可达全部');
	});

	/* ---------- 移动 ---------- */

	test('map：moveTo 触发 onExit / onEnter', () => {
		const log = [];
		const map = new (R().WorldMap)();
		map.addLocation(new (R().Location)({
			id: 'a', onExit: () => log.push('exit-a'),
		}));
		map.addLocation(new (R().Location)({
			id: 'b', onEnter: () => log.push('enter-b'),
		}));
		map.addPath({ from: 'a', to: 'b', text: '走' });
		map.moveTo('a');
		map.moveTo('b');
		assert.eq(log.join(','), 'exit-a,enter-b', '钩子按序触发');
	});

	test('map：条件出口——when 为假时隐藏', () => {
		const map = new (R().WorldMap)();
		map.addLocation(new (R().Location)({ id: 'a' }));
		map.addLocation(new (R().Location)({ id: 'b' }));
		map.addLocation(new (R().Location)({ id: 'locked' }));
		map.addPath({ from: 'a', to: 'b', text: '开着的门' });
		map.addPath({ from: 'a', to: 'locked', text: '锁着的门', when: () => false });
		const exits = map.exitsFrom('a');
		assert.eq(exits.length, 1, '只有一个可用出口');
		assert.eq(exits[0].to, 'b', '锁着的被隐藏');
	});

	test('map：Exit.action 在移动时触发', () => {
		let fired = false;
		const map = new (R().WorldMap)();
		map.addLocation(new (R().Location)({ id: 'a' }));
		map.addLocation(new (R().Location)({ id: 'b' }));
		map.addPath({ from: 'a', to: 'b', text: '走', action: () => { fired = true; } });
		map.moveTo('a');
		// 模拟选择出口
		const exits = map.exitsFrom('a');
		exits[0].action();
		map.moveTo(exits[0].to);
		assert.ok(fired, 'action 已触发');
	});

	test('map：render 返回描述与出口', () => {
		const map = makeMap();
		map.moveTo('b');
		const { desc, exits } = map.render();
		assert.ok(desc.includes('B'), '描述正确');
		assert.eq(exits.length, 2, 'B 有两个出口（回A + 去C）');
	});

	/* ---------- MapScene ---------- */

	/* ══ ★`sgstory#1904`：**进场必印场景头**（同地点读档不再丢头）＋ **每次进场恰一份** ═════════════
	 *   病灶：`#headerLoc` 随**实例**存活，而 `map.current` **随存档** ⇒ 同地点读档后两者相等
	 *   ⇒ 头不重印（屏幕上只剩选项 ✗）。修＝`execute()` 进场处清一次（自环重绘不走 `execute()` ✓）。
	 *   三条臂（★读**真输出** `State.variables.rpgNotices`，✗ 不读源码文本）：
	 *     ① **进场即印**：一次 `execute()` ⇒ 「【A】」恰 1 次；
	 *     ② **再现即印**（＝本票治的那一面）：**同一实例、同一地点**再 `execute()` ⇒ **再印一次** ✓
	 *        （★读档路径正是「宿主再进场」⇒ 这一臂就是那个果 ✓）；
	 *     ③ **回归护**：每次 `execute()` 的份数**恰 1**（✗ 2 —— 若有人在 `#renderLocation` 里又放开无条件印，
	 *        这条会红 ✓ ⇒ 保住「同层重复动作只印一次」的既有面 ✓）。
	 */
	test('map：#1904 进场必印场景头（同地点再进场须重印 · 每次恰一份）', async () => {
		const map = makeMap();
		const scene = new (R().MapScene)({ id: 'h1904', map, start: 'a' });
		/* ★★驱动法（房内实测）：`#renderLocation` **先印头**、再 `await this.choice(options)`，
		 *   且循环**必然再问**（动作 ⇒ 重绘；出口 ⇒ moveTo＋重绘 ⇒ 又印＋又问）⇒ 若让桩**正常返回**，
		 *   `execute()` 永不结算（本席实测：整轮单测挂住、rc=13 ✗）。
		 *   ⇒ 桩成**抛具名标记**：头在 await **之前**已印 ✓ ⇒ 印完即逃出循环 ✓ —— 断言仍读**真报文** ✓。 */
		const 逃 = Symbol('逃出循环');
		scene.choice = async () => { throw 逃; };
		const 跑一次 = async () => {
			State.variables.rpgNotices = [];
			try { await scene.execute(); } catch (e) { if (e !== 逃) throw e; }   // ★只吞本席的标记，别吞真错
		};
		const 头数 = () => (State.variables.rpgNotices ?? []).filter((n) => String(n.text).includes('【A】')).length;

		await 跑一次();
		assert.eq(头数(), 1, `★① 进场须印一次【A】（实得 ${头数()}）：${JSON.stringify((State.variables.rpgNotices ?? []).map((n) => n.text))}`);

		await 跑一次();          // ★同一实例 · 同一地点（＝读档后宿主再进场那一形）
		assert.eq(头数(), 1, `★② 同地点**再进场须重印**（本票所治：读档后场景头丢失）—— 实得 ${头数()}`);

		/* ★③ **回归护（既有面「同层重复动作只印一次」）**：让 choice **返回一个动作**（`a0`）
		 *   ⇒ 自环重绘（**不经** `execute()`）⇒ 那一趟**不得**再印头 ✓。
		 *   ⚠ 若有人把 `#renderLocation` 的判据改成**无条件印**，这条会红（第二趟变 2）✓。 */
		/* ★要「同地点重绘」就得有**动作**（`makeMap` 的地点没有 ⇒ 得自建一张带动作的图 ✓）——
		 *   动作 ⇒ 自环重绘（**同地点** ⇒ 走 `#renderLocation` 的判据面 ✓，✗ 不经 `execute()` ✓）。 */
		const map2 = new (R().WorldMap)({ id: 'h1904b' });
		map2.addLocation(new (R().Location)({
			id: 'a', name: 'A', desc: '房间A',
			actions: [{ text: '原地看看', action: () => {} }],     // ★空转动作 ⇒ 只为触发自环重绘
		}));
		const s2 = new (R().MapScene)({ id: 'h1904b', map: map2, start: 'a' });
		const 头数2 = () => (State.variables.rpgNotices ?? []).filter((n) => String(n.text).includes('【A】')).length;
		let 第几次 = 0;
		s2.choice = async () => { if (++第几次 === 1) return 'a0'; throw 逃; };   // ★首问给动作 ⇒ 自环重绘；再问逃出
		State.variables.rpgNotices = [];
		try { await s2.execute(); } catch (e) { if (e !== 逃) throw e; }
		assert.eq(头数2(), 1, `★③ 自环重绘**不得**再印头（同层重复动作只印一次）—— 实得 ${头数2()}`);
		console.log('  #1904：进场必印 ✓｜同地点再进场重印 ✓｜每次恰一份 ✓｜自环重绘不重印（既有面）✓');
	});


	test('map：MapScene 构造校验（起点必须在图上）', () => {
		const map = makeMap();
		assert.throws(() => new (R().MapScene)({ id: 'x', map, start: 'ghost' }));
	});

	test('map：MapScene 是 Scene 子类', () => {
		const map = makeMap();
		const scene = new (R().MapScene)({ id: 'x', map, start: 'a' });
		assert.ok(scene instanceof R().Scene);
		assert.ok(scene instanceof R().MapScene);
	});

	test('map：reachableFrom BFS', () => {
		const map = makeMap();
		// A → B → C，B → A
		const from = map.reachableFrom('a');
		assert.ok(from.has('a') && from.has('b') && from.has('c'), 'A 可达 B 和 C');
		// C 是死胡同，从 C 只能到 C
		const fromC = map.reachableFrom('c');
		assert.ok(fromC.has('c') && !fromC.has('a'), 'C 不可达 A（单向）');
	});

	/* ---------- 段落边界检测（#1749 D2）----------

	/* 缺陷：MapScene 的 action 里若做段落导航（如 Engine.play('攻击哥布林')），
	 * 旧地图这一屏已随段落退场，却仍会 `await this.#renderLocation()` ⇒ 把地图与选项
	 * 画进新段落（跨段渲染）。判据：action 返回后 `State.passage` 是否已变。
	 *
	 * 本仓 shims 的 State 是普通对象（无 passage），故用例直接赋值以表达「宿主段落」。
	 * 这在真机成立：`enginePlay` 内 `State.create(passage.name)` 同步更新 `State.passage`。 */
	const d2Scene = (actions, paths = []) => {
		const map = new (R().WorldMap)({ id: 'd2' });
		map.addLocation(new (R().Location)({ id: 'a', name: 'A', actions }));
		for (const p2 of paths) {
			map.addLocation(new (R().Location)({ id: p2.to, name: p2.to }));
			map.addPath({ from: 'a', to: p2.to, text: `去${p2.to}` });
		}
		return new (R().MapScene)({ id: 'd2', map, start: 'a' });
	};

	test('map：D2 —— action 导航离开后**不再重绘**（旧地图不画进新段落）', async () => {
		State.passage = '探索';
		const scene = d2Scene([{ text: () => '挥棒攻击', action: () => { State.passage = '攻击哥布林'; } }]);
		let renders = 0;
		/* ★桩**必须有上界**（#1808 D 席 MAJOR）：本用例的判别力正在于「撤掉 D2 守卫 ⇒
		 * 重绘不再停止」——若无上界，撤守卫时桩照旧返 'a0' ⇒ **无限重绘 ⇒ 堆耗尽 abort**，
		 * 失败形变成 `Aborted (core dumped)`（读日志的人会当环境问题），且**掩盖同文件其它红**。
		 * 加上界 ⇒ 撤守卫时给**一句可诊断的红**。 */
		scene.choice = async () => {
			renders++;
			if (renders > 5) throw new Error(`未收敛：choice 被反复调用 ${renders} 次（D2 守卫失效？）`);
			return 'a0';
		};
		await scene.execute();
		assert.eq(renders, 1, `导航离开后不得重绘：choice 应只调用 1 次，实为 ${renders}`);
	});

	test('map：D2 对照 —— 未导航的位置交互**照旧自循环重绘**', async () => {
		State.passage = '探索';
		let acted = 0;
		const scene = d2Scene([{ text: () => '翻找杂物', action: () => { acted++; } }], [{ to: 'b' }]);
		let renders = 0;
		/* 首次选位置交互（不导航）⇒ 应重绘；第二次选出口 ⇒ 结束 */
		scene.choice = async () => {
			renders++;
			if (renders > 5) throw new Error(`未收敛：choice 被反复调用 ${renders} 次`);
			return renders === 1 ? 'a0' : 'e0';
		};
		await scene.execute();
		assert.eq(acted, 1, 'action 已执行');
		assert.eq(renders, 2, `未导航应自循环重绘：choice 应调用 2 次，实为 ${renders}`);
		assert.eq(scene.map.current, 'b', '出口导航仍生效（不受本判据影响）');
	});

	test('map：D2 边界 —— 宿主无 `State.passage` 读数时不判定（退回旧行为）', async () => {
		State.passage = undefined; // 非 SugarCube 宿主（纯 core 场景）
		const scene = d2Scene([{ text: () => '做点什么', action: () => {} }], [{ to: 'b' }]);
		let renders = 0;
		scene.choice = async () => {
			renders++;
			if (renders > 5) throw new Error(`未收敛：choice 被反复调用 ${renders} 次`);
			return renders === 1 ? 'a0' : 'e0';
		};
		await scene.execute();
		assert.eq(renders, 2, `读数缺失 ⇒ 不判定（照旧重绘）：实为 ${renders}`);
	});

	test('map：D2 边界 —— 渲染后宿主读数**消失**（动作后读不到）⇒ 不判定', async () => {
		/* 覆盖 `#leftPassage()` 的 `now != null` 子句（#1808 D 席 MN-2）：
		 * 渲染时读得到、action 途中宿主读数被拆掉 ⇒ 无从比对 ⇒ 退回旧行为（重绘）。
		 * 这是防御性子句：宁可多绘一次，也不因读数缺失而误判「已离开段落」而漏绘。 */
		State.passage = '探索';
		const scene = d2Scene([{ text: () => '做点什么', action: () => { State.passage = undefined; } }],
			[{ to: 'b' }]);
		let renders = 0;
		scene.choice = async () => {
			renders++;
			if (renders > 5) throw new Error(`未收敛：choice 被反复调用 ${renders} 次`);
			return renders === 1 ? 'a0' : 'e0';
		};
		await scene.execute();
		assert.eq(renders, 2, `动作后读数消失 ⇒ 不判定（照旧重绘）：实为 ${renders}`);
	});

	test('map：D2 边界 —— 渲染时**无读数**、动作后才出现 ⇒ 无基线可比 ⇒ 不判定', async () => {
		/* 覆盖 `#passageAtRender != null` 子句（#1808 D 席 MN-2）：渲染时宿主尚未给出段落读数，
		 * 中途才出现（如宿主在动作里完成初始化）——没有基线就无从比对 ⇒ 退回旧行为。 */
		State.passage = undefined;
		const scene = d2Scene([{ text: () => '做点什么', action: () => { State.passage = '攻击哥布林'; } }],
			[{ to: 'b' }]);
		let renders = 0;
		scene.choice = async () => {
			renders++;
			if (renders > 5) throw new Error(`未收敛：choice 被反复调用 ${renders} 次`);
			return renders === 1 ? 'a0' : 'e0';
		};
		await scene.execute();
		assert.eq(renders, 2, `无渲染期基线 ⇒ 不判定（照旧重绘）：实为 ${renders}`);
	});

	/* ---------- 场景头「只在进场时印一次」（`#1855` P2-3 甲案 · `#1879`）----------

	 * 缺陷：`#renderLocation()` 原先**无条件**印 `【层名】`＋desc，而位置交互是**自环重绘**
	 * （action 跑完再画一屏）⇒ 同层重复动作 ⇒ 场景头**整段堆叠**。
	 * 修法：`#headerLoc` 记「上次印过头的地点」，同地点不再印；离场时清空 ⇒ 回来重印。
	 *
	 * ★三把刀的共同装置：**捕获 `perform` 上屏文本**（`perform` 定义在 `Object.prototype` 上，
	 *   场景实例覆写即可接住 —— 与 `battle.perform = (t) => lines.push(...)` 同法）。
	 *   ★判据**只数 `【…】` 形的场景头**（✗ 不数 desc／选项文案 —— 那些本就会重复）。
	 *   ⚠ 末层 `z` 无动作无出口 ⇒ `#renderLocation` 命中「没有可以做的事」即**自然收敛**
	 *     （✗ 用异常终止 —— 那会把「未收敛」与「判据失败」混成一个红）。 */
	const headerScene = (actions = []) => {
		const map = new (R().WorldMap)({ id: 'hdr' });
		map.addLocation(new (R().Location)({ id: 'a', name: '甲层', desc: '甲层的描述', actions }));
		map.addLocation(new (R().Location)({ id: 'b', name: '乙层', desc: '乙层的描述' }));
		map.addLocation(new (R().Location)({ id: 'z', name: '末层', desc: '末层的描述' }));
		map.addPath({ from: 'a', to: 'b', text: '去乙层' });
		map.addPath({ from: 'b', to: 'a', text: '回甲层' });
		map.addPath({ from: 'a', to: 'z', text: '去末层' });
		const scene = new (R().MapScene)({ id: 'hdr', map, start: 'a' });
		const lines = [];
		scene.perform = (t) => lines.push(String(t));
		/** 按**预定序列**喂选择；序列耗尽即抛（⇒ 未收敛会是一句可诊断的红）。 */
		const drive = (seq) => {
			let i = 0;
			scene.choice = async () => {
				if (i >= seq.length) throw new Error(`选择序列耗尽（第 ${i + 1} 次）⇒ 场景未如预期收敛：已上屏 ${JSON.stringify(lines.filter((l) => /^【/.test(l)))}`);
				return seq[i++];
			};
			return () => i;
		};
		return {
			scene, lines, drive,
			/** 【层名】形的场景头条数（✗ 不数 desc：「甲层的描述」不含【】） */
			headers: () => lines.filter((l) => /^【.+】$/.test(l.trim())),
			countOf: (n) => lines.filter((l) => /^【.+】$/.test(l.trim()) && l.includes(n)).length,
		};
	};

	test('map #1879 ①：**同层重复动作** ⇒ 【层名】恒 **1** 次（✗ 每绘一屏印一次 ⇒ 堆叠）', async () => {
		State.passage = '探索';
		const h = headerScene([{ text: () => '翻找', action: () => {} }]);
		/* 同一位置交互连做两次（两次都自环重绘），第三次选**去末层**结束。 */
		const used = h.drive(['a0', 'a0', 'e1']);
		await h.scene.execute();
		assert.eq(used(), 3, `应恰好 3 次选择（2 次动作 ＋ 1 次离层），实为 ${used()}`);
		assert.eq(h.countOf('甲层'), 1, `★同层重复动作 ⇒ 【甲层】恒 1 次（✗ 堆叠）：实为 ${JSON.stringify(h.headers())}`);
		assert.eq(h.countOf('末层'), 1, `末层头印 1 次：实为 ${JSON.stringify(h.headers())}`);
	});

	test('map #1879 ②：**离层再回** ⇒ 场景头**再印**（甲层共 2 次）', async () => {
		State.passage = '探索';
		const h = headerScene();
		/* 甲→乙（e0）→ 乙→甲（e0）→ 甲→末层（e1）结束 ⇒ 甲层应印 2 次。 */
		const used = h.drive(['e0', 'e0', 'e1']);
		await h.scene.execute();
		assert.eq(h.countOf('甲层'), 2, `★离层再回 ⇒ 【甲层】**再印**（共 2）：实为 ${JSON.stringify(h.headers())}`);
		assert.eq(h.countOf('乙层'), 1, `乙层 1 次：实为 ${JSON.stringify(h.headers())}`);
		assert.eq(h.countOf('末层'), 1, `末层 1 次：实为 ${JSON.stringify(h.headers())}`);
	});

	test('map #1879 ③ ★**同实例二次进场** ⇒ 首帧必有场景头（抓「战斗回来头消失」失效形）', async () => {
		/* ★本把是**跨进场边界**的刀（dev-10 补）：①②都在**单次** `execute()` 内打转 ⇒ 抓不到
		 *   「场景**单例** ＋ 回来时段落名与上次渲染相同 ⇒ `#leftPassage()` 判失灵」这一形。
		 *
		 *   失效形（`#1855` 甲案首版实测）：动作里导航去战斗 ⇒ 场景切走；
		 *   战斗出口 `Engine.play('探索')` ⇒ **同实例**再 `execute()` ⇒ 而 `current === #headerLoc`
		 *   （都是 'a'，且段落名也是 '探索'）⇒ **首帧不印场景头** ✗＝「战斗回来场景头消失」。
		 *   ⇒ 修法是**离场时显式清 `#headerLoc`**（✗ 靠 `#leftPassage()`：它此时判不出来）。 */
		State.passage = '探索';
		const h = headerScene([{ text: () => '出击', action: () => { State.passage = '战斗'; } }]);
		/* 第一次进场：选动作（导航走 ⇒ 场景切走）。 */
		const used1 = h.drive(['a0']);
		await h.scene.execute();
		assert.eq(used1(), 1, `首次进场只选 1 次（动作即离场），实为 ${used1()}`);
		assert.eq(h.countOf('甲层'), 1, `首帧印头 1 次：实为 ${JSON.stringify(h.headers())}`);
		const afterFirst = h.headers().length;

		/* 战斗结束 ⇒ **同一实例**二次进场（`Engine.play('探索')` 的真实形）。 */
		State.passage = '探索';
		const used2 = h.drive(['e1']);
		await h.scene.execute();
		assert.eq(used2(), 1, `二次进场选 1 次（离层结束），实为 ${used2()}`);
		assert.eq(h.countOf('甲层'), 2,
			`★**二次进场首帧必须重印场景头**（✗ 消失）：首轮共 ${afterFirst} 条头、现共 ${JSON.stringify(h.headers())}`);
	});


	/* ---------- ★`sgstory#1990`：`Exit` 的「先问再移」（可抑制移动） ----------
	 *
	 *   债源：`Exit.action` 是**副作用**，而引擎在出口导航分支**无条件** `moveTo`
	 *   ⇒ 故事侧只能「action 里起模态、移动在模态后」绕（`books#261` 实证）。
	 *   本票给能力：`action` 返 `false` ⇒ **抑制移动**；其余（含 `undefined`）照旧移动。
	 *
	 *   ★本格是**失败判据先行**：修未落地时，正例格须**具名红**、对照臂须**绿**。 */

	/* ★夹具：出口**只在第一次可选**（`when`）—— 因为「移动被抑制」时位置不变 ⇒ 出口仍在 ⇒
	 *   若它一直可选，玩家的选择循环就**不会收敛**（✗ 那不是缺陷，是「还能再选」✓）。
	 *   故让 `when` 在试过一次后为假 ⇒ 重绘后无可选项 ⇒ 循环自然结束 ✓（★判据只关心第一次）。 */
	const s1990Scene = (exitAction) => {
		let 试过 = 0;
		const map = new (R().WorldMap)({ id: 's1990' });
		map.addLocation(new (R().Location)({ id: 'a', name: 'A' }));
		map.addLocation(new (R().Location)({ id: 'b', name: 'B' }));
		map.addPath({
			from: 'a', to: 'b', text: '去B', when: () => 试过 === 0,
			action: () => { 试过 += 1; return exitAction(); },
		});
		return new (R().MapScene)({ id: 's1990', map, start: 'a' });
	};

	test('★`#1990` 可抑制移动：出口 action 返 false ⇒ **位置不变**', async () => {
		let 问过 = 0;
		const scene = s1990Scene(() => { 问过 += 1; return false; });
		let renders = 0;
		/* ★桩**必须有上界**（同 D2 格的口径）：若抑制形失效 ⇒ 反复移动 / 无限重绘 ⇒
		 *   给**一句可诊断的红**，✗ 不让它变成堆耗尽 abort。 */
		scene.choice = async () => {
			renders += 1;
			if (renders > 5) throw new Error(`未收敛：choice 被反复调用 ${renders} 次（抑制形失效？）`);
			return 'e0';
		};
		await scene.execute();
		assert.eq(问过, 1, '★出口 action 须被**问过**一次（✗ 未被问 = 面没接上）');
		assert.eq(scene.map.current, 'a',
			`★action 返 false ⇒ **位置须不变**（实得 ${JSON.stringify(scene.map.current)}）`);
	});

	test('★`#1990` 对照臂（零回归）：出口 action 返 undefined ⇒ **照旧移动**', async () => {
		let 问过 = 0;
		const scene = s1990Scene(() => { 问过 += 1; });
		let renders = 0;
		scene.choice = async () => {
			renders += 1;
			if (renders > 5) throw new Error(`未收敛：choice 被反复调用 ${renders} 次`);
			return 'e0';
		};
		await scene.execute();
		assert.eq(问过, 1, '既有出口 action 仍须被调用一次');
		assert.eq(scene.map.current, 'b',
			`★无返回值 ⇒ 照旧 moveTo（实得 ${JSON.stringify(scene.map.current)}）`);
	});
	/* ---------- ★P1-2（探索视图）：「仅关键」档下**地点正文仍在正文面** ---------- */

	test('★P1-2 map：场景头与地点 desc 走 `map-scene`（`level: key`）⇒ 「仅关键」档下仍进正文；对照：`default` 被筛', async () => {
		State.passage = '探索';
		const 旧档 = State.variables.rpgNoticeFilter;
		const 旧通知 = State.variables.rpgNotices;
		try {
			/* ① 通道级别（注册面回答，✗ 猜文本） */
			State.variables.rpgNoticeFilter = 'key';
			assert.eq(R().noticeAdmits('map-scene'), true,
				'★「仅关键」档下 `map-scene` 须**进正文**（✗ 场景头/地点正文被吞 ⇒ 玩家读到与地点无关的正文 ✓）');
			assert.eq(R().noticeAdmits('default'), false, '★对照：`default`（常态）在「仅关键」档下**不进正文** ✓');
			/* ② 真输出：跑一次场景 ⇒ 层名与 desc 落在 `map-scene` 通道上（★读**真通知缓冲**，✗ 读源码文本） */
			State.variables.rpgNotices = [];
			const map = new (R().WorldMap)({ id: 'p12' });
			map.addLocation(new (R().Location)({ id: 'hall', name: '门厅', desc: '石阶上覆着一层薄苔。' }));
			const scene = new (R().MapScene)({ id: 'p12', map, start: 'hall' });
			scene.choice = async () => null;                              // 一次问询即收 ⇒ 本格只判**进场那一次**输出 ✓
			await scene.execute();
			通道: {
				const ns = State.variables.rpgNotices ?? [];
				const 本通道 = ns.filter((n) => n.channel === 'map-scene').map((n) => n.text);
				assert.eq(本通道.some((t) => t.includes('门厅')), true,
					`★层名须走 \`map-scene\`（实得 ${JSON.stringify(本通道).slice(0, 120)}）`);
				assert.eq(本通道.some((t) => t.includes('薄苔')), true,
					`★**地点正文**须走 \`map-scene\`（实得 ${JSON.stringify(本通道).slice(0, 160)}）`);
			}
		} finally {
			if (旧档 === undefined) delete State.variables.rpgNoticeFilter; else State.variables.rpgNoticeFilter = 旧档;
			if (旧通知 === undefined) delete State.variables.rpgNotices; else State.variables.rpgNotices = 旧通知;
		}
	});
})();
