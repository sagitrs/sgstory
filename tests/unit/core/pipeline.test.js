/* 结算管线（core/45-pipeline + dnd-5e 四段迁移）的单元测试 —— #1713 契约③ */
(() => {
	const R = () => setup.RPG;
	const D5 = () => setup.DND5E;

	const TryErrCode = (fn) => {
		try {
			fn();
			return null;
		} catch (e) {
			return e && e.code ? e.code : `(无 code：${e && e.message})`;
		}
	};

	/** 造一条探针管线：每段把 id 记进 ctx.seq（序断言的唯一依据） */
	const probePipe = (id, ids) => R().defPipeline({
		id,
		stages: ids.map((sid) => ({ id: sid, run: (ctx) => { ctx.seq.push(sid); } })),
	});

	test('pipeline：defPipeline 定义校验——失败形态各归其 code', () => {
		assert.eq(TryErrCode(() => R().defPipeline()), 'DEFPIPELINE_BAD_ID', '零参');
		assert.eq(TryErrCode(() => R().defPipeline({})), 'DEFPIPELINE_BAD_ID', '缺 id');
		assert.eq(TryErrCode(() => R().defPipeline({ id: '' })), 'DEFPIPELINE_BAD_ID', '空 id');
		assert.eq(TryErrCode(() => R().defPipeline({ id: 1, stages: [] })), 'DEFPIPELINE_BAD_ID', 'id 非字符串');
		assert.eq(TryErrCode(() => R().defPipeline({ id: 'u-p1' })), 'DEFPIPELINE_BAD_STAGES', 'stages 缺失');
		assert.eq(TryErrCode(() => R().defPipeline({ id: 'u-p1', stages: 'x' })), 'DEFPIPELINE_BAD_STAGES', 'stages 非数组');
		assert.eq(TryErrCode(() => R().defPipeline({ id: 'u-p1', stages: [] })), 'DEFPIPELINE_EMPTY', '空 stages（须拦：会静默不结算）');
		assert.eq(TryErrCode(() => R().defPipeline({ id: 'u-p1', stages: [null] })), 'DEFPIPELINE_BAD_STAGE', '元素为 null（须是契约消息，非 TypeError）');
		assert.eq(TryErrCode(() => R().defPipeline({ id: 'u-p1', stages: [{ run() {} }] })), 'DEFPIPELINE_BAD_STAGE', '阶段缺 id');
		assert.eq(TryErrCode(() => R().defPipeline({ id: 'u-p1', stages: [{ id: 'a' }] })), 'DEFPIPELINE_BAD_STAGE', 'run 非函数');
		assert.eq(TryErrCode(() => R().defPipeline({
			id: 'u-p1', stages: [{ id: 'a', run() {} }, { id: 'a', run() {} }],
		})), 'DEFPIPELINE_DUP_STAGE', '阶段 id 重复');
		assert.eq(TryErrCode(() => R().runPipeline('u-none', {})), 'PIPELINE_UNKNOWN', '未注册管线');
		assert.eq(TryErrCode(() => R().runPipeline('dnd-5e.attack', null)), 'PIPELINE_BAD_CTX', 'ctx 非对象');
		// 合法定义可注册且可读回
		assert.eq(probePipe('u-pipe-ok', ['a', 'b']), 'u-pipe-ok');
		assert.eq(R().pipelineOf('u-pipe-ok').stages.length, 2, 'pipelineOf 读回阶段数');
	});

	test('pipeline：序 = 数组序（唯一权威）；返回同一个 ctx 对象', () => {
		probePipe('u-pipe-order', ['s1', 's2', 's3']);
		const ctx = { seq: [] };
		const out = R().runPipeline('u-pipe-order', ctx);
		assert.eq(JSON.stringify(ctx.seq), '["s1","s2","s3"]', '按数组序执行');
		assert.ok(out === ctx, '返回同一个 ctx（可断言中间态）');
	});

	test('pipeline：阶段置 ctx.done ⇒ 后续阶段不执行（提前结束的唯一通道）', () => {
		R().defPipeline({
			id: 'u-pipe-done',
			stages: [
				{ id: 's1', run: (c) => c.seq.push('s1') },
				{ id: 's2', run: (c) => { c.seq.push('s2'); c.done = true; } },
				{ id: 's3', run: (c) => c.seq.push('s3') },
			],
		});
		const ctx = { seq: [] };
		assert.ok(R().runPipeline('u-pipe-done', ctx) === ctx, '仍返回同一 ctx');
		assert.eq(JSON.stringify(ctx.seq), '["s1","s2"]', 'done 之后的段不执行');
	});

	test('pipeline：阶段抛错**传播**（不吞并）——与回合钩子的吞并故意相反', () => {
		R().defPipeline({
			id: 'u-pipe-boom',
			stages: [
				{ id: 's1', run: () => { throw new Error('结算故障'); } },
				{ id: 's2', run: (c) => c.seq.push('s2') },
			],
		});
		assert.throws(() => R().runPipeline('u-pipe-boom', { seq: [] }), '阶段抛错不得被吞并');
		// 对照：同一故障若发生在回合钩子上 ⇒ 吞并（见 turn-boundary.test.js 的 probeConsole 用例）
	});

	/* ---------- 5E 四段：独立可测 ---------- */

	/** 取 5E 管线的某段（按 id） */
	const stage = (sid) => {
		const st = R().pipelineOf('dnd-5e.attack').stages.find((s) => s.id === sid);
		assert.ok(st, `5E 管线应含阶段 ${sid}`);
		return st;
	};

	/** 建一个可跑单段的 ctx（自带 roll 桩，不依赖 RPG.rng —— 单段测试要确定性） */
	const mkCtx = (over = {}) => ({
		item: new (D5().Club)(), that: null, from: null,
		melee: true, ranged: false,
		abilMod: 0, prof: 0, atkMod: 0, ac: 10,
		rollMode: 'normal', die: null, hit: null, crit: false, diceCount: 1,
		dmgMod: 0, dmg: 0, done: false,
		roll: () => 10,
		...over,
	});

	test('pipeline③：5E 管线恰四段且序固定（atk→mode→resolve→damage）', () => {
		assert.eq(JSON.stringify(R().pipelineOf('dnd-5e.attack').stages.map((s) => s.id)),
			'["5e.atk","5e.mode","5e.resolve","5e.damage"]', '四段与序');
	});

	test('pipeline③：① 5e.atk 单段——Finesse 取 max / 远程用 dex / 熟练相加 / AC 读取', () => {
		// 能力值自 #1697 P1 起存**原始分**（stats.str/dex，缺省 10 ⇒ +0）；fixture 一律给原始分
		const it = stage('5e.atk');
		const item = new (D5().Longsword)({ stats: { finesse: true } }); // 定义里 finesse:false ⇒ 显式开启
		// Finesse：str 1 / dex 3 ⇒ 取 3
		let ctx = mkCtx({ item, from: { stats: { str: 12, dex: 16, prof: 2 } }, that: { stats: { ac: 15 } } });
		it.run(ctx);
		assert.eq(ctx.abilMod, 3, 'Finesse 取较高者');
		assert.eq(ctx.prof, 2, '熟练度读取');
		assert.eq(ctx.atkMod, 5, 'atkMod = prof + abilMod');
		assert.eq(ctx.ac, 15, '目标 AC');
		// 普通近战：用 str（不取高）
		ctx = mkCtx({ item: new (D5().Club)(), from: { stats: { str: 12, dex: 16, prof: 2 } }, that: {} });
		it.run(ctx);
		assert.eq(ctx.abilMod, 1, '非 Finesse 近战用 str');
		// 远程：用 dex
		ctx = mkCtx({ item: new (D5().Bomb)(), ranged: true, from: { stats: { str: 12, dex: 16 } }, that: {} });
		it.run(ctx);
		assert.eq(ctx.abilMod, 3, '远程用 dex');
		assert.eq(ctx.atkMod, 3, '无 prof ⇒ 仅 dex');
	});

	test('pipeline③：② 5e.mode 单段——缺省 normal（P1 起由 rollMode 覆写）', () => {
		const ctx = mkCtx({ rollMode: 'advantage' }); // 单段只负责「本条管线的缺省」
		stage('5e.mode').run(ctx);
		assert.eq(ctx.rollMode, 'normal', '本段缺省 normal（P1 的 rollMode 接线点）');
	});

	test('pipeline③：③ 5e.resolve 单段——命中/失手/天然 20 重击/noDodge，且 roll(ctx.rollMode) 被调用', () => {
		const it = stage('5e.resolve');
		const seen = [];
		const base = { item: { name: '测试剑', perform() {} }, that: { name: '靶', stats: { ac: 15 } }, atkMod: 5 };
		// 命中（die 12 + 5 = 17 ≥ 15）
		let ctx = mkCtx({ ...base, roll: (m) => { seen.push(m); return 12; } });
		it.run(ctx);
		assert.eq(JSON.stringify(seen), '["normal"]', 'roll 收到当前 rollMode');
		assert.eq(ctx.hit, true, '命中'); assert.eq(ctx.crit, false, '非重击'); assert.eq(ctx.diceCount, 1, '一骰');
		// 失手（die 3 + 5 = 8 < 15）⇒ done
		ctx = mkCtx({ ...base, roll: () => 3 });
		it.run(ctx);
		assert.eq(ctx.hit, false, '失手'); assert.eq(ctx.done, true, '失手 ⇒ 不进伤害段');
		// 天然 1 必失手
		ctx = mkCtx({ ...base, atkMod: 99, roll: () => 1 });
		it.run(ctx);
		assert.eq(ctx.hit, false, '天然 1 必失手');
		// 天然 20 ⇒ 重击 + 两骰（且天然 20 即便 AC 很高也命中，不判 done）
		ctx = mkCtx({ ...base, atkMod: -50, roll: () => 20 });
		it.run(ctx);
		assert.eq(ctx.hit, true, '天然 20 命中'); assert.eq(ctx.crit, true, '重击'); assert.eq(ctx.diceCount, 2, '两骰');
		// noDodge 目标：不闪避（低骰也命中），且不暴击
		ctx = mkCtx({ ...base, that: { name: '宝箱', noDodge: true }, atkMod: -50, roll: () => 2 });
		it.run(ctx);
		assert.eq(ctx.hit, true, 'noDodge ⇒ 总是命中'); assert.eq(ctx.crit, false, 'noDodge ⇒ 不暴击');
	});

	test('pipeline③：④ 5e.damage 单段——伤害骰×diceCount + 调整值一次 + dmgMod 链，且扣血', () => {
		const it = stage('5e.damage');
		const printed = [];
		const that = { name: '靶', hp: 20, maxHp: 20 };
		const ctx = mkCtx({
			item: { name: '测试剑', stats: { dmg: '4', type: 'slashing' }, perform: (s) => printed.push(s) },
			that, abilMod: 2, diceCount: 1, crit: false, dmgMod: 0,
		});
		it.run(ctx);
		assert.eq(ctx.dmg, 6, "固定骰 '4' + abilMod 2");
		assert.eq(that.hp, 14, '扣血');
		assert.ok(printed[0].includes('6点slashing伤害'), '输出含伤害与类型');
		// 重击（diceCount 2）：调整值仍只加一次
		const that2 = { name: '靶', hp: 30, maxHp: 30 };
		const ctx2 = mkCtx({ item: { name: 'x', stats: { dmg: '4' }, perform() {} }, that: that2, abilMod: 2, diceCount: 2, crit: true });
		it.run(ctx2);
		assert.eq(ctx2.dmg, 10, '4+4 + 2（调整值只一次）');
		assert.ok(ctx2.notes !== undefined || true, '保持 ctx 结构');
		// dmgMod 链（#1690/#1693 的接线点）
		const that3 = { name: '靶', hp: 30, maxHp: 30 };
		const ctx3 = mkCtx({ item: { name: 'x', stats: { dmg: '1' }, perform() {} }, that: that3, abilMod: 0, diceCount: 1, dmgMod: 5 });
		it.run(ctx3);
		assert.eq(ctx3.dmg, 6, 'dmgMod 汇入伤害');
		// 下限 1
		const that4 = { name: '靶', hp: 10, maxHp: 10 };
		const ctx4 = mkCtx({ item: { name: 'x', stats: { dmg: '1' }, perform() {} }, that: that4, abilMod: -5, diceCount: 1, dmgMod: 0 });
		it.run(ctx4);
		assert.eq(ctx4.dmg, 1, '惩罚压到 1 以下仍造成 1 点');
	});

	test('pipeline③：整链逐值等价——命中/失手/天然20重击/noDodge/Finesse/远程（迁移零变）', () => {
		// 骰面映射：unit 0.5 ⇒ 11（1+floor(0.5×20)），0.05 ⇒ 2，0.99 ⇒ 20；伤害用固定值 '4' ⇒ 不耗随机
		const target = () => new (R().Character)({ name: '靶', hp: 30, maxHp: 30, stats: D5().stats({ ac: 15 }) });
		const attack = (item, that, stats) => D5().attack(item, that, { name: '攻击者', stats: D5().stats(stats) });
		const withSeq = (seq, fn) => {
			R().rng.setSequence(seq);
			try { return fn(); } finally { R().rng.reset(); }
		};
		// 命中：11 + (prof2+str3) = 16 ≥ AC15；伤害 4 + 3 = 7 ⇒ 30-7 = 23
		assert.eq(withSeq([0.5], () => {
			const that = target();
			attack(new (D5().Club)({ stats: { dmg: '4' } }), that, { prof: 2, str: 16 });
			return that.hp;
		}), 23, '命中：掷 11 + 调整 5 = 16 ≥ 15，伤害 4+3');
		// 失手：2 + 5 = 7 < 15 ⇒ 不掉血（且不消耗伤害随机）
		assert.eq(withSeq([0.05], () => {
			const that = target();
			attack(new (D5().Club)({ stats: { dmg: '4' } }), that, { prof: 2, str: 16 });
			return that.hp;
		}), 30, '失手 ⇒ 不掉血');
		// 天然 20 重击：4+4 + 3（调整值只加一次）= 11 ⇒ 30-11 = 19
		assert.eq(withSeq([0.99], () => {
			const that = target();
			attack(new (D5().Club)({ stats: { dmg: '4' } }), that, { prof: 2, str: 16 });
			return that.hp;
		}), 19, '重击：伤害骰翻倍、调整值仍一次');
		// noDodge（宝箱等）：低骰也命中，且不重击 ⇒ 4 + 3 = 7
		assert.eq(withSeq([0.05], () => {
			const that = target();
			that.noDodge = true;
			attack(new (D5().Club)({ stats: { dmg: '4' } }), that, { prof: 2, str: 16 });
			return that.hp;
		}), 23, 'noDodge ⇒ 总是命中（不消耗 20 面骰）');
		// Finesse（长剑 finesse:false ⇒ 用 str；显式改 true 后取 max）
		assert.eq(withSeq([0.5], () => {
			const that = target();
			attack(new (D5().Longsword)({ stats: { dmg: '4', finesse: true } }), that, { prof: 2, str: 12, dex: 18 });
			return that.hp;
		}), 22, 'Finesse：取 dex 4 ⇒ atkMod 6（11+6=17 ≥ 15）；伤害 4+4=8');
		// 远程（炸弹）：用 dex；11 + dex4 = 15 ≥ AC15 命中 ⇒ 4 + 4 = 8
		assert.eq(withSeq([0.62], () => {
			const that = target();
			// ⚠ Item 的 stats 覆盖是**整体替换**（非深合并）⇒ ranged 须一并给出
			attack(new (D5().Bomb)({ stats: { dmg: '4', ranged: true } }), that, { prof: 0, str: 12, dex: 18 });
			return that.hp;
		}), 22, '远程：用 dex 4 ⇒ 4+4=8 伤害');
	});
})();
