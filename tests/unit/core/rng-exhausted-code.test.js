/* ── ★`sgstory#1957`（`#1953` 的 ③ 裁定·叠加案）：**抽尽要可分辨，而尺子不许动** ──
 *
 *   背景：`battle-protocol.test.js:98`「reject ②：拒绝路径不推进随机数」拿**恰好够一次成功的枚数**
 *   当尺子 ⇒ 那一格必然出现「预期抽尽」（攻击落地后敌方回合／伤害骰继续抽）⇒ 被 `#actCatching`
 *   收成拒绝 ⇒ 不红，但那三条讯息与「**意外**抽尽」（夹具真配错了）**长得一样** ✗。
 *   ★「加长供数」不是解法 —— 那会**弄瞎尺子** ✓（裁定原文）。
 *
 *   本件断两面：
 *     ① **码值在位**：抽尽抛出的 Error 带 `code='RNG_EXHAUSTED'`，且**行为不变**（照抛、✗ 不静默回退
 *        —— `#1892` 那条）；`RPG.act` 处**照旧抛**（✗ 不走「误用 ⇒ 玩家可见拒绝」那支 ⇒ 开发者话术
 *        不上玩家屏）。
 *     ② **收成路带码**：战斗侧 `#actCatching` 收下的抽尽拒绝，在**结果面**带 `code='RNG_EXHAUSTED'`
 *        ⇒ 于是「预期抽尽」与「意外抽尽」在结果面可分辨（✗ 任何一格的尺子都没动）。
 *   ⚠ 无码的抛错**结果面逐字不变**（既有断言的守卫）—— 由本件的第 ③ 面（无码 ⇒ 无该键）守住。 */
(() => {
	const R = () => setup.RPG;
	const D = setup.DND3;

	test('抽尽码①【行为不变】：抽尽仍抛（✗ 不静默回退），且码值为 RNG_EXHAUSTED', () => {
		R().rng.setSequence([0.5]);
		assert.eq(typeof R().rng.pick(20), 'number', '第一次抽取照常 ✓');
		let 抛 = null;
		try { R().rng.pick(20); } catch (e) { 抛 = e; }
		R().rng.reset();
		assert.eq(!!抛, true, '★抽尽须**照抛**（✗ 静默回退真随机 —— `#1892` 反静默那条不得反转）');
		assert.eq(抛?.code, 'RNG_EXHAUSTED', `★抛错须带码值（实得 ${JSON.stringify(抛?.code)}）`);
	});

	test('抽尽码②【收成路】：战斗里抽尽 ⇒ 拒绝结果面带 RNG_EXHAUSTED（✗ 尺子未动）', async () => {
		const P = D.Player; const 存 = { hp: P.hp, 件: P.items.map((i) => ({ ...i })) };
		P.hp = 20; P.maxHp = 20; P.items.length = 0;
		P.items.push({ id: 'club', charges: null });
		const 敌 = new (R().Character)({ name: '靶', hp: 9999, maxHp: 9999, stats: { ac: 10 } });
		const 原choice = P.choice;
		P.choice = async (o) => o.find((x) => String(x.value).startsWith('quick:'))?.value ?? o[0].value;
		R().rng.setSequence([0.5]);                         // ★只够**第一次**抽（命中检定）⇒ 伤害骰必抽尽
		const b = new (R().Battle)(1, [P], [敌], true);
		let 抛 = null;
		try { await b.execute(); } catch (e) { 抛 = String(e?.message ?? e); }
		P.choice = 原choice; R().rng.reset();
		const 首 = b.resultLog?.[0];
		const 背 = JSON.stringify({ 首, 抛, 敌: 敌.hp });
		P.hp = 存.hp; P.items.length = 0; P.items.push(...存.件);
		assert.eq(抛, null, `★抽尽不得逃出战斗（战斗侧收成可读拒绝）：${背}`);
		assert.eq(首?.code, 'RNG_EXHAUSTED', `★结果面须带码值（预期／意外据此分辨）：${背}`);
	});

	test('抽尽码④【负控·不上玩家屏】：抽尽那一战里，玩家面**不得**出现开发者话术', async () => {
		/* ★`dev-10` 的刀-B 逼出来的这一格：我曾声称「`RPG.act` 处照旧抛 ⇒ 开发者话术不上玩家屏」，
		 *   而把 `30-inventory.js` 的那处例外**删掉**，全套**依然 735/0 全绿** ✗ ⇒ 承重件无守 ✓。
		 *   本格断：抽尽那一战里，**玩家面**（`RPG.perform` 送出的文案）**不得**出现
		 *   「注入序列已耗尽」「不静默回退真随机」这类**开发者话术**（那是仪器条件，✗ 不是剧情）。 */
		const P = D.Player; const 存 = { hp: P.hp, 件: P.items.map((i) => ({ ...i })) };
		P.hp = 20; P.maxHp = 20; P.items.length = 0;
		P.items.push({ id: 'club', charges: null });
		const 敌 = new (R().Character)({ name: '靶', hp: 9999, maxHp: 9999, stats: { ac: 10 } });
		const 原choice = P.choice; const 原perform = R().perform; const 上屏 = [];
		P.choice = async (o) => o.find((x) => String(x.value).startsWith('quick:'))?.value ?? o[0].value;
		R().perform = function (...a) { 上屏.push(String(a[0] ?? '')); return 原perform.apply(this, a); };
		R().rng.setSequence([0.5]);
		let 抛 = null;
		try { await new (R().Battle)(1, [P], [敌], true).execute(); } catch (e) { 抛 = String(e?.message ?? e); }
		P.choice = 原choice; R().perform = 原perform; R().rng.reset();
		const 玩家面 = 上屏.join('\n');
		P.hp = 存.hp; P.items.length = 0; P.items.push(...存.件);
		assert.eq(抛, null, `★抽尽不得逃出战斗：${抛}`);
		assert.eq(/注入序列已耗尽|不静默回退真随机/.test(玩家面), false,
			`★开发者话术**不得**上玩家屏（那是测试仪器条件）：上屏=${JSON.stringify(上屏)}`);
	});

	test('抽尽码③【零回归】：无码的抛错 ⇒ 结果面**不带**该键（既有断言逐字不变）', () => {
		const 面 = R().actionResult.rejected({ actor: null, reason: 'action-threw', detail: 'x' });
		assert.eq(Object.prototype.hasOwnProperty.call(面, 'code'), false,
			`★无码时不得新增键（守既有结果面形状）：${JSON.stringify(面)}`);
	});
})();
