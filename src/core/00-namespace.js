/* raw */
/* RPG 核心引擎 —— 命名空间、注册表与事件总线（规则无关）
 *
 * 规则包（dnd3、wfrp…）构建在 setup.RPG 之上：
 *   通用层：Item/Character/Effect/Event/Scene 基类、背包、战斗回合循环、
 *           perform/choice 输入输出、骰子工具
 *   规则包：stats 数值块的字段约定、判定与伤害的数学、具体内容
 * ⚠ 本文件首行有 raw 编译指令：不经 IIFE 包装，因为它要创建 setup.RPG 本身。
 */
setup.RPG = {
	version: '0.2.0',

	/** 道具注册表：id → 道具类（各规则包共用一张表） */
	items: new Map(),

	/** 角色注册表：id → Character 实例 */
	characters: new Map(),

	/** 场景注册表：id → Scene 实例 */
	scenes: new Map(),

	/** 事件总线：道具/系统之间解耦（订阅方见 story/hooks.js 的示例） */
	events: (function () {
		const handlers = new Map(); // 事件类型 -> Set<监听函数>
		return {
			/** 订阅事件，返回取消订阅函数 */
			on(type, fn) {
				if (!handlers.has(type)) handlers.set(type, new Set());
				handlers.get(type).add(fn);
				return () => handlers.get(type)?.delete(fn);
			},
			off(type, fn) {
				handlers.get(type)?.delete(fn);
			},
			/** 发布事件。某个监听器抛异常只打印到控制台，不影响其他监听器。 */
			emit(type, payload) {
				for (const fn of handlers.get(type) ?? []) {
					try {
						fn(payload);
					} catch (ex) {
						console.error(`[RPG] 事件「${type}」的监听器出错：`, ex);
					}
				}
			},
		};
	})(),
};
