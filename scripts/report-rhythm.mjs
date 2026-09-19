// #295 探索票（报告型）：E4 节奏密度 ＋ C4 路线相异度
//
// 数据源：build/route-traces.json（`test/scenarios.mjs` 跑**全部路线**时顺带落盘的轨迹；条数随路线增减，别在注释里写死）。
// 之所以不塞进 scripts/audit.mjs：那是（#247 的 D8/I1 批次）正在改的活跃文件，
// 本脚本刻意独立成新文件，避免双写；也刻意只做「只读报告＋基线 ratchet」，
// 不做 CI 硬红（探索票口径：先入基线，数字稳定后再谈阈值）。
//
// 用法：
//   node scripts/report-rhythm.mjs                    # 人读报告
//   node scripts/report-rhythm.mjs --json             # 机读
//   node scripts/report-rhythm.mjs --check            # 与基线比对，超标 process.exit(1)
//   node scripts/report-rhythm.mjs --update-baseline  # 把当前数字写进基线
//   node scripts/report-rhythm.mjs --selftest         # 反例自证（R1 路线趋同 / R2 五拍缺拍）必须变红
//   node scripts/report-rhythm.mjs --input <file>     # 换输入（自证与调试用）
//
// 判据来源：
//   E4 —— 五拍＝Five Room Dungeon 的经典五段（入口与门槛／谜题或交涉／诡计或挫折／高潮／奖励与揭示）；
//         开局 → 首个不可逆点（花田致死位点 / 龙战）的交互数与当时情报覆盖，ratchet 防退化。
//   C4 —— OPDC「支持多系统」的 twine 等价：不同路线的屏文重叠率（防未来加内容时路线趋同）。

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const TRACES = 'build/route-traces.json';
const BASELINE = 'scripts/rhythm-baseline.json';
const CHAR_N = 5;          // 中文按字符 n-gram（无词边界），5-gram 是中文相似度的常用档
// #338：**文档频率过滤**——被多数路线共享的 5-gram 是「共享主线 + 框架文本」（结果槽、雾递进提示…），
// 它们会让「同一条主线、只有结局不同」的两条路线看起来 90% 相似（实测把 16 族压到 14 族）。
// 只保留 df/total ≤ COMMON_DF 的 5-gram：剩下的才是「这条路线区别于别人的内容」。
const COMMON_DF = 0.5;
// #338 修正：阈值是**声明式绝对不变量**，不是「上次观测值」。
// 教训：我最初把本地观测（clusters=18 等）签进基线做**等值判定**，于是 CI 与本地轨迹的细微差异
// 就会把门判红（实测：CI 上「正例」直接失败）。这类门必须对**不变量**ratchet——
//   · 家族数有**下限**（大规模趋同才会跌破）；
//   · 跨家族相似度有**上限**（成对趋同才会越线）；
//   · 五拍/里程碑是**结构带**（拍子被删/不可逆点被推得极远或极近才会出带）。
// 基线文件保留观测值，只用于**漂移可见**（报告里对照），不参与判定。
export const THRESHOLDS = {
	// ═══ `#1004` B2b（**换样本** ⇒ 阈值**重推**，不是调参 ✗ —— 发起者裁定 5740615725 第 2 条）═══
	// 为什么重推 ✗：下面三条都是**样本派生**阈值 ✓（本文件自己写着「按现有 18 条路线定的」✓）——
	//   旧样本（两个内容故事）被**代码级删除** ✓ ⇒ 路线表按存活样本 `night-ferry` 重写 ⇒ 样本**合法地变小** ✓
	//   ⇒ 若阈值不动 ⇒ 门会去守一个**已经不存在的样本** ✗（那是错的约束，不是严 ✓）。
	// ⚠️ 重推口径（**可复核** ✓，不是「取实测值 − ε」✗）：
	//   · `clustersMin` ⇒ **等于新路线表自己的完整路线条数** ✓（「表定几条、地板就是几条」✓ ⇒ 表再被改小，
		//     同一条地板会跟着约束 ✓；表变大而不改此数 ⇒ 立刻红 ✓）；
	//   · `minDistinctiveGrams` ⇒ **按新样本重新量出** ✓（量法与读数见下一行注释 ✓）；
	//   · `beatsMinRoutes` ⇒ 同上取**完整路线条数** ✓（语义落成「每一拍必须被**每一条**完整路线走到」✓）。
	// 读数（本片实测 ✓，命令：`node test/scenarios.mjs` 后 `node -e` 按 `build/route-traces.json` 重算 DF 过滤 ✓）：
	//   · 完整路线 **2 条**（每个结局一条 ✓）；家族 **2**（两条互不重文 ⇒ 相似度 0 ✓）；
	//   · 独有 5-gram：`金路径 抵岸` **384** ／ `沉船` **362** ⇒ **下限 362**（旧样本：实测最少 **117**、地板 **50** ✓）；
	//   · 首不可逆点：两条路都落在 **第 5 次点击** ✓（`靠岸`／`翻船` ✓）；当时情报旗标 **0** 个（见 `e4.minEvFloor` 的就地申报 ✗）。
	// ⇒ 旧值为何不适用 ✗：`clustersMin: 16`／`minDistinctiveGrams: 50`／`beatsMinRoutes: 3` 三条都**按旧样本 21 条路线**定的 ✓
	//   （本文件原注释：「现有 18」「最少 117」「至少被 3 条路线走到」✓）⇒ 2 条路线的样本在数学上**到不了** 16 簇／3 条 ✓。
	clustersMin: 2,            // ＝本样本完整路线条数（旧：16，按 21 条路线的旧样本定）
	minDistinctiveGrams: 362,  // ＝本样本实测下限（旧：50；旧样本实测最少 117）
	beatsMinRoutes: 2,         // ＝本样本完整路线条数（旧：3）——「每一拍必须被每一条完整路线走到」
	e4: {
		minClicksFloor: 5,     // ＝本样本实测最少交互数（旧：5，同值 —— 但它现在是**量出来的**，不是沿用的）
		maxClicksCap: 25,      // 本样本实测最多交互数 5 ⇒ 远在内（旧上限 25 是防「不可逆点被推得极远」⇒ 本样本不适用该病）
		// ⚠️ **显式申报** ✗（不是静默放宽 ✓）：`night-ferry` 的接入契约**没有情报面** ✓（`pc.ev` 全程为空 ✓、
		//   它不写 `ev.*`）⇒ 「不可逆点时最少情报」这条子判据在**本样本上没有对象** ✓ ⇒ 地板归 **0** ✓
		//   （旧样本地板 3 是按故事 1 的八节点证据链定的 ✓）。⇒ 本片在 PR 正文与票上**申报**：E4 的「情报数」
		//   维度**随样本一起降级为空判** ✗ —— 要恢复它 ⇒ 先补一个带情报旗标的样本（不为凑绿加样本 ✗）。
		minEvFloor: 0,
	},
};
// 已删的一条断言（记下为什么）：曾想用「跨家族最大相似度 ≤ 0.92」抓成对趋同——
// 但家族是按 ≥ clusterT(0.9) 聚出来的，**任何越过 0.92 的配对早已并入同族**，该断言原理上不可达。
// 反例自证当场把它证伪（R1b 报「家族 18 → 17｜跨家族最大 0.741」，不咬合）。真正能咬的是
// ①家族数下限（成片并族）②每条路线的独有内容下限（趋同的极端形态）。
const TOL = 0.02;          // 报告型 ratchet 的容差（构建噪声/文案微调不该红）

