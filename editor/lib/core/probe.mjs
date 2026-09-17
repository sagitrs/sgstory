// `#794` 抽取（第 4 条 · `equiv` 弧）：**等价对照的纯助手** ✓ —— 全部与宿主无关
//（`declaredIds(win)` 只是**接收**一个 window 当参数 ✓，不自己造窗、不跑 vm ✓）
// ⇒ 归 `lib/core/**`（浏览器安全：禁 `node:*` ＋ 禁宿主全局 ✓，K6 ③ 在盯 ✓）。
//
// ⚠️ **逐字搬家**（行集法可核 ✓）：本文件这些块的每一行都与 `editor/equiv.mjs` 搬家前**逐字节相同** ✓
// —— 纯助手用"逐字类"判据 ✓；碰窗/vm 的那几个（`runScript`／`snapshot`／`evalSide`）留在壳侧
// 另按"语义转换类"办 ✓（两类口径**分开用** ✗→✓：混用会在其中一类上失效 ✓）。

/** L3 的**档位**：`hard`（默认，差异判红）／`report`（只打印）。
 *  **为什么用命令行而不是内建白名单**：降级必须**显式**写在调用处 ⇒ CI 计划里一眼看得见（K5「让步留痕」）；
 *  内建"某些故事默认放行"等于把让步藏进代码。L3 **永远打印**（可以不是权威，但不能静默消失）。 */
export const L3_MODES = ['hard', 'report'];

/** 纯函数：从数据容器里收集"已声明的 id"，用作实参表（＋一个未知 id ⇒ 顺带验 fail-loud 行为一致）。 */
export const declaredIds = (win) => {
	const G = win.Game ?? {};
	const pick = (o) => Object.keys(o ?? {}).sort();   // **排序**：两侧容器键序可能不同（产物按桶分组发射）⇒ 不排会造**实参错位**的假红
	const list = [
		...pick(G.Checks?.sites), ...pick(G.Combat?.actions), ...pick(G.Combat?.pools),
		...pick(G.Items?.defs), ...pick(G.Gear?.defs), ...pick(G.Economy?.prices),
		...pick(G.Notes?.entries), ...pick(G.Social?.asks?.[0] ?? {}),
	];
	// `#787`：**契约自身内联数据里的键**也要进探针语料 —— 否则"查表成员读一个不存在的根"这类缺陷会**同假**
	//（两边都 `null`／`''` ⇒ 探测不到 ✗；实测：洞窟六个成员读 `window.MECH`（局部常量）时 L1 曾静默通过 ✗）。
	// 取法：把**零参**契约成员求值后深挖键（如 `mechanics()` ⇒ `kindLabels`／`caveRewards`／`chest.gold` 的键）。
	const deepKeys = (v, out = new Set(), depth = 0) => {
		if (depth > 4 || !v || typeof v !== 'object') return out;
		for (const [k, x] of Object.entries(v)) { if (typeof k === 'string' && k.length <= 40) out.add(k); deepKeys(x, out, depth + 1); }
		return out;
	};
	for (const [name, fn] of Object.entries(win.Sg?.story ?? {})) {
		if (typeof fn !== 'function' || fn.length > 0) continue;                 // 只碰零参成员（带参的求值不了）
		try { for (const k of deepKeys(fn())) list.push(k); } catch { /* 成员自身抛错由别的判据报 */ }
	}
	const uniq = [...new Set(list)].filter((s) => s && s !== '__unknown__');
	// **整体排序**：两侧容器键集相同、但**顺序可能不同**（产物按桶分组发射；尾部来自零参成员深挖键 ⇒ `Set` 插入序）
	// ⇒ 不排会出现"同一探针位两侧收到不同实参"的**假红**（实测：`checkSite` 报 42 处，而生成物代码与手写逐字等价 ✗）。
	uniq.sort();
	return { all: uniq, first: uniq[0] ?? 'x' };
};

/** 纯函数：某成员要试的实参表 —— 零参／单参（每个已声明 id）／双参／未知 id（含双未知）。 */
export const probeArgs = (ids) => {
	const sets = [[], ['__unknown__'], ['__unknown__', '__unknown__'], [ids.first, ids.first]];
	for (const id of ids.all) sets.push([id]);
	return sets;
};

/** 纯函数：调用一次，记录结果（异常也记 ⇒ 两版行为不同也能看出来）。 */
export const call = (fn, args) => {
	try { return { ok: JSON.stringify(fn(...args)) }; } catch (e) { return { threw: String(e && e.message).slice(0, 80) }; }
};

/** 纯函数：**逐成员**比契约行为，返回人可读差异（"两版行为不同"这种话不许出现——要说清哪个成员、哪组实参）。 */
export const diffContract = (h, g, limit = 3) => {
	const out = [];
	for (const k of Object.keys(h)) {
		if (!(k in g)) { out.push(`成员 \`${k}\`：生成版**没有**该成员`); continue; }
		for (let i = 0; i < h[k].length; i++) {
			const a = JSON.stringify(h[k][i][0]), x = h[k][i][1], y = g[k][i]?.[1];
			if (JSON.stringify(x) === JSON.stringify(y)) continue;
			const show = (r) => (r && 'threw' in r ? `抛错「${r.threw}」` : String(r?.ok)).slice(0, 60);
			out.push(`成员 \`${k}\` 实参 ${a}：手写 ${show(x)} / 生成 ${show(y)}`);
		}
	}
	for (const k of Object.keys(g)) if (!(k in h)) out.push(`成员 \`${k}\`：手写版**没有**该成员`);
	return { n: out.length, text: out.slice(0, limit).join('\n    ') + (out.length > limit ? `\n    …共 ${out.length} 处` : '') };
};

/** 纯函数：数据容器里的**叶子数**与**是否混进函数值**（数据面必须是数据）。 */
export const walk = (v, acc = { leaves: 0, functions: 0 }) => {
	if (typeof v === 'function') { acc.functions++; return acc; }
	if (v && typeof v === 'object') { for (const x of Object.values(v)) walk(x, acc); return acc; }
	acc.leaves++;
	return acc;
};

// `#794` `equiv` 弧第 2 票：`snapshot(win)` 是**纯**的（只**接收** window ✓，不造窗、不跑 vm ✓）
// ⇒ 与 `declaredIds(win)` 同类 ✓ 归 core ✓（**逐字**搬 ✓）。
/** 纯函数：由 `window` 取出可比较的面（数据容器 ＋ 契约的**多实参行为**）。 */
export const snapshot = (win) => {
	const ids = declaredIds(win);
	let probes = 0;
	const contract = {};
	for (const [k, fn] of Object.entries(win.Sg?.story ?? {})) {
		const rows = probeArgs(ids).map((args) => { probes++; return [args, call(fn, args)]; });
		contract[k] = rows;
	}
	// 容器比较用**规范化 JSON**（对象键**排序**、数组保序）：键序不是数据，而产物是按**桶分组**发射的 ⇒
	// 直接 `JSON.stringify` 会因键序差异**假红**（同族于下面契约那条"判行为不判顺序"的教训）。数组顺序仍然判（那可能是语义）。
	const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
	return { game: JSON.stringify(canon(win.Game ?? null)), contract, ids, probes, walk: walk(win.Game ?? {}) };
};
