/* `sgstory#2043`（A2 前置）**补格**：改良抓握（`improved-grab`）**真钩子路**的源贯通。
 *
 * 引擎实现侧自落（T 席 `#2054` 的 ⑩ 只直调 `grappleRoll` ⇒ 覆盖不到**钩子路**）✓。
 * ★本格断**真路**：`meleeAttack(item, that, from, 源)` ⇒ `runOnHit(item.stats.onHit, ctx)` ⇒
 *   `hold(attacker, target, {fromHit:true}, 源)` ⇒ `opposedGrapple` ⇒ 两掷骰。
 * ★读数**不依赖具体点数**（点数随攻击骰/伤害骰的消耗而错位，且常数序列会平局 ⇒ 进重掷环烧干 ✗）：
 *   改在**源上挂 pick 计数器** —— 真路用了它 ⇒ 计数 > 0；✗ 带源 ⇒ 计数 = 0（走全局）。
 *   ⇒ 链上任何一跳断了（`combat.js` 的 ctx／`grapple.js:285` 的 run／`hold`／`opposedGrapple`／`grappleRoll`）本格皆红 ✓。
 * 契约（与他格同一把尺）：**给源 ⇒ 全底层抽取走该源；✗ 给源 ⇒ 走全局（旧行为逐字同）** ✓。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;
	const C = () => R().diceControl;
	const 清 = () => { C().clearAll(); C().清账(); };
	const 造 = (名) => new (R().Character)({ name: 名, hp: 99, maxHp: 99, stats: D().stats({ str: 10 }) });
	/* 可分辨的交替序列（避免平局）：奇数位高、偶数位低 */
	const 序 = () => [0.95, 0.55, 0.95, 0.55, ...Array.from({ length: 48 }, (_, i) => (i % 2 ? 0.55 : 0.95))];

	test('★#2043 ⑩补【真钩子路】`meleeAttack(件, 乙, 甲, 源)` 后的擒抱骰吃该源（✗ 带源 ⇒ 走全局）', () => {
		清();
		const 旧全局 = R().rng._impl;
		try {
			const 件 = { stats: { onHit: 'improved-grab', dmg: '1d4', type: 'piercing', atkBonus: 20, critMin: 20 }, equipped: true, entityId: 'probe-claw' };

			/* ① 给源：源上挂 pick 计数器 ⇒ 真路若透源，计数必 > 0 */
			const A = R().makeRng({ 名: 'A' });
			A.setSequence(序());
			let 次A = 0; const 原A = A.pick.bind(A);
			A.pick = (...a) => { 次A += 1; return 原A(...a); };
			R().rng.setSequence(序());                       // 全局也给一组（✗ 耗尽 ⇒ 不因烧干而假红 ✓）
			D().meleeAttack(件, 造('乙'), 造('甲'), A);
			const 屏 = (R().notices?.() ?? []).map((n) => (typeof n === 'string' ? n : (n?.text ?? ''))).join('\n');
			/* ★**至少 4 次**＝攻击骰(1)＋伤害骰(1)＋擒抱对抗两掷(2)；✗ 擒抱路未透源 ⇒ 只 2 次 ✓
			 *   （★只断「>0」不够：`meleeAttack` 自己就用源 ⇒ 摘掉钩子也仍 >0 ✗ —— 本席实测踩过 ✓）。 */
			assert.eq(次A >= 6, true, `★给源 ⇒ 擒抱路须也吃该源（≥6 次：攻/伤/擒抱对抗×2 等）；实得 A.pick 次数＝${次A}（★摘掉 ctx 源实测＝4 ⇒ 擒抱两掷未透 ✗）`);
			assert.eq(/擒抱检定/.test(屏), true, `★给源 ⇒ 屏上须出现**擒抱检定**行（真路跑到底）；实得屏文：${JSON.stringify(屏.slice(0, 240))}`);

			/* ② 控制组：✗ 给源 ⇒ 该源**一次都不许被用**（全走全局 = 旧行为 ✓） */
			const B = R().makeRng({ 名: 'B' });
			B.setSequence(序());
			let 次B = 0; const 原B = B.pick.bind(B);
			B.pick = (...a) => { 次B += 1; return 原B(...a); };
			D().meleeAttack(件, 造('乙2'), 造('甲2'));
			assert.eq(次B, 0, `★✗ 给源 ⇒ 须仍走**全局**（旧行为逐字同）；实得该源被用 ${次B} 次 ✗`);
		} finally { R().rng._impl = 旧全局; 清(); }
	});
})();
