/* **弃局口**（`RPG.Battle.cancel(reason)` · `books#402` · 2026-10-08）。
 *
 * 契约（票面）：清登记（`current`／`按会话`）＋ 记「弃局」态；★**幂等**；★**无战斗时无害**。
 *
 * 判据（★先写先跑：在加 `cancel` 之前的现码上，本档**整档红**——`cancel` 不存在 ✓）：
 *   ① 【正控】登记在位 ⇒ `currentOf(null)` 取得到它；
 *   ② `cancel('测试')` ⇒ `current === null` ＋ 返回被取消的那局 ＋ `弃局` 记下 reason／有局=true；
 *   ③ 【幂等】再调一次 ⇒ ✗ 抛 ＋ `current` 仍 null ＋ `弃局.有局` 随实况转 false；
 *   ④ 【无战斗无害】空手调 ⇒ ✗ 抛 ＋ 返回 null；
 *   ⑤ 【再战可开】cancel 后登记面可再次被占用。
 */
(() => {
	const R = () => setup.RPG;
	const 记 = [];
	const ok = (c, m) => { if (!c) 记.push('✗ ' + m); };
	const eq = (a, b, m) => ok(a === b, `${m}（期望 ${JSON.stringify(b)}，实得 ${JSON.stringify(a)}）`);

	const B1 = R().Battle;
	ok(typeof B1?.cancel === 'function', '★前置：`RPG.Battle.cancel` 须存在（本笔新增 ✓）');
	if (typeof B1?.cancel !== 'function') { console.log('  ✗ 前置：cancel 缺失'); throw new Error('battle-cancel：cancel 不存在'); }

	/* ① 正控：把一局登记为「官方当前局」（`execute()` 起手就是这么登记的 ✓，此处只造那一态） */
	const 假局 = { 会话: null, name: '测试局' };
	B1.current = 假局;
	eq(B1.currentOf(null), 假局, '★①正控：登记在位 ⇒ currentOf(null) 取得到它');

	/* ② 取消 */
	let 返 = null, 抛 = null;
	try { 返 = B1.cancel('测试'); } catch (e) { 抛 = e; }
	ok(!抛, `★②：cancel 不得抛（实得 ${抛?.message ?? ''}）`);
	eq(B1.current, null, '★★②承重：取消后 `current` 须为 `null`');
	eq(返, 假局, '★②：须**返回被取消的那一局**（✗ 只清不留档）');
	ok(B1.弃局 && B1.弃局.reason === '测试' && B1.弃局.有局 === true, `★②：『弃局』须记 reason／有局（实得 ${JSON.stringify(B1.弃局)}）`);

	/* ③ 幂等 */
	let 抛2 = null;
	try { B1.cancel('再来一次'); } catch (e) { 抛2 = e; }
	ok(!抛2, `★③幂等：重复 cancel 不得抛（实得 ${抛2?.message ?? ''}）`);
	eq(B1.current, null, '★③幂等：`current` 仍为 null');
	eq(B1.弃局.有局, false, '★③幂等：无局再取消 ⇒ `弃局.有局` 随实况转 false（✗ 留住旧话）');

	/* ④ 无战斗时无害 */
	let 抛3 = null, 返3 = 'x';
	try { 返3 = B1.cancel(); } catch (e) { 抛3 = e; }
	ok(!抛3, `★④：无战斗时不得抛（实得 ${抛3?.message ?? ''}）`);
	eq(返3, null, '★④：无战斗时返回 null');

	/* ⑤ 再战可开 */
	const 新局 = { 会话: null, name: '二局' };
	B1.current = 新局;
	eq(B1.currentOf(null), 新局, '★⑤：cancel 之后登记面可再次占用（再战可开 ✓）');
	B1.current = null;

	if (记.length) { 记.forEach((l) => console.log('  ' + l)); throw new Error(`battle-cancel：${记.length} 处失败`); }
	console.log('  ✓ 弃局口：5 条判据（正控／承重／幂等／无害／再战可开）');
})();
