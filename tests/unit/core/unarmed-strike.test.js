/* `#1854` 空手打击（Unarmed Strike）—— 引擎级常驻项
 *
 * 规则出处（pinned `tests/gates/pin-cache/27msrdcombat战斗-d20m.md:333-341`）：
 *   拳/踢/头槌按近战武器处理；中型角色 **1d3＋力量修正、非致命**；空手打击算轻近战武器。
 *   ★**累积阈值不在 pin 里**（本席逐文件核过：19 个 pinned 文件中含 `nonlethal` 的 4 个均无「累积段」）
 *     ⇒ 按本仓纪律标 **house rule（非 SRD）**：**唯一**阈值 `nonlethal > hp` ⇒ **昏迷出局**。
 *     ⚠ pin 的 `nonlethal >= hp`「**踉跄**」态**本引擎不实现** —— 全仓无 `staggered` 读数
 *       ⇒ ✗ 不静默丢弃：显式记在此（与 `armed`／借机攻击 同一形）。
 *   ★**armed／借机攻击**（`:339`）只作**注记**：其唯一机制后果是 AoO，而引擎无 AoO 层
 *     ⇒ HR：本引擎不实现借机攻击（✗ 静默丢弃）。
 *
 * 本档守的**行为契约**（✗ 不重测攻击数学 —— 那属各包 combat 的档）：
 *   ①「纯资源背包」不再困死（本票的**存在理由**：操作者实测卡 8 回合僵局）
 *   ② 空手＝**非致命**（独立计数、✗ 不改 hp）
 *   ③ 非致命阈值 ⇒ **出局** ＋ ✗ `RPG.death` ＋ ✗ 掉落
 *   ④【对照】致命路 ⇒ `death` ＋ 掉落（✗ 被非致命路径污染）
 *   ⑤ 无空手能力者 ⇒ **不出**该选项（零回归）
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	/** 一场「玩家（`DND3.Player`）对若干敌」的交互战；`choice` 喂预设序列。 */
	const fight = async (foes, seq, { maxRounds = 8 } = {}) => {
		const lines = [];
		const b = new (R().Battle)(maxRounds, [D().Player], foes, true);
		b.perform = (t) => lines.push(String(t));
		const P = setup.DND3.Player;
		if (!Array.isArray(State.variables.inventory)) State.variables.inventory = [];   // 前置：背包恒存在
		const saved = { items: P.items, choice: P.choice };
		P.items = State.variables.inventory;
		P.choice = async () => (seq.length ? seq.shift() : 'skip');
		try { await b.execute(); } finally { P.items = saved.items; P.choice = saved.choice; }
		return { lines, battle: b };
	};
	const mkFoe = (over = {}) => new (R().Character)({
		name: '獾', hp: 8, maxHp: 8, items: [{ id: 'coin' }], stats: D().stats({ ac: 3 }), ...over });

	test('★#1854 ①：**纯资源背包** ⇒ 选单出现「空手打击」（✗ 只剩「跳过」＝操作者卡死形）', () => {
		R().give('rock');                                   // `noBattleUse` ⇒ 不进选单
		const b = new (R().Battle)(8, [D().Player], [mkFoe()], true);
		const o = b.buildPlayerOptions(D().Player);
		assert.ok(o.itemOptions.some((x) => x.value === 'unarmed'),
			`★纯资源背包须有可打击手段（✗ 8 回合僵局）：${JSON.stringify(o.itemOptions)}`);
		assert.ok(!o.itemOptions.some((x) => x.text.includes('石料')), '石料本身仍不进选单（`#1841` 不回归）');
	});

	test('★#1854 ②：空手打击＝**非致命** —— 累积 `nonlethal`、**不碰 `hp`**', async () => {
		const foe = mkFoe({ hp: 8, maxHp: 8 });
		/* ★确定性（承 `#1846` RC 教训：✗ 概率格）：掷骰拉满 ⇒ 必命中 */
		R().rng.setSequence(Array.from({ length: 120 }, () => 0.99));
		try { await fight([foe], ['unarmed', '獾']); } finally { R().rng.reset(); }
		assert.eq(foe.hp, 8, '★非致命**不改 `hp`**（打晕 ≠ 打死）');
		assert.ok((foe.nonlethal ?? 0) > 0, `★ nonlethal 须累积（实得 ${foe.nonlethal}）`);
	});
	test('★#1854 ③：非致命达阈 ⇒ **出局** ＋ ✗ `death` ＋ ✗ 掉落', async () => {
		const foe = mkFoe({ hp: 3, maxHp: 3 });            // 低血 ⇒ 数回合内必被打晕
		R().rng.setSequence(Array.from({ length: 200 }, () => 0.99));
		if (!Array.isArray(State.variables.inventory)) State.variables.inventory = [];
		const before = State.variables.inventory.length;
		let lines;
		try { ({ lines } = await fight([foe], Array.from({ length: 8 }).flatMap(() => ['unarmed', '獾']))); }
		finally { R().rng.reset(); }
		assert.ok(R().isKnockedOut(foe), `★阈值达须**出局**（hp=${foe.hp} nonlethal=${foe.nonlethal}）`);
		assert.ok(foe.isDown, '★`isDown` 亦须为真（战斗循环据此判出局）');
		assert.eq(foe.contains(R().death), false, '★非致命**永不致死**（✗ 施加 death 标记）');
		assert.eq(State.variables.inventory.length, before, '★打晕**不掉落**（MSRD：打晕 ≠ 打死）');
		assert.ok(lines.some((l) => l.includes('打晕')), `★结束文案说「打晕」而非「击败」：${JSON.stringify(lines.slice(-2))}`);
	});

	test('★#1854 ④【对照】致命路 ⇒ `death` ＋ 掉落（✗ 被非致命路径污染）', async () => {
		const foe = mkFoe({ hp: 3, maxHp: 3 });
		R().give('club');                                   // 武器 ⇒ 致命
		R().rng.setSequence(Array.from({ length: 200 }, () => 0.99));
		if (!Array.isArray(State.variables.inventory)) State.variables.inventory = [];
		const before = State.variables.inventory.length;
		try { await fight([foe], ['0', 'use', '獾', '0', 'use', '獾']); } finally { R().rng.reset(); }
		assert.eq(foe.hp, 0, '★致命路把 `hp` 打到 0');
		assert.eq(foe.nonlethal, undefined, '★致命路**不**累积非致命（两路分离）');
		assert.eq(foe.contains(R().death), true, '★致命 ⇒ 施加 `death`');
		assert.ok(State.variables.inventory.length > before, '★致命 ⇒ 战利品掉落');
	});

	test('★#1854 ⑤：**无空手能力**者 ⇒ 不出该选项（零回归）', () => {
		R().give('rock');
		const plain = new (R().Character)({ name: '路人', hp: 10, maxHp: 10, stats: {}, effects: [] });
		plain.items = State.variables.inventory;
		const o = new (R().Battle)(8, [plain], [mkFoe()], true).buildPlayerOptions(plain);
		assert.ok(!o.itemOptions.some((x) => x.value === 'unarmed'),
			'★未声明 `unarmed` 的角色不出现空手项（普通 Character／未接线包）');
	});

	test('★#1854 ⑥：`dispatchAction` 的 `unarmed` 支（纯函数）＋ **无 item**', () => {
		const d = R().Battle.dispatchAction('unarmed', 'use', null);
		assert.eq(d.type, 'unarmed', '★`chosen==="unarmed"` ⇒ `type:"unarmed"`（✗ 落进 `use` 支 ⇒ item 为 null 会崩）');
		assert.eq(d.item, undefined, '★无 item（空手不占背包槽）');
	});

	test('★#1854 ⑦【三包同形】三包 `Player` 皆声明 `unarmed`，且伤害骰／非致命一致', () => {
		/* ★「同形」是**契约面**：core 只认 `actor.unarmed.{text,strike}` ⇒ 三包缺一即「部分包不可用」。 */
		for (const [name, P] of [['dnd3', setup.DND3.Player], ['dnd-5e', setup.DND5E.Player], ['d20m', setup.D20M.Player]]) {
			const un = P?.unarmed;
			assert.ok(un && typeof un.strike === 'function', `★${name} 未声明 \`unarmed.strike\``);
			assert.eq(un.item?.stats?.dmg, '1d3', '★'+name+' 空手伤害须为 **1d3**（pin :341）');
			assert.eq(un.item?.stats?.nonlethal, true, '★'+name+' 空手须标**非致命**（pin :335）');
			assert.eq(un.item?.equipped, true, `★${name} 空手须 \`equipped: true\`（跳过「拔出／腾不出手」分支）`);
		}
	});

	test('★#1854 ⑧【三包端到端】三包各打一场真战 ⇒ 皆能空手打晕（✗ 只静态声明＝「声明的面 ≠ 实际的面」）', async () => {
		/* ★动因（本仓已知缺陷族）：「声明了 unarmed」✗ 等于「真能打晕」—— 三包攻击函数各自不同
		 *   （`DND3.meleeAttack`／`DND5E.attack`／`D20M.attack`），伤害施加点也各有一处 ⇒ **必须逐包真跑**。 */
		for (const [name, D] of [['dnd3', setup.DND3], ['dnd-5e', setup.DND5E], ['d20m', setup.D20M]]) {
			State.variables = { inventory: [], player: {
				name: '甲', hp: 20, maxHp: 20, stats: D.stats ? D.stats() : {}, effects: [] } };
			R().give('rock');
			const foe = new (R().Character)({ name: '獾', hp: 6, maxHp: 6, items: [{ id: 'coin' }],
				stats: D.stats ? D.stats({ ac: 3 }) : {} });
			const b = new (R().Battle)(8, [D.Player], [foe], true);
			b.perform = () => {};
			assert.ok(b.buildPlayerOptions(D.Player).itemOptions.some((x) => x.value === 'unarmed'),
				`★${name} 选单须出现空手项`);
			const P = D.Player;
			const saved = { items: P.items, choice: P.choice };
			P.items = State.variables.inventory;
			const seq = Array.from({ length: 8 }).flatMap(() => ['unarmed', '獾']);
			P.choice = async () => (seq.length ? seq.shift() : 'skip');
			R().rng.setSequence(Array.from({ length: 200 }, () => 0.99));
			try { await b.execute(); } finally { P.items = saved.items; P.choice = saved.choice; R().rng.reset(); }
			assert.ok(R().isKnockedOut(foe), `★${name} 空手须真能打晕（hp=${foe.hp} nonlethal=${foe.nonlethal}）`);
			assert.eq(foe.contains(R().death), false, `★${name} 非致命 ✗ 致死`);
			assert.eq(State.variables.inventory.length, 1, `★${name} 打晕 ✗ 掉落`);
		}
	});

	test('★#1854 ⑨【存档往返】非致命状态**随档来回**（carter 裁 (甲)：它是**伤势态**，与 `hp` 同类）', async () => {
		/* ★动因（guest-1 裁 ②）：非致命＝**伤态**（✗ 瞬时态）⇒ 必须与 `hp` 同等待遇地进档。
		 *   核验点：**经真实存档往返后**，昏迷仍成立（✗ 刷新页面就醒来）。
		 *   ⚠ `nonlethal` 落在角色字段上 ⇒ 随既有 **`player`／`actors`** 域进档（DOMAINS **无需新键**，
		 *     故本票 ✗ 改 `80-save.js` 的域表 —— 本席核过 `audit()` 输出无新项）。 */
		const H = () => globalThis.__host;
		R().give('rock');
		const foe = new (R().Character)({ name: '獾', hp: 3, maxHp: 3,
			items: [{ id: 'coin' }], stats: D().stats({ ac: 3 }) });
		const b = new (R().Battle)(8, [D().Player], [foe], true);
		b.perform = () => {};
		const P = setup.DND3.Player;
		const saved = { items: P.items, choice: P.choice };
		if (!Array.isArray(State.variables.inventory)) State.variables.inventory = [];
		P.items = State.variables.inventory;
		const seq = Array.from({ length: 8 }).flatMap(() => ['unarmed', '獾']);
		P.choice = async () => (seq.length ? seq.shift() : 'skip');
		R().rng.setSequence(Array.from({ length: 200 }, () => 0.99));
		let before;
		try {
			await b.execute();
			assert.ok(R().isKnockedOut(foe), '前置：本场须真打晕（否则本格测不到往返）');
			before = foe.nonlethal;
		} finally { P.items = saved.items; P.choice = saved.choice; R().rng.reset(); }
		/* ★把**敌**也放进场景（`actors` 域）—— 非致命必须随它一起回来。
		 *   ⚠ 本席实测该域的契约：存的是**快照**（`toJSON()`），读回后须 `Character.revive()` 还原实例
		 *     （✗ 直接塞活实例 —— 那样测的是「JS 对象引用还在」，✗ 存档面）。 */
		State.variables.actors = { 獾: foe.toJSON() };
		const o = H().save.make();
		H().save.load(o);
		const raw = State.variables.actors?.獾;
		assert.ok(raw && typeof raw === 'object', '★`actors` 域须随档带回来');
		const back = R().Character.revive(raw);
		assert.eq(back?.nonlethal, before, `★非致命计数须随档回来（前 ${before} / 后 ${back?.nonlethal}）`);
		assert.ok(R().isKnockedOut(back), '★往返后仍**昏迷**（✗ 刷新即醒 —— 那等于瞬时态）');
		assert.eq(back?.contains(R().death), false, '★往返后亦 ✗ `death`');
	});
})();