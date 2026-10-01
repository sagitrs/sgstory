/* dnd3/span2 的单元测试：巴别二段（#1778）—— 怪物/道具逐值对源 ＋ 遭遇表契约 ＋ 层元数据注册 ＋ 第 20 层整备区
 *
 * 断言锚真值纪律（#1750 根因①）：涉 SRD 行为的断言在断言处注明出处（对源锚，不锚实现）；
 * house rule 面的断言注明「house rule」。
 * ⚠ Int「—」面：vermin 的 Int 源为「—」而本仓落缺省 10 ⇒ 本文件**不断言 int**（见各 monster 文件头缺口说明），
 *   也不写进用例名（否则门会拿它去对源 ⇒ 源侧抽不出值 ⇒ 恒「未覆盖」噪声）。
 */
(() => {
	const D = () => setup.DND3;
	const R = () => setup.RPG;

	/* ---------- 敌人：逐值对源（源＝3.5 虫类条目；每条的完整出处与行号写在各用例上方）---------- */

	/* 出处：SRD 3.5 · `Monsters/Monsters - Vermin.md:155`（`## Giant Fire Beetle` → Abilities：Str 10／Dex 11／Con 11／Wis 10／Cha 7；HP 4；AC 16；CR 1/3） */
	test('dnd3：火甲虫对齐 SRD 3.5 · Giant Fire Beetle（AC 16, HP 4, STR 10, DEX 11）', () => {
		const s = D().FireBeetle.stats;
		assert.eq(s.str, 10, 'Str 10');
		assert.eq(s.dex, 11, 'Dex 11');
		assert.eq(s.con, 11, 'Con 11');
		assert.eq(s.wis, 10, 'Wis 10');
		assert.eq(s.cha, 7, 'Cha 7');
		assert.eq(D().FireBeetle.maxHp, 4, 'HP 4（Hit Dice 1d8）');
		assert.eq(s.ac, 16, 'AC 16');
		assert.eq(s.cr, '1/3', 'CR 1/3');
	});

	/* 出处：SRD 3.5 · `Monsters/Monsters - Vermin.md:119`（`## Giant Bombardier Beetle` → Abilities：Str 13／Dex 10／Con 14／Wis 10／Cha 9；HP 13；AC 16；CR 2） */
	test('dnd3：爆甲虫对齐 SRD 3.5 · Giant Bombardier Beetle（AC 16, HP 13, STR 13, DEX 10）', () => {
		const s = D().BombardierBeetle.stats;
		assert.eq(s.str, 13, 'Str 13');
		assert.eq(s.dex, 10, 'Dex 10');
		assert.eq(s.con, 14, 'Con 14');
		assert.eq(s.wis, 10, 'Wis 10');
		assert.eq(s.cha, 9, 'Cha 9');
		assert.eq(D().BombardierBeetle.maxHp, 13, 'HP 13（Hit Dice 2d8+4）');
		assert.eq(s.ac, 16, 'AC 16');
		assert.eq(s.cr, 2, 'CR 2');
	});

	/* 出处：SRD 3.5 · `Monsters/Monsters - Vermin.md:79`（`## Giant Bee` → Abilities：Str 11／Dex 14／Con 11／Wis 12／Cha 9；HP 13；AC 14；CR 1） */
	test('dnd3：巨蜂对齐 SRD 3.5 · Giant Bee（AC 14, HP 13, STR 11, DEX 14）', () => {
		const s = D().GiantBee.stats;
		assert.eq(s.str, 11, 'Str 11');
		assert.eq(s.dex, 14, 'Dex 14');
		assert.eq(s.con, 11, 'Con 11');
		assert.eq(s.wis, 12, 'Wis 12');
		assert.eq(s.cha, 9, 'Cha 9');
		assert.eq(D().GiantBee.maxHp, 13, 'HP 13（Hit Dice 3d8）');
		assert.eq(s.ac, 14, 'AC 14');
		assert.eq(s.cr, 1, 'CR 1');
	});

	/* 出处：SRD 3.5 · `Monsters/Monsters - Vermin.md:186`（`## Giant Stag Beetle` → Abilities：Str 23／Dex 10／Con 17／Wis 10／Cha 9；HP 52；AC 19；CR 4） */
	test('dnd3：巨锹甲对齐 SRD 3.5 · Giant Stag Beetle（AC 19, HP 52, STR 23, DEX 10）', () => {
		const s = D().GiantStagBeetle.stats;
		assert.eq(s.str, 23, 'Str 23');
		assert.eq(s.dex, 10, 'Dex 10');
		assert.eq(s.con, 17, 'Con 17');
		assert.eq(s.wis, 10, 'Wis 10');
		assert.eq(s.cha, 9, 'Cha 9');
		assert.eq(D().GiantStagBeetle.maxHp, 52, 'HP 52（Hit Dice 7d8+21）');
		assert.eq(s.ac, 19, 'AC 19');
		assert.eq(s.cr, 4, 'CR 4');
	});

	/* 出处：SRD 3.5 · `Monsters/Monsters - Animals.md:230`（`## Bear, Brown` → Abilities：Str 27／Dex 13／Con 19／Int 2／Wis 12／Cha 6；HP 51；AC 15；CR 4） */
	test('dnd3：棕熊对齐 SRD 3.5 · Bear, Brown（AC 15, HP 51, STR 27, DEX 13）', () => {
		const s = D().BrownBear.stats;
		assert.eq(s.str, 27, 'Str 27');
		assert.eq(s.dex, 13, 'Dex 13');
		assert.eq(s.con, 19, 'Con 19');
		assert.eq(s.int, 2, 'Int 2（源有真值，非「—」）');
		assert.eq(s.wis, 12, 'Wis 12');
		assert.eq(s.cha, 6, 'Cha 6');
		assert.eq(D().BrownBear.maxHp, 51, 'HP 51（Hit Dice 6d8+24）');
		assert.eq(s.ac, 15, 'AC 15');
		assert.eq(s.cr, 4, 'CR 4');
	});

	/* Int「—」缺口：vermin 的源为「—」而本仓落缺省 10 ⇒ 显式断言「本仓是缺省占位」而非源值
	 * （house rule 面；源侧抽不出 Int ⇒ 门不入 A 组 ⇒ 此用例是缺口的存在性留痕）。 */
	test('dnd3：vermin 的 Int 落缺省 10（源为「—」的缺口登记；house rule）', () => {
		for (const m of [D().FireBeetle, D().BombardierBeetle, D().GiantBee, D().GiantStagBeetle]) {
			assert.eq(m.stats.int, D().STAT_BLOCK.int, `${m.name} 的 Int 落 STAT_BLOCK 缺省（非源值）`);
		}
	});

	test('dnd3：二段新怪与玩家数值块同构（字段集一致）', () => {
		const pk = Object.keys(D().Player.stats).sort().join(',');
		for (const m of [D().FireBeetle, D().BombardierBeetle, D().GiantBee, D().GiantStagBeetle, D().BrownBear]) {
			assert.eq(Object.keys(m.stats).sort().join(','), pk, `${m.name} 与玩家同构`);
		}
	});

	/* ---------- 道具：逐值对源 ＋ house rule ---------- */

	/* 出处：SRD 3.5 · `Basic Rules and Legal/equipment.md:2108`（Table: Armor and Shields 的 Scale mail 行：50 gp／+4／30 lb.） */
	test('dnd3：鳞甲对齐 SRD 3.5 · Scale mail（ac_bonus 4、cost 50、weight 30）', () => {
		const s = R().createItem('scale-mail').stats;
		assert.eq(s.ac_bonus, 4, 'Armor Bonus +4');
		assert.eq(s.cost, 50, '价格 50 gp');
		assert.eq(s.weight, 30, '重量 30 lb.');
	});

	/* ★跨包 id 遮蔽的回归判据（#1743 族）：本段代表件的 id 必须**不与 dnd-5e 面重叠**
	 *   —— 首稿用 `chain-shirt`（与 dnd-5e 同名）实测打红了 dnd-5e 的一条用例。 */
	test('dnd3：二段代表件 id 与 dnd-5e 面零重叠（防跨包静默遮蔽，#1743）', () => {
		const d5 = R().createItem('chain-shirt');       // dnd-5e 的件
		assert.ok(d5 instanceof setup.DND5E.ChainShirt, 'chain-shirt 仍是 dnd-5e 的件（未被本包覆盖）');
		assert.eq(R().createItem('scale-mail').constructor.name, 'Item:scale-mail', '本包件 id 独立');
	});

	/* house rule（非 SRD）：资源类两件 —— 断言「不可装备＋可叠加＋有价」的设计意图。 */
	test('dnd3：锻造图是 house rule 资源件（不可装备、可叠加、有价）', () => {
		for (const [id, val] of [['iron-message', 5]]) {
			const it = R().createItem(id);
			assert.eq(it.slot, null, `${id} 不可装备`);
			assert.eq(it.stackable, true, `${id} 可叠加`);
			assert.eq(it.stats.value, val, `${id} 单价为 house rule 值`);
		}
	});

	/* ---------- 层元数据（契约形；注册进 core 面）---------- */

	test('dnd3：二段层元数据契约——L11–L19 是 climb、L20 是 hub、无 exit、且**无 start**', () => {
		const meta = D().LAYER_META_SPAN2;
		assert.eq(meta.length, 10, '二层段共 10 层');
		assert.eq(meta[0].id, 'L11');
		for (let i = 0; i < 9; i++) assert.eq(meta[i].type, 'climb', `${meta[i].id} 是 climb`);
		assert.eq(meta[9].id, 'L20');
		assert.eq(meta[9].type, 'hub', 'L20 是大空洞（hub）');
		assert.ok(meta.every((m) => m.type !== 'exit'), '二段无 exit');
		assert.ok(meta.every((m) => m.start !== true), '二段无 start（起点层唯一，属一段 L1）');
	});

	/* ★注册面接线（#1772 落的 `RPG.registerLayerMeta`）：二段表确已注册，且**不影响**起点层读取。 */
	test('dnd3：二段表已注册进 core 面，且不夺一段的 startLayerId（起点层仍 L1）', () => {
		assert.eq(R().layerMeta.span2, D().LAYER_META_SPAN2, 'span2 已注册且同一引用');
		assert.eq(R().startLayerId(), 'L1', '起点层仍是 L1（span2 无 start ⇒ 不改写读取结果）');
	});

	/* ---------- 遭遇表（契约同 #1748；L20 无条目）---------- */

	/* ★ 配对不变式（dev-10 于 #1788 报 MAJOR 后的守卫）：**每个已注册的层组，其遭遇表也须已注册**。
	 *   本笔首版只 `setup.DND3.ENCOUNTER_SPAN2 = {…}`（**裸赋值、未注册**）⇒ `layerOf('L11').group==='span2'`
	 *   但 `encounterTables['span2']` 不存在 ⇒ `encounterTableOf` 回 `null` ⇒ `rollEncounter` **静默返回 `[]`**
	 *   （✗ 不抛错）——「看似有遭遇表、永抽不出」的**假支持**，比抛错更难察觉。
	 *   ⇒ 此处**遍历 `RPG.layerMeta` 的每个组**（✗ 不硬编码 span1/span2），未来新增段若忘了注册即红。 */
	test('dnd3：配对不变式——每个已注册的层组都有同 id 的遭遇表（防「只定义未注册」重演）', () => {
		const groups = Object.keys(R().layerMeta ?? {});
		assert.ok(groups.length > 0, '层组非空（否则本判据空转）');
		for (const g of groups) {
			assert.ok(R().encounterTables?.[g],
				`层组「${g}」须有同 id 的遭遇表（registerEncounterTable('${g}', …)）—— ✗ 只定义不注册`);
		}
	});

	test('dnd3：入梯度的层**真能抽出遭遇**（✗ 非静默空；L11–L19 逐层实证）', () => {
		for (let n = 11; n <= 19; n++) {
			const lid = `L${n}`;
			const got = R().rollEncounter(lid);
			assert.ok(got.length > 0, `${lid} 应能抽出遭遇（✗ 静默返回空数组）`);
			assert.ok(got.every((e) => e.ref), `${lid} 抽出的条目带 ref`);
		}
		const hub = R().rollEncounter('L20');
		assert.eq(hub.length, 0, 'L20 是 hub ⇒ 结构性不抽（这一条是**有意**的空，与上一条的「假空」不同）');
	});

	test('dnd3：二段遭遇表契约——引注册 id、带权重、无内嵌数值；L20 无条目', () => {
		const table = D().ENCOUNTER_SPAN2;
		for (let i = 11; i <= 19; i++) {
			const row = table[`L${i}`];
			assert.ok(row, `L${i} 有遭遇行`);
			assert.ok(row.encounters.length >= 1, `L${i} 至少一个敌人组`);
			for (const e of row.encounters) {
				assert.ok(typeof e.weight === 'number' && e.weight > 0, `L${i} 权重为正数`);
				assert.ok(R().characters.has(e.ref), `L${i} 敌人「${e.ref}」已在角色注册表`);
			}
			for (const l of row.loot) {
				assert.ok(R().items.has(l.id), `L${i} 掉落「${l.id}」已在道具注册表`);
				assert.ok(typeof l.weight === 'number' && l.weight > 0, `L${i} 掉落权重为正数`);
			}
		}
		assert.ok(!table.L20, 'L20 无遭遇条目（整备区，非战斗）');
	});

	/* 遭遇表 × 定标系数一致（house rule 自洽）：每层引用的敌人 CR ≤ 该层 crBand 上限 */
	test('dnd3：二段定标自洽——每层敌人 CR ≤ 该层 crBand 上限（house rule）', () => {
		const sc = D().SPAN2_SCALING;
		const crVal = (cr) => (typeof cr === 'number' ? cr : (cr === '1/2' ? 0.5 : cr === '1/3' ? 1 / 3 : cr === '1/4' ? 0.25 : 99));
		for (let i = 11; i <= 19; i++) {
			const band = sc.crBand.find((b) => b.layer === `L${i}`);
			assert.ok(band, `L${i} 有定标带`);
			for (const e of D().ENCOUNTER_SPAN2[`L${i}`].encounters) {
				const cr = R().characters.get(e.ref).stats.cr;
				assert.ok(crVal(cr) <= band.crMax, `L${i} 的 ${e.ref}（CR ${cr}）≤ 上限 ${band.crMax}`);
			}
		}
	});

	/* ---------- 第 20 层整备区：图合法性 ＋ 单向门无回边 ---------- */

	test('dnd3：第 20 层整备区图合法（无孤立/悬空）且「升层门」无反向边（单向，20→21 不给 21→20）', () => {
		const map = D().buildSpan2Hub();
		assert.eq(map.validate().length, 0, '无孤立/悬空');
		assert.ok(map.locations.has('L20-forge') && map.locations.has('L20-settlement'), '整备点与建设入口都在');
		const gate = D().span2GateExit();
		assert.eq(gate.from, 'L20-gate');
		assert.eq(gate.to, 'L21', '升层方向 20→21');
		const backEdges = map.exits.filter((e) => e.from === 'L21' || (e.to === 'L20-gate' && e.from !== 'L20-settlement'));
		assert.eq(backEdges.length, 0, '图内不存在「进第 20 层门」的反向边（段间封闭）');
		assert.ok(!map.exits.some((e) => e.from === 'L20-gate'), 'gate 边在本笔不挂图（L21 未建，防悬空边）');
	});
})();
