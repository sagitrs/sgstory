// `#1267`（M1 最后一件）**用例执行器**的判据件。
//
// 守护的对象：**三态语义 ＋ 陈旧归因 ＋ 入口两态**（`scripts/case-run.mjs`）。
// 它在什么输入下会红：
//   ① 有人把「红-有归因」的 rc 从 0 改成 1（或反过来）→ 第 2/3 格红；
//   ② 有人把「陈旲归因」当普通缺口（rc=0）→ 第 5 格红；
//   ③ 有人把「根不存在」也静默 rc=0 → 入口那格红（本件只测纯函数；入口两态见 §实测）。
import {
	classifyCase, summarize, expectViolations, parseArgs, resolveCasesDir, discoverCases, runtimeProblems,
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

console.log(bad ? `\n✗ case-run：${bad}/${n} 例失败` : `\n✔ case-run：${n} 例全部通过`);
process.exit(bad ? 1 : 0);
