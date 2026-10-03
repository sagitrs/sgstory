/* ── ★`sgstory#1953`：**开发者留痕要有归属**（✗ 只有栈）──
 *
 *   背景（`tester-3` T 席实测）：单测里的栈帧全是 `tests/unit/dist/bundle.js` 的**匿名帧**
 *   ⇒ 「动作抛错」这条留痕**认不出是哪一格、哪个件、打谁** ⇒ 排查只能靠临时诊断刀。
 *   本格断**归属四元组**在留痕里（`actor`／`item`／`target`／`action`）——值与结果面**同源**
 *   （`RPG.unitId.of`），✗ 另写一份取法。
 *
 *   ⚠ 判据是「留痕**带得上**归属」，✗ 不是「抛出好不好」（那是别的格的事）。 */
(() => {
	const R = () => setup.RPG;
	const D = setup.DND3;

	test('留痕①【归属】：动作抛错时开发者留痕须带 actor／item／target／action', async () => {
		/* 造一件**会真抛**的件（✗ 结构化拒绝 —— 那条不走本留痕；见 `30-inventory.js` 的 catch）。 */
		const 炸件 = R().defItem({
			id: 'unit-throw-attrib', name: '单测炸件', charges: null, stackable: false,
			stats: { noBattleUse: false },
			battleUse: { class: 'damage' },
			used() { throw new Error('单测炸件：按设计抛'); },
		});
		const P = D.Player; const 存 = { hp: P.hp, 件: P.items.map((i) => ({ ...i })) };
		P.hp = 20; P.maxHp = 20; P.items.length = 0;
		P.items.push({ id: 'unit-throw-attrib', charges: null });   // ★按 id 进袋（`defItem` 已注册该 id）
		const 敌 = new (R().Character)({ name: '靶', hp: 50, maxHp: 50, stats: { ac: 10 } });

		const 原err = console.error; const 抓到 = [];
		console.error = (...a) => { 抓到.push(String(a[0] ?? '')); };
		const 原choice = P.choice;
		P.choice = async (o) => o.map((x) => x.value)[0];   // 首项：一键/道具 —— 抛后就跳过（防死循环）
		R().rng.setSequence(new Array(64).fill(0.0));       // ★供整个回合（含敌方出手）
		let 抛 = null;
		try { await new (R().Battle)(1, [P], [敌], true).execute(); } catch (e) { 抛 = String(e?.message ?? e); }
		console.error = 原err; P.choice = 原choice;
		const 留痕 = 抓到.find((行) => /动作抛错/.test(行)) ?? '';
		const 背 = JSON.stringify({ 留痕, 抛, 敌: 敌.hp });
		P.hp = 存.hp; P.items.length = 0; P.items.push(...存.件);
		assert.eq(抛, null, `★抛不出战斗（战斗侧须收成可读拒绝）：${背}`);
		assert.eq(/actor=\S+/.test(留痕), true, `★须带 actor（谁）：${背}`);
		assert.eq(/item=\S+/.test(留痕), true, `★须带 item（哪件）：${背}`);
		assert.eq(/target=\S+/.test(留痕), true, `★须带 target（打谁）：${背}`);
		assert.eq(/action=use/.test(留痕), true, `★须带 action（哪个动作）：${背}`);
	});
})();