// ── 五拍人工标注（一次性入基线；每拍列出该拍在正文里的落点段落）────────────
// ⚠️ `#1004` B2b（**换样本**）：旧标注逐条列的是**旧故事**的段落 ✗（村与林／塔内五层／龙战… ✓）
//   ⇒ 那两个内容故事被代码级删除后，五拍在新样本上**全为 0 条路线走到** ✓（实测读数 ✓）
//   ⇒ 按存活样本 `night-ferry`（11 段落 · 6 步链 · 2 个结局 ✓）**重标一次** ✓ ——
//   口径不变 ✓：把整局当成一次「地城流程」，每拍要能定位到该样本的落点段落 ✓、且被真实路线走到 ✓。
//   ⚠️ 本样本只有 6 步 ⇒ 五拍**落在同一条河上**（渡口 → 船头 → 河心 → 靠岸/翻船 → 结局 ✓）✓。
const BEATS = [
	{
		key: '① 入口与门槛',
		why: '渡口的准入：钱或力气，两条入场路（付钱/撑篙）',
		passages: ['渡口', '付钱', '撑篙'],
	},
	{
		key: '② 谜题与交涉挑战',
		why: '船头的灯与船夫的交代：灯要怎么拿（挂灯/攥灯）',
		passages: ['船头'],
	},
	{
		key: '③ 诡计与挫折',
		why: '河心那一下：水从哪边来（举灯/等浪）',
		passages: ['河心'],
	},
	{
		key: '④ 高潮',
		why: '浪与船：抵岸拍与翻船拍',
		passages: ['举灯', '等浪', '靠岸', '翻船'],
	},
	{
		key: '⑤ 奖励与揭示',
		why: '两条结局（抵岸/沉船）',
		passages: ['结局*'],
	},
];

