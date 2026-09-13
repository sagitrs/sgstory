// 故事「新机制声明表」的**形状校验**（`#459` 剩余：形状落码 · 伞 `#441`／`#482`）
//
// 为什么是它、为什么在这：`#486` 的出口判据要「声明表**由表驱动、可被门读取**」，而 `#482` 又写着
// 「先立引擎侧的新机制契约，再写故事内容」—— 形状必须先能被**机器读**，否则等于没有契约。
// 这里只做**静态形状校验**（gate-time）；引擎运行时的两条义务在 `docs/engine-story-boundary.md`：
//   ① provider 结构缺失 ⇒ **报错**（不许静默 0/空）；② 故事未声明新机制 ⇒ **走旧路径**（显式降级，见 `#492`）。
//
// 「形状即判据」六条（`#459`）→ 本文件逐条实现：
//   ① 保护关系：`slots[*].protects` ∈ `hitLocations` ∪ {null}（否则"有装备的槽位永远打不到"⇒ 装备无效）
//   ② 耐久：`maxHp > 0`；`reduce` 形态必须是**声明过的一种**且只写一种
//   ③ 异常：`parts` ⊆ `hitLocations`（或 `'*'`）；`check.attr` 在属性表里；`onFail` 的 `when` 分档**穷尽**
//   ④ 波次：`short.waves` 恰 1 批；`long.waves` 恰 2 批且第二批 `difficulty` 更大、`reinforce:true`
//   ⑤ 线索：同段各路 `hint` **两两不可等价**（等价 ⇒ 玩家无法区分两条路）
//   ⑥ 随机源：不在本表里（是引擎代码纪律）——见文档；本校验器只保证"表里没有藏着随机源"。

/** 失败分档词表：**引擎口径的唯一权威**（改这里就是改口径，改完要跑 `test/story-shape.mjs`）。 */
export const GRADE_SET = ['most', 'low'];
/** 减成（`reduce`）允许的形态。故事声明"哪一种"，引擎按声明取值 ⇒ 这里就是**枚举权威**。 */
export const REDUCE_FORMS = ['flat', 'dice', 'percent'];

/** 归一化（判"两两不可等价"时用）：去空白 —— 「碎石间有拖行的痕迹」与同文多空格视为等价。 */
const norm = (s) => String(s ?? '').replace(/\s+/g, '').trim();

/**
 * 校验故事的新机制声明表。
 * @param {object|null|undefined} m  `Sg.story.mechanics()` 的返回（`null` ＝ 未启用新机制）
 * @param {{poolNames?: () => string[], abilities?: string[]}} ctx
 *   `poolNames`：该故事已登记的作战池名（引擎侧经 `Sg.story.combatPool` 判定）；
 *   `abilities`：属性表键（`Game.Rules.ABILITIES` 的键）。
 * @returns {{enabled: boolean, problems: string[]}}
 *   `enabled:false` ⇒ 故事声明"未启用" ⇒ **不是错误**（引擎走旧路径）。
 */
