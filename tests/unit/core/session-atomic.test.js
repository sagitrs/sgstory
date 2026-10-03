/* `sgstory#1925`（交付 3/3）· **命令提交的原子性**（草稿 ⇒ 一次结算）
 *
 * 出处：票面「木箱开箱走**命令提交**（草稿→原子结算：**全成或全不动**）—— 拒绝/中断**不落半态**」
 *   ＋ 本席钉在 `#1925` 票面的**形**（调用序与读数名，`sagitrs-developer` 的那条评论）。
 * 与 `#1752` 的关系：那条记的正是「自定义处理器先改 HP 再返回 false ⇒ 入口报 rejected 但 HP 变化保留」
 *   —— 本档把「动作体里的写」与「结算」分成两段：**写进草稿、只在正常返回时一次落**。
 *
 * 面：① 全成（`changed` 三键齐 ＋ 事实块三值齐）② 拒后零残留（`return false` 与 `RPG.refuse` 两形）
 *   ③ 普通异常 ⇒ **先丢草稿再上抛** ④ 动作内的**合并视图**（写完再读看得到自己的写）
 *   ⑤ 「不适用」（`when` 假）⇒ `settled: null`（与「被拒」可分）⑥ 重放幂等（第二次 `when` 已假）。
 */
(() => {
	const R = () => setup.RPG;

	/** 每格自造会话（✗ 共享任何全局面）—— 形同 `session.test.js` 的 `造会话`。 */
	const 造会话 = (id) => new (R().GameSession)({ id, rng: { v: 0, next() { this.v += 1; return this.v; } } });

	/** 木箱场景（本票的靶：三笔效果 = 开箱 ＋ 发奖 ＋ 标记）。`行为` 由各格给（正例/拒绝/抛）。 */
	const 挂木箱 = (A, 行为) => A.mount('cellar', (ctx) => ({
		id: 'cellar',
		enter: (c) => { c.commit({ chest: 'closed', loot: [], marked: false }); },   // ★enter 的写是**直写**（交付 1 原义）
		render: () => {},
		actions: [{
			id: 'open-chest',
			when: (c) => c.facts().chest === 'closed',
			run: 行为,
		}],
	}));

	/** 铺到「可开箱」的态 ⇒ 推一条输入。 */
	const 就绪 = (A, 行为) => {
		挂木箱(A, 行为);
		A.enter('cellar');
		A.input.push({ id: 'open-chest' });
	};

	test('原子①【全成】：三笔效果一次落齐（`changed` 三键 ＋ 事实块三值）', () => {
		const A = 造会话('A');
		就绪(A, (c) => {
			c.commit({ chest: 'open' });
			c.commit({ loot: ['rock', 'coin'] });
			c.commit({ marked: true });
		});
		const 读数 = A.step();
		assert.eq(读数.settled, 'applied', `★应 applied（实得 ${JSON.stringify(读数)}）`);
		assert.eq(JSON.stringify(读数.changed), JSON.stringify(['chest', 'loot', 'marked']),
			`★` + '`changed` 应逐键报出（实得 ' + JSON.stringify(读数.changed) + '）');
		assert.eq(读数.rolledBack, false, 'applied ⇒ ✗ 不得报回滚');
		const f = A.facts();
		assert.eq(f.chest, 'open', '开箱没落');
		assert.eq(JSON.stringify(f.loot), JSON.stringify(['rock', 'coin']), '奖励没落');
		assert.eq(f.marked, true, '标记没落');
	});

	test('★原子②【拒后零残留 · `return false`】：中途拒绝 ⇒ 事实块**逐项相同**（✗ 半态）', () => {
		const A = 造会话('A');
		就绪(A, (c) => {
			c.commit({ chest: 'open' });          // ① 已写
			c.commit({ loot: ['rock'] });         // ② 已写
			return false;                          // ★③ 之前拒绝（`#1776`：动作自己判定做不到）
		});
		const 前 = JSON.stringify(A.facts());
		const 读数 = A.step();
		assert.eq(读数.settled, 'rejected', `★应 rejected（实得 ${JSON.stringify(读数)}）`);
		assert.eq(读数.reason, 'action-refused', '理由＝动作自己拒绝');
		assert.eq(读数.rolledBack, true, '★拒绝 ⇒ 须报**已回滚**');
		assert.eq(JSON.stringify(读数.changed), '[]', `★拒绝 ⇒ \`changed\` 须空（实得 ${JSON.stringify(读数.changed)}）`);
		assert.eq(JSON.stringify(A.facts()), 前, '★拒后事实块**逐项相同**（开了箱没发奖＝半态，本条的靶）');
	});

	test('★原子②【拒后零残留 · 结构化拒绝】：抛 `RPG.refuse` ⇒ 走**同一条**拒绝路（`#1921` 复用）', () => {
		const A = 造会话('A');
		就绪(A, (c) => {
			c.commit({ chest: 'open' });
			c.commit({ loot: ['rock'] });
			throw R().refuse('CHEST_JAMMED', '这把锁卡死了 —— 现在打不开。');
		});
		const 前 = JSON.stringify(A.facts());
		const 读数 = A.step();
		assert.eq(读数.settled, 'rejected', `★结构化拒绝也须走结算判定（实得 ${JSON.stringify(读数)}）`);
		assert.eq(读数.reason, 'CHEST_JAMMED', '★理由＝**结构化拒绝码**（✗ 泛泛的 rejected）');
		assert.eq(读数.rolledBack, true, '★须报已回滚');
		assert.eq(JSON.stringify(A.facts()), 前, '★零残留');
	});

	test('★原子③【普通异常】：**先丢草稿、再把异常上抛**（✗ 留半态；✗ 吞真 bug）', () => {
		const A = 造会话('A');
		就绪(A, (c) => {
			c.commit({ chest: 'open' });
			throw new Error('引擎里的真 bug（✗ 结构化拒绝）');
		});
		const 前 = JSON.stringify(A.facts());
		let 抛 = null;
		try { A.step(); } catch (e) { 抛 = e.message; }
		assert.ok(/真 bug/.test(抛 ?? ''), `★普通异常须**上抛**给调用方（实得 ${JSON.stringify(抛)}）`);
		assert.eq(JSON.stringify(A.facts()), 前, '★上抛前须**已丢草稿**（✗ 半态留下）');
	});

	test('原子④【合并视图】：动作体内 `facts()` 看得到**自己的写**（写完再读），✗ 不是活状态', () => {
		const A = 造会话('A');
		let 动作内 = null, 动作外 = null;
		A.mount('cellar', () => ({
			id: 'cellar',
			enter: (c) => { c.commit({ chest: 'closed' }); },
			render: () => {},
			actions: [{
				id: 'open-chest',
				run: (c) => {
					c.commit({ chest: 'open' });
					动作内 = c.facts().chest;                  // ★动作内：应看得到自己的写
					动作外 = A.facts().chest;                  // ★同一时刻的**活**事实块：应仍是 closed
				},
			}],
		}));
		A.enter('cellar');
		A.input.push({ id: 'open-chest' });
		A.step();
		assert.eq(动作内, 'open', `★动作内的 ` + '`facts()`' + ` 应读**合并视图**（实得 ${动作内}）`);
		assert.eq(动作外, 'closed', `★动作进行中**活**事实块不得被改（实得 ${动作外}）—— 那正是「半态」的来源`);
		assert.eq(A.facts().chest, 'open', '结算后落定');
	});

	test('原子⑤【不适用可分】：`when` 为假 ⇒ `settled: null`（✗ 与「被拒」同形）', () => {
		const A = 造会话('A');
		就绪(A, (c) => { c.commit({ chest: 'open' }); });
		A.step();                                       // 第一次：真开箱
		A.input.push({ id: 'open-chest' });
		const 前 = JSON.stringify(A.facts());
		const 读数 = A.step();                          // 第二次：`when` 已假 ⇒ 不适用
		assert.eq(读数.settled, null, `★不适用 ⇒ settled 须是 null（实得 ${JSON.stringify(读数.settled)}）`);
		assert.eq(读数.reason, 'when-false', '★理由具名 when-false');
		assert.eq(JSON.stringify(A.facts()), 前, '不适用 ⇒ 事实块不变');
	});

	test('原子⑥【重放幂等】：同一命令重放 ⇒ ✗ 不得重复发奖', () => {
		const A = 造会话('A');
		let 跑了 = 0;
		就绪(A, (c) => { 跑了 += 1; c.commit({ chest: 'open', loot: ['rock'] }); });
		A.step();
		A.input.push({ id: 'open-chest' });
		A.step();
		assert.eq(跑了, 1, `★命令体应只真跑一次（实得 ${跑了} 次）—— 第二次 ` + '`when`' + ' 已假');
		assert.eq(JSON.stringify(A.facts().loot), JSON.stringify(['rock']), '★重放不得重复发奖');
	});
})();
