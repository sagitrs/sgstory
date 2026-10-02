/* core/70-ui 的单元测试：道具名链接化（能力伞首期 C1 · `#1798`）
 *
 * 纪律（承 `tests/README.md`）：
 *   · 只测**本条能力**（派生动作／可点标签／点击行为／状态栏同形），✗ 重测 `useItem` 的判定数学；
 *   · DOM 面只做**不抛＋幂等**的冒烟（无头环境是 no-op 桩）——行为断言一律走**纯入口** `RPG.itemClick`；
 *   · 用**本用例私有的道具**（id 加 `unit-` 前缀）钉住「动作从条目自身派生」，✗ 依赖内容侧具体武器
 *     （内容侧改数值不该红；但**动作表契约**变了必须红）。
 */
(() => {
	const R = () => setup.RPG;
	const S = () => State.variables;

	/* ---------- 私有道具：一件可装备、一件消耗品、一件「只有 use」----------- */
	R().defItem({
		id: 'unit-helmet', name: '单测盔', charges: null, stackable: false, slot: 'head',
		stats: { ac: 1 },
		actions: { equip: R().slotEquip, unequip: R().slotUnequip },
		used(that) { this.perform(`「${this.name}」只能戴。`); },
	});
	R().defItem({
		id: 'unit-draught', name: '单测药水', charges: 1, stackable: true,
		stats: { hp: 3 },
		used(that) {
			if (that?.hp == null) return false;   // ★`#1805`：原写 `!that?.hp == null` —— 左侧是**布尔**，`== null` **恒 false** ⇒ 该支为**死代码**（`#1799` 随入）
			that.hp = Math.min(that.maxHp ?? 999, (that.hp ?? 0) + this.stats.hp);
			this.perform(`${that.name}喝下单测药水。`);
		},
	});
	/* 一件**显式拒绝**的条目：`used()` 返回 false ⇒ 点击应报 `ok:false`（动作拒绝语义照旧） */
	R().defItem({
		id: 'unit-refuser', name: '单测拒收物', charges: null,
		used() { this.perform('（这次做不到）'); return false; },
	});

	/* ★`#1857`：一件**按设计抛错**的条目 —— 道具的 `used()` 可以抛（资源的「误当消耗品应当响」），
	 *   而故事页的点入口原先**无 catch** ⇒ 异常穿到 DOM 层、玩家无可读反馈（本笔修的形）。 */
	R().defItem({
		id: 'unit-thrower', name: '单测炸物', charges: null,
		used() { throw new Error('「单测炸物」是建设物资，不能直接使用（请用于建造）'); },
	});

	const freshInv = (actor) => {
		S().inventory = [];
		actor.items = S().inventory;   // 与两包 player.js 同形：玩家 items ≡ $inventory
		return actor;
	};

	/* ---------- ① 动作派生 ---------- */
	test('C1：点击动作**从条目自身的动作表派生**（有 equip ⇒ equip；否则 use；未注册 ⇒ null）', () => {
		assert.eq(R().itemAction('unit-helmet'), 'equip', '有 equip 动作 ⇒ equip');
		assert.eq(R().itemAction('unit-draught'), 'use', '只有 use ⇒ use');
		assert.eq(R().itemAction('unit-not-registered'), null, '未注册 id ⇒ null（✗ 猜）');
		/* 与内容侧一条真武器交叉核（防「只在本用例私有的条目上成立」） */
		assert.eq(R().itemAction('club'), 'equip', '内容侧武器也应派生出 equip');
	});

	/* ---------- ② 点击行为（纯入口） ---------- */
	test('C1：点可装备名 ⇒ 装备；再点 ⇒ 卸下（切换语义）', () => {
		const p = freshInv(R().playerActor() ?? R().characters.get('player'));
		R().give('unit-helmet');
		assert.eq(R().isEquipped('unit-helmet'), false, '前置：未装备');
		const r1 = R().itemClick('unit-helmet', { actor: p });
		assert.eq(r1.ok, true, '第一次点击应成功');
		assert.eq(r1.action, 'equip', '动作应是 equip');
		assert.eq(R().isEquipped('unit-helmet'), true, '★点击后应已装备');
		R().itemClick('unit-helmet', { actor: p });
		assert.eq(R().isEquipped('unit-helmet'), false, '★再点应卸下（切换）');
	});

	test('C1：点消耗品名 ⇒ 用掉一次（charges 递减、体力按条目效果变化）', () => {
		const p = freshInv(R().playerActor() ?? R().characters.get('player'));
		p.hp = 5; p.maxHp = 20;
		R().give('unit-draught');
		const r = R().itemClick('unit-draught', { actor: p });
		assert.eq(r.ok, true, '点击应成功');
		assert.eq(p.hp, 8, `效果应生效（5 → 8，实得 ${p.hp}）`);
		assert.eq(S().inventory.some((s) => s.id === 'unit-draught'), false,
			'charges:1 用尽后应离开背包（与 useItem 同语义）');
	});

	/* `#1805`（`#1799` 随入）：本档 `unit-draught` 的 `used()` 有一条**拒绝支**（「缺 hp ⇒ 拒绝」），
	 *   而原夹具写成 `if (!that?.hp == null) return false;` —— 左侧是**布尔**，`== null` **恒 false**
	 *   ⇒ 该支是**死代码**；上面那格用 `p.hp = 5` ⇒ **根本不进该支**
	 *   ⇒ 拒绝路径从未被夹具**直证**（只被道具语义间接覆盖）。
	 *   ⇒ 修正为 `that?.hp == null`，并补本格**直证**（✗ 靠间接覆盖）。 */
	test('#1805：`unit-draught` 的「缺 hp ⇒ 拒绝」支**直证**（✗ 死支）', () => {
		const p = freshInv(R().playerActor() ?? R().characters.get('player'));
		p.hp = undefined;                                  // ★缺 hp ⇒ 应走拒绝支
		p.maxHp = 20;
		R().give('unit-draught');
		const r = R().itemClick('unit-draught', { actor: p });
		assert.eq(r.ok, false, '★缺 hp ⇒ 拒绝（`used()` 返回 false ⇒ `ok:false`）');
		assert.eq(p.hp, undefined, '★拒绝 ⇒ **不得**改动 hp（✗ 兜底成 `0 + 3`）');
		assert.ok(S().inventory.some((s) => s.id === 'unit-draught'),
			'★拒绝 ⇒ **不得**消耗（`#1801`：「拒绝路径一律零副作用」⇒ charges ✗ 扣、槽 ✗ 摘）');
	});

	test('C1：条目**显式拒绝**时点击报 `ok:false`（✗ 假装成功）', () => {
		const p = freshInv(R().playerActor() ?? R().characters.get('player'));
		R().give('unit-refuser');
		const r = R().itemClick('unit-refuser', { actor: p });
		assert.eq(r.ok, false, '★`used()` 返回 false ⇒ `ok:false`（动作拒绝语义照旧）');
		assert.eq(r.action, 'use', '动作仍是 use');
	});

	test('C1：未注册 id 的点击 ⇒ `ok:false` 且不抛（点名 ✗ 崩）', () => {
		const r = R().itemClick('unit-not-registered');
		assert.eq(r.ok, false, '未注册 ⇒ ok:false');
		assert.eq(r.action, null, '未注册 ⇒ action:null');
	});

	/* ---------- ③ 标签渲染 ---------- */
	test('C1：标签形（class/data-item/转义）', () => {
		const html = R().itemLink('unit-draught');
		assert.ok(html.includes('class="rpg-item-link"'), `应有链接 class：${html}`);
		assert.ok(html.includes('data-item="unit-draught"'), `应带 data-item：${html}`);
		assert.ok(html.includes('单测药水'), '应显示条目名');
		const unknown = R().itemLink('unit-nope');
		assert.ok(unknown.includes('rpg-item-link-unknown'), '未注册条目应有区分 class（✗ 冒充可点）');
		const weird = R().itemLink('unit-draught', { label: '<b>x</b>&"y"' });
		assert.ok(!weird.includes('<b>x</b>') && weird.includes('&lt;b&gt;'), '★显示文本必须转义');
	});

	test('C1：状态栏形与 `inventoryLabel()` **逐字同形**（只是名字可点）', () => {
		const p = freshInv(R().playerActor() ?? R().characters.get('player'));
		assert.eq(R().inventoryLinks(), '（空）', '空背包 ⇒ 与 inventoryLabel 同形');
		/* ⚠ 多件后缀要用**自身 charges > 1** 的条目造：`RPG.give(id, n)` 对 `charges: 1` 的条目是**推 n 个槽**
		 *   （合并分支只在「已有同 id 槽」时才走）⇒ 那样造不出「×N」标签（本笔实测）。 */
		R().defItem({ id: 'unit-bundle', name: '单测捆', charges: 3, stackable: true, stats: {},
			used() { this.perform('（单测捆）'); } });
		R().give('unit-bundle');
		R().give('unit-helmet');
		R().equip('unit-helmet');
		const label = R().inventoryLabel();
		const links = R().inventoryLinks();
		/* 把链接里的标签文本抽出来（去标签）后应与 label 一致 —— 这是「文本不变、只多可点」的机械判据 */
		const stripped = links.replace(/<a [^>]*>/g, '').replace(/<\/a>/g, '');
		assert.eq(stripped, label, `去标签后应与 inventoryLabel 逐字相同：${stripped} vs ${label}`);
		assert.ok(links.includes('（已装备）'), '装备态后缀应保留');
		assert.ok(links.includes('×3'), '多件后缀应保留');
	});

	/* `#1836`（`#1814` 过程发现的 UX 缺口）：原形 `charges > 1 ? ×N : name` 让「**还剩 1 次**」与「**无充能概念**」

	 * 的件**文本全同** ⇒ 玩家看不出前者只剩一次。修：充能件**一律** `×N`（含 `×1`）。 */

	test('#1836：充能 1 的件显式 `×1`（✗ 与无充能件同形），且两处仍逐字同形', () => {

		freshInv(R().playerActor() ?? R().characters.get('player'));

		R().give('unit-draught');   // charges: 1

		R().give('unit-helmet');    // charges: null（无充能概念）

		const label = R().inventoryLabel();

		assert.ok(label.includes('单测药水×1'), `充能 1 须显式 ×1：${label}`);

		assert.ok(!label.includes('单测盔×'), `无充能概念的件不带 ×N：${label}`);

		/* ★两处同形（`#1836` 改了 `30-inventory.js` 与 `70-ui.js` 各一处）⇒ 不变式仍须成立 */

		const stripped = R().inventoryLinks().replace(/<a [^>]*>/g, '').replace(/<\/a>/g, '');

		assert.eq(stripped, label, `#1836 改动后仍须逐字同形：${stripped} vs ${label}`);

	});

	/* ---------- ④ DOM 绑定：无头只做不抛＋幂等 ---------- */
	test('C1：绑定幂等（重复调用只绑一次；无头桩下不抛）', () => {
		R().__itemLinksBound = false;          // 复位以便观测
		const first = R().bindItemLinks();
		const second = R().bindItemLinks();
		assert.eq(first, true, '首次绑定应返回 true');
		assert.eq(second, false, '★再次调用应早退（幂等）');
		assert.eq(R().__itemLinksBound, true, '绑定标记应置位');
	});

	/* ═══ `#1857`：故事页点道具**抛错须收成可读拒绝**（✗ 穿 DOM）═══
	 * 同族：`#1839` 收的是**战斗侧**（`#actCatching`）；本笔补**故事页**（`itemClick`）。
	 * 「筛（选单不亮）＋ 网（catch）」两层已在 `#1844` 立 —— 本笔是**网**的另一半。 */

	test('★#1857 ①：`used()` **抛错** ⇒ `itemClick` 收成可读拒绝（✗ 抛穿 DOM）', () => {
		const p = freshInv(R().playerActor() ?? R().characters.get('player'));
		R().give('unit-thrower');
		let threw = null;
		let r = null;
		try { r = R().itemClick('unit-thrower', { actor: p }); } catch (e) { threw = e.message; }
		assert.eq(threw, null, `★点击**不得**抛穿（玩家侧无可读反馈）：${threw}`);
		assert.eq(r.ok, false, '拒绝：`ok:false`');
		assert.eq(r.reason, 'action-threw', '★成因可分辨：`action-threw`');
		assert.ok(/建设物资/.test(r.message ?? ''), '★`message` 含**道具自己的话**（✗ 泛泛「用不了」）');
	});

	test('★#1857 ②：抛错路径**零副作用**（背包仍在、charges ✗ 扣）', () => {
		const p = freshInv(R().playerActor() ?? R().characters.get('player'));
		R().give('unit-thrower');
		R().itemClick('unit-thrower', { actor: p });
		assert.ok(S().inventory.some((s) => s.id === 'unit-thrower'), '★道具仍在背包（✗ 被误消耗）');
	});

	test('★#1857 ③：可读文案＝**原样**引道具自己的话（✗ 前置名字／加括号 ⇒ 重复）', () => {
		const p = freshInv(R().playerActor() ?? R().characters.get('player'));
		R().give('unit-thrower');
		const r = R().itemClick('unit-thrower', { actor: p });
		const text = R().itemRejectText(r);
		assert.eq(text, r.message, '★与 `message` **逐字同**（道具文案通常已含名字与因）');
		assert.ok(!/^「单测炸物」用不了：/.test(text), '★✗ 再套一层名字（那会得「「X」用不了：「X」…」的重复）');
	});

	test('★#1857 ④【对照】两种 `ok:false` **可分辨**（抛错 vs `used()` 返回 false —— ✗ 混为一谈）', () => {
		const p = freshInv(R().playerActor() ?? R().characters.get('player'));
		R().give('unit-thrower'); R().give('unit-refuser');
		const a = R().itemClick('unit-thrower', { actor: p });   // 抛错形
		const b = R().itemClick('unit-refuser', { actor: p });   // `used()` 自己拒绝形
		assert.eq(a.ok, false, '两者都 ok:false');
		assert.eq(b.ok, false, '两者都 ok:false');
		assert.eq(a.reason, 'action-threw', '★抛错形有 `reason`');
		assert.eq(b.reason, undefined, '★`used()` 返回 false 形**无** `reason`（既有语义不变）');
		assert.eq(R().itemRejectText(b), null, '★非抛错形**不上屏**（两条路径各走各的呈现）');
	});

	test('★#1857 ⑤：正常件**零回归**（`ok:true`，文案为 null）', () => {
		const p = freshInv(R().playerActor() ?? R().characters.get('player'));
		p.hp = 5; p.maxHp = 20;
		R().give('unit-draught');
		const r = R().itemClick('unit-draught', { actor: p });
		assert.eq(r.ok, true, '正常件仍成功');
		assert.eq(r.reason, undefined, '✗ 被新字段污染');
		assert.eq(R().itemRejectText(r), null, '✗ 正常路径产出文案');
	});

})();