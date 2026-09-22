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

/** 记一次核验的日期（本条规格逐条带"最后一核验"；改动或复核时更新）。 */
const VERIFIED = '2026-09-22';

/**
 * 缺省规格：成员名 → `{ kind, value?, verified}`。
 * `kind` 与契约 `kind` 同词表（见 `emit.mjs` 的 `KINDS`）。
 */
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
export const isGuardedRead = (tail) => {
	const s = String(tail ?? '');
	return s.startsWith('?.') || /^\s*\?\?/.test(s);
};

/** 纯函数：数据成员数（不含能力开关）。正文里的"成员数"一律用这个。 */
export const dataMemberCount = (members = []) => members.filter((m) => !CAPABILITY_MEMBERS.has(m.name)).length;

/**
 * 纯函数：本节口径的缺口清单（空＝绿）。
 * `readsByMember`：成员名 → 读点数组（每项 `{ file, line, tail}`，`tail` 是成员名之后的原文）。
 */
export const defaultProblems = ({ membersByStory = {}, readsByMember = {}, defaults = DEFAULTS } = {}) => {
	const out = [];
	for (const [slug, members] of Object.entries(membersByStory)) {
		const declared = new Set(members.map((m) => m.name));
		// 一、死声明：声明了但引擎从不读
		for (const n of declared) if (!(n in readsByMember)) out.push({ slug, code: 'dead-declaration', name: n });
		// 二、冗余声明：值等于缺省，且读点全带守卫（去声明的前提）
		for (const m of members) {
			if (!equalsDefault(m, defaults)) continue;
			const sites = readsByMember[m.name] ?? [];
			const unguarded = sites.filter((s) => !isGuardedRead(s.tail));
			if (sites.length && unguarded.length === 0) out.push({ slug, code: 'redundant-declaration', name: m.name, why: `值等于缺省，${sites.length} 处读点全带守卫` });
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
			const unguarded = (readsByMember[m.name] ?? []).filter((s) => !isGuardedRead(s.tail));
			if (unguarded.length) out.push({ slug, code: 'needs-guard-first', name: m.name, why: `${unguarded.length} 处无守卫（先加守卫再谈去声明）` });
		}
	}
	return out;
};
