/* RPG 核心 —— Event：游戏事件的抽象基类（命令模式）。
 * 子类实现 execute()（0 个参数），把“这一刻发生了什么”封装成对象，
 * 便于排队、回放、以及给战斗系统排回合。
 * 与 events 事件总线互补：总线是“广播”，Event 对象是“可执行的剧本”。
 */

RPG.Event = class Event extends Object {
	constructor() {
		super();
		if (new.target === RPG.Event) {
			throw new Error('Event 是抽象基类，请继承它（例如 class BattleTurn extends Event）');
		}
	}

	/** 接口：执行本事件（参数 0 个），结果通过 perform 打印 */
	execute() {
		throw new Error(`${this.constructor.name} 没有实现 execute()`);
	}
};
