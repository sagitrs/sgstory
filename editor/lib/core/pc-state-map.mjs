// `#1186`（父票 `#1184` 流一·甲）：**角色状态的归属表**（哪一栈状态归谁）。
//
// 这张表是**单一真相**：引擎的基础面清单、各模块贡献的状态组、以及"玩法概念名表"（判据二用它判"未声明模块的
// 故事零玩法概念"）都从这里取。一份定义，三处消费，防两张表漂移。
//
// ## 口径（`#1184` 流一裁定）
//
// - **基础面清单化**：引擎只预置与玩法机制无关的角色状态（身份、轮次、选项、证据链、世界旗标），显式列清单；
// - **玩法状态随模块**：某个模块的状态组，只有该故事**声明**了那个模块时才存在；
// - **默认值从模块来**：中性值写在模块里，**不从数据面**（`Sg.story.pcDefaults()`）来；数据面只给"数值"，
// 不给"形状"，更不负责定义玩法概念。
//
// ## 故事要加自定义状态键：走声明，不要直接塞
//
// 键集合的纪律由"引擎定全集"改为"**引擎定基础面 ＋ 故事可扩展**"（`#1186` 裁定三·甲）。扩展的**正规入口**是
// 故事自己的接入契约（故事侧的声明），由引擎在初始化时按声明补齐形状；**不自动生成**、也不允许在数据面凭空
// 塞一个键（那样等于键集合又回到无主状态，本票要治的正是这个）。世界观概念（例如"星力""守林人"）走这条路径。
//
// ## 本文件只描述归属，不改行为
//
// 引擎侧的实际改动（基础面收窄、模块贡献状态、声明路径打通）在后续提交里；本表先落，供判据面与后人对照。

/** 与玩法机制无关的基础面：引擎预置，任何故事都有。 */
export const PC_BASE_KEYS = ['name', 'round', 'picked', 'mode', 'flags', 'ev', 'world'];

/**
 * 玩法状态组：键 → 归属模块（模块名与 `src/engine/40-sim/**` 的模块一致）。
 * 这些键**只在故事声明了对应模块时**存在；中性值由该模块给。
 */
export const PC_GAMEPLAY_HOME = {
	// 车卡（`18-chargen.twee` 一族）：没有车卡的故事这些键恒空，归属依据最强
	classKey: 'chargen', classLabel: 'chargen',
	bgKey: 'chargen', bgLabel: 'chargen',
	speciesKey: 'chargen', speciesLabel: 'chargen',
	abilities: 'chargen', skills: 'chargen', feats: 'chargen', gear: 'chargen',
	hp: 'chargen', max_hp: 'chargen', salves: 'chargen',
	// 各机制模块
	gold: 'economy',
	inv: 'items',
	gearHp: 'gear',
	statuses: 'checks',
	dragon: 'combat',
	soc: 'social',
};

/**
 * 各状态组的**在场信号**（＝故事接入契约面）。`kind` 决定怎么判在场：`fn` ＝ 调用后为真；`data` ＝ 非空。
 * 与引擎里 `Game.Pc.groups` 同源（引擎那份是运行期用，本份是构建期/判据面用；两者由判据件交叉核对）。
 */
export const PC_GROUP_SIGNALS = {
	chargen: { faces: ['hasChargen'], kind: 'fn' },
	economy: { faces: ['econEvents'], kind: 'data' },
	items: { faces: ['itemEffect'], kind: 'data' },
	gear: { faces: ['gearDef'], kind: 'data' },
	checks: { faces: ['checkSite'], kind: 'data' },
	combat: { faces: ['combatPool', 'combatAction'], kind: 'data' },
	social: { faces: ['socialAsks', 'socialHooks'], kind: 'data' },
};

/** 世界观概念（走"故事声明扩展"那条路径，不归任何通用模块）。 */
export const PC_STORY_CONCEPTS = ['star', 'keeper'];

/** 玩法概念名表（判据二用它判"未声明模块的故事零玩法概念"）：与上面两张表**同源**。 */
export const PC_GAMEPLAY_CONCEPTS = [...Object.keys(PC_GAMEPLAY_HOME), ...PC_STORY_CONCEPTS];

/** 纯函数：某故事声明了哪些模块时，它的角色状态应有哪些玩法键（用于判据三）。 */
export const gameplayKeysFor = (declaredModules = []) => {
	const set = new Set(declaredModules);
	return Object.entries(PC_GAMEPLAY_HOME).filter(([, home]) => set.has(home)).map(([k]) => k);
};

/** 纯函数：归属表自身的形状检查（空＝绿）：三张表不重叠、基础面不含玩法概念。 */
export const pcHomeProblems = () => {
	const out = [];
	const base = new Set(PC_BASE_KEYS);
	for (const k of Object.keys(PC_GAMEPLAY_HOME)) if (base.has(k)) out.push({ code: 'base-overlap', key: k });
	for (const k of PC_STORY_CONCEPTS) if (base.has(k)) out.push({ code: 'base-overlap', key: k });
	for (const k of PC_STORY_CONCEPTS) if (k in PC_GAMEPLAY_HOME) out.push({ code: 'concept-shared', key: k });
	if (PC_GAMEPLAY_CONCEPTS.length !== Object.keys(PC_GAMEPLAY_HOME).length + PC_STORY_CONCEPTS.length) out.push({ code: 'name-list-drift' });
	return out;
};
