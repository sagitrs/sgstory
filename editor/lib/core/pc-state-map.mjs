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

/** 世界观概念：由**故事自己声明形状与初值**（契约面 `pcShape`），**不恒在基础面**、也不归任何通用模块。 */
export const PC_STORY_CONCEPTS = ['star', 'keeper'];

/** 玩法概念名表（判据二用它判"未声明模块的故事零玩法概念"）：与上面两张表**同源**。 */
export const PC_GAMEPLAY_CONCEPTS = [...Object.keys(PC_GAMEPLAY_HOME), ...PC_STORY_CONCEPTS];

/** 纯函数：某故事声明了哪些模块时，它的角色状态应有哪些玩法键（用于判据三）。 */
export const gameplayKeysFor = (declaredModules = []) => {
	const set = new Set(declaredModules);
	return Object.entries(PC_GAMEPLAY_HOME).filter(([, home]) => set.has(home)).map(([k]) => k);
};

/**
 * ★★ `#1564`（`#1222` 链首 L0 · 件④）：**引擎写的 `pc` 键必须**已在归属表里宣告**。
 *
 * **为什么要它**（本仓实测的形态 —— `pc.classHp` "隐键"）：
 *   `pc.classHp` 由**车卡 `patch.set` 临时造**（`chargen.json` 的 `"classHp":{"set":10}`），
 *   被 `finalize()` 读（`80-script.twee:875`：`pc[_kmx] = (pc.classHp ?? _hpArg) + …`），
 *   而它 ★**✗ 在 `PC_GAMEPLAY_HOME`**（无归属）★**✗ 在 `PC_BASE_KEYS`**（非基础面）
 *   ★**✗ 在 `groups.chargen.keys`**（✗ 在那 13 名清单里）⇒ **三处皆无 = "隐键"** ✗
 *
 * **后果（为什么必须红）**：隐键**不在任何清单** ⇒ `pcShape` 的"车卡族键**二选一**"守卫、
 *   `defaults()` 的预置形状、归属表 —— **三条面都看不见它** ⇒
 *   归并/迁移时**漏掉它也不会有人报**，而 `finalize` 的 `?? _hpArg` 会**静默走缺省**（＝静默改数值）✗
 *
 * **口径**（与 `#1484` **反向成对**，`#1222` 裁决）：
 *   · `#1484` 管"**声明里不许给已知（引擎面）键**"（`pcShape` 与车卡流程并存 ⇒ 点名）；
 *   · **本函数管"引擎不许写未宣告的键"** ⇒ 两侧合起来＝"**共读可以，两处产生不行**"（`#1222` 总口径）✓
 *
 * **判据（纯函数，能假）**：给定"引擎写入点"的键集 ⇒ 不在 `已宣告集`（基础面 ∪ 归属表）的键 ⇒ 点名。
 * ★`written` 由调用方注入（✗ 不在此读盘 —— 与本仓"合成输入不得让默认值去读盘"的纪律一致）。
 */
export const undeclaredWriteProblems = ({ written = [], home = PC_GAMEPLAY_HOME, base = PC_BASE_KEYS } = {}) => {
	const declared = new Set([...base, ...Object.keys(home)]);
	const out = [];
	for (const k of written) {
		if (!declared.has(k)) {
			out.push({ code: 'undeclared-pc-write', key: k,
				why: `引擎写了 \`pc.${k}\`，但它**✗ 在基础面**（\`PC_BASE_KEYS\`）**✗ 在归属表**（\`PC_GAMEPLAY_HOME\`）`
					+ ' ⇒ **隐键**：不在任何清单 ⇒ "车卡族二选一"守卫／预置形状／归属表**三条面都看不见它**'
					+ ' ⇒ 归并时漏它也无人报，而读点会**静默走缺省**（＝静默改数值）✗'
					+ '（`#1564` 件④；与 `#1484` 反向成对）' });
		}
	}
	return out;
};

