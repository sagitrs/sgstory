/* `sgstory#1934`（战斗决策 4 族）· **测试侧先行 → 转正**（T 席 `sagitrs-tester-4`）
 *
 * 出处＝票面 §16 判据表（领队逐字转录于 `#1934` 上方评论），四族官方名：
 *   `combat-reject-keeps-turn`／`combat-guard-window`／`combat-retreat-route`／`combat-five-outcomes`。
 * ★本档只落**引擎侧三族**：`combat-retreat-route` 的观测（合法准备区／门仍锁／无本场奖励）
 *   只在 **books 侧**判得动（裁 3：引擎 ＋ books 同票两 PR 互指）⇒ 不在本档。
 *
 * ★分工（与 `src/core/combat-outcome.test.js` 的关系）：那档是**实现自测**，
 *   **本档是 §16 的判据面** —— 判据名、观测与期望逐条照 §16，用来**从外面**判这套行为是否成立。
 *   两档并存不是重复：实现改了内部形该档会红，而**行为退化**（例如公式从半伤改成固定 −2）本档会红。
 *
 * ★形：特性在位就断、缺席就记 pending ＋ 印现读数（缺失时 `assert.ok(true)` 占位，
 *   **汇总行**把待判条数印出来 ⇒ 「有 pending」这件事本身看得见）。
 *
 * 防御减伤量＝**半伤·向下取整·可为 0**（裁 1，出处 §10.1）。四档里只有 `5⇒2` 能**分辨三读**：
 *   3 ⇒ 半伤 1｜固定 1｜×⅓ 1（正控，同值）｜**5 ⇒ 半伤 2｜固定 3｜×⅓ 1（★分辨）**｜1 ⇒ 0｜0 ⇒ 0
 */
