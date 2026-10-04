/* RPG 核心 —— 层梯度与加权随机表（遭遇 / 掉落）原语（#1761 · 巴别 B2）
 *
 * 本文件把「层 → 该层的随机表」这条链路收成三面：
 *   ① **层元数据读取面**：`climb` / `hub` / `exit` 的判别与梯度筛选。层数据由内容侧经
 *      `RPG.registerLayerMeta`（注册面见 `40-battle.js`）登记，本文件**只读**。
 *   ② **单一加权抽样入口** `RPG.pickWeighted`：全仓唯一的加权随机实现。
 *   ③ **遭遇 / 掉落抽取** `RPG.rollEncounter` / `RPG.rollLoot`：按下列条目契约消费。
 *
 * ## 条目契约（领队钉于 `#1748` 票面；改形须先回该票修订契约，单向）
 *   层：   `{ id, type: 'climb' | 'hub' | 'exit', start?: true }`
 *   条目： `{ encounters: [{ ref, weight, elite? }], loot: [{ id, weight, qty? }] }`
 *   约束： 表内一律引**已注册 id**（不内嵌数值）；抽样一律经 `RPG.rng`（`#1710` 的唯一随机入口）。
 *
 * ## 随机性纪律（可判，且有用例钉住）
 *   每一次抽样**恰好消耗 1 次** `RPG.rng.unit()`——单组遭遇 1 次、单笔掉落的件数区间亦 1 次。
 *   该性质使「注入定长序列 ⇒ 逐次可断言」成立，并使「多消耗一次」这类缺陷当场可见。
 *
 * ## 层梯度的机械含义（第 50 层「不入梯度」的落点）
 *   入梯度 ⟺ `type === 'climb'`。`hub`（大空洞·整备区）与 `exit`（顶层出口）**不入梯度**：
 *   它们既不被 `RPG.gradientLayers()` 收录，也不参与遭遇 / 掉落抽取 ⇒ 「终局层不随梯度定标」
 *   由本函数族**结构性地**成立，而非靠内容侧自觉不写条目。
 *
 * ## 设计文档
 *   `docs/plan/1761-encounter-tables.md`（判定面语义与层梯度的规范句）。权重与定标为
 *   **house rule（非 SRD）**——SRD 不规定层间遭遇的权重分布与件数区间。
 */

/* ---------- 错误工厂：固定 `code`（用例断言 err.code，不断言给人看的整句） ---------- */

RPG.encounterError = (code, message, extra) => Object.assign(new Error(message), { code }, extra);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPos = (v) => isNum(v) && v > 0;
const isNonNeg = (v) => isNum(v) && v >= 0;

/* ---------- 层元数据读取面 ---------- */

/**
 * 按层 id 取层元数据；**并**附上它所属的层表 id（`group`）——表 id 是层表与遭遇表配对的键。
 * @returns {{id,type,start?,group}|null} 未注册的层 id ⇒ null
 */
RPG.layerOf = (layerId) => {
	for (const group of Object.keys(RPG.layerMeta ?? {})) {
		const hit = (RPG.layerMeta[group] ?? []).find((l) => l && l.id === layerId);
		if (hit) return { ...hit, group };
	}
	return null;
};

/** 层类型（`'climb'` | `'hub'` | `'exit'`）；未注册 ⇒ null */
RPG.layerType = (layerId) => RPG.layerOf(layerId)?.type ?? null;

/** 全部已注册层里取指定类型者（注册顺序，跨表拼接） */
RPG.layersOfType = (type) => {
	const out = [];
	for (const group of Object.keys(RPG.layerMeta ?? {})) {
		for (const l of RPG.layerMeta[group] ?? []) {
			if (l && l.type === type) out.push({ ...l, group });
		}
	}
	return out;
};

/** **梯度层** = 全部 `climb` 层。遭遇 / 掉落的抽取面只在此集合内（`hub` / `exit` 不入）。 */
RPG.gradientLayers = () => RPG.layersOfType('climb');

/** 该层是否入梯度（等价于 `layerType(id) === 'climb'`；未注册 ⇒ false） */
RPG.inGradient = (layerId) => RPG.layerType(layerId) === 'climb';

/**
 * **地点 → 层**（WorldMap 集成面）：先按地点 id 精确命中层 id（爬升层的常见形：地点即层），
 * 否则取**最长前缀**命中的层 id（整备区的形如 `L10-camp` ⇒ 层 `L10`）。
 * @returns {{id,type,start?,group,locationId}|null} 判不出 ⇒ null（无层语义的地图不受影响）
 */
