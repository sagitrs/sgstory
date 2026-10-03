/* dnd3 永久被动（passives）的单元测试 —— `#1909`（母票 `#1893` 后半；`books#164` 的引擎侧配套）
 *
 * 断言锚：`#1909` 的「验收」节（注册生效 ＋ `scope: 'persistent'` ＋ ✗ 判定字段；跨场保留 ＋ 死亡清掉）
 *   —— 后两条 `books#139` (b) 节已在故事侧验过（那时注册在故事侧），本档**自证一遍**（迁移后引擎要自己站得住）。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;
	const mk = (over = {}) => new (R().Character)({
		name: '靶', hp: 20, maxHp: 20, stats: { ac: -999 }, ...over,
	});

	test('passives：precognition 注册生效（id／name／desc 就位，且**不是** Debuff 类）', () => {
		const 预知 = R().precognition;
		assert.ok(预知, '`RPG.precognition` 定义单例在场');
		assert.eq(R().effects.get('precognition'), 预知, '注册表里就是它（✗ 未被后来者覆盖）');
		assert.eq(预知.id, 'precognition', 'id');
		assert.eq(预知.name, '预知', 'name');
		assert.ok(typeof 预知.desc === 'string' && 预知.desc !== '', 'desc 就位（占位说明也是说明）');
		assert.ok(预知 instanceof R().Effect, '是 `RPG.Effect` 实例');
		assert.ok(!(预知 instanceof R().Debuff), '★`kind: buff` ⇒ ✗ 不是 `RPG.Debuff` 类');
		/* 挂载面：`gain` 不抛 ⇒ 已注册（✗ 未注册 id 会抛 `EFFECT_UNKNOWN`） */
		const c = mk();
		c.gain('precognition');
		assert.ok(c.contains('precognition'), '可施加（注册成功的直接证据）');
	});

	test('passives：`scope: persistent`，且 ✗ 判定字段（占位＝无效果）', () => {
		const 预知 = R().precognition;
		assert.eq(预知.scope, 'persistent', 'scope=persistent（跨场保留）');
		assert.ok(!('hooks' in 预知), '✗ hooks（占位：无回合钩子 ⇒ 不参与判定）');
		assert.ok(!('levels' in 预知), '✗ levels（✗ 层级效果）');
	});

	test('passives：★跨场保留 —— 打完一场后仍在身上（dnd3 无 `battle:end` 清效果）', async () => {
		/* 造一把必杀武器并给玩家（形照 `dnd3/battle.test.js` 的 `setupGodSword`）——
		 * 为的是「战斗确实打完」这一前置成立（✗ 空跑一场 ⇒ 本面读的是「没发生的事」）。 */
		R().defItem({
			id: 'unit-passive-sword', name: '神剑', weapon: true, slot: 'weapon',
			stats: { dmg: '20' },
			used(that) { that.hp = 0; D().grantDeathIfDown(that); },
			actions: { equip: R().slotEquip, unequip: R().slotUnequip },
		});
		State.variables.inventory = [];
		/* 敌人回到初始态（全局单例实例，别的用例用过就要还） */
		D().Goblin.hp = 6;
		D().Goblin.effects = [];
		D().Goblin.items = [{ id: 'club', equipped: true }];
		const P = new (R().Character)({
			name: '持预知者', hp: 40, maxHp: 40,
			stats: D().stats({ ac: 30 }),
			items: [{ id: 'unit-passive-sword', equipped: true }],
		});
		P.gain('precognition');
		assert.ok(P.contains('precognition'), '前置：已持有预知');
		await new (R().Battle)(1, [P], [D().Goblin]).execute();
		assert.ok(D().Goblin.isDown, `前置：战斗确实打完（哥布林 hp=${D().Goblin.hp}）—— 否则本面不成立`);
		assert.ok(P.contains('precognition'),
			'★跨场保留：战斗结束后预知仍在身上（dnd3 无 `battle:end` 清效果 ⇒ persistent 天然跨场）');
	});

	test('passives：★死亡清档清掉它（`RPG.respawn` ③ 按**角色实例**的 effects 过滤）', () => {
		const c = mk({ name: '阵亡者' });
		c.gain('precognition');
		c.gain(R().death);
		assert.ok(c.contains('precognition') && c.contains(R().death), '前置：身上有预知与 death 标记');
		const r = R().respawn(c, { to: 'L1' });
		assert.ok(r.moved, '处于死亡态 ⇒ 真的走了清档路径（✗ 幂等早退）');
		assert.ok(r.cleared >= 1, `清档条数 ≥ 1（实得 ${r.cleared}）`);
		assert.ok(!c.contains('precognition'), '★persistent 也被清掉（与「谁注册」无关）');
		assert.ok(!c.contains(R().death), 'death 标记在 ③④ 两步之后也被清（✗ 留在身上）');
	});
})();
