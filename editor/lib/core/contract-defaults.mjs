// `#1188` 续片·A 半（父票 `#1184` 流三·甲）：**契约缺省规格**（引擎侧一处）。
//
// 为什么要有它：故事契约里大量成员挂在"缺省形态"上（`null`／`empty-array`／`empty-object`，以及一些等于
// 引擎默认的常量）。这些声明不是"这个故事的数据"，而是"这个故事没有这一面"。甲案的裁定是：**缺省表下沉引擎，
// 作者只声明实际消费集**。
//
// 本件是**规格**（不是清单）：每条缺省都回答同一个问题——**引擎看不到这个成员时，行为是什么**。因此它同时
// 替代了原先设想的"可选面白名单"：有没有默认，就是"该不该声明"的唯一判据（一处真相；白名单是人维护的清单，
// 会腐烂）。
//
// 与之配对的两条判据（`test/contract-defaults.mjs`）：
// 一、**读了而没声明、又没有缺省** → 报（缺口）；
// 二、**值等于缺省、且读点全带守卫** → 这条声明是**冗余**，报出来让作者去掉（去声明的前提就是读点全带守卫：
// 缺席后引擎看到 `undefined`，读点不带守卫会当场崩）。
//
//注意：本件是**构建期面**（编辑器侧），不放 `src/**`。B 半（按清单逐名给引擎读点加守卫，加完逐名去声明）
// 由另一张票跟踪，清单写在票面。

/** 能力开关（**仅此一名**，判据件钉住）：它回答"这个故事有没有这一面"，不是数据成员。 */
export const CAPABILITY_MEMBERS = new Set(['hasChargen']);

/**
 * **能力组**：若干成员合起来才是"一个能力"，不是若干独立值。
 *
 * 为什么单立：`flipItem`／`flipStarCost`／`flipReturnFlag` 是"时代翻转"这一个能力的三个参数。
 * - **整组在场性门控**：全缺 ⇒ 能力关（不崩、不渲染翻转件）；部分缺 ⇒ 出声点名缺哪几个（半声明是作者错，别静默）；
 * - **不给数值缺省**：`flipStarCost` 缺省成 0 会让"翻转免费"静默成立 —— 危险缺省，宁可让能力整体不在；
 * - 因此它们**不进 `default-missing`**（那不是"缺省没写"，而是"能力不在"）。
 * 口径一句话：**"缺席＝这个能力不在"是一件事；"缺席＝某个值取零"是另一件事**——前者门控，后者缺省，别混。
 */
/**
 * **能力组从引擎面派生**（`#1216` B 半 Operator 裁：同一份清单不许写两处）。
 * 引擎在 `src/10-core.twee` 的 script 段声明 `Sg.capabilityGroups = { … }`；本函数从那里读出。
 * 派生不到 ⇒ 返回 `null`（调用方**必须出声**，不许静默当空）。
 */
export const deriveCapabilityGroups = (coreSource) => {
	const m = String(coreSource ?? '').match(/Sg\.capabilityGroups\s*=\s*(\{[^}]*\})/);
	if (!m) return null;
	try {
		// 直接返回**组对象**（`{ flip: [ … ] }`）——调用方要的就是它，别再包一层。
		return JSON.parse(m[1].replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":').replace(/'/g, '"'));
	} catch { return null; }
};

/** 该成员是否属于某个能力组（按**派生**结果判；派生不到则返回 null，调用方出声）。 */
export const capabilityGroupOf = (name, groups) => {
	if (!groups) return null;
	return Object.entries(groups).find(([, ns]) => ns.includes(name))?.[0] ?? null;
};

/** 该成员是否属于某个能力组（属组的成员不按"单个缺省"判）。 */


/** 记一次核验的日期（本条规格逐条带"最后一核验"；改动或复核时更新）。 */
const VERIFIED = '2026-09-22';

/**
 * 缺省规格：成员名 → `{ kind, value?, verified}`。
 * `kind` 与契约 `kind` 同词表（见 `emit.mjs` 的 `KINDS`）。
 */