RPG.layerOfLocation = (locationId) => {
	if (typeof locationId !== 'string' || locationId === '') return null;
	const exact = RPG.layerOf(locationId);
	if (exact) return { ...exact, locationId };
	let best = null;
	for (const group of Object.keys(RPG.layerMeta ?? {})) {
		for (const l of RPG.layerMeta[group] ?? []) {
			if (!l || typeof l.id !== 'string' || l.id === '') continue;
			if (locationId.startsWith(l.id) && (best === null || l.id.length > best.id.length)) {
				best = { ...l, group };
			}
		}
	}
	return best ? { ...best, locationId } : null;
};

/* WorldMap 集成：地图上「当前所在地点属于哪一层」由地图自己回答（调用方不必知道层表）。
 * 本文件排在 `60-map.js` 之后（数字前缀序）⇒ 此处可安全给原型补方法。 */
if (RPG.WorldMap) {
	RPG.WorldMap.prototype.layerOf = function layerOf(locId) {
		return RPG.layerOfLocation(locId ?? this.current);
	};
	RPG.WorldMap.prototype.layerType = function layerType(locId) {
		return this.layerOf(locId)?.type ?? null;
	};
}

/* ---------- 遭遇表注册面 ---------- */

/** 已注册的遭遇表：层表 id → 表（与 `RPG.layerMeta` 的键**同 id 配对**，防两套命名） */
RPG.encounterTables = Object.create(null);

/**
 * 校验一张遭遇表的**结构**（不查引用是否已注册——内容侧加载序上，层表常先于怪物/道具定义）。
 * @returns {string[]} 问题列表（空数组 = 结构合法）
 */
RPG.validateEncounterTable = (table) => {
	const problems = [];
	if (table == null || typeof table !== 'object' || Array.isArray(table)) {
		return ['遭遇表须是对象（按层 id 键控）'];
	}
	for (const [layerId, row] of Object.entries(table)) {
		const at = `层「${layerId}」`;
		if (row == null || typeof row !== 'object' || Array.isArray(row)) { problems.push(`${at} 的条目须是对象`); continue; }
		const enc = row.encounters, loot = row.loot ?? [];
		if (!Array.isArray(enc)) problems.push(`${at} 的 encounters 须是数组`);
		if (!Array.isArray(loot)) problems.push(`${at} 的 loot 须是数组`);
		let encWeight = 0, lootWeight = 0;
		for (const e of Array.isArray(enc) ? enc : []) {
			if (e == null || typeof e !== 'object') { problems.push(`${at} 的 encounters 含非对象元素`); continue; }
			if (typeof e.ref !== 'string' || e.ref === '') problems.push(`${at} 的条目缺 ref（须是注册 id 串）`);
			if (!isNonNeg(e.weight)) problems.push(`${at} 的「${e.ref}」weight 须是非负数`);
			if (e.elite !== undefined && typeof e.elite !== 'boolean') problems.push(`${at} 的「${e.ref}」elite 须是布尔`);
			if (isNonNeg(e.weight)) encWeight += e.weight;
		}
		for (const l of Array.isArray(loot) ? loot : []) {
			if (l == null || typeof l !== 'object') { problems.push(`${at} 的 loot 含非对象元素`); continue; }
			if (typeof l.id !== 'string' || l.id === '') problems.push(`${at} 的掉落缺 id（须是注册 id 串）`);
			if (!isNonNeg(l.weight)) problems.push(`${at} 的掉落「${l.id}」weight 须是非负数`);
			if (isNonNeg(l.weight)) lootWeight += l.weight;
			if (l.qty !== undefined) {
				const q = l.qty;
				const okQty = Array.isArray(q) && q.length === 2 && Number.isInteger(q[0]) && Number.isInteger(q[1]) && q[0] >= 0 && q[0] <= q[1];
				if (!okQty) problems.push(`${at} 的掉落「${l.id}」qty 须是 [min,max] 两个非负整数且 min ≤ max`);
			}
		}
		/* 声明了条目却全零权重 ⇒ 抽不出来（静默永远抽不到 = 假支持），故判结构错 */
		if (Array.isArray(enc) && enc.length > 0 && !(encWeight > 0)) problems.push(`${at} 的 encounters 权重和为 0（抽不出来）`);
		if (Array.isArray(loot) && loot.length > 0 && !(lootWeight > 0)) problems.push(`${at} 的 loot 权重和为 0（抽不出来）`);
	}
	return problems;
};

