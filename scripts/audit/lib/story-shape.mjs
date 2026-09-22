// 故事「新机制声明表」的**形状校验**（`#459` 剩余：形状落码 · 伞 `#441`／`#482`）
//
// 为什么是它、为什么在这：`#486` 的出口判据要「声明表**由表驱动、可被门读取**」，而 `#482` 又写着
//「先立引擎侧的新机制契约，再写故事内容」—— 形状必须先能被**机器读**，否则等于没有契约。
// 这里只做**静态形状校验**（gate-time）；引擎运行时的两条义务在 `docs/engine-story-boundary.md`：
// ① provider 结构缺失 → **报错**（不许静默 0/空）；② 故事未声明新机制 → **走旧路径**（显式降级，见 `#492`）。
//
//「形状即判据」六条（`#459`）→ 本文件逐条实现：
// ① 保护关系：`slots[*].protects` ∈ `hitLocations` ∪ {null}（否则"有装备的槽位永远打不到"→ 装备无效）
// ② 耐久：`maxHp > 0`；`reduce` 形态必须是**声明过的一种**且只写一种
// ③ 异常：`parts` ⊆ `hitLocations`（或 `'*'`）；`check.attr` 在属性表里；`onFail` 的 `when` 分档**穷尽**
// ④ 波次：`short.waves` 恰 1 批；`long.waves` 恰 2 批且第二批 `difficulty` 更大、`reinforce:true`
// ⑤ 线索：同段各路 `hint` **两两不可等价**（等价 → 玩家无法区分两条路）
// ⑥ 随机源：不在本表里（是引擎代码纪律）——见文档；本校验器只保证"表里没有藏着随机源"。

/** 失败分档词表：**引擎口径的唯一权威**（改这里就是改口径，改完要跑 `test/story-shape.mjs`）。 */
export const GRADE_SET = ['most', 'low'];
/** 减成（`reduce`）允许的形态。故事声明"哪一种"，引擎按声明取值 → 这里就是**枚举权威**。
 *注意：**声明面不得大于实现面**（`#486` 切片②）：本表只列**引擎真的实现了**的形态 —— 引擎侧
 * `Game.Combat.slotAbsorb` 目前只落 `flat`（其余形态**大声报错**，不许静默 0 减成）。
 * 将来要实现 `dice`／`percent`：**同一 PR 里**同时改这里 ＋ 引擎实现 ＋ 门的 `violations` 口径（三处同源）。 */
export const REDUCE_FORMS = ['flat'];

/** 六类事件（已定 ①：每步从这六类里随机三选一）——**词表就是引擎/内容面的口径**。 */
export const KIND_SET = ['shortFight', 'longFight', 'chest', 'cave', 'trap', 'traveller'];

/** 判据 3（前半）：该段是否有「无判定选项」（如"径直通过宝箱"）。 */
export const roadNoCheck = (road) => (road?.options ?? []).some((o) => o?.noCheck === true);

/** 判据 3（后半）：**死档检查**——每个 `to` 要么是终点（最大的 `to`），要么是另一段的 `from`。 */
export const roadDeadEnds = (roads) => {
	const list = (roads ?? []).filter(Boolean);
	if (!list.length) return [];
	const froms = new Set(list.map((r) => r.from));
	const terminal = Math.max(...list.map((r) => r.to ?? 0));
	return list.filter((r) => r.to !== terminal && !froms.has(r.to)).map((r) => ({ from: r.from, to: r.to }));
};

/** 判据 2：同段三路线索**两两可区分**（归一化后比较）——返回重复的线索文本。 */
export const roadHintCollisions = (road) => {
	const norm = (s) => String(s ?? '').replace(/\s+/g, '').trim();
	const seen = new Set();
	const dup = [];
	for (const o of road?.options ?? []) {
		const h = norm(o?.hint);
		if (seen.has(h)) dup.push(h);
		else seen.add(h);
	}
	return dup;
};

/** 归一化（判"两两不可等价"时用）：去空白 ——「碎石间有拖行的痕迹」与同文多空格视为等价。 */
const norm = (s) => String(s ?? '').replace(/\s+/g, '').trim();

