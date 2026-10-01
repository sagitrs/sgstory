/* `#1813` 笔 2 · `d20m` 面（`D20M.attack`）
 *
 * ★★**本档为何只有「对照格」没有「正例格」** —— 我实测的可达性（✗ 猜）：
 *   `d20m` 包**只有一件武器** —— `beretta-92f`，且它 `stats.ranged === true`；
 *   而本包**唯一**的拒绝支是 `combat.js` 的
 *      `if (!isRanged && !item.equipped) { … if (held && held.id !== item.id) { … return false; } }`
 *   ⇒ 要触发它，须存在**非 ranged 的 `slot:'weapon'`** 件 —— **本包没有**（`grep "slot: 'weapon'"` 只有那一件）
 *   ⇒ 该支**结构性不可达**（同 `#1783` 的 `slotEquip` 首支、`#1817` 的扩展点）。
 *   ⇒ 该处的 `return false` 是**契约性改动**（三包同形），**无行为面可测** ⇒ **不写假正例格**。
 *   ★**但可达性本身被钉住**（下方末格）：一旦本包**新增近战武器**，该格会红 ⇒ 那时必须补正例格。
 *
 * 失手面**可达且必须可达**：本包失手是 `D20M.attack` **函数体内**的早退 `return;`（✗ 管线阶段）
 *   ⇒ 把它改成 `return false` **确实**会把「没击中」变成拒绝 ⇒ 真危险 ⇒ 对照格必要。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.D20M;

	test('★★#1813 ⑥（对照·没击中）：攻击**已发生**只是没中 ⇒ 必须仍为 `applied`（**确定性**：掷骰恒 1）', () => {
		/* 判别格：若实现者把 `D20M.attack` 的失手早退 `return;` 改成 `return false`，本格会红 ——
		 *   而那是**新缺陷**（「连打三下没中」会触发 `#1773` 三连护栏强制跳过回合）。 */
		R().give('coin');                                       // 先初始化背包（供 give/revive 路径）
		const p = new (R().Character)({ name: '甲', hp: 20, maxHp: 20,
			items: [{ id: 'beretta-92f', equipped: true, charges: null }], stats: { ac: 12 } });
		p.effects = [];                                         // 攻击修正会读它
		const foe = new (R().Character)({ name: '靶', hp: 10, maxHp: 10,
			items: [{ id: 'coin' }], stats: { ac: 25 } });
		R().rng.setSequence([0.0, 0.0, 0.0, 0.0]);              // 掷骰恒 1 ⇒ **确定**失手（`1 + mod < 25`）
		try {
			const r = R().act(p, 'beretta-92f', foe, 'use');
			assert.eq(r?.status, 'applied', `★没击中 ＝ 攻击已发生 ＝ 成功（✗ 拒绝）：${JSON.stringify(r)}`);
			assert.eq(foe.hp, 10, '前置：确实**没命中**（靶未掉血）⇒ 本格测的正是「没击中」这条路径');
		} finally {
			R().rng.reset();                                    // 测试卫生：rng 用完必复位
		}
	});

	test('★#1813 ⑦【可达性棘轮】`d20m` 须**仍无可达的拒绝面**（新增近战武器 ⇒ 本格红 ⇒ 须补正例格）', () => {
		/* 本包唯一拒绝支要求「非 ranged 的 weapon 件」；一旦有了它，`:73` 那一支**变为可达**，
		 *   而本档此刻**没有**覆盖它的正例格 ⇒ 该事实必须**当场变红**，✗ 静默漏过。
		 *   ⇒ 本格把「不可达」这个**前提**本身钉住（照 `#1817` 的「扩展点若结构性不可达 ⇒ 显式登记」取向）。 */
		const 非远程武器 = [];
		for (const f of fs.readdirSync('src/dnd/d20m/items')) {
			if (!f.endsWith('.js')) continue;
			const s = fs.readFileSync(`src/dnd/d20m/items/${f}`, 'utf8');
			if (!/slot:\s*'weapon'/.test(s)) continue;
			if (!/ranged:\s*true/.test(s)) 非远程武器.push(f);
		}
		assert.eq(非远程武器.length, 0,
			`★d20m 新增了**近战**武器 ⇒ 拒绝支（腾不出手）**变为可达** ⇒ 本档须补正例格（✗ 靠人记得）：`
			+ JSON.stringify(非远程武器));
	});
})();
