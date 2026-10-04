/* L0 宿主 **登记／选择** 面（`sgstory#1989` 阶段 6）—— 判据：宿主可登记、可选择、冲突不静默
 *
 * 定位（先说**不**做什么，免得与邻档重复）：
 *   · `ports.test.js` 钉的是**契约与三端口的实现面**（`portOf`／`portMissing`／收集器／纪元／slot 语义）
 *     ⇒ 本档**不重复**那些，只钉与**宿主身份**有关的四件；
 *   · 本档**不碰** `src/host/**` 的实现体（那是 `host/*.test.js` 的面），只用**用例内自造**的宿主。
 *
 * 本档钉的四件：
 *   ① 登记面读数（`hosts`／`hostOf`／`hostsReady`）＋ 登记**四路具名抛**
 *      （同 id 重复登记／指向未登记的宿主／缺 `{host}` 参数／半成品实现）；
 *   ② ★多候选未选 ⇒ `portOf` **具名抛**（✗ 静默取第一个 —— 那会让「哪个宿主在跑」取决于加载序），
 *      且「未选择」与「零宿主」是**两种不同形**的抛错；
 *   ③ 显式选择 ⇒ 解析到该宿主的实现；`useHost(null)` 回到自动规则（✗ 回到某个默认宿主）；
 *   ④ ★**本档的核心正控**：一个**用例内造的**最小宿主上真能跑完一个 `GameSession`
 *      （构造时**不注入** `ports` ⇒ 走全局选择面）⇒ 这是「其他宿主成为可能」的机械证据。
 *
 * ⚠ 本档**动全局**（登记表／选择／端口袋）⇒ 每格在 `finally` 里复原 ——
 *   污染会让后续 700+ 格撞「多候选未选」，红面归因就再也读不出来了。
 */