// 首个不可逆点（E4）：与 `test/scenarios.mjs` 的 `MILESTONE_PASSAGES` 同口径 ✓
// ⚠️ `#1004` B2b（换样本）：旧值 `['花田','龙战']` 是**旧故事**的首要不可逆点 ✗ ⇒ 按存活样本 `night-ferry`
//   重推为它 6 步链上**唯一的不可逆分叉**那两段 ✓（`河心` 之后的「举灯 ⇒ 靠岸 ⇒ 抵岸」与「等浪 ⇒ 翻船 ⇒ 沉船」✓
//   —— 两条互斥、不可回头 ✓，与 `test/scenarios.mjs` 的 `MILESTONE_PASSAGES` **逐字对齐** ✓）。
const FIRST_MILESTONES = ['靠岸', '翻船'];

const beatMatch = (beat, passage) => beat.passages.some((pat) => (pat.endsWith('*') ? passage.startsWith(pat.slice(0, -1)) : passage === pat));

// ── 度量 ────────────────────────────────────────────────────────────
function ngrams(text, n = CHAR_N) {
	const s = text.replace(/\s+/g, '');
	const out = new Set();
	for (let i = 0; i + n <= s.length; i++) out.add(s.slice(i, i + n));
	return out;
}
const inter = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n; };

