// `#1189`：实现路线表的判据件（表在 `scripts/lib/route-registry.mjs`）。
//
// 三格，外加一格反向核：
// 覆盖：主干上检测到的现场，每一处都要在表里（新增多路线行为不带表项 → 这格红，这就是出生规则）
// 完读：表项字段齐（路线至少两条、退出条件非空且非占位、指向的方法真的在同一文件里）
// 腐烂：表里指的行为已不在（检测不到）→ 报
// 反向核：检测到的现场数必须等于钉死值（当前 5）——防"检测器抽不到东西、覆盖格空转假绿"
//
// 反向核数随现场增减**人工更新**（这条写在 `docs/implementation-routes.md` 的出生规则里）。

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROUTES, UNCOVERED, detectSites, FORM_PATTERNS } from '../scripts/lib/route-registry.mjs';
import { allSourceFiles } from '../scripts/module-order.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
/** 主干上应有的现场数（新增现场时必须同片改这里）。 */
const EXPECTED_SITES = 5;

let bad = 0;
const ok = (name, cond, detail = '') => {
	if (cond) { console.log(`✔ ${name}`); return; }
	bad += 1;
	console.error(`✗ ${name}${detail ? ` —— ${detail}` : ''}`);
};

// 抽主干现场（只扫 `src/**` 的代码面）
const sources = {};
for (const f of allSourceFiles().filter((x) => x.startsWith('src/'))) {
	try { sources[f] = readFileSync(join(ROOT, f), 'utf8'); } catch { /* 读不到就当不在面上 */ }
}
const sites = detectSites(sources);
const registeredFiles = new Set(ROUTES.map((r) => r.locus.file));

// 覆盖：每个现场所在的文件里，至少有一条表项指向同一个方法
const methodOfLine = (file, line) => {
	const lines = (sources[file] ?? '').split('\n');
	for (let i = line - 1; i >= 0; i--) {
		const m = /^\t+([A-Za-z_$][\w$]*)\s*\(.*\)\s*\{/.exec(lines[i]);
		if (m) return m[1];
	}
	return null;
};
const unregistered = sites.filter((s) => !ROUTES.some((r) => r.locus.file === s.file && r.locus.method === methodOfLine(s.file, s.line)));
ok('覆盖：每个现场都在表里', unregistered.length === 0, unregistered.map((s) => `${s.file}:${s.line}(${methodOfLine(s.file, s.line)})`).join(' / '));

// 反向核：现场数必须等于钉死值（防检测器抽不到东西导致覆盖格空转）
ok(`反向核：主干现场数等于钉死值 ${EXPECTED_SITES}`, sites.length === EXPECTED_SITES, `实测 ${sites.length}`);

// 完读：字段齐
{
	const problems = [];
	for (const r of ROUTES) {
		if (!r.id || !r.behavior) problems.push(`${r.id ?? '?'}：缺 id 或 behavior`);
		if (!Array.isArray(r.routes) || r.routes.length < 2) problems.push(`${r.id}：路线少于两条（那就不算多路线）`);
		if (!r.fallback) problems.push(`${r.id}：缺兜底语义`);
		if (!r.exitCondition || /^(待定|TODO|TBD|—|-)$/.test(String(r.exitCondition).trim())) problems.push(`${r.id}：退出条件缺失或占位`);
		if (!r.ticket) problems.push(`${r.id}：缺票号`);
		const p = join(ROOT, r.locus?.file ?? '');
		if (!existsSync(p)) { problems.push(`${r.id}：指向的文件不存在（${r.locus?.file}）`); continue; }
		const text = readFileSync(p, 'utf8');
		if (r.locus?.method && !new RegExp(`\\b${r.locus.method}\\s*\\(`).test(text)) problems.push(`${r.id}：方法 ${r.locus.method} 在该文件里找不到`);
	}
	ok('完读：表项字段齐、指向真实', problems.length === 0, problems.join(' / '));
}

// 腐烂：表里指的行为检测不到（且它自称覆盖的形态就是本检测器认的那一种）
{
	const stale = ROUTES.filter((r) => !sites.some((s) => s.file === r.locus.file && r.locus.method === methodOfLine(s.file, s.line)));
	ok('腐烂：表里每条都还能被检测到', stale.length === 0, stale.map((r) => r.id).join(' / '));
}

// 出生规则与边界：未覆盖清单必须带来源（防它变成永不清的许愿单）
ok('未覆盖清单每条都带来源与理由', UNCOVERED.every((u) => u.what && u.foundBy && u.whyNotV1));
ok('形态清单非空（检测器认什么写在表头）', FORM_PATTERNS.length > 0 && FORM_PATTERNS.every((p) => p.re instanceof RegExp));

// 能红（纯函数层）：合成的三级级联必须被检测到（否则覆盖格是空转）
{
	const synth = { 'src/engine/40-sim/zz-fake.twee': 'applyThing(a, pc) {\n\tconst hook = window.Sg?.story?.socialHooks?.()?.[a.id]?.apply;\n\tif (typeof hook === "function") return hook(pc);\n}\n' };
	const got = detectSites(synth);
	ok('能红·检测器认得出合成现场', got.length === 1 && got[0].line === 2, JSON.stringify(got));
	// 反向核：注释里的同样一行**不算**现场（否则注释会制造假现场）
	const commented = { 'src/engine/40-sim/zz-fake.twee': '// const hook = window.Sg?.story?.socialHooks?.()?.[a.id]?.apply;\n' };
	ok('能红·注释里的同样一行不算现场', detectSites(commented).length === 0);
}

console.log(bad === 0 ? '\n✔ 实现路线表判据通过' : `\n✗ ${bad} 格未过`);
process.exit(bad === 0 ? 0 : 1);
