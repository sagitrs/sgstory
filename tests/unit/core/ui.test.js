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
			if (!that?.hp == null) return false;
			that.hp = Math.min(that.maxHp ?? 999, (that.hp ?? 0) + this.stats.hp);
			this.perform(`${that.name}喝下单测药水。`);
		},
	});
	/* 一件**显式拒绝**的条目：`used()` 返回 false ⇒ 点击应报 `ok:false`（动作拒绝语义照旧） */
	R().defItem({
		id: 'unit-refuser', name: '单测拒收物', charges: null,
		used() { this.perform('（这次做不到）'); return false; },
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

	/* ---------- ④ DOM 绑定：无头只做不抛＋幂等 ---------- */
	test('C1：绑定幂等（重复调用只绑一次；无头桩下不抛）', () => {
		R().__itemLinksBound = false;          // 复位以便观测
		const first = R().bindItemLinks();
		const second = R().bindItemLinks();
		assert.eq(first, true, '首次绑定应返回 true');
		assert.eq(second, false, '★再次调用应早退（幂等）');
		assert.eq(R().__itemLinksBound, true, '绑定标记应置位');
	});
})();