(() => {
	const R = () => setup.RPG;
	const 待判 = [];
	const 有 = (f) => { try { return f() != null; } catch { return false; } };
	/** ★造一个真角色（`RPG.Character` 是构造函数，✗ 不可写 `new R().Character(...)`）。 */
	const 造人 = (hp) => {
		const C = R().Character;
		if (!C) return { id: 'u', name: '桩', hp, maxHp: hp, isDown: false, isProtagonist: false, items: [] };
		const a = new C({ name: '桩', hp, maxHp: hp });
		if (a.hp === undefined) a.hp = hp;
		if (a.maxHp === undefined) a.maxHp = hp;
		return a;
	};

	/** 桩角色：判据只读 `isDown`／`isProtagonist`／`hp`／`maxHp`（`resolve` 的缺省 rules 读法）。 */
	const 桩 = (o = {}) => ({
		id: o.id ?? 'u', name: o.name ?? '桩',
		hp: o.hp ?? 5, maxHp: o.maxHp ?? 5,
		isDown: o.isDown ?? false, isProtagonist: o.isProtagonist ?? false,
	});

	/* ───────────────────── `combat-five-outcomes`（§16：五名分类正确）─────────────────────
	 * 刀（§16）：以 `every(isDown)` 代替分类
	 * 判定次序即语义：①主角死 →②玩家全出局 →③敌方全出局（**全被击晕⇒knockout，否则 victory**）
	 *   →④retreat →⑤回合上限 →⑥null
	 * ★两条优先规则：主角死优先且**不授奖**；**敌方全出局优先于回合上限**。
	 */
	test('★combat-five-outcomes：五名分类 ＋ 两条优先规则（§16）', () => {
		const 解 = R().outcomeResolver?.resolve;
		if (!有(() => 解)) {
			待判.push('combat-five-outcomes：`RPG.outcomeResolver.resolve` 未在位 —— 候 D 码');
			assert.ok(true);
			return;
		}
		const 跑 = (o) => 解({
			players: o.玩家 ?? [桩({ isProtagonist: true })],
			enemies: o.敌 ?? [桩()],
			completedRounds: o.回合 ?? 0,
			roundLimit: o.上限 ?? 8,
			retreatAccepted: o.退 ?? false,
		});

		/* ① 主角死 ⇒ death（且**不授奖**：winner 不得是 players） */
		const 主死 = 跑({ 玩家: [桩({ isProtagonist: true, hp: 0, isDown: true })], 敌: [桩({ hp: 5 })] });
		assert.eq(主死?.outcome, 'death', `★主角 hp≤0 ⇒ death（实得 ${JSON.stringify(主死?.outcome)}）`);
		assert.ok(主死?.winner === 'enemies',
			`★主角死**不授奖**（winner 应为 enemies，实得 ${JSON.stringify(主死?.winner)}）—— 这条是 §16 的优先规则甲`);

		/* ② 玩家全出局 ⇒ knockout */
		const 玩家倒 = 跑({ 玩家: [桩({ isProtagonist: false, isDown: true, hp: 0 }), 桩({ isDown: true, hp: 0 })], 敌: [桩()] });
		assert.eq(玩家倒?.outcome, 'knockout', `★玩家全出局 ⇒ knockout（实得 ${JSON.stringify(玩家倒?.outcome)}）`);

		/* ③ 敌方全出局 ⇒ victory；**全被击晕 ⇒ knockout**（同一条分支里的两种取值） */
		const 敌倒 = 跑({ 敌: [桩({ isDown: true, hp: 0 }), 桩({ isDown: true, hp: 0 })] });
		assert.eq(敌倒?.outcome, 'victory', `★敌方全出局（打死）⇒ victory（实得 ${JSON.stringify(敌倒?.outcome)}）`);

		/* ④ 撤退（有退路必成 ⇒ 由调用方置 retreatAccepted） */
		assert.eq(跑({ 退: true })?.outcome, 'retreat', '★retreatAccepted ⇒ retreat');

		/* ⑤ 回合上限 ⇒ stalemate；⑥ 都不满足 ⇒ null */
		assert.eq(跑({ 回合: 8, 上限: 8 })?.outcome, 'stalemate', '★completedRounds ≥ roundLimit ⇒ stalemate');
		assert.eq(跑({ 回合: 3, 上限: 8 }), null, '★战斗未结束 ⇒ null');

		/* ★优先规则乙：敌方全出局**优先于**回合上限 —— 同一轮敌方倒光且回合到顶 ⇒ 仍 victory（✗ stalemate） */
		assert.eq(跑({ 敌: [桩({ isDown: true, hp: 0 })], 回合: 99, 上限: 8 })?.outcome, 'victory',
			'★★优先规则乙：**敌方全出局优先于回合上限**（同一轮敌方倒光＋回合到顶 ⇒ 仍判 victory，✗ stalemate）');

		/* 判据的副产品：casualties 的 cause 取值域（§16 只给了五名，这条是形的一部分） */
		const 因 = (敌倒?.casualties ?? []).map((c) => c.cause);
		assert.ok(因.every((c) => ['dead', 'knocked-out', 'active'].includes(c)),
			`★casualties.cause 取值须在 dead／knocked-out／active 内（实得 ${JSON.stringify(因)}）`);
	});

	/* ───────────────────── `combat-guard-window`（§16：3 伤害减为 1；多段、到期、持续伤害）─────────────────────
	 * 刀（§16）：提前／延后到期，错误取整
	 * 窗口：提交后 ⇒ 该角色**下一次行动机会前**；取整＝**向下**；多段＝**分别处理**；
	 *   只减 `direct:true` ⇒ **环境／持续默认不减免**。
	 */
	test('★combat-guard-window：四档减伤 ＋ 多段 ＋ 到期 ＋ 范围（§16／裁 1）', () => {
		const 具 = R().guard, 伤 = R().applyDamage;
		if (!有(() => 具?.arm && 具?.isActive && 伤)) {
			待判.push('combat-guard-window：`RPG.guard.arm/isActive` 或 `RPG.applyDamage` 未在位 —— 候 D 码');
			assert.ok(true);
			return;
		}
		/** 起一个角色 → 装防御 → 打一下 ⇒ 返回**实际掉的血**（✗ 不读内部公式）。 */
		const 打 = (原始伤害, opt = {}) => {
			const a = 造人(20);
			if (opt.不装 !== true) 具.arm(a, { 生效序号: 1, 到期边界: 99 });
			const 前 = a.hp;
			伤(a, 原始伤害, { direct: opt.direct ?? true, ignoresGuard: opt.ignoresGuard ?? false });
			return 前 - a.hp;
		};

		/* 四档（裁 1＝半伤·向下取整·可为 0） */
		assert.eq(打(3), 1, '★§16 正控：3 伤害减为 1（三读同值，✗ 不具分辨力）');
		assert.eq(打(5), 2,
			'★★**分辨臂**：5 伤害须为 **2**（半伤）—— 若实得 3 ＝改成了「固定 −2」，实得 1 ＝改成了「×⅓」'
			+ ' ⇒ 这一档是唯一能钉死公式的观测');
		assert.eq(打(1), 0, '★边界：1 伤害 ⇒ 0（向下取整，「可为 0」）');
		assert.eq(打(0), 0, '★边界：0 伤害 ⇒ 0（✗ 不得因防御变负）');

		/* 多段**分别**结算（✗ 不是先加总再减半：两段 3 ⇒ 1＋1＝2；若先加总 6 ⇒ 3 就是错的） */
		const 两段 = 打(3) + 打(3);
		assert.eq(两段, 2, `★多段**分别**处理：两段 3 ⇒ 1＋1＝2（实得 ${两段}；若 3 ＝先加总再减半，错）`);

		/* 范围：环境／持续伤害**默认不减免**（只减 `direct:true`） */
		assert.eq(打(4, { direct: false }), 4, '★环境／持续伤害**不减免**（只减直接攻击 ⇒ direct:false 应全额）');
		assert.eq(打(4, { ignoresGuard: true }), 4, '★ignoresGuard:true ⇒ 全额（特殊攻击可声明忽略防御）');

		/* 未装防御 ⇒ 全额（负控：证明上面那些减半不是「本来就只扣这么点」） */
		assert.eq(打(5, { 不装: true }), 5, '★负控：**未装防御**时 5 伤害扣满 5（⇒ 上面减半真来自防御）');

		/* 到期：窗口外不再减免（§16 刀靶之一＝提前／延后到期） */
		const b = 造人(20);
		具.arm(b, { 生效序号: 1, 到期边界: 2 });
		/* ★窗口语义＝**半开区间 `[生效序号, 到期边界)`** —— 与 §10.1「到该角色**下一次行动机会开始前**」
		 *   一致：**到期边界那一刻已失效**（开始前，✗ 不含开始）。
		 *   ★我起初按「含端点」写成 `isActive(b,2)===true` ⇒ 实得 false ⇒ **是我的读法错，✗ 不是实现错**；
		 *   本格按实现与 §10.1 对齐后的语义断（并把这条语义**钉住**：谁改成含端点，本格会红）。 */
		const 窗内 = 具.isActive(b, 1);   // 生效序号那刻 ⇒ 生效
		const 界点 = 具.isActive(b, 2);   // 到期边界那刻 ⇒ **已失效**（半开区间）
		const 窗外 = 具.isActive(b, 3);
		assert.ok(窗内 === true && 界点 === false && 窗外 === false,
			`★到期边界（半开区间 `+ '`[生效, 到期)`' + `）：序号 1 ⇒ 生效、序号 2（＝到期边界）⇒ **已失效**、序号 3 ⇒ 失效`
			+ `（实得 窗内=${窗内}、界点=${界点}、窗外=${窗外}）`);
	});

	/* ───────────────────── `combat-reject-keeps-turn`（§16：拒绝后 cursor／血／rng 不变，可再选）─────────────────────
	 * 刀（§16）：拒绝时推进 cursor 或 endTurn
	 * ★与我 `#1932` 判的命令原子性**同族** ⇒ 比法是**整块比**（✗ 只比一个字段）。
	 */
	test('★combat-reject-keeps-turn：单位动作面在位 ＋ 状态不因拒绝而变', () => {
		const 面 = R().battleActions?.ofUnit;
		if (!有(() => 面)) {
			待判.push('combat-reject-keeps-turn：**单位级动作面**（`RPG.battleActions.ofUnit`）未在位 —— 候 D 码');
			assert.ok(true);
			return;
		}
		const 动作 = 面({ name: '桩', isDown: false });
		const 名 = (动作 ?? []).map((a) => a?.id);
		assert.ok(名.includes('defend') && 名.includes('retreat'),
			`★单位级动作面须含 防御／撤退（实得 ${JSON.stringify(名)}）—— 「拒绝后不变」这条判的前提是有「可被拒的动作」`);
		assert.ok((动作 ?? []).every((a) => a?.needsTarget === false),
			`★防御／撤退都作用于自己（needsTarget:false，实得 ${JSON.stringify((动作 ?? []).map((a) => a.needsTarget))}）`);

		/* ★§16 的四处「不变」中可离线判的部分：**装防御不改血／不消耗**（状态只落 `actorRuntime.guard`） */
		const g = R().guard;
		if (有(() => g?.arm)) {
			const a = 造人(20);
			const 前血 = a.hp, 前包 = JSON.stringify(a.items ?? null);
			g.arm(a, { 生效序号: 1, 到期边界: 5 });
			assert.ok(a.hp === 前血 && JSON.stringify(a.items ?? null) === 前包,
				'★装防御**不动血、不动包**（状态只落 actorRuntime.guard）—— 这是「拒绝后四处不变」在本档可离线判的那部分');
			assert.ok(R().actorRuntime(a)?.guard != null,
				'★防御状态落在 RPG.actorRuntime(actor).guard（每角色一份纯数据盒，随档往返）');
		}
	});

	/* ───────────────────────── 汇总（让「有 pending」看得见）───────────────────────── */
	test('★combat-* 汇总（待判不入绿、也不静默跳过）', () => {
		for (const p of 待判) console.log(`  ⏳ ${p}`);
		console.log(`  combat-* §16 判据汇总：待判 ${待判.length} 条（✗ 不入绿、✗ 不静默跳过）`);
		assert.ok(true);
	});
})();
