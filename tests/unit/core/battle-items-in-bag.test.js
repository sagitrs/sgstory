/* core/40-battle —— **道具收敛到页脚背包**（`sgstory-books#280` ⑩ 的引擎侧开关）
 *
 * 要断的是两件相反的事：
 *   ① **缺省 `false` ⇒ 逐字节同今天**（战斗菜单照旧逐件列道具）—— 开关的**零回归**面；
 *   ② `true` ⇒ 战斗菜单**只留战斗行动**（空手／跳过），道具面（一键项／重复项／逐件项）**一件不列**
 *      —— 「收敛到页脚背包一处」的语义面。
 * ⚠ 开关是**静态**（`RPG.Battle.itemsInBag`）⇒ 本档每臂用完必须还原（✗ 漏 ⇒ 后面的用例串味）。
 *
 * 刀（记在提交信息）：把开关的判据拆掉（恒列道具）⇒ ② 面红；复原回绿。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	test('battle itemsInBag：缺省 false ⇒ 战斗菜单照旧列道具（零回归面）', () => {
		assert.eq(R().Battle.itemsInBag, false, '缺省必须是 false（✗ 改默认＝改所有故事的战斗菜单）');
		State.variables.inventory = [];
		R().give('club'); R().give('bandage'); R().equip('club');
		const 场 = new (R().Battle)(1, [D().Player], [new (R().Character)({ name: '靶', hp: 1 })], true);
		const { itemOptions } = 场.buildPlayerOptions(D().Player);
		assert.ok(itemOptions.some((o) => o.text.includes('木棒')), `缺省应列「木棒」（实得 ${JSON.stringify(itemOptions.map((o) => o.text))}）`);
		assert.ok(itemOptions.some((o) => o.text.includes('绷带')), '缺省应列「绷带」');
		assert.ok(itemOptions.some((o) => o.value === 'skip'), '缺省应有「跳过本回合」');
	});

	test('battle itemsInBag：置位 true ⇒ 只留**手上的武器**＋战斗行动（`#280` ⑭ 的口径）', () => {
		State.variables.inventory = [];
		R().give('club'); R().give('bandage'); R().equip('club');   // 木棒**已装备** ⇒ 它是「战斗行动」那一手
		R().Battle.itemsInBag = true;
		try {
			const 场 = new (R().Battle)(1, [D().Player], [new (R().Character)({ name: '靶', hp: 1 })], true);
			const { itemOptions } = 场.buildPlayerOptions(D().Player);
			const 文 = itemOptions.map((o) => String(o.text));
			/* ★⑭（操作者令 · 领队预批「甲」）：**手上那件武器的攻击必须留** —— 它属「战斗行动」面。
			 *   病灶：⑩ 把它一起扫走后，玩家（含脚本臂）顺手点第一项只剩「空手打击」＝非致命 ⇒ kills 恒 0
			 *   ⇒ 首战门永闭 ⇒ 主线不可通关（tester-4 已把因钉在**菜单**上）。 */
			assert.ok(文.some((t) => t.includes('木棒')), `★⑭：开关置位后**手上的武器攻击项没了**（实得 ${JSON.stringify(文)}）—— 顺手点第一项只剩空手＝非致命 ⇒ kills 恒 0`);
			assert.ok(itemOptions.some((o) => String(o.value).startsWith('quick:')), '⑭：手上的武器应以一键项形给出（件＋动作当场定）');
			/* 其余道具仍**一件不列**（⑩ 的本意不变） */
			assert.ok(!文.some((t) => t.includes('绷带')), `★⑩：非武器道具不该在菜单里（实得 ${JSON.stringify(文)}）`);
			assert.ok(!itemOptions.some((o) => /^\d+$/.test(String(o.value))), '⑩：普通逐件项（原槽位下标）不该列');
			assert.ok(itemOptions.some((o) => o.value === 'skip'), '「跳过本回合」是战斗行动 ⇒ 必须留');
		} finally { R().Battle.itemsInBag = false; }
		assert.eq(R().Battle.itemsInBag, false, '还原失败');
	});

	test('battle itemsInBag：**未装备**的武器不出项（仍走页脚背包）', () => {
		State.variables.inventory = [];
		R().give('club');                                            // ✗ 不 equip
		R().Battle.itemsInBag = true;
		try {
			const 场 = new (R().Battle)(1, [D().Player], [new (R().Character)({ name: '靶', hp: 1 })], true);
			const 文 = 场.buildPlayerOptions(D().Player).itemOptions.map((o) => String(o.text));
			assert.ok(!文.some((t) => t.includes('木棒')), `★⑩：未装备的武器属道具面 ⇒ 该走背包（实得 ${JSON.stringify(文)}）`);
		} finally { R().Battle.itemsInBag = false; }
	});

	test('battle itemsInBag：道具面收起来了，但**道具照样能用**（走提交面 ⇒ 同一条回合账）', async () => {
		State.variables.inventory = [{ id: 'bandage', charges: 2 }];
		D().Player.hp = D().Player.maxHp - 10; D().Player.nonlethal = 0;
		const 血前 = D().Player.hp;
		R().Battle.itemsInBag = true;
		const 原 = D().Player.choice;
		D().Player.choice = () => new Promise((res) => { void res; });   // 悬着：只有提交会答（✗ 没人点菜单）
		try {
			const 场 = new (R().Battle)(1, [D().Player], [new (R().Character)({ name: '靶', hp: 1, maxHp: 1, stats: { dmg: '0', atkBonus: 0 } })], true);
			const p = 场.execute();
			await new Promise((r) => setTimeout(r, 0));
			const r = 场.submit({ item: 'bandage' });      // 页脚背包那条路
			assert.ok(r.ok === true, `提交应被接受，实得 ${JSON.stringify(r)}`);
			await Promise.race([p, new Promise((r2) => setTimeout(r2, 1500))]);
			assert.eq(D().Player.hp, 血前 + 5, `菜单里没有道具了，但道具仍须能用（血 ${血前} ⇒ ${D().Player.hp}）`);
		} finally {
			if (原 === undefined) delete D().Player.choice; else D().Player.choice = 原;
			R().Battle.itemsInBag = false;
		}
	});
})();