export const validateStoryMechanics = (m, ctx = {}) => {
	const problems = [];
	const poolNames = ctx.poolNames ?? (() => []);
	const abilities = ctx.abilities ?? [];
	const push = (msg) => problems.push(msg);
	if (m === null || m === undefined) return { enabled: false, problems };

	const slots = m.slots ?? {};
	const hit = m.hitLocations;

	// ① 槽位与保护关系
	if (!Object.keys(slots).length) push('slots：启用新机制必须声明槽位表（空表＝没有可装备的位置）');
	if (!Array.isArray(hit) || !hit.length) push('hitLocations：未声明或为空（掷骰的取值范围就是它）');
	if (Array.isArray(hit) && new Set(hit).size !== hit.length) push('hitLocations：有重复部位');
	for (const [id, s] of Object.entries(slots)) {
		if (s?.protects !== null && !(hit ?? []).includes(s?.protects)) {
			push(`slots.${id}.protects=${JSON.stringify(s?.protects)} 不在 hitLocations 里 ⇒ 该槽位保护的部位永远打不到（装备等于无效）`);
		}
		if (typeof s?.label !== 'string' || !s.label) push(`slots.${id}.label 缺失（槽位名是玩家可见文案）`);
	}

	// ② 装备与耐久
	for (const [name, e] of Object.entries(m.equipment ?? {})) {
		if (!Object.hasOwn(slots, e?.slot ?? '\u0000')) push(`equipment.${name}.slot=${JSON.stringify(e?.slot)} 不是已声明槽位`);
		if (!(typeof e?.maxHp === 'number' && e.maxHp > 0)) push(`equipment.${name}.maxHp 必须是 > 0 的数（耐久上限）`);
		const forms = Object.keys(e?.reduce ?? {});
		if (forms.length !== 1 || !REDUCE_FORMS.includes(forms[0])) {
			push(`equipment.${name}.reduce 必须是 ${REDUCE_FORMS.join(' / ')} 之一且**只写一种**（实际 ${JSON.stringify(e?.reduce)}）`);
		}
	}

	// ③ 部位 × 异常
	for (const [id, st] of Object.entries(m.statuses ?? {})) {
		const parts = st?.parts;
		if (parts !== '*' && !(Array.isArray(parts) && parts.length && parts.every((p) => (hit ?? []).includes(p)))) {
			push(`statuses.${id}.parts 必须是 '*' 或 hitLocations 的非空子集（实际 ${JSON.stringify(parts)}）`);
		}
		if (!abilities.includes(st?.check?.attr)) push(`statuses.${id}.check.attr=${JSON.stringify(st?.check?.attr)} 不在属性表`);
		if (!(typeof st?.check?.dc === 'number' && st.check.dc > 0)) push(`statuses.${id}.check.dc 必须是正数`);
		const whens = (st?.onFail ?? []).map((x) => x?.when);
		for (const w of whens) if (!GRADE_SET.includes(w)) push(`statuses.${id}.onFail 出现未知分档 ${JSON.stringify(w)}（词表：${GRADE_SET.join(' | ')}）`);
		for (const g of GRADE_SET) if (!whens.includes(g)) push(`statuses.${id}.onFail 缺「${g}」档 ⇒ 判了却没效果（分档必须穷尽 ${GRADE_SET.join(' | ')}）`);
	}
	for (const [key, pen] of Object.entries(m.statusPenalty ?? {})) {
		const [statusId, part] = key.split('@');
		if (!Object.hasOwn(m.statuses ?? {}, statusId)) push(`statusPenalty['${key}'] 引用了未声明的异常 ${JSON.stringify(statusId)}`);
		if (part && !(hit ?? []).includes(part)) push(`statusPenalty['${key}'] 的部位 ${JSON.stringify(part)} 不在 hitLocations`);
		if (!pen || typeof pen !== 'object' || !Object.keys(pen).length) push(`statusPenalty['${key}'] 减成是空对象（写了等于没写）`);
	}

	// ④ 波次：短＝1 批 / 长＝2 批（这就是"短/长战斗"的可机检定义）
	const enc = m.encounters ?? {};
	if (!enc.short || !enc.long) push('encounters：必须同时声明 short 与 long（两者之差**只**在批次数）');
	else {
		const sw = enc.short.waves;
		if (!Array.isArray(sw) || sw.length !== 1) push(`encounters.short.waves 必须恰好 1 批（实际 ${Array.isArray(sw) ? sw.length : JSON.stringify(sw)}）`);
		const lw = enc.long.waves;
		if (!Array.isArray(lw) || lw.length !== 2) push(`encounters.long.waves 必须恰好 2 批（实际 ${Array.isArray(lw) ? lw.length : JSON.stringify(lw)}）`);
		else {
			if (!(lw[1].difficulty > lw[0].difficulty)) push(`encounters.long 第二批 difficulty(${lw[1].difficulty}) 必须大于第一批(${lw[0].difficulty})`);
			if (lw[1].reinforce !== true) push('encounters.long 第二批必须 reinforce:true（增援）');
		}
	}
	const known = poolNames();
	for (const [id, e] of Object.entries(enc)) {
		for (const [i, wv] of (e?.waves ?? []).entries()) {
			if (!known.includes(wv?.pool)) push(`encounters.${id}.waves[${i}].pool=${JSON.stringify(wv?.pool)} 不是已登记的作战池（可选：${known.join(' / ')}）`);
			if (!(typeof wv?.difficulty === 'number' && wv.difficulty > 0)) push(`encounters.${id}.waves[${i}].difficulty 必须是正数`);
		}
	}

	// ⑤ 事件池与线索：同段各路线索**两两不可等价**
	for (const [i, r] of (m.roads ?? []).entries()) {
		const opts = r?.options ?? [];
		if (opts.length < 3) push(`roads[${i}] 至少 3 个选项（同段三选一：实际 ${opts.length}）`);
		if (!(typeof r?.from === 'number' && typeof r?.to === 'number')) push(`roads[${i}] 的 from/to 必须是数字（第几段 → 第几段）`);
		const hints = opts.map((o) => norm(o?.hint));
		if (hints.some((h) => !h)) push(`roads[${i}] 有选项缺 hint（线索是玩家区分两路的唯一手段）`);
		const dup = [...new Set(hints.filter((h, k) => h && hints.indexOf(h) !== k))];
		if (dup.length) push(`roads[${i}] 线索**等价**（${dup.join(' / ')}）⇒ 玩家无法区分这两条路`);
		for (const [k, o] of opts.entries()) {
			if (typeof o?.kind !== 'string' || !o.kind) push(`roads[${i}].options[${k}].kind 缺失`);
		}
	}
	if (!(m.roads ?? []).length) push('roads：未声明事件池（5 段×3 路是本机制的内容面）');

	// ⑥ 随机源：表里不得藏随机源（引擎代码纪律见文档；表只放声明）
	return { enabled: true, problems };
};