/**
 * ★★ `#1564`（`#1222` 链首 L0 · 件③）：**同一个键被两族各自产生 ⇒ 点名红**。
 *
 * **口径**（`#1222` 总口径）：**共读可以，两处产生不行** ——
 *   · **共读可以**：一个键被两族**读**是**合法**的（`salves` 是实例：既是 vitals 量纲
 *     ［有下限／阈值 ⇒ 结算要拿它判定］又是道具计数［展示／持有一族］）⇒ ✗ 不许因此报错；
 *   · **两处产生不行**：同一键被**两条路径各自写** ⇒ **哪一份生效不可判**（谁后写谁赢，或深合并各半）✗。
 *
 * **为什么它不是新造概念**（本仓既有先例 ＋ 它在归并后的**替代物**）：
 *   `10-core.twee` 的 `pcShape` 处理里原有一条**并存守卫**：
 *     "`pcShape` 给车卡族键 **且** 车卡流程也在 ⇒ throw"（`#1484`）——
 *   但它的**判据物**是 `hasChargen` ＋ `chargen != null`（两名都在归并中消失）⇒
 *   ★若跟着删 ⇒ "两条产生路径"从**当场点名**退化为**静默以某一方为准**（`#1474`／`#1478` 同族）✗
 *   ⇒ 故本函数把它**转形**成不依赖那两名的形：**直接判"两个产生源的键集有没有交"** ✓
 *
 * **判据（纯函数，能假）**：给两个**产生源**的键集 ＋ 各族名 ⇒ 交非空 ⇒ 每个交键点名两端。
 * ★`sources` 由调用方注入（✗ 不在此读盘）—— 与本仓"合成输入不得让默认值去读盘"的纪律一致。
 */
export const dualProducerProblems = ({ sources = {} } = {}) => {
	const names = Object.keys(sources);
	const out = [];
	for (let i = 0; i < names.length; i++) {
		for (let j = i + 1; j < names.length; j++) {
			const a = names[i], b = names[j];
			const A = new Set(sources[a] ?? []), B = new Set(sources[b] ?? []);
			for (const k of A) {
				if (B.has(k)) {
					out.push({ code: 'dual-producer', key: k, a, b,
						why: `键 \`${k}\` 被**两族各自产生**（\`${a}\` ∧ \`${b}\`）⇒ **哪一份生效不可判** ✗`
							+ '（同一族**共读**是合法的 —— `salves` 即实例；但**两处产生**不行）'
							+ '（`#1564` 件③：旧 `hasChargen` 并存守卫的**转形**）' });
				}
			}
		}
	}
	return out;
};

/**
 * ★★ `#1564`（`#1222` 链首 L0 · 件④）：**"隐键"的登记表（带退出条件）**。
 *
 * **为什么需要它**（范围边界，协调席 2026-09-27 裁**甲**）：
 *   `pc.classHp` 是**已实测的隐键**（✗ 基础面 ✗ 归属表 ✗ 13 名清单），而它的**消除**是
 *   `#1222` 链 **L1/L2** 的事（写作者裁："随归并消掉"，承载物改住声明面 `classes.<职业>.hp`）
 *   ⇒ ★L0 **只落判据＋对该实例登记**（"**抓而不修**"，正是范围边界），✗ 让 L0 现在就把夹具判红。
 *
 * **口径（与 `FIXTURE_FACE_EXCEPTIONS` 同族）**：每行 `{ why, removal, check }` ——
 *   · `why`：为何留着（散文）；
 *   · `removal`：退出条件（散文）；
 *   · `check`：退出条件的**可机核谓词**（✗ 自由书写 —— 与 `EXCEPTION_REMOVAL_CHECKS` 的"小词表"同纪律）。
 *   ⇒ ★`exceptionRemovable(key, ctx)` 命中 ⇒ 该登记行**已可清** ⇒ 判据会红（防"登记成了永久豁免"）。
 */
export const UNDECLARED_WRITE_EXCEPTIONS = Object.freeze({
	classHp: {
		why: '车卡 `patch.set` 造的隐键（`finalize` 读它算血）—— 引擎侧三面（基础面／归属表／13 名清单）皆无它',
		removal: '`#1222` 链 L1/L2 归并完成时（承载物改住声明面 `classes.<职业>.hp`）⇒ 该键从数据面消失',
		check: { kind: 'absentFromData', name: 'classHp' },
	},
});

/** 该登记行的**退出条件是否已满足**（＝已可清）。`ctx.dataKeys` 由调用方注入（✗ 不在此读盘）。 */
export const exceptionRemovable = (key, { dataKeys = [] } = {}) => {
	const row = UNDECLARED_WRITE_EXCEPTIONS[key];
	if (!row) return false;
	const set = new Set(dataKeys);
	if (row.check?.kind === 'absentFromData') return !set.has(row.check.name);
	return false;
};

/** 纯函数：`undeclaredWriteProblems` 的**登记感知**版（✗ 未登记 ⇒ 报；已登记 ⇒ 只列"信息面"）。
 *  ★分工：**未登记** ⇒ 失败面（该红）；**已登记** ⇒ 信息面（只报，✗ 计退码）＋ 退出条件命中则**转回失败面**。 */
