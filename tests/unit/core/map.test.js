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

})();