// 同理，`foeState`／`battleDamage` **也保持必给**：读点缺席时当场 `throw`（结构缺失必须 fail-loud，
// 不是『省略即可』的可选成员）⇒ 表里不给缺省，理由同上。
// 为什么表里没有 `starBudget`：它 **保持必给**（`#1216` B 半 Operator 裁）——
// 缺席时引擎在 `overBudget` 里 `!Number.isFinite(b)` 抛错，那是『缺了不成立』的正当语义；
// 补个数值缺省反而会让『预算无限』静默成立（危险缺省）。同理见 `CAPABILITY_GROUPS`（能力组不按单个缺省判）。
export const DEFAULTS = {
	// 这一面不存在
	mechanics: { kind: 'null', verified: VERIFIED },
	checkSite: { kind: 'null', verified: VERIFIED },
	combatAction: { kind: 'null', verified: VERIFIED },
	gearDef: { kind: 'null', verified: VERIFIED },
	itemEffect: { kind: 'null', verified: VERIFIED },
	chargen: { kind: 'null', verified: VERIFIED },
	lootText: { kind: 'null', verified: VERIFIED },
	// 这一面在，但空
	notes: { kind: 'empty-object', verified: VERIFIED },
	pcDefaults: { kind: 'empty-object', verified: VERIFIED },
	socialHooks: { kind: 'empty-object', verified: VERIFIED },
	rules: { kind: 'empty-array', verified: VERIFIED },
	combatPool: { kind: 'empty-array', verified: VERIFIED },
	// 在这一面但没有增益／用恒等标签
	poisonReduce: { kind: 'const', value: 0, verified: VERIFIED },
	dragonMaxHp: { kind: 'const', value: 0, verified: VERIFIED },
	actionLabel: { kind: 'identity-string', verified: VERIFIED },
	pcShape: { kind: 'empty-object', verified: VERIFIED },
	prepick: { kind: 'null', verified: VERIFIED },
	socialApproaches: { kind: 'empty-object', verified: VERIFIED },
	// 省略 `socialAttAdj` 时引擎给的是**中性表**（不是空表）⇒ 按省略后的可观测行为写 `const` 带值。
	socialAttAdj: { kind: 'const', value: { friendly: -5, neutral: 0, hostile: 5 }, verified: VERIFIED },
	socialAsks: { kind: 'empty-array', verified: VERIFIED },
	codexItems: { kind: 'null', verified: VERIFIED },
	// 能力开关（缺席即"没有车卡"）
	hasChargen: { kind: 'const', value: false, verified: VERIFIED },
};

/** 纯函数：这条声明是不是"等于缺省"（形态相同，或 const 值与缺省相等）。 */
export const equalsDefault = (member, defaults = DEFAULTS) => {
	const def = defaults[member?.name];
	if (!def) return false;
	// 注意：`const` 必须先比**值**再谈形态 —— 只比 kind 会把"值不同"的常量也判成等于缺省（自证抓出来过）。
	if (def.kind === 'const') return member.kind === 'const' && member.value === def.value;
	return member.kind === def.kind;
};

/**
 * 纯函数：读点是不是**带守卫**的形态。
 * 只认可选链（`?.(`／`?.[`）与空值合并（`??`）——twee 里的 `not X()` 是**取反**不是守卫（缺席照样崩）。
 */
/**
 * 引擎消费面的**读点形态**（一处定义，别处引用）。
 *
 * 为什么集中在这里：读点识别的**形态**会随写法增长（故事经接入契约取数有几种写法），
 * 每处各写一份正则就会"一份改、一份烂"（本仓已多次同族）。因此形态与"适用件类型"在此登记，
 * 判据件与将来的读者都引用本表。
 *
 * 字段：`name` 形态名 · `kind` 适用件类型（`all`／后缀数组） · `re` 正则 · `note` 为何这样取。
 */
export const READ_FORMS = [
	{
		name: 'sg-story',
		kind: 'all',
		re: /Sg\s*\??\.\s*story\s*\??\.\s*([A-Za-z_$][\w$]*)/g,
		note: '基本形态 `Sg.story.<名>`（`??.` 表示守卫可选，仍算读点）',
	},
	{
		name: 'alias',
		kind: 'all',
		re: null,
		note: '别名形态：先由 `alias = Sg.story` 派生出本地别名，再取 `alias.<名>`（不硬编具体别名，避免"按名字记"）',
	},
];

