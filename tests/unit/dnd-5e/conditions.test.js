/* dnd-5e Conditions 条件面（#1689 P1 · #1741）的单元测试
 *
 * 判据形态（承 #1689 §八）：断言**模式**（'advantage'|'disadvantage'|'normal'）而非掷值；
 * 掷骰面一律注入固定序列（RPG.rng.setSequence）或判定必成/必败条件。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND5E;

	const C = (effects = [], extra = {}) =>
		Object.assign(new (R().Character)({ name: '甲', hp: 10, maxHp: 10, stats: D().stats() }), { effects }, extra);

	/* ---------- ① 声明表：15 条齐、逐条引源、字段闭合 ---------- */

	// 出处：SRD 5.2.1 · rules-glossary.md:255（首个 [Condition] 标题行；全表 15 条见 conditions.js 逐条引源）
	test('conditions：声明表恰 15 条，与源 Condition 条目集一一对应', () => {
		const ids = Object.keys(D().Conditions).sort();
		assert.eq(ids.length, 15, '15 条（SRD rules-glossary.md 的 15 个 [Condition] 条目）');
		assert.eq(JSON.stringify(ids), JSON.stringify([
			'blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled', 'incapacitated',
			'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious',
		]), '条目名与源一致');
	});

	test('conditions：每条的声明字段都落在「有消费点」的闭集内（无死字段）', () => {
		// 消费点：rollMode 读 4 个 mode 字段；canAct 读 inactive；clearBattleScoped 读 scope；
		// tickTurnDurations 读 duration；saveEnd 由原语读；levels 由 effectLevelOfId 读。
		const allowed = new Set([
			'selfRollMode', 'targetRollMode', 'targetMelee', 'targetRanged',
			'inactive', 'scope', 'duration', 'saveEnd', 'levels',
			'id', 'name', 'desc', 'kind',
		]);
		for (const [id, cond] of Object.entries(D().Conditions)) {
			for (const k of Object.keys(cond)) {
				assert.ok(allowed.has(k), `「${id}」的字段 ${k} 须有消费点（或在闭集内）`);
			}
		}
		// 反向：mode 字段取值只能是两档之一（防拼写错）
		for (const [id, cond] of Object.entries(D().Conditions)) {
			for (const f of ['selfRollMode', 'targetRollMode', 'targetMelee', 'targetRanged']) {
				if (cond[f] !== undefined) {
					assert.ok(['advantage', 'disadvantage'].includes(cond[f]), `「${id}」.${f} 取值合法`);
				}
			}
		}
	});

	test('conditions：desc 是对玩家的契约面 —— 未实现的面必须显式标注（#1758 MAJOR-1 判据）', () => {
		// 判据形：声明表已实现的字段 ⇒ desc 可写；表内**未落**的面（被注释自认归 Pn）
		// 必须在 desc 里带「未实现」标注，不得写成生效承诺。
		const UNIMPLEMENTED = {
			charmed: '禁攻', deafened: '听觉', frightened: '不能靠近', paralyzed: '自动暴击',
			petrified: '全抗', restrained: '豁免劣势', stunned: '豁免必败', unconscious: '自动暴击',
		};
		for (const [id, word] of Object.entries(UNIMPLEMENTED)) {
			const desc = R().effectOf(id).desc;
			assert.ok(desc.includes('未实现'), `「${id}」的 desc 须显式标注未实现（玩家契约面）`);
			assert.ok(desc.includes(word), `「${id}」的 desc 须点明未实现的是「${word}」面`);
		}
		// 对照：grappled 用了「简化」而非「未实现」（同族形态也须标注）——防两类标注都丢失
		assert.ok(R().effectOf('grappled').desc.includes('简化'), 'grappled 的简化须标注');
		// 已实现的面不得被误标（防「一律加未实现」蒙混）
		for (const id of ['blinded', 'invisible', 'poisoned', 'prone', 'incapacitated']) {
			assert.ok(!R().effectOf(id).desc.includes('未实现'), `「${id}」已实现 ⇒ 不得标未实现`);
		}
	});

	test('conditions：定义已注册进 Effect 注册表（单层权威：注册即实例、声明字段随之挂载）', () => {
		for (const id of Object.keys(D().Conditions)) {
			const def = R().effectOf(id);
			assert.eq(def.id, id, `${id} 已注册`);
			// 声明字段确实挂在实例上（#1727 F2 的全字段挂载）——这是「一层」成立的前提
			for (const [k, v] of Object.entries(D().Conditions[id])) {
				assert.eq(def[k], v, `${id}.${k} 随注册挂载`);
			}
		}
	});

	/* ---------- ② rollMode：双向分池（逐条用例的源行见 conditions.js 各条注释） ---------- */

	// 出处：SRD 5.2.1 · rules-glossary.md:261（blinded「Attack rolls against you have Advantage,
	//   and your attack rolls have Disadvantage」）—— 其余各条的效应用语行见 conditions.js 表内注释
	test('conditions：rollMode 双向分池 —— 自身/来犯/条件性', () => {
		const run = (aEff, dEff, ctx) => D().rollMode(C(aEff), C(dEff), ctx);
		// 自身掷骰面（selfRollMode）
		assert.eq(run(['blinded'], []), 'disadvantage', 'blinded H255/E261 自身劣势');
		assert.eq(run(['invisible'], []), 'advantage', 'invisible H988/E996 自身优势');
		assert.eq(run(['poisoned'], []), 'disadvantage', 'poisoned H1169/E1173');
		assert.eq(run(['restrained'], []), 'disadvantage', 'restrained H1214/E1220');
		assert.eq(run(['frightened'], []), 'disadvantage', 'frightened H816/E820');
		assert.eq(run(['grappled'], []), 'disadvantage', 'grappled H824/E830（简化：无条件）');
		assert.eq(run(['prone'], []), 'disadvantage', 'prone H1183/E1189 自身劣势');
		// 对来犯者（targetRollMode）
		assert.eq(run([], ['blinded']), 'advantage', 'blinded 对来犯优势');
		assert.eq(run([], ['invisible']), 'disadvantage', 'invisible 对来犯劣势（原稿曾错给优势）');
		assert.eq(run([], ['paralyzed']), 'advantage', 'paralyzed H1123/E1133');
		assert.eq(run([], ['petrified']), 'advantage', 'petrified H1147/E1157');
		assert.eq(run([], ['restrained']), 'advantage', 'restrained H1214/E1220');
		assert.eq(run([], ['stunned']), 'advantage', 'stunned H1419/E1427');
		assert.eq(run([], ['unconscious']), 'advantage', 'unconscious H1503/E1511');
		// 自身无掷骰面的条：poisoned 只罚自身 ⇒ 作为受方不影响来犯
		assert.eq(run([], ['poisoned']), 'normal', 'poisoned 作为受方 ⇒ 不影响来犯');
		// 条件性（prone：5 尺内优势，否则劣势）
		assert.eq(run([], ['prone'], { melee: true }), 'advantage', 'prone 近战 ⇒ 优势');
		assert.eq(run([], ['prone'], { melee: false }), 'disadvantage', 'prone 远程 ⇒ 劣势');
		// 相消：adv + dis ⇒ normal（正例＝攻方 invisible ＋ 受方 invisible）
		assert.eq(run(['invisible'], ['invisible']), 'normal', 'adv＋dis 相消');
		// 双劣势不构成相消（原稿的错例）
		assert.eq(run(['blinded'], ['invisible']), 'disadvantage', '双劣势 ⇒ 仍劣势');
	});

	test('conditions：rollMode 对层级 id 与未持有者都按 base 查表（不因层级而失配）', () => {
		const c = C(['exhaustion:3']);
		assert.eq(D().rollMode(c, C([])), 'normal', 'exhaustion 无掷骰面');
		assert.eq(D().rollMode(C([]), C([])), 'normal', '双方无条件 ⇒ normal');
	});

	/* ---------- ③ canAct：派生式 ---------- */

	test('conditions：canAct 派生自声明表（inactive 的 5 条；exhaustion 不夺行动权）', () => {
		assert.eq(D().canAct(C([])), true, '无条件 ⇒ 可行动');
		for (const id of ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious']) {
			assert.eq(D().canAct(C([id])), false, `${id} ⇒ 不能行动`);
		}
		assert.eq(D().canAct(C(['exhaustion:3'])), true, '力竭 3 级 ⇒ 仍可行动（仅 D20 Test 惩罚）');
		assert.eq(D().canAct(C(['blinded'])), true, 'blinded 不夺行动权');
	});

	/* ---------- ④ scope 两档：三判据（跨场仍存／本场清除／persistent 不受影响） ---------- */

	test('conditions scope：battle 档在 battle:end 清除；persistent 跨场保留（#1730 三判据）', () => {
		const c = C(['blinded', 'poisoned']);
		// 判据③：persistent 不受 battle:end 影响（先于判据②断言，防"全清"蒙混）
		assert.eq(D().clearBattleScoped(c).length, 1, '仅 battlescope 的一条被清');
		assert.eq(JSON.stringify(c.effects), '["poisoned"]', 'persistent（poisoned）跨场仍存');
		assert.eq(c.contains('blinded'), false, 'battle 档（blinded）已清');
		// 判据①：persistent 在「无战斗」时也仍在（跨场语义）
		const p = C(['exhaustion:2', 'petrified']);
		assert.eq(D().clearBattleScoped(p).length, 0, '无 battle 档 ⇒ 清 0 条');
		assert.eq(JSON.stringify(p.effects), '["exhaustion:2","petrified"]', 'persistent 全保留');
		// 判据②：本场清除（经真实事件通路，非直调）
		const q = C(['stunned', 'poisoned']);
		R().events.emit('battle:end', { players: [q], enemies: [] });
		assert.eq(JSON.stringify(q.effects), '["poisoned"]', 'battle:end 事件触发清除');
	});

	test('conditions scope：scope 缺省即 persistent（显式声明的例外才随场清）', () => {
		// 声明表内每条 scope 都是显式值（无缺省歧义）；此处验证表内分布与 SRD 的关系
		const battle = Object.entries(D().Conditions).filter(([, c]) => c.scope === 'battle').map(([i]) => i);
		const persist = Object.entries(D().Conditions).filter(([, c]) => c.scope === 'persistent').map(([i]) => i);
		assert.eq(battle.length + persist.length, 15, '每条都有显式 scope（无缺省）');
		// 唯一有 SRD 明文支撑的 persistent 是 exhaustion（:784 长休减级）
		assert.ok(persist.includes('exhaustion'), 'exhaustion 是 persistent');
		assert.eq(persist.length, 3, 'persistent 三条：exhaustion（有源）+ petrified/poisoned（house rule）');
	});

	/* ---------- ⑤ duration：回合计数 ---------- */

	test('conditions duration：duration:turn 的按回合计，归零即移除；无 duration 者不流逝', () => {
		const c = C(['blinded', 'poisoned']);
		D().gainCondition(c, 'blinded', { turns: 2 });
		assert.eq(c.effectTurns.blinded, 2, '登记 2 回合');
		D().tickTurnDurations(c);
		assert.eq(c.effectTurns.blinded, 1, '回合末 -1');
		assert.eq(c.contains('blinded'), true, '仍有剩余 ⇒ 保留');
		D().tickTurnDurations(c);
		assert.eq(c.contains('blinded'), false, '归零 ⇒ 移除');
		assert.eq(c.contains('poisoned'), true, 'poisoned 无 duration ⇒ 不流逝');
		// 经真实事件通路（battle:turnEnd）也生效
		const d = C([]);
		D().gainCondition(d, 'stunned', { turns: 1 });
		R().events.emit('battle:turnEnd', { actor: d });
		assert.eq(d.contains('stunned'), false, 'turnEnd 事件触发流逝');
	});

	test('conditions duration：回合数随存档往返（effectTurns 是纯数据）', () => {
		const c = C([]);
		D().gainCondition(c, 'blinded', { turns: 3 });
		const snap = c.toJSON();
		assert.eq(snap.effectTurns.blinded, 3, 'effectTurns 进快照');
	});

	/* ---------- ⑥ saveEnd：三态（成功移除／失败保留／未持有幂等） ---------- */

	test('conditions saveEnd：三态各自独立断言（成功⇒移除／失败⇒返回 false 且保留／未持有⇒幂等 true）', () => {
		const run = (rollUnit, eff) => {
			R().rng.setSequence([rollUnit]);
			try {
				const c = C(eff);
				return { ok: D().saveEnd(c, 'frightened', 10), effects: [...c.effects] };
			} finally {
				R().rng.reset();
			}
		};
		// 未持有 ⇒ 幂等 true，不掷骰（序列不被消耗）
		R().rng.setSequence([0.5, 0.5]);
		try {
			assert.eq(D().saveEnd(C([]), 'frightened', 10), true, '未持有 ⇒ true');
			assert.eq(R().rng.pick(20), 11, '未持有 ⇒ 未掷骰（注入值未被消耗）');
		} finally { R().rng.reset(); }
		// 成功（掷 20 ≥ DC 10）⇒ 移除
		const win = run(0.99, ['frightened']);
		assert.eq(win.ok, true, '豁免成功');
		assert.eq(JSON.stringify(win.effects), '[]', '成功 ⇒ 该条被移除');
		// 失败（掷 1 < DC 10）⇒ 返回 false **且** 该条仍在（返回值与状态是两个可独立出错的面）
		const lose = run(0.0, ['frightened']);
		assert.eq(lose.ok, false, '豁免失败');
		assert.eq(JSON.stringify(lose.effects), '["frightened"]', '失败 ⇒ 该条**保留**');
	});

	test('conditions saveEnd：非豁免型 ⇒ null（不掷骰）；层级条件精确移除一层', () => {
		assert.eq(D().saveEnd(C(['blinded']), 'blinded'), null, 'blinded 无 saveEnd ⇒ null');
		// 层级条件（house rule 用法）：只移除被判定的那一层
		D().Conditions.exhaustion.saveEnd = { ability: 'con' };   // 临时声明（用例内）
		try {
			R().rng.setSequence([0.99]);
			try {
				const c = C(['exhaustion:3']);
				assert.eq(D().saveEnd(c, 'exhaustion:3', 10), true, '豁免成功');
				assert.eq(JSON.stringify(c.effects), '[]', '精确移除该层');
			} finally { R().rng.reset(); }
		} finally { delete D().Conditions.exhaustion.saveEnd; }
	});

	/* ---------- ⑦ 死亡⇒全档清零 ---------- */

	test('conditions 死亡清零：clearEffectsOnDeath 本体保留 death（直断言，不经 grantDeathIfDown）', () => {
		// 直调本体：若它连 death 一起清 ⇒ 绷带复活的 contains(death) 前提被破坏
		const c = C(['death', 'poisoned', 'blinded']);
		const n = D().clearEffectsOnDeath(c);
		assert.eq(n, 2, '报告清掉 2 条');
		assert.eq(JSON.stringify(c.effects), '["death"]', 'death 本身保留');
		assert.eq(D().clearEffectsOnDeath(c), 0, '只剩 death ⇒ 清除数为 0（幂等）');
	});

	test('conditions 死亡清零：全档清空（含 persistent）但**保留 death 标记**', () => {
		const c = C(['poisoned', 'exhaustion:2', 'blinded']);
		D().gainCondition(c, 'blinded', { turns: 2 });
		c.hp = 0;
		D().grantDeathIfDown(c);
		assert.eq(JSON.stringify(c.effects), '["death"]', '其余全清、death 保留（复活依赖 contains(death)）');
		assert.eq(JSON.stringify(c.effectTurns), '{}', '回合数一并清零');
		// 幂等：death 已在 ⇒ 不重复施加、也不误清
		c.gain('poisoned');
		D().grantDeathIfDown(c);
		assert.eq(JSON.stringify(c.effects), '["death","poisoned"]', '已死亡 ⇒ 不再触发清档');
	});

	test('conditions：死亡清档与绷带复活可衔接（复活后 death 可被移除）', () => {
		const c = C(['poisoned']);
		c.hp = 0;
		D().grantDeathIfDown(c);
		assert.eq(c.contains(R().death), true, '死亡标记在');
		c.hp = 5;
		c.lose(R().death);
		assert.eq(c.contains(R().death), false, '复活可移除标记');
		assert.eq(JSON.stringify(c.effects), '[]', '复活后无残留（清档已发生）');
	});

	/* ---------- ⑧ 集成：rollMode 进管线、canAct 进闸门 ---------- */

	test('conditions 集成：5e.mode 阶段接 rollMode（攻方目盲 ⇒ 管线取劣势骰）', () => {
		const that = { name: '靶', stats: D().stats({ ac: 30 }), hp: 10 };
		const item = new (D().Club)({ stats: { dmg: '1' } });
		item.perform = () => {};
		const from = C(['blinded']);
		const ctx = {
			item, that, from, melee: true, ranged: false,
			abilMod: 0, prof: 0, atkMod: 0, ac: 30, rollMode: 'normal', die: null,
			hit: null, crit: false, diceCount: 1, dmgMod: 0, dmg: 0, done: false, roll: () => 10,
		};
		const st = R().pipelineOf('dnd-5e.attack').stages.find((s) => s.id === '5e.mode');
		st.run(ctx);
		assert.eq(ctx.rollMode, 'disadvantage', 'blinded 攻方 ⇒ 劣势模式进 ctx');
	});

	test('conditions 集成：turnStart 闸门 —— 失能角色被拦（dnd3 角色不受影响）', () => {
		// 5E 侧：失能 ⇒ 拦
		const p5 = C(['paralyzed']);
		const gate5 = R().turnBoundary.start({ actor: p5, battle: null });
		assert.eq(gate5.cancel, true, '5E 失能 ⇒ 闸门拦下');
		assert.eq(gate5.reason, '失能', '原因已给');
		// 非失能 ⇒ 放行
		assert.eq(R().turnBoundary.start({ actor: C(['blinded']), battle: null }).cancel, false, '非失能 ⇒ 放行');
		// dnd3 侧（stats 用 bab）⇒ 本包不接管（负例：跨包不受影响）
		const c3 = Object.assign(new (R().Character)({ name: '三段角色', stats: { ac: 12, bab: 1 } }), { effects: ['paralyzed'] });
		assert.eq(R().turnBoundary.start({ actor: c3, battle: null }).cancel, false, 'dnd3 角色不被本包拦截');
	});
})();
