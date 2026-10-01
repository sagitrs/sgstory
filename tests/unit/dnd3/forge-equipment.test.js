/* dnd3 二段锻造与装备扩展的单元测试（#1779）
 *
 * 面：① 盾位（3E 真值 ＋ AC 端到端）② 槽位扩（肩/腰/背心，**零引擎改**声明）
 *     ③ 骑乘最小形（`slot:'mount'`）④ 铁器谱系与锻造配方（共用 `#1776` 的 `consumeRecipe`）
 * 数值：二段**禁 house rule 混入**（`#1730` 裁定⑤）⇒ 武器/盾/甲的数值**逐值引 3E SRD**；
 *   唯**配方本身**无源（3E 的 Craft 是检定制，无固定配方表）⇒ 那部分标 `house rule（非 SRD）`。
 *
 * ⚠ 本文件是 **LF**（与同目录 `resources.test.js`／`span1.test.js` 一致）。
 */
(() => {
	const R = () => setup.RPG;
	const D3 = () => setup.DND3;
	const inv = () => State.variables.inventory;
	/** 总件数（跨槽求和）：`give(id,n)` 首次发放逐件建槽 ⇒ 断言一律用总量 */
	const total = (id) => inv().filter((s) => s.id === id).reduce((a, s) => a + (s.charges ?? 1), 0);
	/** 清空背包并**重建玩家背包桥接**（`__resetState` 整体替换 `State.variables`） */
	const clean = () => {
		State.variables = { inventory: [] };
		for (const c of R().characters.values()) {
			if (Array.isArray(c.items) && (c.properties ?? []).includes('player')) c.items = State.variables.inventory;
		}
	};
	/** 造一个可测 AC 的纯对象角色（DND3.acOf 只读 `stats.ac` ＋ 已装备项的 `stats.ac_bonus`） */
	const dummy = (ac = 10) => ({ name: '甲', hp: 20, maxHp: 20, stats: { ac }, items: [] });

	/* ---------- ① 盾位：3E 真值 ＋ AC 消费点 ---------- */

	test('盾：六件盾的数值**逐值等于 3E 表**（`equipment-3e.md:2128-2144`）', () => {
		clean();
		/* 表列：Cost ｜ Armor/Shield Bonus ｜ MaxDex ｜ ACP ｜ ASF ｜ … ｜ Weight */
		const expect = {
			buckler: { ac: 1, acp: -1, weight: 5, cost: 15, asf: 5 },
			'light-wooden-shield': { ac: 1, acp: -1, weight: 5, cost: 3, asf: 5 },
			'light-steel-shield': { ac: 1, acp: -1, weight: 6, cost: 9, asf: 5 },
			'heavy-wooden-shield': { ac: 2, acp: -2, weight: 10, cost: 7, asf: 15 },
			'heavy-steel-shield': { ac: 2, acp: -2, weight: 15, cost: 20, asf: 15 },
			'tower-shield': { ac: 4, acp: -10, weight: 45, cost: 30, asf: 50 },
		};
		for (const [id, e] of Object.entries(expect)) {
			const st = R().createItem(id).stats;
			assert.eq(st.ac_bonus, e.ac, `${id} AC 加值 = 表中 Armor/Shield Bonus 列`);
			assert.eq(st.acp, e.acp, `${id} 护甲检定减值 = 表中 Armor Check Penalty 列`);
			assert.eq(st.weight, e.weight, `${id} 重量 = 表中 Weight 列`);
			assert.eq(st.cost, e.cost, `${id} 价格 = 表中 Cost 列`);
			assert.eq(st.asf, e.asf, `${id} 奥术失败率 = 表中 Arcane Spell Failure 列`);
		}
	});

	test('盾：装备后 **AC 端到端生效**（走既有消费点 `DND3.acOf`，零引擎改）', () => {
		clean();
		const c = dummy(10);
		assert.eq(D3().acOf(c), 10, '前置：无盾时 AC = 基础值');
		c.items.push({ id: 'heavy-steel-shield', equipped: false });
		assert.eq(D3().acOf(c), 10, '未装备 ⇒ 不加值（装备态是唯一开关）');
		c.items[0].equipped = true;
		assert.eq(D3().acOf(c), 12, '★ 装备重钢盾 ⇒ AC +2（表中 +2 逐值生效）');
		c.items.push({ id: 'buckler', equipped: true });
		assert.eq(D3().acOf(c), 13, '再加小圆盾 +1 ⇒ 13（多件可叠；「一次一盾」由**同槽互斥**保证，见下）');
	});

	test('盾：**一次一盾** 由同槽互斥保证（✗ 不需新规则）', () => {
		clean();
		R().give('buckler'); R().give('heavy-steel-shield');
		R().equip('buckler');
		assert.ok(R().isEquipped('buckler'), '先装小圆盾');
		R().equip('heavy-steel-shield');   // 同 `shield` 槽 ⇒ 应被拒
		assert.ok(R().isEquipped('buckler'), '小圆盾仍在（新盾未装上）');
		assert.eq(R().isEquipped('heavy-steel-shield'), false, '重钢盾未装备 ⇒ 槽互斥生效');
	});

	test('盾：全部六件共用 `shield` 槽（表里五件＋塔盾；一次一盾的前提）', () => {
		clean();
		for (const id of ['buckler', 'light-wooden-shield', 'light-steel-shield',
			'heavy-wooden-shield', 'heavy-steel-shield', 'tower-shield']) {
			assert.eq(R().createItem(id).slot, 'shield', `${id} 占盾槽`);
		}
	});

	test('盾：塔盾的**脚注 3**（可改作掩体）已**留痕**（消费点后接，✗ 未实现）', () => {
		const st = R().createItem('tower-shield').stats;
		assert.eq(st.coverOption, true, 'coverOption 留痕（`equipment.md:2178-2183` 脚注 3）');
		assert.eq(st.maxDex, 2, '表中 Maximum Dex Bonus 列亦留痕');
	});

	test('盾：不能当消耗品 `use`（防误用 ⇒ 抛错）', () => {
		clean();
		R().give('buckler');
		let threw = null;
		try { R().useItem('buckler'); } catch (e) { threw = e.message; }
		assert.ok(/防具/.test(threw ?? ''), `误 use 须抛可读错误（实得：${threw}）`);
	});

	/* ---------- ② 槽位扩：零引擎改 ---------- */

	test('槽位扩：肩/腰/背心三槽**互不冲突**且与既有槽共存（零引擎改的直接证据）', () => {
		clean();
		R().give('padded-shoulders'); R().give('leather-belt'); R().give('studded-vest');
		R().give('tunic'); R().give('boots'); R().give('club');
		R().equip('padded-shoulders');
		R().equip('leather-belt');
		R().equip('studded-vest');
		R().equip('tunic');     // body 槽（既有）
		R().equip('boots');     // feet 槽（既有）
		R().equip('club');      // weapon 槽（既有）
		for (const id of ['padded-shoulders', 'leather-belt', 'studded-vest', 'tunic', 'boots', 'club']) {
			assert.ok(R().isEquipped(id), `${id} 已装备（六槽并存 ⇒ 新槽未与旧槽冲突）`);
		}
	});

	test('槽位扩：新槽数值**逐值等于 3E 表**（Padded/Leather/Studded leather）', () => {
		/* ⚠ `assert.eq` 是**值比较**（不比数组内容）⇒ 逐项断言（本席首版用数组比较，得到
		 *   「[1,8,…] !== [1,8,…]」的假红 —— 记一笔）。 */
		const chk = (id, e, src) => {
			const st = R().createItem(id).stats;
			assert.eq(st.ac_bonus, e[0], `${id} AC 加值（${src}）`);
			assert.eq(st.maxDex, e[1], `${id} 最大敏（${src}）`);
			assert.eq(st.acp, e[2], `${id} 护甲检定减值（${src}）`);
			assert.eq(st.asf, e[3], `${id} 奥术失败率（${src}）`);
			assert.eq(st.weight, e[4], `${id} 重量（${src}）`);
			assert.eq(st.cost, e[5], `${id} 价格（${src}）`);
		};
		chk('padded-shoulders', [1, 8, 0, 5, 10, 5], '`equipment-3e.md:2095` Padded');
		chk('leather-belt', [2, 6, 0, 10, 15, 10], '`:2097` Leather');
		chk('studded-vest', [3, 5, -1, 15, 20, 25], '`:2099-2100` Studded leather');
	});

	test('槽位扩：新槽同时进 AC（`acOf` 只看「已装备」＋`ac_bonus`，与槽名无关）', () => {
		clean();
		const c = dummy(10);
		c.items.push({ id: 'studded-vest', equipped: true });
		assert.eq(D3().acOf(c), 13, '背心 +3 生效（★ 零引擎改：core 不认识 `vest` 这个槽名）');
	});

	/* ---------- ③ 骑乘最小形 ---------- */

	test("骑乘：`slot:\'mount\'` 且互斥（一次一头）；不落骑乘战斗规则", () => {
		clean();
		for (const id of ['light-horse', 'heavy-horse', 'pony', 'mule']) {
			assert.eq(R().createItem(id).slot, 'mount', `${id} 占坐骑槽`);
		}
		R().give('pony'); R().give('light-horse');
		R().equip('pony');
		R().equip('light-horse');
		assert.ok(R().isEquipped('pony'), '矮种马仍在（同槽互斥 ⇒ 一次一头）');
		assert.eq(R().isEquipped('light-horse'), false, '轻型马未换上');
	});

	test('骑乘：价格**逐值等于 3E Mounts 表**（`equipment-3e.md:2758-2792`）', () => {
		assert.eq(R().createItem('mule').stats.cost, 8, '`:2758` Donkey or mule — 8 gp');
		assert.eq(R().createItem('light-horse').stats.cost, 75, '`:2769-2772` Horse, light — 75 gp');
		assert.eq(R().createItem('heavy-horse').stats.cost, 200, '`:2764-2767` Horse, heavy — 200 gp');
		assert.eq(R().createItem('pony').stats.cost, 30, '`:2774-2777` Pony — 30 gp');
	});

	test("骑乘：**不臆造**源表没有的列（Weight 为 `---` ⇒ null；✗ 无 carry/speed）", () => {
		const st = R().createItem('light-horse').stats;
		assert.eq(st.weight, null, '表中 Weight 列为 `---` ⇒ 照录 null');
		assert.eq('carry' in st, false, '✗ 无 carry（3E Mounts 表**只有** Item/Cost/Weight 三列）');
		assert.eq('speed' in st, false, '✗ 无 speed（速度属怪物数据，且裁定④不做乘骑战斗）');
	});

	/* ---------- ④ 铁器谱系：数值逐值引源 ---------- */

	test('铁器：五件武器数值**逐值等于 3E 武器表**', () => {
		const expect = {
			'iron-longsword': ['1d8', 2, 19, 4, 15, 'slashing'],   // `:765`  15 gp｜1d6/1d8｜19-20/×2｜4 lb.
			'iron-battleaxe': ['1d8', 3, 20, 6, 10, 'slashing'],   // `:744`  10 gp｜1d6/1d8｜×3｜6 lb.
			'iron-warhammer': ['1d8', 3, 20, 5, 12, 'bludgeoning'], // `:846`  12 gp｜1d6/1d8｜×3｜5 lb.
			'iron-greataxe': ['1d12', 3, 20, 12, 20, 'slashing'],  // `:885`  20 gp｜1d10/1d12｜×3｜12 lb.
			'iron-greatsword': ['2d6', 2, 19, 8, 50, 'slashing'],  // `:919`  50 gp｜1d10/2d6｜19-20/×2｜8 lb.
		};
		for (const [id, e] of Object.entries(expect)) {
			const st = R().createItem(id).stats;
			assert.eq(st.dmg, e[0], `${id} 伤害骰`);
			assert.eq(st.crit, e[1], `${id} 重击倍率`);
			assert.eq(st.critMin ?? 20, e[2], `${id} 重击威胁下限（19 ⇒ 19-20）`);
			assert.eq(st.weight, e[3], `${id} 重量`);
			assert.eq(st.cost, e[4], `${id} 价格`);
			assert.eq(st.type, e[5], `${id} 伤害类型`);
		}
	});

	test('谱系：铁头长矛与一段木矛**同值**（谱系是命名与配方的事，✗ 不是数值的事）', () => {
		const iron = R().createItem('iron-spear').stats;
		const wood = R().createItem('wood-spear').stats;
		assert.eq(iron.dmg, wood.dmg, '伤害骰同（3E `Spear`，`:501`）');
		assert.eq(iron.crit, wood.crit, '重击倍率同');
		assert.eq(iron.weight, wood.weight, '重量同');
		assert.eq(iron.type, wood.type, '伤害类型同');
	});

	test('谱系：`RPG.weaponMaterial` 缺 `material` ⇒ 视作木（一段既有件不改）', () => {
		assert.eq(R().weaponMaterial(R().createItem('iron-longsword')), 'iron', '铁器标 iron');
		assert.eq(R().weaponMaterial(R().createItem('wood-spear')), 'wood', '★ 木矛未设 material ⇒ 默认 wood');
		assert.eq(R().weaponMaterial(null), 'wood', '空值亦回落 wood（✗ 不抛错）');
	});

	/* ---------- ⑤ 锻造：配方闭环 ＋ 共用消耗面 ---------- */

	test('锻造：铁矿＋木材 ⇒ 长剑（走 `#1776` 的 `consumeRecipe`，产出回背包）', () => {
		clean();
		R().give('iron-ore', 2); R().give('wood', 1); R().give('forge-longsword');
		const r = R().act(R().playerActor(), 'forge-longsword', R().playerActor(), 'craft');
		assert.eq(r?.status, 'applied', '合成成功');
		assert.eq(R().has('iron-ore'), false, '铁矿耗尽（输入被消耗）');
		assert.eq(R().has('wood'), false, '木材耗尽');
		assert.eq(total('iron-longsword'), 1, '★ 产出**回背包**（craft 的判据）');
	});

	test('锻造：材料不足 ⇒ **拒绝**且零变更（新契约 `rejected/action-refused`）', () => {
		clean();
		R().give('iron-ore', 1);      // 需要 2
		R().give('forge-longsword');
		const r = R().act(R().playerActor(), 'forge-longsword', R().playerActor(), 'craft');
		assert.eq(r?.status, 'rejected', '不足 ⇒ 拒绝（✗ 不报 applied）');
		assert.eq(r?.reason, 'action-refused', '理由可判');
		assert.eq(total('iron-ore'), 1, '铁矿未被半扣（原子性）');
		assert.eq(R().has('iron-longsword'), false, '无产出');
	});

	test('锻造：六张图纸的配方**耗量**与各自产物（house rule 登记在注释）', () => {
		const cases = [
			['forge-longsword', 'iron-longsword', 2, 1],
			['forge-battleaxe', 'iron-battleaxe', 2, 1],
			['forge-warhammer', 'iron-warhammer', 2, 1],
			['forge-greataxe', 'iron-greataxe', 3, 2],
			['forge-greatsword', 'iron-greatsword', 3, 2],
			['forge-iron-spear', 'iron-spear', 1, 1],
		];
		for (const [bp, out, ore, wood] of cases) {
			clean();
			const rec = R().createItem(bp).stats.recipe;
			assert.eq(rec.inputs.find((i) => i.id === 'iron-ore').n, ore, `${bp} 铁矿耗量`);
			assert.eq(rec.inputs.find((i) => i.id === 'wood').n, wood, `${bp} 木材耗量`);
			assert.eq(rec.yields[0].id, out, `${bp} 产出 ${out}`);
			/* 实跑一遍：输入给足 ⇒ 必得产物 */
			R().give('iron-ore', ore); R().give('wood', wood); R().give(bp);
			const r = R().act(R().playerActor(), bp, R().playerActor(), 'craft');
			assert.eq(r?.status, 'applied', `${bp} 应能合成`);
			assert.eq(total(out), 1, `${bp} 产出到手`);
		}
	});

	test('锻造：图纸**不因合成而消耗**（charges=null ⇒ 可反复用）', () => {
		clean();
		R().give('iron-ore', 4); R().give('wood', 2); R().give('forge-longsword');
		R().act(R().playerActor(), 'forge-longsword', R().playerActor(), 'craft');
		assert.eq(R().has('forge-longsword'), true, '图纸仍在');
		R().act(R().playerActor(), 'forge-longsword', R().playerActor(), 'craft');
		assert.eq(total('iron-longsword'), 2, '第二次仍能合成（图纸可反复用）');
	});

	test('锻造：铁矿不能直接 `use`（同资源纪律）', () => {
		clean();
		R().give('iron-ore');
		let threw = null;
		try { R().useItem('iron-ore'); } catch (e) { threw = e.message; }
		assert.ok(/建设物资/.test(threw ?? ''), `误 use 须抛可读错误（实得：${threw}）`);
	});

	/* ---------- ⑥ 闭环：采（一段）→ 锻（二段）→ 装 ---------- */

	test('闭环：采木材（一段）⇒ 锻铁头长矛（二段）⇒ 装备', () => {
		clean();
		R().rng.set(() => 0.1);
		R().give('dead-wood');                 // 一段采集点（charges=3）
		R().gather('dead-wood');               // ⇒ 木材 ×2
		assert.eq(total('wood'), 2, '一段采到木材');
		R().give('iron-ore', 1); R().give('forge-iron-spear');
		R().act(R().playerActor(), 'forge-iron-spear', R().playerActor(), 'craft');
		assert.eq(total('iron-spear'), 1, '二段锻出铁头长矛');
		R().equip('iron-spear');
		assert.ok(R().isEquipped('iron-spear'), '装上（跨段闭环走通）');
		assert.eq(R().weaponMaterial(State.variables.inventory.find((s) => s.id === 'iron-spear')), 'wood',
			'⚠ 快照上 `material` 不存活（`Item` 只搬白名单字段）—— 见下条');
	});

	test('★ 快照面（**既有设计**）：`toJSON` 只存 id/charges/equipped ⇒ `stats` 从**定义**重读', () => {
		/* 本条钉住 `#1779` 实测到的一条**引擎既有事实**（✗ 不是缺陷）：
		 *   `Item.toJSON()` = `{ id, charges, equipped }`（`10-item.js`）—— **不含 `stats`**；
		 *   还原（`reviveItem`）时按 `id` 从**注册的定义**重建实例 ⇒ `stats`（含 `material`）随之回来。
		 *   ⇒ 谱系谓词 `RPG.weaponMaterial` 对**还原后的实例**可用；对**裸快照**自然读不到
		 *     （快照本就没有 stats 面）。本席首版误以为「stats 整块进快照」，被本条实测纠正。 */
		clean();
		R().give('iron-longsword');
		const snap = State.variables.inventory.find((s) => s.id === 'iron-longsword');
		assert.eq(snap.stats, undefined, '★ 快照**只有** id/charges/equipped（既有设计，非本笔引入）');
		assert.eq(R().weaponMaterial(R().reviveItem(snap)), 'iron',
			'还原后从定义重读 ⇒ `material` 可用（谱系谓词的真实消费路径）');
	});

	/* ---------- ⑦ 两条「单 id 收敛」裁的守卫（2026-10-01） ---------- */

	test('收敛①：`iron-sword` 已撤（与 `iron-longsword` 同源同行 ⇒ 单 id）', () => {
		assert.eq(R().items.has('iron-longsword'), true, 'canonical 武器 id ＝ `iron-longsword`（在册）');
		assert.eq(R().items.has('iron-sword'), false, '★ `iron-sword` 已撤（双 id 收敛，✗ 不得复活）');
		assert.eq(R().createItem('iron-longsword').stats.dmg, '1d8',
			'值面由本件承载（原 `iron-sword` 的 `:765` 逐值已并入）');
	});

	test('收敛②：铁资源 canonical ＝ `iron-ore`（`iron-ingot` 已撤）', () => {
		assert.eq(R().items.has('iron-ore'), true, 'canonical 资源 id ＝ `iron-ore`（在册）');
		assert.eq(R().items.has('iron-ingot'), false, '★ `iron-ingot` 已撤（口径统一，✗ 不得复活）');
		assert.eq(R().createItem('iron-ore').stats.craftInput, true,
			'`iron-ore` 带 `craftInput` 标记 ⇒ 正是配方链的输入（canonical 的依据）');
	});
})();