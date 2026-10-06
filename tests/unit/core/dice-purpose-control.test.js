/* `sgstory#2031`（**A4 测试模式前置**）：**用途化骰面控制**的单测。
 *
 * 规格＝`#2031` 规格交付评论；机制＝A1 终裁冻结。九条判据逐条落格（见该评论 §七）：
 *   ①指定面**真消费**（真通路）②未定位 ✗ 消费且**明报**③同用途多消费者④多骰伤害逐颗＋**原子性**
 *   ⑤重击确认分得开⑥旧账（`setSequence`）不假绿⑦清除/耗尽恢复⑧默认零改⑨不入档/正式局隔离。
 *
 * ⚠ 控制面是**模块级运行期状态** ⇒ 每格先 `清()`（`clearAll`）＋ `R().rng.reset()`，✗ 依赖上格残留。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;
	const C = () => R().diceControl;
	const J = (x) => JSON.stringify(x);
	const 清 = () => { C().clearAll(); C().清账(); R().rng.reset(); };
	/** 造一对攻/靶（照 `natural-attacks.test.js` 的既有形） */
	const 对打 = ({ ac = 99 } = {}) => ({
		a: new (R().Character)({ name: '甲', hp: 10, stats: D().stats({ str: 14, bab: 3 }) }),
		t: new (R().Character)({ name: '靶', hp: 10, maxHp: 10, stats: D().stats({ ac }) }),
	});
	const 件 = (id) => { const it = new (R().items.get(id))(); it.equipped = true; return it; };
	const 捉 = (f) => { try { f(); return null; } catch (e) { return e; } };
	/** 序列：全部同值（⇒ 骰面可预知；长度取上限式，理由同 `#1953`：一回内不止抽一次） */
	const 定序 = (v, n = 64) => R().rng.setSequence(Array.from({ length: n }, () => v));

	/* ───────── ① 指定面真消费（**真通路**：`DND3.meleeAttack`）───────── */

	test('★#2031 ①【真通路】装了 `attack.hit` ⇒ 正式攻击**吃到指定面**，且真实加值/AC 照算（✗ 写成功位）', () => {
		清();
		const { a, t } = 对打({ ac: 25 });          // bab3＋力调2＝+5 ⇒ 20+5=25 ≥ 25 恰中；序列若不被控则出 1（必然不中）
		定序(0.0);
		const 收 = C().arm({ purpose: 'attack.hit', actor: '甲', faces: [20] });
		assert.eq(收.ok, true, '装控制须成功');
		assert.eq(收.未覆盖, false, '`attack.hit` 是**已接入**用途 ⇒ ✗ 报未覆盖');
		const club = 件('club');
		try { D().meleeAttack(club, t, a); } finally { R().rng.reset(); }
		const 骰 = C().log().filter((x) => x.purpose === 'attack.hit');
		assert.eq(骰.length, 1, `正式攻击须恰落一条「attack.hit」骰序账（实得 ${骰.length}）`);
		assert.eq(骰[0].face, 20, '★须**吃到指定面** 20（✗ 被序列的 1 顶掉）');
		assert.eq(骰[0].source, '受控', '该颗须记「受控」');
		assert.eq(骰[0].actor, '甲', '定位维度须带上行动者');
		assert.ok(t.hp < 10, `★指定面之后仍走**真实结算**（AC 25 命中、扣血）：hp=${t.hp}`);
		assert.eq(C().报告().额度账.some((x) => x.purpose === 'attack.hit'), false,
			'★配额用尽的条目须从额度账**退场**（✗ 留在账上假装还有面）');
		C().clearAll();
	});

	test('★#2031 ①【对照】✗ 装控制 ⇒ 同序列下**不改**既有语义（面 1、必不中），且正式路径仍**照记「正常」**', () => {
		清();
		const { a, t } = 对打({ ac: 25 });
		定序(0.0);
		const club = 件('club');
		try { D().meleeAttack(club, t, a); } finally { R().rng.reset(); }
		assert.eq(t.hp, 10, '✗ 控制时 AC25 对 d20=1 必不中（既有语义未动）');
		const 骰 = C().log().filter((x) => x.purpose === 'attack.hit');
		assert.eq(骰.length, 1, '★正式落点**恒带用途** ⇒ 未受控时也须记一条（来源「正常」，✗ 静默）');
		assert.eq(骰[0].source, '正常', '★须记「正常」而非「受控」');
		C().clearAll(); C().清账();
	});

	/* ───────── ② 未定位 ✗ 消费 ＋ 明报 ───────── */

	test('★#2031 ②【未定位不消费】装了 `check.save`，跑其它用途 ⇒ 额度**一分不动**，并**明报未消费**', () => {
		清();
		C().arm({ purpose: 'check.save', actor: '甲', faces: [20] });
		R().rollDetail('1d6', { purpose: 'damage', actor: '甲' });      // 别的用途
		const 账 = C().报告();
		assert.eq(账.额度账[0].已消费, 0, '★其它用途 ✗ 得消费目标额度');
		assert.eq(账.额度账[0].剩余, 1, '剩余须仍为 1');
		assert.eq(账.未消费.length, 1, '★须**明报未消费**（✗ 显示「指定已生效」）');
		assert.eq(账.未消费[0].purpose, 'check.save', '未消费条目须具名用途');
		assert.eq(C().log().filter((x) => x.purpose === 'damage')[0].source, '正常', '别的用途走**正常**随机并记账');
		C().clearAll();
	});

	test('★#2031 ②【未覆盖明报】装一个**没有落点接入**的用途（先攻）⇒ 收据当场 `未覆盖`，报告列出', () => {
		清();
		const 收 = C().arm({ purpose: '先攻', actor: '甲', faces: [20] });
		assert.eq(收.未覆盖, true, '★未接入的用途须**当场**报未覆盖（✗ 只写日志）');
		assert.eq(收.ok, true, '（仍可装 —— 但报告里要能被看见）');
		const 报 = C().报告();
		assert.eq(报.未覆盖.length, 1, '报告须列出未覆盖');
		assert.eq(报.未覆盖[0].purpose, '先攻', '未覆盖条目须具名');
		assert.ok(/不在接入表内/.test(报.未覆盖[0].原因), `原因须说清（★F3：分清「引擎无此骰点」与「未接入」）：${报.未覆盖[0].原因}`);
		assert.eq(JSON.stringify(报.接入表), JSON.stringify(C().接入表()), '★`F3`：报告须带**已接入表**（判据可据此分辨两类）');
		assert.ok(C().接入表().includes('attack.hit') && !C().接入表().includes('先攻'),
			`接入表须只列**真接线**的用途：${JSON.stringify(C().接入表())}`);
		C().clearAll();
	});

	/* ───────── ③ 同用途多消费者 ───────── */

	test('★#2031 ③【同用途多消费者】两名攻击者各装一面 ⇒ 各吃各的；**过宽** arm ⇒ 具名拒', () => {
		清();
		C().arm({ purpose: 'attack.hit', actor: '甲', faces: [20] });
		C().arm({ purpose: 'attack.hit', actor: '乙', faces: [1] });
		const 甲 = R().roll('1d20', { purpose: 'attack.hit', actor: '甲' });
		const 乙 = R().roll('1d20', { purpose: 'attack.hit', actor: '乙' });
		assert.eq(甲, 20, '甲须拿自己那面（20）');
		assert.eq(乙, 1, '乙须拿自己那面（1）—— ✗ 互抢');
		const 过宽 = 捉(() => C().arm({ purpose: 'attack.hit', faces: [20] }));
		assert.eq(过宽?.code, 'DICE_ARM_TOO_BROAD', '★只给用途 ⇒ 具名拒（＝「不能凭『下次 d20』猜」）');
		C().clearAll();
	});

	test('★#2031 ③【歧义】同一定位装两条 ⇒ 掷骰时**具名拒**（✗ 猜先注册的那条）', () => {
		清();
		C().arm({ purpose: 'attack.hit', actor: '甲', faces: [20] });
		C().arm({ purpose: 'attack.hit', actor: '甲', faces: [19] });
		const e = 捉(() => R().roll('1d20', { purpose: 'attack.hit', actor: '甲' }));
		assert.eq(e?.code, 'DICE_ARM_AMBIGUOUS', `同定位两条须具名拒（实得 ${e && e.code}）`);
		C().clearAll();
	});

	/* ───────── ④ 多骰伤害逐颗 ＋ 原子性 ───────── */

	test('★#2031 ④【多骰逐颗】`2d6` 按 `slot` 各指定一面 ⇒ 逐颗落地（✗ 只控第一颗）', () => {
		清();
		C().arm({ purpose: 'damage', actor: '甲', slot: 0, faces: [6] });
		C().arm({ purpose: 'damage', actor: '甲', slot: 1, faces: [1] });
		const r = R().rollDetail('2d6', { purpose: 'damage', actor: '甲' });
		assert.eq(JSON.stringify(r.rolls), JSON.stringify([6, 1]), `★逐颗须各按 slot 落地：${JSON.stringify(r.rolls)}`);
		assert.eq(r.total, 7, '总数照算（6+1）');
		C().clearAll();
	});

	test('★#2031 ④【原子性】某颗面**越界** ⇒ **整次具名拒且零部分消费**（✗ 半掷）', () => {
		清();
		C().arm({ purpose: 'damage', actor: '甲', slot: 0, faces: [6] });      // 合法（d6）
		C().arm({ purpose: 'damage', actor: '甲', slot: 1, faces: [9] });      // 越界（d6 里 ✗ 有第 9 面）
		const 账前 = C().log().length;
		const e = 捉(() => R().rollDetail('2d6', { purpose: 'damage', actor: '甲' }));
		assert.eq(e?.code, 'DICE_FACE_OUT_OF_RANGE', `越界须具名拒（实得 ${e && e.code}）`);
		const 账 = C().报告();
		assert.eq(账.额度账.find((x) => x.slot === 0).已消费, 0, '★合法的 slot0 **也**✗ 得被吃（先验后掷 ⇒ 零部分消费）');
		assert.eq(C().log().length, 账前, '★骰序账 ✗ 留半条');
		C().clearAll();
	});

	test('★#2031 ④【F1·多骰越界】臂 ✗ 给 `slot`、面表里**后一颗**越界 ⇒ **整次具名拒且零消费**（✗ 第 2 颗漏检）', () => {
		清();
		/* ★病灶（`developer` 首轮 RC · 真伤）：预检原版**一律验 `faces[0]`** ⇒ 一条臂喂多颗时，
		 *   第 2 颗及其后**从未被校验** ⇒ `2d6` 可掷出 d6 域外的面并**真进结算**。 */
		C().arm({ purpose: 'damage', actor: '甲', faces: [3, 99] });   // ✗ 给 sides ⇒ 规格 §四.1：留到消费时按**实际骰型**验
		const 账前 = C().log().length;
		const e = 捉(() => R().rollDetail('2d6', { purpose: 'damage', actor: '甲' }));
		assert.eq(e?.code, 'DICE_FACE_OUT_OF_RANGE', `★后一颗越界也须整次拒（实得 ${e && e.code}）`);
		assert.eq(e.extra?.第几面, 2, `★拒须点名「第几面」（实得 ${JSON.stringify(e?.extra)}）`);
		assert.eq(C().log().length, 账前, '★骰序账 ✗ 留半条（先验后掷）');
		assert.eq(C().报告().额度账.find((x) => x.purpose === 'damage').已消费, 0, '★零消费（第一颗也✗ 能吃）');
		C().clearAll();
		/* 合法臂（同形：✗ 给 `slot`、两颗面都在域内）⇒ 按**顺序**逐颗落地 ✓（证「按消费序预检」✗ 误伤合法臂） */
		C().arm({ purpose: 'damage', actor: '甲', faces: [3, 5] });
		const r = R().rollDetail('2d6', { purpose: 'damage', actor: '甲' });
		assert.eq(J(r.rolls), J([3, 5]), `★合法多骰须按**顺序**落地：${J(r.rolls)}`);
		C().clearAll();
	});

	/* ───────── ⑤ 重击确认分得开 ───────── */

	test('★#2031 ⑤【重击确认】`attack.hit` 与 `attack.crit` **分得开**（同一次攻击里各吃各的）', () => {
		清();
		C().arm({ purpose: 'attack.hit', actor: '甲', faces: [20] });
		C().arm({ purpose: 'attack.crit', actor: '甲', faces: [20] });
		const { a, t } = 对打({ ac: 25 });            // hit 20+5=25 恰中；crit 20+5=25 ≥ 25 ⇒ 确认成功
		const club = 件('club');
		const msgs = []; club.perform = (m) => msgs.push(String(m));
		定序(0.0);
		try { D().meleeAttack(club, t, a); } finally { R().rng.reset(); }
		const 账 = C().log();
		assert.eq(账.filter((x) => x.purpose === 'attack.crit').length, 1, '★威胁面（20）之后须真的掷**确认**，且记 `attack.crit`');
		assert.eq(账.find((x) => x.purpose === 'attack.crit').face, 20, '确认面须是**自己那条**的 20');
		assert.ok(msgs.some((m) => /重击/.test(m)), `确认成功须出重击文案：${JSON.stringify(msgs)}`);
		C().clearAll();
		/* 对照臂：确认面給 1 ⇒ ✗ 重击（证明 `attack.crit` **单独可控**，✗ 跟着 `attack.hit` 走） */
		C().arm({ purpose: 'attack.hit', actor: '甲', faces: [20] });
		C().arm({ purpose: 'attack.crit', actor: '甲', faces: [1] });
		const 对2 = 对打({ ac: 25 });                 // hit 恰好命中；crit 1+5=6 < 25 ⇒ ✗ 重击
		const club2 = 件('club');
		const msgs2 = []; club2.perform = (m) => msgs2.push(String(m));
		try { D().meleeAttack(club2, 对2.t, 对2.a); } finally { R().rng.reset(); }
		assert.eq(msgs2.some((m) => /重击/.test(m)), false, '★确认面 1 ⇒ ✗ 重击（两条用途各自可控）');
		C().clearAll();
	});

	/* ───────── ⑥ 旧账（`setSequence`）不假绿 ＋ 共存 ───────── */

	test('★#2031 ⑥【共存】受控路径**✗ 吃**旧注入序列；旧序列抽尽仍抛具名 `RNG_EXHAUSTED`', () => {
		清();
		R().rng.setSequence([0.95]);                       // 若被吃 ⇒ d6 出 6
		C().arm({ purpose: 'damage', actor: '甲', slot: 0, faces: [3] });
		assert.eq(R().roll('1d6', { purpose: 'damage', actor: '甲' }), 3, '受控 ⇒ 出指定面 3');
		assert.eq(R().roll('1d6'), 6, '★旧序列**仍在**（受控那次 ✗ 吃它）⇒ 这次出 6');
		const e = 捉(() => R().roll('1d6'));
		assert.eq(e?.code, 'RNG_EXHAUSTED', `★抽尽须仍抛具名码（实得 ${e && e.code}）`);
		R().rng.reset();
		C().clearAll();
		const 坏 = 捉(() => R().rng.setSequence([]));
		assert.ok(坏, '`setSequence([])` 仍拒（既有契约未动）');
	});

	/* ───────── ⑦ 清除 / 耗尽恢复 ───────── */

	test('★#2031 ⑦【恢复】配额用尽或 `clear`／`clearAll` 后 ⇒ 同用途回到**正常随机**', () => {
		清();
		const 收 = C().arm({ purpose: 'damage', actor: '甲', slot: 0, faces: [3] });
		assert.eq(R().roll('1d6', { purpose: 'damage', actor: '甲' }), 3, '第一次吃面 3');
		定序(0.0);                                          // 之后走正常随机 ⇒ d6 出 1
		assert.eq(R().roll('1d6', { purpose: 'damage', actor: '甲' }), 1, '★配额用尽 ⇒ 自动失效、回正常随机');
		assert.eq(C().报告().额度账.length, 0, '用尽的条目须从额度账里退场');
		const 收2 = C().arm({ purpose: 'damage', actor: '甲', slot: 0, faces: [3] });
		assert.eq(C().clear(收2.armId), true, 'clear 须撤到');
		assert.eq(C().clear(收2.armId), false, '（重复 clear ✗ 报成功）');
		assert.eq(R().roll('1d6', { purpose: 'damage', actor: '甲' }), 1, '★clear 之后 ⇒ 正常随机');
		C().arm({ purpose: 'damage', actor: '甲', slot: 0, faces: [3] });
		assert.eq(C().clearAll(), 1, '`clearAll` 须返回撤掉条数');
		assert.eq(C().当前场次(), null, '`clearAll` 须一并清场次号');
		assert.eq(C().报告().额度账.length, 0, '清完额度账须空');
		R().rng.reset();
	});

	/* ───────── ⑧ 默认零改 ───────── */

	test('★#2031 ⑧【默认零改】✗ 控制、✗ 用途标注 ⇒ 骰面与既有**逐字相同**且零记账开销', () => {
		清();
		定序(0.5);
		assert.eq(R().roll('1d6'), 4, 'd6 面取法未动（1+floor(0.5*6)=4）');
		assert.eq(C().log().length, 0, '✗ 控制/✗ 用途 ⇒ 骰序账零条（✗ 偷偷记账）');
		assert.ok(C().报告().底层计数.unit调用 > 0, '底层计数仍记（三账分记之一）');
		R().rng.reset();
	});

	/* ───────── ⑨ 不入档 / 正式局隔离 ───────── */

	test('★#2031 ⑨【隔离】装控制并消费之后，`State.variables` **逐字不变**（活动控制面 ✗ 入档）', () => {
		清();
		const 前 = JSON.stringify(State.variables);
		C().arm({ purpose: 'damage', actor: '甲', slot: 0, faces: [3] });
		R().roll('1d6', { purpose: 'damage', actor: '甲' });
		assert.eq(JSON.stringify(State.variables), 前, '★控制面与记账须**住内存**（✗ 写故事变量 ⇒ ✗ 进档）');
		C().clearAll();
	});

	test('★#2031 ⑨【场次维度】`场次(id)` 让控制只在**该事件**里生效（换场次即未定位、不消费）', () => {
		清();
		C().场次('t1');
		C().arm({ purpose: 'attack.hit', actor: '甲', instance: 't1', faces: [20] });
		assert.eq(R().roll('1d20', { purpose: 'attack.hit', actor: '甲' }), 20, '本场次内 ⇒ 吃指定面');
		C().场次('t2');
		定序(0.0);                                       // 之后走正常随机 ⇒ d20 出 1
		assert.eq(R().roll('1d20', { purpose: 'attack.hit', actor: '甲' }), 1, '换场次 ⇒ ✗ 匹配（走正常随机）');
		assert.eq(C().log().filter((x) => x.source === '正常' && x.purpose === 'attack.hit').length >= 1, true,
			'未匹配那次须记「正常」（✗ 静默）');
		C().clearAll();
	});
})();