/** 从源码文本派生"契约别名"（`X = Sg.story`）⇒ 供别名形态使用。派生不到就返回空集。 */
export const deriveContractAliases = (src) => {
	const out = new Set();
	// 别名赋值有多种写法：`X = Sg.story`／`X = window.Sg.story`／`X = (window.Sg.story ??= {})`（本仓实测三种都有）。
	const re = /(?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s*=\s*\(?\s*(?:window\s*\.\s*)?Sg\s*\??\.\s*story\b/g;
	let m;
	while ((m = re.exec(src)) !== null) out.add(m[1]);
	return out;
};

/** 是否为**反引号表达式**（twee 的 `` `…` `` 是表达式插值，不是字符串 ⇒ 不能按 JS 字符串跳过）。 */
export const isTweeFile = (path) => /\.twee$/.test(String(path ?? ''));

export const isGuardedRead = (tail, before = '') => {
	const s = String(tail ?? '');
	const b = String(before ?? '');
	// 守卫可能落在**名字之前**（`Sg.story?.rules`）⇒ 只看 tail 会漏判"已守卫"（`#1216` B 半实测）。
	return b.includes('?.') || s.startsWith('?.') || /^\s*\?\?/.test(s);
};

/**
 * 本判据的**域**：某故事声明过的契约成员名。
 *
 * 为什么要有这个域：判据问的是"**这条声明**有没有运行时消费者"，域里只该有**契约成员**——
 * 引擎在契约对象上自加的属性（如 `overBudget`）与 JS 自身的方法（`includes`／`join`）**从来不在域内**，
 * 因此它们不是"被过滤掉的特例"，而是**本就不属于本判据**。
 *
 * 声明面取故事自己的 `data/contract.json`（声明处本身）⇒ 不另手列清单、不造第二份真相。
 */
export const contractReadDomain = (membersByStory = {}) => {
	const out = new Set();
	for (const list of Object.values(membersByStory)) for (const m of list ?? []) out.add(m.name);
	return out;
};

/** 纯函数：数据成员数（不含能力开关）。正文里的"成员数"一律用这个。 */
export const dataMemberCount = (members = []) => members.filter((m) => !CAPABILITY_MEMBERS.has(m.name)).length;

/**
 * 纯函数：本节口径的缺口清单（空＝绿）。
 * `readsByMember`：成员名 → 读点数组（每项 `{ file, line, tail}`，`tail` 是成员名之后的原文）。
 */
export const defaultProblems = ({ membersByStory = {}, readsByMember = {}, defaults = DEFAULTS, capabilityGroups = null } = {}) => {
	// 能力组成员由**组助手**读取（`Sg.story[n]()` 是动态取，形态扫描看不见）⇒ 按"已被读"算，且不按单个缺省判。
	const inCapabilityGroup = (n) => capabilityGroupOf(n, capabilityGroups) !== null;
	const out = [];
	for (const [slug, members] of Object.entries(membersByStory)) {
		const declared = new Set(members.map((m) => m.name));
		// 一、死声明：声明了但引擎从不读
		// 能力组成员由组助手读取（动态取，形态扫描看不见）⇒ 不算死声明。
		for (const n of declared) if (!inCapabilityGroup(n) && !(n in readsByMember)) out.push({ slug, code: 'dead-declaration', name: n });
		// 二、冗余声明：值等于缺省，且读点全带守卫（去声明的前提）
		for (const m of members) {
			if (!equalsDefault(m, defaults)) continue;
			const sites = readsByMember[m.name] ?? [];
			const unguarded = sites.filter((s) => !isGuardedRead(s.tail, s.before));
			if (sites.length && unguarded.length === 0) out.push({ slug, code: 'redundant-declaration', name: m.name,
				why: `值等于缺省，${sites.length} 处读点全带守卫` });
		}
	}
	// 二·补：已声明 ＋ 被读 ＋ 缺省规格里没有它 → 点名（读者必须先补缺省或加守卫；
	// 这是“已声明成员的缺省”这一新语义：旧语义“任意名的缺省”随读点按域收窄已失效）。
	for (const [slug, members] of Object.entries(membersByStory)) {
		for (const m of members) {
			// 收紧：只在"缺省**承重**"时点名 —— 即**并非每个有契约的故事都声明它**。
			// 若三故事都声明（如 `econEvents`，`kind: game-ref`，缺它时引擎 fail-loud），
			// 则缺省规格里没有它是**正当机制**（必给成员），不是缺口。
			const declarers = Object.values(membersByStory).filter((list) => (list ?? []).some((x) => x.name === m.name)).length;
			const storyCount = Object.values(membersByStory).filter((list) => (list ?? []).length > 0).length;
			if (inCapabilityGroup(m.name)) continue;   // 能力组不按『单个缺省』判（见 CAPABILITY_GROUPS）
			if ((readsByMember[m.name] ?? []).length && !(m.name in defaults) && declarers < storyCount) {
				out.push({ slug, code: 'default-missing', name: m.name,
					at: (readsByMember[m.name] ?? []).map((r) => r.file + ':' + r.line),
					why: '已声明且被引擎读，但缺省规格里没有它（读者要先加守卫，或把它补进缺省规格）' });
			}
		}
	}
	// 三、读了而没声明、又没有缺省 → 缺口
	const anyDeclared = new Set(Object.values(membersByStory).flat().map((m) => m.name));
	for (const n of Object.keys(readsByMember)) {
		if (!anyDeclared.has(n) && !(n in defaults)) out.push({ slug: '(全故事)', code: 'read-without-default', name: n });
	}
	// 四、去声明的前提：值等于缺省**但**存在无守卫读点 → 不许去（先做 B 半）
	for (const [slug, members] of Object.entries(membersByStory)) {
		for (const m of members) {
			if (!equalsDefault(m, defaults)) continue;
			const unguarded = (readsByMember[m.name] ?? []).filter((s) => !isGuardedRead(s.tail, s.before));
			if (unguarded.length) out.push({ slug, code: 'needs-guard-first', name: m.name,
				at: unguarded.map((r) => r.file + ':' + r.line), why: `${unguarded.length} 处无守卫（先加守卫再谈去声明）` });
		}
	}
	return out;
};
