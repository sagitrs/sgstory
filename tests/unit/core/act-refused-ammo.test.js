/* #1801：`act` 走 `action-refused` 时**弹药已被扣** —— 拒绝却消耗（修后回归格）
 *
 * ## 缺陷（本席于 `#1797` 审中实测发现，零报错静默面）
 *   原形在**扣弹之后**才跑动作，而动作**可显式拒绝**（`used()` 返回 `false`，如 `#1776` 建造的「材料不足」）
 *   ⇒ **拒绝却已消耗弹药**（实测 9→8）。
 * ## 修法（三步形，见 `30-inventory.js` 的注）
 *   ① 只读预判（`RPG.ammoShort`，量取 `heldTotal` ⇒ 与 `take` 同口径）② 置标记→跑动作 ③ **接受后才真扣**
 *   ⇒ 两条拒绝路径（`no-ammo`／`action-refused`）**一律零副作用**。
 * ## ★本文件的要害（防「空转解」）
 *   只断言「拒绝不扣」是不够的——**把扣减整个删掉**也能让它绿。故必须配**正对照**：
 *   正常开火**恰扣 1**；且**同一动作内不得两扣**（`__ammoPaid` 标记 ＋ `DND5E.attack` 兜底的纵深防御）。
 */
(() => {
	const R = () => setup.RPG, D = () => setup.DND5E;
	const BULLET = 'bullets-firearm', MUSKET = 'musket';   // ★用**真货**（真值链：道具真值 ⇒ heldTotal）

	/** 造一个角色（真火枪 ＋ n 发真子弹；n = null ⇒ 不给子弹袋） */
	const CH = (name, n) => {
		const c = new (R().Character)({ name, hp: 60, maxHp: 60, stats: D().stats({ ac: 12 }) });
		c.items = [{ id: MUSKET, equipped: true, charges: null }];
		if (n != null && n > 0) c.items.push({ id: BULLET, charges: n });
		return c;
	};
	const FOE = () => new (R().Character)({ name: '靶', hp: 500, maxHp: 500, stats: D().stats({ ac: 10 }) });

	/* ---------- 判据 1＋2：拒绝路径**零副作用**（弹药／charges／equipped 全不变） ---------- */

	test('★#1801 判据 1＋2：`action-refused` ⇒ 弹药**零变更**（缺陷本体）＋ charges/equipped 亦不变', () => {
		/* 造一件**带弹药**且**显式拒绝**的条目（`#1776` 的「材料不足」同形）——用私有 id，
		 * 因真货里没有「会拒绝」的带弹条目；其 `stats.ammo` 指向真子弹 ⇒ 真值链与生产一致。 */
		R().defItem({
			id: 'unit-refuser-gun', name: '拒收枪', weapon: true, slot: 'weapon', stackable: false, charges: 5,
			stats: { dmg: '1d6', type: 'piercing', ranged: true, ammo: { id: BULLET } },
			used() { this.perform('（本次做不到）'); return false; },
		});
		const c = new (R().Character)({ name: '甲', hp: 60, maxHp: 60, stats: D().stats({ ac: 12 }) });
		c.items = [{ id: 'unit-refuser-gun', equipped: true, charges: 5 }, { id: BULLET, charges: 9 }];
		const slot = c.items.find((s) => s.id === 'unit-refuser-gun');

		const r = R().act(c, 'unit-refuser-gun', FOE(), 'use', c);

		assert.eq(r.status, 'rejected', '动作显式拒绝 ⇒ rejected');
		assert.eq(r.reason, 'action-refused', '原因为 action-refused');
		assert.eq(R().heldTotal(c, BULLET), 9, '★★弹药**零变更**（9→9；修前为 9→8 ＝ 本缺陷）');
		assert.eq(slot.charges, 5, '武器 charges 亦不变（修法不得顺手改动提交序）');
		assert.eq(slot.equipped, true, 'equipped 亦不变');
	});

	test('★#1801 判据（同族）：`no-ammo` ⇒ 亦零副作用（只读预判路径）', () => {
		const c = CH('乙', null);                            // ★刻意不给子弹袋
		const r = R().act(c, MUSKET, FOE(), 'use', c);
		assert.eq(r.reason, 'no-ammo', '无弹 ⇒ rejected/no-ammo');
		assert.eq(R().heldTotal(c, BULLET), 0, '真值取不出 ⇒ 视为 0（但不产生任何写）');
		assert.eq(JSON.stringify(c.items.map((s) => s.id)), JSON.stringify([MUSKET]), '道具表未被搅动');
	});

	/* ---------- 判据 3：正对照 —— 正常开火**恰扣 1**（防「为了不误扣 ⇒ 干脆不扣」的空转解） ---------- */

	test('★#1801 判据 3（正对照）：正常开火 ⇒ `applied` 且弹药**恰减 1**', () => {
		const c = CH('丙', 9);
		const r = R().act(c, MUSKET, FOE(), 'use', c);
		assert.eq(r.status, 'applied', '正常开火未被拒');
		assert.eq(R().heldTotal(c, BULLET), 8, '★恰减 1（9→8）——空转解（干脆不扣）在此必红');
	});

	/* ---------- 判据 4：纵深防御不得破 —— 同一动作**不两扣**；残余直调路径仍被兜住 ---------- */

	test('★#1801 判据 4a：`act` 开一枪 ⇒ **恰 1 发**（`__ammoPaid` 标记 ＋ attack 兜底**不两扣**）', () => {
		/* 无此格则「把 take 挪到动作后而不同步标记」这类改法（一发两扣）不会被发现。 */
		const c = CH('丁', 5);
		const foe = FOE();
		R().act(c, MUSKET, foe, 'use', c);
		assert.eq(R().heldTotal(c, BULLET), 4, '★一次 act ＝ 恰 1 发（若两扣 ⇒ 3 ⇒ 红）');
	});

	test('★#1801 判据 4b：**残余直调** `attack` 路径仍被兜住（无 `act` 包裹时兜底自己扣）', () => {
		/* `#1765` 的纵深防御：不经 `act` 而直调 `DND5E.attack` ⇒ 兜底检查须真扣 1 发。 */
		const c = CH('戊', 5);
		const foe = FOE();
		const inst = R().reviveItem(c.items.find((s) => s.id === MUSKET));
		D().attack(inst, foe, c);
		assert.eq(R().heldTotal(c, BULLET), 4, '★直调 attack ⇒ 兜底扣 1 发（若 5 ⇒ 兜底失效）');
	});

	/* ---------- ★`perShot ≠ 1`（D 席 dev-9 补）：口径分岔的**另一面** ---------- */

	test('★`perShot=2`：口径一致 ⇒ 够则**恰减 2**、不够则**拒绝且零扣**（预判与真扣不得分岔）', () => {
		/* `perShot` 在**两处各自读取**（`ammoShort` 与 `③take`）⇒ 口径若分岔，**正好在 `perShot ≠ 1` 暴露**：
		 *   预判按 2 算、真扣按 1 扣（或反之）时，本格必红。本席 §`MN-1` 补的「数槽数 vs 累加 charges」是
		 *   **量口径**的一面；本格补的是**需求量口径**的另一面 —— 两面**分属不同代码位置**，缺一不可。 */
		R().defItem({
			id: 'unit-twin-gun2', name: '双发枪', weapon: true, slot: 'weapon', stackable: false,
			stats: { dmg: '1d6', ranged: true, ammo: { id: BULLET, perShot: 2 } },
			used() { this.perform('砰！砰！'); },
		});
		/* ① 3 发 ≥ 2 ⇒ 接受，且**恰减 2**（3→1） */
		const a = new (R().Character)({ name: '壬', hp: 60, maxHp: 60, stats: D().stats({ ac: 12 }) });
		a.items = [{ id: 'unit-twin-gun2', equipped: true }, { id: BULLET, charges: 3 }];
		const r1 = R().act(a, 'unit-twin-gun2', FOE(), 'use', a);
		assert.eq(r1.status, 'applied', '3 ≥ 2 ⇒ 接受');
		assert.eq(R().heldTotal(a, BULLET), 1, '★**恰减 2**（3→1；若按 1 减 ⇒ 2 ⇒ 红）');
		/* ② 仅 1 发 < 2 ⇒ **拒绝且零扣**（预判须与真扣同判） */
		const b = new (R().Character)({ name: '癸', hp: 60, maxHp: 60, stats: D().stats({ ac: 12 }) });
		b.items = [{ id: 'unit-twin-gun2', equipped: true }, { id: BULLET, charges: 1 }];
		const r2 = R().act(b, 'unit-twin-gun2', FOE(), 'use', b);
		assert.eq(r2.reason, 'no-ammo', '1 < 2 ⇒ rejected/no-ammo（预判与真扣**同判**）');
		assert.eq(R().heldTotal(b, BULLET), 1, '★**零扣**（1→1；若预判说够、真扣取 1 发不成 ⇒ 会静默少扣或错扣）');
	});

	/* ---------- MN-1（dev-10 建议）：`ammoShort` 与 `!take.ok` **等价** ---------- */

	test('★MN-1：`RPG.ammoShort` ≡ `!take.ok`（同口径的可判别断言 —— 本笔修法**正依赖**此等价）', () => {
		/* #1801 的修法把「够不够」交给只读的 `ammoShort`，把「真扣」留给 `take` ⇒
		 *   两者**口径必须一致**，否则会出现「预判说够、真扣却失败」（静默少扣）或反之（拒绝却扣）。
		 *   ★本格把该性质**钉成断言**：修法若把任一侧的口径改坏，本格必红。
		 *   ⚠ 两侧各在**独立副本**上测（`take` 有副作用 ⇒ 不能在同一对象上连测）。 */
		const mkActor = (n) => {
			const c = new (R().Character)({ name: '己', hp: 60, maxHp: 60, stats: D().stats({}) });
			c.items = n > 0 ? [{ id: BULLET, charges: n }] : [];
			return c;
		};
		for (const n of [0, 1, 2, 5]) {
			const a = mkActor(n), b = mkActor(n);
			const short = R().ammoShort(a, MUSKET);
			const took = R().take(BULLET, 1, b);
			assert.eq(short, took !== true, `★n=${n}：ammoShort=${short} 与 !take.ok=${took !== true} 须相等`);
		}
		/* ★★**判别性补强**（本席突变电池抓出的自测漏洞）：上面四例都用「单槽、`perShot` 缺省 1」——
		 *   而那种输入下「**数槽数**」与「**累加 charges**」**给出同一答案** ⇒ 口径改坏也照样绿（实测）。
		 *   ⇒ 必须补**两种口径会分岔**的输入：
		 *     ① **`perShot > 1` ＋ 单槽 charges 恰够**：`heldTotal` 型说「够」，数槽型说「不够」；
		 *     ② **一槽 charges ≥ 2 ＋ `perShot > 1`**：同上，且更贴近真实弹匣。 */
		R().defItem({
			id: 'unit-twin-gun', name: '双发枪', weapon: true, slot: 'weapon', stackable: false,
			stats: { dmg: '1d6', ranged: true, ammo: { id: BULLET, perShot: 2 } },
			used() { this.perform('砰！砰！'); },
		});
		const mkWith = (charges) => {
			const c = new (R().Character)({ name: '癸', hp: 60, maxHp: 60, stats: D().stats({}) });
			c.items = [{ id: BULLET, charges }];
			return c;
		};
		for (const n of [1, 2, 3, 4]) {
			const a = mkWith(n), b = mkWith(n);
			const short = R().ammoShort(a, 'unit-twin-gun');
			const took = R().take(BULLET, 2, b);
			assert.eq(R().heldTotal(a, BULLET), n, `前置：heldTotal=${n}（一份 charges ⇒ 量＝charges，✗ 槽数）`);
			assert.eq(short, took !== true,
				`★★perShot=2／charges=${n}：ammoShort=${short} 与 !take.ok=${took !== true} 须相等`
				+ '（★此例**分岔**「累加 charges」与「数槽数」两种口径 ⇒ 口径改坏必红）');
		}
		/* 反向：**无背包**（取不出真值）⇒ 两侧亦须同判（均视为「不够／失败」，✗ 一侧放过） */
		const c1 = new (R().Character)({ name: '庚', hp: 5, maxHp: 5, stats: D().stats({}) });
		const c2 = new (R().Character)({ name: '辛', hp: 5, maxHp: 5, stats: D().stats({}) });
		c1.items = null; c2.items = null;
		assert.eq(R().ammoShort(c1, MUSKET), true, '无背包 ⇒ 预判「不够」');
		assert.eq(R().take(BULLET, 1, c2), false, '无背包 ⇒ 真扣失败');
	});
})();
