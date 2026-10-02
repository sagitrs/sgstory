/* DND5E 角色 —— Player（玩家）：桥接 $player 的 Character 实例
 * 数值块使用 5E 约定（熟练度 prof 替代 3E 的 bab）。
 */

const DEFAULTS = {
	name: '旅行者',
	hp: 18,
	maxHp: 20,
	stats: DND5E.stats({ ac: 12, str: 12, dex: 12 }), // 玩家预生成数值：非 SRD 怪物条目，按 house rule 标注（#1697 P1；对齐评估见 #1719）
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
/* ★`#1854`：**空手打击**（MSRD 通用规则 ⇒ 引擎级常驻项，✗ 故事机制）。
 *   core 只定契约（`RPG.Battle` 的选单／分派／收口 ＋ `RPG.applyDamage` 的致命／非致命两路单点）；
 *   包侧只需声明「用哪个攻击函数、伤害多少」—— 三包签名同为 `(item, that, from)`，故空手**复用**现有攻击函数，
 *   只喂一个**合成 item**（✗ 新开一条攻击通路）。
 *
 *   ★规则出处（pinned）：`27msrdcombat战斗-d20m.md:333-341` —— 拳/踢/头槌按近战武器处理；
 *     中型角色 **1d3＋力量修正、非致命**；空手打击算**轻近战武器**。
 *   ★**累积阈值不在 pin 里**（本席逐文件核过：19 个 pinned 文件中含 `nonlethal` 的 4 个均无「累积段」）
 *     ⇒ 按本仓纪律标 **house rule（非 SRD）**：**唯一**阈值 `nonlethal > hp` ⇒ **昏迷出局**
 *       （`见 RPG.applyDamage`）。
 *     ⚠ pin 的 `nonlethal >= hp`「**踉跄**」态**本引擎不实现** —— 全仓无 `staggered` 读数
 *       ⇒ ✗ 不静默丢弃：显式记在此（与 `armed`／借机攻击 同一形：贴 pin 出处、写「不实现」）。
 *   ★**armed 与借机攻击**（pin `:339`）只作**注记**：其唯一机制后果是 AoO，而引擎**无 AoO 层**
 *     ⇒ **HR：本引擎不实现借机攻击**（✗ 静默丢弃 —— 显式记在此；与 `#1855` 的天然武器共引同一 pin 行）。
 *
 *   `equipped: true` 是**关键**：攻击函数的「未装备 ⇒ 先拔出／腾不出手」分支据此**跳过**
 *     （空手无需拔出；也**不该**因为手里握着剑就打不出拳）。 */
const unarmedItem = {
	id: 'unarmed', name: '空手', equipped: true,
	stats: { dmg: '1d3', crit: 2, type: '非致命', nonlethal: true },
};

DND5E.Player.unarmed = {
	item: unarmedItem,   // ★测试可断言伤害骰／伤害类型（行为断言之外的数据面）
	text: '空手打击',
	strike: (actor, target) => DND5E.attack(unarmedItem, target, actor),
};