function evaluate(data, baseline) {
	const { routes, passageTexts } = data;
	const names = Object.keys(routes);
	// C4 样本口径：**只比走完结局的完整路线**。理由（实测踩坑）：只用几次点击就结束的
	// 专项用例，其轨迹天然是长路线的前缀，包含率（inter/min）必然 = 1.000——那与「路线趋同」
	// 毫无关系，是伪信号。截断轨迹只记进 E4 表，不进 C4 比对。
	// #338/#357：**合成用例排除**——构造性路线（首次点击前就注入状态）不计入「完整路线」样本，
	// 否则会抬高家族数、压低最少交互数（两次实测：E4 最早交互数 3<5、C4 家族 18→19 打掉 R1b 自证）。
	const synthetic = names.filter((k) => routes[k].synthetic);
	const full = names.filter((k) => routes[k].ending && !routes[k].synthetic);
	const routeText = Object.fromEntries(names.map((k) => [k, (routes[k].passages ?? []).map((p) => passageTexts[p] ?? '').join(' ')]));
	const Graw = Object.fromEntries(names.map((k) => [k, ngrams(routeText[k])]));
	// DF 过滤（在**完整路线**样本上统计：截断用例会把主线高频化，不能参与 df 统计）
	const df = new Map();
	for (const k of full) for (const g of Graw[k]) df.set(g, (df.get(g) ?? 0) + 1);
	const commonCut = Math.max(2, Math.ceil(full.length * COMMON_DF));
	const G = Object.fromEntries(names.map((k) => [k, new Set([...Graw[k]].filter((g) => (df.get(g) ?? 0) < commonCut))]));

	// C4：先把完整路线按相似度**聚成「游玩路线家族」**，再比家族之间的距离。
	// 为什么不能直接用两两数字（实测踩坑）：测试用例里有大量「同一段路径的两个用例」
	// （如「平凡之路」×「结局页收尾」相似度 0.994——它们本来就该一样），直接报最大值只会
	// 测出「用例重复度」而非「内容趋同」。家族内相似是预期的，**家族间**相似才是真信号。
	const pairs = [];
	for (let i = 0; i < full.length; i++) {
		for (let j = i + 1; j < full.length; j++) {
			const a = G[full[i]], b = G[full[j]];
			if (!a.size || !b.size) continue;
			const x = inter(a, b);
			pairs.push({ a: full[i], b: full[j], jaccard: x / (a.size + b.size - x) });
		}
	}
	const CLUSTER_T = 0.9;
	const parent = new Map(full.map((k) => [k, k]));
	const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
	for (const p of pairs) if (p.jaccard >= CLUSTER_T) parent.set(find(p.a), find(p.b));
	const clusters = new Map();
	for (const k of full) { const r = find(k); if (!clusters.has(r)) clusters.set(r, []); clusters.get(r).push(k); }
	const fams = [...clusters.values()].sort((a, b) => b.length - a.length);
	const famOf = new Map();
	fams.forEach((f, i) => f.forEach((k) => famOf.set(k, i)));
	const interPairs = pairs.filter((p) => famOf.get(p.a) !== famOf.get(p.b));
	const distinctive = full.map((k) => ({ route: k, grams: G[k].size, raw: Graw[k].size }));
	const emptyDistinctive = distinctive.filter((d) => d.grams === 0).map((d) => d.route);
	const c4 = {
		charN: CHAR_N,
		commonDf: COMMON_DF,
		commonCut,
		emptyDistinctive,
		routes: full.length,
		truncated: names.length - full.length - synthetic.length,
		synthetic: synthetic.length,
		clusterT: CLUSTER_T,
		clusters: fams.length,
		families: fams,
		maxIntraJaccard: pairs.filter((p) => famOf.get(p.a) === famOf.get(p.b)).reduce((m, p) => Math.max(m, p.jaccard), 0),
		meanInterJaccard: interPairs.reduce((s, p) => s + p.jaccard, 0) / (interPairs.length || 1),
		maxInterJaccard: interPairs.reduce((m, p) => Math.max(m, p.jaccard), 0),
		topConvergent: [...interPairs].sort((x, y) => y.jaccard - x.jaccard).slice(0, 5),
		distinctive,
	};

	// E4：首个不可逆点（取花田/龙战里先到的那个）
	const perRoute = names.map((k) => {
		const t = routes[k];
		const hits = FIRST_MILESTONES.map((m) => ({ m, ...(t.milestones?.[m] ?? {}) })).filter((h) => h.atClick !== undefined);
		const first = hits.sort((x, y) => x.atClick - y.atClick)[0] ?? null;
		return {
			route: k,
			结局: t.ending ?? '(未到结局)',
			点击数: t.clicks,
			首不可逆点: first ? `${first.m}@${first.atClick}` : '—',
			情报数: first ? first.evCount : null,
		};
	});
	const hit = perRoute.filter((r) => r.情报数 !== null);
	const e4 = {
		milestone: `${FIRST_MILESTONES.join('/')}（先到者）`,
		routesHit: hit.length,
		minClicks: hit.length ? Math.min(...hit.map((r) => Number(r.首不可逆点.split('@')[1]))) : null,
		maxClicks: hit.length ? Math.max(...hit.map((r) => Number(r.首不可逆点.split('@')[1]))) : null,
		minEv: hit.length ? Math.min(...hit.map((r) => r.情报数)) : null,
		maxEv: hit.length ? Math.max(...hit.map((r) => r.情报数)) : null,
		perRoute,
	};

	// 五拍齐备度：该拍的段落里，有哪几段被真实路线走到过
	const reachedByRoute = Object.fromEntries(names.map((k) => [k, new Set(routes[k].passages ?? [])]));
	const beats = BEATS.map((b) => {
		const reached = Object.keys(passageTexts).filter((p) => reachedByRoute && Object.values(reachedByRoute).some((s) => s.has(p)) && beatMatch(b, p));
		const routesTouching = names.filter((k) => [...reachedByRoute[k]].some((p) => beatMatch(b, p)));
		return { key: b.key, why: b.why, passages: reached.length, routes: routesTouching.length, reached };
	});

	const failures = [];
	if (baseline) {
		const T = THRESHOLDS;
		if (c4.clusters < T.clustersMin) failures.push({ code: 'c4-convergence', msg: `游玩路线家族数 ${c4.clusters} < 下限 ${T.clustersMin}（成片并族＝内容趋同）` });
		const thin = distinctive.filter((d) => d.grams < T.minDistinctiveGrams);
		if (thin.length) failures.push({ code: 'route-indistinct', msg: `以下完整路线的独有 5-gram 少于 ${T.minDistinctiveGrams}（趋同）：${thin.map((d) => `${d.route}=${d.grams}`).join('、')}` });
		if (c4.emptyDistinctive.length) failures.push({ code: 'route-indistinct', msg: `以下完整路线在 DF 过滤后**没有任何独有 5-gram**（趋同的极端形态）：${c4.emptyDistinctive.join('、')}` });
		if (e4.routesHit < THRESHOLDS.beatsMinRoutes) failures.push({ code: 'e4-milestone', msg: `走到首个不可逆点的完整路线只有 ${e4.routesHit} 条（< ${THRESHOLDS.beatsMinRoutes}）` });
		if (e4.minClicks !== null && e4.minClicks < T.e4.minClicksFloor) failures.push({ code: 'e4-milestone', msg: `首个不可逆点最早交互数 ${e4.minClicks} < 下限 ${T.e4.minClicksFloor}（铺垫被压掉）` });
		if (e4.maxClicks !== null && e4.maxClicks > T.e4.maxClicksCap) failures.push({ code: 'e4-milestone', msg: `首个不可逆点最晚交互数 ${e4.maxClicks} > 上限 ${T.e4.maxClicksCap}（不可逆点被推得极远）` });
		if (e4.minEv !== null && e4.minEv < T.e4.minEvFloor) failures.push({ code: 'e4-milestone', msg: `不可逆点时最少情报 ${e4.minEv} < 下限 ${T.e4.minEvFloor}（信息覆盖退化）` });
		for (const b of beats) {
			if (b.routes < THRESHOLDS.beatsMinRoutes) failures.push({ code: 'beat-coverage', msg: `「${b.key}」只有 ${b.routes} 条路线走到（< ${THRESHOLDS.beatsMinRoutes}）` });
		}
	}
	return { c4, e4, beats, failures, routeCount: names.length };
}

