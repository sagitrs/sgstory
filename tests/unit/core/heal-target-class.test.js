/* ── ★`sgstory#1949`：**治疗件在战斗里被静默吃掉那一手**（真因＝靶解析未带动作类）──
 *
 *   `#resolveTarget(attacker, id, actionClass = 'damage')` 的**缺省是「伤害」** ⇒ 候选被窄化成
 *   **敌方**；而治疗件的唯一合法靶是**己方** ⇒ 己方的单位号**不在候选里** ⇒ `RPG.unitId.resolve`
 *   抛 ⇒ 兜成 `null` ⇒ 「使用」支 `return 'rejected'`（**不消耗行动机会的裸串**，✗ 不经 `#refuse`
 *   ⇒ 连拒绝回路都不进）⇒ **本回合白过**：不回血 ✗、不扣件 ✗、敌人也没动静 ✗。
 *
 *   ★这一格的判据形是**行为对账**（本仓 P0 家族的老实形）：
 *     ① 一键路（候选恰一 ⇒ 不问靶）⇒ 治疗须**真落地**：血量上升 ＋ 充能 −1；
 *     ② 展开路（候选 ≥2 ⇒ 问靶）⇒ 同一件事走另一条分支也须落地（两条分支各有一处缺参）；
 *     ③ **正控**：伤害件的一键路仍须打中敌人（✗ 我的修法把伤害路改坏）。
 *   ⚠ 三格都断言「敌方血量**不变**」（治疗不该致伤）—— 这是把「治好了自己但顺手打了人」也排除掉。 */
(() => {
	const R = () => setup.RPG;
	const D = setup.DND3;

	const 造敌 = (名) => new (R().Character)({ name: 名, hp: 6, maxHp: 6, stats: { ac: 10 } });
	const 记 = (P) => ({ hp: P.hp, 件: P.items.map((i) => ({ ...i })) });
	const 还原 = (P, 存) => { P.hp = 存.hp; P.items.length = 0; P.items.push(...存.件); };

	/** 脚本化玩家：一键治疗项优先；否则按文案里的名字挑靶；再否则取首项。 */
	const 选 = (规则) => async (options) => {
		const 快 = options.find((o) => String(o.value).startsWith('quick:') && 规则.快.test(o.text));
		if (快) return 快.value;
		if (规则.靶) {
			const t = options.find((o) => 规则.靶.test(o.text));
			if (t) return t.value;
		}
		return options.map((o) => o.value)[0];
	};

	test('治疗①【一键路·正控】：治疗件真落地 —— 血量上升、充能 −1、敌方不动', () => {
		const P = D.Player; const 存 = 记(P);
		P.hp = 6; P.maxHp = 20; P.items.length = 0;
		P.items.push({ id: 'herb-poultice', charges: 2 });
		const 敌 = 造敌('幼獾');
		P.choice = 选({ 快: /草药糊|治疗/ });
		R().rng.setSequence([0.9, 0.9, 0.9, 0.9, 0.9, 0.9]);
		return new (R().Battle)(1, [P], [敌], true).execute().then(() => {
			const 血前 = 6, 充前 = 2;              // ★读数须在**还原之前**取（还原是给别的用例留干净态，✗ 不是判据的一部分）
			const 血后 = P.hp, 充后 = P.items[0]?.charges ?? 0, 敌后 = 敌.hp;
			还原(P, 存);
			assert.eq(血后 > 血前, true, `★治疗须**真落地**（一键路）：血 ${血前}→${血后}、充能 ${充前}→${充后}`);
			assert.eq(充后, 充前 - 1, `★治疗件须**消耗一件**：充能 ${充前}→${充后}`);
			assert.eq(敌后, 6, `★治疗**不得**打在敌人身上：敌 6→${敌后}`);
		});
	});

	test('治疗②【展开路·正控】：候选 ≥2 时走「问靶」那条，同一件事也须落地', () => {
		const P = D.Player; const 存 = 记(P);
		P.hp = 6; P.maxHp = 20; P.items.length = 0;
		P.items.push({ id: 'herb-poultice', charges: 2 });
		const 队友 = new (D.Player.constructor ?? D.Player)({ name: '队友', hp: 3, maxHp: 20, stats: {} });
		队友.items = [];
		const 敌 = 造敌('幼獾');
		P.choice = 选({ 快: /草药糊|治疗/, 靶: /队友/ });   // ★展开路：治疗件的候选含「队友」⇒ 挑它
		R().rng.setSequence([0.9, 0.9, 0.9, 0.9, 0.9, 0.9]);
		return new (R().Battle)(1, [P, 队友], [敌], true).execute().then(() => {
			const 队友后 = 队友.hp, 充后 = P.items[0]?.charges ?? 0, 敌后 = 敌.hp, 我后 = P.hp;
			还原(P, 存);
			assert.eq(队友后 > 3, true, `★治疗须**真落地**（展开路）：队友 3→${队友后}`);
			assert.eq(充后, 1, `★治疗件须**消耗一件**：充能 2→${充后}`);
			assert.eq(敌后, 6, `★治疗**不得**打在敌人身上：敌 6→${敌后}`);
			assert.eq(我后, 6, `★靶既已指名队友，自己**不该**被治：我 6→${我后}`);
		});
	});

	test('治疗③【正控·伤害路未坏】：武器的一键路仍须打中敌人', () => {
		const P = D.Player; const 存 = 记(P);
		P.hp = 20; P.maxHp = 20; P.items.length = 0;
		P.items.push({ id: 'club', charges: null });
		const 敌 = 造敌('幼獾');
		P.choice = 选({ 快: /攻击/ });
		R().rng.setSequence([0.9, 0.9, 0.9, 0.9, 0.9, 0.9]);
		return new (R().Battle)(1, [P], [敌], true).execute().then(() => {
			const 敌后 = 敌.hp;
			还原(P, 存);
			assert.eq(敌后 < 6, true, `★伤害件须仍打中（✗ 本笔把伤害路改坏）：敌 6→${敌后}`);
		});
	});
})();
