/* RPG 核心 —— 状态效果
 *
 * Effect extends Object —— 效果基类。没有接口函数（纯数据/标记类）。
 * Debuff extends Effect —— 减益子类（同样没有接口函数）。
 * death               —— Debuff 的实例：生命值归零的标记，
 *                        由武器攻击在目标 HP 归零时施加（见 dnd3/items/club.js）。
 *
 * 效果通过 Character.gain / lose / contains 挂到角色身上，见 20-character。
 */

RPG.Effect = class Effect extends Object {
	constructor({ id, name = id, desc = '' } = {}) {
		super();
		if (!id) throw new Error('Effect 定义缺少 id');
		this.id = id;
		this.name = name;
		this.desc = desc;
	}
};

RPG.Debuff = class Debuff extends RPG.Effect {};

RPG.death = new RPG.Debuff({
	id: 'death',
	name: '死亡',
	desc: '生命值已归零，无法行动。',
});
