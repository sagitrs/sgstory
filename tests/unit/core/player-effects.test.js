/* `#1787`：`$player.effects` **读面兜底（乙′）** —— 故事手写 `$player` 漏 `effects` ⇒ 战斗深处 TypeError
 *
 * ## 缺陷（writer-2 装配自检发现；本席复核时把真实边界勘得更锐）
 *   `stories/babel/src/meta/init.twee` **手写** `<<set $player to {…}>>`（✗ 走 `Character.toJSON`
 *   —— 那条路**总是**写 `effects`）。故事漏给 `effects` 时，`Player.contains()` 在**战斗深处**
 *   抛 `Cannot read properties of undefined (reading 'some')` —— 症状离病因极远。
 *
 * ## ★真实边界（本席实测，✗ 票面原述「DEFAULTS 缺两键」）
 *   ① `inventory` **不需要**兜底：`invState()` **空则建 `[]`**（有兜底）；`effects` 走裸 `bridge()`
 *      （**无兜底**）⇒ 缺口只有 `effects` 一个键、三包同形；
 *   ② ★**补 `DEFAULTS.effects` 修不了票面那面**：`state()` 只在 `$player == null` 时用 DEFAULTS，
 *      而「`$player` **给了**但没 `effects`」（StoryInit 忘给全）时 DEFAULTS 根本不参与；
 *   ③ 修法**乙′**（领队裁 2026-10-01）：读面 `?? []` **只兜底 ✗ 写回** —— 存档纯净性正由
 *      `#1817` 契约化，读时改存档会污染 golden diff。
 *
 * ## 格按三情形（领队：**验收面须含情形②** —— 那才是票面真缺陷面；防「改了但无人守」）
 */
(() => {
	const R = () => setup.RPG;
	const effOf = (P) => P.effects;

	/** 三种 `$player` 形态的场景器（含还原） */
	const withPlayer = (shape, fn) => {
		const prev = State.variables.player;
		const prevInv = State.variables.inventory;
		try {
			if (shape === 'absent') delete State.variables.player;                       // ① 完全缺
			else if (shape === 'partial') State.variables.player = { name: '甲', hp: 10, maxHp: 10, stats: {} }; // ② 给了没 effects
			else State.variables.player = { name: '甲', hp: 10, maxHp: 10, stats: {}, effects: [] };            // ③ 齐备
			fn();
		} finally {
			State.variables.player = prev;
			State.variables.inventory = prevInv;
		}
	};

	/* ---------- 情形①：$player 完全缺失（DEFAULTS 生效） ---------- */

	test('#1787 ①：$player 完全缺失 ⇒ effects 读面为 []（✗ undefined）', () => {
		withPlayer('absent', () => {
			assert.ok(Array.isArray(effOf(setup.DND3.Player)), '★DEFAULTS 形下读面仍是数组');
		});
	});

	/* ---------- 情形②：$player 给了但没 effects（★票面真缺陷面） ---------- */

	test('★#1787 ②：$player **给了但没 effects**（StoryInit 忘给全）⇒ 战斗深处不再抛（票面真缺陷面）', () => {
		withPlayer('partial', () => {
			const P = setup.DND3.Player;
			/* 修前：P.contains(...) ⇒ `Cannot read properties of undefined (reading 'some')` */
			assert.eq(P.contains('exhaustion'), false, '★contains 不抛（兜底生效）');
			assert.ok(Array.isArray(effOf(P)), '读面为数组');
			/* 且行为面可用：gain 后 contains 真的认得 */
			P.gain('fear');
			assert.eq(P.contains('fear'), true, 'gain ⇒ contains 认得（✗ 只是不抛）');
		});
	});

	/* ---------- 情形③：$player 齐备（✗ 兜底不得改变正常路径） ---------- */

	test('#1787 ③：$player 齐备 ⇒ 读面即存档值（✗ 兜底干扰正常路径）', () => {
		withPlayer('full', () => {
			State.variables.player.effects = ['fear'];
			const P = setup.DND3.Player;
			assert.eq(P.contains('fear'), true, '齐备形下照常解析');
			assert.eq(effOf(P).join(','), 'fear', '读面 ＝ 存档值');
		});
	});

	/* ---------- ★乙′ 核心格：**只兜底 ✗ 写回**（存档纯净性） ---------- */

	test('★#1787 乙′：读 `effects` **不得写回** `$player`（✗ 读时改存档 —— golden diff 纯净性）', () => {
		withPlayer('partial', () => {
			const before = JSON.stringify(State.variables.player);
			void effOf(setup.DND3.Player);                    // 触发读面
			void setup.DND3.Player.contains('exhaustion');    // 触发消费点
			assert.eq(JSON.stringify(State.variables.player), before, '★读前后 `$player` 逐字节不变');
		});
	});

	/* ---------- 三包同形：dnd-5e / d20m 不得留不一致 ---------- */

	test('#1787 三包同形：dnd-5e／d20m 的 `effects` 桥接同样兜底（✗ 留两处不一致）', () => {
		withPlayer('partial', () => {
			assert.ok(Array.isArray(setup.DND5E.Player.effects), 'dnd-5e 读面为数组');
			assert.eq(setup.DND5E.Player.contains('exhaustion'), false, 'dnd-5e contains 不抛');
			assert.ok(Array.isArray(setup.D20M.Player.effects), 'd20m 读面为数组');
			assert.eq(setup.D20M.Player.contains('exhaustion'), false, 'd20m contains 不抛');
		});
	});
})();
