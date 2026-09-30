/* D20M 角色 —— Player（玩家）：桥接 $player 的 Character 实例
 * 数值块使用 d20M 约定（基础攻击加值 bab ＋ 六维原始分；调整值由 modOf 现算）。
 */

const DEFAULTS = {
	name: '穿越者',
	hp: 12,
	maxHp: 12,
	// 玩家预生成数值：**house rule**（✗ 源条目 —— MSRD 无「预生成玩家」条目；照 dnd-5e/player.js 同款标注）
	stats: D20M.stats({ ac: 12, str: 12, dex: 12, bab: 1 }),
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

D20M.Player = RPG.defCharacter({ ...DEFAULTS, id: 'player', properties: ['player'] });

const bridge = (key) => ({
	get: () => state()[key],
	set: (v) => { state()[key] = v; },
	configurable: true,
});
Object.defineProperties(D20M.Player, {
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