export const undeclaredWriteReport = ({ written = [], dataKeys = null, home = PC_GAMEPLAY_HOME, base = PC_BASE_KEYS } = {}) => {
	const fails = [], infos = [];
	// ★★ 评审 CR（tester-4）修：**登记行的"已可清"必须能判到** ——
	//   ✗ 原实现只在"**该键仍被写**"的循环里查退出条件 ⇒ 键**不再被写**时（＝退出条件**已满足**、
	//     正是要报的时刻）循环**看不到它** ⇒ 登记行成了**永久豁免**（④f 声称要防的正是这个 ✗）。
	//   ⇒ 两件事分开：① `written` 里的**未登记**键 ⇒ 失败面；② **登记表本身**逐行查退出条件
	//     （`dataKeys` 缺省 ＝ 用 `written` 当"数据面实况"；调用方若另有数据面读数可显式传）。
	const data = dataKeys ?? written;
	for (const p of undeclaredWriteProblems({ written, home, base })) {
		if (p.key in UNDECLARED_WRITE_EXCEPTIONS) {
			infos.push({ ...p, code: 'undeclared-pc-write-registered' });
		} else fails.push(p);
	}
	// ② 登记表逐行：退出条件命中 ⇒ 该行**已可清** ⇒ 红（✗ 让登记变成永久豁免）
	for (const key of Object.keys(UNDECLARED_WRITE_EXCEPTIONS)) {
		if (!exceptionRemovable(key, { dataKeys: data })) continue;
		fails.push({ code: 'exception-removable', key,
			why: `\`pc.${key}\` 的**登记行已可清**（退出条件命中：${UNDECLARED_WRITE_EXCEPTIONS[key].removal}）`
				+ ' ⇒ 请删除该登记行（✗ 让登记变成永久豁免）' });
	}
	return { fails, infos };
};

/** 便捷：从 `rules.json` ＋ `passages.json` 的行/链接里抽条件（✗ 调用方不必各写一遍遍历）。
 *  ★与 `unknownPrefixProblems`（在 `audit-shared.mjs`）分工：**本函数只管"抽"**（数据遍历），
 *    那条管"判"（前缀合法性）—— 抽与判分开，两侧各自可测 ✓。 */
export const collectConditionKeys = ({ rules = null, passages = null, tables = null } = {}) => {
	const out = [];
	const push = (obj, ctx) => { if (obj && typeof obj === 'object') out.push({ cond: obj, ctx }); };
	// ★★ 评审 CR（tester-4）：**两种载体的条件位置不同** ——
	//   · **规则行**：条件**在行顶层**（`{id, scope, req, any, exclude, …}`）⇒ 推 `r` 本身 ✓
	//   · **链接**：条件**嵌在 `cond` 下**（`{id, label, to, prio, cond:{req:[…]}}`）⇒ ★必须推 `l.cond`
	//     原实现推 `l` 本身 ⇒ 顶层没有 `req` ⇒ **该判据对链接恒不命中** ✗
	//     ★而**链接正是真数据的主战场**（实测：`north-room`／`m3-min-new` 等故事的条件主要写在 `links[].cond`）
	//     ⇒ 评审的刀：把链接里的 `inv:铜钥匙` 改成 `foo:…` ⇒ 修前 `rc=0` ＋ 产物真进 ✗
	for (const r of rules?.rows ?? []) push(r, `规则行「${r?.id ?? r?.scope ?? '?'}」`);
	for (const [seg, v] of Object.entries(passages ?? {})) {
		for (const l of (v?.links ?? [])) {
			// ★兜底：`cond` 缺失时退回 `l` 本身（若将来有人在链接顶层写条件，仍能抓到 ✓）
			push(l?.cond ?? l, `段「${seg}」的链接「${l?.id ?? l?.to ?? '?'}」`);
		}
	}
	// ★★ 评审补充（量化补充）：**`tables.json` 的容器里也有条件键** —— 逐容器扫（✗ 容器名不写死 ✓）。
	// ★★ 评审补充（量化补充）：**`tables.json` 的容器里也有条件键**（实测 3 个 `req`）
	//   ⇒ 逐容器递归扫（✗ 容器名不写死 ✓）；★与 `dataFaceMemberProblems` 的 walk 同法。
	{
		const walkT = (obj, path) => {
			if (Array.isArray(obj)) { for (const v of obj) walkT(v, path); return; }
			if (obj && typeof obj === 'object') { for (const k of Object.keys(obj)) walkT(obj[k], path + k + '.'); }
			for (const field of ['req', 'any', 'exclude']) {
				const v = obj?.[field];
				if (!Array.isArray(v)) continue;
				for (const c of v) if (typeof c === 'string') push({ [field]: [c] }, path.replace(/\.$/, ''));
			}
		};
		walkT(tables, 'tables.');
	}
	return out;
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
