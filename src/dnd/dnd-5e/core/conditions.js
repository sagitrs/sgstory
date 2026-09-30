/* DND5E 核心扩展 —— 异常状态（Conditions）声明表与判定原语（#1689 P1 · #1741）
 *
 * **单一权威源**：每条条件在此声明一次；读路径（rollMode／canAct）与写路径（gain／lose）
 * 都从这张表派生 —— 不再有「声明层 + 实例层」两张并行表（#1727 的 defEffect 已把定义与实例
 * 塌缩为一层：注册即实例，且 def 的全字段都挂在实例上）。
 *
 * 引用形遵循 README「规则来源」§三（每条在下方逐条给出「版本 · 源文件 : 行号」，行号指向 pin 缓存行）。
 *   源文 = pin 缓存 tests/gates/pin-cache/rules-glossary.md
 *   （repo downfallx/dnd-5e-srd-markdown，版本 5.2.1，commit 1b4b99d…，sha1 d2e39b22330c2861，1537 行）。
 *
 * ⚠ **与 SRD 的已知偏离（显式标注；以下各行并非「取自 SRD」的数值，引用形不适用）**：
 *   1. `grappled` 的「对擒抱者以外才有劣势」（L830）——本表按**无条件劣势**实现（简化，同 #1689 §九.4）。
 *   2. `scope`（battle|persistent）与 `duration`（turn 计数）**SRD 无对应** —— SRD 不定义条件的持续
 *      时长与结束时机（结束由施加效果者规定）。除 `exhaustion`（:784「Finishing a Long Rest removes
 *      1 of your Exhaustion levels」＝persistent 明文）外，两字段取值皆属 **house rule**。
 *   3. `saveEnd`（回合末豁免成功即结束）**SRD 无对应** —— 本表 15 条的 "Saving Throws Affected" 段
 *      说的是「自动失败/劣势」（:1131/:1159/:1222/:1425/:1513），**不是**「豁免成功即结束」。
 *      ⇒ 故默认**不启用**；启用者逐条标注。本表唯一启用者 `frightened`（承 #1689 设计稿 §三原型）
 *      为 **house rule**，其源义为「源不可见即结束」（:820）而非豁免。
 */

/** 各条：id → { 判定字段…, scope, saveEnd?, duration? }
 *  - `selfRollMode`      自身掷骰修正（攻方读）
 *  - `targetRollMode`    对来犯者攻击的影响（受方读）
 *  - `targetMelee`/`targetRanged`  条件性（受方读，按 ctx.melee 分支）—— `prone` 专用
 *  - `inactive`          不能行动（canAct 派生面）
 *  - `scope`             'battle' = battle:end 清除 ｜ 'persistent' = 跨场保留（默认 persistent）
 *  - `saveEnd`           回合末豁免（{ ability, dc? }）
 *  - `duration`          'turn' = 按回合计（回合末 -1，归零即移除）｜省略 = 不自动流逝
 */