// ── 反例自证（#247 横切原则：门必须行为化，须有正例＋反例）────────────────
function selftest(data, baseline) {
	const out = [];
	// R1 全体并族：把首条路线的段落序列复制给**所有**完整路线 → 家族数跌破下限（真实趋同的极端形态）
	{
		const base = evaluate(data, null);
		const full = Object.keys(data.routes).filter((k) => data.routes[k].ending);
		const src0 = full[0];
		const bad = JSON.parse(JSON.stringify(data));
		for (const k of full) bad.routes[k].passages = [...bad.routes[src0].passages];
		const r = evaluate(bad, baseline);
		const hit = r.failures.some((f) => f.code === 'c4-convergence' || f.code === 'route-indistinct');
		out.push({ key: 'R1 全体并族（所有完整路线都换成同一条的复制）', expect: 'c4-convergence 或 route-indistinct 红', got: hit, detail: `家族 ${base.c4.clusters} → ${r.c4.clusters}（下限 ${THRESHOLDS.clustersMin}）｜零独有内容 ${r.c4.emptyDistinctive.length} 条` });
	}
	// R1b 成片并族（历史漂移的形态）：把 4 条单成员家族的路线整条换成同一条的复制
	// → 那 4 个家族消失 → 家族数跌破下限
	{
		const base = evaluate(data, null);
		const full = Object.keys(data.routes).filter((k) => data.routes[k].ending);
		// 自适应：吸收「刚好跌破下限」所需的最少单成员家族数——这样**任何合法新增路线**都不会让反例失效
		// （实测：新增一条路线把家族数抬到 19 后，原来固定吸 4 条＝降到 16＝正好等于下限，反例不再咬合）。
		// 多吸 2 条：复制后若某条的 DF 集变空，它**不参与归并**（等于白吸一条）——CI 实测出现过一次。
		const need = Math.max(1, base.c4.clusters - THRESHOLDS.clustersMin + 1) + 2;
		const singles = base.c4.families.filter((f) => f.length === 1).map((f) => f[0]).slice(0, need);
		const a = full[0], b = singles.map(() => a);
		const bad = JSON.parse(JSON.stringify(data));
		for (const t of singles) bad.routes[t].passages = [...bad.routes[a].passages];
		const r = evaluate(bad, baseline);
		// 接受两种检出：家族数跌破下限（c4-convergence）**或**出现零独有内容的路线（route-indistinct）——
		// 两者都说明「这次污染被发现了」；CI 上曾出现「某条复制后 DF 集为空、不参与归并」的情形。
		const hit = r.failures.some((f) => f.code === 'c4-convergence' || f.code === 'route-indistinct');
		out.push({ key: `R1b 成片并族（${singles.length} 条独立路线被换成「${a}」的复制）`, expect: `c4-convergence 或 route-indistinct 红`, got: hit, detail: `家族 ${base.c4.clusters} → ${r.c4.clusters}（下限 ${THRESHOLDS.clustersMin}）｜零独有 ${r.c4.emptyDistinctive.length} 条` });
	}
	// 历史对照（首版反例「把 A 家族路线拷给 B」不咬合：B 只是换了个家族，家族总数 16→16）：
	// 所以反例必须打**不变量**——要么全体并族（跌破家族数下限），要么成对趋同（越过相似度上限），见 R1/R1b。
	// R2 五拍缺拍：把所有结局页（⑤ 奖励与揭示）从轨迹里抹掉 → 该拍覆盖应当掉 → 必须红
	{
		const bad = JSON.parse(JSON.stringify(data));
		for (const k of Object.keys(bad.routes)) {
			bad.routes[k].passages = (bad.routes[k].passages ?? []).filter((p) => !beatMatch(BEATS[4], p));
			if (bad.routes[k].ending && beatMatch(BEATS[4], bad.routes[k].ending)) bad.routes[k].ending = null;
		}
		const r = evaluate(bad, baseline);
		const hitR2 = r.failures.some((f) => f.code === 'beat-coverage' && f.msg.includes('⑤'));
		out.push({ key: 'R2 五拍缺拍（抹掉全部结局页＝⑤ 揭示）', expect: 'beat-coverage 红（⑤）', got: hitR2, detail: `⑤ passages=${r.beats[4].passages} routes=${r.beats[4].routes}` });
	}
	// 正例：真实数据必须全绿（对**不变量**判定，应不受环境轨迹细微差异影响）
	{
		const r = evaluate(data, baseline);
		out.push({ key: '正例：真实轨迹 vs 不变量阈值', expect: '无 failure', got: r.failures.length === 0, detail: `failures=${r.failures.length}` });
		for (const f of r.failures) console.log(`      [${f.code}] ${f.msg}`);
	}
	const bad = out.filter((o) => !o.got);
	for (const o of out) console.log(`${o.got ? '✓' : '✗'} ${o.key}\n    期望 ${o.expect}｜实况 ${o.detail}`);
	if (bad.length) { console.error(`\n✗ 反例自证失败 ${bad.length} 项——断言没有咬合力（空判）`); process.exit(1); }
	console.log('\n✔ 反例自证通过（R1/R2 均能变红，正例全绿）');
}

