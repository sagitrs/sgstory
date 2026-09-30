/* core/17-effect + 20-character 效果面（注册/归一化/层级）的单元测试 —— #1713 契约①
 *
 * 失败形态断言用**本地助手**（TryErrCode）读 `err.code`：消息文本只作辅助，判据落在 code 上
 * （`#1721` 的 `assert.throws(fn, msg, expect?)` 到位后可把助手换成匹配器形态，断言集合不变）。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	/** 跑 fn，返回 `err.code`；未抛错返回 null（＝「抛了就过」的反面：必须抛对的那一条） */
	const TryErrCode = (fn) => {
		try {
			fn();
			return null;
		} catch (e) {
			return e && e.code ? e.code : `(无 code：${e && e.message})`;
		}
	};

	/** console 探针：临时替换某方法，收集调用后**必定还原** */
	const probeConsole = (method, fn) => {
		const orig = console[method];
		const calls = [];
		console[method] = (...args) => { calls.push(args); };
		try {
			fn();
		} finally {
			console[method] = orig;
		}
		return calls;
	};

	/** 每个用例用**独立 id** 注册，避免注册表跨用例残留（harness 只复位 State 与 rng） */
	const fresh = (id, extra = {}) =>
		R().defEffect({ id, name: `测试-${id}`, ...extra });

	test('effect：defEffect 返回定义单例并登记注册表；core 的 death 已注册', () => {
		const e = fresh('u-singleton');
		assert.ok(e instanceof R().Effect, '返回 Effect 实例');
		assert.eq(R().effectOf('u-singleton'), e, 'effectOf 取回同一单例');
		assert.eq(e.id, 'u-singleton');
		assert.ok(R().effects.has('u-singleton'), '注册表按 id 登记');
		assert.eq(R().death.id, 'death', 'core 自带 death 定义');
		assert.eq(R().effectOf('death').constructor.name, 'Debuff', 'death 是 Debuff');
		assert.ok(R().effectOf('death').desc, 'death 的定义字段随注册挂载（文案属 core，零 pack 依赖）');
	});

	test('effect：defEffect 挂载 def 的**全部**字段（F2 直断言；含声明字段与 hooks/levels）', () => {
		const def = {
			id: 'u-fields', name: '字段', desc: '说明',
			selfRollMode: 'disadvantage', targetRollMode: 'advantage',
			levels: { min: 1, max: 6 },
			hooks: { onTurnEnd() { return 'ok'; } },
		};
		const e = fresh('u-fields', def);
		// 子集方向（def 的键全部在实例上）——不是双向相等：name/desc 有缺省补全
		for (const k of Object.keys(def)) assert.ok(k in e, `实例应挂载 def 字段：${k}`);
		assert.eq(R().effectOf('u-fields').selfRollMode, 'disadvantage', '直断言 selfRollMode');
		assert.eq(R().effectOf('u-fields').hooks.onTurnEnd(), 'ok', '直断言 hooks 可调用');
		assert.eq(R().effectOf('u-fields').levels.max, 6, '直断言 levels');
		// 缺省补全：name 缺省为 id、desc 缺省为 ''（绕过 fresh，直接最小 def）
		const minimal = R().defEffect({ id: 'u-minimal' });
		assert.eq(minimal.name, 'u-minimal', 'name 缺省 = id');
		assert.eq(minimal.desc, '', "desc 缺省 = ''");
	});

	test('effect：defEffect 重复 id ⇒ console.warn + 覆盖（console 探针判）', () => {
		const first = fresh('u-dup', { name: '前' });
		const calls = probeConsole('warn', () => fresh('u-dup', { name: '后' }));
		assert.eq(calls.length, 1, '重复注册恰好 warn 一次');
		assert.ok(String(calls[0][0]).includes('u-dup'), '警告含 id');
		assert.eq(R().effectOf('u-dup').name, '后', '后者覆盖前者');
		assert.ok(first !== R().effectOf('u-dup'), '不是同一实例（确为覆盖）');
	});

	test('effect：归一化三形态等价——id 串 / 定义单例 / 层级 id', () => {
		const def = fresh('u-norm');
		fresh('u-lvl', { levels: { min: 1, max: 6 } });
		assert.eq(R().resolveEffect('u-norm'), 'u-norm', 'id 串');
		assert.eq(R().resolveEffect(def), 'u-norm', '定义单例 → 同一 id 串');
		assert.eq(R().resolveEffect('u-lvl:3'), 'u-lvl:3', '层级 id');
		assert.eq(R().effectOf('u-lvl:3'), R().effectOf('u-lvl'), '层级 id 的 def 取 base');
		// 两入口后缀状态等价（T 审点：同一断言面覆盖两种入口）
		const a = new (R().Character)({ name: '甲' });
		const b = new (R().Character)({ name: '乙' });
		a.gain(def); b.gain('u-norm');
		assert.eq(JSON.stringify(a.effects), JSON.stringify(b.effects), '实例入口与 id 入口后缀等价');
		assert.eq(a.contains(def), b.contains('u-norm'), 'contains 两入口等价');
	});

	test('effect：层级效果是原子升降级——同 base 至多一条（裁定 ★①甲）', () => {
		fresh('u-ex', { levels: { min: 1, max: 6 } });
		const c = new (R().Character)({ name: '甲' });
		c.gain('u-ex:3');
		assert.eq(JSON.stringify(c.effects), '["u-ex:3"]', '首次入层');
		c.gain('u-ex:3');
		assert.eq(c.effects.length, 1, '同层幂等');
		c.gain('u-ex:4');
		assert.eq(JSON.stringify(c.effects), '["u-ex:4"]', '新层自动移除旧层（原子升降级）');
		assert.eq(c.effectLevel('u-ex'), 4, 'effectLevel 单值承诺成立');
		// 与其它效果共存时只影响同 base
		fresh('u-other');
		c.gain('u-other');
		c.gain('u-ex:6');
		assert.eq(JSON.stringify(c.effects), '["u-other","u-ex:6"]', '只清同 base 的层级');
	});

	test('effect：层级效果只作用于自身角色（定义单例不持有状态）', () => {
		fresh('u-iso', { levels: { min: 1, max: 6 } });
		const a = new (R().Character)({ name: '甲' });
		const b = new (R().Character)({ name: '乙' });
		a.gain('u-iso:3'); b.gain('u-iso:5');
		assert.eq(a.effectLevel('u-iso'), 3, '甲 3 级');
		assert.eq(b.effectLevel('u-iso'), 5, '乙 5 级');
		a.gain('u-iso:4');
		assert.eq(b.effectLevel('u-iso'), 5, '甲升降级不影响乙');
		assert.eq(a.contains('u-iso:5'), false, '甲不含乙的层数');
	});

	test('effect：层级读语义——精确层 / 任一层（严格前缀）/ 级别读入口', () => {
		fresh('u-sem', { levels: { min: 1, max: 6 } });
		const c = new (R().Character)({ name: '甲' });
		assert.eq(c.effectLevel('u-sem'), 0, '未持有 ⇒ 0');
		assert.eq(c.contains('u-sem'), false, '未持有 ⇒ false');
		c.gain('u-sem:3');
		assert.eq(c.contains('u-sem:3'), true, '精确层命中');
		assert.eq(c.contains('u-sem:2'), false, '其它层不命中');
		assert.eq(c.contains('u-sem'), true, '裸 base ⇒ 任一层为真');
		assert.eq(c.effectLevel('u-sem'), 3, '级数读数');
		// 严格前缀负例：'u-semFoo' 不得被 'u-sem' 命中（M①9 的判据）
		const x = new (R().Character)({ name: '乙' });
		x.effects = ['u-semFoo'];
		assert.eq(x.contains('u-sem'), false, 'exhaustionFoo 族不得命中');
		assert.eq(x.effectLevel('u-sem'), 0, '同上：级数也不得被同前缀噪声命中');
	});

	test('effect：lose 精确一层 / 裸 base 移除全部层级', () => {
		fresh('u-lose', { levels: { min: 1, max: 6 } });
		const c = new (R().Character)({ name: '甲' });
		c.gain('u-lose:2');
		c.lose('u-lose:3');
		assert.eq(c.effectLevel('u-lose'), 2, '未持有的层：幂等无副作用');
		c.lose('u-lose:2');
		assert.eq(JSON.stringify(c.effects), '[]', '精确移除该层');
		c.gain('u-lose:5'); c.gain('u-lose:2'); // 手造多层级（绕过原子升降级，模拟旧档）
		c.lose('u-lose');
		assert.eq(JSON.stringify(c.effects), '[]', '裸 base ⇒ 移除全部层级');
		assert.eq(c.contains('u-lose'), false, '清空后可判');
	});

	test('effect：失败形态各归其 code（err.code 判据，非「抛了就过」）', () => {
		fresh('u-fail');
		fresh('u-faillv', { levels: { min: 1, max: 6 } });
		const c = new (R().Character)({ name: '甲' });
		// 形态非法（含零参 / '' / 0 / 纯对象 / 数组）
		assert.eq(TryErrCode(() => c.contains()), 'EFFECT_BAD_REF', '零参');
		assert.eq(TryErrCode(() => c.contains('')), 'EFFECT_BAD_REF', '空串');
		assert.eq(TryErrCode(() => c.contains(0)), 'EFFECT_BAD_REF', '数字');
		assert.eq(TryErrCode(() => c.contains(null)), 'EFFECT_BAD_REF', 'null');
		assert.eq(TryErrCode(() => c.gain({ id: 'u-fail' })), 'EFFECT_BAD_REF', '纯对象（声明层对象）');
		assert.eq(TryErrCode(() => c.gain(['u-fail'])), 'EFFECT_BAD_REF', '数组');
		// 未注册
		assert.eq(TryErrCode(() => c.contains('u-nope')), 'EFFECT_UNKNOWN', '未注册（contains）');
		assert.eq(TryErrCode(() => c.gain('u-nope')), 'EFFECT_UNKNOWN', '未注册（gain）');
		assert.eq(TryErrCode(() => c.lose('u-nope')), 'EFFECT_UNKNOWN', '未注册（lose）');
		// 层级面
		assert.eq(TryErrCode(() => c.gain('u-faillv')), 'EFFECT_LEVEL_REQUIRED', '层级 base 缺层数');
		assert.eq(TryErrCode(() => c.gain('u-faillv:0')), 'EFFECT_LEVEL_RANGE', '越域（下界）');
		assert.eq(TryErrCode(() => c.gain('u-faillv:7')), 'EFFECT_LEVEL_RANGE', '越域（上界）');
		assert.eq(TryErrCode(() => c.gain('u-faillv:03')), 'EFFECT_LEVEL_SYNTAX', '非规范（前导零）');
		assert.eq(TryErrCode(() => c.gain('u-faillv:3.0')), 'EFFECT_LEVEL_SYNTAX', '非规范（小数）');
		assert.eq(TryErrCode(() => c.gain('u-fail:2')), 'EFFECT_NO_LEVELS', '非层级 base 带 :');
		assert.eq(TryErrCode(() => c.effectLevel('u-fail')), 'EFFECT_NO_LEVELS', 'effectLevel 用于非层级');
		// 未注册消息**只到 id 为止**，列表在字段里（D §四.1 收敛主张）
		let err = null;
		try { c.contains('u-nope'); } catch (e) { err = e; }
		assert.ok(err.message.startsWith('未注册的效果 id「u-nope」'), '消息前缀不含注册列表');
		assert.ok(!err.message.includes('u-fail'), '消息内不得出现其它 id');
		assert.ok(Array.isArray(err.registeredIds) && err.registeredIds.includes('u-fail'), '列表移入 registeredIds 字段');
	});

	test('effect：defEffect 定义非法 ⇒ 各归其 code（id / levels / hooks 键）', () => {
		assert.eq(TryErrCode(() => R().defEffect()), 'DEFEFFECT_BAD_ID', '零参');
		assert.eq(TryErrCode(() => R().defEffect({})), 'DEFEFFECT_BAD_ID', '缺 id');
		assert.eq(TryErrCode(() => R().defEffect({ id: '' })), 'DEFEFFECT_BAD_ID', '空 id');
		assert.eq(TryErrCode(() => R().defEffect({ id: 7 })), 'DEFEFFECT_BAD_ID', 'id 非字符串');
		assert.eq(TryErrCode(() => R().defEffect({ id: 'u-x:2' })), 'DEFEFFECT_BAD_ID', 'id 自带层数');
		assert.eq(TryErrCode(() => R().defEffect({ id: 'u-x', levels: {} })), 'DEFEFFECT_BAD_LEVELS', 'levels 不完整');
		assert.eq(TryErrCode(() => R().defEffect({ id: 'u-x', levels: { min: 0, max: 3 } })), 'DEFEFFECT_BAD_LEVELS', 'levels 下界 0');
		assert.eq(TryErrCode(() => R().defEffect({ id: 'u-x', hooks: { onTurnend() {} } })), 'DEFEFFECT_BAD_HOOK', 'hooks 未知键（大小写）');
		assert.eq(TryErrCode(() => R().defEffect({ id: 'u-x', hooks: { onTurnEnd: 1 } })), 'DEFEFFECT_BAD_HOOK', 'hook 非函数');
		// 合法 hooks 键不抛
		assert.ok(fresh('u-hook-ok', { hooks: { onTurnStart() {}, onTurnEnd() {} } }), '合法 hooks 通过');
	});

	test('effect：contains 数组分支（道具检索）语义零改——逐值等价', () => {
		const c = new (R().Character)({
			name: '甲', items: [{ id: 'club', equipped: true }, { id: 'coin' }],
		});
		fresh('u-items');
		// 逐值等价：返回还原后的实例，未命中返回 null（非 false、非首个道具）
		const hit = c.contains(['weapon', 'equipped']);
		assert.eq(hit.id, 'club', '命中返回该道具实例');
		assert.eq(hit.constructor.name, 'Item:club', '返回的是还原后的实例（非快照）');
		assert.eq(c.contains(['weapon', 'equipped', 'xxx']), null, '未命中返回 null');
		assert.eq(c.contains([]).id, 'club', '空数组 ⇒ props 全真 ⇒ 首个道具');
		// 与效果面互不干扰：持有效果不影响道具检索
		c.gain('u-items');
		assert.eq(c.contains(['weapon', 'equipped']).id, 'club', '持有效果后道具检索不变');
	});

	test('effect：存档往返——effects 仍是纯字符串数组，含层级 id（N①‑4 键集断言）', () => {
		fresh('u-rt', { levels: { min: 1, max: 6 } });
		const c = new (R().Character)({ name: '甲', hp: 7, maxHp: 9 });
		c.gain('u-rt:3'); c.gain(R().death);
		const snap = c.toJSON();
		assert.eq(JSON.stringify(Object.keys(snap).sort()), '["effects","hp","items","maxHp","name","properties","stats"]', '键集不变');
		assert.ok(Array.isArray(snap.effects) && snap.effects.every((x) => typeof x === 'string'), 'effects 是纯字符串数组');
		assert.eq(JSON.stringify(snap.effects), '["u-rt:3","death"]', '层级 id 原样存');
		const back = R().Character.revive(snap);
		assert.eq(JSON.stringify(back.effects), JSON.stringify(snap.effects), 'revive 后逐值相同');
		assert.eq(back.effectLevel('u-rt'), 3, '级数随 id 串还原');
		assert.eq(back.contains(R().death), true, '实例入口在还原后仍可判');
	});

	test('effect：revive 遇未注册/不可解释 id ⇒ 警告不抛、id 保真保留（F3 / N①‑5）', () => {
		const snap = {
			name: '旧档角色', hp: 5, maxHp: 5, stats: {}, items: [], properties: [],
			effects: ['u-unknown-old', 'u-lv:9', 'u-lv:03'],
		};
		fresh('u-lv', { levels: { min: 1, max: 6 } });
		let back = null;
		const calls = probeConsole('warn', () => { back = R().Character.revive(snap); });
		assert.eq(JSON.stringify(back.effects), JSON.stringify(snap.effects), '未经注册表解释的 id 全部保真保留');
		assert.ok(calls.length >= 3, `三条不可解释 id 各警告一次（实收 ${calls.length}）`);
		assert.ok(String(calls[0][0]).includes('u-unknown-old'), '警告含 id');
		// 数据保真：再次往返不丢
		assert.eq(JSON.stringify(R().Character.revive(back.toJSON()).effects), JSON.stringify(snap.effects), '往返保真');
		// 合法 id 不警告（对照组）
		const okSnap = { name: '新档', hp: 1, maxHp: 1, stats: {}, items: [], properties: [], effects: ['u-lv:2', 'death', 'fear'] };
		const clean = probeConsole('warn', () => R().Character.revive(okSnap));
		assert.eq(clean.length, 0, '合法 id（含层级与 pack 注册的 fear）不警告');
	});

	test('effect：dnd3 的 fear 仍由 pack 注册并经 id 串可用（N①‑1 的入口面）', () => {
		const def = R().effectOf('fear');
		assert.eq(def.id, 'fear', 'fear 已注册（dnd3/core/saves.js）');
		assert.eq(def.constructor.name, 'Debuff', 'fear 是 Debuff');
		const c = new (R().Character)({ name: '懦夫' });
		c.gain('fear');
		assert.eq(JSON.stringify(c.effects), '["fear"]', 'id 串入口');
		c.gain(R().fear);
		assert.eq(c.effects.length, 1, '实例入口幂等');
		assert.eq(c.contains(R().fear), true, '实例入口可判');
		c.lose('fear');
		assert.eq(c.contains(R().fear), false, 'id 串入口可移除');
	});
	/* ---- 以下三条为 main 既有用例（#1713 改版时保持原样，防覆盖退化）---- */

	test('effect：Effect 缺 id 抛错', () => assert.throws(() => new (R().Effect)({})));

	test('effect：Debuff 继承 Effect', () =>
		assert.ok(R().Debuff.prototype instanceof R().Effect));

	test('effect：death 是 Debuff 实例且 id 为 death', () => {
		assert.ok(R().death instanceof R().Debuff);
		assert.eq(R().death.id, 'death');
	});
})();
