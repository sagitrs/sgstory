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
	/* ★读面兜底（`#1787`，乙′）——**只兜底，✗ 写回**。
	 *   `$player` 由**故事手写**（`<<set $player to {…}>>`，✗ 走 `Character.toJSON`）⇒ 故事漏给
	 *   `effects` 时，`contains()` 会在**战斗深处**抛 `Cannot read properties of undefined`
	 *   （读 `.some`）—— 症状离病因极远，无从定位（writer-2 装配自检发现）。
	 *   ★与 `items` 的**不对称**正是缺口来源：`items` 走 `invState()`（**空则建 []**），
	 *     而 `effects` 走裸 `bridge()`（直接返回 `state()[key]`，**无兜底**）。
	 *   ⇒ 此处按 `items` 的读面兜底，但**只在读时兜，✗ 不写回**：存档纯净性正由 `#1817` 契约化，
	 *     隐式写面会污染 golden diff（领队裁 2026-10-01）。
	 *   ⚠ 补 `DEFAULTS.effects` **修不了本缺陷**：`state()` 只在 `$player == null` 时用 DEFAULTS，
	 *     而本缺陷的形态是「`$player` **给了**但没 `effects`」（DEFAULTS 根本不参与）。 */

	effects: {
		get: () => state().effects ?? [],
		set: (v) => { state().effects = v; },
		configurable: true,
	},
});
