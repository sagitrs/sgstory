// #329 · F6「口径台账新鲜度」机检：文档里的 #NNN 引用，其**近旁状态标记**必须与 GitHub 真实状态一致。
//
// 为什么这么判（而不是「引用必须已关闭」）：文档里引用开放票是正当的（「后续 #318②」）。
// 真正会让按过时信息做决定的，是**标记与真实状态不符**——实测已抓到 6 处，最近一例：
// `docs/quality-dimensions.md` 的 F7 行写 `⏳ #271`，而 #271 早已 CLOSED（PR #274 已 MERGED）。
//
// 判据：
//   标记「已闭环」系（✅/已闭环/已修/已完成/已合/MERGED）  ⇒ 目标须 closed（issue）或 merged（PR）
//   标记「在办」系（⏳/待补/待办/在办/进行中/未开工/OPEN/阻塞） ⇒ 目标须 open
//   无标记 ⇒ **只登记不判定**（避免噪音）
//   一行内两个标记 + 两个引用时，取**离该引用最近**的那个标记（避免「✅ #315 → ⏳ #318②」互相污染）
//
// ⚠️ 精度优于召回（首轮实测的教训，故收紧两处）：
//   初版只按「同一行最近的标记」判定 → 真实文档报出 12 处不符，逐条看**大多是假阳性**：
//   「#291 G3（guest-1 在办）」里的「在办」描述的是**这一行的工作**，不是 #291 的状态；
//   「⏳ Game.Rules.claims（…；#239 类回归防线）」里的 ⏳ 同理。表格行的状态列天然描述行不描述票。
//   故：
//     ① **只判定「紧邻」**——引用与标记之间只允许空白/`（）()`/`·` 等分隔符（≤4 字符），
//        跨一个短语就不判（避免把「行状态」当成「票状态」）；**表格列分隔符 `|` 不算紧邻**——
//        相邻列里的 ✅/待补 描述的是那一列（如「本节状态」），不是所引票的状态；
//     ② **历史叙述不判**——块引用行（`>`）或含「原标/此前/曾/修正/原本」的行，常是在讲
//        「这处标记曾经错了」，属**引用历史**而非当前断言；这类行归入「歧义」单列。
//
// 用法：
//   node scripts/report-ledger-freshness.mjs            # 报告（只读）
//   node scripts/report-ledger-freshness.mjs --check    # 有「标记不符」则 exit 1
//   node scripts/report-ledger-freshness.mjs --selftest # 自证（不联网）
//   node scripts/report-ledger-freshness.mjs --json
//
// 无 token（GITHUB_TOKEN / GH_TOKEN）时**优雅降级**：打印「跳过（无 token）」并 exit 0——
// 不把网络依赖塞进主链路（是否接定时 workflow 由 ci 席决定）。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO = 'sagitrs/sgstory';
const SKIP_DIRS = ['docs/archive'];

const CLOSED_MARK = /✅|已闭环|已修|已完成|已合|MERGED|merged/g;
const OPEN_MARK = /⏳|待补|待办|在办|进行中|未开工|OPEN|阻塞/g;

