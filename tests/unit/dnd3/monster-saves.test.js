/* dnd3 豁免面（`#2030` ＋ `#1762` B-6，接线侧）：15 只怪物的三豁免逐只反算回模板
 *
 * 本档要证的是「**接上了**」，✗ 不只是「字段在」：
 *   ① 每只怪物的「声明的**基础加值** ＋ 该豁免的属性调整值」必须等于**模板 Saves 行的总分**
 *      —— 模板总分与模板六维在此**逐值照录**（每行末字段即该行的 pin 引用），任一侧漂移本档即红；
 *   ② 同一条数再经 `DND3.save` 的**真通路**复核（三型各一次）：`mod` 字段须等于模板总分
 *      ⇒ 这同时钉住「属性映射」（强韧→体质、反射→敏捷、意志→感知），因为映射错则数不对；
 *   ③ 玩家与两只自有单位（无 SRD 条目）另列：基础加值 0 ＋ 属性调整值，✗ 不编造照录值。
 * 逐只的模板出处与声明见各怪物档的同段注释；口径见 `src/dnd/dnd3/core/saves.js` 档头。
 *
 * ★引用形（本档的行末字段）写成**字面**而 ✗ 不拼插值 —— 判据门要能**静态解析**该引用
 *   （`tests/gates/refs-integrity.mjs` 的引用形；插值对它是不可解析的）。
 */
