/* `#1877` P1-7 —— **Restart 前补写一次自动存档**（补笔）
 *
 * 动因（操作者复测第 92 行）：「从第 2 层 Restart → OK → Continue，页面恢复到**第 1 层**」。
 * 本席的复现与前提核查（见 `#1877` 评论）：
 *   · 本引擎 `Config.saves.maxAutoSaves` **默认 0** ⇒ `auto.isEnabled()` 假 ⇒ `auto.save()` 是 **no-op**；
 *   · 操作者给的 `Save.autosave.save()` **已弃用且 no-op**；
 *   · 「刷新即恢复」走的是 `State.restore()` 的**会话快照**（`session.set("state", …)` 只在**导航**时写），
 *     而 `Engine.restart()` 的 `State.reset()` 首句就 `session.delete("state")` ⇒ 重载后落回起始段。
 * ⇒ 修法（领队裁：按操作者原话形）：**restart-confirm 时刻写一次快照**，✗ 连续 autosave。
 *
 * 本档守的契约（✗ 不重测宿主 API —— 那属宿主的档）：
 *   ① 临时开户：未开户 ⇒ **写这一次**（✗ 因 no-op 而静默什么都不发生）
 *   ② 且**复原**配置（✗ 把连续 autosave 永久打开 —— 那超出本笔范围）
 *   ③ 已有更大值 ⇒ **不动**（✗ 无条件写成 1 把调用方配置改小）
 *   ④ 认得出「这次点击是 Restart 确认」（✗ 认错 ⇒ 每次点击都写档）
 *   ⑤ 捕获相位监听（✗ 冒泡：宿主的目标相位处理器先跑 ⇒ `restart()` 已 `State.reset()` ⇒ 取不到状态）
 */
(() => {
	const R = () => setup.RPG;

	/** 仿真宿主：**照真实语义**（`auto.save()` 在未开户时是 no-op） */
	const mkHost = (initial, { withApi = true } = {}) => {
		const saves = { maxAutoSaves: initial };
		const st = { writes: 0, calls: 0 };
		const auto = {
			isEnabled: () => Number(saves.maxAutoSaves) > 0,
			save: () => {
				st.calls += 1;
				if (!auto.isEnabled()) return false;      // ★与真实宿主同：未开户 ⇒ 什么都不做
				st.writes += 1;
				return true;
			},
		};
		return { st, saves, deps: withApi ? { save: { browser: { auto } }, config: { saves } } : { save: null, config: null } };
	};

	test('★#1877 P1-7 ①：未开户（`maxAutoSaves=0`）⇒ **临时开户写这一次**（✗ 静默 no-op）', () => {
		const h = mkHost(0);
		const ok = R().save.snapshotForRestart(h.deps);
		assert.eq(ok, true, '须报告「写了」');
		assert.eq(h.st.writes, 1, `★须**真写进**（未开户时 no-op ⇒ 通过临时开户绕过）：调用 ${h.st.calls} 次／写入 ${h.st.writes}`);
	});

	test('★#1877 P1-7 ②：写后**复原**配置（✗ 把连续 autosave 永久打开）', () => {
		const h = mkHost(0);
		R().save.snapshotForRestart(h.deps);
		assert.eq(h.saves.maxAutoSaves, 0, `★须复原为调用前值（否则 :passageend 的连续自动存档被一并打开）：${h.saves.maxAutoSaves}`);
	});

	test('★#1877 P1-7 ③：已有**更大**值 ⇒ 不动它（✗ 无条件写成 1）', () => {
		const h = mkHost(3);
		R().save.snapshotForRestart(h.deps);
		assert.eq(h.saves.maxAutoSaves, 3, `★调用方配置不得被改小：${h.saves.maxAutoSaves}`);
		assert.eq(h.st.writes, 1, '仍写一次');
	});

	test('★#1877 P1-7 ④【对照】非 Restart 的点击 ⇒ **不写档**（✗ 认错按钮 ⇒ 每次点击都写）', () => {
		const h = mkHost(0);
		const hit = R().save.handleRestartClick({ target: { id: 'restart-cancel' } }, h.deps);
		assert.eq(hit, false, '不是 Restart 确认 ⇒ 判否');
		assert.eq(h.st.writes, 0, `★不得写档：写入 ${h.st.writes}`);
		/* 正向臂：同一次调用换个 id ⇒ 须写 */
		const hit2 = R().save.handleRestartClick({ target: { id: 'restart-ok' } }, h.deps);
		assert.eq(hit2, true, '是 Restart 确认 ⇒ 判真');
		assert.eq(h.st.writes, 1, '★且真写了一次');
	});

	test('★#1877 P1-7 ⑤：接线 —— **捕获相位** ＋ 幂等（✗ 冒泡：宿主的处理器先跑就晚了）', () => {
		/* ⚠ 本格的「捕获」断言是**契约面**：宿主的目标相位处理器会在 `Dialog.close()` 后
		 *   跑 `Engine.restart()`（⇒ `State.reset()`）⇒ 冒泡相位落快照时状态已空。 */
		let seen = null;
		const doc = { addEventListener: (t, fn, capture) => { seen = { t, fn, capture }; } };
		const hooked = R().save.hookRestartConfirm(doc);
		assert.eq(hooked, true, '首次接线成功');
		assert.eq(seen.t, 'click', '监听的是 click');
		assert.eq(seen.capture, true, `★必须是**捕获相位**（true）：${seen.capture}`);
		assert.eq(typeof seen.fn, 'function', '有处理器');
		/* 幂等：再次接线不得重复绑（✗ 重复绑 ⇒ 一次点击写两次档） */
		let issued = 0;
		const doc2 = { addEventListener: () => { issued += 1; } };
		assert.eq(R().save.hookRestartConfirm(doc2), false, '第二次接线判否');
		assert.eq(issued, 0, `★不得再绑一个：${issued}`);
	});
})();
