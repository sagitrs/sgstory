/* 巴别之井 · 试玩版 —— 故事侧事件钩子（演示「不改规则包就挂接新系统」，同旧宅 e2e 的 hooks.js）
 *
 * 这里只做**读数的采集**（供试玩终点显示）：
 *   · `battle:end` ⇒ 把玩家此刻持有的创伤记进「本局见过」（施加没有独立事件，见 encounters.js 的说明）
 *   · `item:used`  ⇒ 次数（试玩版只用来确认「道具真的用上了」）
 * ✗ 不改任何判定：全部读数都进 `$babelRun`（纯数据 ⇒ 随存档往返）。
 */

RPG.events.on('battle:end', () => {
	if (setup.BABEL && typeof setup.BABEL.noteTraumas === 'function') setup.BABEL.noteTraumas();
});

RPG.events.on('item:used', (e) => {
	if (e.action && e.action !== 'use') return;
	const r = State.variables.babelRun;
	if (r) r.itemsUsed = (r.itemsUsed ?? 0) + 1;
});
