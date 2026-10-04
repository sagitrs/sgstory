/* L0 宿主适配 · **LifecyclePort 实现（内存）** —— `sgstory#1998`
 *
 * 契约在 `src/core/ports/index.js`：`epoch`／`isCurrent`／`onPassage`／`cancelPending`。
 * 无头环境**没有**真段落 ⇒ 本实现在这三个契约方法之外，另给一个**驱动面** `navigate(name)`，
 * 由装置／判据显式调（SugarCube 那边由 `:passageinit` 事件驱动，两者形状一致的是**订户签名**）。
 * 语义（与 SugarCube 实现对齐）：换档／重开 ⇒ **纪元 +1**，在飞 token 作废（旧纪元的输出不得落屏）。
 */
(() => {
	let epoch = 0;
	const 在飞 = new Set();
	const 订 = new Set();
	const 发token = () => ({ at: epoch });
	const isCurrent = (t) => !!t && t.at === epoch;
	/** 通知订户；★订户抛错**吞并**（同内核回合钩子的口径：可重试的编排点不得互相带崩）。 */
	const 通知 = (name, 序号) => { for (const fn of [...订]) { try { fn(name, 序号); } catch { /* 吞并 */ } } };

	RPG.defPort('lifecycle', {
		epoch: () => epoch,
		isCurrent,

		onPassage(fn) {
			if (typeof fn !== 'function') throw new Error('onPassage 需要函数');
			订.add(fn);
			return () => 订.delete(fn);
		},

		/** 作废在飞：**纪元 +1**（此后 `isCurrent(旧 token)` 为假）＋ 通知订户。 */
		cancelPending(reason) {
			let n = 0;
			for (const t of 在飞) if (isCurrent(t)) { t.at = -1; n += 1; }
			epoch += 1;
			const 结 = { canceled: n, reason };
			在飞.clear();
			通知(null, epoch);
			return 结;
		},

		/* ---- 内部面（同 SugarCube 实现的形：判据可直接驱动纪元）---- */
		_track(token) { 在飞.add(token); return token; },
		_token: 发token,

		/* ---- 读数／驱动面（✗ 在契约里）---- */
		/** 显式驱动一次「段落切换」（无头环境没有真事件源）。@returns 段落名 */
		navigate(name) {
			const s = String(name);
			通知(s, epoch);
			return s;
		},
		/** 在飞 token 数（读数）。 */
		pending: () => 在飞.size,
	}, { host: HEADLESS.id });
})();
