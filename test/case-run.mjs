// `#1267`（M1 最后一件）**用例执行器**的判据件。
//
// 守护的对象：**三态语义 ＋ 陈旧归因 ＋ 入口两态**（`scripts/case-run.mjs`）。
// 它在什么输入下会红：
//   ① 有人把「红-有归因」的 rc 从 0 改成 1（或反过来）→ 第 2/3 格红；
//   ② 有人把「陈旲归因」当普通缺口（rc=0）→ 第 5 格红；
//   ③ 有人把「根不存在」也静默 rc=0 → 入口那格红（本件只测纯函数；入口两态见 §实测）。
import {
	classifyCase, summarize, expectViolations, parseArgs, resolveCasesDir, discoverCases, runtimeProblems, VERDICT_LABELS, summaryLine,
} from '../scripts/case-run.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let bad = 0, n = 0;
const t = (label, ok, extra = '') => { n++; if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${label}${ok || !extra ? '' : ` —— ${extra}`}`); };

// ── 三态 ＋ 陈旧归因（**纯函数注入**）───────────────────────────────
t('① 绿 ⇒ rc=0', classifyCase({ passed: true }).exit === 0);
t('② 红-有归因（票未关）⇒ **rc=0**（已声明的缺口不阻塞）', (() => { const r = classifyCase({ passed: false, ticket: '#1', ticketState: 'open' }); return r.verdict === 'expected-gap' && r.exit === 0; })());
t('③ 红-有归因（离线 unknown）⇒ rc=0（**不据此判红**）', classifyCase({ passed: false, ticket: '#1', ticketState: 'unknown' }).exit === 0);
t('④ 红-无归因 ⇒ **rc≠0**', (() => { const r = classifyCase({ passed: false }); return r.verdict === 'unattributed' && r.exit !== 0; })());
t('⑤ ★ 红-陈旧归因（票已关却仍红）⇒ **rc≠0**', (() => { const r = classifyCase({ passed: false, ticket: '#1', ticketState: 'closed' }); return r.verdict === 'stale-attribution' && r.exit !== 0; })());
t('⑤b 反向：票已关但**用例绿了** ⇒ 绿（不算陈旧）', classifyCase({ passed: true, ticket: '#1', ticketState: 'closed' }).verdict === 'green');

// ── expect 四面的违例（两向）─────────────────────────────────────
const seen = { text: '甲 乙', edges: ['丁'], state: { 'ev.x': 2 } };
const vs = expectViolations({ expect: { visible: ['甲'], absent: ['乙'], edges: ['丙'], state: { 'ev.x': 1 } }, seen });
t('⑥ expect 四面各自能咬（absent／edges／state 命中，visible 不误报）', vs.length === 3 && vs.every((v) => ['absent', 'edges', 'state'].includes(v.kind)), JSON.stringify(vs.map((v) => v.kind)));
t('⑥b 反向：全部满足 ⇒ 0 违例', expectViolations({ expect: { visible: ['甲'], absent: ['丙'], edges: ['丁'], state: { 'ev.x': 2 } }, seen }).length === 0);

// ── `#1478`：**「键不存在」可断**（★两向 ＋ 向后兼容）────────────────────
// 真因：`JSON.stringify(undefined)` **返回 `undefined`**（✗ 不是 `"null"`）⇒ `want: null` 时两侧恒不等
//   ⇒ ★**键在不在都红**（**不可达判据**：数据对了也红 ✗）—— 与"空判"对称的另一半 ✓
// 用途：★「**键不存在**」是合法断言形 —— 例如 `#1471` 的 `takes`（库存移除），其**唯一正确**断言
//   就是"该键**不存在**"（✗ 不是 `false` —— 与 `gives` 的 `= true` 对称 ✓）
t('⑫ ★键**不存在** ＋ 期望 `null` ⇒ **绿**（判定可达 —— 修前此处**恒红**）',
	expectViolations({ expect: { state: { 'inv.苹果': null } }, seen: { state: {} } }).length === 0);
t('⑫b ★键**存在** ＋ 期望 `null` ⇒ **必红**（★反例能咬 —— 不是"一律放行"）',
	expectViolations({ expect: { state: { 'inv.苹果': null } }, seen: { state: { 'inv.苹果': true } } }).length === 1);
t('⑫c ★`undefined` 与 `null` **同义**（两侧都无该键 ⇒ 绿；⇒ 归一的是**比较** ✗ 不是"放宽"）',
	expectViolations({ expect: { state: { 'ev.x': undefined } }, seen: { state: {} } }).length === 0);
t('⑫d 向后兼容：具体值两向仍咬（相等 ⇒ 绿／不等 ⇒ 红）',
	expectViolations({ expect: { state: { 'ev.x': 2 } }, seen: { state: { 'ev.x': 2 } } }).length === 0
	&& expectViolations({ expect: { state: { 'ev.x': 2 } }, seen: { state: { 'ev.x': 3 } } }).length === 1);

// ── 汇总（含 rc 合成）────────────────────────────────────────────
t('⑦ 汇总：有一条 rc≠0 ⇒ 总 rc=1；计数分组对', (() => {
	const s = summarize([{ verdict: 'green', exit: 0 }, { verdict: 'expected-gap', exit: 0 }, { verdict: 'unattributed', exit: 1 }]);
	return s.total === 3 && s.green === 1 && s.expectedGap === 1 && s.unattributed === 1 && s.exit === 1;
})());

// ── 入口解析（`--cases=` 显式优先；默认 `<ROOT>/cases`）────────────
t('⑧ `--cases=` 显式（绝对路径）⇒ 原样', resolveCasesDir({ cases: '/tmp/x', root: '/r' }) === '/tmp/x');
t('⑧b `--cases=` 相对 ⇒ 相对 ROOT 解析', resolveCasesDir({ cases: 'c', root: '/r' }) === '/r/c');
t('⑧c 未给 ⇒ 默认 `<ROOT>/cases`', resolveCasesDir({ root: '/r' }) === '/r/cases');
t('⑧d `--slug=`／`--case=` 解析', (() => { const a = parseArgs(['--slug=s1', '--case=abc']); return a.slug === 's1' && a.id === 'abc'; })());

// ── 发现面（零用例 → 空；有 → 发现；`--slug` 过滤）──────────────────
{
	const d = mkdtempSync(join(tmpdir(), 'cases-'));
	mkdirSync(join(d, 's1'), { recursive: true });
	mkdirSync(join(d, 's2'), { recursive: true });
	writeFileSync(join(d, 's1', 'c1.json'), '{}');
	writeFileSync(join(d, 's1', 'c2.json'), '{}');
	writeFileSync(join(d, 's2', 'c3.json'), '{}');
	t('⑨ 发现：3 条；`--slug=s1` ⇒ 2 条；`--case=c3`（配 slug）⇒ 0 条', discoverCases(d).length === 3 && discoverCases(d, { slug: 's1' }).length === 2 && discoverCases(d, { slug: 's1', id: 'c3' }).length === 0);
	t('⑨b 根不存在 ⇒ 发现 0 条（不抛；"根不存在"由入口**出声**）', discoverCases(join(d, 'nope')).length === 0);
	rmSync(d, { recursive: true, force: true });
}

// ── `#1267`（预审）新增三格：真形状／精确匹配／目录过滤 ────────────────
t('⑩ ★ `expect.edges` 是**对象**（真形状 `{from,label,to}`）⇒ 按 label 比、报文不得出现 `[object Object]`', (() => {
	const v = expectViolations({ expect: { edges: [{ from: 'a', label: '丙', to: 'b' }] }, seen: { text: '', edges: ['丙'], state: {} } });
	if (v.length !== 0) return false;                                       // 边全对 → 不报
	const v2 = expectViolations({ expect: { edges: [{ from: 'a', label: '丙', to: 'b' }] }, seen: { text: '', edges: ['丁'], state: {} } });
	return v2.length === 1 && !JSON.stringify(v2).includes('[object Object]') && v2[0].want === '丙';
})());
{
	const d = mkdtempSync(join(tmpdir(), 'cases2-'));
	mkdirSync(join(d, 's1'), { recursive: true });
	writeFileSync(join(d, 'README.md'), '# 说明（不是 slug 目录）');
	writeFileSync(join(d, 's1', 'c1.json'), '{}');
	writeFileSync(join(d, 's1', 'c10.json'), '{}');
	t('⑪ ★ 只把**目录**当 slug（`cases/README.md` 不被当 slug ⇒ 不再 ENOTDIR 崩）', discoverCases(d).length === 2);
	t('⑫ ★ `--case=` **精确匹配**（`c1` 不连带 `c10`）', discoverCases(d, { slug: 's1', id: 'c1' }).length === 1);
	rmSync(d, { recursive: true, force: true });
}

// ── `#1267`（预审二轮）新增三格：uncaught 两向 ＋ `--json` 整段可解析 ＋ 真入口 spawn ──
const ROOT = fileURLToPath(new URL('..', import.meta.url));
t('⑬ ★ `runtimeProblems`：`uncaught` 非空 ⇒ **判红并点名**（页面坏了不许判绿）', (() => {
	const r = runtimeProblems({ uncaught: ['boom: TypeError'] });
	return r.length === 1 && r[0].kind === 'uncaught' && r[0].want.includes('boom');
})());
t('⑬b 反向：`uncaught` 空 ⇒ 不因此报（防该格恒真）', runtimeProblems({ uncaught: [] }).length === 0 && runtimeProblems({}).length === 0);
t('⑭ ★ `--json` 的 **stdout 整段可解析**（不是"末行可解析"）', (() => {
	const out = execFileSync('node', ['scripts/case-run.mjs', '--json'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
	try { const j = JSON.parse(out.trim()); return j && j.summary && Array.isArray(j.results); } catch { return false; }
})());
t('⑮ ★ **真入口**（无参跑 CLI）⇒ rc=0 ＋ 明说"零用例"', (() => {
	const r = execFileSync('node', ['scripts/case-run.mjs'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	return /零用例/.test(r);
})());

// ── `#1287`（复核三件）新增三格 ────────────────────────────────────
t('⑯ 票状态三态：**在线票号不存在 ⇒ missing ⇒ 归因无效 rc≠0**（不落 unknown）', (() => {
	const r = classifyCase({ passed: false, ticket: '#99999999', ticketState: 'missing' });
	return r.verdict === 'invalid-attribution' && r.exit !== 0;
})());
t('⑯b 反向：`unknown`（离线）仍 ⇒ rc=0（不据此判红）', classifyCase({ passed: false, ticket: '#1', ticketState: 'unknown' }).exit === 0);
{
	const d = mkdtempSync(join(tmpdir(), 'cases3-'));
	mkdirSync(join(d, 's1'), { recursive: true });
	writeFileSync(join(d, 's1', 'ok.json'), '{"id":"ok","story":"nope","expect":{}}');
	writeFileSync(join(d, 's1', 'bad.json'), '{bad json');
	const run = (argv) => { try { return { rc: 0, out: execFileSync('node', ['scripts/case-run.mjs', ...argv], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { rc: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }; } };
	const bad = run(['--cases=' + d]);
	t('⑰ ★ 坏 JSON ⇒ **不许 rc=2 整停**、须**点名该文件**、其余照跑', bad.rc !== 2 && /不是合法 JSON：/.test(bad.out), `rc=${bad.rc}`);
	const miss = run(['--cases=' + d, '--slug=nope']);
	const empty = (() => { const e = mkdtempSync(join(tmpdir(), 'cases4-')); const r = run(['--cases=' + e]); rmSync(e, { recursive: true, force: true }); return r; })();
	t('⑱ ★ **过滤器零命中**（根里有 N 条）与**根内 0 条**可分：前者出声 rc≠0 ＋ 给可用清单；后者 rc=0 明说', miss.rc !== 0 && /过滤器未命中/.test(miss.out) && /可用用例/.test(miss.out) && empty.rc === 0 && !/过滤器未命中/.test(empty.out), `miss.rc=${miss.rc} empty.rc=${empty.rc}`);
	rmSync(d, { recursive: true, force: true });
}

// ── `#1287`（复核）：**呈现层**自证（判定对 ≠ 呈现对）────────────────────
// `#1315` 甲-2（裁定）：原格只断言「五个标签常量都非空」＝**判内部结构**（换实现方式就会红而无缺陷）⇒
// 换成**行为格**：五个判决态**各自都要能在人读输出里看得见**。
// ★ 期望用**契约词**（五态口径：绿／预期缺口／未归因／归因无效／陈旧归因），✗ **不抄实现的标签常量**
//   —— 否则就是“期望照抄实现”（实现换字，格跟着换 ⇒ 契约漂移）。
// 两处呈现位都看：(a) **人读汇总行**（造一条只含该态的汇总 ⇒ 行里必须出现该态的契约词）
//               (b) **单例标记**（`VERDICT_LABELS[k]` 非空 —— 它挂在每例那一行上）
t('⑲ ★ **五态都在人读输出里出现**（行为口径：不是“常量非空”，而是“渲染出来看得见”）', (() => {
	const CTR = { green: '绿', 'expected-gap': '预期缺口', unattributed: '未归因',
		'invalid-attribution': '归因无效', 'stale-attribution': '陈旧归因' };
	const bucket = { green: 'green', 'expected-gap': 'expectedGap', unattributed: 'unattributed',
		'invalid-attribution': 'invalidAttribution', 'stale-attribution': 'stale' };
	return Object.entries(bucket).every(([k, b]) => {
		const sum = { total: 1, green: 0, expectedGap: 0, unattributed: 0, invalidAttribution: 0, stale: 0, exit: 0 };
		sum[b] = 1;
		const line = summaryLine(sum, 0, '');
		const marker = VERDICT_LABELS[k];
		return line.includes(CTR[k]) && typeof marker === 'string' && marker.trim() !== '';
	});
})());
t('⑳ ★ **人读汇总各桶之和 ＝ total**（且含「归因无效」桶）', (() => {
	const sum = { total: 1, green: 0, expectedGap: 0, unattributed: 0, invalidAttribution: 1, stale: 0, exit: 1 };
	const line = summaryLine(sum, 0, '');
	return /归因无效 1/.test(line) && (sum.green + sum.expectedGap + sum.unattributed + sum.invalidAttribution + sum.stale) === sum.total;
})());

console.log(bad ? `\n✗ case-run：${bad}/${n} 例失败` : `\n✔ case-run：${n} 例全部通过`);
process.exit(bad ? 1 : 0);