// ── main ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const val = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

if (!existsSync(TRACES)) {
	console.error(`✗ 找不到 ${TRACES}——先跑 npm test（scenarios 会顺带落盘路线轨迹）`);
	process.exit(1);
}
const data = JSON.parse(readFileSync(val('--input', TRACES), 'utf8'));
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;

if (flag('--selftest')) {
	if (!baseline) { console.error('✗ 自证需要基线，先 --update-baseline'); process.exit(1); }
	selftest(data, baseline);
	process.exit(0);
}

if (flag('--update-baseline')) {
	const r = evaluate(data, null);
	const nb = {
		note: 'E4 节奏 / C4 相异度 **漂移观测**（#295/#338）。判定用的是脚本内声明的绝对不变量 THRESHOLDS，'
			+ '不是本文件的数值——本文件只用于「漂移可见」：数值变了会在报告里对照出来。'
			+ '#338 教训：拿本地观测值做等值判定，会在 CI（2 核、轨迹细微差异）上直接判红。',
		thresholds: THRESHOLDS,
		c4: { charN: r.c4.charN, commonDf: r.c4.commonDf, routes: r.c4.routes, clusterT: r.c4.clusterT, clusters: r.c4.clusters, meanInterJaccard: +r.c4.meanInterJaccard.toFixed(4), maxInterJaccard: +r.c4.maxInterJaccard.toFixed(4), minDistinctive: Math.min(...r.c4.distinctive.map((d) => d.grams)) },
		e4: { routesHit: r.e4.routesHit, minClicks: r.e4.minClicks, maxClicks: r.e4.maxClicks, minEv: r.e4.minEv, maxEv: r.e4.maxEv },
		beats: Object.fromEntries(r.beats.map((b) => [b.key, { passages: b.passages, routes: b.routes }])),
	};
	writeFileSync(BASELINE, JSON.stringify(nb, null, '\t') + '\n');
	console.log(`✔ 基线已写入 ${BASELINE}`);
	console.log(JSON.stringify(nb, null, 1));
	process.exit(0);
}

