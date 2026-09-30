/* DND3 角色 —— Player（玩家）：桥接 $player 的 Character 实例
 *
 * 与哥布林不同，玩家的数据必须进存档，而 SugarCube 的 State 只能存
 * 纯数据，所以 $player（纯对象）始终是唯一数据源。
 * Player 是它的“活的面向对象视图”：name/hp/maxHp/stats/items/effects
 * 用访问器（getter/setter）直接桥接到 State——
 *
 *   DND3.Player.hp = 15     等价于 $player.hp = 15
 *   DND3.Player.heal(8)     继承自 Character，实际写回 $player
 *
 * 读写永远同步；读档 / 重新开始后视图自动指向新的 State，无需手动同步。
 * DEFAULTS 只在故事忘记初始化 $player 时兜底，正常以 StoryInit 为准。
 */

const DEFAULTS = {
	name: '旅行者',
	hp: 18,
	maxHp: 20,
	// 数值块与哥布林完全对称（走 DND3.stats 填满默认值）
	stats: DND3.stats({ ac: 12, str_mod: 1, dex_mod: 1, heal_bonus: 0 }),
};

const state = () => {
	const vars = State.variables;
	if (vars.player == null) vars.player = JSON.parse(JSON.stringify(DEFAULTS));
	return vars.player;
};
// 玩家的随身道具 = $inventory（与状态栏/背包系统同一份数据）
const invState = () => {
	const vars = State.variables;
	if (!Array.isArray(vars.inventory)) vars.inventory = [];
	return vars.inventory;
};

// properties 含 'player'：Battle 的交互通路（random_player_action）会亲自指挥它
DND3.Player = RPG.defCharacter({ ...DEFAULTS, id: 'player', properties: ['player'] });

const bridge = (key) => ({
	get: () => state()[key],
	set: (v) => { state()[key] = v; },
	configurable: true,
});
Object.defineProperties(DND3.Player, {
	name: bridge('name'),
	hp: bridge('hp'),
	maxHp: bridge('maxHp'),
	stats: bridge('stats'),
	items: {
		get: invState,
		set: (v) => { State.variables.inventory = v; },
		configurable: true,
	},
	effects: bridge('effects'),
});
