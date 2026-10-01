/* `#1783`：**装备/分发失败不可判** —— `return;`（undefined）被 `#1776` 新契约误判为 `applied`
 *
 * ## 缺陷（既有行为，developer 于 `#1776` D 复审发现）
 *   `#1776` 的动作契约是：`used()` **显式 `return false`** ⇒ `rejected`；`undefined` ⇒ 成功。
 *   而两处失败路径写的是 `return;`（undefined）⇒ 被算作 **`applied`** ⇒ 调用方**判不出失败**：
 *     ① `RPG.slotEquip` 的「不是可装备物」与「槽被占」；
 *     ② **`Item.used` 的「未注册 action」分支**（同族第二处，本笔一并修）。
 *
 * ## 修法（一行级）
 *   两处 `return;` → `return false;` ⇒ 失败走 `rejected/action-refused`（提示文案**不变**）。
 *
 * ## ★本文件的要害（防「无刀的修复」）
 *   只改码会 **443/0 全绿**（本席实测：**没有任何既有用例因此变红**）⇒ 即「改了但无人守」。
 *   故本档把三种失败情形**各自钉一格**，并配**正对照**（正常装备仍 `applied`）——
 *   否则「把返回值整个删掉」也能让它绿。
 *
 * ## ★口径：本动作走**全局背包**
 *   `slotEquip` 用 `RPG.equippedIn(slot)` 判槽，而该函数查的是 `inv()`（`State.variables.inventory`）
 *   ⇒ **本档必须用玩家背包**（`RPG.give` ＋ `playerActor()`），✗ 不能给角色塞自造 `items` 数组
 *   （那会让槽判定恒为空 ⇒ 测不出「槽被占」）。
 */
