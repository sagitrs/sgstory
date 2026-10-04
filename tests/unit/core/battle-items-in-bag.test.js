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

	test('battle itemsInBag：置位 true ⇒ 只留战斗行动，道具面一件不列', () => {
		State.variables.inventory = [];
		R().give('club'); R().give('bandage'); R().equip('club');
		R().Battle.itemsInBag = true;
		try {
			const 场 = new (R().Battle)(1, [D().Player], [new (R().Character)({ name: '靶', hp: 1 })], true);
			const { itemOptions } = 场.buildPlayerOptions(D().Player);
			const 文 = itemOptions.map((o) => String(o.text));
			assert.ok(!文.some((t) => t.includes('木棒') || t.includes('绷带')),
				`★开关置位后仍列道具（实得 ${JSON.stringify(文)}）—— 「收敛到页脚背包一处」没做到`);
			assert.ok(!itemOptions.some((o) => String(o.value).startsWith('quick:')),
				`★一键项也属道具面 ⇒ 不该列（实得 ${JSON.stringify(itemOptions.map((o) => o.value))}）`);
			assert.ok(itemOptions.some((o) => o.value === 'skip'), '「跳过本回合」是**战斗行动** ⇒ 必须留');
			/* 空手：`Player` 声明了 `unarmed` ⇒ 也得留（否则纯资源背包时玩家只剩「跳过」＝僵局） */
			assert.ok(!itemOptions.some((o) => typeof o.value === 'string' && /^\d+$/.test(o.value)),
				'普通道具项（原槽位下标）不该列');
		} finally { R().Battle.itemsInBag = false; }   // ★还原（静态开关 ⇒ ✗ 留着会串味）
		assert.eq(R().Battle.itemsInBag, false, '还原失败');
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