// ── 解析（纯函数：给文档文本，返回引用与就近标记）────────────────────
export const parseRefs = (text, file = '(inline)') => {
	const out = [];
	const lines = text.split('\n');
	lines.forEach((line, i) => {
		const marks = [
			...[...line.matchAll(CLOSED_MARK)].map((m) => ({ at: m.index, len: m[0].length, want: 'closed' })),
			...[...line.matchAll(OPEN_MARK)].map((m) => ({ at: m.index, len: m[0].length, want: 'open' })),
		];
		const historical = /^\s*>/.test(line) || /原标|此前|曾经|曾写|修正|原本/.test(line);
		for (const m of line.matchAll(/#(\d{2,5})\b/g)) {
			const refAt = m.index;
			// 紧邻判定：引用与标记之间只允许分隔符/空白
			const adjacent = marks.filter((mk) => {
				// 间隔 = 标记末尾 → 引用开头（反向亦然）；不含标记自身
				const start = mk.at < refAt ? mk.at + mk.len : refAt + m[0].length;
				const gap = line.slice(start, Math.max(mk.at, refAt));
				return gap.length <= 4 && /^[\s·、,，:：（）()\[\]]*$/.test(gap);
			});
			const uniqWant = [...new Set(adjacent.map((a) => a.want))];
			const want = uniqWant.length === 1 ? uniqWant[0] : null;
			out.push({
				file, line: i + 1, ref: Number(m[1]),
				want: historical ? null : want,
				ambiguous: !historical && uniqWant.length > 1,
				historical,
				text: line.trim().slice(0, 140),
			});
		}
	});
	return out;
};

// ── 判定（纯函数：给引用列表 + 状态查询函数，返回不符项）────────────────
// stateOf(n) → { kind:'issue'|'pr', state:'open'|'closed', merged:boolean } | null
export const judge = (refs, stateOf) => {
	const mismatches = [];
	const unresolved = [];
	const unmarked = [];
	for (const r of refs) {
		const s = stateOf(r.ref);
		if (!s) { unresolved.push(r); continue; }
		const done = s.kind === 'pr' ? s.merged : s.state === 'closed';
		if (!r.want) { unmarked.push({ ...r, actual: done ? 'done' : 'open' }); continue; }
		if (r.ambiguous) { unmarked.push({ ...r, actual: 'ambiguous' }); continue; }
		if (r.want === 'closed' && !done) mismatches.push({ ...r, actual: s.kind === 'pr' ? (s.state === 'open' ? 'open PR' : 'closed unmerged PR') : 'open issue' });
		if (r.want === 'open' && done) mismatches.push({ ...r, actual: s.kind === 'pr' ? 'merged PR' : 'closed issue' });
	}
	return { mismatches, unresolved, unmarked };
};

// ── #297 对标台账行级新鲜度（**离线**判据：不联网，故可进主链路）──────────
// 为什么单列一节：伞票 #297 的动机原文就是「**F6 只管我们自己文档的漂移，不管竞品侧**」——
// `docs/benchmark-ledger.md` 的「最近复核 / 触发条件」两列一旦留空或过期，这份 12 款竞品的对标
// 调研就变死档（#291/#295 的落点还在长，死档会让人按过时基准做决定）。
// 判据只对**表格数据行**（不判散文），逐条可核对：
//   ① 行数栅栏：竞品 ≥12、外部基准 ≥5、探索票 ≥4（防「悄悄删行」式腐化）
//   ② 「最近复核」首个日期可解析，且距今 ≤ FRESH_DAYS —— 账本自己声明的触发条件③就是「季度例行」，故取 90 天
//   ③ 「触发条件」非空（空 / `—` / `-` / `无` 都算缺失）
//   ④ 「我们的落点」可核对：`--flag` 必须在 audit 注册表内；`docs|test|scripts/*.md|.mjs|.json` 路径必须存在
//      （仅判**反引号包裹**的旗标与路径：散文里提「双读门」这类中文名无法机检，不猜）
//   ⑤ 探索表「票」列必须是 `#NNN` 或 `—`（验收条 3：每项有票号或明确归属）
export const FRESH_DAYS = 90;

// 纯函数：给台账文本 + 依赖（今日 / 已知旗标 / 文件存在性），返回 findings。
// 依赖注入是为了能在自证里造反例（不起真实文件系统、不改真实日期）。
export const judgeBenchmarkLedger = (text, { today = new Date(), knownFlags = new Set(), fileExists = () => true } = {}) => {
	const findings = [];
	const cells = (line) => line.split('|').slice(1, -1).map((c) => c.trim());
	// 按空行切表块（每块首行表头、次行分隔、其余数据）
	const blocks = [];
	let cur = null;
	for (const line of text.split('\n')) {
		if (/^\s*\|/.test(line)) cur = [...(cur ?? []), line];
		else if (cur) { blocks.push(cur); cur = null; }
	}
	if (cur) blocks.push(cur);
	const counts = { 竞品: 0, 基准: 0, 票: 0 };
	for (const b of blocks) {
		const head = cells(b[0])[0] ?? '';
		const kind = head.includes('竞品') ? '竞品' : head.includes('基准') ? '基准' : head.includes('票') ? '票' : null;
		if (!kind) continue;   // 非本台账的表（如验收清单）跳过
		for (const line of b.slice(2)) {
			const c = cells(line);
			counts[kind]++;
			const where = `${kind}表「${(c[0] ?? '').replace(/\*\*/g, '').slice(0, 24)}」`;
			if (kind === '票') {
				const own = (c[0] ?? '').replace(/\*\*/g, '');
				if (!/^#\d+$/.test(own) && own !== '—') findings.push({ code: 'explore-unowned', msg: `${where}：「票」列应为 \`#NNN\` 或 \`—\`（验收条 3 要求明确归属）` });
				if (!c[3]) findings.push({ code: 'explore-status', msg: `${where}：「状态」列留空` });
				continue;
			}
			const m = (c[4] ?? '').match(/(\d{4})-(\d{2})-(\d{2})/);
			if (!m) findings.push({ code: 'review-missing', msg: `${where}：「最近复核」列没有可解析日期（须写 \`YYYY-MM-DD\`）` });
			else {
				const days = Math.floor((today - new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`)) / 86400000);
				if (days > FRESH_DAYS) findings.push({ code: 'review-stale', msg: `${where}：复核已过 ${days} 天（>${FRESH_DAYS} 天）→ 复核该行后更新日期` });
			}
			if (!c[5] || /^(—|-|无|N\/A)$/.test(c[5])) findings.push({ code: 'trigger-missing', msg: `${where}：「触发条件」列留空（验收条 2 要求不许留空）` });
			const spot = c[3] ?? '';
			for (const f of [...spot.matchAll(/`(--[a-z0-9-]+)/g)].map((x) => x[1])) {
				if (!knownFlags.has(f.slice(2))) findings.push({ code: 'unknown-flag', msg: `${where}：落点引用了 audit 注册表里没有的门旗标 ${f}` });
			}
			for (const p of [...spot.matchAll(/`((?:docs|test|scripts)\/[A-Za-z0-9_./-]+\.(?:md|mjs|json|twee))`/g)].map((x) => x[1])) {
				if (!fileExists(p)) findings.push({ code: 'missing-path', msg: `${where}：落点引用的文件不存在 ${p}` });
			}
		}
	}
	for (const [kind, min] of [['竞品', 12], ['基准', 5], ['票', 4]]) {
		if (counts[kind] < min) findings.push({ code: 'row-floor', msg: `${kind}表数据行 ${counts[kind]} 行 < 下限 ${min}（不许悄悄删行）` });
	}
	return { findings, counts };
};

// ── 文档收集 ─────────────────────────────────────────────────────────
const collectDocs = () => {
	const files = [];
	if (existsSync('README.md')) files.push('README.md');
	for (const f of readdirSync('docs').filter((f) => f.endsWith('.md')).sort()) files.push(join('docs', f));
	return files.filter((f) => !SKIP_DIRS.some((d) => f.startsWith(d)));
};

// ── 自证（不联网）──────────────────────────────────────────────────
const selftest = () => {
	const doc = [
		'| A | ✅ #101 已闭环 |',            // 一致（101 closed）
		'| B | ⏳ #102 在办 |',              // 一致（102 open）
		'| C | ✅ #102 已修 |',              // 不符：标记闭环但实际 open
		'| D | ⏳ #101 待补 |',              // 不符：标记在办但实际 closed
		'| E | 见 #103 |',                   // 无标记 → 只登记
		'| F | ✅ #104 → ⏳ #105 |',         // 就近匹配：#104→closed 标记 / #105→open 标记
	].join('\n');
	const state = {
		101: { kind: 'issue', state: 'closed', merged: false },
		102: { kind: 'issue', state: 'open', merged: false },
		103: { kind: 'issue', state: 'open', merged: false },
		104: { kind: 'issue', state: 'closed', merged: false },
		105: { kind: 'issue', state: 'open', merged: false },
	};
	const refs = parseRefs(doc);
	const { mismatches, unmarked } = judge(refs, (n) => state[n] ?? null);
	const cases = [
		['一致样本不得报错（A/B）', !mismatches.some((m) => [101, 102].includes(m.ref) && m.line <= 2)],
		['标记✅但实际 open → 必须报（C）', mismatches.some((m) => m.ref === 102 && m.line === 3)],
		['标记⏳但实际 closed → 必须报（D）', mismatches.some((m) => m.ref === 101 && m.line === 4)],
		['无标记引用 → 只登记（E）', unmarked.some((u) => u.ref === 103) && !mismatches.some((m) => m.ref === 103)],
		['一行两标记两引用 → 就近匹配（F）', !mismatches.some((m) => [104, 105].includes(m.ref))],
	];
	let bad = 0;
	for (const [name, ok] of cases) { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${name}`); }

	// ── #297：对标台账行级判据的自证（正例 + 反例；反例造在**纯文本**上，不起文件系统）──
	const TODAY = new Date('2026-09-12T00:00:00Z');
	const KNOWN = new Set(['dragon', 'echoes']);
	const fixture = (o = {}) => {
		const spot = o.spot ?? '#1 · `--dragon` · `docs/baselines.md`';
		const review = o.review ?? '2026-09-12 复核：已复核';
		const trigger = o.trigger ?? '该作出新作时';
		const row = (n) => `| **竞品${n}** | 2020-01 | 维度 | ${spot} | ${review} | ${trigger} |`;
		const bench = (n) => `| **基准${n}** | 理论 | 维度 | \`--echoes\` | 2026-09-12 首次登记 | 官方修订时 |`;
		const ex = (n) => `| **#${200 + n}** | 内容 | 形态 | ✅ 已合 |`;
		const H = '| 竞品 | 时点·版本 | 学到的维度 | 我们的落点（票号／文件／门） | 最近复核 | 触发条件 |';
		const S = '|---|---|---|---|---|---|';
		return [
			H, S, ...Array.from({ length: o.competitors ?? 12 }, (_, i) => row(i + 1)),
			'', '| 基准 | 时点·版本 | 学到的维度 | 我们的落点（票号／文件／门） | 最近复核 | 触发条件 |', S,
			...Array.from({ length: o.benchmarks ?? 5 }, (_, i) => bench(i + 1)),
			'', '| 票 | 内容 | 形态 | 状态 |', '|---|---|---|---|',
			...(o.exploreRows ?? Array.from({ length: o.explore ?? 4 }, (_, i) => ex(i + 1))),
		].join('\n');
	};
	const codes = (o) => judgeBenchmarkLedger(fixture(o), { today: TODAY, knownFlags: KNOWN }).findings.map((f) => f.code);
	const ledgerCases = [
		['台账正例（12 竞品 / 5 基准 / 4 探索票，行行齐全）→ 无 findings', codes({}).length === 0],
		['反例① 竞品少一行（11）→ row-floor', codes({ competitors: 11 }).includes('row-floor')],
		['反例② 复核日期过期（2020-01-01，>90 天）→ review-stale', codes({ review: '2020-01-01 复核' }).includes('review-stale')],
		['反例③ 复核列没有日期（「首次登记」）→ review-missing', codes({ review: '首次登记' }).includes('review-missing')],
		['反例④ 触发条件留空 → trigger-missing', codes({ trigger: '' }).includes('trigger-missing')],
		['反例⑤ 落点写了不存在的门旗标（`--no-such-flag`）→ unknown-flag', codes({ spot: '`--no-such-flag`' }).includes('unknown-flag')],
		['反例⑥ 落点写了不存在的文件（`docs/nope.md`）→ missing-path', judgeBenchmarkLedger(fixture({ spot: '`docs/nope.md`' }), { today: TODAY, knownFlags: KNOWN, fileExists: () => false }).findings.some((f) => f.code === 'missing-path')],
		['反例⑦ 探索票行「票」列写 `-`（归属不明）→ explore-unowned', codes({ exploreRows: ['| - | 内容 | 形态 | ✅ |', '| **#201** | 内容 | 形态 | ✅ |', '| **#202** | 内容 | 形态 | ✅ |', '| **#203** | 内容 | 形态 | ✅ |'] }).includes('explore-unowned')],
	];
	for (const [name, ok] of ledgerCases) { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${name}`); }
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过：引用）一致绿 / 闭环标记但未闭环红 / 在办标记但已闭环红 / 无标记只登记 / 就近匹配');
	console.log('✔ 自证通过：台账）行数栅栏 / 复核缺日期 / 复核过期 / 触发条件留空 / 未知门旗标 / 文件不存在 / 归属不明');
};

// ── 真实运行（仅在直接执行时跑；被 import 时只导出纯函数，便于单测）────────
const isEntry = import.meta.url === `file://${process.argv[1]}`;
const argv = process.argv.slice(2);
if (!isEntry) { /* 作为模块被引入：不执行主流程 */ }
else if (argv.includes('--selftest')) { selftest(); process.exit(0); }
else {

// ── #297 竞品侧：对标台账行级新鲜度（**离线**，故 `npm test` 用 `--ledger` 只跑本段）──
const LEDGER_PATH = 'docs/benchmark-ledger.md';
const runLedger = async () => {
	if (!existsSync(LEDGER_PATH)) { console.error(`   ✗ 缺少 ${LEDGER_PATH}`); return 1; }
	const { GATES } = await import('./audit/registry.mjs');
	const knownFlags = new Set(GATES.flatMap((g) => g.flags ?? []));
	const { findings, counts } = judgeBenchmarkLedger(readFileSync(LEDGER_PATH, 'utf8'), { knownFlags, fileExists: (p) => existsSync(p) });
	console.log(`══ F6 竞品侧：对标台账行级新鲜度 ══  ${LEDGER_PATH}`);
	console.log(`  竞品 ${counts.竞品} 行 / 外部基准 ${counts.基准} 行 / 探索票 ${counts.票} 行｜复核阈值 ${FRESH_DAYS} 天（账本声明「季度例行」）`);
	for (const f of findings) console.error(`   ✗ [${f.code}] ${f.msg}`);
	if (!findings.length) console.log('  ✔ 每行都有在期复核日期与非空触发条件；落点引用的门旗标与文件都真实存在');
	return findings.length;
};

if (argv.includes('--ledger')) {
	const bad = await runLedger();
	if (bad && argv.includes('--check')) { console.error(`\n✗ F6 竞品侧台账未通过（${bad} 项）`); process.exit(1); }
	process.exit(0);   // 只跑离线段：不碰网络（网络段见 --check 无 --ledger 的路径）
}

const ledgerBad = await runLedger();
console.log('');

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const docs = collectDocs();
const refs = docs.flatMap((f) => parseRefs(readFileSync(f, 'utf8'), f));
const unique = [...new Set(refs.map((r) => r.ref))];

if (!TOKEN) {
	console.log(`扫到 ${docs.length} 个文档、${refs.length} 处 #NNN 引用（唯一 ${unique.length} 个）`);
	console.log('○ 跳过（无 token：设 GITHUB_TOKEN 或 GH_TOKEN 后再跑；本门不把网络依赖塞进主链路）');
	if (ledgerBad && argv.includes('--check')) { console.error(`\n✗ F6 竞品侧台账未通过（${ledgerBad} 项）`); process.exit(1); }
	process.exit(0);
}

const cache = new Map();
const stateOf = (n) => cache.get(n) ?? null;
const resolve = async () => {
	for (const n of unique) {
		const res = await fetch(`https://api.github.com/repos/${REPO}/issues/${n}`, {
			headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'sgstory-freshness' },
		});
		if (!res.ok) { cache.set(n, null); continue; }
		const j = await res.json();
		cache.set(n, { kind: j.pull_request ? 'pr' : 'issue', state: j.state, merged: !!j.pull_request?.merged_at });
	}
};
await resolve();

const { mismatches, unresolved, unmarked } = judge(refs, stateOf);
if (argv.includes('--json')) {
	console.log(JSON.stringify({ docs: docs.length, refs: refs.length, unique: unique.length, mismatches, unmarked: unmarked.length, unresolved: unresolved.map((u) => ({ file: u.file, line: u.line, ref: u.ref })) }, null, 1));
} else {
	console.log(`══ F6 口径台账新鲜度 ══  文档 ${docs.length} 个 · #NNN 引用 ${refs.length} 处（唯一 ${unique.length} 个）`);
	console.log(`  标记不符：${mismatches.length}｜无标记/歧义（只登记）：${unmarked.length}｜无法解析（非本仓号/已删）：${unresolved.length}`);
	if (mismatches.length) {
		console.log('\n  标记与真实状态不符：');
		for (const m of mismatches) console.log(`   ${m.file}:${m.line}  #${m.ref}（标记=${m.want === 'closed' ? '已闭环' : '在办'}，实际=${m.actual}）\n      ${m.text}`);
	}
	if (unresolved.length) {
		console.log('\n  无法解析（可能是他仓票号或已删除）：');
		for (const u of unresolved.slice(0, 10)) console.log(`   ${u.file}:${u.line}  #${u.ref}`);
	}
	if (!mismatches.length) console.log('\n✔ 所有带标记的引用都与 GitHub 真实状态一致');
}

if (argv.includes('--check') && (mismatches.length || ledgerBad)) {
	if (mismatches.length) console.error(`\n✗ F6 新鲜度未通过：${mismatches.length} 处标记与真实状态不符（更新文档，或把「在办」标记写准）`);
	if (ledgerBad) console.error(`\n✗ F6 竞品侧台账未通过（${ledgerBad} 项）`);
	process.exit(1);
}
}
