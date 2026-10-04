/* L0 宿主适配 · **LifecyclePort 实现**（`sgstory#1912` 交付 1 · 步 2）
 *
 * 契约见 `src/core/ports/index.js`。职责：把「段落切换／会话纪元／异步取消」收成一处。
 *   ⚠ 票面 `#1912` 的「导航」一面**归此**（架构档原文即「passage 切换」）—— ✗ 另立端口。
 *
 * ## 宿主真面（按码读到的）
 *   · 段落事件：`:passageinit`（进入段落前）与 `:passagedisplay`（段落显示后）—— 引擎既有用法见
 *     `src/core/01-perform.js:35` 的 `.on(':passagedisplay', flush)` 与 `60-map.js` 的 `State.passage` 判据。
 *   · 本档把两者翻成**内核可消费的**面：`onPassage(fn)` ⇒ 返回退订；`epoch()/isCurrent(token)` ⇒ 纪元判活。
 *   · 无头守卫：`typeof jQuery === 'undefined'` ⇒ **不装订阅**（✗ 炸），`epoch` 仍可用（供无头判据读）。
 */
(() => {
	/** 会话纪元：每次「重开／换档／离开段落」+1 ⇒ 旧纪元的在飞输出由内核按 token 作废。 */
	let epoch = 1;
	const 在飞 = new Set();                 // 待作废的 token（`cancelPending` 把它们标死）

	/** 当前 tick 的 token（内核持它判「我这一轮还算不算数」）。 */
	const 发token = () => ({ epoch, alive: true });

	/** token 是否仍算数：纪元没变 **且** 没被 cancel 标死。 */
	const isCurrent = (token) => !!token && token.alive === true && token.epoch === epoch;

	/** 作废在飞等待（旧纪元的输出**不得**落屏）。 */
	const cancelPending = (reason) => {
		let n = 0;
		for (const t of 在飞) { t.alive = false; n += 1; }
		在飞.clear();
		epoch += 1;
		return { canceled: n, reason: String(reason ?? 'unspecified'), epoch };
	};

	/** 段落切换的宿主事件翻译。宿主不在 ⇒ 退订是 no-op（✗ 抛 —— 无头判据也要能调用）。 */
	const onPassage = (fn) => {
		if (typeof fn !== 'function') throw new Error('LifecyclePort.onPassage 需要函数');
		const 是jq = typeof jQuery !== 'undefined' && typeof document !== 'undefined';
		if (!是jq) return () => {};
		const 译 = (ev) => fn({ kind: String(ev?.type ?? '').replace(/^:/, ''), passage: String(State?.passage ?? '') });
		jQuery(document).on(':passageinit', 译);
		jQuery(document).on(':passagedisplay', 译);
		return () => {
			jQuery(document).off(':passageinit', 译);
			jQuery(document).off(':passagedisplay', 译);
		};
	};

	RPG.defPort('lifecycle', {
		/** 当前会话纪元（每次重开／换档 +1）。 */
		epoch: () => epoch,
		isCurrent,
		onPassage,
		cancelPending,
		/** 内部用：登记一枚在飞 token（`cancelPending` 据此标死）。 */
		_track(token) { 在飞.add(token); return token; },
		_token: 发token,
	}, { host: SUGARCUBE.id });
})();
