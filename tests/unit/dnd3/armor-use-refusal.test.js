/* ── ★`sgstory#1951`：**防具「用」⇒ 结构化拒绝**（✗ 裸抛把呼叫方断流）──
 *
 *   重木盾等防具的 `used()` 守卫（`src/dnd/dnd3/items/shields.js`）**不该有默认用法** ⇒ 误 use 必须响。
 *   但「响」的形有讲究（`f695a141`／`#1906` 笔一已定）：**结构化拒绝**（`RPG.refuse` ⇒ `RPG.act` 收成
 *   `rejected/action-refused` ＋ `code` ＋ `extra` ＋ 玩家白话）——✗ 裸 `throw new Error`：
 *   后者只能靠调用方 try/catch，且跑分器/校准链会**上抛断流**（乙支堵点的原形）。
 *
 *   本格断四面（都是**行为对账**）：
 *     ① **不抛**（`execute()` 正常收尾）；
 *     ② 战果是**结构化拒绝**（`status:'rejected'` 对象，带 `code:'ARMOR_NOT_USABLE'`），
 *        ✗ 不是裸串 `'rejected'`（那种连拒绝计数都不走）；
 *     ③ **零状态变化**（血不动／盾未自动穿上／敌方不动）；
 *     ④ **回合不白过**：被拒后玩家**再选一次**（`#1914` 步二的回路）⇒ 选择被问 ≥2 次。 */
(() => {
	const R = () => setup.RPG;
	const D = setup.DND3;

	test('防具「用」①【不抛 ＋ 结构化拒绝】：重木盾 used() ⇒ rejected/ARMOR_NOT_USABLE ＋ 白话', async () => {
		const P = D.Player; const 存 = { hp: P.hp, 件: P.items.map((i) => ({ ...i })) };
		P.hp = 20; P.maxHp = 20; P.items.length = 0;
		P.items.push({ id: 'heavy-wooden-shield' });
		const 敌 = new (R().Character)({ name: '幼獾', hp: 6, maxHp: 6, stats: { ac: 10 } });
		let 问过 = 0; const 原 = P.choice;
		P.choice = async (options) => {
			问过 += 1;
			if (问过 > 1) return 'skip';                       // ★第一次选盾，之后跳过 ⇒ 防死循环
			const 盾 = options.find((o) => String(o.value).startsWith('quick:') && /盾/.test(o.text));
			return 盾 ? 盾.value : options.map((o) => o.value)[0];
		};
		/* ★白话的**看处**是上屏（`RPG.perform`）——`RPG.act` 的结构化拒绝会把 `e.message`
		 *   经 `perform` 送正文＋通知面（`#1906` 笔一），✗ 不必（也不该）要求它同时塞进结果对象。 */
		const 原perform = R().perform; const 上屏 = [];
		R().perform = function (...a) { 上屏.push(String(a[0] ?? '')); return 原perform.apply(this, a); };
		R().rng.setSequence([0.9, 0.9, 0.9, 0.9, 0.9, 0.9]);
		const b = new (R().Battle)(1, [P], [敌], true);
		let 抛 = null;
		try { await b.execute(); } catch (e) { 抛 = `抛：${e?.message ?? e}`; }
		P.choice = 原; R().perform = 原perform;
		const 首 = b.resultLog?.[0];
		const 背 = JSON.stringify({ 首果: 首, 我血: P.hp, 盾装备: P.items[0]?.equipped, 敌血: 敌.hp, 问过 });
		P.hp = 存.hp; P.items.length = 0; P.items.push(...存.件);
		assert.eq(抛, null, `★不得抛（那是断流原形）：${抛}｜背=${背}`);
		assert.eq(typeof 首 === 'object' && 首 !== null, true, `★须是结构化拒绝对象，✗ 裸串：${背}`);
		assert.eq(首?.status, 'rejected', `★status=rejected：${背}`);
		assert.eq(上屏.some((行) => /装备|挡刀/.test(行)), true, `★玩家须看到**道具自己的话**（上屏，✗ 泛泛的系统话术）：上屏=${JSON.stringify(上屏)}｜背=${背}`);
		assert.eq(上屏.some((行) => /装备|挡刀/.test(行)), true, `★玩家须看到**道具自己的话**（上屏，✗ 泛泛的系统话术）：上屏=${JSON.stringify(上屏)}`);
		/* ⚠ **不拿玩家血量当「零副作用」的观测**：同一回合里**敌方也会出手** ⇒ 血会掉（本席首版正是
		 *   在此误断：`18 !== 20`）。零副作用要看**这一手自己留下的痕**：事件是 `refused`（✗ 无 `action`
		 *   ／`damage`）、盾未自动穿上、敌方未掉血。 */
		assert.eq(首?.events?.[0]?.kind, 'refused', `★事件面须只有「被拒」（✗ 留下 action／damage）：${背}`);
		assert.eq(首?.events?.some((e) => e.kind === 'action' || e.kind === 'damage'), false, `★不得留下任何动作痕：${背}`);
		assert.eq(!!P.items[0]?.equipped, false, `★零状态变化（盾**未**被自动穿上）：${背}`);
		assert.eq(敌.hp, 6, `★零状态变化（敌方不动）：${背}`);
		assert.eq(问过 >= 2, true, `★回合**不白过**（被拒 ⇒ 再选一次）：${背}`);
	});
})();
