/* dnd3/core/grapple 的单元测试：擒抱检定、擒抱与被钉住两状态、改良抓握、战斗边界清理
 *
 * 数值对账的锚：三只七名河怪物的 pinned `Base Attack/Grapple` 行（`#2027` 的二十条对照表第 5、6 行）
 *   —— 鳄鱼 `+2/+6`、小水元素 `+1/-1`、中水元素 `+3/+6`。
 * 出处：SRD 3.5 · `Monsters/Monsters - Animals.md:525`（鳄鱼）与
 *       `3.5 Compendium/Monsters/3.5 Monsters - E.md:319`（两型水元素同表）。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;

	/* 固定随机源：每个骰子都掷出同一值（本仓既有惯例，见 `saves.test.js`）。
	 * ⚠ 退化源下「破平重掷」会永不收敛 ⇒ 那是 `opposedGrapple` 的重掷上限要挡的形态（下方有用例）。 */
	const 固定掷 = (v) => R().rng.set(() => v);

	/** 目录名册桩：擒抱的反查只认**本场战斗名册**（`RPG.Battle.current`）⇒ 单测里给一个。 */
	const 开场 = (...all) => { R().Battle.current = { players: [...all], enemies: [] }; };

	/** 复原三只怪物与舞台（它们都是全局单例 ⇒ 用例之间必须复位） */
	const 复位 = () => {
		for (const m of [D().Crocodile, D().SmallWaterElemental, D().MediumWaterElemental]) {
			m.hp = m.maxHp;
			m.effects = m.id === 'crocodile' ? [] : ['water-mastery'];
			m.runtime = {};
			m.nonlethal = 0;
		}
		D().Crocodile.items = [{ id: 'crocodile-bite', equipped: true }];
		D().SmallWaterElemental.items = [{ id: 'small-water-elemental-slam', equipped: true }];
		D().MediumWaterElemental.items = [{ id: 'medium-water-elemental-slam', equipped: true }];
		R().Battle.current = null;
		R().rng.reset();
	};

	test('dnd3 擒抱：检定加值 = BAB ＋ 力量调整值 ＋ 体型特殊修正（三只 pinned 值逐只对账）', () => {
		复位();
		assert.eq(D().grappleMod(D().Crocodile), 6, '鳄鱼：BAB 2 ＋ Str +4 ＋ 中型 0 ＝ +6（pinned +2/+6）');
		assert.eq(D().grappleMod(D().SmallWaterElemental), -1, '小水元素：BAB 1 ＋ Str +2 ＋ 小型 −4 ＝ −1（pinned +1/-1）');
		assert.eq(D().grappleMod(D().MediumWaterElemental), 6, '中水元素：BAB 3 ＋ Str +3 ＋ 中型 0 ＝ +6（pinned +3/+6）');
	});

	test('dnd3 擒抱：体型特殊修正表逐档照录（pin `:708` 的九档）', () => {
		复位();
		const 表 = { colossal: 16, gargantuan: 12, huge: 8, large: 4, medium: 0, small: -4, tiny: -8, diminutive: -12, fine: -16 };
		for (const [k, v] of Object.entries(表)) assert.eq(D().grappleSizeMod(k), v, `${k} ⇒ ${v}`);
		assert.eq(D().grappleSizeMod('未知名'), 0, '未知名按中型（0）—— 旧档与未声明体型的角色零回归');
	});

	test('dnd3 擒抱：目标大两档及以上 ⇒ 抓不住（pin `:737`，且**不掷骰**）', () => {
		复位();
		const 小 = new (R().Character)({ name: '小型者', stats: D().stats({ size: 'small' }) });
		const 巨 = new (R().Character)({ name: '超巨者', stats: D().stats({ size: 'colossal', str: 30 }) });
		assert.ok(!D().canHold(小, 巨), '小 → 超巨（差 8 档）⇒ 不允许');
		assert.ok(D().canHold(巨, 小), '反向允许（体型差只挡小抓大）');
		开场(小, 巨);
		固定掷(0.99);   // 若真掷骰，小者的检定会很高 —— 结果仍须是 false（证明「不掷骰」而不是「掷输了」）
		assert.ok(!D().hold(小, 巨), 'hold 返回 false');
		assert.ok(!巨.contains('grapple-hold'), '目标没有被抓住');
		复位();
	});

	test('dnd3 擒抱：建立擒抱 ⇒ 双侧状态与关系记录（可反查对手）', () => {
		复位();
		const 鳄 = D().Crocodile, 勇 = new (R().Character)({ name: '勇者', hp: 40, maxHp: 40, stats: D().stats({ ac: 12 }) });
		开场(鳄, 勇);
		固定掷(0.5);   // 双方同掷（11）⇒ 调整值高者胜：鳄鱼 +6 > 勇者 +0
		assert.ok(D().hold(鳄, 勇), '鳄鱼抓中');
		assert.ok(勇.contains('grapple-hold'), '勇者进入擒抱');
		assert.ok(D().isHeld(勇), 'isHeld');
		assert.ok(D().isGrappling(鳄), '鳄鱼在擒抱中（抓人侧）');
		assert.eq(D().grapplePartner(勇), 鳄, '勇者的对手＝鳄鱼（反查走本场名册）');
		assert.eq(D().grapplePartner(鳄), 勇, '双向可查');
		复位();
	});

	test('dnd3 擒抱：对抗失败 ⇒ 不建立状态（反向用例）', () => {
		复位();
		const 鳄 = D().Crocodile, 勇 = new (R().Character)({ name: '强者', hp: 40, maxHp: 40, stats: D().stats({ bab: 20 }) });
		开场(鳄, 勇);
		固定掷(0.5);   // 勇者 BAB 20 ⇒ 调整值远超鳄鱼
		assert.ok(!D().hold(鳄, 勇), '鳄鱼抓不动');
		assert.ok(!勇.contains('grapple-hold'), '目标无状态');
		assert.eq(勇.runtime?.grapple?.heldBy ?? null, null, '无关系记录');
		复位();
	});

	test('dnd3 擒抱：退化随机源下不挂死（破平有上限，house rule）', () => {
		复位();
		const a = new (R().Character)({ name: '甲', stats: D().stats({}) });
		const b = new (R().Character)({ name: '乙', stats: D().stats({}) });
		开场(a, b);
		固定掷(0.5);   // 双方每掷都是 11、调整值也相同 ⇒ 永不平局
		const r = D().opposedGrapple(a, b);
		assert.ok(r.tie === true, '掷满上限仍平 ⇒ 标记 tie');
		assert.eq(r.winner, 'b', '判尝试者（a）失败 —— ✗ 不得无限重掷');
		复位();
	});

	test('dnd3 擒抱：擒抱中只能打那名对手（pin `:786`），且打他 −4', () => {
		复位();
		const 鳄 = D().Crocodile, 勇 = new (R().Character)({ name: '勇者', hp: 40, maxHp: 40, stats: D().stats({ ac: 12 }) });
		const 旁人 = new (R().Character)({ name: '旁人', hp: 40, maxHp: 40, stats: D().stats({ ac: 12 }) });
		开场(鳄, 勇, 旁人);
		固定掷(0.5);
		D().hold(鳄, 勇);
		assert.eq(D().grappleAttackMod(鳄, 勇), -4, '打自己擒抱的对手 ⇒ −4');
		assert.eq(D().grappleAttackMod(鳄, 旁人), 0, '非对手 ⇒ 不给 −4（该情形由下一行禁止）');
		assert.ok(D().grappleBlocksTarget(鳄, 旁人), '打旁人 ⇒ 被禁');
		assert.ok(!D().grappleBlocksTarget(鳄, 勇), '打对手 ⇒ 允许');
		assert.ok(!D().grappleBlocksTarget(旁人, 鳄), '没在擒抱里的角色不受此限');
		复位();
	});

	test('dnd3 擒抱：被钉住 ⇒ 对非钉住者 AC −4，对钉住者不减（pin `:894`）', () => {
		复位();
		const 鳄 = D().Crocodile, 勇 = new (R().Character)({ name: '勇者', hp: 40, maxHp: 40, stats: D().stats({ ac: 16 }) });
		const 旁人 = new (R().Character)({ name: '旁人', stats: D().stats({}) });
		开场(鳄, 勇, 旁人);
		固定掷(0.5);
		D().hold(鳄, 勇);
		固定掷(0.99);   // 钉住检定：鳄鱼调整值高（同掷亦胜）
		D().pinOpponent(鳄);
		assert.ok(勇.contains('grapple-pin'), '勇者被钉住');
		assert.eq(D().acOf(勇, 鳄), 16, '对钉住者 ⇒ 不減（基础 AC 16）');
		assert.eq(D().acOf(勇, 旁人), 12, '对非钉住者 ⇒ 16 − 4 ＝ 12');
		复位();
	});

	test('dnd3 擒抱：挣脱解擒抱；被钉住时先解钉（仍留在擒抱里）', () => {
		复位();
		const 鳄 = D().Crocodile, 勇 = new (R().Character)({ name: '力士', hp: 40, maxHp: 40, stats: D().stats({}) });
		开场(鳄, 勇);
		/* 逐次不同的随机源：两掷分别给「先取的那一方」与「后取的那一方」
		 *   ⇒ 可定向控制对抗结果（常量源做不到：双方同掷，只有调整值高者能赢）。 */
		let n = 0; R().rng.set(() => (n++ % 2 === 0 ? 0.99 : 0.0));
		assert.ok(D().hold(鳄, 勇), '鳄鱼抓中（第一掷高、第二掷低）');
		assert.ok(勇.contains('grapple-hold'), '先被抓住');
		n = 0; assert.ok(D().pinOpponent(鳄), '钉住成功（第一掷高）');
		assert.ok(勇.contains('grapple-pin'), '再被钉住');
		// 挣脱：由随机源定向（挣脱方第一掷高）⇒ 必成；但只解钉
		n = 0; assert.ok(D().escapeGrapple(勇), '挣脱成功');
		assert.ok(!勇.contains('grapple-pin'), '钉住解除');
		assert.ok(勇.contains('grapple-hold'), '仍是擒抱（pin `:901`）');
		// 再挣脱一次 ⇒ 整个擒抱结束
		n = 0; assert.ok(D().escapeGrapple(勇), '第二次挣脱成功');
		assert.ok(!勇.contains('grapple-hold'), '擒抱结束');
		assert.eq(鳄.runtime?.grapple?.holds ?? null, null, '抓人侧记录也清掉');
		assert.eq(勇.runtime?.grapple?.heldBy ?? null, null, '被抓住侧记录也清掉');
		复位();
	});

	test('dnd3 擒抱：改良抓握（Improved Grab）—— 命中后追加的注册与调用', () => {
		复位();
		const 鳄 = D().Crocodile, 勇 = new (R().Character)({ name: '无辜者', hp: 40, maxHp: 40, stats: D().stats({ ac: 12 }) });
		开场(鳄, 勇);
		固定掷(0.5);
		assert.ok(D().onHitHandlers.has('improved-grab'), '处理函数已注册（加载期）');
		assert.ok(D().runOnHit('improved-grab', { attacker: 鳄, target: 勇 }), '命中后追加生效 ⇒ 起擒抱');
		assert.ok(勇.contains('grapple-hold'), '目标被抓住');
		复位();
	});

	test('dnd3 擒抱：已出局的目标不再被追加（同 `#1780` A5 惯例）', () => {
		复位();
		const 鳄 = D().Crocodile;
		const 尸 = new (R().Character)({ name: '倒地者', hp: 0, maxHp: 10, stats: D().stats({}) });
		开场(鳄, 尸);
		固定掷(0.5);
		assert.ok(!D().runOnHit('improved-grab', { attacker: 鳄, target: 尸 }), '出局者 ⇒ 不追加');
		assert.ok(!尸.contains('grapple-hold'), '无状态');
		复位();
	});

	test('dnd3 擒抱：未注册的追加 id ⇒ 吞并返 false（✗ 不炸整场战斗）', () => {
		复位();
		assert.ok(!D().runOnHit('不存在的追加', { attacker: D().Crocodile, target: D().Crocodile }), '返 false');
	});

	test('dnd3 擒抱：自动通路的回合动作（被抓住 ⇒ 挣脱；抓着人 ⇒ 钉住／撞一下）', () => {
		复位();
		const 鳄 = D().Crocodile, 勇 = new (R().Character)({ name: '勇者', hp: 40, maxHp: 40, stats: D().stats({}) });
		开场(鳄, 勇);
		固定掷(0.5);
		assert.eq(D().turnAction(勇), null, '未涉入擒抱 ⇒ 不接管（走原有武器路）');
		D().hold(鳄, 勇);
		const 鳄动 = D().turnAction(鳄);
		assert.eq(鳄动?.reason, 'grapple-pin', '抓着人 ⇒ 钉住');
		assert.ok(勇.contains('grapple-pin'), '勇者被钉住');
		const 鳄动2 = D().turnAction(鳄);
		assert.eq(鳄动2?.reason, 'grapple-damage', '已钉住 ⇒ 改为撞一下（pin `:800`）');
		assert.eq(鳄动2?.status, 'applied', '两者都算本回合已推进');
		复位();
	});

	test('dnd3 擒抱：战斗结束 ⇒ 状态与记录一并清（`battle:end` 接线）', () => {
		复位();
		const 鳄 = D().Crocodile, 勇 = new (R().Character)({ name: '勇者', hp: 40, maxHp: 40, stats: D().stats({}) });
		开场(鳄, 勇);
		固定掷(0.5); D().hold(鳄, 勇);
		assert.ok(勇.contains('grapple-hold'), '战前擒抱中');
		R().events.emit('battle:end', { players: [鳄], enemies: [勇] });
		assert.ok(!勇.contains('grapple-hold'), '战后状态清掉');
		assert.eq(勇.runtime?.grapple?.heldBy ?? null, null, '关系记录清掉');
		复位();
	});
})();
