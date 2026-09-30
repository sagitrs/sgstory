/* 故事侧的事件钩子 —— 演示如何不改规则包代码就挂接新系统：
 * 统计道具使用次数与战斗回合数（结局会显示），并打印到控制台方便调试。 */

RPG.events.on('item:used', (e) => {
	// equip/unequip 等动作不计入“使用道具次数”，只统计默认动作 use
	if (e.action && e.action !== 'use') return;
	State.variables.itemUseCount = (State.variables.itemUseCount || 0) + 1;
	console.log(`[RPG] 使用了道具「${e.name}」`);
});

RPG.events.on('battle:turn', () => {
	State.variables.turnCount = (State.variables.turnCount || 0) + 1;
});
