/* 跨域多步链（`#1806` 笔 3）—— 场景框架的**增量**所在
 *
 * ## 与既有单测的分工（本档的立档理由）
 *   既有单测守「**单档单步**」（一格铺状态、推一步、断言）。本档守「**跨域多步链**」：
 *   一条链跨 ≥3 个域、且中间经**存档往返**或**战斗**。票面点名的四项已有单测覆盖
 *   （见每条链的「既有覆盖」注），故本档**不重复**，只补它们**测不到的组合**。
 */
(() => {
	const R = () => setup.RPG;
	const SC = () => globalThis.__scenario;
	const H = () => globalThis.__host;
	const D3 = () => setup.DND3;

	/** 存档往返（走宿主真实存取流程：onSave → 序列化 → 反序列化 → onLoad → 还原） */
	const rt = () => { const o = H().save.make(); H().save.load(o); return o; };

	/** 铺一个**完整的玩家状态**（照故事侧 `init.twee` 的契约：`$player` 必须给全，含 `effects: []`）。
	 *  ★这正是场景框架该固化的事：**前置状态必须合法**，否则测的是「你没铺好」而非被测行为。
	 *  ⚠（`#1825` RC · `dev-10`）：本注释首版称「缺 `effects` 会在效果面深处抛错」—— 该**归因当时成立、
	 *  现已失效**：`#1821` 乙′ 给 `Player.effects` 加了读面兜底（`?? []`）⇒ 缺它**不再抛**
	 *  （本席双探针实证：`$player` 无 `effects` 时 `contains()` 不抛）。
	 *  ⇒ 此处保留 `effects: []` 的理由**不再是规避抛错**，而是**遵守故事侧契约**（`init.twee` 明写）
	 *  　—— 场景框架要固化「前置状态合法」，✗ 依赖引擎兜底把状态铺成「看似合法」。 */
	const mkInv = (...snaps) => {
		State.variables.player = {
			name: '旅行者', hp: 20, maxHp: 20, stats: {}, effects: [], effectTurns: {},
		};
		State.variables.inventory = [];
		for (const s of snaps) State.variables.inventory.push(s);
		return R().playerActor();
	};
	const probes = [];
	const probe = (def) => { probes.push(def.id); return R().defItem(def); };
	const clean = () => { for (const id of probes.splice(0)) R().items.delete(id); };

	/* ================= 链①：创伤 → 存档往返 → 战斗 → 战斗后仍在 =================
	 * 既有覆盖：P4/P5 到「往返＋罚仍生效」为止（**没进战斗**）；C4 单测覆盖「战斗开始 −1 HP」。
	 * 本链补的增量：**往返之后**「战斗接线是否仍然活着」—— id 存活 ≠ 接线存活。 */

	test('链①：创伤 → 存档 → 读档 → **进战斗**（战斗接线仍活）→ 战斗后仍在', async () => {
		const p = mkInv();
		D3().applyTrauma(p, 'bleeding');
		assert.ok(p.contains('bleeding'), '前置：持有失血');

		rt();                                            // ★ 中间经存档往返

		const p2 = R().playerActor();
		assert.ok(p2.contains('bleeding'), '往返后 id 存活');

		/* ★增量：来回档后**进战斗** —— 失血在 `battle:turnStart` 的接线仍在（✗ 只是 id 还在） */
		/* ★用 `revive` 构造：它是**读档侧的推荐构形**（`Character.revive` 内部即 `new Character`
		 *   ＋快照还原），与本链「存档往返后进战斗」的语境一致。
		 *   ⚠（`#1825` RC · `dev-10`）：本注释首版称「裸 `new Character` **不初始化 `effects`**
		 *   ⇒ 裸构造的角色一经 `contains()` 即抛 `TypeError`」——**该归因是假的，且从未真过**：
		 *   `effects` 由**构造器**初始化为 `[]`（`src/core/20-character.js:28`，自初版 `c5cfcf28` 即然）
		 *   ⇒ 裸构造 `contains()` **不抛**（本席探针实证：`effects = []`、未抛）。
		 *   ⇒ 归因**已删**（改用 `revive` 的理由改述为上面的构形一致性，✗ 非规避）。 */
		const foe = R().Character.revive({ name: '靶', hp: 50, maxHp: 50 });
		const hpBefore = p2.hp;
		const b = new (R().Battle)(1, [p2], [foe], false);
		b.perform = () => {};
		await b.execute();
		assert.ok(p2.hp < hpBefore, `往返后战斗仍扣血（${hpBefore} → ${p2.hp}）—— 接线存活`);

		/* ★增量之二：战斗结束（battle:end）后 **persistent 仍在**（跨场语义） */
		assert.ok(p2.contains('bleeding'), '★战斗后创伤仍在（persistent 的语义）');
		clean();
	});

	/* ================= 链②：死亡 → 回溯（掉落＋清档）→ 存档往返 → 仍是清的 =================
	 * 既有覆盖：respawn 单测覆盖「掉落／清档／搬位置」；P6 覆盖「respawn ⇒ 创伤全清」。
	 * 本链补的增量：**回溯之后再往返一次档** —— 清掉的效果不得「复活」（旧档镜像／桥接残留）。 */

	test('链②：创伤 → 死亡 → 回溯清档 → 存档往返 → **仍是清的**（✗ 复活）', () => {
		const p = mkInv({ id: 'sword', equipped: true, charges: null },
			{ id: 'coin', equipped: false, charges: null });
		D3().applyTrauma(p, 'laceration');
		p.gain(R().death);
		assert.ok(p.contains('laceration') && p.contains(R().death), '前置：带伤＋已死亡');

		const r = R().respawn(p, {});
		assert.ok(r.cleared > 0, `回溯清档生效（cleared=${r.cleared}）`);

		rt();                                        // ★增量：再往返一次

		const p2 = R().playerActor();
		assert.eq(p2.contains('laceration'), false, '★往返后创伤**仍是清的**（✗ 被旧镜像复活）');
		assert.eq(p2.contains(R().death), false, 'death 标记已清且不复活');
		assert.eq(p2.hp, p2.maxHp, 'HP 已复位（✗ 往返把它带回旧值）');
		clean();
	});

	/* ================= 链③：槽位互斥 ＋ 存档往返 ＋ 战斗后仍在 =================
	 * 既有覆盖：`slotEquip` 同槽互斥有单测（`slot-equip-refused.test.js`）；`#1788` 的盾/坐骑各一格。
	 * 本链补的增量：**异槽共存 ＋ 同槽互斥 ＋ 往返 ＋ 进战斗**四件事**连起来**（组合态）。 */

	test('链③：盾＋坐骑**异槽共存** → 同槽第二件**被拒** → 往返 → 战斗后仍在', async () => {
		probe({ id: 'ch-shield-1', name: '甲盾', charges: null, stackable: false, slot: 'shield',
			stats: { ac_bonus: 2 }, used() {}, actions: { equip: R().slotEquip, unequip: R().slotUnequip } });
		probe({ id: 'ch-shield-2', name: '乙盾', charges: null, stackable: false, slot: 'shield',
			stats: { ac_bonus: 1 }, used() {}, actions: { equip: R().slotEquip, unequip: R().slotUnequip } });
		probe({ id: 'ch-mount', name: '坐骑', charges: null, stackable: false, slot: 'mount',
			stats: {}, used() {}, actions: { equip: R().slotEquip, unequip: R().slotUnequip } });
		const p = mkInv(
			{ id: 'ch-shield-1', equipped: false, charges: null },
			{ id: 'ch-mount', equipped: false, charges: null },
			{ id: 'ch-shield-2', equipped: false, charges: null });

		assert.eq(SC().dispatch({ item: 'ch-shield-1', action: 'equip', target: p }).status, 'applied', '盾装上');
		assert.eq(SC().dispatch({ item: 'ch-mount', action: 'equip', target: p }).status, 'applied', '★异槽可共存');
		const denied = SC().dispatch({ item: 'ch-shield-2', action: 'equip', target: p });
		assert.eq(denied.status, 'rejected', '★同槽第二件被拒');
		/* ★「零副作用」要**限定面**：拒绝会往 `rpgNotices` 写一行可读提示（合法 —— 那是给玩家看的），
		 *   故不能拿整个存档面的 `delta` 当「零副作用」判据（本链首版即栽在此，框架把它照了出来）。
		 *   ⇒ 断言**背包面**未变：这才是「拒绝不得改状态」的准确主张。 */
		SC().assertSave({ inventory: [
			{ id: 'ch-shield-1', equipped: true }, { id: 'ch-mount', equipped: true },
			{ id: 'ch-shield-2', equipped: false }] });

		rt();                                        // ★增量：往返

		const p2 = R().playerActor();
		assert.eq(R().isEquipped('ch-shield-1'), true, '★往返后盾仍装备');
		assert.eq(R().isEquipped('ch-mount'), true, '★往返后坐骑仍装备');
		assert.eq(R().isEquipped('ch-shield-2'), false, '被拒的那件仍是未装备');

		/* ★增量之二：带着这身装备**进战斗**，装备态不被战斗路径改动 */
		const foe = R().Character.revive({ name: '靶', hp: 30, maxHp: 30 });
		const b = new (R().Battle)(1, [p2], [foe], false);
		b.perform = () => {};
		await b.execute();
		assert.eq(R().isEquipped('ch-shield-1'), true, '战斗后盾仍在');
		assert.eq(R().isEquipped('ch-mount'), true, '战斗后坐骑仍在');
		clean();
	});

	/* ================= 链④：回合经济（拒绝⇒不推进）＋ 护栏 ＋ 存档往返 =================
	 * 既有覆盖：`turn-economy.test.js` 覆盖隔离格／AI 同规／无武器分支／护栏 N=3／成功即清零。
	 * 本链补的增量：**护栏计数是 `Battle` 实例态（✗ 不随档）** —— 往返之后计数归零。
	 *   ⇒ 这不是缺陷，而是**必须显式钉住的语义**：它决定「跨场护栏」是否存在（当前：不存在）。 */

	test('链④：护栏计数**不随档**（实例态）—— 往返后新战斗从 0 起', async () => {
		/* 无武器 ⇒ `rejected/no-weapon`（`#1773` 判据 4 的分支）⇒ 每次登记一次无推进 */
		const p = mkInv();                            // ★背包为空 ⇒ 无武器可言
		const foe = R().Character.revive({ name: '靶', hp: 30, maxHp: 30 });
		const b1 = new (R().Battle)(5, [p], [foe], false);
		const logs = [];
		b1.perform = (m) => logs.push(m);
		await b1.execute();
		assert.ok(b1.rejectStreak > 0 || logs.some((l) => l.includes('护栏')),
			`前置：本场确有拒绝（streak=${b1.rejectStreak}／护栏日志=${logs.some((l) => l.includes('护栏'))}）`);

		rt();                                        // ★增量：往返

		/* 往返后**新建**一场：计数不得带着上一场的值——它是实例态（`State.variables` 之外） */
		const b2 = new (R().Battle)(1, [p], [foe], false);
		assert.eq(b2.rejectStreak, 0, '★新场计数从 0 起（护栏**不跨场**：实例态不随档）');
		/* 反向钉住：若有人把计数搬进 `State.variables`，本格会红 —— 那时须同步讨论「跨场护栏」的语义 */
		assert.eq('rejectStreak' in (State.variables ?? {}), false, '★计数**不在**存档面（该语义须显式，✗ 默会）');
		clean();
	});
})();
