// #295 探索票（报告型）：E4 节奏密度 ＋ C4 路线相异度
//
// 数据源：build/route-traces.json（test/scenarios.mjs 跑 40 条路线时顺带落盘的轨迹）。
// 之所以不塞进 scripts/audit.mjs：那是 D 席在办的活跃文件（#247 的 D8/I1 批次），
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
const TOL = 0.02;          // 报告型 ratchet 的容差（构建噪声/文案微调不该红）

// ── 五拍人工标注（一次性入基线；每拍列出该拍在正文里的落点段落）────────────
// 标注口径：把整局当成一次「地城流程」（塔＝地城主段，地下宴会厅＝第二个地城），
// 只要该拍在本作里有可定位落点、且被真实路线走到过，即算齐备。
// 末尾带 * 的是前缀模式（结局页有 18 个，逐个列没意义）。
const BEATS = [
	{
		key: '① 入口与门槛',
		why: '村与林的门槛：打听准入、守卫（哥布林/雾之魔物）与第一道塔门',
		passages: ['开场', '酒馆', '女巫小屋', '森林边缘', '林间小径', '洞穴', '废哨站', '村中井台', '林缘空地', '雾之魔物', '雾之魔物·战', '雾之魔物·退', '塔门'],
	},
	{
		key: '② 谜题与交涉挑战',
		why: '拿钥匙/上楼/守林人交涉，以及第三章的双时代调查（寻杖/喂花/观星者）',
		passages: ['守林人', '守林人·劝杀', '守林人·信', '守林人·送', '守林人·守', '守林人·封印', '门厅', '书房', '工坊', '天文台', '顶楼', '地下宴会厅', '宴会·过去', '当时的女巫', '当时的女巫·换', '老巫女', '老妇人', '观星者', '寻杖', '喂花'],
	},
	{
		key: '③ 诡计与挫折',
		why: '代价与回退：花田致死位点、劣化封印的岔口、观星者算不出图的僵局',
		passages: ['塔外花田', '半途的林子', '观星者·图', '观星者·夜', '宴·散场'],
	},
	{
		key: '④ 高潮',
		why: '决战拍：封印并肩 / 龙战 / 唤醒',
		passages: ['封印·并肩', '龙·战', '龙·再冲', '龙·巢边', '唤醒'],
	},
	{
		key: '⑤ 奖励与揭示',
		why: '真相落地与收束：交付、归位、观星者·星，以及全部结局页',
		passages: ['交付', '归位', '观星者·星', '宴·仪式', '结局*'],
	},
];

