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
//   「⏳ Rules.claims（…；#239 类回归防线）」里的 ⏳ 同理。表格行的状态列天然描述行不描述票。
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
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过：一致绿 / 闭环标记但未闭环红 / 在办标记但已闭环红 / 无标记只登记 / 就近匹配');
};

// ── 真实运行（仅在直接执行时跑；被 import 时只导出纯函数，便于单测）────────
const isEntry = import.meta.url === `file://${process.argv[1]}`;
const argv = process.argv.slice(2);
if (!isEntry) { /* 作为模块被引入：不执行主流程 */ }
else if (argv.includes('--selftest')) { selftest(); process.exit(0); }
else {

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const docs = collectDocs();
const refs = docs.flatMap((f) => parseRefs(readFileSync(f, 'utf8'), f));
const unique = [...new Set(refs.map((r) => r.ref))];

if (!TOKEN) {
	console.log(`扫到 ${docs.length} 个文档、${refs.length} 处 #NNN 引用（唯一 ${unique.length} 个）`);
	console.log('○ 跳过（无 token：设 GITHUB_TOKEN 或 GH_TOKEN 后再跑；本门不把网络依赖塞进主链路）');
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

if (argv.includes('--check') && mismatches.length) {
	console.error(`\n✗ F6 新鲜度未通过：${mismatches.length} 处标记与真实状态不符（更新文档，或把「在办」标记写准）`);
	process.exit(1);
}
}
