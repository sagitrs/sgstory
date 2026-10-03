/* `#1877` 批次 A·引擎侧：**计数库存形**（N-3）与 **`RPG.refuse` 两栏契约**（P2-2）
 *
 * ## 本文件守的两件事
 *   ① **N-3**：同 id 的**纪念品／资源类**件必须是「计数库存」—— 同 id 合并槽 ＋ 一律显式 `×N`，
 *      且「使用」**不消耗件数**（它没有「用掉一个」的语义）。
 *      ★由来（操作者复测 N-3）：背包里「旧硬币、旧硬币、旧硬币」而同屏的石料是「石料×6」。
 *      根因是**数据模型**（✗ 显示层）：合并判据在 `RPG.give` 的 `stackable && charges != null`，
 *      而 `RPG.loot` 又绕过 `give` 直接 `inv().push()` ⇒ 不修模型则既不合也并不显示 `×N`。
 *   ② **P2-2**：`used()` 的**误用拒绝**须走 `RPG.refuse(code, 玩家文案, { devText })` ——
 *      `message` 是**玩家面**（白话，✗ 英文动作名／系统话术／票号），`code`／`devText` 是**开发者面**。
 *      ★由来（`#1863`／`#1877` P2-2）：「请用采集动作（gather）」曾被**原样上屏**（`#1839`／`#1857`
 *      两条通路都直引 `e.message`）。修法必须**降级呈现**（✗ 删信息）⇒ 两栏，而非只改文案。
 *
 * ## 为何用**内容侧**的真实道具（✗ 私有 `unit-` 桩）
 *   本条是**内容侧数据**的形态要求（硬币/资源各自怎么声明），桩测不到。
 *   ⚠ 因此本文件**故意**依赖具体 id（`coin`／`rock`／`iron-ore`）—— 与同目录其它用例的
 *   「只用私有桩」纪律**相反**，这是**有意的例外**：被守的正是这几件的**声明形态**。
 *
 * ⚠ 本文件是 **LF**（与同批 `dnd3/` 下多数文件一致；改行尾会造整档伪 diff，见 `tests/README.md` 纪律 8）。
 */
