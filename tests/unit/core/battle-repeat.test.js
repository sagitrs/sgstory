/* **重复行动**（`sgstory#1914` 增量 3/3 · 步五 · 收尾）。
 *
 * 口径（票面）：玩家可「重复上一次行动」—— **指同一件、同一靶**，✗ 重新问一遍（重复就该是**一键**）。
 *   件用**件号**（`slotId`，步三）认、靶用**单位号**（`42-battle-intent.js`）认 ⇒ 两者都不吃下标。
 *   任一件不在（换手／用光／目标没了）⇒ 出声、**不消耗**行动机会、回到选择（步二的回路接住）。
 *
 * 判据（每条先写先跑，在改动前的现码上红）：
 *   ⑦ 第一次出手之后，下一回合选单里出现「重复上一次…」；选它 ⇒ **不再问**道具/动作/靶三问，
 *      直接对**同一件同一靶**出手。
 *   ⑧ 【**下标漂移**尺子】第一次出手后，往背包**前面插一件**（原下标全体后移）⇒ 重复上次仍须打**原来那件**。
 *      ★这把尺子是`itemSlotId` 存在的**唯一理由**：按下标实现的「重复」在这里会指到**别件**。
 *   ⑨ 意图是**身份量**且活在 **`Battle` 实例**上（✗ 模块级／类级 ⇒ 跨场串味）：换一场新战斗即干净；
 *      意图里的件是**件号**、靶是**单位号**（✗ 名字／下标）。
 *
 * ⚠ 存档往返的**正确形态**（本席口径，✗ 不是「意图要能存进档」）：单位号是**会话内**量（`WeakMap`），
 *   而 P0 明确**战斗中途不许存档** ⇒ 意图**不需要**入档；要保证的是「意图活在实例上 ⇒ 换一场就没了」。
 *   这条由 ⑨ 钉住（✗ 让一个指向旧世界的意图静静留着）。
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

	/** 桩化对象是**类级单例** `DND3.Player` ⇒ 一律经此处挂桩、finally 还原（同族档同规）。 */
	const withPlayerStubs = async (stubs, fn) => {
		const P = D().Player;
		const saved = new Map();
		const added = [];
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
		const 乙 = new (R().Character)({ name: '狐', hp: 9999, maxHp: 9999 });
		const battle = new (R().Battle)(轮, [P], [甲, 乙], true);
		const 报 = [];
		battle.perform = (t) => 报.push(String(t));
		return { battle, 甲, 乙, 报, P };
	};

	/** 桩：按前缀找选项 ⇒ 答它的值（✗ 猜名字）。记下每次问答（供「没有三问」用）。 */
	const 桩 = (seq, 记 = []) => async (opts) => {
		const a = seq.length ? seq.shift() : 'skip';
		记.push({ 答: a, 选单: (opts ?? []).map((o) => String(o.text)) });
		const hit = (opts ?? []).find((o) => typeof o?.text === 'string' && o.text.includes(String(a)));
		/* ★回退用 `'skip'`（✗ 把原样的答案回上去）：答案若不在选单里，原样回会让道具步拿到非下标
		 *   ⇒ `reviveItem(undefined)` **抛** ⇒ 判据会以「崩」而不是**具名断言**的形式红（本席实测）。 */
		return hit ? hit.value : 'skip';
	};

	test('repeat ⑦：出手之后出现「重复上一次」；选它**不再三问**，直接对同一件同一靶出手', async () => {
		const s = 存态();
		try {
			钉随机();
			const { battle, 报, P } = 摆一场(3);
			const 记 = [];
			/* 第 1 回合：正常出手（选木棒→使用→打獾）；第 2 回合：选「重复上一次」 */
			P.choice = 桩(['木棒', 'use', '獾', '重复'], 记);   // 道具步答「木棒」（✗「使用木棒」——那是**动作**步的文案）
			await withPlayerStubs({ items: State.variables.inventory }, () => battle.execute());
			const 首回合问 = 记.filter((r) => r.选单.some((t) => t.startsWith('重复')));
			/* 第 2 回合的选单里须有「重复」项 */
			assert.ok(首回合问.length > 0 || 记.some((r) => r.选单.some((t) => t.startsWith('重复'))),
				`★下一回合选单里没有「重复上一次」（选单史：${JSON.stringify(记.map((r) => r.选单))}）`);
			/* 选了「重复」之后**不得**再问「对谁使用」 */
			const i = 记.findIndex((r) => r.答 === '重复' && r.选单.some((t) => t.startsWith('重复')));
			assert.ok(i >= 0, `★没有任何一步把「重复」当成选项给出（选单史：${JSON.stringify(记.map((r) => r.选单))}）`);
			const 之后 = 记.slice(i + 1);
			const 又问靶 = 之后.some((r) => r.选单.some((t) => t.includes('（敌方）')));
			assert.ok(!又问靶, `★选了「重复」之后又问了靶（选单史：${JSON.stringify(之后.map((r) => r.选单))}）—— 那就不是一键重复`);
			void 报; void 首回合问;
		} finally { 复态(s); }
	});

	test('repeat ⑧【下标漂移尺子】：背包前插入一件 ⇒ 重复上次仍打**原来那件**', async () => {
		const s = 存态();
		try {
			钉随机();
			const { battle, P } = 摆一场(3);
			const 记 = [];
			/* 第一次：选第 1 件（木棒，下标 1：0=匕首？—— 以实际选单为准，用文案前缀「使用木棒」） */
			P.choice = async (opts) => {
				const 选单 = (opts ?? []).map((o) => String(o.text));
				记.push({ 选单 });
				/* ★顺序要紧：**先判「重复」项**，再判道具项。
				 *   ⚠ 本席第一版把道具项写成 `includes('木棒')` 且排在前 ⇒ 重复项的文案里也含「木棒」
				 *   ⇒ 第 2 回合先命中了重复项、**漂移那一步根本没执行** ⇒ 尺子自己把被测物绕过了
				 *   （刀-A 因此**不咬**；正是 `#299` 第十七例「先验量具」的又一例）。 */
				let i = 选单.findIndex((t) => t.startsWith('重复'));
				if (i >= 0) {
					/* ★漂移：在**取件之前**往背包**前面**插一件（原下标全体后移） */
					State.variables.inventory.unshift({ id: 'rock', charges: 9, equipped: false, slotId: 'it-插队' });
					return opts[i].value;
				}
				i = 选单.findIndex((t) => t.startsWith('木棒'));    // 道具步（用 startsWith：✗ 会被重复项命中）
				if (i >= 0) return opts[i].value;
				i = 选单.findIndex((t) => t.startsWith('獾（敌方）'));
				if (i >= 0) return opts[i].value;
				return 'skip';
			};
			await withPlayerStubs({ items: State.variables.inventory }, () => battle.execute());
			/* 判据：重复那一步的事件里 itemId 必须是**木棒的件号**（✗ 'it-插队'，✗ 下标） */
			/* ★为何看**结果史**而不是「上一结果」：后者只留最后一条 —— 若「重复」没实现、桩落到 `skip`，
			 *   上一结果会是 skip 而**第一手的 action 仍在别处** ⇒ 判据会**绿得不对**（本席实测一次）。
			 *   要求「整场有**两条** action」，才真的要求「重复」出了一次手。 */
			const 史 = battle.结果史 ?? [];
			const 动作条 = 史.flatMap((r) => r.events ?? []).filter((e) => e.kind === 'action' && e.itemId);
			assert.ok(动作条.length >= 2,
				`★整场只有 ${动作条.length} 条 action ⇒「重复」没真的出过手（选单史=${JSON.stringify(记.map((r) => r.选单))}）`);
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
			const 图 = battle.上次意图;
			assert.ok(图 && typeof 图 === 'object', `★没有留下意图（实得 ${JSON.stringify(图)}）—— 下一回合无从「重复」`);
			assert.ok(String(图.件).startsWith('it-'), `★意图里的件不是**件号**（实得 ${图.件}）—— 下标会漂移`);
			assert.eq(图.靶, R().意图.候选值(甲), '★意图里的靶不是**单位号**（用名字 ⇒ 改名即失真）');
			/* 换一场新战斗 ⇒ 干净（✗ 跨场串味） */
			const 另 = new (R().Battle)(1, [P], [甲], true);
			assert.eq(另.上次意图 ?? null, null, '★新战斗里残留了上一场的意图（意图挂了模块级/类级？）');
		} finally { 复态(s); }
	});
})();
