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
	// 玩家预生成数值：非 SRD 怪物条目，按 house rule 标注（#1697 P1；对齐评估见 #1719）
	stats: DND3.stats({ ac: 12, str: 12, dex: 12, heal_bonus: 0 }),
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
	stats: {
		// 桥接面同样需要重挂包标识（Symbol 不进 JSON/State ⇒ 读档后的 Player.stats 会丢标识）
		get: () => {
			const st = state().stats ?? {};
			for (const fn of RPG.reviveHooks ?? []) fn(st);
			return st;
		},
		set: (v) => { state().stats = v; },
		configurable: true,
	},
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
