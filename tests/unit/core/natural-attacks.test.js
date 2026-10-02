/* `#1855` 动物／虫类天然攻击件 —— 9 只从「全体永不攻击」到「真能咬人」
 *
 * 规则出处（pinned，**逐值照录**，见 `src/dnd/dnd3/items/natural-attacks.js` 档头含逐只反解）：
 *   ① `Monsters - Animals-3e.md`：Badger／Boar／Lizard, Monitor／Wolf／Bear, Brown
 *   ② `Monsters - Vermin-3e.md`：Giant Bee／Giant Bombardier Beetle／Giant Fire Beetle／Giant Stag Beetle
 *   ★**攻击加值取 `stats.atkBonus`**（照录 pinned，✗ 引擎推导）—— 理由：体型修正／武器娴熟／
 *     单一自然攻击 ×1.5 力调 **三机制本仓皆无**（`#1855` §二 裁定 甲，跟进票候本票合入后开）。
 *
 * 本档守的**行为契约**（✗ 不重测攻击数学 —— 那属各包 combat 的档）：
 *   ① 9 只 `items` 皆含 `equipped` 的天然武器 ⇒ 自动通路取得到（✗ 全体「干瞪眼」）
 *   ② 9 只的 pinned 值**逐值**（atkBonus ／ dmg）落进件里
 *   ③ 端到端：真打一场，**战报出现爪/咬**（✗ 只断言件存在 —— 「声明的面 ≠ 实际的面」）
 *   ④ 天然武器 `equipped: true` ⇒ 死亡**不掉落**（同 `goblin.js` 的 club）
 *   ⑤ 缺省 `atkBonus` ⇒ 逐字沿用原式（既有武器／玩家面**零回归**）
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	/** pinned 逐值表（Attack 行；本席逐只复现，✗ 转述票面）。 */
	const PINNED = [
		['badger', 'badger-claw', '1d2', 4, '獾'],
		['boar', 'boar-gore', '1d8', 4, '野猪'],
		['monitor-lizard', 'monitor-lizard-bite', '1d8', 5, '巨蜥'],
		['wolf', 'wolf-bite', '1d6', 3, '狼'],
		['brown-bear', 'brown-bear-claw', '1d8', 11, '棕熊'],
		['giant-bee', 'giant-bee-sting', '1d4', 2, '巨蜂'],
		['bombardier-beetle', 'bombardier-beetle-bite', '1d4', 2, '投弹甲虫'],
		['fire-beetle', 'fire-beetle-bite', '2d4', 1, '火甲虫'],
		['giant-stag-beetle', 'giant-stag-beetle-bite', '4d6', 10, '巨鹿甲虫'],
	];

	test('★#1855 ①：9 只皆**持有**已装备的天然武器（✗ 只带 coin ⇒ 干瞪眼）', () => {
		for (const [monster, weaponId, , , ] of PINNED) {
			const c = R().characters.get(monster);
			assert.ok(c, `未找到怪物注册：${monster}`);
			const w = c.items.find((s) => s.id === weaponId);
			assert.ok(w, `★${monster} 的 items 缺天然武器「${weaponId}」：${JSON.stringify(c.items)}`);
			assert.eq(w.equipped, true, `★${monster} 的天然武器须 equipped（否则自动通路取不到）`);
			/* 自动通路的取件式（`40-battle.js`：`attacker.contains(['weapon','equipped'])`）—— 直证 */
			const got = c.contains(['weapon', 'equipped']);
			assert.ok(got, `★${monster} 自动通路取不到武器 ⇒ 仍会「干瞪眼」`);
		}
	});

	test('★#1855 ②：9 只的 pinned 值**逐值**（atkBonus／dmg 照录，✗ 引擎推导）', () => {
		for (const [, weaponId, dmg, atkBonus, cn] of PINNED) {
			const def = R().items.get(weaponId);
			assert.ok(def, `未注册件：${weaponId}`);
			const it = new def();
			assert.eq(it.stats.dmg, dmg, `★${cn} 伤害骰`);
			assert.eq(it.stats.atkBonus, atkBonus, `★${cn} 攻击加值（照录 pinned）`);
			assert.eq(it.stats.natural, true, `★${cn} 须标 natural`);
		}
	});

	test('★#1855 ③【端到端】獾真能咬到人 —— 战报出现爪伤（✗ 只断言件存在）', async () => {
		/* ★走**真通路**：`Battle` 自动支（怪物非玩家控制）⇒ `BattleTurn.execute()` ⇒ 件 `used()` ⇒ `meleeAttack`。
		 *   ⚠ 必须真跑，因为「件在 items 里」≠「自动通路能打出去」（取件式／装备态／掷骰门槛各是一关）。 */
		/* ★读**产物**而非钩子：道具的 `perform` 经 `Object.prototype.perform`（`01-perform.js`）——
		 *   它**恒进通知缓冲**（`RPG.notices`，可回看）⇒ 这里读真实输出通道（✗ 不劫持 `battle.perform`：
		 *   那只能看到**战斗类**自己 `this.perform` 的行，**看不见道具内部**的输出 ⇒ 会误判「没打出去」）。 */
		const badger = R().characters.get('badger');
		badger.hp = badger.maxHp;
		const victim = new (R().Character)({ name: '靶', hp: 200, maxHp: 200, stats: D().stats({ ac: 1 }) });
		/* ⚠ `RPG.notices()` 是**只读取数器**且**新→旧**（✗ 数组、不可清空）⇒ 直接读**唯一存放处**
		 *   `State.variables.rpgNotices`（模块内 `notices()` 的落点，按 `at` **递增**）⇒ 可切段。 */
		const buf = () => State.variables.rpgNotices;
		const b = new (R().Battle)(3, [victim], [badger], true);
		victim.choice = async () => '獾';
		/* 掷骰拉满 ⇒ 必命中（确定性，✗ 概率格） */
		R().rng.setSequence(Array.from({ length: 200 }, () => 0.99));
		State.variables.rpgNotices = [];                 // 清落点 ⇒ 本场输出可辨识（唯一存放处）
		const hpBefore = victim.hp;
		try { await b.execute(); } finally { R().rng.reset(); }
		const all = buf().map((n) => n.text).join('\n');
		assert.ok(victim.hp < hpBefore, `★靶须**真掉血**（hp ${hpBefore} ⇒ ${victim.hp}）—— 「件在 items 里」≠「打得出去」`);
		/* ★本席实测该实现**不**在伤害行里写件名（`meleeAttack` 用的是 `item.stats.type`）——
		 *   件名只出现在**挥空**行（`${item.name}挥空了`）。⇒ 断言用**实现真有**的形，✗ 用我以为的形。
		 *   「真打出去」的**硬**证据是**副作用**（靶掉血）＋伤害行的**伤害类型**（`slashing` = 本件的 type）。 */
		assert.ok(/靶受到了\d+点slashing伤害/.test(all),
			`★伤害行须带本件的伤害类型（证明是**这件**打的）：${all.slice(0, 300)}`);
	});

	test('★#1855 ④：天然武器 `equipped` ⇒ 死亡**不掉落**（同 goblin 的 club）', () => {
		const lines = [];
		const wolf = R().characters.get('wolf');
		wolf.hp = 0;                                    // 直接置倒
		const inv = State.variables.inventory = [];
		R().loot(wolf);
		assert.eq(inv.some((s) => s.id === 'wolf-bite'), false, '★天然武器不落到玩家背包（e.g. 拾尸捡爪子）');
		assert.eq(inv.some((s) => s.id === 'coin'), true, '★战利品 coin 仍掉落（未装备件）');
	});

	test('★#1855 ⑤：缺省 `atkBonus` ⇒ 逐字沿用原式（既有面零回归）', () => {
		/* 用 `club`（无 atkBonus）造对照：攻击加值须仍为 `bab + 力调`（✗ 被新分支改动）。 */
		const a = new (R().Character)({ name: '甲', hp: 10, stats: D().stats({ str: 14, bab: 3 }) });
		const t = new (R().Character)({ name: '靶', hp: 10, stats: D().stats({ ac: 99 }) });
		const msgs = [];
		const club = new (D().Club)();
		club.equipped = true;
		club.perform = (m) => msgs.push(String(m));
		R().rng.setSequence([0.0, 0.0]);                // die=1 ⇒ 必挥空 ⇒ 文案带加值
		try { D().meleeAttack(club, t, a); } finally { R().rng.reset(); }
		const m = msgs.find((x) => /挥空/.test(x)) ?? '';
		assert.ok(/攻击掷骰 1\+5/.test(m), `★缺省须走 \`bab 3 + 力调 2 = +5\`（原式）：${m}`);
	});

	test('★#1855 ⑥【消费半的刀】`atkBonus` **真的被用上**（撤消费点 ⇒ 本格必红）', () => {
		/* ★立档理由（`tester-3` 的 T 席阻断）：②③⑤ 三格分别只钉**数据形状**／靶 AC（不判别）／
		 *   **club 缺省半** ⇒ 把 `combat.js` 的消费点**整条退回** `bab + abilMod` 时，
		 *   9 只里 5 只的攻击加值会偏，而**单测仍全绿**（本席实测：576/0）—— 甲案只落了「声明半」。
		 *   ⇒ 本格补**消费半**：同一次挥空文案里，照录值（+4）与推导值（−1）**可分辨**。
		 *   ★取法与 ⑤ 同（`die=1` ⇒ 必挥空 ⇒ 文案带攻击加值），✗ 另造一条通路。 */
		const a = new (R().Character)({ name: '獾', hp: 6, stats: D().stats({ str: 8, bab: 0 }) });
		const t = new (R().Character)({ name: '靶', hp: 40, maxHp: 40, stats: D().stats({ ac: 99 }) });
		const probe = (idOrItem) => {
			const it = typeof idOrItem === 'string' ? new (R().items.get(idOrItem))() : idOrItem;
			it.equipped = true;
			const msgs = [];
			it.perform = (m) => msgs.push(String(m));
			R().rng.setSequence([0.0, 0.0]);            // die=1 ⇒ 必然挥空（文案带加值）
			try { D().meleeAttack(it, t, a); } finally { R().rng.reset(); }
			return (msgs.find((x) => /挥空/.test(x)) ?? '').match(/攻击掷骰 1([+-]\d+)/)?.[1] ?? null;
		};
		/* 照录臂：獾爪的 pinned 值 +4（而 `bab 0 + 力调 −1` 只能给 −1） */
		const claw = probe('badger-claw');
		assert.eq(claw, '+4',
			`★ atkBonus 须真的**被用上**（照录 +4）；若得 −1 则是消费点被绕过、退回推导：${claw}`);
		/* 对照臂：同一角色用 club（无 `atkBonus`）⇒ 必须**走原式** −1（✗ 别把推导也改成照录） */
		const club = probe('club');
		assert.eq(club, '-1',
			`★缺省件须仍走推导（bab 0 + 力调 −1）：${club}`);
	});
})();
