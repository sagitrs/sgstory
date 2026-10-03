/* core/40-battle 的**拒绝重选回路**与护栏（`sgstory#1914` 增量 3/3 · 步二）。
 *
 * 票面点名的三条（口径：**被拒即回到选择**，✗ 让本回合就这么过去）：
 *   ① **被拒后同一回合仍可再选**。现码：被拒支直接 return（`40-battle.js` 的拒绝路）⇒ 第二次选择
 *      要到**下一回合**才出现 ⇒ 本断言**红**。
 *   ② **被拒不推进随机数**。尺子：先测出「一次成功攻击要几枚」，再给**恰好**这么多枚；若拒绝路径
 *      偷耗了数，后续合法行动就会因序列耗尽而抛 —— ✗ 用「看起来还行」当判据。
 *   ③ **护栏仍在且出声**（连续被拒达 N）⇒ 出声走 `RPG.notices`（**结构化可判**，✗ 只印文案）。
 *
 * ⚠️ 桩化的是**类级单例** `DND3.Player` ⇒ 一切态与随机流都在 `finally` 复原（步一里我因没复原吃过一次时红时绿）。 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;
	const 钉随机 = (n = 400) => R().rng.setSequence(Array.from({ length: n }, () => 0.99));

	/** 桩化对象是**类级单例** `DND3.Player` ⇒ 一律经此处挂桩、finally 还原（同族档同规，`#1699`）。 */
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

	const 存态 = () => {
		const P = D().Player;
		/* ★背包也要存：`State.variables.inventory` 是全局态 ⇒ 弄脏会连累后续用例
		 *   （本席第一版就漏了它，一次跑出 20 条无关红）。 */
		return { P, hp: P.hp, nonlethal: P.nonlethal, effects: (P.effects ?? []).slice(), death: P.death,
			items: P.items, choice: P.choice, 背包: State.variables.inventory };
	};
	const 复态 = (s) => {
		s.P.hp = s.hp; s.P.nonlethal = s.nonlethal; s.P.effects = s.effects; s.P.death = s.death;
		s.P.items = s.items; s.P.choice = s.choice; State.variables.inventory = s.背包; R().rng.reset();
	};

	/** 摆一场：背包＝[石料(用它会抛 ⇒ 天然的被拒), 木棒]，一只血厚的敌。 */
	const 摆一场 = (轮 = 8) => {
		State.variables.inventory = [];
		R().give('rock'); R().give('club'); R().equip('club');
		const P = D().Player;
		P.hp = P.maxHp; P.nonlethal = 0; P.effects = []; P.death = false;
		const 敌 = new (R().Character)({ name: '獾', hp: 9999, maxHp: 9999 });
		const battle = new (R().Battle)(轮, [P], [敌], true);
		const 报 = [];
		battle.perform = (t) => 报.push(String(t));
		return { battle, 敌, 报, P };
	};

	/** 桩：先按文案前缀找，找到就答它**给出的值**；找不到原样回（同族档桩法）。 */
	const 桩 = (seq) => async (opts) => {
		const a = seq.length ? seq.shift() : 'skip';
		const hit = (opts ?? []).find((o) => typeof o?.text === 'string' && o.text.startsWith(String(a)));
		return hit ? hit.value : a;
	};

	/** 数一次成功攻击要几枚随机数 —— **不用猴补**：借「序列耗尽即抛」这条既有性质，
	 *   找「最小能让一次成功攻击跑完的枚数」（✗ 包 `rng.index`：攻击走的不是这个取数口，
	 *   本席第一版就用它数到 0，且 `delete` 掉了原方法 ⇒ 连累 19 条无关用例）。 */
	const 数一次用量 = async () => {
		for (let k = 1; k <= 16; k += 1) {
			钉随机(k);
			const { battle, 敌 } = 摆一场(1);
			D().Player.choice = 桩(['1', 'use', '獾']);
			try {
				await withPlayerStubs({ items: State.variables.inventory }, () => battle.execute());
				if (敌.hp < 9999) return k;          // 这次枚数够了
			} catch { /* 序列用尽 ⇒ 加大枚数再试 */ }
		}
		return 0;
	};

	test('reject ①：被拒之后**同一回合**仍可再选（现码必红）', async () => {
		const s = 存态();
		try {
			钉随机(400);
			const { battle, 报 } = 摆一场(8);
			/* 第一手石料（必被拒）⇒ 第二手木棒打獾（应当成） */
			D().Player.choice = 桩(['0', '獾', '1', 'use', '獾']);
			await withPlayerStubs({ items: State.variables.inventory }, () => battle.execute());
			const 二回 = 报.findIndex((l) => l.includes('【第 2 回合】'));
			const 首回合 = 二回 > 0 ? 报.slice(0, 二回) : 报;
			const 问数 = 首回合.filter((l) => l.includes('请选择道具')).length;
			assert.ok(
				问数 >= 2,
				`★被拒后本回合没让玩家再选（第 1 回合内「请选择道具」出现 ${问数} 次，应 ≥2）`
					+ ` —— 该回合的牌子：${JSON.stringify(首回合.slice(0, 6))}`
			);
		} finally { 复态(s); }
	});

	test('reject ②：拒绝路径**不推进随机数**（尺子＝恰好够一次成功的枚数）', async () => {
		const s = 存态();
		try {
			const 用量 = await 数一次用量();
			assert.ok(用量 > 0, `★连一次成功攻击都没能量出所需枚数（找遍 1..16 枚皆不成）—— 尺子不成立，先查它`);

			钉随机(用量);
			const { battle, 敌 } = 摆一场(1);
			D().Player.choice = 桩(['0', '獾', '1', 'use', '獾']);
			let 抛 = null;
			try { await withPlayerStubs({ items: State.variables.inventory }, () => battle.execute()); }
			catch (e) { 抛 = e; }
			assert.eq(抛, null, `★拒绝路径偷耗了随机数 ⇒ 后续合法行动把序列用尽而抛：${抛?.message}`);
			assert.ok(敌.hp < 9999, `★只给「恰好够一次」的枚数时攻击没落地（敌 hp ${敌.hp}）—— 说明被拒那一次也取过数`);
		} finally { 复态(s); }
	});

	test('reject ③：连续被拒达 N ⇒ 出声走 **notices**（结构化，✗ 只印文案）', async () => {
		const s = 存态();
		try {
			钉随机(200);
			const { battle } = 摆一场(8);
			/* ⚠ 判据须认**专用通道**：`perform` 本身也记一条 notice（`71-notice.js`「`perform` 与本模块共用」）
			 *   ⇒ 只数总数会**恒真**（正是本席第 15/16 例那个形状）。 */
			const 量 = () => (R().notices?.({ channel: 'battle-refuse', limit: 50 }) ?? []).length;
			const 前 = 量();
			/* 一路选石料（必被拒）⇒ 达护栏 */
			D().Player.choice = 桩(Array.from({ length: 40 }, () => ['0', '獾']).flat());
			await withPlayerStubs({ items: State.variables.inventory }, () => battle.execute());
			assert.ok(量() > 前, `★达护栏时没有走 **battle-refuse 通道**出声（条数 ${前} ⇒ ${量()}）`);
		} finally { 复态(s); }
	});
})();
