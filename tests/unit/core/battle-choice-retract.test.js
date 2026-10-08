/* core/02-choice ＋ core/40-battle —— **回收口归问话方**（`sgstory#2055`）
 *
 * 病（`books#402` writer-2 实测 · 新局自然复现 · 抛出点 `src/core/60-map.js:359`）：
 *   旧形里 `choice` **自己**订阅 `battle:submit`，一有提交就把**任何**开着的盘收掉并 `resolve(null)`；
 *   而本档的契约是「返回**对应选项的 value**」⇒ 消费方 `picked.startsWith('a')` 当场 `TypeError`
 *   （玩家在战斗中从页脚背包用药 ⇒ 打中的却是**地图那一盘**）。
 *   本席一手复现（books 侧真 DOM 探针）：非战斗 choice 悬着 → `submitBattleAction({item})` ⇒
 *   该盘**收到 `null`** ⇒ 消费方抛 `Cannot read properties of null (reading 'startsWith')` ✓。
 *
 * 要断两件：
 *   ① **只收自己那一盘**：战斗提交只准收**战斗正在问**的那一盘，无关的盘**一个都不许动**，
 *      且 `choice` **永不**产出契约外的值（尤其 ✗ `null`）；
 *   ② **被拒则不收**：提交被拒（件不在身上／匹配不上）⇒ 盘留着、玩家照旧能自己点（✗ 不再弄成死局）。
 *
 * ⚠ 无头宿主下 DOM 是 no-op 桩（`parent().length` 恒 `0`）⇒ **旧形的回收动作在这里根本不会触发**，
 *   靠 DOM 判定不了 ⇒ 判据读 `RPG.choiceBoxes`（开着的盘：`id ⇒ 收`，与 `RPG.Battle.弃局` 同旨的
 *   可观测口）；「旧形会把无关盘也收掉」这件事由**刀**在新代码上还原旧语义来证明（见 `knives.mjs`）。
 *
 * 刀（记在 `tests/unit/framework/knives.mjs` 的 `choice-retract-blanket`）：
 *   把 `submit()` 里「收自己那一盘」换成「收**所有**开着的盘」⇒ 本档第 ① 格必红。
 */
(() => {
	const R = () => setup.RPG;
	const D = () => setup.DND3;
	/** 让异步循环跑到「问玩家」那一问（无头下 `deferOutput` 即时 ⇒ 几个 tick 足够） */
	const 让 = async (n = 4) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
	const 一敌 = () => new (R().Character)({ name: '装置靶', hp: 999, maxHp: 999, stats: { dmg: '0', atkBonus: 0 } });
	/** 收尾：登记面清干净（✗ 漏 ⇒ 后面的用例串味） */
	const 清 = () => {
		try { R().Battle.cancel('单测收尾'); } catch (e) { /* 无战斗亦无害 ✓ */ }
		R().choiceBoxes.clear();
		State.variables.inventory = [];
	};

	test('#2055 回收口：战中提交只收**自己那一盘**（无关的盘不被动 ⇒ 永不收到 null）', async () => {
		State.variables.inventory = [];
		R().give('bandage');
		const 场 = new (R().Battle)(2, [D().Player], [一敌()], true);
		const 跑 = 场.execute();                       // ★真的走引擎 choice（✗ 不桩 choice）
		跑?.catch?.(() => {});                       // 收尾/弃局路径可能抛 ⇒ 本档不断它
		await 让();
		assert.ok(R().choiceBoxes.size >= 1, `战斗那一问应已开着一盘（实得 ${R().choiceBoxes.size}）—— ✗ 桩了 choice 或循环没跑到`);
		/* ★按**盘号**认盘（✗ 不数总数：战斗被答掉后会**接着开下一问** ⇒ 总数不变不代表没换盘） */
		const 战盘号 = R().choiceBoxSeq;
		assert.ok(R().choiceBoxes.has(战盘号), `战斗那一盘（#${战盘号}）应开着`);
		/* 另一处（**非战斗**）的盘 —— 形如引擎 `60-map.js` 的 `#renderLocation` 那一问 */
		let 无关收到 = '（未 settle）';
		const 无关 = R().choice([{ text: '看岸', value: 'a0' }, { text: '走', value: 'L11' }]);
		无关.then((v) => { 无关收到 = v; });
		await 让(2);
		const 无关盘号 = R().choiceBoxSeq;
		assert.ok(R().choiceBoxes.has(无关盘号) && 无关盘号 !== 战盘号, '无关那一盘应**也开着**（两盘并存＝真实场景）');

		/* ★玩家那一下：从页脚背包用药（＝引擎 `submitBattleAction`） */
		const r = R().submitBattleAction({ item: 'bandage' });
		assert.eq(r?.ok, true, `提交应被接住（实得 ${JSON.stringify(r)}）`);
		await 让(3);
		assert.ok(!R().choiceBoxes.has(战盘号), `★战斗**自己**那一盘应被收（#${战盘号}）`);
		assert.ok(R().choiceBoxes.has(无关盘号), `★无关那一盘（#${无关盘号}）**一个都不许动**`);
		assert.eq(无关收到, '（未 settle）', `★无关那盘**不得**被结 —— 尤其 ✗ \`null\`（实得 ${JSON.stringify(无关收到)}）`);
		清();
	});

	test('#2055 回收口：提交被拒（件不在身上）⇒ 盘不收、问题仍可答', async () => {
		State.variables.inventory = [];
		R().give('bandage');
		const 场 = new (R().Battle)(2, [D().Player], [一敌()], true);
		场.execute()?.catch?.(() => {});
		await 让();
		assert.ok(R().choiceBoxes.size >= 1, `战斗那一问应已开着一盘（实得 ${R().choiceBoxes.size}）`);
		const 战盘号 = R().choiceBoxSeq;
		const r = R().submitBattleAction({ item: 'herb-poultice' });   // ★身上没有这件
		assert.eq(r?.ok, false, `不该有这件 ⇒ 提交应被拒（实得 ${JSON.stringify(r)}）`);
		await 让(3);
		assert.ok(R().choiceBoxes.has(战盘号), '★被拒 ⇒ **不收**（盘留着、玩家照旧可以自己点）');
		清();
	});

	test('#2055 回收口：`opts.收` 交出回收能力（缺省不给 ⇒ 盘照旧能答）', async () => {
		let 拿到 = null;
		const p = R().choice([{ text: '甲', value: 'a0' }], { 收: (f) => { 拿到 = f; } });
		await 让(1);
		assert.ok(typeof 拿到 === 'function', '★`opts.收` 应收下「收掉这一盘」的能力（问话方才知道何时该收）');
		assert.eq(R().choiceBoxes.size, 1, '该盘应已登记');
		let 值 = '（未 settle）';
		p.then((v) => { 值 = v; });
		拿到();                                    // ★问话方自己决定收
		await 让(1);
		assert.eq(R().choiceBoxes.size, 0, '收过 ⇒ 登记面应清（幂等：再收一次也不动）');
		拿到();
		assert.eq(R().choiceBoxes.size, 0, '★重复收应幂等（✗ 重复动 DOM）');
		assert.eq(值, '（未 settle）', '★收 ≠ 答：没收过值 ⇒ promise 照旧悬着（值由答题那条路给）');
		R().choiceBoxes.clear();
	});
})();
