/* **重复行动**（`sgstory#1914` 增量 3/3 · 步五）。
 *
 * 口径（票面）：玩家可「重复上一次行动」—— **指同一件、同一靶**，✗ 重新问一遍（重复就该是**一键**）。
 *   件用**件号**（`slotId`，步三）认、靶用**单位号**（`42-battle-intent.js`）认 ⇒ 两者都不吃下标。
 *   任一件不在（换手／用光／目标没了）⇒ 出声、**不消耗**行动机会、回到选择（步二的回路接住）。
 *
 * 判据（每条先写先跑，在改动前的现码上红）：
 *   ⑦ 出手之后下一回合选单里出现「重复上一次…」；选它 ⇒ **不再问**靶。
 *   ⑧ 【**下标漂移**尺子】出手后往背包**前面插一件** ⇒ 重复仍须打**原来那件**。
 *      ★这把尺子是 `itemSlotId` 存在的**唯一理由**：按下标实现的「重复」在这里会指到**别件**。
 *   ⑨ 意图是**身份量**且活在 **`Battle` 实例**上（✗ 模块级／类级 ⇒ 跨场串味）。
 *   ⑩-① **件不在**／⑩-② **靶没了** ⇒ 出声、不消耗行动机会、回到选择。
 *      ★⑩ 的由来：本席的⑦⑧⑨ 只覆盖「件**漂移**」，**没覆盖**「件**不在**／靶**没了**」
 *      —— 由 `tester-3` 在 `#1914` 上指出（她给我的覆盖缺口是**真**的，已收进来）。
 *
 * ⚠ 存档往返的**正确形态**（本席口径，✗ 不是「意图要能存进档」）：单位号是**会话内**量（`WeakMap`），
 *   而 P0 明确**战斗中途不许存档** ⇒ 意图**不需要**入档；要保证的是「意图活在实例上 ⇒ 换一场就没了」（⑨钉住）。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	const 存态 = () => {
		const P = D().Player;
		return { P, hp: P.hp, nonlethal: P.nonlethal, effects: (P.effects ?? []).slice(), death: P.death,
			items: P.items, choice: P.choice, 背包: State.variables.inventory };
	};
	const 复态 = (s) => {
		s.P.hp = s.hp; s.P.nonlethal = s.nonlethal; s.P.effects = s.effects; s.P.death = s.death;
		s.P.items = s.items; s.P.choice = s.choice; State.variables.inventory = s.背包; R().rng.reset();
	};
	const 钉随机 = (n = 400) => R().rng.setSequence(Array.from({ length: n }, () => 0.99));

	const withPlayerStubs = async (stubs, fn) => {
		const P = D().Player;
		const saved = new Map(); const added = [];
		for (const k of Object.keys(stubs)) {
			if (Object.prototype.hasOwnProperty.call(P, k)) saved.set(k, P[k]); else added.push(k);
			P[k] = stubs[k];
		}
		try { return await fn(); } finally {
			for (const [k, v] of saved) P[k] = v;
			for (const k of added) delete P[k];
		}
	};

	const 摆一场 = (轮 = 3) => {
		State.variables.inventory = [];
		R().give('club'); R().equip('club'); R().give('dagger');
		const P = D().Player;
		P.hp = P.maxHp; P.nonlethal = 0; P.effects = []; P.death = false;
		const 甲 = new (R().Character)({ name: '獾', hp: 9999, maxHp: 9999 });
		const battle = new (R().Battle)(轮, [P], [甲], true);
		const 报 = [];
		battle.perform = (t) => 报.push(String(t));
		return { battle, 甲, 报, P };
	};

	/** 桩：按前缀找选项 ⇒ 答它的值（✗ 猜名字）。回退用 `'skip'`（✗ 原样回上去 —— 那会让道具步拿到非下标而崩）。 */
	const 桩 = (seq, 记 = []) => async (opts) => {
		const a = seq.length ? seq.shift() : 'skip';
		记.push({ 答: a, 选单: (opts ?? []).map((o) => String(o.text)) });
		const hit = (opts ?? []).find((o) => typeof o?.text === 'string' && o.text.startsWith(String(a)));
		return hit ? hit.value : 'skip';
	};

	/** 跑一场：第 1 回合正常出手（选木棒），第 2 回合选「重复」；`扰动` 在**选重复之前**执行。 */
	const 跑重复 = async (扰动) => {
		钉随机();
		const { battle, 甲, P } = 摆一场(3);
		const 报 = [];
		battle.perform = (t) => 报.push(String(t));
		const 记 = [];
		let 已出手 = false;
		P.choice = async (opts) => {
			const 选单 = (opts ?? []).map((o) => String(o.text));
			记.push(选单);
			if (!已出手 && 选单.some((t) => t.startsWith('木棒'))) {
				已出手 = true;
				return opts.find((o) => String(o.text).startsWith('木棒')).value;
			}
			const i = 选单.findIndex((t) => t.startsWith('重复'));
			if (i >= 0 && !battle.扰动过) { battle.扰动过 = true; 扰动({ battle, 甲, P }); return opts[i].value; }
			const 靶项 = 选单.findIndex((t) => t.startsWith('獾（敌方）'));
			if (靶项 >= 0) return opts[靶项].value;
			return 'skip';
		};
		await withPlayerStubs({ items: State.variables.inventory }, () => battle.execute());
		return { battle, 报, 记 };
	};

	test('repeat ⑦：出手之后出现「重复上一次」；选它**不再问**靶', async () => {
		const s = 存态();
		try {
			钉随机();
			const { battle, P } = 摆一场(3);
			const 记 = [];
			P.choice = 桩(['木棒', 'use', '獾', '重复'], 记);
			await withPlayerStubs({ items: State.variables.inventory }, () => battle.execute());
			/* ★本条的锚必须落在**引擎给的选单**上（`r.选单`），✗ 落在脚本自己排的答案上（`r.答`）：
			 *   本席第一版写 `findIndex((r) => r.答 === '重复')` —— 那**恒真**（脚本自己把「重复」排进了序列）
			 *   ⇒ 它绿与被测特性无关（`tester-3` 复核时用「搬到 main 上跑」实证：17 例里 16 红，唯它绿）。
			 *   ⇒ 改为查**引擎是否把这一项列出来** ＋ 补「这一手真打出去了」（✗ 只断「看见了选项」）。 */
			const i = 记.findIndex((r) => r.选单.some((t) => t.startsWith('重复')));
			assert.ok(i >= 0, `★引擎给的选单里从来没有「重复上一次」（选单史=${JSON.stringify(记.map((r) => r.选单))}）`);
			const 之后 = 记.slice(i + 1);
			assert.ok(!之后.some((r) => r.选单.some((t) => t.includes('（敌方）'))),
				`★选了「重复」之后又问了靶（选单史=${JSON.stringify(之后.map((r) => r.选单))}）—— 那就不是一键重复`);
			const 动作条 = (battle.resultLog ?? []).flatMap((r) => r.events ?? []).filter((e) => e.kind === 'action' && e.itemId);
			assert.ok(动作条.length >= 2, `★「重复」那一手没真打出去（action 条数=${动作条.length}）—— 只断「看见了选项」不够`);
		} finally { 复态(s); }
	});

	test('repeat ⑧【下标漂移尺子】：背包前插入一件 ⇒ 重复仍打**原来那件**', async () => {
		const s = 存态();
		try {
			钉随机();
			const { battle, P } = 摆一场(3);
			const 记 = [];
			let 插过 = false;
			P.choice = async (opts) => {
				const 选单 = (opts ?? []).map((o) => String(o.text));
				记.push(选单);
				/* ★顺序要紧：**先判重复项**，再判道具项。
				 *   ⚠ 本席第一版把道具项写成 `includes('木棒')` 且排在前 ⇒ 重复项文案里也含「木棒」
				 *   ⇒ 第 2 回合先命中重复项、**漂移那步根本没执行** ⇒ 尺子自己把被测物绕过了
				 *   （刀-A 因此**不咬**；`#299` 第十七例·副例四）。 */
				let i = 选单.findIndex((t) => t.startsWith('重复'));
				if (i >= 0) {
					if (!插过) { 插过 = true; State.variables.inventory.unshift({ id: 'rock', charges: 9, equipped: false, slotId: 'it-插队' }); }
					return opts[i].value;
				}
				i = 选单.findIndex((t) => t.startsWith('木棒'));
				if (i >= 0) return opts[i].value;
				/* ★靶分支**必须写**：本席上一版漏了它 ⇒ 靶答 `'skip'` ⇒ 被拒 ⇒ 意图永不落地
				 *   （症状是「整场 0 条 action」，与观测的 9 问史逐格对得上 —— 靠探针才看见）。 */
				i = 选单.findIndex((t) => t.startsWith('獾（敌方）'));
				if (i >= 0) return opts[i].value;
				i = 选单.findIndex((t) => t.startsWith('（跳过'));
				if (i >= 0) return opts[i].value;
				return 'skip';
			};
			await withPlayerStubs({ items: State.variables.inventory }, () => battle.execute());
			const 动作条 = (battle.resultLog ?? []).flatMap((r) => r.events ?? []).filter((e) => e.kind === 'action' && e.itemId);
			assert.ok(动作条.length >= 2,
				`★整场只有 ${动作条.length} 条 action ⇒「重复」没真的出过手（选单史=${JSON.stringify(记)}）`);
			const 第二 = 动作条[1];
			assert.ok(String(第二.itemId).startsWith('it-') && 第二.itemId !== 'it-插队',
				`★重复指到了**别件**（itemId=${第二.itemId}）—— 正是按下标实现会栽的坑`);
		} finally { 复态(s); }
	});

	test('repeat ⑨：意图活在 `Battle` 实例上（✗ 模块级）；件是**件号**、靶是**单位号**', async () => {
		const s = 存态();
		try {
			钉随机();
			const { battle, 甲, P } = 摆一场(1);
			P.choice = 桩(['木棒', 'use', '獾']);
			await withPlayerStubs({ items: State.variables.inventory }, () => battle.execute());
			const 图 = battle.lastIntent;
			assert.ok(图 && typeof 图 === 'object', `★没有留下意图（实得 ${JSON.stringify(图)}）—— 下一回合无从「重复」`);
			assert.ok(String(图.slotId).startsWith('it-'), `★意图里的件不是**件号**（实得 ${图.slotId}）—— 下标会漂移`);
			assert.eq(图.targetId, R().unitId.of(甲), '★意图里的靶不是**单位号**（用名字 ⇒ 改名即失真）');
			const 另 = new (R().Battle)(1, [P], [甲], true);
			assert.eq(另.lastIntent ?? null, null, '★新战斗里残留了上一场的意图（意图挂了模块级/类级？）');
		} finally { 复态(s); }
	});

	test('repeat ⑩-①：**件不在**（用光／换手）⇒ 出声、**不消耗**行动机会、回到选择', async () => {
		const s = 存态();
		try {
			const { battle, 报, 记 } = await 跑重复(() => {
				State.variables.inventory = State.variables.inventory.filter((x) => x.id !== 'club');   // 木棒没了
			});
			/* ★查**结果史**（✗ 只查「上一结果」）：被拒后回路会**再选**一次，若那次选了跳过，
			 *   `上一结果` 就是 skip —— 本席上一版这么写，于是判据红得**指向错的地方**。 */
			const 有拒 = (battle.resultLog ?? []).some((r) => r.status === 'rejected');
			assert.ok(有拒, `★⑩-① 没有出现过「被拒」（结果史=${JSON.stringify(battle.resultLog)}）`);
			assert.ok(报.some((t) => t.includes('重复不了')), `★没有出声（报单=${JSON.stringify(报.slice(0, 8))}）`);
			const i = 记.findIndex((t) => t.some((x) => x.startsWith('重复')));
			assert.ok(记.slice(i + 1).some((t) => t.some((x) => x.startsWith('（跳过'))),
				`★件不在后**没有回到选择**（后续选单史=${JSON.stringify(记.slice(i + 1))}）`);
		} finally { 复态(s); }
	});

	test('repeat ⑩-②：**靶没了**（已出局）⇒ 出声、**不消耗**行动机会、回到选择', async () => {
		const s = 存态();
		try {
			const { battle, 报, 记 } = await 跑重复(({ 甲 }) => { 甲.hp = 0; });   // 靶出局
			/* ★查**结果史**（✗ 只查「上一结果」）：被拒后回路会**再选**一次，若那次选了跳过，
			 *   `上一结果` 就是 skip —— 本席上一版这么写，于是判据红得**指向错的地方**。 */
			const 有拒 = (battle.resultLog ?? []).some((r) => r.status === 'rejected');
			assert.ok(有拒, `★⑩-② 没有出现过「被拒」（结果史=${JSON.stringify(battle.resultLog)}）`);
			assert.ok(报.some((t) => t.includes('重复不了')), `★没有出声（报单=${JSON.stringify(报.slice(0, 8))}）`);
			const i = 记.findIndex((t) => t.some((x) => x.startsWith('重复')));
			assert.ok(记.slice(i + 1).some((t) => t.some((x) => x.startsWith('（跳过'))),
				`★靶没了后**没有回到选择**（后续选单史=${JSON.stringify(记.slice(i + 1))}）`);
		} finally { 复态(s); }
	});
})();