// 首个不可逆点（E4）：与 test/scenarios.mjs 的 MILESTONE_PASSAGES 同口径
const FIRST_MILESTONES = ['花田', '龙战'];

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
	const full = names.filter((k) => routes[k].ending);
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
		truncated: names.length - full.length,
		clusterT: CLUSTER_T,
		clusters: fams.length,
		families: fams,
		maxIntraJaccard: pairs.filter((p) => famOf.get(p.a) === famOf.get(p.b)).reduce((m, p) => Math.max(m, p.jaccard), 0),
		meanInterJaccard: interPairs.reduce((s, p) => s + p.jaccard, 0) / (interPairs.length || 1),
		maxInterJaccard: interPairs.reduce((m, p) => Math.max(m, p.jaccard), 0),
		topConvergent: [...interPairs].sort((x, y) => y.jaccard - x.jaccard).slice(0, 5),
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
		milestone: '花田/龙战（先到者）',
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
		const t = TOL;
		if (c4.maxInterJaccard > baseline.c4.maxInterJaccard + t) failures.push({ code: 'c4-convergence', msg: `跨家族最大相似度 ${c4.maxInterJaccard.toFixed(3)} > 基线 ${baseline.c4.maxInterJaccard} + ${t}（两条不同的游玩路线趋同）` });
		if (c4.meanInterJaccard > baseline.c4.meanInterJaccard + t) failures.push({ code: 'c4-convergence', msg: `跨家族平均相似度 ${c4.meanInterJaccard.toFixed(3)} > 基线 ${baseline.c4.meanInterJaccard} + ${t}（整体趋同）` });
		if (c4.clusters < baseline.c4.clusters) failures.push({ code: 'c4-convergence', msg: `游玩路线家族数 ${c4.clusters} < 基线 ${baseline.c4.clusters}（有路线被并入另一家族）` });
		if (c4.emptyDistinctive.length) failures.push({ code: 'route-indistinct', msg: `以下完整路线在 DF 过滤后**没有任何独有 5-gram**（趋同的极端形态）：${c4.emptyDistinctive.join('、')}` });
		if (e4.routesHit < baseline.e4.routesHit) failures.push({ code: 'e4-milestone', msg: `走到首个不可逆点的路线数 ${e4.routesHit} < 基线 ${baseline.e4.routesHit}` });
		if (e4.minClicks !== null && e4.minClicks < baseline.e4.minClicks - 1) failures.push({ code: 'e4-milestone', msg: `首个不可逆点最早交互数 ${e4.minClicks} < 基线 ${baseline.e4.minClicks} − 1（不可逆点被推近＝铺垫变少）` });
		if (e4.maxClicks !== null && e4.maxClicks > baseline.e4.maxClicks + 2) failures.push({ code: 'e4-milestone', msg: `首个不可逆点最晚交互数 ${e4.maxClicks} > 基线 ${baseline.e4.maxClicks} + 2（不可逆点被推远）` });
		if (e4.minEv !== null && e4.minEv < baseline.e4.minEv - 1) failures.push({ code: 'e4-milestone', msg: `不可逆点时最少情报 ${e4.minEv} < 基线 ${baseline.e4.minEv} − 1（信息覆盖退化）` });
		if (e4.maxEv !== null && e4.maxEv > baseline.e4.maxEv + 2) failures.push({ code: 'e4-milestone', msg: `不可逆点时最多情报 ${e4.maxEv} > 基线 ${baseline.e4.maxEv} + 2` });
		for (const b of beats) {
			const ub = baseline.beats?.[b.key];
			if (!ub) { failures.push({ code: 'beat-missing', msg: `基线里没有「${b.key}」` }); continue; }
			if (b.routes < 3) failures.push({ code: 'beat-coverage', msg: `「${b.key}」只有 ${b.routes} 条路线走到（< 3）` });
			if (b.passages < ub.passages) failures.push({ code: 'beat-coverage', msg: `「${b.key}」可达段落 ${b.passages} < 基线 ${ub.passages}（拍子被削弱/删段）` });
		}
	}
	return { c4, e4, beats, failures, routeCount: names.length };
}

// ── 反例自证（#247 横切原则：门必须行为化，须有正例＋反例）────────────────
function selftest(data, baseline) {
	const out = [];
	// R1 路线趋同：把「一条有独立内容的路线」整条换成另一家族的复制品。
	// 踩坑记录（很值得留）：首版反例是「把 A 的序列拷给另一家族的 B」——不咬合。原因：B 只是
	// 换了个家族（旧家族剩下的人自成一族），家族总数 16 → 16，断言抓不到。真正的退化是
	// **一条路线的独立内容消失**（独有家族被并掉），所以反例必须选一个**单成员家族**当牺牲品。
	{
		const names = Object.keys(data.routes);
		const base = evaluate(data, null);
		const [c0] = base.c4.families;
		const a = c0[0];
		const singles = base.c4.families.filter((f) => f.length === 1).map((f) => f[0]);
		const b = singles.find((n) => n !== a) ?? names.find((n) => n !== a);
		const bad = JSON.parse(JSON.stringify(data));
		bad.routes[b].passages = [...bad.routes[a].passages];
		const r = evaluate(bad, baseline);
		const hitR1 = r.failures.some((f) => f.code === 'c4-convergence');
		out.push({ key: `R1 路线趋同（把独立路线「${b}」的正文换成「${a}」的复制）`, expect: 'c4-convergence 红（家族数下降）', got: hitR1, detail: `家族 ${base.c4.clusters} → ${r.c4.clusters}｜跨家族最大 ${r.c4.maxInterJaccard.toFixed(3)}` });
	}
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
	// 正例：真实数据必须全绿
	{
		const r = evaluate(data, baseline);
		out.push({ key: '正例：真实轨迹 vs 基线', expect: '无 failure', got: r.failures.length === 0, detail: `failures=${r.failures.length}` });
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
		note: 'E4 节奏 / C4 相异度 基线（#295）。由 scripts/report-rhythm.mjs --update-baseline 生成；数字变化须在 PR 里说明理由。',
		c4: { charN: r.c4.charN, commonDf: r.c4.commonDf, routes: r.c4.routes, clusterT: r.c4.clusterT, clusters: r.c4.clusters, meanInterJaccard: +r.c4.meanInterJaccard.toFixed(4), maxInterJaccard: +r.c4.maxInterJaccard.toFixed(4) },
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
