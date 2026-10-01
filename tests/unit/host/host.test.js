/* SugarCube 宿主仿真（framework/host.js）的单元测试
 *
 * 本组用例是「宿主接触面可断言」的验收面：导航后旧段落输出是否失效、
 * 导航即克隆的引用语义、读档往返的原型退化、以及清场与接线本身。
 * 宿主仿真不属 `src/` 的任何单元，故用例目录为 `tests/unit/host/`。
 */
(() => {
	const H = () => window.__host;

	/* ---------- 输出面 ---------- */

	test('host：perform 的输出按段落归档，保持阅读顺序', () => {
		// 归档的粒度与 perform 的调用一致：引擎把整段文本交给 perform，
		// 按行拆分发生在 DOM 落地那一步（单元测试层不渲染 DOM，故不拆）。
		({}).perform('第一行');
		({}).perform('第二行\n第三行');
		const lines = H().host.lines();
		assert.eq(lines.length, 2, `两次 perform 两笔输出：${JSON.stringify(lines)}`);
		assert.eq(lines[0], '第一行');
		assert.ok(lines[1].includes('第三行'), '多行文本原样归档');
	});

	test('host：perform 拒绝非字符串（原语义未被接线改变）', () => {
		assert.throws(() => ({}).perform(123), 'perform 的参数应是字符串');
		assert.throws(() => ({}).perform(null), 'perform 的参数应是字符串');
	});

	test('host：perform 仍返回 this（链式调用语义保持）', () => {
		const that = {};
		assert.eq(that.perform('一行'), that, 'perform 返回调用者本身');
	});

	test('host：导航关闭旧输出块——旧段落的后续输出不再追加', () => {
		({}).perform('导航前的输出');
		const before = H().host.blocks().length;
		assert.eq(before, 1, '导航前只有一块');

		SugarCube.Engine.play('新段落');
		const closed = H().host.blocks()[0];
		assert.eq(closed.open, false, '旧块在导航时被关闭');
		const closedLines = closed.lines.length;

		({}).perform('导航后的输出');
		assert.eq(closed.lines.length, closedLines, '旧块的输出行数不再增长');
		assert.eq(H().host.lines('新段落').length, 1, '新输出落进新段落');
		assert.eq(H().host.lastPassage(), '新段落');
		assert.eq(H().host.passages().join(','), '新段落', '导航序列只含已导航段落');
	});

	/* ---------- 故事变量面 ---------- */

	test('host：导航即克隆——导航前取得的引用不再回写故事变量', () => {
		const ref = State.variables;       // 导航「之前」取得的引用
		SugarCube.Engine.play('某段落');
		ref.injected = '只写在旧引用上';
		assert.eq(State.variables.injected, undefined,
			'导航后故事变量是新快照，旧引用不再是它');
	});

	test('host：snapshot 是深克隆（快照与故事变量不共享引用）', () => {
		State.set({ bag: { n: 1 } });
		const snap = State.snapshot();
		State.variables.bag.n = 99;
		assert.eq(snap.bag.n, 1, '改故事变量不影响已定格的快照');
	});

	test('host：set/adopt 替换绑定而非就地改写', () => {
		const first = State.set({ a: 1 });
		const second = State.set({ b: 2 });
		assert.ok(first !== second, 'set 换的是新对象');
		assert.eq(State.variables.b, 2);
		assert.eq(State.variables.a, undefined, '旧绑定不被就地改写');
	});

	/* ---------- 存档面 ---------- */

	test('host：Save.roundtrip 读回纯对象（原型退化，与 SugarCube 读档一致）', () => {
		class Actor {
			constructor() { this.hp = 10; }
			heal(n) { this.hp += n; return this.hp; }
		}
		const actor = new Actor();
		const restored = Save.roundtrip(actor);
		assert.eq(restored.hp, 10, '可变态随档往返');
		assert.eq(restored.constructor, Object, '读回的是纯对象');
		assert.eq(typeof restored.heal, 'undefined', '原型方法不复存在');
		assert.ok(!(restored instanceof Actor), 'instanceof 读档后为假');
	});

	test('host：Save.serialize/deserialize 与 JSON 同形（含 null 与 undefined）', () => {
		assert.eq(Save.serialize(undefined), 'null', 'undefined 序列化为 null');
		assert.eq(Save.serialize({ a: 1 }), JSON.stringify({ a: 1 }));
		assert.eq(Save.deserialize('null').constructor, Object, 'null 读回空对象，不是 null');
	});

	/* ---------- 导航面与清场 ---------- */

	test('host：Engine.play 拒绝空段落名（注入面用错当场可见）', () => {
		assert.throws(() => SugarCube.Engine.play(''), '空段落名');
		assert.throws(() => SugarCube.Engine.play(undefined), '非字符串');
	});

	test('host：onNavigate 拒绝非函数，且返回可用的退订函数', () => {
		assert.throws(() => SugarCube.Engine.onNavigate('不是函数'), '需要函数');
		const seen = [];
		const off = SugarCube.Engine.onNavigate((passage, at) => seen.push([passage, at]));
		SugarCube.Engine.play('A');
		SugarCube.Engine.play('B');
		off();
		SugarCube.Engine.play('C');
		assert.eq(JSON.stringify(seen), JSON.stringify([['A', 0], ['B', 1]]),
			'钩子按序收到导航，退订后不再收到');
	});

	test('host：reset 清场——输出、导航记录、故事变量三者归零', () => {
		({}).perform('残留输出');
		SugarCube.Engine.play('残留段落');
		State.variables.leftover = true;

		H().reset();

		assert.eq(H().host.blocks().length, 0, '输出归档已清空');
		assert.eq(SugarCube.Engine.navigations.length, 0, '导航记录已清空');
		assert.eq(Object.keys(State.variables).length, 0, '故事变量已清空');
		assert.eq(H().host.lastPassage(), null, '无残留段落');
	});

	test('host：install 幂等（重复接线不叠加包装）', () => {
		const before = Object.getOwnPropertyDescriptor(Object.prototype, 'perform').value;
		H().install();
		H().install();
		assert.eq(Object.getOwnPropertyDescriptor(Object.prototype, 'perform').value, before,
			'重复 install 不改变 perform 的实现');
		assert.ok(H().installed, '接线状态可观测');
	});
})();