/**
 * 注册一张遭遇表（与同 id 的层表配对）。**结构错即抛**（数据错应当场响，✗ 静默降级）。
 * 引用是否已注册**不在此刻校验**：层表常先于怪物/道具定义加载（数字前缀序），故引用面由
 * `RPG.rollEncounter` 在抽取时判（未知 ref 抛 `ENCOUNTER_UNKNOWN_REF`）。
 */
RPG.registerEncounterTable = (tableId, table) => {
	if (typeof tableId !== 'string' || tableId === '') {
		throw RPG.encounterError('ENCOUNTER_BAD_ID', 'registerEncounterTable 需要非空字符串 id');
	}
	const problems = RPG.validateEncounterTable(table);
	if (problems.length > 0) {
		throw RPG.encounterError('ENCOUNTER_BAD_TABLE',
			`遭遇表「${tableId}」结构不合法：\n  - ${problems.join('\n  - ')}`, { problems });
	}
	/* ★重复注册**告警**（不抛）—— `#1816` MAJOR-1：原为**纯静默**覆盖，与既有形对齐。 */
	if (Object.prototype.hasOwnProperty.call(RPG.encounterTables, tableId)) {
		RPG.regWarn.报('遭遇表', `${tableId}`, `将被覆盖`);
	}
	RPG.encounterTables[tableId] = table;
	return table;
};

/**
 * 引用面校验：表内每个 `ref` 须在角色注册表、每个掉落 `id` 须在道具注册表。
 * 供用例 / 门调用（**不是**注册时校验——见上）。
 * @returns {string[]} 未注册的引用（空数组 = 全部已注册）
 */
RPG.validateEncounterRefs = (table) => {
	const missing = [];
	for (const [layerId, row] of Object.entries(table ?? {})) {
		for (const e of row?.encounters ?? []) {
			if (e?.ref && !(RPG.characters?.has?.(e.ref))) missing.push(`层「${layerId}」的敌人「${e.ref}」未注册`);
		}
		for (const l of row?.loot ?? []) {
			if (l?.id && !(RPG.items?.has?.(l.id))) missing.push(`层「${layerId}」的掉落「${l.id}」未注册`);
		}
	}
	return missing;
};

/* ---------- 加权抽样：全仓唯一实现 ---------- */

/**
 * **单次加权抽样**：返回命中的条目本身。
 * 语义（设计文档 §二 的规范句）：
 *   · 权重是**相对值**（同调用内归一），非负；总权重须 > 0。
 *   · **恰好消耗 1 次** `RPG.rng.unit()`；命中判据是累积权重越过 `u × 总权重`。
 *   · 权重为 0 的条目**永不命中**（用于「登记但不投放」）。
 *   · 空表 / 权重非法 / 全零权重 ⇒ 抛错（`err.code`）。
 */
RPG.pickWeighted = (entries, { label = '加权抽样' } = {}) => {
	if (!Array.isArray(entries) || entries.length === 0) {
		throw RPG.encounterError('ENCOUNTER_EMPTY', `${label}：候选表为空（无条目可抽）`);
	}
	let total = 0;
	for (const e of entries) {
		if (e == null || typeof e !== 'object') {
			throw RPG.encounterError('ENCOUNTER_BAD_ENTRY', `${label}：候选表含非对象元素`);
		}
		if (!isNonNeg(e.weight)) {
			throw RPG.encounterError('ENCOUNTER_BAD_WEIGHT', `${label}：条目的 weight 须是非负数（收到 ${e.weight}）`);
		}
		total += e.weight;
	}
	if (!(total > 0)) {
		throw RPG.encounterError('ENCOUNTER_ZERO_WEIGHT', `${label}：候选表权重和为 0（抽不出来）`);
	}
	const u = RPG.rng.unit();            // ★ 全函数**唯一**一次随机读数（纪律：恰好 1 次）
	const target = u * total;
	let acc = 0;
	for (const e of entries) {
		acc += e.weight;
		if (target < acc) return e;
	}
	/* 浮点尾差兜底：`u < 1` 时 `target < total` 必然成立，故仅在累加出现舍入误差时到达 */
	return entries[entries.length - 1];
};

/* ---------- 遭遇 / 掉落抽取 ---------- */

/** 取该层所在组的遭遇表；未注册 ⇒ null */
RPG.encounterTableOf = (layerId, tableId) => {
	if (tableId != null) return RPG.encounterTables[tableId] ?? null;
	const meta = RPG.layerOf(layerId);
	return meta ? (RPG.encounterTables[meta.group] ?? null) : null;
};

