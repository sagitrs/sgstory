/* dnd3/span1 的单元测试：巴别一段（#1748）—— 怪物/道具逐值对源 ＋ 遭遇表契约 ＋ 层元数据 ＋ 第 10 层整备区
 *
 * 断言锚真值纪律（#1750 根因①）：涉 SRD 行为的断言在断言处注明出处（对源锚，不锚实现）；
 * house rule 面的断言注明「house rule」。
 */
(() => {
	const D = () => setup.DND3;
	const R = () => setup.RPG;

	/* ---------- 怪物：逐值对源（源＝3.5 动物条目；每条的完整出处与行号写在各用例上方）---------- */

	/* 出处：SRD 3.5 · `Monsters/Monsters - Animals.md:113`（`## Badger` → Abilities：Str 8／Dex 17／Con 15／Int 2／Wis 12／Cha 6；HP 6；AC 15；CR 1/2） */
	test('dnd3：獾对齐 SRD 3.5 · Badger（Str 8（−1）、Dex 17（+3）、Con 15（+2）、Int 2、Wis 12、Cha 6）', () => {
		const s = D().Badger.stats;
		assert.eq(s.str, 8, 'Str 8');
		assert.eq(s.dex, 17, 'Dex 17');
		assert.eq(s.con, 15, 'Con 15');
		assert.eq(s.int, 2, 'Int 2');
		assert.eq(s.wis, 12, 'Wis 12');
		assert.eq(s.cha, 6, 'Cha 6');
		assert.eq(D().Badger.maxHp, 6, 'HP 6（Hit Dice 1d8+2）');
		assert.eq(s.ac, 15, 'AC 15');
	});

	/* 出处：SRD 3.5 · `Monsters/Monsters - Animals.md:2302`（`## Wolf` → Abilities：Str 13／Dex 15／Con 15／Int 2／Wis 12／Cha 6；HP 13；AC 14；CR 1） */
	test('dnd3：狼对齐 SRD 3.5 · Wolf（Str 13（+1）、Dex 15（+2）、Con 15（+2）、Int 2、Wis 12、Cha 6）', () => {
		const s = D().Wolf.stats;
		assert.eq(s.str, 13, 'Str 13');
		assert.eq(s.dex, 15, 'Dex 15');
		assert.eq(s.con, 15, 'Con 15');
		assert.eq(s.int, 2, 'Int 2');
		assert.eq(s.wis, 12, 'Wis 12');
		assert.eq(s.cha, 6, 'Cha 6');
		assert.eq(D().Wolf.maxHp, 13, 'HP 13（Hit Dice 2d8+4）');
		assert.eq(s.ac, 14, 'AC 14');
	});

	/* 出处：SRD 3.5 · `Monsters/Monsters - Animals.md:356`（`## Boar` → Abilities：Str 15／Dex 10／Con 17／Int 2／Wis 13／Cha 4；HP 25；AC 16；CR 2） */
	test('dnd3：野猪对齐 SRD 3.5 · Boar（Str 15（+2）、Dex 10（+0）、Con 17（+3）、Int 2、Wis 13、Cha 4）', () => {
		const s = D().Boar.stats;
		assert.eq(s.str, 15, 'Str 15');
		assert.eq(s.dex, 10, 'Dex 10');
		assert.eq(s.con, 17, 'Con 17');
		assert.eq(s.int, 2, 'Int 2');
		assert.eq(s.wis, 13, 'Wis 13');
		assert.eq(s.cha, 4, 'Cha 4');
		assert.eq(D().Boar.maxHp, 25, 'HP 25（Hit Dice 3d8+12）');
		assert.eq(s.ac, 16, 'AC 16');
	});

	/* 出处：SRD 3.5 · `Monsters/Monsters - Animals.md:1165`（`## Lizard, Monitor` → Abilities：Str 17／Dex 15／Con 17／Int 1／Wis 12／Cha 2；HP 22；AC 15；CR 2） */
	test('dnd3：巨蜥对齐 SRD 3.5 · Lizard, Monitor（Str 17（+3）、Dex 15（+2）、Con 17（+3）、Int 1、Wis 12、Cha 2）', () => {
		const s = D().MonitorLizard.stats;
		assert.eq(s.str, 17, 'Str 17');
		assert.eq(s.dex, 15, 'Dex 15');
		assert.eq(s.con, 17, 'Con 17');
		assert.eq(s.int, 1, 'Int 1');
		assert.eq(s.wis, 12, 'Wis 12');
		assert.eq(s.cha, 2, 'Cha 2');
		assert.eq(D().MonitorLizard.maxHp, 22, 'HP 22（Hit Dice 3d8+9）');
		assert.eq(s.ac, 15, 'AC 15');
	});

	/* 数值块对称性（同 characters.test.js 的既有一族）：新增四只与玩家同构 */
	test('dnd3：一段新怪与玩家数值块同构（字段集一致）', () => {
		const pk = Object.keys(D().Player.stats).sort().join(',');
		for (const m of [D().Badger, D().Wolf, D().Boar, D().MonitorLizard]) {
			assert.eq(Object.keys(m.stats).sort().join(','), pk, `${m.name} 与玩家同构`);
		}
	});

	/* ---------- 道具：逐值对源 ＋ house rule ---------- */

	/* 出处：SRD 3.5 · `Basic Rules and Legal/equipment.md:362-370`（`### Dagger`：2 gp／1d4／19–20 ×2／10 ft.／1 lb.／Piercing or Slashing） */
	test('dnd3：骨刺匕首对齐 SRD 3.5 · Dagger（dmg 1d4、critMin 19、range 10、cost 2、weight 1）', () => {
		const s = R().createItem('bone-dagger').stats;
		assert.eq(s.dmg, '1d4', '中型伤害 1d4');
		assert.eq(s.crit, 2, '重击倍率 ×2');
		assert.eq(s.critMin, 19, '重击威胁 19–20');
		assert.eq(s.range, 10, '射程增量 10 ft.');
		assert.eq(s.cost, 2, '价格 2 gp');
		assert.eq(s.weight, 1, '重量 1 lb.');
		assert.eq(s.type, 'piercing', 'Piercing or Slashing（取 piercing）');
	});

	/* 出处：SRD 3.5 · `Basic Rules and Legal/equipment.md:501-510`（`### Spear`：2 gp／1d8／×3／20 ft.／6 lb.／Piercing） */
	test('dnd3：木柄长矛对齐 SRD 3.5 · Spear（dmg 1d8、crit ×3、range 20、cost 2、weight 6）', () => {
		const s = R().createItem('wood-spear').stats;
		assert.eq(s.dmg, '1d8', '中型伤害 1d8');
		assert.eq(s.crit, 3, '重击倍率 ×3');
		assert.eq(s.range, 20, '射程增量 20 ft.');
		assert.eq(s.cost, 2, '价格 2 gp');
		assert.eq(s.weight, 6, '重量 6 lb.');
		assert.eq(s.type, 'piercing', 'Piercing');
	});

	/* house rule（非 SRD）：SRD 3.5 无「草药」条目（equipment.md:3220 只有 Healer's Kit 工具）
	 * ⇒ 数值为本仓自定，断言只锁「比绷带弱、可耗尽」的**设计意图**，不冒称源值。 */
	test('dnd3：草药糊是 house rule（治疗 2／2 充能，弱于绷带的 5／2）——可耗尽', () => {
		const s = R().createItem('herb-poultice').stats;
		assert.eq(s.hp, 2, 'house rule：单次治疗 2（< 绷带的 5）');
		const target = { name: '伤员', hp: 4, maxHp: 10, stats: {} };  // 非满血（满血时治疗会被 maxHp 夹住，测不出差异）
		R().give('herb-poultice');            // 经背包（扣充能走 30-inventory 的 use 通路）
		R().useItem('herb-poultice', target, null);
		assert.eq(target.hp, 6, '用后 +2');
		R().useItem('herb-poultice', target, null);
		assert.eq(target.hp, 8, '再 +2');
		assert.ok(!R().has('herb-poultice'), '充能耗尽 ⇒ 移出背包（与绷带同规则）');
		R().useItem('herb-poultice', target, null);
		assert.eq(target.hp, 8, '背包已无 ⇒ 不再治疗');
	});

	/* ---------- 层元数据（契约形 {id,type,start?}）---------- */

	test('dnd3：一段层元数据契约——L1 有 start、L1–L9 是 climb、L10 是 hub、无 exit', () => {
		const meta = D().LAYER_META_SPAN1;
		assert.eq(meta.length, 10, '一层段共 10 层');
		assert.eq(meta[0].id, 'L1');
		assert.eq(meta[0].start, true, 'L1 是一段起点');
		assert.eq(meta[0].type, 'climb');
		for (let i = 0; i < 9; i++) assert.eq(meta[i].type, 'climb', `${meta[i].id} 是 climb`);
		assert.eq(meta[9].id, 'L10');
		assert.eq(meta[9].type, 'hub', 'L10 是大空洞（hub）');
		assert.ok(meta.every((m) => m.type !== 'exit'), '一段无 exit（那是第 50 层）');
	});

	/* ---------- 遭遇表（契约：ref/loot 引注册 id、抽样形、第 10 层无条目）---------- */

	test('dnd3：遭遇表契约——引注册 id、带权重、无内嵌数值；L10 无条目（整备区非战斗）', () => {
		const table = D().ENCOUNTER_SPAN1;
		for (let i = 1; i <= 9; i++) {
			const row = table[`L${i}`];
			assert.ok(row, `L${i} 有遭遇行`);
			assert.ok(row.encounters.length >= 1, `L${i} 至少一个敌人组`);
			for (const e of row.encounters) {
				assert.ok(typeof e.weight === 'number' && e.weight > 0, `L${i} 权重为正数`);
				assert.ok(R().characters.has(e.ref), `L${i} 敌人「${e.ref}」已在角色注册表`);
				assert.eq(typeof e.ref, 'string', 'ref 是注册 id（非内嵌数值块）');
			}
			for (const l of row.loot) {
				assert.ok(R().items.has(l.id), `L${i} 掉落「${l.id}」已在道具注册表`);
				assert.ok(typeof l.weight === 'number' && l.weight > 0, `L${i} 掉落权重为正数`);
			}
		}
		assert.ok(!table.L10, 'L10 无遭遇条目（整备区，非战斗）');
	});

	/* 遭遇表 × 定标系数一致（house rule 自洽）：每层引用的敌人 CR ≤ 该层 crBand 上限 */
	test('dnd3：定标自洽——每层敌人 CR ≤ 该层 crBand 上限（house rule）', () => {
		const sc = D().SPAN1_SCALING;
		const crVal = (cr) => (typeof cr === 'number' ? cr : (cr === '1/2' ? 0.5 : cr === '1/4' ? 0.25 : cr === '1/3' ? 1 / 3 : 99));
		for (let i = 1; i <= 9; i++) {
			const band = sc.crBand.find((b) => b.layer === `L${i}`);
			assert.ok(band, `L${i} 有定标带`);
			for (const e of D().ENCOUNTER_SPAN1[`L${i}`].encounters) {
				const cr = R().characters.get(e.ref).stats.cr;
				assert.ok(crVal(cr) <= band.crMax, `L${i} 的 ${e.ref}（CR ${cr}）≤ 上限 ${band.crMax}`);
			}
		}
	});

	/* ---------- 第 10 层整备区：图合法性 ＋ 单向门无回边 ---------- */

	test('dnd3：第 10 层整备区图合法（无孤立/悬空）且「升层门」无反向边（单向，10→11 不给 11→10）', () => {
		const map = D().buildSpan1Hub();
		assert.eq(map.validate().length, 0, '无孤立/悬空');
		assert.ok(map.locations.has('L10-camp') && map.locations.has('L10-settlement'), '整备点与建设入口都在');
		const gate = D().span1GateExit();
		assert.eq(gate.from, 'L10-gate');
		assert.eq(gate.to, 'L11', '升层方向 10→11');
		const backEdges = map.exits.filter((e) => e.from === 'L11' || (e.to === 'L10-gate' && e.from !== 'L10-camp' && e.from !== 'L10-settlement'));
		assert.eq(backEdges.length, 0, '图内不存在「进第 10 层门」的反向边（段间封闭）');
		/* gate 边未挂图：L11 实体归二段票，此处只验「定义存在且方向正确」。
		 * 挂图接线归 #1746（届时 L11 已在图上，不悬空）。 */
		assert.ok(!map.exits.some((e) => e.from === 'L10-gate'), 'gate 边在本笔不挂图（L11 未建，防悬空边）');
	});
})();
