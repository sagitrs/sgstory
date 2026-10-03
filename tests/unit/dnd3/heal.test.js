/* dnd3 治疗件（`bandage`／`herb-poultice`）的**实回**与拒绝契约 —— `books#200` P0（`#185` 同族）
 *
 * 面：① 纯函数（`DND3.healAmount`／`healDelta`，治疗量的**一处源**，见 `src/dnd/dnd3/core/heal.js`）
 *     ② 两档受伤目标的**文案数值 ＝ 实际回血**（差 1 点满时 ≠ 名义值 —— 本条的刀靶）
 *     ③ 满血 ⇒ 拒绝（`rejected/action-refused`）＋ 血量不变 ＋ **不扣件** ＋ 出声
 * 口径出处：`books#200`（操作者试玩 15:07：「受到了2点治疗」而体力条不动）
 *   ＋ `books#170` P2-11（同族前例：口粮的「算实回／为 0 则拒绝」，判据在 `dnd3/resources.test.js`）。
 */
(() => {
	const R = () => setup.RPG;
	const D3 = () => setup.DND3;
	const H = () => globalThis.__host;
	const inv = () => State.variables.inventory;
	/** **总件数**（跨槽求和，含 charges）——与 `dnd3/resources.test.js` 同款读法（✗ 只看首槽）。 */
	const total = (id) => inv().filter((s) => s.id === id).reduce((a, s) => a + (s.charges ?? 1), 0);
	/** 清空背包并**重建玩家角色的背包桥接**（理由见 `dnd3/resources.test.js` 的 `clean`）。 */
	const clean = () => {
		State.variables = { inventory: [] };
		for (const c of R().characters.values()) {
			if (Array.isArray(c.items) && (c.properties ?? []).includes('player')) c.items = State.variables.inventory;
		}
	};
	/** 宿主归档里当前段落的**末行**（`perform` 的唯一出口 —— 文案断言读它，✗ 读源码字符串）。 */
	const 末行 = () => { const l = H().host.lines(); return l[l.length - 1] ?? ''; };
	/** 两件的（id, 显示名, 名义量）——名义量取自各件 `stats.hp`（house rule，见各件文件头）。 */
	const 件表 = [['bandage', '绷带', 5], ['herb-poultice', '草药糊', 2]];

	/* ---------- ① 一处源：名义量与实回 ---------- */

	test('heal：名义量与实回读同一处源（加成／上限夹取／满血 0／负血）', () => {
		const 绷带 = R().createItem('bandage');           // stats.hp = 5
		assert.eq(D3().healAmount(绷带, { stats: { heal_bonus: 2 } }), 7, '名义量＝件 5 ＋ 施用者加成 2');
		assert.eq(D3().healAmount(绷带, null), 5, '无施用者 ⇒ 加成视为 0');
		assert.eq(D3().healAmount(R().createItem('herb-poultice'), null), 2, '草药糊：件 2（与绷带同读一处源）');
		assert.eq(D3().healDelta(绷带, null, { hp: 10, maxHp: 20 }), 5, '半血 ⇒ 实回＝名义量');
		assert.eq(D3().healDelta(绷带, null, { hp: 19, maxHp: 20 }), 1, '★差 1 点满 ⇒ 实回 1（名义 5 被 maxHp 夹住）');
		assert.eq(D3().healDelta(绷带, null, { hp: 20, maxHp: 20 }), 0, '满血 ⇒ 实回 0（✗ 负）');
		assert.eq(D3().healDelta(绷带, null, { hp: -3, maxHp: 20 }), 5, '负血（死亡态）⇒ 实回＝名义量（未触顶）');
	});

	/* ---------- ② 文案数值 ＝ 实际回血 ---------- */

	for (const [id, 名, 量] of 件表) {
		test(`heal：${名}——半血 ⇒ 文案报实回 ${量}，且扣一份`, () => {
			clean();
			const P = D3().Player;
			R().give(id);
			const 起始 = total(id);
			P.hp = P.maxHp - 量 - 1;                      // 离满血还有余量 ⇒ 实回＝名义量
			const 前 = P.hp;
			const r = R().act(R().playerActor(), id, R().playerActor(), 'use');
			assert.eq(r?.status, 'applied', `半血 ⇒ applied（实得 ${r?.status}）`);
			assert.eq(P.hp - 前, 量, `半血 ⇒ 实回 ${量}（hp ${前} ⇒ ${P.hp}）`);
			assert.ok(末行().includes(`受到了${量}点治疗`), `文案报实回（实得「${末行()}」）`);
			assert.eq(total(id), 起始 - 1, '用掉一份');
		});

		test(`heal：${名}——★差 1 点满 ⇒ 文案报**实回 1**（✗ 名义 ${量}）`, () => {
			clean();
			const P = D3().Player;
			R().give(id);
			P.hp = P.maxHp - 1;                           // 名义量被夹到 1
			const 前 = P.hp;
			const r = R().act(R().playerActor(), id, R().playerActor(), 'use');
			assert.eq(r?.status, 'applied', `差 1 点满 ⇒ applied（实得 ${r?.status}）`);
			assert.eq(P.hp, P.maxHp, `实回 1（hp ${前} ⇒ ${P.hp}）`);
			assert.ok(末行().includes('受到了1点治疗'),
				`★文案须报**实回**（实得「${末行()}」）—— 印名义值 ${量} 即本条的刀靶（books#200 的病灶）`);
			assert.ok(!末行().includes(`受到了${量}点治疗`), `★✗ 不得印名义值 ${量}（实得「${末行()}」）`);
		});

		test(`heal：${名}——满血 ⇒ 拒绝且**不扣件**、出声`, () => {
			clean();
			const P = D3().Player;
			R().give(id);
			const 起始 = total(id);
			P.hp = P.maxHp;
			const r = R().act(R().playerActor(), id, R().playerActor(), 'use');
			assert.eq(r?.status, 'rejected', `★满血 ⇒ 拒绝（实得 ${r?.status}）—— 原形会静默用掉一份`);
			assert.eq(r?.reason, 'action-refused', '理由＝动作自己判定做不到（`#1776` 契约）');
			assert.eq(P.hp, P.maxHp, '满血 ⇒ 血量不变');
			assert.eq(total(id), 起始, `★满血拒绝 ⇒ **不扣件**（${起始} ⇒ ${total(id)}）`);
			assert.ok(/留着吧/.test(末行()), `满血 ⇒ 出声（可读文案，实得「${末行()}」）`);
			assert.ok(!/受到了/.test(末行()), `★满血 ✗ 不得印「受到…点治疗」（实得「${末行()}」）`);
		});
	}

	/* ---------- ③ 战地医疗：治疗件解除 `death`，**口粮不解除**（两向钉住原形语义） ---------- */

	test('heal：★口粮**不**解除 `death`（原形语义，`clearDeath: false`）／治疗件**要**解除', () => {
		/* 刀来自 `dev-10` 的两树对照实验：`hp = -1 ＋ death` ⇒ 用口粮回 2 ⇒ `hp=1` 而 `death` **仍在**
		 *   （治疗件在同前题下**解除**）。两向写在同一个用例里 ⇒ 谁把哪一侧改单边，本条就红。 */
		clean();
		const P = D3().Player;
		R().give('ration');
		P.hp = -1; P.gain(R().death);
		const r = R().act(R().playerActor(), 'ration', R().playerActor(), 'use');
		assert.eq(r?.status, 'applied', '口粮照常可用（非满血）');
		assert.eq(P.hp, 1, '回到 1（名义 2，未触顶）');
		assert.ok(P.contains(R().death),
			'★口粮 ✗ 不得解除 `death` —— 它原形没有那三行；本笔只改「报哪个数」，✗ 不夹带语义');
		/* 对照臂：治疗件在同前题下**解除**（战地医疗原形，✗ 未受本笔影响） */
		clean();
		const P2 = D3().Player;
		R().give('bandage');
		P2.hp = -1; P2.gain(R().death);
		R().act(R().playerActor(), 'bandage', R().playerActor(), 'use');
		assert.ok(P2.hp > 0, `对照：绷带治疗后 hp > 0（实得 ${P2.hp}）`);
		assert.ok(!P2.contains(R().death), '对照：治疗件在同样前题下**解除** `death`（战地医疗语义不变）');
	});

	test(`heal：治疗到 0 以上 ⇒ 解除 death 减益（负血治疗仍不足以复活者不解除）`, () => {
		clean();
		const P = D3().Player;
		R().give('bandage');
		P.hp = -1; P.gain(R().death);
		assert.ok(P.contains(R().death), '前置：处于死亡态');
		R().act(R().playerActor(), 'bandage', R().playerActor(), 'use');
		assert.ok(P.hp > 0, `治疗后 HP 应 > 0（实得 ${P.hp}）`);
		assert.ok(!P.contains(R().death), '恢复到 0 以上 ⇒ death 减益解除');
		/* 反例臂：治疗量不足以把负血拉回 0 以上 ⇒ 仍处于死亡态（✗ 无条件解除） */
		P.hp = -50; P.gain(R().death);
		R().give('herb-poultice');
		R().act(R().playerActor(), 'herb-poultice', R().playerActor(), 'use');
		assert.ok(P.hp < 0, `仍为负血（实得 ${P.hp}）`);
		assert.ok(P.contains(R().death), '★负血未拉回 0 以上 ⇒ death **不得**被解除');
	});
})();