DND5E.Conditions = {
	// SRD 5.2.1 · rules-glossary.md:255；:261「Attack rolls against you have Advantage, and your
	//   attack rolls have Disadvantage」
	blinded: { selfRollMode: 'disadvantage', targetRollMode: 'advantage', scope: 'battle', duration: 'turn' },
	// SRD 5.2.1 · rules-glossary.md:434；:438「You can't attack the charmer or target the charmer with
	//   damaging abilities」——「禁攻施魅者」需 source，归 P3 ⇒ 本表**不落** cannotAttackSource（无消费点）
	charmed: { scope: 'battle', duration: 'turn' },
	// SRD 5.2.1 · rules-glossary.md:676；:680「you can't hear and automatically fail any ability check
	//   that requires hearing」（听觉面现仓无技能系统 ⇒ P4 降级，见 #1689 §九.6）
	deafened: { scope: 'battle', duration: 'turn' },
	// SRD 5.2.1 · rules-glossary.md:774；:778「each time you receive it, you gain 1 Exhaustion level.
	//   You die if your Exhaustion level is 6」；:780 D20 Test −2×级（P2 消费）；:784「Finishing a Long
	//   Rest removes 1 of your Exhaustion levels」⇒ **唯一有源支撑的 persistent**
	exhaustion: { inactive: false, scope: 'persistent', levels: { min: 1, max: 6 } },
	// SRD 5.2.1 · rules-glossary.md:816；:820「You have Disadvantage on ability checks and attack rolls
	//   while the source of fear is within line of sight」（source 追踪归 P3）
	//   ⚠ `saveEnd` 属 house rule（SRD 无「豁免结束」机制，见文件头第 3 条）
	frightened: { selfRollMode: 'disadvantage', scope: 'battle', saveEnd: { ability: 'wis' } },
	// SRD 5.2.1 · rules-glossary.md:824；:830「Disadvantage on attack rolls against any target other than
	//   the grappler」（⚠ 本表按无条件劣势实现 —— 显式简化）
	grappled: { selfRollMode: 'disadvantage', scope: 'battle' },
	// SRD 5.2.1 · rules-glossary.md:923；:927「You can't take any action, Bonus Action, or Reaction」
	incapacitated: { inactive: true, scope: 'battle' },
	// SRD 5.2.1 · rules-glossary.md:988；:996「Attack rolls against you have Disadvantage, and your attack
	//   rolls have Advantage」
	invisible: { selfRollMode: 'advantage', targetRollMode: 'disadvantage', scope: 'battle', duration: 'turn' },
	// SRD 5.2.1 · rules-glossary.md:1123；:1127「_Incapacitated._ You have the Incapacitated
	//   condition」（源词为 Incapacitated）；:1133「Attack rolls against you have Advantage」；
	//   :1131 近战自动暴击（P3）；:1135 豁免必败（力/敏）
	paralyzed: { targetRollMode: 'advantage', inactive: true, scope: 'battle' },
	// SRD 5.2.1 · rules-glossary.md:1147；:1153「_Incapacitated._ You have the Incapacitated
	//   condition」（源词为 Incapacitated）；:1157「Attack rolls against you have Advantage」；
	//   :1159 豁免必败；:1161 全抗（P4）
	petrified: { targetRollMode: 'advantage', inactive: true, scope: 'persistent' },
	// SRD 5.2.1 · rules-glossary.md:1169；:1173「You have Disadvantage on attack rolls and ability checks」
	poisoned: { selfRollMode: 'disadvantage', scope: 'persistent' },
	// SRD 5.2.1 · rules-glossary.md:1183；:1189「You have Disadvantage on attack rolls. An attack roll
	//   against you has Advantage if the attacker is within 5 feet of you. Otherwise… Disadvantage」
	prone: { selfRollMode: 'disadvantage', targetMelee: 'advantage', targetRanged: 'disadvantage', scope: 'battle' },
	// SRD 5.2.1 · rules-glossary.md:1214；:1220「Attack rolls against you have Advantage, and your attack
	//   rolls have Disadvantage」；:1222 豁免劣势（敏）
	restrained: { selfRollMode: 'disadvantage', targetRollMode: 'advantage', scope: 'battle' },
	// SRD 5.2.1 · rules-glossary.md:1419；:1423「_Incapacitated._ You have the Incapacitated
	//   condition」（源词为 Incapacitated）；:1427「Attack rolls against you have Advantage」；
	//   :1425 豁免必败（力/敏）
	stunned: { targetRollMode: 'advantage', inactive: true, scope: 'battle', duration: 'turn' },
	// SRD 5.2.1 · rules-glossary.md:1503；:1507「_Inert._ You have the Incapacitated **and Prone**
	//   conditions…」（源词为 Inert；★源文此条**合并 Prone** ⇒ 本表暂未含 Prone 面，归后）；
	//   :1511「Attack rolls against you have Advantage」；:1509 近战自动暴击（P3）；:1513 豁免必败；:1515 速度 0
	unconscious: { targetRollMode: 'advantage', inactive: true, scope: 'battle' },
};

/* ---------- 注册进 Effect 注册表（#1727 单层权威） ---------- */

/* ⚠ **`desc` 是对玩家的契约面**：只写**本笔已实现**的效果；SRD 有、但本笔未落的面
 *  一律以「（未实现：…归 Pn）」显式标注 —— 与 `grappled` 同形（本笔只有该条做对，
 *  #1758 的 T 席 MAJOR-1 已把这条立为模板：desc 不得宣称未实现的效果）。 */