(() => {
	const R = () => setup.RPG;

	/** 玩家（`items` 桥接到 `$inventory`）＋ 清空背包后放入指定件 */
	const scenario = (...items) => {
		R().give('coin');                                    // 触发 inv() 初始化
		const inv = State.variables.inventory;
		inv.length = 0;
		for (const it of items) inv.push(it);
		const p = R().playerActor();
		assert.ok(p != null, '前置：playerActor 存在');
		assert.eq(p.items === inv, true, '前置：玩家的 items 就是 $inventory（同引用）');
		return p;
	};

	/* ---------- ① 正对照：正常装备仍 `applied`（防「为了不误判 ⇒ 干脆全判失败」） ---------- */

	test('#1783 正对照：正常装备 ⇒ `applied`（修法不得把成功也判成拒绝）', () => {
		const p = scenario({ id: 'sword', equipped: false, charges: null });
		const r = R().act(p, 'sword', p, 'equip');
		assert.eq(r.status, 'applied', '空槽装备 ⇒ 成功');
		assert.eq(State.variables.inventory[0].equipped, true, '且真的装上了（✗ 只返回成功而不落状态）');
	});

	/* ---------- ② 槽被占 ⇒ rejected（★缺陷本体之一） ---------- */

	test('★#1783 ②：**槽被占** ⇒ `rejected/action-refused`（修前为 `applied` ＝ 不可判）', () => {
		const p = scenario({ id: 'sword', equipped: false, charges: null },
			{ id: 'club', equipped: false, charges: null });
		const first = R().act(p, 'sword', p, 'equip');
		assert.eq(first.status, 'applied', '前置：先装上 sword');
		const r = R().act(p, 'club', p, 'equip');            // club 同为 weapon 槽
		assert.eq(r.status, 'rejected', '★槽被占 ⇒ 拒绝（修前 applied）');
		assert.eq(r.reason, 'action-refused', '原因为 action-refused');
		assert.eq(State.variables.inventory[1].equipped, false, '★且 club ✗ 被装上（拒绝须零副作用）');
		assert.eq(State.variables.inventory[0].equipped, true, '原装备不受影响');
	});

	/* ---------- ③ 「不是可装备物」⇒ rejected（★接口面；真件不可达，故造件） ---------- */

	test('★#1783 ③：挂 `equip` 但 `slot:null` ⇒ `rejected`（接口面；真件皆有 slot ⇒ 本格是唯一可达路径）', () => {
		/* 实证：`grep` 全部挂 `equip: RPG.slotEquip` 的真件 ⇒ **24 个全有 slot**
		 *   ⇒ `slotEquip` 的 `this.slot == null` 分支**对真内容面不可达**。
		 *   但它**接口上必须正确**（`defItem` 可造出「挂 equip 且无 slot」的件）⇒ 本格即该路径的唯一守卫。 */
		const ID = 'unit-noslot';
		R().defItem({ id: ID, name: '无槽件', charges: 1, stackable: true, used() {},
			actions: { equip: R().slotEquip } });             // ★挂 equip 但**不给 slot**
		try {
			const p = scenario({ id: ID, equipped: false, charges: 1 });
			const r = R().act(p, ID, p, 'equip');
			assert.eq(r.status, 'rejected', '★不是可装备物 ⇒ 拒绝（修前 applied）');
			assert.eq(r.reason, 'action-refused', '原因为 action-refused');
			assert.eq(r.item?.slot, null, '该件确实没有槽（前置）');
		} finally {
			R().items.delete(ID);                              // 测试卫生：全局表用完必清
		}
	});

	/* ---------- ④ 边界：**同槽同件**重装 ⇒ `applied`（幂等成功，✗ 拒绝） ---------- */

	test('#1783 ④ 边界：**已装备的再装一次** ⇒ `applied`（幂等；✗ 不得判失败）', () => {
		/* 本格钉住修法的**边界**：`slotEquip` 在 `current.id === this.id` 时**不进失败分支**
		 *   ⇒ 落成功路径。若把它也改成 `return false`，玩家点两次会看到「失败」提示。 */
		const p = scenario({ id: 'sword', equipped: false, charges: null });
		R().act(p, 'sword', p, 'equip');
		const r = R().act(p, 'sword', p, 'equip');
		assert.eq(r.status, 'applied', '★同槽同件 ⇒ 幂等成功（✗ 拒绝）');
		assert.eq(State.variables.inventory[0].equipped, true, '仍装备着');
	});

	/* ---------- ⑤ 同族第二处：**未注册 action** ⇒ rejected（`Item.used` 的分发失败） ---------- */

	test('★#1783 ⑤（同族第二处）：**未注册的 action** ⇒ `rejected`（分发失败也须可判）', () => {
		/* `Item.used` 是**动作分发器**：`handlers[action]` 缺失时原先 `return;` ⇒ 被算 `applied`。
		 *   「没有这个用法」在语义上就是**拒绝** ⇒ 本笔一并改 false。 */
		const p = scenario({ id: 'sword', equipped: false, charges: null });
		const r = R().act(p, 'sword', p, 'bogus-action');
		assert.eq(r.status, 'rejected', '★未注册 action ⇒ 拒绝（修前 applied）');
		assert.eq(r.reason, 'action-refused', '原因为 action-refused');
		assert.eq(R().reviveItem(State.variables.inventory[0]).equipped, false, '零副作用：未被装上');
	});

	/* ---------- ⑦ 同族：`RPG.throwItem` 的「无 Thrown 就投」 ⇒ rejected ---------- */

	test('★#1783 ⑦：`throwItem` 挂 `throw` 但无 `stats.thrown` ⇒ `rejected`（**有拒绝文案 ⇒ 语义明确是拒绝**）', () => {
		/* 与 ③ 同形（为「对真件不可达的接口分支」单列一格）：唯一挂 `throw:` 的真件是 `dagger`，
		 * 而它有 `thrown:'20/60'` ⇒ 该分支对真内容面不可达；但**接口必须正确**
		 * （同一判据同一适用 —— 本笔 §三 已为 `slotEquip` 的不可达分支立此判据）。
		 * ★其拒绝文案（「没有 Thrown 特性，不能投掷」）自证语义 ⇒ ✗ 不属于「须裁定的幂等」。 */
		const ID = 'unit-nothrow';
		R().defItem({ id: ID, name: '无掷件', charges: 1, stackable: true, used() {},
			actions: { throw: R().throwItem } });                 // ★挂 throw 但**不给 stats.thrown**
		try {
			const p = scenario({ id: ID, equipped: false, charges: 1 });
			const r = R().act(p, ID, p, 'throw');
			assert.eq(r.status, 'rejected', '★无 Thrown ⇒ 拒绝（修前 applied）');
			assert.eq(r.reason, 'action-refused', '原因为 action-refused');
		} finally {
			R().items.delete(ID);                              // 测试卫生
		}
	});

	/* ---------- ⑧ 现有真件回归：dagger 的 throw ⇒ 仍 `applied`（✗ 被⑦连坐） ---------- */

	test('#1783 ⑧：真件 `dagger`（有 `thrown`）的 `throw` ⇒ 仍 `applied`（✗ 不得连坐成拒绝）', () => {
		/* ⑦ 改了 `throwItem` 的失败分支 ⇒ 须钉住真件的**成功路径**不受影响（dagger 有 thrown ⇒ 走成功）。 */
		const p = scenario({ id: 'dagger', equipped: false, charges: null });
		const r = R().act(p, 'dagger', p, 'throw');
		assert.eq(r.status, 'applied', 'dagger 有 Thrown ⇒ 投掷照常成功');
	});

	/* ---------- ⑨ ★「挥空了没击中」≠ 拒绝 —— 单列一格（✗ 让「一律改 false」蒙混） ---------- */

	test('#1783 ⑨：**攻击已发生、只是没命中 ⇒ 不是拒绝** ⇒ 保持 `undefined` ＝ `applied`（✗ 一律改 false）', () => {
		/* 战斗 `used()` 层的攻击结算（`dnd-5e/combat.js`「挥空了，没有击中」）是**成功**
		 * —— 攻击**已发生**、消耗了动作，只是没命中 ⇒ 语义上是成功，**必须保持 `undefined`**。
		 * 若日后有人把 `used()` 里的 `return;` **一律**改成 `return false`，本格会红。
		 * 口径：注入 `RPG.rng` 序列让攻击必然 miss（掷骰恒 1 ⇒ 1+mod < AC ⇒ 挥空）。 */
		/* 口径：本格**不用 `playerActor()`** —— 它由 harness 注入（`effects` 未初始化 ⇒ `traumaAttackMod` 会崩），
		 *   而格 ⑨ 要的是「攻击结算真的跑完」。⇒ 自造攻守双方（`items` ＋ `effects` 齐备）。 */
		R().give('coin');                                       // 先初始化背包（供 give/revive 路径）
		const p = new (R().Character)({ name: '甲', hp: 20, maxHp: 20,
			items: [{ id: 'sword', equipped: true, charges: null }], stats: { ac: 12 } });
		const foe = new (R().Character)({ name: '靶', hp: 10, maxHp: 10,
			items: [{ id: 'coin' }], stats: { ac: 25 } });
		R().rng.setSequence([0.0, 0.0, 0.0, 0.0]);             // 掷骰恒 1 ⇒ 必 miss（`1+mod < 25`）
		try {
			const r = R().act(p, 'sword', foe, 'use');          // use ⇒ used ⇒ DND5E.attack ⇒ 挥空
			assert.eq(r.status, 'applied', '★挥空 ＝ 攻击已发生 ＝ 成功（✗ 拒绝）');
			assert.eq(foe.hp, 10, '前置：确实**没命中**（靶未掉血）⇒ 本格测的正是「挥空」这条路径');
		} finally {
			R().rng.reset();                                   // 测试卫生：rng 用完必复位
		}
	});

	/* ---------- ⑥ 反向：`undefined` 仍算成功（契约的另一半，✗ 被本笔改动波及） ---------- */

	test('#1783 ⑥ 契约另一半：**处理器返回 `undefined`** ⇒ 仍 `applied`（✗ 连成功也一起判失败）', () => {
		/* `#1776` 契约：`undefined` ＝ 成功、**只有 `=== false`** 才算拒绝。
		 *   本笔只把两处**失败**路径改成 false ⇒ 成功路径（undefined）**必须不动**。
		 *   用 `unequip`（未装备时静默空操作 ⇒ undefined）作探针。 */
		const p = scenario({ id: 'sword', equipped: false, charges: null });
		const r = R().act(p, 'sword', p, 'unequip');           // 未装备 ⇒ `slotUnequip` 早返回 undefined
		assert.eq(r.status, 'applied', '★`undefined` 仍算成功（把成功判成失败同属缺陷）');
	});
})();
