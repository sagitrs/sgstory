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
	stats: DND3.stats({
		ac: 12, str: 12, dex: 12, heal_bonus: 0,
		/* ★`sgstory#2030`：三豁免的**基础加值**显式写 0 —— ✗ 不是漏写，是**具名的缺面**：
		 *   3.5 里这一份来自**职业与等级**，而本引擎无职业与等级面 ⇒ 玩家的总分＝体质／敏捷／感知的
		 *   调整值之和（缺面：职业基础豁免加值）。
		 *   ⚠ 故事侧手写 `$player` 时漏给这三键**不炸**：读侧 `stats['save_'+类型] ?? 0` 兜底。 */
		save_fortitude: 0, save_reflex: 0, save_will: 0,
	}),
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

Object.defineProperties(DND3.Player, {
	name: 必给('name'),
	hp: 必给('hp'),
	maxHp: 必给('maxHp'),
	stats: {
		/* ★`sgstory#1853`：**write-back**（✗ 只兜底 `?? {}`）。
		 *   为何不能只兜底：本仓「**就地写 stats**」是**成文惯用法**（`tests/README.md:198`｜
		 *   `stories/babel/verify.mjs` 的 `D.Player.stats.heal_bonus = ±20`｜`tests/unit/dnd3/chest.test.js` …
		 *   ｜`tests/e2e/old-house` 的 `DND3.Player.stats.heal_bonus = 2`）—— 而 `?? {}` 每次读都造**新对象**
		 *   ⇒ 那些就地写**静默丢失**（读回 `undefined` ✗，正是 `#1787` 修 `effects` 时的同族坑）。
		 *   ⇒ 读时缺失**就地建一次**并**返回同一个引用** ⇒ 写入生效、引用稳定 ✓（形照 `invState()` 的 `inventory` 先例）。
		 *   ⚠ 代价：读面会**就地改存档**（与 `#1817` 的 golden 纯净性有张力）；此处按形裁定取 write-back ✓。 */
		get: () => {
			const s = state();
			if (s.stats == null) s.stats = {};
			for (const fn of RPG.reviveHooks ?? []) fn(s.stats);
			return s.stats;
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

DND3.Player.unarmed = {
	item: unarmedItem,   // ★测试可断言伤害骰／伤害类型（行为断言之外的数据面）
	text: '空手打击',
	strike: (actor, target) => DND3.meleeAttack(unarmedItem, target, actor),
};