(() => {
	const R = () => setup.RPG;

	/** 该会话自己的随机源（桩）：`GameSession` 要求必给（✗ 回落全局 `RPG.rng`）。 */
	const 造流 = () => ({ v: 0, next() { this.v += 1; return this.v; } });

	/** 造一个**用例内**的最小内存宿主：三端口齐、够跑一条最小场景。
	 *  返回值里的 `收` 是该宿主**自己的**呈现收集器 —— 输出落到它上面，才叫「跑在这个宿主上」。 */
	const 造内存宿主 = (id) => {
		const P = R();
		const 收 = [];
		P.defHost(id, { desc: '用例内的最小宿主（✗ src/host/**，只在本档存在）' });
		P.defPort('persist', {
			slotId: () => null,
			save: () => ({ ok: true, slot: '(mem)' }),
			load: () => null,
			has: () => false,
			schemaVersion: () => 1,
			migrate: (事实) => 事实,
			slotSemantics: () => ({ auto: false, explicitSlots: [] }),
		}, { host: id });
		P.defPort('render', {
			output: (text, opts) => { 收.push({ kind: 'output', text: String(text), ...(opts ?? {}) }); },
			render: (node) => { 收.push({ kind: 'render', node }); },
			setCollector: () => {},
		}, { host: id });
		P.defPort('lifecycle', {
			epoch: () => 0,
			isCurrent: () => true,
			onPassage: () => () => {},
			cancelPending: () => ({ canceled: 0 }),
		}, { host: id });
		return { id, 收 };
	};

	/** 撤掉本档造的宿主并复原选择（✗ 留污染给后续格）。 */
	const 撤 = (id) => { delete R().hosts[id]; R().useHost(null); };

	test('宿主①：登记读数 ＋ 登记面**四路具名抛**（✗ 静默覆盖／影子表／半成品）', () => {
		const P = R();

		/* 读数面：单宿主 ⇒ **自动定**（这是「单宿主零改动」的机械保证） */
		assert.eq(P.hostOf(), 'sugarcube', `★单宿主未自动定：登记表＝${JSON.stringify(Object.keys(P.hosts))}`);
		assert.eq(P.hostsReady().sugarcube.length, 0, `★宿主缺端口却报齐：${JSON.stringify(P.hostsReady())}`);
		assert.eq(JSON.stringify(P.portsReady()), JSON.stringify(['persist', 'render', 'lifecycle']),
			'★已定宿主的三端口不在位（`RPG.ports` 不是它的袋？）');

		/* ★两处声明的**系绳**：门从 `src/host/**` 的 `defHost('…')` 字面量与命名空间 `id: '…'` **并集**取宿主 id
		 *   ⇒ 若登记用的 id 与命名空间声明的不一致，门的 id 集合会多出一个**永远登记不上**的 id
		 *   （判据空转一半）。本行把二者钉在一起：**每个已登记宿主**都能在 `setup.*` 里找到同名 `id`。 */
		const 命名空间里的 = Object.values(setup)
			.filter((v) => v && typeof v === 'object' && typeof v.id === 'string').map((v) => v.id);
		assert.ok(P.hostIds().every((id) => 命名空间里的.includes(id)),
			`★已登记宿主 ${JSON.stringify(P.hostIds())} 里有命名空间未声明的 id（门提取的集合会与登记录对不上）`);

		/* ① 同 id 重复登记 */
		assert.throws(() => P.defHost('sugarcube', { desc: '重复' }), '重复登记');
		/* ② `defPort` 指向未登记的宿主 */
		assert.throws(() => P.defPort('render', {}, { host: '查无此宿主' }), '未登记');
		/* ③ `defPort` 缺 `{host}`（✗ 缺省落影子表 ⇒ 宿主身份又成了装饰件） */
		assert.throws(() => P.defPort('render', {}), '需要 {host}');
		/* ④ 半成品实现 ⇒ 缺项清单（✗ 静默接受 ⇒ 「端口在」与「端口正常」同形） */
		let 抛 = null;
		try { P.defPort('render', { output() {} }, { host: 'sugarcube' }); } catch (e) { 抛 = e?.message ?? String(e); }
		assert.ok(抛 && /缺方法/.test(抛) && /setCollector/.test(抛), `★半成品端口未被具名拒绝：${抛}`);

		/* ★正控：上面四路**都没改动在场实现**（任一路被静默接受，本行会读出别的东西） */
		assert.eq(typeof P.portOf('render').setCollector, 'function', '★登记被拒却改了在场实现');
		assert.eq(P.portOf('persist').slotSemantics().explicitSlots.length, 0,
			`★在场 persist 被换掉：${JSON.stringify(P.portOf('persist').slotSemantics())}`);
	});

	test('宿主②：多候选未选 ⇒ **具名抛 ＋ 列候选**（✗ 静默取第一个）＋ 端口袋空（✗ 影子表）', () => {
		const P = R();
		造内存宿主('unit-mem-a');
		try {
			assert.eq(Object.keys(P.hosts).sort().join(','), 'sugarcube,unit-mem-a', '★第二宿主没登记上');
			assert.eq(P.hostOf(), null, '★两个候选却自动定了一个（内核替调用方猜了）');
			assert.eq(Object.keys(P.ports).length, 0,
				`★未选择时 RPG.ports 仍有内容（影子表）：${JSON.stringify(Object.keys(P.ports))}`);

			let 抛 = null;
			try { P.portOf('render'); } catch (e) { 抛 = e?.message ?? String(e); }
			assert.ok(抛 && /未选择/.test(抛), `★多候选未选竟取出了实现（抛＝${抛}）`);
			assert.ok(抛.includes('unit-mem-a') && 抛.includes('sugarcube'), `★抛错未列候选：${抛}`);

			/* 显式选择 ⇒ 解析到**该**宿主的实现 */
			P.useHost('unit-mem-a');
			assert.eq(P.hostOf(), 'unit-mem-a', '★useHost 后 hostOf 未跟上');
			assert.eq(P.portOf('render') === P.hosts['unit-mem-a'].ports.render, true,
				'★解析到的不是该宿主的实现');
			/* 未知 id ⇒ 具名抛（✗ 静默忽略 ⇒ 以为选了） */
			assert.throws(() => P.useHost('查无此宿主'), '未知宿主');
			/* 清除选择 ⇒ 回到**自动规则**（两个候选 ⇒ 未定），✗ 回到某个默认宿主 */
			P.useHost(null);
			assert.eq(P.hostOf(), null, '★useHost(null) 未回到自动规则');
			assert.eq(Object.keys(P.ports).length, 0, '★清除选择后端口袋未清（影子表）');
		} finally { 撤('unit-mem-a'); }
		assert.eq(P.hostOf(), 'sugarcube', '★本格未复原（后续格会撞多候选未选）');
	});

	test('宿主③：**零宿主**与**多候选未选**是两种不同形的抛（✗ 都写成「端口不在」）', () => {
		const P = R();
		const 原 = P.hosts.sugarcube;               // ★临时摘掉唯一宿主（finally 必还）
		delete P.hosts.sugarcube;
		try {
			P.useHost(null);
			assert.eq(P.hostOf(), null, '★零宿主时 hostOf 竟有值');
			let 零 = null;
			try { P.portOf('persist'); } catch (e) { 零 = e?.message ?? String(e); }
			assert.ok(零 && /无宿主登记/.test(零), `★零宿主的抛错形不对：${零}`);
			assert.ok(!/未选择/.test(零), `★零宿主与多候选写成了同一读数：${零}`);

			/* 未知端口的抛错**不**受宿主面影响（先在表外拦下） */
			assert.throws(() => P.portOf('查无此端口'), '未定义的端口');
		} finally {
			P.hosts.sugarcube = 原;
			P.useHost(null);
		}
		assert.eq(P.hostOf(), 'sugarcube', '★本格未复原（登记表缺了唯一宿主）');
		assert.eq(P.portsReady().length, 3, '★本格未复原（端口袋没回到 sugarcube 的）');
	});

	test('宿主④【核心正控】：**另一个宿主上真能跑完一个会话**（✗ 注入 ports ⇒ 走全局选择面）', () => {
		const P = R();
		const 乙 = 造内存宿主('unit-mem-b');
		/* ★正控之二：给 sugar 宿主挂一个收集器 —— 若输出**同时**落进它，说明收口漏了 */
		const 糖收 = [];
		P.hosts.sugarcube.ports.render.setCollector((条) => 糖收.push(条));
		try {
			P.useHost('unit-mem-b');
			/* ★构造时**不传** `ports` ⇒ 会话只能经 `RPG.portOf` 拿 —— 这是本格的要害 */
			const A = new (P.GameSession)({ id: 'mem', rng: 造流() });
			A.mount('min', (ctx) => ({
				id: 'min',
				enter: (c) => { c.commit({ entered: true }); },
				render: (c) => { c.ports.render.output(`步${c.facts().n ?? 0}`); },
				actions: [{
					id: 'go',
					when: (c) => c.facts().done !== true,
					run: (c) => { c.commit({ done: true, n: (c.facts().n ?? 0) + 1 }); },
				}],
			}));
			assert.eq(A.enter('min').entered, true, '★在自造宿主上进入场景失败');
			A.input.push({ id: 'go' });
			const 读数 = A.run({ maxSteps: 10 });
			assert.eq(读数.stopped, 'input-empty', `★没跑完：${JSON.stringify(读数)}`);
			assert.eq(A.facts().done, true, '★命令没落到事实块');

			const 行 = 乙.收.filter((x) => x.kind === 'output').map((x) => x.text);
			assert.ok(行.length >= 1 && 行[0].startsWith('步'),
				`★输出没落到该宿主自己的呈现面：${JSON.stringify(乙.收)}`);
			assert.eq(P.portOf('render') === P.hosts['unit-mem-b'].ports.render, true,
				'★会话取的呈现面不是该宿主的');
			assert.eq(糖收.length, 0,
				`★输出**同时**进了 SugarCube 宿主的呈现面（收口漏了）：${JSON.stringify(糖收)}`);
		} finally {
			P.hosts.sugarcube.ports.render.setCollector(null);   // ★撤收集器（✗ 吞后续格的输出）
			撤('unit-mem-b');
		}
		assert.eq(P.hostOf(), 'sugarcube', '★本格未复原');
	});
})();
