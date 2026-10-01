/* core/65-encounters 的单元测试：层梯度、加权抽样、遭遇/掉落抽取（#1761 · B2）
 *
 * 纪律（承 tests/README.md）：
 *   · 掷骰面一律注入固定序列（`RPG.rng.setSequence`）或计数桩——**不断言产出的统计分布**；
 *   · 「恰好消耗 1 次随机读数」是**规范句**（设计稿 §二.2），故用**计数桩**钉住，而非看结果。
 *   · 用**本用例私有的层表/遭遇表**（id 加 `unit-` 前缀）隔离，避免与内容侧的 `span1` 相互干扰。
 */
(() => {
	const R = () => setup.RPG;

	/* ---------- 造表工具：一张两层的私有表（climb + hub） ---------- */
	const mkTable = (opts = {}) => {
		const layers = opts.layers ?? [
			{ id: 'unit-a', type: 'climb', start: true },
			{ id: 'unit-b', type: 'climb' },
			{ id: 'unit-hub', type: 'hub' },
			{ id: 'unit-exit', type: 'exit' },
		];
		R().registerLayerMeta('unit-grp', layers);
		const table = opts.table ?? {
			'unit-a': { encounters: [{ ref: 'goblin', weight: 3 }, { ref: 'guard', weight: 1 }], loot: [{ id: 'coin', weight: 1 }] },
			'unit-b': { encounters: [{ ref: 'goblin', weight: 2 }], loot: [{ id: 'coin', weight: 1 }, { id: 'bandage', weight: 1, qty: [1, 3] }] },
		};
		if (opts.skipRegister !== true) R().registerEncounterTable('unit-grp', table);
		return table;
	};

	/* 记录每次随机读数（既作定值来源，又作「消耗几次」的计数桩） */
	const spyRng = (values) => {
		const reads = [];
		let i = 0;
		R().rng.set(() => {
			const v = values[Math.min(i, values.length - 1)];
			reads.push(v);
			i++;
			return v;
		});
		return reads;
	};

	/* ---------- ① 层元数据读取面 ---------- */

	test('encounters：layerOf/layerType —— 命中返回层对象并附所属表 id，未注册返回 null', () => {
		mkTable();
		const a = R().layerOf('unit-a');
		assert.eq(a.id, 'unit-a');
		assert.eq(a.type, 'climb');
		assert.eq(a.start, true, 'start 标记带出');
		assert.eq(a.group, 'unit-grp', '附所属层表 id（表配对的键）');
		assert.eq(R().layerType('unit-hub'), 'hub');
		assert.eq(R().layerOf('ghost-layer'), null, '未注册 ⇒ null');
		assert.eq(R().layerType('ghost-layer'), null);
	});

	test('encounters：gradientLayers/inGradient —— 入梯度 ⟺ type==="climb"（hub/exit 结构性排除）', () => {
		mkTable();
		const grad = R().gradientLayers().filter((l) => l.group === 'unit-grp').map((l) => l.id);
		assert.eq(grad.join(','), 'unit-a,unit-b', '只有 climb 层入梯度');
		assert.eq(R().inGradient('unit-a'), true);
		assert.eq(R().inGradient('unit-hub'), false, 'hub 不入梯度');
		assert.eq(R().inGradient('unit-exit'), false, 'exit 不入梯度');
		assert.eq(R().inGradient('ghost-layer'), false, '未注册 ⇒ 不入梯度（不抛错）');
	});

	test('encounters：layerOfLocation —— 地点 id 精确命中优先，否则取最长前缀', () => {
		mkTable();
		assert.eq(R().layerOfLocation('unit-a').id, 'unit-a', '地点 id 即层 id');
		assert.eq(R().layerOfLocation('unit-hub-camp').id, 'unit-hub', '前缀命中（整备区的形）');
		assert.eq(R().layerOfLocation('unit-hub-camp').locationId, 'unit-hub-camp', '带上原地点 id');
		assert.eq(R().layerOfLocation('elsewhere'), null, '判不出 ⇒ null（无层语义的地图不受影响）');
		assert.eq(R().layerOfLocation(''), null, '空串 ⇒ null');
	});

	test('encounters：WorldMap 集成 —— 地图自己回答「当前所在地点属哪层」', () => {
		mkTable();
		const map = new (R().WorldMap)({ id: 'unit-enc' });
		map.addLocation(new (R().Location)({ id: 'unit-a', name: 'A' }));
		map.addLocation(new (R().Location)({ id: 'unit-hub-camp', name: 'H' }));
		map.addPath({ from: 'unit-a', to: 'unit-hub-camp', text: '向上' });
		map.moveTo('unit-a');
		assert.eq(map.layerType(), 'climb', '缺省读当前位置');
		assert.eq(map.layerOf().id, 'unit-a');
		map.moveTo('unit-hub-camp');
		assert.eq(map.layerType(), 'hub', '移动到整备区 ⇒ 类型随之变');
		assert.eq(map.layerOf('unit-a').type, 'climb', '可显式传地点 id');
	});

	/* ---------- ② 加权抽样：唯一实现 ---------- */

	test('encounters：pickWeighted —— 累积权重越过 u×总权重即命中（权重为相对值）', () => {
		const entries = [{ k: 'A', weight: 1 }, { k: 'B', weight: 3 }];   // 总 4
		const pick = (u) => { R().rng.setSequence([u]); return R().pickWeighted(entries).k; };
		assert.eq(pick(0.0), 'A', 'u=0 ⇒ 首项');
		assert.eq(pick(0.2), 'A', 'u=0.2 ⇒ 0.8 < 1 ⇒ A');
		assert.eq(pick(0.3), 'B', 'u=0.3 ⇒ 1.2 ≥ 1 ⇒ B');
		assert.eq(pick(0.999), 'B', 'u 逼近 1 ⇒ 末项');
	});

	test('encounters：pickWeighted —— **恰好消耗 1 次**随机读数（计数桩，而非看结果）', () => {
		const entries = [{ k: 'A', weight: 1 }, { k: 'B', weight: 1 }];
		const reads = spyRng([0.9]);
		R().pickWeighted(entries);
		assert.eq(reads.length, 1, '单次抽样只读 1 次随机数');
	});

	test('encounters：pickWeighted —— 权重 0 的条目永不命中（登记但不投放）', () => {
		const entries = [{ k: 'A', weight: 0 }, { k: 'B', weight: 1 }];
		for (const u of [0, 0.001, 0.5, 0.999]) {
			R().rng.setSequence([u]);
			assert.eq(R().pickWeighted(entries).k, 'B', `u=${u} ⇒ 跳过权重 0 的 A`);
		}
	});

	test('encounters：pickWeighted —— 空表/非法权重/全零权重 ⇒ 抛错且带 code', () => {
		const code = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };
		assert.eq(code(() => R().pickWeighted([])), 'ENCOUNTER_EMPTY', '空表');
		assert.eq(code(() => R().pickWeighted([null])), 'ENCOUNTER_BAD_ENTRY', '非对象元素');
		assert.eq(code(() => R().pickWeighted([{ weight: -1 }])), 'ENCOUNTER_BAD_WEIGHT', '负权重');
		assert.eq(code(() => R().pickWeighted([{ weight: '2' }])), 'ENCOUNTER_BAD_WEIGHT', '非数值权重');
		assert.eq(code(() => R().pickWeighted([{ weight: 0 }, { weight: 0 }])), 'ENCOUNTER_ZERO_WEIGHT', '全零');
	});

	/* ---------- ③ 表的结构校验与注册 ---------- */

	test('encounters：validateEncounterTable —— 结构错逐条点名；权重和 0 判为「抽不出来」', () => {
		assert.eq(R().validateEncounterTable({}).length, 0, '空表结构合法（无层=无条目）');
		assert.ok(R().validateEncounterTable(null).length > 0, 'null 不合法');
		const bad = {
			L1: { encounters: [{ weight: 1 }], loot: [] },                       // 缺 ref
			L2: { encounters: [{ ref: 'x', weight: 0 }], loot: [] },             // 权重和为 0
			L3: { encounters: [{ ref: 'x', weight: 1, elite: 'yes' }], loot: [] }, // elite 非布尔
			L4: { encounters: [{ ref: 'x', weight: 1 }], loot: [{ id: 'c', weight: 1, qty: [3, 1] }] }, // qty 反序
			L5: { encounters: 'nope', loot: [] },                                // encounters 非数组
		};
		const problems = R().validateEncounterTable(bad);
		const all = problems.join('\n');
		for (const frag of ['L1', 'L2', 'L3', 'L4', 'L5']) assert.ok(all.includes(frag), `点名 ${frag}`);
		assert.ok(all.includes('qty'), 'qty 问题被点名');
		assert.ok(all.includes('抽不出来'), '权重和为 0 的说明可读');
	});

	test('encounters：registerEncounterTable —— 结构错即抛（ENCOUNTER_BAD_TABLE 且附 problems）', () => {
		let err = null;
		try { R().registerEncounterTable('unit-bad', { L1: { encounters: [{ weight: 1 }] } }); } catch (e) { err = e; }
		assert.ok(err, '结构错 ⇒ 抛错（✗ 静默降级）');
		assert.eq(err.code, 'ENCOUNTER_BAD_TABLE');
		assert.ok(Array.isArray(err.problems) && err.problems.length > 0, '附 problems');
		assert.eq(R().encounterTables['unit-bad'], undefined, '不合法者未进注册表');
		const code = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };
		assert.eq(code(() => R().registerEncounterTable('', {})), 'ENCOUNTER_BAD_ID', '空 id');
	});

	test('encounters：validateEncounterRefs —— 离线核引用面（未注册者逐条点名）', () => {
		const table = {
			L1: { encounters: [{ ref: 'goblin', weight: 1 }], loot: [{ id: 'coin', weight: 1 }] },
			L2: { encounters: [{ ref: 'ghost-monster', weight: 1 }], loot: [{ id: 'ghost-item', weight: 1 }] },
		};
		const missing = R().validateEncounterRefs(table);
		assert.eq(missing.length, 2, `两条未注册：${JSON.stringify(missing)}`);
		assert.ok(missing.join(' ').includes('ghost-monster'));
		assert.ok(missing.join(' ').includes('ghost-item'));
		assert.eq(R().validateEncounterRefs({ L1: table.L1 }).length, 0, '全注册 ⇒ 空数组');
	});

	/* ---------- ④ 遭遇抽取 ---------- */

	test('encounters：rollEncounter —— climb 层可抽，条目形 {ref, elite, layer}；elite 原样带出', () => {
		mkTable({ table: {
			'unit-a': { encounters: [{ ref: 'goblin', weight: 1, elite: true }], loot: [] },
		} });
		R().rng.setSequence([0.5]);
		const got = R().rollEncounter('unit-a');
		assert.eq(got.length, 1);
		assert.eq(got[0].ref, 'goblin');
		assert.eq(got[0].elite, true, 'elite 原样带出（本层不解释其含义）');
		assert.eq(got[0].layer, 'unit-a');
	});

	test('encounters：rollEncounter —— **hub/exit 结构性不抽**（即令内容侧误写条目也不读）', () => {
		mkTable({ table: {
			'unit-hub': { encounters: [{ ref: 'goblin', weight: 1 }], loot: [{ id: 'coin', weight: 1 }] },
			'unit-exit': { encounters: [{ ref: 'goblin', weight: 1 }], loot: [{ id: 'coin', weight: 1 }] },
		} });
		const reads = spyRng([0.5]);
		assert.eq(JSON.stringify(R().rollEncounter('unit-hub')), '[]', 'hub ⇒ 空（不消耗随机读数）');
		assert.eq(JSON.stringify(R().rollEncounter('unit-exit')), '[]', 'exit ⇒ 空');
		assert.eq(JSON.stringify(R().rollLoot('unit-hub')), '[]');
		assert.eq(reads.length, 0, '★ 结构性排除 ⇒ 一次随机读数都没花');
	});

	test('encounters：rollEncounter —— 层未注册 ⇒ 抛 ENCOUNTER_UNKNOWN_LAYER（数据错不当成无遭遇）', () => {
		mkTable();
		let err = null;
		try { R().rollEncounter('ghost-layer'); } catch (e) { err = e; }
		assert.ok(err, '抛错');
		assert.eq(err.code, 'ENCOUNTER_UNKNOWN_LAYER');
	});

	test('encounters：rollEncounter —— 入梯度但该层无条目行 ⇒ 返回空（内容选择，非错误）', () => {
		mkTable({ table: { 'unit-a': { encounters: [{ ref: 'goblin', weight: 1 }], loot: [] } } });
		assert.eq(JSON.stringify(R().rollEncounter('unit-b')), '[]', 'unit-b 无条目行');
	});

	test('encounters：rollEncounter —— count 抽多组，每次独立；count 非正整数 ⇒ 抛错', () => {
		mkTable({ table: { 'unit-a': { encounters: [{ ref: 'goblin', weight: 1 }], loot: [] } } });
		const reads = spyRng([0.1, 0.5, 0.9]);
		const got = R().rollEncounter('unit-a', { count: 3 });
		assert.eq(got.length, 3, '抽 3 组');
		assert.eq(reads.length, 3, '★ 3 组 = 3 次随机读数');
		const code = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };
		assert.eq(code(() => R().rollEncounter('unit-a', { count: 0 })), 'ENCOUNTER_BAD_COUNT');
		assert.eq(code(() => R().rollEncounter('unit-a', { count: 1.5 })), 'ENCOUNTER_BAD_COUNT');
	});

	test('encounters：rollEncounter —— 表内 ref 未注册 ⇒ 抛 ENCOUNTER_UNKNOWN_REF（引注册 id 的守卫）', () => {
		mkTable({ table: { 'unit-a': { encounters: [{ ref: 'ghost-monster', weight: 1 }], loot: [] } } });
		R().rng.setSequence([0.5]);
		let err = null;
		try { R().rollEncounter('unit-a'); } catch (e) { err = e; }
		assert.eq(err?.code, 'ENCOUNTER_UNKNOWN_REF');
	});

	/* ---------- ⑤ 掉落抽取 ---------- */

	test('encounters：rollLoot —— 条目形 {id, n, layer}；省略 qty ⇒ 恰好 1 件（不再多读随机数）', () => {
		mkTable({ table: { 'unit-a': { encounters: [], loot: [{ id: 'coin', weight: 1 }] } } });
		const reads = spyRng([0.5]);
		const got = R().rollLoot('unit-a');
		assert.eq(got.length, 1);
		assert.eq(got[0].id, 'coin');
		assert.eq(got[0].n, 1, '省略 qty ⇒ 1 件');
		assert.eq(reads.length, 1, '★ 省略 qty ⇒ 只花 1 次读数');
	});

	test('encounters：rollLoot —— qty=[min,max] 闭区间取件数（端点可命中），且**恰好再读 1 次**', () => {
		mkTable({ table: { 'unit-b': { encounters: [], loot: [{ id: 'bandage', weight: 1, qty: [2, 4] }] } } });
		const nFor = (u) => { R().rng.setSequence([0.5, u]); return R().rollLoot('unit-b')[0].n; };
		assert.eq(nFor(0.0), 2, 'u=0 ⇒ 下界');
		assert.eq(nFor(0.999), 4, 'u 逼近 1 ⇒ 上界');
		const reads = spyRng([0.5, 0.5]);
		R().rollLoot('unit-b');
		assert.eq(reads.length, 2, '★ 选条目 1 次 ＋ 取件数 1 次');
	});

	test('encounters：rollLoot —— 未注册掉落 id ⇒ 抛 ENCOUNTER_UNKNOWN_REF', () => {
		mkTable({ table: { 'unit-a': { encounters: [], loot: [{ id: 'ghost-item', weight: 1 }] } } });
		R().rng.setSequence([0.5]);
		let err = null;
		try { R().rollLoot('unit-a'); } catch (e) { err = e; }
		assert.eq(err?.code, 'ENCOUNTER_UNKNOWN_REF');
	});

	/* ---------- ⑥ 与内容侧真实表集成（一份段内容物，非本用例私有） ---------- */

	test('encounters：内容集成 —— 一段真实表（span1）可被原语消费：L1–L9 可抽、L10（hub）不抽', () => {
		const table = setup.DND3?.ENCOUNTER_SPAN1;
		assert.ok(table, '内容侧已注册一段遭遇表');
		assert.eq(R().validateEncounterTable(table).length, 0, '结构合法');
		assert.eq(R().validateEncounterRefs(table).length, 0, '引用全部已注册（离线核）');
		for (let i = 1; i <= 9; i++) {
			const layer = `L${i}`;
			assert.eq(R().layerType(layer), 'climb', `${layer} 是 climb 层`);
			R().rng.setSequence([0.5]);
			const enc = R().rollEncounter(layer);
			assert.eq(enc.length, 1, `${layer} 抽得出 1 组`);
			assert.ok(R().characters.has(enc[0].ref), `${layer} 抽到的 ${enc[0].ref} 已注册`);
		}
		assert.eq(R().layerType('L10'), 'hub', 'L10 是 hub（整备区）');
		const reads = spyRng([0.5]);
		assert.eq(JSON.stringify(R().rollEncounter('L10')), '[]', 'L10 不抽遭遇');
		assert.eq(reads.length, 0, 'L10 未花随机读数');
	});

	test('encounters：内容集成 —— 同一种子在同层上可复现（抽样只经 RPG.rng，确定性可判）', () => {
		R().rng.setSequence([0.42]);
		const a = R().rollEncounter('L5')[0].ref;
		R().rng.setSequence([0.42]);
		const b = R().rollEncounter('L5')[0].ref;
		assert.eq(a, b, '同种子 ⇒ 同结果');
	});
})();
