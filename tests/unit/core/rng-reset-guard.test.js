/* `sgstory#1955`（框架每格复位 · 补判据守住）· T 席 `sagitrs-tester-4`
 *
 * 背景：框架**已有**「每个用例运行前重置随机源」（`tests/unit/framework/harness.js:40-42`
 *   `if (window.setup?.RPG?.rng?.reset) window.setup.RPG.rng.reset();`，出处 `#1706`）
 *   —— 但**没有判据守它** ⇒ 谁哪天把这行删了／挪了，**没有任何一格会红**，
 *   而症状是「某格注入序列后，**下一格**的首抽读到**旧序列**」——跨用例污染，
 *   在单测里表现为**另一格莫名其妙地红**（或更坏：莫名其妙地绿）。
 *
 * 判据的**观察面**（★这档第一版写错过，记在这里）：
 *   `RPG.rng` 注入态的**权威标记**是 **`_impl`**：`setSequence`／`setFunction` 装上它，
 *   `reset()` 把它设回 `null`（`src/core/05-dice.js:46`）。
 *   ★第一版我用「猜字段名（序列／seq／…）」＋「`pick([1])` 的返回值」判 ⇒ **两个面都观察不到**：
 *     猜的键名一个都没命中、`pick([1])` 恒返 `1` ⇒ 判据**空转**（复位真坏也不会红）。
 *   ⇒ 现在改判**`_impl` 是否为 `null`**（确定性），并用**高分辨率**行为面做第二条：
 *     `pick(1e9)` 的返回值若**恰好等于**注入序列会给出的那个整数，才判红（碰撞几率≈1e-9，不假红）。
 *
 * ★刀（负控，设计时即指定靶）：摘掉 harness 那行 `rpg.rng.reset()` ⇒ **本档②须具名红**。
 *   （我下过：产物层替换 ＋ 复原；读数见 PR 评论。引擎单测装具目前没有自动刀架。）
 */
(() => {
	const R = () => setup.RPG;
	const 注入值 = 0.999999999;          // 高分辨率：真随机命中同一整数的几率≈1e-9
	const 分辨率 = 1e9;

	/* ① 注入：证明**注入本身可观察**（否则②的「无残留」是空转）。 */
	test('★rng 复位守①【注入可观察】：注入固定序列 ⇒ `rng._impl` 非空（本格刻意留下注入态）', () => {
		const rng = R().rng;
		if (typeof rng?.setSequence !== 'function') {
			console.log('  ⏳ rng.setSequence 未在位 ⇒ 本档整族待判（候 D 码／框架面）');
			assert.ok(true);
			return;
		}
		rng.setSequence([注入值]);
		const 装上了 = rng._impl != null;
		const 该给的整 = Math.floor(注入值 * 分辨率) + 1;   // pick(n) 的映射（单元值 ⇒ 1..n）
		console.log(`  · 注入 ${注入值} ⇒ rng._impl ${装上了 ? '非空（已装）' : '**仍为空 ✗**'}`
			+ `｜若残留则 pick(${分辨率}) 会给出 ${该给的整}`);
		/* ★这一格就判「注入可观察」：装不上 ⇒ ②那条「无残留」将永远为真 ⇒ 判据是空的。 */
		assert.ok(装上了, '★注入后 `rng._impl` 须非空（✗ 若为空，则「无残留」那条判据是空转，守不住任何东西）');
	});

	/* ② ★守：本格（＝下一格）**不得**带着上一格的注入态。 */
	test('★rng 复位守②【无残留】：上一格注入过 ⇒ 本格 `rng._impl` 须为空（跨用例污染的判据）', () => {
		const rng = R().rng;
		if (typeof rng?.setSequence !== 'function') { assert.ok(true); return; }
		const 残留 = rng._impl != null;
		let 首抽 = null;
		try { 首抽 = typeof rng.pick === 'function' ? rng.pick(分辨率) : null; } catch { 首抽 = null; }
		const 该给的整 = Math.floor(注入值 * 分辨率) + 1;
		const 行为面命中 = 首抽 === 该给的整;

		console.log(`  · 本格 rng._impl＝${残留 ? '**非空（残留 ✗）**' : 'null（无残留 ✓）'}`
			+ `｜本格 pick(${分辨率})＝${JSON.stringify(首抽)}（旧序列会给出 ${该给的整}）`);
		assert.ok(!残留 && !行为面命中,
			`★上一格的注入态**跨到了本格**：rng._impl ${残留 ? '非空' : '为空'}`
			+ `｜本格首抽 ${JSON.stringify(首抽)}（若等于 ${该给的整} 则说明读的是旧序列）`
			+ ' ⇒ 「每格复位随机源」那一步没生效（`harness.js` 的 `setup.RPG.rng.reset()`；出处 #1706）'
			+ ' ⇒ 跨用例污染：下一格可能莫名其妙地红／绿');
	});
})();