const NAMES = {
	blinded: ['目盲', '看不见，攻击与受击都受影响。'],
	charmed: ['魅惑', '（未实现：禁攻施魅者——需 source 追踪，归 P3）'],
	deafened: ['耳聋', '（未实现：听觉检定必败——仓无技能系统，归 P4）'],
	exhaustion: ['力竭', '每级使 D20 Test −2（归 P2）；6 级死亡、长休减 1 级。'],
	frightened: ['恐惧', '看见恐惧源时攻击与检定劣势。（未实现：源不可见即结束、不能靠近，归 P3）'],
	grappled: ['被擒抱', '攻击掷骰劣势。（简化：对擒抱者的例外未实现）'],
	incapacitated: ['失能', '不能进行任何动作。'],
	invisible: ['隐形', '攻击优势，对来犯劣势。'],
	paralyzed: ['麻痹', '失能；对来犯优势。（未实现：近战自动暴击、力/敏豁免必败，归 P3）'],
	petrified: ['石化', '失能；对来犯优势。（未实现：力/敏豁免必败、全抗，归 P4）'],
	poisoned: ['中毒', '攻击与检定劣势。'],
	prone: ['倒地', '攻击劣势；5 尺内来犯优势，否则劣势。'],
	restrained: ['受束', '攻击劣势；对来犯优势。（未实现：敏捷豁免劣势，归 P2/P3）'],
	stunned: ['震慑', '失能；对来犯优势。（未实现：力/敏豁免必败，归 P2/P3）'],
	unconscious: ['昏迷', '失能；对来犯优势。（未实现：近战自动暴击、力/敏豁免必败、Prone 面，归 P3）'],
};

for (const [id, cond] of Object.entries(DND5E.Conditions)) {
	const [name, desc] = NAMES[id] ?? [id, ''];
	RPG.defEffect({ id, name, desc, kind: 'debuff', ...cond });
}

/* ---------- 判定原语（读路径；全部从声明表派生） ---------- */

/** 双向分池：攻方自身修正 + 受方对来犯的影响（近战/远程条件性按 ctx.melee）。
 *  优势与劣势相消 ⇒ 'normal'；只返回字符串 ⇒ 断言模式而非点数（#1689 §八.1）。 */
DND5E.rollMode = (attacker, defender, { melee = false } = {}) => {
	const modes = [];
	const take = (c, field) => {
		for (const id of c?.effects ?? []) {
			const v = DND5E.Conditions[RPG.effectSplit(id).base]?.[field];
			if (v) modes.push(v);
		}
	};
	take(attacker, 'selfRollMode');
	take(defender, 'targetRollMode');
	take(defender, melee ? 'targetMelee' : 'targetRanged');
	const adv = modes.includes('advantage'), dis = modes.includes('disadvantage');
	return adv && dis ? 'normal' : adv ? 'advantage' : dis ? 'disadvantage' : 'normal';
};

/** 能否行动：派生式（`inactive: true` 且持有时 ⇒ 不能行动）。
 *  ⚠ 读持有性用 `c.effects.includes(id)`（`contains(裸 id)` 在 #1727 后已严格抛错；
 *  历史上其 props 分支会把裸 id 静默当道具检索 —— #1689 §三坑 1）。 */
DND5E.canAct = (c) => !Object.entries(DND5E.Conditions)
	.some(([id, cond]) => cond.inactive && (c?.effects ?? []).includes(id));

/** 豁免检定：1d20 + 该维调整值 vs DC（口径与 DND3.save 不同，见 #1689 §九.5，不自作统一） */
DND5E.save = (c, ability, dc) => {
	const mod = c?.stats?.[`save_${ability}`] ?? 0;
	const roll = DND5E.d20();
	return { success: roll + mod >= dc, roll, mod, dc };
};

/** 回合末豁免：非豁免型 ⇒ null；未持有 ⇒ 幂等 true（不掷骰）；成功 ⇒ 移除该条（层级条精确一层）。 */
DND5E.saveEnd = (c, condId, dc = 10) => {
	const base = RPG.effectSplit(condId).base;
	const cond = DND5E.Conditions[base];
	if (!cond?.saveEnd) return null;
	const level = RPG.effectLevelOfId(condId);            // 层级 id ⇒ 级数；非层级 ⇒ 0
	const held = level > 0 ? (c?.effects ?? []).includes(condId) : (c?.effects ?? []).includes(base);
	if (!held) return true;                               // 未持有 ⇒ 幂等（不掷骰）
	const r = DND5E.save(c, cond.saveEnd.ability, cond.saveEnd.dc ?? dc);
	if (r.success) c.lose(condId);                        // 写路径：id 串（#1727 放宽后的形态）
	return r.success;
};