/**
 * 校验故事的新机制声明表。
 * @param {object|null|undefined} m `Sg.story.mechanics()` 的返回（`null` ＝ 未启用新机制）
 * @param {{poolNames?: () => string[], abilities?: string[]}} ctx
 * `poolNames`：该故事已登记的作战池名（引擎侧经 `Sg.story.combatPool` 判定）；
 * `abilities`：属性表键（`Game.Rules.ABILITIES` 的键）。
 * @returns {{enabled: boolean, problems: string[]}}
 * `enabled:false` → 故事声明"未启用" → **不是错误**（引擎走旧路径）。
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
		// ── #487（S2）补：**持续回合与被动效果**必须可声明，且**只认引擎实现了的形态** ──
		// 为什么是"必填"：`statusTick` 要按它递减/清除；缺了它判据无法落地（引擎会当场报错）。
		if (!(typeof st?.turns === 'number' && st.turns > 0)) push(`statuses.${id}.turns 必须是正数（持续回合：statusTick 按它递减并清除）`);
		if (st?.perRound !== undefined) {
			const keys = Object.keys(st.perRound ?? {});
			if (!keys.length) push(`statuses.${id}.perRound 是空对象（写了等于没写）`);
			for (const k of keys) if (k !== 'hp' && k !== 'penalty') push(`statuses.${id}.perRound.${k} 本片未实现（只认 hp:number 与 penalty，#487／#747）`);
			if (st.perRound?.hp !== undefined && typeof st.perRound.hp !== 'number') push(`statuses.${id}.perRound.hp 必须是数字`);
			// `#747`：`perRound.penalty = { value:number, scope:'part', only?:部位[]}` ——
			// **减成住声明**（对允许部位生成），`only` 是"有意只押这几格"的显式声明。
			if (st.perRound?.penalty !== undefined) {
				const pen = st.perRound.penalty ?? {};
				if (typeof pen.value !== 'number') push(`statuses.${id}.perRound.penalty.value 必须是数字（拿到 ${JSON.stringify(pen.value)}，#747）`);
				if (pen.scope !== 'part') push(`statuses.${id}.perRound.penalty.scope 本片只实现 'part'（拿到 ${JSON.stringify(pen.scope)}，#747）`);
				const allowed = st.parts === '*' ? (m.hitLocations ?? []) : (st.parts ?? []);   // 注意：本函数的参数名是 `m`（不是 `mech`）
				if (pen.only !== undefined) {
					if (!Array.isArray(pen.only) || !pen.only.length) push(`statuses.${id}.perRound.penalty.only 必须是非空数组（#747）`);
					else for (const p2 of pen.only) if (!allowed.includes(p2)) push(`statuses.${id}.perRound.penalty.only 里的「${p2}」不在允许部位（${allowed.join('、')}）内（#747）`);
				}
			}
		}
		// `onFail` 的**效果形态**：只认引擎实现的两种（`harm:'damage'`＋`dice` ／ `addStatus:'random'`＋`part`）
		for (const [k, e] of (st?.onFail ?? []).entries()) {
			const harmOk = e?.harm === 'damage' && (typeof e?.dice === 'string' || typeof e?.dice === 'number');
			// `addStatus` 必须给 `part`（`'random'` 或合法部位）——否则引擎不知道该往哪落
			const addOk = e?.addStatus === 'random' && (e?.part === 'random' || (hit ?? []).includes(e?.part));
			if (harmOk || addOk) continue;
			push(`statuses.${id}.onFail[${k}] 效果形态未实现（只认 harm:'damage'+dice ／ addStatus:'random'，#487）`);
		}
		// 骰式的**可解析性**：引擎认 `N`／`NdM`／`NdM±K`（`#702` 5e 对齐：伤害骰＋属性调整）
		for (const [k, e] of (st?.onFail ?? []).entries()) {
			if (e?.harm === 'damage' && e?.dice !== undefined && !/^\d+(d\d+)?([+-]\d+)?$/.test(String(e.dice))) {
				push(`statuses.${id}.onFail[${k}].dice=${JSON.stringify(e.dice)} 无法解析（引擎认 \`N\`／\`NdM\`／\`NdM±K\`）`);
			}
		}
	}
	for (const [key, pen] of Object.entries(m.statusPenalty ?? {})) {
		const [statusId, part] = key.split('@');
		if (!Object.hasOwn(m.statuses ?? {}, statusId)) push(`statusPenalty['${key}'] 引用了未声明的异常 ${JSON.stringify(statusId)}`);
		if (part && !(hit ?? []).includes(part)) push(`statusPenalty['${key}'] 的部位 ${JSON.stringify(part)} 不在 hitLocations`);
		if (!pen || typeof pen !== 'object' || !Object.keys(pen).length) push(`statusPenalty['${key}'] 减成是空对象（写了等于没写）`);
		// #487：本片只实现了 `check:number`（该部位判定减成）——别的键会让引擎当场报错 → 在形状门先拦
		for (const [k, v] of Object.entries(pen ?? {})) {
			if (k !== 'check') push(`statusPenalty['${key}'].${k} 本片未实现（只认 check:number，#487）`);
			else if (typeof v !== 'number') push(`statusPenalty['${key}'].check 必须是数字`);
		}
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
	// #488（S3）：`rewardsScale` 可选，但给了必须是正数（奖励曲线要用它乘；负数/0 → 奖励不随难度增）
	for (const [id, e] of Object.entries(enc)) {
		if (e?.rewardsScale !== undefined && !(typeof e.rewardsScale === 'number' && e.rewardsScale > 0)) push(`encounters.${id}.rewardsScale 必须是正数（实际 ${JSON.stringify(e.rewardsScale)}）`);
	}
	const known = poolNames();
	for (const [id, e] of Object.entries(enc)) {
		for (const [i, wv] of (e?.waves ?? []).entries()) {
			if (!known.includes(wv?.pool)) push(`encounters.${id}.waves[${i}].pool=${JSON.stringify(wv?.pool)} 不是已登记的作战池（可选：${known.join(' / ')}）`);
			if (!(typeof wv?.difficulty === 'number' && wv.difficulty > 0)) push(`encounters.${id}.waves[${i}].difficulty 必须是正数`);
		}
	}

	// ⑥ 敌人属性面（`#705`）：**有战斗就必须有敌人属性**——没有属性（HP/AC/攻击/落点），
	// 部位/耐久/异常三套机制永远没机会被触发（症状：「无法测试到上述问题」）。
	const enemies = m.enemies ?? {};
	if (Object.keys(enc).length && !Object.keys(enemies).length) {
		push('enemies：声明了 `encounters`（有战斗）却没有 `enemies` —— 敌人必须有 HP／AC／攻击（#705）');
	}
	for (const [id, e] of Object.entries(enemies)) {
		if (!e || typeof e !== 'object') { push(`enemies.${id} 必须是对象`); continue; }
		if (typeof e.name !== 'string' || !e.name.trim()) push(`enemies.${id}.name 必须是非空字符串`);
		if (!(Number.isInteger(e.hp) && e.hp > 0)) push(`enemies.${id}.hp 必须是正整数（实际 ${JSON.stringify(e.hp)}）`);
		if (!(Number.isInteger(e.ac) && e.ac >= 1)) push(`enemies.${id}.ac 必须是正整数（实际 ${JSON.stringify(e.ac)}）`);
		const atk = e.attack ?? {};
		// `#702`（5e 对齐）：敌人**掷攻击骰** vs 玩家 AC → `attack.bonus` 必填；`attack.site` 退为**可选**（旧对抗模型用，保留兼容）
		if (!(Number.isInteger(atk.bonus) && atk.bonus >= 0)) push(`enemies.${id}.attack.bonus 必须是 >=0 的整数（5e：攻击骰 = d20 + bonus vs 玩家 AC；实际 ${JSON.stringify(atk.bonus)}）`);
		if (atk.site !== undefined && (typeof atk.site !== 'string' || !atk.site.trim())) push(`enemies.${id}.attack.site 若声明必须是非空字符串（可选：旧对抗模型的位点）`);
		if (typeof atk.dmg !== 'string' || !/^\d+(d\d+)?([+-]\d+)?$/.test(atk.dmg)) {
			push(`enemies.${id}.attack.dmg=${JSON.stringify(atk.dmg)} 必须是骰式（N／NdM／NdM+K）——固定数字＝不可测（#705／#702 方向 3）`);
		}
		for (const part of (atk.parts ?? [])) if (!(hit ?? []).includes(part)) push(`enemies.${id}.attack.parts 的 ${JSON.stringify(part)} 不在 hitLocations（打在哪儿必须可声明）`);
	}
	for (const [id, e] of Object.entries(enc)) {
		for (const [i, wv] of (e?.waves ?? []).entries()) {
			const refs = wv?.enemies;
			if (refs === undefined) continue;
			if (!Array.isArray(refs) || !refs.length) push(`encounters.${id}.waves[${i}].enemies 必须是**非空数组**（写了就该真有敌人）`);
			else for (const nm of refs) if (!Object.hasOwn(enemies, nm)) push(`encounters.${id}.waves[${i}].enemies 引用了**未声明**的敌人 ${JSON.stringify(nm)}`);
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
			// #489（S4）：`kind` 必须是六类事件词表之一（已定 ①）——否则"每步从六类里三选一"无从机检
			else if (!KIND_SET.includes(o.kind)) push(`roads[${i}].options[${k}].kind=${JSON.stringify(o.kind)} 不在事件词表里（${KIND_SET.join(' / ')}）`);
			if (o?.noCheck !== undefined && typeof o.noCheck !== 'boolean') push(`roads[${i}].options[${k}].noCheck 必须是布尔（#489）`);
		}
		// 判据 3 前半：每段至少要有一个「无判定选项」（如"径直通过宝箱"）——否则玩家只能赌
		if (!roadNoCheck(r)) push(`roads[${i}] 没有任何 \`noCheck:true\` 的选项 ⇒ 这一段没有"不掷骰也能走"的路（#489 判据 3）`);
	}
	if (!(m.roads ?? []).length) push('roads：未声明事件池（5 段×3 路是本机制的内容面）');
	// #489 判据 3（后半）：**不死档** —— 每个 `to` 要么是终点，要么是另一段的 `from`（纯函数，与门同源）
	for (const d of roadDeadEnds(m.roads)) push(`roads：从第 ${d.from} 段走到第 ${d.to} 段是**死档**（既不是终点，也没有从它出发的路）`);

	// ⑥ 随机源：表里不得藏随机源（引擎代码纪律见文档；表只放声明）
	return { enabled: true, problems };
};
