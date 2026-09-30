/* RPG 核心 —— Chest（可战斗的容器：宝箱/柜子/木桶……）—— 规则无关
 *
 * 设计对称性：Chest **是一个 Item**——继承道具的 id/name/desc/stats
 * 基础设施与动作分发器；同时满足战斗目标契约（hp / stats / isDown），
 * 因此既能摆在世界里当容器，也能作为 Battle 的参战对象
 * （只挨打，不行动——行动者契约仍是 Character）。
 *
 * 内聚边界：本类只有“机制”，没有“判定数学”——
 *   - 不会闪避（noDodge 属性，不是 stats 量纲）→ 攻击总是命中
 *   - openBy / brokenBy / lockNow 是结算原语
 *   - open 动作 = 钥匙开箱（无需判定的通用动作）
 * 规则包自行扩展：如 dnd3/core/chest.js 给它加上 3E 撬锁判定。
 */

RPG.Chest = class Chest extends RPG.Item {
	constructor({
		hp = 10,
		maxHp = hp,
		items = [],
		skill = null,
		lockDC = 12, // 撬锁难度阈值（数值本身是数据；怎么判定由规则包定义）
		noDodge = true, // 容器不会闪避（对象性质，不属于规则量纲）
		...def
	} = {}) {
		super(def);
		this.maxHp = maxHp;
		this.hp = Math.min(hp, maxHp);
		this.items = items; // 战利品快照
		this.skill = skill; // 陷阱技能实例（永不掉落）
		this.lockDC = lockDC;
		this.noDodge = noDodge;
		this.disarmed = false; // 机关已解除（钥匙/撬锁成功）
		this.locked = false; // 撬锁失败：永久锁死
		this.opened = false; // 被正确打开
	}

	get isBroken() {
		return this.hp <= 0;
	}

	/** 战斗目标契约：与 Character.isDown 同构（Battle 的 isOut 默认读它） */
	get isDown() {
		return this.isBroken;
	}

	/** 交互是否已结束（砸开 / 打开 / 锁死） */
	get isDone() {
		return this.isBroken || this.opened || this.locked;
	}

	/** 被砸开时的结算：掉落战利品；机关未解除时向 attacker 释放技能。 */
	brokenBy(attacker) {
		RPG.perform(`${this.name}散架了！`);
		RPG.loot(this);
		if (this.skill && !this.disarmed) {
			RPG.perform('残破的箱体里传来一声脆响——机关发动了！');
			this.skill.used(attacker, this); // 反击判定在技能的 used 里
		} else {
			RPG.perform('箱子里安安静静——机关早已被解除。');
		}
	}

	/** 被正确打开（钥匙/撬锁成功）：掉落战利品，机关判定被跳过。 */
	openBy() {
		this.disarmed = true;
		this.opened = true;
		RPG.perform(`你稳稳地打开了${this.name}，机关没有触发。`);
		RPG.loot(this);
	}

	/** 撬锁失败：永久锁死，无法再交互。 */
	lockNow() {
		this.locked = true;
		RPG.perform('锁芯里传来金属断裂的死涩声响——它被彻底锁死了。');
	}
};

/** 通用动作（规则无关）。lockpick 等带判定的动作由规则包扩展，见 dnd3/core。 */
RPG.Chest.handlers = {
	use() {
		this.perform(`${this.name}不是能直接“使用”的东西——得打开它，或者砸开它。`);
	},
	/** 钥匙开箱：机关判定被跳过（不需要任何检定） */
	open() {
		this.openBy();
	},
};
