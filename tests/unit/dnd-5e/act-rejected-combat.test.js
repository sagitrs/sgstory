/* `#1813` 笔 2（`dnd-5e` ＋ `d20m`）：`used()` 层**攻击结算拒绝**须**可判**
 *
 * 缺陷：攻击层在「打不出去」（腾不出手／没弹药）时**只 `return;`**（`undefined`）⇒ `#1776` 契约
 *   把它算作 **`applied`** ⇒ `40-battle.js #noteReject` **清零 `rejectStreak`** ⇒ `#1773` 的三连
 *   拒绝护栏在这一面**失效**。
 * 本笔：攻击层「拒绝」处改 `return false`，**并**让武器件的 `used()` **转发**该返回值
 *   —— ★任一侧单独改**无效**（返回值被丢弃，见 `#1813` 票面实测）。
 *
 * ★★**本档的 id 选择是刻意的**：dnd-5e 与 dnd3 **同名遮蔽**（`sword`／`club`／`bomb` 都解析到 **dnd3**，
 *   后注册者胜）⇒ 要用**本包**的攻击函数就**必须用本包独有的 id**（`dagger`／`pistol`／`musket`）。
 *   若这里写 `club`，本档会**静默地**去测 `dnd3` 的攻击层 —— 与笔 1 的档撞车且**测不到本包**。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND5E;
	const mkFoe = (ac = 10) => new (R().Character)({ name: '靶', hp: 99, maxHp: 99, stats: { ac } });

	test('★#1813 ③（正例·腾不出手）：握着 A 用未装备的 B ⇒ `rejected/action-refused`（✗ 算作推进）', () => {
		R().give('musket'); R().equip('musket');   // A：已握在手里（本包件）
		R().give('dagger');                        // B：未装备 ⇒ 腾不出手（本包近战件 ⇒ 该支**可达**）
		const r = R().act(D().Player, 'dagger', mkFoe());
		assert.eq(r?.status, 'rejected', `★拒绝须**可判**（✗ 被算作 applied）：${JSON.stringify(r)}`);
		assert.eq(r?.reason, 'action-refused', '理由为动作自己拒绝');
	});

	test('★#1813 ④（正例·没弹药）：★**两层**皆须拒 —— `act` 前置（`no-ammo`）＋ 攻击层兜底（`used()====false`）', () => {
		/* ★dnd-5e **有两条**拒绝点（腾不出手／没弹药），✗ 只测前一条 —— 否则 `:159` 那条无人守。
		 *   dnd3 无 ammo 件（`grep ammo` 空）⇒ 这一面**只有本包**能测。
		 *
		 * ★★**「没弹药」是两层，✗ 一层**（`30-inventory.js:328-344` 设计注）：
		 *   ① **`RPG.act` 前置**：`action === 'use' && item.stats.ammo` 且 `ammoShort` ⇒ **先**返回
		 *      `rejected/no-ammo`，并置 `item.__ammoPaid = true`（单次标记）── 此时**根本走不到**攻击层；
		 *   ② **攻击层兜底**（本笔改的 `:159`）：置了标记后 `RPG.ammoOwed(item)` 为假 ⇒ 跳过；
		 *      故该支只在**未置标记**时可达（直调 `used()`／`DND5E.attack`，或 `action !== 'use'`）。
		 *   ⇒ 两层**各测一格**，✗ 只测①（那会让人以为②已被覆盖）。 */
		R().give('pistol');                        // 需 `bullets-firearm`，**故意不给**
		/* ① `act` 前置：reason 是 `no-ammo`（**✗ `action-refused`** —— 它在动作**之前**拦下） */
		const r = R().act(D().Player, 'pistol', mkFoe());
		assert.eq(r?.status, 'rejected', `★无弹须被拒（✗ applied）：${JSON.stringify(r)}`);
		assert.eq(r?.reason, 'no-ammo', '① 这是 `act` 的**弹药前置**（✗ 动作自己拒绝）');
		/* ② 攻击层兜底：直调 `used()`（未被前置置标记）⇒ 须**显式 `false`**（＝本笔的契约面） */
		const it = R().reviveItem(State.variables.inventory.find((s) => s.id === 'pistol'));
		assert.eq(it.used(mkFoe(), D().Player), false,
			'② ★攻击层兜底须 `=== false`（✗ `undefined` ⇒ 会被算作 applied）');
	});

	test('★★#1813 ⑤（对照·挥空）：攻击**已发生**只是没中 ⇒ 必须仍为 `applied`（**确定性**：掷骰恒 1）', () => {
		/* ★本格是**判别格**：若实现者把攻击层裸 `return;` **全改** `return false`，本格会红 ——
		 *   而那是**新缺陷**（「连打三下没中」会触发 `#1773` 三连护栏强制跳过回合）。
		 *
		 * ★★**确定性做法（范本＝`#1783 ⑨`）**：注入 `RPG.rng` 序列让攻击**必然**失手，
		 *   并**单次** `act` ＋ **前置断言**（靶确实没掉血）以证「本格走的正是失手路径」。
		 *   ⚠ **✗ 用「目标 AC 极高」当必空**：`critMin` 默认 20，而失手支的前置是 `die < critMin`
		 *     ⇒ **天然 20 绕过它、与 AC 无关**；更**✗ 加 `for` 重试循环** —— 那会在「1/20 命中那次」
		 *     退出并断言绿 ⇒ **概率格**（`#1846` RC 实测：同一突变下 3/8 次仍绿）。 */
		R().give('coin');                                       // 先初始化背包（供 give/revive 路径）
		const p = new (R().Character)({ name: '甲', hp: 20, maxHp: 20,
			items: [{ id: 'dagger', equipped: true, charges: null }], stats: { ac: 12 } });
		p.effects = [];                                         // `traumaAttackMod` 会读它
		const foe = mkFoe(25);
		foe.hp = 10;
		R().rng.setSequence([0.0, 0.0, 0.0, 0.0]);              // 掷骰恒 1 ⇒ **确定**失手（`1 + mod < 25`）
		try {
			const r = R().act(p, 'dagger', foe, 'use');
			assert.eq(r?.status, 'applied', `★失手 ＝ 攻击已发生 ＝ 成功（✗ 拒绝）：${JSON.stringify(r)}`);
			assert.eq(foe.hp, 10, '前置：确实**没命中**（靶未掉血）⇒ 本格测的正是「挥空」这条路径');
		} finally {
			R().rng.reset();                                    // 测试卫生：rng 用完必复位
		}
	});
})();