/* ---------- 回合与战斗边界的自动流逝（挂 #1727 的 turnBoundary / battle:end） ---------- */

/** 回合末：`duration:'turn'` 的剩余回合数 −1，归零即移除。
 *  剩余数存 `c.effectTurns`（{ id: n }，纯数据 ⇒ 随 toJSON 存档）。未登记者按 1 起算。 */
DND5E.tickTurnDurations = (c) => {
	const left = c?.effectTurns ?? {};
	let changed = false;
	for (const id of [...(c?.effects ?? [])]) {
		const base = RPG.effectSplit(id).base;
		if (DND5E.Conditions[base]?.duration !== 'turn') continue;
		const n = (left[id] ?? 1) - 1;
		if (n > 0) { left[id] = n; continue; }
		delete left[id];
		c.lose(id);
		changed = true;
	}
	c.effectTurns = left;
	return changed;
};

/** 战斗结束清理：`scope:'battle'` 的条件全部移除（persistent 不受影响）。
 *  这是「限本场」语义的**唯一实现点**（#1730 反直觉点：现引擎天然跨场，本函数才造出"限本场"）。 */
DND5E.clearBattleScoped = (c) => {
	const removed = [];
	for (const id of [...(c?.effects ?? [])]) {
		const base = RPG.effectSplit(id).base;
		if (DND5E.Conditions[base]?.scope !== 'battle') continue;
		c.lose(id);
		if (c.effectTurns && id in c.effectTurns) delete c.effectTurns[id];
		removed.push(id);
	}
	return removed;
};

/** 死亡 ⇒ 全档清零（伞 #1728 死亡面裁定⑤：新肉身＝全新印出 ⇒ effects 与回合数全清）。
 *  ⚠ 本条与 scope 无关：**所有** effect 都清（含 persistent）。respawn 面另票，此处只做清理语义。 */
DND5E.clearEffectsOnDeath = (c) => {
	const kept = RPG.death?.id ?? 'death';
	const before = (c?.effects ?? []).length;
	if (Array.isArray(c?.effects)) c.effects = c.effects.filter((id) => id === kept);
	if (c && typeof c === 'object' && 'effectTurns' in c) c.effectTurns = {};
	return before - (c?.effects ?? []).length;
};

/** 施加条件（统一入口）：写入持有 + 登记回合数（`duration:'turn'` 用）。
 *  turns 省略时按 1（一个回合）。层级条件用「id:级数」（#1727 原子升降级）。 */
DND5E.gainCondition = (c, condId, { turns = 1 } = {}) => {
	c.gain(condId);
	const base = RPG.effectSplit(condId).base;
	if (DND5E.Conditions[base]?.duration === 'turn') {
		c.effectTurns = { ...(c.effectTurns ?? {}), [condId]: turns };
	}
	return c;
};

/* ---------- 接线：battle:end ⇒ 清 battle 档（pack 侧订阅，core 不认识条件） ---------- */

RPG.events.on('battle:end', ({ players = [], enemies = [] } = {}) => {
	for (const c of [...players, ...enemies]) {
		if (c instanceof RPG.Character) DND5E.clearBattleScoped(c);
	}
});

RPG.events.on('battle:turnEnd', ({ actor } = {}) => {
	if (actor instanceof RPG.Character) DND5E.tickTurnDurations(actor);
});

/** 闸门接线（#1689 P1 · canAct）：把「不能行动」的条件接进 #1727 的 turnStart 闸门。
 *  ⚠ 只对本包角色生效（`stats` 有 ac 字段即 5E 侧）；dnd3 面不受影响（负例见用例）。 */
RPG.events.on('battle:turnStart', (p) => {
	const actor = p?.actor;
	if (!(actor instanceof RPG.Character)) return;
	if (actor.stats?.prof === undefined) return;    // 非 5E 角色（3E 用 bab、无 prof）不接管
	if (!DND5E.canAct(actor)) { p.cancel = true; p.reason = '失能'; }
});
