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
/* ★`sgstory#1853`（形裁定 2026-10-05）：`name`／`hp`／`maxHp` 取 **fail-loud** ——
 *   缺键时**具名抛错**，✗ 静默造值。理由：这三个键**静默造值会改变玩法**
 *   （`hp` 兜 0 ⇒ 开局即死；兜 18 ⇒ 凭空回血；`name` 兜字串 ⇒ 文案撒谎），而**缺失是配置错误**。
 *   ★须区分两态（本助手只管后者）：
 *     · `$player` **整体缺失** ⇒ `state()` 走 DEFAULTS ⇒ **正常，不抛** ✓；
 *     · `$player` **给了但漏键** ⇒ 配置错误 ⇒ **抛** ✓（DEFAULTS 根本不参与 —— 见 `state()` 的 `== null` 判）。
 *   报文含**键名**与**修法指向**（✗ 不让人猜「哪个键、去哪儿补」）。 */
const 必给 = (key) => ({
	get: () => {
		const v = state()[key];
		if (v === undefined) {
			throw new Error(`$player.${key} 缺失：$player 已由故事侧给出，但**没给全**（本包 DEFAULTS 只在 $player 整体缺失时生效）`
				+ ` ⇒ 请在故事侧 StoryInit 的 $player 里补齐 \`${key}\`，或整体不写 $player 让本包用 DEFAULTS`);
		}
		return v;
	},
	set: (v) => { state()[key] = v; },
	configurable: true,
});

Object.defineProperties(D20M.Player, {
	name: 必给('name'),
	hp: 必给('hp'),
	maxHp: 必给('maxHp'),
	stats: {
		/* ★`sgstory#1853`：**write-back**（与 dnd3／dnd-5e **同解**）——
		 *   ✗ 不再裸 bridge（`P.stats.dex = 99` 会抛 `Cannot set properties of undefined`）；
		 *   ✗ 也不对齐成 `?? {}`（那会把「就地写静默丢失」固化 ✗ —— 见另两包同处长注）。
		 *   读时缺失就地建一次并返回同一引用 ⇒ 写入生效、引用稳定 ✓。 */
		get: () => { const s = state(); if (s.stats == null) s.stats = {}; return s.stats; },
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

D20M.Player.unarmed = {
	item: unarmedItem,   // ★测试可断言伤害骰／伤害类型（行为断言之外的数据面）
	text: '空手打击',
	strike: (actor, target) => D20M.attack(unarmedItem, target, actor),
};
