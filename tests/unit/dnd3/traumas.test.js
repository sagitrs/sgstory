/* dnd3 跨场物理 debuff（创伤）的单元测试 —— #1780
 * 设计稿（规范句权威源）：`docs/plan/1780-dnd3-cross-battle-trauma.md`
 * 断言锚：稿 §七（每条用例标注其锚的规范句编号）
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;
	const mk = (over = {}) => new (R().Character)({ name: '靶', hp: 20, maxHp: 20, stats: { ac: -999 }, ...over });

	test('dnd3 trauma：条目表 4 条，均 persistent 且带 dc（T1–T6）', () => {
		const ids = Object.keys(D().Traumas);
		assert.eq(ids.length, 4, '4 条创伤');
		for (const id of ids) {
			const tr = D().Traumas[id];
			assert.eq(tr.scope, 'persistent', `${id} scope=persistent（T5）`);
			assert.ok(typeof tr.dc === 'number' && tr.dc > 0, `${id} 有解除 DC（H1）`);
		}
		// 注册面：gain 不抛 ⇒ 已在 Effect 注册表（✗ 未注册 id 会 EFFECT_UNKNOWN）
		const c = mk();
		for (const id of ids) {
			c.gain(id);
			assert.ok(c.contains(id), `${id} 可施加（注册成功）`);
		}
	});

	test('dnd3 trauma：无 duration 字段 ⇒ 不因回合流逝消失（T6）', () => {
		for (const [id, tr] of Object.entries(D().Traumas)) {
			assert.ok(!('duration' in tr), `${id} ✗ 声明 duration`);
		}
	});

	test('dnd3 trauma：施加优先级确定性——四输入各命中一条（A2）', () => {
		assert.eq(D().traumaForHit({ damage: 12, maxHp: 20 }), 'concussion', '伤害 ≥ maxHp/2 ⇒ 脑震荡');
		assert.eq(D().traumaForHit({ damage: 3, maxHp: 100 }), 'bleeding', '伤害 ≥ 3 ⇒ 失血');
		assert.eq(D().traumaForHit({ damage: 2, crushing: true }), 'fracture', '钝击类 ⇒ 骨裂');
		assert.eq(D().traumaForHit({ damage: 2 }), 'laceration', '默认 ⇒ 裂伤');
	});

	test('dnd3 trauma：幂等／非角色／倒地不施加（A3–A5）', () => {
		const c = mk();
		assert.eq(D().applyTrauma(c, 'laceration'), 'laceration', '首次施加成功');
		assert.eq(D().applyTrauma(c, 'laceration'), null, '已持有 ⇒ 幂等返回 null（A3）');
		assert.eq((c.effects ?? []).filter((x) => x === 'laceration').length, 1, '✗ 重复入表');
		assert.eq(D().applyTrauma({ name: '非角色' }, 'laceration'), null, '非 Character 不施加（A4）');
		const down = mk({ hp: 0 });
		assert.eq(D().applyTrauma(down, 'laceration'), null, '已倒地不施加（A5）');
	});

	test('dnd3 trauma：重击经 meleeAttack 施加（A1，集成）', () => {
		R().rng.set(() => 0.99);   // d20 = 20 ⇒ 重击威胁；确认掷亦 20 ⇒ 确认命中
		try {
			const target = mk({ maxHp: 50 });
			R().createItem('club').used(target, { stats: { bab: 20, str: 10 } });
			assert.ok(target.hp < 50, '确实命中了');
			const held = Object.keys(D().Traumas).filter((id) => target.contains(id));
			assert.eq(held.length, 1, `重击恰好施加一条（实得 ${held.join(',') || '无'}）`);
		} finally {
			R().rng.reset();
		}
	});

	test('dnd3 trauma：C1 裂伤——首回合攻击掷骰 −1，回合结束后恢复', () => {
		const c = mk();
		assert.eq(D().traumaAttackMod(c), 0, '无创伤 ⇒ 0');
		c.gain('laceration');
		assert.ok(D().inFirstBattleRound(), '开场即在首回合窗口内');
		assert.eq(D().traumaAttackMod(c), -1, '首回合 −1（C1）');
		R().events.emit('battle:turnEnd', { actor: c });
		assert.eq(D().inFirstBattleRound(), false, '回合结束 ⇒ 出首回合');
		assert.eq(D().traumaAttackMod(c), 0, '次回合恢复（C1）');
		R().events.emit('battle:end', { players: [c], enemies: [] });
		assert.ok(D().inFirstBattleRound(), 'battle:end ⇒ 复位（下一场重新算）');
		assert.eq(D().traumaAttackMod(c), -1, 'battle:end 后仍在首回合窗口 ⇒ −1');
		R().events.emit('battle:end', { players: [], enemies: [] });   // 交还给后续用例一个干净位
	});

	test('dnd3 trauma：C1 集成——首回合少 1 点命中面（判别构造）', () => {
		R().events.emit('battle:end', { players: [], enemies: [] });   // 复位首回合（用例间不污染）
		const run = (trauma) => {
			R().rng.set(() => 0.5);   // d20 = 11
			try {
				const target = mk({ stats: { ac: 16 } });
				const atk = mk({ stats: { ac: 10, str: 10, bab: 5 } });
				if (trauma) atk.gain(trauma);
				// bab 5 + str 10(+0) = 5 ⇒ 11+5=16 ≥ 16 命中；加裂伤 ⇒ 15 < 16 失手
				R().createItem('club').used(target, atk);
				return 20 - target.hp;
			} finally {
				R().rng.reset();
			}
		};
		assert.ok(run(null) > 0, '无创伤：11+5=16 ≥ AC 16 ⇒ 命中');
		assert.eq(run('laceration'), 0, '有裂伤：11+4=15 < 16 ⇒ 失手（C1 真生效）');
	});

	test('dnd3 trauma：C2 骨裂——近战伤害 −1（攻击掷骰不受）', () => {
		const c = mk();
		assert.eq(D().traumaDamageMod(c), 0, '无创伤 ⇒ 0');
		c.gain('fracture');
		assert.eq(D().traumaDamageMod(c), -1, '近战伤害 −1（C2）');
		assert.eq(D().traumaAttackMod(c), 0, '骨裂**不**作用于攻击掷骰（C2）');
		const run = (trauma) => {
			R().rng.set(() => 0.5);
			try {
				const target = mk({ hp: 50, maxHp: 50 });
				const atk = mk({ stats: { ac: 10, str: 14, bab: 20 } });
				if (trauma) atk.gain(trauma);
				R().createItem('club').used(target, atk);   // 必中
				return 50 - target.hp;
			} finally {
				R().rng.reset();
			}
		};
		const a = run(null), b = run('fracture');
		assert.eq(b, a - 1, `同一固定骰面下伤害恰少 1（无 ${a} vs 有 ${b}）`);
	});

	test('dnd3 trauma：C3 脑震荡——豁免掷骰 −1（进 total）', () => {
		const run = (trauma) => {
			R().rng.set(() => 0.5);   // 1d20 = 11
			try {
				const c = mk({ trauma, stats: { ac: 10, save_spells: 3 } });
				if (trauma) c.gain(trauma);
				return D().save(c, 'spells', 99);
			} finally {
				R().rng.reset();
			}
		};
		const a = run(null), b = run('concussion');
		assert.eq(a.total, 14, '无创伤：11+3=14');
		assert.eq(b.total, 13, '有脑震荡：11+3−1=13（C3）');
		assert.eq(b.mod, 3, '`mod` 保持「角色自身加值」语义（✗ 混入创伤罚）');
		assert.eq(b.trauma, -1, '创伤罚单列可断言');
	});

	test('dnd3 trauma：C4 失血——每场战斗开始 −1 HP（下限 1，不致死）', () => {
		const c = mk({ hp: 5 });
		c.gain('bleeding');
		assert.eq(D().tickBleeding([c]), 1, 'tick 一条');
		assert.eq(c.hp, 4, '−1');
		assert.eq(D().tickBleeding([c]), 1, '再 tick 仍 −1（结算由调用时机决定）');
		c.hp = 1;
		assert.eq(D().tickBleeding([c]), 0, 'HP 已到下限 ⇒ 不再扣');
		assert.eq(c.hp, 1, '不致死（下限 1，C4）');
		// 接线：本场首个 turnStart ⇒ 自动结算；第二个 turnStart ⇒ 不重复
		const d = mk({ hp: 8 });
		d.gain('bleeding');
		R().events.emit('battle:end', { players: [d], enemies: [] });   // 复位首回合
		R().events.emit('battle:turnStart', { actor: d });
		assert.eq(d.hp, 7, '首个 turnStart ⇒ −1（C4 接线）');
		R().events.emit('battle:turnEnd', { actor: d });
		R().events.emit('battle:turnStart', { actor: d });
		assert.eq(d.hp, 7, '次回合不再扣（每场一次）');
	});

	test('dnd3 trauma：H1 治疗检定——DC 边界与失败保留', () => {
		const run = (id, mod, held = true) => {
			R().rng.set(() => 0.5);   // 1d20 = 11
			try {
				const c = mk();
				if (held) c.gain(id);
				const r = D().treatTrauma(c, id, { mod });
				return { r, held: c.contains(id) };
			} finally {
				R().rng.reset();
			}
		};
		const ok = run('laceration', 4);          // dc 15 ⇒ 11+4=15 ≥ 15
		assert.ok(ok.r.ok, 'total == dc ⇒ 成功（3E 惯用）');
		assert.eq(ok.r.total, 15, 'total=15');
		assert.eq(ok.held, false, '成功后不再持有');
		const bad = run('laceration', 3);         // 14 < 15
		assert.eq(bad.r.ok, false, '差 1 ⇒ 失败');
		assert.eq(bad.r.dc, 15, '返回 DC 供调用方显示');
		assert.eq(bad.held, true, '失败 ⇒ **保留**（✗ 静默成功）');
		const missing = run('fracture', 99, false);
		assert.eq(missing.r.why, 'not-held', '未持有 ⇒ 显式 why');
		assert.eq(missing.r.removed, null, '未持有 ⇒ 无移除');
	});

	test('dnd3 trauma：H2 魔法治疗通路——只对声明 magicalCure 的条目（源 A/B）', () => {
		const c = mk();
		c.gain('bleeding');
		assert.eq(D().magicalCure(c, 'bleeding'), true, '失血可经魔法治疗解除（H2）');
		assert.eq(c.contains('bleeding'), false, '已移除');
		const d = mk();
		d.gain('fracture');
		assert.eq(D().magicalCure(d, 'fracture'), false, '骨裂 ✗ 走魔法治疗（须治疗检定）');
		assert.ok(d.contains('fracture'), '仍在持有');
	});

	test('dnd3 trauma：P1/P3 跨场存活——battle:end 不清 persistent（✗ 死代码对照）', () => {
		const c = mk();
		c.gain('laceration');
		c.gain('bleeding');
		const before = (c.effects ?? []).length;
		R().events.emit('battle:end', { players: [c], enemies: [] });
		assert.eq((c.effects ?? []).length, before, '`battle:end` 后条数不变（P1/P3）');
		assert.ok(c.contains('laceration') && c.contains('bleeding'), '两条仍在（跨场）');
	});

	test('dnd3 trauma：P4/P5 存档往返（E11）——id 存活且**罚仍生效**', () => {
		const c = mk();
		c.gain('laceration');
		c.gain('concussion');
		// E11 判据：不论何机制实现，只要不经 JSON.stringify 存活 ⇒ 必红
		const snap = JSON.parse(JSON.stringify(c.toJSON()));
		const back = R().Character.revive(snap);
		assert.ok(back.contains('laceration'), 'E11：裂伤 id 往返存活（P4）');
		assert.ok(back.contains('concussion'), 'E11：脑震荡 id 往返存活（P4）');
		// 语义存活 ≠ 值往返相等：罚须仍生效（P5）
		assert.eq(D().traumaAttackMod(back), -1, '往返后攻击罚仍生效');
		R().rng.set(() => 0.5);
		try {
			const holder = mk({ stats: { ac: 10 } });
			holder.gain('concussion');                 // 须**真持有**（✗ 只传属性字段）
			const s = D().save(holder, 'spells', 99);
			assert.eq(s.total, 10, '11+0−1（罚仍生效）');
		} finally {
			R().rng.reset();
		}
		assert.eq(D().traumaSaveMod(back), -1, '往返后豁免罚仍在（P5）');
	});

	test('dnd3 trauma：P6 respawn ⇒ 创伤全清（#1760 裁定⑤的既有语义）', () => {
		const c = mk({ items: [] });
		c.gain('laceration');
		c.gain(R().death);
		const r = R().respawn(c, {});
		assert.ok(r.cleared >= 1, `清档通路在跑（cleared=${r.cleared}）`);
		assert.eq(c.contains('laceration'), false, '死亡 ⇒ 创伤被清（裁定⑤，含 persistent）');
		assert.eq(c.contains(R().death), false, 'death 标记另行清除（裁定⑥）');
	});
})();
