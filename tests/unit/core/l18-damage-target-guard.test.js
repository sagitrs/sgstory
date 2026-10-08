/* **L18 伤靶守卫**（`books#402` · 2026-10-08）。
 *
 * 口径（票面＝领队「L18 守卫笔开」令）：靶解析／施加两处若拿到「没有靶」的态 ⇒ **具名拒**，
 *   ✗ 让它漏下去（`RPG.applyDamage(that)` 旧码读 `that.hp` ⇒ **TypeError 逃出战斗** ✓）。
 *
 * 判据（★每条**先写先跑**，在改动前的现码上红）：
 *   ① `applyDamage(null, 5)` ⇒ **抛具名拒**（`code === 'DAMAGE_NO_TARGET'`）。
 *      ★刀：旧码在此抛的是 `TypeError`（`code` 为空）⇒ ① 红 ⇒ 本格**咬得住旧行为** ✓。
 *   ② 【正控】靶在位 ⇒ 照常扣血（✗ 守卫不得误伤正常路）。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;
	const 记 = [];
	const ok = (c, m) => { if (!c) 记.push('✗ ' + m); };
	const eq = (a, b, m) => ok(a === b, `${m}（期望 ${JSON.stringify(b)}，实得 ${JSON.stringify(a)}）`);

	/* ① 没有靶 ⇒ 具名拒（✗ TypeError） */
	let 抛 = null;
	try { R().applyDamage(null, 5); } catch (e) { 抛 = e; }
	ok(!!抛, '★①：`applyDamage(null, 5)` 须出声（✗ 静默）');
	eq(抛?.code ?? null, 'DAMAGE_NO_TARGET', '★①：须是**具名拒**（旧码此处 `code` 为空 ⇒ 本格红）');

	/* ② 【正控】正常路不受影响 */
	const P = D().Player;
	const 前 = P.hp;
	R().applyDamage(P, 1);
	ok(P.hp === 前 - 1, `★②正控：靶在位时照常扣血（前 ${前} ⇒ 后 ${P.hp}）`);
	P.hp = 前;   // 复原

	if (记.length) { 记.forEach((l) => console.log('  ' + l)); throw new Error(`L18 伤靶守卫：${记.length} 处失败`); }
	console.log('  ✓ L18 伤靶守卫：2 条判据（具名拒 ＋ 正控）');
})();