const r = evaluate(data, baseline);

if (flag('--json')) { console.log(JSON.stringify({ ...r, baseline }, null, 1)); }
else {
	console.log(`══ E4 节奏密度 ══  （路线 ${r.routeCount} 条；首个不可逆点＝${r.e4.milestone}）`);
	console.log(`  走到首个不可逆点：${r.e4.routesHit} 条路线；交互数 ${r.e4.minClicks}–${r.e4.maxClicks}；当时情报旗标 ${r.e4.minEv}–${r.e4.maxEv}`);
	console.log('  路线｜点击数｜首不可逆点｜当时情报｜结局');
	for (const p of r.e4.perRoute.sort((x, y) => x.点击数 - y.点击数)) console.log(`   ${p.route}｜${p.点击数}｜${p.首不可逆点}｜${p.情报数 ?? '—'}｜${p.结局}`);
	console.log('\n  五拍齐备度（Five Room Dungeon 口径，人工标注一次）：');
	for (const b of r.beats) console.log(`   ${b.key}：可达段落 ${b.passages}｜被 ${b.routes} 条路线走到｜${b.why}`);
	console.log(`\n══ C4 路线相异度 ══  （字符 ${CHAR_N}-gram；只比走完结局的 ${r.c4.routes} 条完整路线，另有 ${r.c4.truncated} 条截断用例不计入）`);
	console.log(`  降噪：DF 过滤——被 ≥${r.c4.commonCut}/${r.c4.routes} 条路线共享的 5-gram 视为「共享主线/框架文本」，不计入相异度（#338）`);
	console.log(`  样本：完整路线 ${r.c4.routes} 条（另有合成用例 ${r.c4.synthetic} 条、截断用例 ${r.c4.truncated} 条**不计入** C4/E4）`);
	console.log(`  游玩路线家族（相似度 ≥ ${r.c4.clusterT} 自动归并）：${r.c4.clusters} 族`);
	for (const f of r.c4.families) console.log(`   · ${f.length} 条：${f.join(' / ')}`);
	console.log(`  跨家族平均相似度 ${r.c4.meanInterJaccard.toFixed(3)}｜最大 ${r.c4.maxInterJaccard.toFixed(3)}｜家族内最大 ${r.c4.maxIntraJaccard.toFixed(3)}（家族内高是预期的：同一段路径的多个用例）`);
	console.log('  最相似的跨家族 5 对（真正的「趋同」危险区）：');
	for (const p of r.c4.topConvergent) console.log(`   ${p.jaccard.toFixed(3)}  ${p.a} × ${p.b}`);
}

if (baseline) {
	if (r.failures.length) {
		console.error(`\n✗ 基线 ratchet 未通过 ${r.failures.length} 项：`);
		for (const f of r.failures) console.error(`   [${f.code}] ${f.msg}`);
		process.exit(1);
	}
	console.log('\n✔ 节奏/相异度基线 ratchet 通过（E4 交互数带内、五拍齐备、C4 未趋同）');
}