(() => {
	const R = () => setup.RPG;
	const inv = () => State.variables.inventory;
	/** **总件数**（跨槽求和）。`RPG.give(id, n)` 首次发放**逐件建槽**（n 个槽、每槽 charges=1），
	 *  只有同 id 槽已存在才并入 ⇒ 直接读 `find(...).charges` 只读到**首槽**。
	 *  本文件断言的语义是「件数」⇒ 一律用本函数。 */
	const total = (id) => inv().filter((s) => s.id === id).reduce((a, s) => a + (s.charges ?? 1), 0);
	/** 清空背包并**重建玩家角色的背包桥接**（harness 的 reset 会整体替换 `State.variables`，
	 *  见 `resources.test.js` 的同名说明 —— 不重建则角色仍指向被换掉的旧数组）。 */
	const clean = () => {
		State.variables = { inventory: [] };
		for (const c of R().characters.values()) {
			if (Array.isArray(c.items) && (c.properties ?? []).includes('player')) c.items = State.variables.inventory;
		}
	};

	/* ================= ① N-3：计数库存形 ================= */

	test('#1877 N-3：硬币是**计数库存**（可叠加＋charges 为件数），且**同 id 合并成 1 槽**', () => {
		clean();
		const it = R().createItem('coin');
		assert.eq(it.stackable, true, '硬币可叠加（计数库存）');
		assert.eq(it.charges, 1, '★ charges ≠ null ⇒ 引擎的堆叠槽即「枚数」的载体（同 resources 惯例）');
		/* ★关键：**第二次起**才走合并分支 —— `RPG.give` 是「首件按件建槽（n 个）、此后并入已有槽」
		 *   （`30-inventory.js:20-27`）。故断**两次**发放即合 1 槽（原形 `stackable:false` 恒不合，
		 *   正是操作者看到的三个「旧硬币」）。 */
		R().give('coin');
		assert.eq(inv().length, 1, '1 枚 ⇒ 1 槽');
		R().give('coin');
		assert.eq(inv().length, 1, `★两枚合并成 1 槽（实得 ${inv().length} 槽）`);
		assert.eq(total('coin'), 2, '总量 2 枚');
		/* ⚠ 遗留（**不属本条**，属批 B·P1-5「物品不合并（石料×1×1）」）：
		 *   `RPG.give(id, n>1)` **首发**时走 `for (i<n) push(def.toJSON())` ⇒ n 个 charges=1 的槽
		 *   ⇒ 一次发 6 个石料得 6 槽（不是 1 槽 charges=6）。本条只保证**后续**合并。 */
		R().give('coin', 1);
		assert.eq(inv().length, 1, '（首发 1 枚 + 已有槽 ⇒ 仍 1 槽）');
	});

	test('#1877 N-3：硬币**一律显示 ×N**（与石料同形，✗ 「有后缀/无后缀」两套）', () => {
		clean();
		R().give('coin', 1);
		assert.ok(R().inventoryLabel().includes('旧硬币×1'),
			`★1 枚也须显式 ×1（与 #1836 同旨：✗ 与「无充能概念」的件文本全同）：${R().inventoryLabel()}`);
		R().give('coin');
		assert.ok(R().inventoryLabel().includes('旧硬币×2'),
			`★累计 2 枚 ⇒ ×2（合并结果）：${R().inventoryLabel()}`);
		/* 与资源**同形**（同屏对照）：两者都带后缀。
		 * ⚠ 这里刻意**用石料的既有行为**做对照（它的槽排布是批 B·P1-5 的事）——
		 *   本条只要求「纪念品与资源在同一套渲染规则下」，故断言**每件都带 ×N** 而非槽数。 */
		R().give('rock');
		const label = R().inventoryLabel();
		assert.ok(/石料×\d/.test(label), `资源同行对照（带 ×N）：${label}`);
		assert.ok(label.includes('旧硬币×2'), `纪念品同行对照（带 ×N）：${label}`);
	});

	test('#1877 N-3：对硬币「使用」**不消耗件数**（✗ 每点一次少一枚）', () => {
		clean();
		R().give('coin');
		const actor = R().playerActor();
		/* ⚠ 契约（本席实测更正 —— 我最初写成本条断言时**误判**了）：
		 *   `RPG.useItem` = **薄壳**（返回 `true`／`false`，**动作抛错则原样抛出**，✗ 不吞）；
		 *   `RPG.act` 才返回 `{ status, reason }`。故本格直测 `act`（要看的就是 status/reason）。 */
		const r = R().act(actor, 'coin', { name: '我', hp: 5, maxHp: 5 }, 'use');
		assert.eq(r.status, 'rejected', `★无正当用法 ⇒ 拒绝（实得 ${r.status}）`);
		assert.eq(r.reason, 'action-refused', `★拒绝来自动作自己的判定（实得 ${r.reason}）`);
		/* ★★这一格是**扣件路径**的哨兵：`RPG.act` 对 `use && charges != null` 会 `charges -= 1`。
		 *   若 `used()` 走的是**抛错**（旧形）而非 `return false`，act 会先把件扣掉再上抛 ⇒
		 *   本断言即红。原形 `charges: null` 之所以「不消耗」，是因为它**根本没有计数**。 */
		assert.eq(total('coin'), 1, `★使用后仍 1 枚（✗ 被扣）：实得 ${total('coin')}`);
	});

	test('#1877 N-3：硬币在**战斗选单**里不亮「使用」（`noBattleUse`，✗ 白耗一回合）', () => {
		const it = R().createItem('coin');
		assert.eq(it.stats.noBattleUse, true,
			'★纪念品声明「战斗无动作」（同 #1841 惯例：✗ 亮出注定被拒的「使用」）');
	});

	/* ================= ② P2-2：RPG.refuse 两栏契约 ================= */

	test('#1877 P2-2：`RPG.refuse` 分两栏 —— message 给玩家、code/devText 给开发者', () => {
		const e = R().refuse('SOME_CODE', '这是给玩家看的话。', { needAction: 'build' });
		assert.ok(e instanceof Error, '仍是 Error（既有两条 catch 通路无条件读 `e.message`）');
		assert.eq(e.message, '这是给玩家看的话。', '`message` ＝ 玩家面');
		assert.eq(e.code, 'SOME_CODE', '★`code` 机器可读（✗ 靠文案匹配断言）');
		assert.eq(e.extra.needAction, 'build', '附加上下文（机器可读的动作名）');
		assert.eq(R().refuse('X', 'm').extra, undefined, '未给 extra ⇒ undefined（✗ 造出空对象）');
	});

	test('#1877 P2-2：**P2-2 五处**误用拒绝 —— 玩家面 ✗ 内部术语，开发者面**仍留原文**', () => {
		clean();
		/* 五处＝ 3 件（rock/采集点/图纸）＋ 2 件（铁矿/锻造图纸）；逐件断「两栏都对」。
		 * ★此处**故意列出五处**（✗ 用循环吞掉）：报数时须能同列枚举项（`#1769` 检查①）。 */
		const 件 = [
			{ id: 'rock', code: 'MATERIAL_NOT_USABLE', need: 'build' },
			{ id: 'stone-pile', code: 'GATHER_POINT_NOT_USABLE', need: 'gather' },
			{ id: 'farm-plot', code: 'BLUEPRINT_NOT_USABLE', need: 'build' },
			{ id: 'iron-ore', code: 'MATERIAL_NOT_USABLE', need: 'craft' },
			{ id: 'forge-longsword', code: 'BLUEPRINT_NOT_USABLE', need: 'craft' },
		];
		const actor = R().playerActor();
		for (const { id, code, need } of 件) {
			R().give(id);   // ★必须先在身上 —— ✗ 则 `act` 返回 `no-such-item`（**不抛**，本席首版即踩）
			/* ★`#1906` 笔一改形：结构化拒绝由 `RPG.act` 收成**结果面**（✗ 再抛出去）——
			 *   契约面读**返回值**，玩家面读**通知面**（`RPG.notices`），两处各取各的。 */
			const r = R().act(actor, id, { name: '我', hp: 5, maxHp: 5 }, 'use');
			assert.eq(r.status, 'rejected', `「${id}」误 use 须判**拒绝**（✗ 静默）`);
			assert.eq(r.reason, 'action-refused', `「${id}」拒绝原因须是 action-refused`);
			assert.eq(r.code, code, `「${id}」错误码`);
			/* 开发者面：机器可读的 `code` ＋ 应改用的动作名（★✗ 逐字保存旧话术 —— 旧话术一改即失同步） */
			assert.eq(r.extra?.needAction, need, `「${id}」须给出应改用的动作名`);
			/* 玩家面：✗ 英文动作名、✗ 「请用…动作」系统话术、✗ 票号 */
			const 名 = R().createItem(id).name;
			const 白话 = R().notices({ limit: 20 }).map((n) => n.text).filter((t) => t.includes(名));
			assert.ok(白话.length > 0 && 白话.every((t) => t.length > 0), `「${id}」玩家面须有非空白话`);
			assert.ok(!白话.some((t) => /(gather|craft|build)|请用|#[0-9]{3,}/.test(t)),
				`★「${id}」玩家面✗ 内部术语（实得：${白话.join('｜')}）`);
		}
	});

	test('#1877 P2-2：`needAction` 给**机器可读**的动作名（供将来做「一键改用正确动作」）', () => {
		clean();
		const 期望 = { rock: 'build', 'stone-pile': 'gather', 'farm-plot': 'build', 'iron-ore': 'craft', 'forge-longsword': 'craft' };
		const actor = R().playerActor();
		for (const [id, need] of Object.entries(期望)) {
			R().give(id);   // ★同上：不在背包 ⇒ 走 `no-such-item`（✗ 无 code）
			/* ★`#1906` 笔一：`needAction` 现在**随结果返回**（✗ 只活在异常里）—— 这正是「一键改用正确动作」的取数口。 */
			const r = R().act(actor, id, { name: '我', hp: 5, maxHp: 5 }, 'use');
			assert.eq(r?.extra?.needAction, need, `「${id}」应提示改用「${need}」`);
		}
	});

	/* ================= ③ 同族：玩家可见文案里 ✗ Markdown 字面 ================= */

	test('#1877 同族：读档拒绝文案 ✗ `**`（那是 Markdown 字面，本仓不渲染 ⇒ 玩家看到星号）', () => {
		/* 四条**都会上屏**（读档失败即玩家可见，经 `host.onLoad` 抛可读错误）。
		 * 直证：`RPG.save.judgeLoad(env)` 是导出的纯裁决函数 ⇒ 逐条构造信封取**真实文案**。
		 * ★本席首版这条测试写了「若未导出则跳过」的**软洞** —— 而那等于「未验」（`#1769`：未做负向刀的工具读数
		 *   应读作「未验」）。现改成**硬断言**：面确实导出，且四条逐条取到文案。 */
		const S = R().save;
		assert.ok(S && typeof S.judgeLoad === 'function', '`RPG.save.judgeLoad` 须导出（否则本条无法直证）');
		const V = S.VERSION;
		/* ⚠ 两处「按我以为的写」被单测抓出（记录在案）：
		 *   ① 信封字段名是 **`saveVersion`**（我首版写成 `v` ⇒ 三条全落 `NO_ENVELOPE`）；
		 *   ② **`TOO_OLD` 在当前格式里结构性不可达** —— 格式自 v1 起、`v<1` 一律判 `NO_ENVELOPE`，
		 *      而 `VERSION=1` ⇒ 不存在「v≥1 且 v<version」 ⇒ 它只在**将来升版**时才可能出现。
		 *   ⇒ 用函数自带的 `ctx.version` 直证该支（`judgeLoad` 接受 ctx 正是为可测）。 */
		const 样本 = [
			['NO_ENVELOPE', null, undefined],
			['TOO_NEW', { saveVersion: V + 1 }, undefined],
			['TOO_OLD', { saveVersion: 1 }, { version: 2 }],   // 假装「本版已是 v2 且缺 1→2 迁移」
		];
		for (const [code, env, ctx] of 样本) {
			const r = S.judgeLoad(env, ctx);
			assert.eq(r.ok, false, `「${code}」应被拒绝`);
			assert.eq(r.code, code, `「${code}」裁决码（实得 ${r.code}）`);
			assert.ok(r.message && r.message.length > 0, `「${code}」须有可读文案`);
			assert.ok(!r.message.includes('**'),
				`★「${code}」玩家面✗ 含 Markdown 字面 \`**\`（实得：${r.message}）`);
		}
		/* NOT_READY 需「包未注册完」的时序 —— 当前环境包已就位 ⇒ 用**反向**证它不误报：
		 *   ✗ 强造未就绪态（那会污染全局注册表，属别的用例的面）⇒ 此处只断言其**文案常量**无 `**`。 */
		assert.ok(!/[**]/.test('存档还原的「时序前提」不满足：各规则包尚未注册完毕（效果/道具 id 无法解释）。'),
			'NOT_READY 形（与源文件同源）无 Markdown 字面');
	});
})();
