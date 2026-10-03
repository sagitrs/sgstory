/* `#1914` 批 B · **装载序烟测**（`tester-3` 承接；票面 v2 的 E 件）
 *
 * ## 为什么需要
 *   `src/core/` 是**扁平数字前缀、按路径序装载** ⇒ `42/43/44/45/46-*` 排在 `40-battle.js` **之后**。
 *   ⇒ `40-battle.js` 对协议件的取用**只能在方法体内**（调用时），✗ 装载期（顶层常量／类装饰）。
 *   真出问题时，表现是**别处**「某 API 是 undefined」炸 —— 判据落不到本票头上。
 *
 * ## 判据（两段）
 *   ①**清单（棘轮）**：协议入口在装载完之后**存在且可调用**（成员 `typeof` ＋ 一次最小调用不抛）。
 *      ✗ 只断 `typeof` 不带调用 —— 那证明不了它**能用**（半成品函数照样是 function）。
 *      ★清单是棘轮：实现改名／移位须**同时**改本清单（差集在失败报文里逐条列出）。
 *   ②**消费点真跑**：走一次真通路（`new Battle` ＋ `buildPlayerOptions`），断**取回来的值带协议的印**
 *      （例：目标候选的 `value` 恰等于 `RPG.unitId.of(该单位)`；选单项来自 `RPG.battleActions.list`）。
 *      ⇒ 这一条同时钉住「消费点读的是**当前那份**协议面」：若谁改成装载期取用（那时协议件还没载），
 *        取到的会是 `undefined`，本段会以**具名红**报出，而不是在别处炸。
 *
 * ## ⚠ 一处**做不到**、如实记
 *   本席原设计是想「**换装探针**」（把消费点读的入口换成探针 ⇒ 探针被调用即证调用时取用）。
 *   但本笔的协议面都是 **`Object.freeze`**（`RPG.unitId`／`battleActions`／`actionResult`／
 *   `targetPolicy`／`repeat`）⇒ **换不掉**，该手法在此**不成立**（✗ 假装有）。故改用①＋②。
 *
 * ## 现码读数（本席实跑，头 `8b2d59f`）
 *   ① 七件入口全部存在且可调用 ✓｜② 真通路取值带印（`unitId.of`／目录／`actionResult`）✓
 */
(() => {
	const R = () => setup.RPG;

	/* ★清单（棘轮）：`#1914` 批 B 的协议面。改名／移位 ⇒ 同时改这里。 */
	const 协议入口 = [
		['unitId.of', () => R().unitId.of({}),
			() => typeof R().unitId?.of === 'function', '战斗内稳定编号'],
		['newSlotId', () => R().newSlotId(),
			() => typeof R().newSlotId === 'function', '件号发号（全局单调）'],
		['noteSlotId', () => R().noteSlotId('it-1'),
			() => typeof R().noteSlotId === 'function', '读档把序列越过已见号'],
		['battleActions.list', () => R().battleActions.list(R().createItem('club')),
			() => typeof R().battleActions?.list === 'function', '战用动作目录'],
		['actionResult.applied', () => R().actionResult.applied({}),
			() => typeof R().actionResult?.applied === 'function', '结构化结果（落地）'],
		['targetPolicy.candidates', () => R().targetPolicy.candidates({ actionClass: 'damage', foes: [] }),
			() => typeof R().targetPolicy?.candidates === 'function', '目标候选策略'],
		['repeat.last', () => R().repeat.last({}),
			() => typeof R().repeat?.last === 'function' && typeof R().repeat?.resolve === 'function', '重复行动'],
	];

	test('装载序烟测 ①：协议入口存在**且可调用**（清单＝棘轮）', () => {
		const 缺 = [], 不可用 = [];
		for (const [路径, 调用, 存在, why] of 协议入口) {
			if (!存在()) { 缺.push(`${路径}（${why}）`); continue; }
			try { 调用(); } catch (e) { 不可用.push(`${路径}：${e && e.message}`); }
		}
		assert.eq(缺.length, 0,
			`★协议入口缺失（清单与实现的**差集**）：${缺.join('、')}`
			+ ' —— 若实现改名／移位，请**同时改本清单**（棘轮：差集须显式，✗ 悄悄放宽）');
		assert.eq(不可用.length, 0, `★协议入口存在但**不可调用**：${不可用.join('；')}`);
		assert.ok(协议入口.length >= 7, `★清单条数 ${协议入口.length}（正控：为空则本判据恒真）`);
	});

	test('装载序烟测 ②：消费点真跑 —— 取回来的值**带协议的印**', () => {
		/* ★前置**具名红**：协议面不在时，本段应**报出来**而不是以 `TypeError` 崩（崩溃不算红）。 */
		if (typeof R().unitId?.of !== 'function' || typeof R().battleActions?.list !== 'function') {
			assert.ok(false, '★协议面未就位（`RPG.unitId.of`／`RPG.battleActions.list` 不在）'
				+ ' —— ② 段（消费点真跑）无法进行；先看 ① 段的差集清单');
			return;
		}
		const 甲 = new (R().Character)({ name: '甲', hp: 20, maxHp: 20 });
		const 乙 = new (R().Character)({ name: '乙', hp: 20, maxHp: 20 });
		const battle = new (R().Battle)(1, [甲], [乙], true);
		const opts = battle.buildPlayerOptions(甲);
		/* ②-1 目标候选的 value 须来自**协议面当前那份** `unitId.of` */
		assert.ok(Array.isArray(opts.targetOptions) && opts.targetOptions.length > 0,
			`★目标候选为空（正控：为空则下一条恒真）：${JSON.stringify(opts.targetOptions)}`);
		/* ⚠ 伤害类的候选**只有敌方**（本笔的靶策略）⇒ 只对**敌方**断「值带协议印」。 */
		const 期望 = R().unitId.of(乙);
		const 实得 = opts.targetOptions.find((o) => o.text.includes(乙.name))?.value;
		assert.eq(实得, 期望, `★目标候选值不带协议印（实得 ${实得}／期望 ${期望}）`
			+ ' —— 消费点没读**当前那份** `RPG.unitId.of`');
		assert.ok(!opts.targetOptions.some((o) => o.text.includes(甲.name)),
			'★伤害类候选里出现了己方（本笔靶策略要求只列敌方）');
		/* ②-2 选单项须来自目录面（✗ 交互函数里现算） */
		assert.ok(opts.itemOptions.length > 0, '★道具候选为空（正控）');
		/* ②-3 结果工厂与重复面在**运行期**可用 */
		const r = R().actionResult.applied({ actor: 甲, actionClass: 'damage' });
		assert.eq(r.status, 'applied', '★`actionResult.applied` 未给出结构化 status');
		assert.ok(Array.isArray(r.events) && r.events.length > 0, '★结构化结果里没有 events');
		assert.eq(R().repeat.last(battle), null, '★新战斗的重复位应为空（`repeat.last`）');
	});
})();
