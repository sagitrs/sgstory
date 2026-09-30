/* DND5E 角色 —— Player（玩家）：桥接 $player 的 Character 实例
 * 数值块使用 5E 约定（熟练度 prof 替代 3E 的 bab）。
 */

const DEFAULTS = {
	name: '旅行者',
	hp: 18,
	maxHp: 20,
	stats: DND5E.stats({ ac: 12, str_mod: 1, dex_mod: 1 }),
};

const state = () => {
	const vars = State.variables;
	if (vars.player == null) vars.player = JSON.parse(JSON.stringify(DEFAULTS));
	return vars.player;
};
const invState = () => {
	const vars = State.variables;
	if (!Array.isArray(vars.inventory)) vars.inventory = [];
	return vars.inventory;
};

DND5E.Player = RPG.defCharacter({ ...DEFAULTS, id: 'player', properties: ['player'] });

const bridge = (key) => ({
	get: () => state()[key],
	set: (v) => { state()[key] = v; },
	configurable: true,
});
Object.defineProperties(DND5E.Player, {
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
