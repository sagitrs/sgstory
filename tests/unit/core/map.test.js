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
})();