(() => {
	const D = () => setup.DND3;
	/** 逐值一致（照录）：[角色id, 名, 强韧/反射/意志**总分**, 体质, 敏捷, 感知, 该行出处] */
	const 表 = [
		['Badger', '獾', [4, 5, 1], 15, 17, 12,
			'SRD 3.5 · `Monsters/Monsters - Animals.md:127`（`## Badger` → Saves：Fort +4, Ref +5, Will +1）'],
		['Boar', '野猪', [6, 3, 2], 17, 10, 13,
			'SRD 3.5 · `Monsters/Monsters - Animals.md:370`（`## Boar` → Saves：Fort +6, Ref +3, Will +2）'],
		['BrownBear', '棕熊', [9, 6, 3], 19, 13, 12,
			'SRD 3.5 · `Monsters/Monsters - Animals.md:244`（`## Bear, Brown` → Saves：Fort +9, Ref +6, Will +3）'],
		['Crocodile', '鳄鱼', [6, 4, 2], 17, 12, 12,
			'SRD 3.5 · `Monsters/Monsters - Animals.md:531`（`## Crocodile` → Saves：Fort +6, Ref +4, Will +2）'],
		['MonitorLizard', '巨蜥', [8, 5, 2], 17, 15, 12,
			'SRD 3.5 · `Monsters/Monsters - Animals.md:1179`（`## Lizard, Monitor` → Saves：Fort +8, Ref +5, Will +2）'],
		['Wolf', '狼', [5, 5, 1], 15, 15, 12,
			'SRD 3.5 · `Monsters/Monsters - Animals.md:2316`（`## Wolf` → Saves：Fort +5, Ref +5, Will +1）'],
		['GiantBee', '巨蜂', [3, 3, 2], 11, 14, 12,
			'SRD 3.5 · `Monsters/Monsters - Vermin.md:93`（`## Giant Bee` → Saves：Fort +3, Ref +3, Will +2）'],
		['BombardierBeetle', '投弹甲虫', [5, 0, 0], 14, 10, 10,
			'SRD 3.5 · `Monsters/Monsters - Vermin.md:133`（`## Giant Bombardier Beetle` → Saves：Fort +5, Ref +0, Will +0）'],
		['FireBeetle', '火甲虫', [2, 0, 0], 11, 11, 10,
			'SRD 3.5 · `Monsters/Monsters - Vermin.md:169`（`## Giant Fire Beetle` → Saves：Fort +2, Ref +0, Will +0）'],
		['GiantStagBeetle', '巨锹甲虫', [8, 2, 2], 17, 10, 10,
			'SRD 3.5 · `Monsters/Monsters - Vermin.md:200`（`## Giant Stag Beetle` → Saves：Fort +8, Ref +2, Will +2）'],
		['Goblin', '哥布林', [3, 1, -1], 12, 13, 9,
			'SRD 3.5 · `3.5 Compendium/Monsters/3.5 Monsters - G.md:1282`（`## Goblin` → Saves：Fort +3, Ref +1, Will -1）'],
		['SmallWaterElemental', '小型水元素', [4, 0, 0], 13, 10, 11,
			'SRD 3.5 · `3.5 Compendium/Monsters/3.5 Monsters - E.md:326`（`### Water Elemental, Small` → Saves：Fort +4, Ref +0, Will +0）'],
		['MediumWaterElemental', '中型水元素', [7, 2, 1], 17, 12, 11,
			'SRD 3.5 · `3.5 Compendium/Monsters/3.5 Monsters - E.md:326`（`### Water Elemental, Medium` → Saves：Fort +7, Ref +2, Will +1）'],
	];
	const 三型 = [['fortitude', 'save_fortitude', 'con', 0], ['reflex', 'save_reflex', 'dex', 1], ['will', 'save_will', 'wis', 2]];
	const 调整值 = (分) => Math.floor((分 - 10) / 2);

	test('dnd3 豁免：13 只走模板的怪物「基础加值 ＋ 属性调整值 ＝ 模板总分」', () => {
		for (const [id, 名, 总分, con, dex, wis, 出处] of 表) {
			const c = D()[id];
			assert.ok(c, `${id} 存在`);
			assert.eq(c.stats.con, con, `${名} 体质 ${con}（${出处}）`);
			assert.eq(c.stats.dex, dex, `${名} 敏捷 ${dex}（${出处}）`);
			assert.eq(c.stats.wis, wis, `${名} 感知 ${wis}（${出处}）`);
			const 分 = [con, dex, wis];
			for (const [类型, 键, , idx] of 三型) {
				assert.eq(c.stats[键] + 调整值(分[idx]), 总分[idx],
					`${名} 的 ${类型}：声明 ${c.stats[键]} ＋ 调整值 ${调整值(分[idx])} ＝ 模板 ${总分[idx]}（${出处}）`);
			}
		}
	});

	test('dnd3 豁免：同一条数经 `DND3.save` 的真通路复核（`mod` 须等于模板总分 ⇒ 钉住属性映射）', () => {
		for (const [id, 名, 总分, , , , 出处] of 表) {
			const c = D()[id];
			for (const [类型, , , idx] of 三型) {
				const r = D().save(c, 类型, 0);
				assert.eq(r.mod, 总分[idx], `${名} 的 ${类型} 总分应为 ${总分[idx]}（${出处}）`);
				/* ★《`#435` 顺折》：**创伤罚不进 `mod`** ⇒ 用返回的 `trauma` 收口。本格首版写的是
				 *   `total === roll + 总分` 且 `trauma === 0`，而上表的角色是多处共享的模块级实例、
				 *   dnd3 的创伤是可被别处在册用例（消费真随机）沾上的共享状态 ⇒ CI 上偶发「越界」
				 *   （`rng-code-off` 与 `silent-first-host` 两把刀各实测到一回）。
				 *   改后**与角色身上干不干净无关**，仍钉住「创伤只进 total」这一条。 */
				assert.eq(r.total, r.roll + r.mod + r.trauma, `${名} 的 ${类型}：total ＝ roll ＋ mod ＋ 创伤罚`);
				assert.eq(typeof r.trauma, 'number', `${名} 的 ${类型}：创伤罚须是数（缺省 0）`);
			}
		}
	});

	test('dnd3 豁免：玩家与两只自有单位（源里无同名条目）＝ 基础加值 0 ＋ 属性调整值', () => {
		/* 无模板可照录 ⇒ ✗ 不编造；此处钉的是「基础加值显式写 0」这条具名决定。 */
		for (const [id, 名] of [['Player', '玩家'], ['GoblinBoss', '哥布林首领'], ['Guard', '受伤的守卫']]) {
			const s = D()[id].stats;
			assert.eq(s.save_fortitude, 0, `${名} 强韧基础加值 0（引擎无职业与等级面）`);
			assert.eq(s.save_reflex, 0, `${名} 反射基础加值 0`);
			assert.eq(s.save_will, 0, `${名} 意志基础加值 0`);
		}
		// 玩家：总分恰为属性那一份（DEFAULTS 只给了 `str 12／dex 12` ⇒ 体质与感知是缺省 10）
		const p = D().Player;
		assert.eq(p.stats.con, 10, '玩家体质未给 ⇒ 缺省 10（见 player.js 的 DEFAULTS）');
		assert.eq(D().save(p, 'fortitude', 0).mod, 0, '玩家强韧 ＝ 体质 10 的 +0');
		assert.eq(D().save(p, 'reflex', 0).mod, 1, '玩家反射 ＝ 敏捷 12 的 +1');
		assert.eq(D().save(p, 'will', 0).mod, 0, '玩家意志 ＝ 感知缺省 10 的 +0');
		// 守卫只声明了三项六维（无感知）⇒ 意志那一份按缺省 10 计 +0，✗ 不炸
		assert.eq(D().save(D().Guard, 'will', 0).mod, 0, '守卫意志 +0（感知缺省）');
	});

	test('dnd3 豁免：全 16 个角色（15 怪物 ＋ 玩家）都有三键且逐键对称', () => {
		const 角色 = ['Badger', 'Boar', 'BombardierBeetle', 'BrownBear', 'Crocodile', 'FireBeetle', 'GiantBee',
			'GiantStagBeetle', 'Goblin', 'GoblinBoss', 'Guard', 'MediumWaterElemental', 'MonitorLizard',
			'Player', 'SmallWaterElemental', 'Wolf'];
		assert.eq(角色.length, 16, '角色数 16（15 只怪物 ＋ 玩家）');
		for (const id of 角色) {
			const s = D()[id].stats;
			for (const [, 键] of 三型) {
				assert.ok(键 in s, `${id} 有 ${键}（✗ 不是靠 ?? 兜底而"看起来有"）`);
				assert.eq(typeof s[键], 'number', `${id} 的 ${键} 是数`);
			}
		}
	});
})();