/**
 * **抽遭遇**：按层 id 的条目表抽 `count` 组（默认 1 组），每条经 `RPG.pickWeighted`。
 *   · 层未注册 ⇒ 抛 `ENCOUNTER_UNKNOWN_LAYER`（层 id 打错是数据错，不当成「无遭遇」）。
 *   · 层**不入梯度**（`hub` / `exit`）⇒ 返回 `[]`——这是**结构性**的：整备区与终局层不抽遭遇。
 *   · 入梯度但该层无条目行（或条目为空）⇒ 返回 `[]`（该层定为此局无遭遇，属内容选择）。
 *   · `count` 须是正整数（每次抽取独立、可重复同一条目）。
 * @returns {Array<{ref:string, elite:boolean, layer:string}>}
 */
RPG.rollEncounter = (layerId, { count = 1, tableId } = {}) => {
	if (!Number.isInteger(count) || count <= 0) {
		throw RPG.encounterError('ENCOUNTER_BAD_COUNT', `rollEncounter 的 count 须是正整数（收到 ${count}）`);
	}
	const meta = RPG.layerOf(layerId);
	if (!meta) throw RPG.encounterError('ENCOUNTER_UNKNOWN_LAYER', `未注册的层 id「${layerId}」`);
	if (meta.type !== 'climb') return [];      // hub / exit 不入梯度（结构性地不抽）
	const row = RPG.encounterTableOf(layerId, tableId)?.[layerId];
	const pool = Array.isArray(row?.encounters) ? row.encounters : [];
	if (pool.length === 0) return [];
	const out = [];
	for (let i = 0; i < count; i++) {
		const hit = RPG.pickWeighted(pool, { label: `层「${layerId}」遭遇` });
		if (!RPG.characters?.has?.(hit.ref)) {
			throw RPG.encounterError('ENCOUNTER_UNKNOWN_REF',
				`层「${layerId}」的敌人「${hit.ref}」未注册（表内须引注册 id）`);
		}
		/* ★`sgstory#1934`（doc-3 §2.8）：**回合上限**随条目带出 —— 声明位＝**层表行**
		 *   `row.roundLimit`（与 `encounters`／`loot` 同一行），**条目可覆写** `hit.roundLimit`；
		 *   都没有 ⇒ 缺省 **8**（§2.8 原文：「当前 `fight()` 固定创建 8 回合战斗」）。
		 *   ⚠ 值必须是正整数（`Battle(turn,…)` 的既有校验同一口径）。 */
		const 限 = hit.roundLimit ?? row.roundLimit ?? 8;
		out.push({ ref: hit.ref, elite: hit.elite === true, layer: layerId, roundLimit: 限 });
	}
	return out;
};

/**
 * **抽掉落**：按层 id 的掉落表抽 `count` 笔（默认 1 笔）。件数取自 `qty:[min,max]`（闭区间整数，
 * 省略即 1 件）；件数区间同样**恰好消耗 1 次** `RPG.rng.unit()`。
 * 层门槛与返回空的条件同 `rollEncounter`。
 * @returns {Array<{id:string, n:number, layer:string}>}
 */
RPG.rollLoot = (layerId, { count = 1, tableId } = {}) => {
	if (!Number.isInteger(count) || count <= 0) {
		throw RPG.encounterError('ENCOUNTER_BAD_COUNT', `rollLoot 的 count 须是正整数（收到 ${count}）`);
	}
	const meta = RPG.layerOf(layerId);
	if (!meta) throw RPG.encounterError('ENCOUNTER_UNKNOWN_LAYER', `未注册的层 id「${layerId}」`);
	if (meta.type !== 'climb') return [];
	const row = RPG.encounterTableOf(layerId, tableId)?.[layerId];
	const pool = Array.isArray(row?.loot) ? row.loot : [];
	if (pool.length === 0) return [];
	const out = [];
	for (let i = 0; i < count; i++) {
		const hit = RPG.pickWeighted(pool, { label: `层「${layerId}」掉落` });
		if (!RPG.items?.has?.(hit.id)) {
			throw RPG.encounterError('ENCOUNTER_UNKNOWN_REF',
				`层「${layerId}」的掉落「${hit.id}」未注册（表内须引注册 id）`);
		}
		const qty = hit.qty;
		const n = Array.isArray(qty)
			? qty[0] + Math.floor(RPG.rng.unit() * (qty[1] - qty[0] + 1))   // ★ 件数：再一次、也是唯一一次读数
			: 1;
		out.push({ id: hit.id, n, layer: layerId });
	}
	return out;
};

