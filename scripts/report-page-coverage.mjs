// 页面侧覆盖率报告（**只读** ✗ 不改任何判定/页内行为）—— 车道 E 第一片（`#215` 裁决 (A) ✓）
//
// 要回答的问题（★ 三条，逐门 ✓）：对五条门（`--rules`／`--state`／`--reads`／`--settle`／`story-shape` ✓）
//   ① 页面侧有没有**等价判定** ✗
//   ② 页内跑的是不是**同一份** `editor/lib/core/**` ✓（同一模块身份 ✓，而不是"看起来像" ✗）
//   ③ 差在哪一步 ✓（缺口落在哪个模块 ✓）
//
// ⚠️ **判据是"模块身份级"的代理** ✗（照 §17 ㉓ ✓ 写明，不假装更强 ✓）：
//   · **不**证明"两侧判定函数**逐字同**" ✗ —— 只证明"**门用的判据模块**，页内也 import 了" ✓；
//   · 所以本报告的 `已接线` ＝ **必要不充分** ✓（函数级同源要靠**探针**证 ✓，见 §17 ㉓／`#908` ① ✓）；
//   · 相反方向的误判（把"其实已接"报成"未接"✗）由**分类三态**与**能假的锚点**兜 ✓
//     （`--state`／`story-shape` 必须落 `已接线` ✓ —— 它们就是这条读数的**能假另一半** ✓）。
//
// 扫描面（**要够宽** ✗ —— `#842` 的教训: 只扫 `test/*.mjs` 会得出错结论 ✓）：
//   `editor/web/**`（页面侧 ✓）＋ `editor/lib/core/**`（共享判据 ✓）＋ `scripts/audit/**`（门侧 ✓）
//   ＋ `stories/*/gates/**`（**故事门**已搬到这里 ✓）
//
// 用法（**前置写进命令** ✓ 照 ⑲）：`node scripts/report-page-coverage.mjs`
//   口径：同参数同输出（纯静态扫描 ✓ 不跑判定 ✓）；`--json` 给机器读 ✓。

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gatesForStory } from './audit/discovery.mjs';
import { DEFAULT_SLUG } from './dist-paths.mjs';   // `#1004` B2b ✓：默认故事**单源**（不再写死 `'mist-forest'` ✗ —— 那已是被删故事 ✓）

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TARGET_FLAGS = ['rules', 'state', 'reads', 'settle', 'story-shape'];
const SLUG = DEFAULT_SLUG;   // `#1004` B2b ✓：报告头的"判哪个故事"取单源（本件只拿它做**报告落点/标题** ✗，不参与扫描面 ✓）

const readFile = (abs) => { try { return readFileSync(abs, 'utf8'); } catch { return null; } };
const walk = (dir, out = []) => {
	if (!existsSync(dir)) return out;
	for (const e of readdirSync(dir)) {
		const p = join(dir, e);
		const st = statSync(p);
		if (st.isDirectory()) walk(p, out);
		else if (/\.mjs$/.test(e)) out.push(p);
	}
	return out;
};

/** 一个文件里的 import/export-from 目标（解析成**绝对路径** ✓）＋行号（证据 ✓）。 */
const importTargets = (abs) => {
	const src = readFile(abs);
	if (src === null) return [];
	const out = [];
	src.split('\n').forEach((line, i) => {
		const m = line.match(/(?:^|\s)(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/);
		const spec = m && (m[1] ?? m[2]);
		if (!spec || !spec.startsWith('.')) return;
		const t = resolve(dirname(abs), spec);
		const cands = [t, `${t}.mjs`, join(t, 'index.mjs')];
		const hit = cands.find((c) => existsSync(c) && statSync(c).isFile());
		if (hit) out.push({ target: hit, line: i + 1, spec });
	});
	return out;
};

/** 解析**一层**转出（`export … from` ⇒ 真身 ✓；例: scripts/audit/lib/shared.mjs → core/audit-shared.mjs ✓）。 */
const resolveOneLevel = (files) => {
	const seen = new Set(files.map((f) => resolve(f)));
	const queue = [...seen];
	while (queue.length) {
		const abs = queue.shift();
		for (const t of importTargets(abs)) {
			if (seen.has(resolve(t.target))) continue;
			// 只跟"转发/共享纯件"那一层（同目录或 lib/core ✓），避免把整张图拉平 ✗
			if (/editor[\\/]lib[\\/]core[\\/]/.test(t.target) || /scripts[\\/]audit[\\/]lib[\\/]/.test(t.target)) {
				seen.add(resolve(t.target));
				queue.push(t.target);
			}
		}
	}
	return seen;
};

const rel = (abs) => relative(ROOT, abs).split('\\').join('/');

// ── 页面侧：`editor/web/**` 的 core 依赖面（模块身份 ✓ ＋ 证据行 ✓）──
const webFiles = walk(join(ROOT, 'editor/web'));
const pageCore = new Map(); // coreAbs ⇒ [{ webFile, line }]
for (const w of webFiles) {
	for (const t of importTargets(w)) {
		if (!/editor[\\/]lib[\\/]core[\\/]/.test(t.target)) continue;
		const key = resolve(t.target);
		if (!pageCore.has(key)) pageCore.set(key, []);
		pageCore.get(key).push({ from: rel(w), line: t.line });
	}
}
const pageSet = resolveOneLevel([...pageCore.keys()]);

// ── 门侧：按 flag 找门（注册表 ＋ 故事清单 ✓ 机械求得 ✗ 不手写 ✓）──
const registrySrc = readFile(join(ROOT, 'scripts/audit/registry.mjs')) ?? '';
const engineFileOf = new Map();   // 门模块名（如 g_state）⇒ 文件（scripts/audit/gates/<x>.mjs ✓）
for (const m of registrySrc.matchAll(/import \* as (g_\w+) from '(\.\/gates\/[^']+)'/g)) engineFileOf.set(m[1], join(ROOT, 'scripts/audit', m[2]));
// 跨**所有**故事扫门（五条 flag 分布在 mist-forest／hollow-cave 等 ✓）—— 机械求 ✓ 不手写 ✗
const slugs = readdirSync(join(ROOT, 'stories')).filter((d) => existsSync(join(ROOT, 'stories', d, '00-story.json')));
const gates = [];
for (const sl of slugs) { try { for (const g of await gatesForStory(sl)) gates.push({ ...g, slug: sl }); } catch { /* 单故事清单异常不影响全局扫面 ✓ */ } }
// 引擎门补上 file（注册表里有 ✓）
for (const g of gates) if (!g.file) { const k = Object.keys(g).find((x) => /^(g_|key|name)/.test(x)); if (k && engineFileOf.has(g[k])) g.file = rel(engineFileOf.get(g[k])); }
const allGateFiles = [
  ...walk(join(ROOT, 'scripts/audit/gates')),
  ...slugs.flatMap((sl) => walk(join(ROOT, 'stories', sl, 'gates'))),
];
const declaresFlag = (abs, flag) => {
  const t = readFile(abs) ?? '';
  return new RegExp(`(?:flags|FLAGS)[^\\n]*['\"\\[]?${flag}\\b`).test(t) || new RegExp(`'${flag}'`).test(t.split('\n').slice(0, 40).join('\n'));
};
const gateOf = (flag) => {
  const byRegistry = gates.filter((g) => (g.flags ?? []).includes(flag));
  const byContent = allGateFiles.filter((f) => declaresFlag(f, flag)).map((f) => ({ file: rel(f), flags: [flag], owner: '(内容匹配)' }));
  const seen = new Set(); const out = [];
  for (const g of [...byRegistry, ...byContent]) {
    const key = `${g.file ?? '(未迁移)'}|${(g.flags ?? []).join(',')}`;
    if (seen.has(key)) continue; seen.add(key); out.push(g);
  }
  return out;
};

const rows = [];
for (const flag of TARGET_FLAGS) {
	const mine = gateOf(flag);
	const gateFiles = mine.map((g) => (g.file ? join(ROOT, g.file) : null)).filter(Boolean);
	const gateImports = gateFiles.flatMap((f) => importTargets(f));
	const gateSet = resolveOneLevel([...gateFiles.filter((f) => existsSync(f)), ...gateImports.map((t) => t.target)]);
	// 判据面 = 门的判据模块（editor/lib/core ✓）∪ 门侧共享（scripts/audit/lib ✓）
	const judgeCore = [...gateSet].filter((p) => /editor[\\/]lib[\\/]core[\\/]/.test(p));
	const shared = judgeCore.filter((p) => pageSet.has(p));
	let state = '未接线';
	if (!mine.length) state = '无对应门';                       // 该 flag 没有门 ⇒ 不是页内缺口 ✗（另一类问题 ✓）
	else if (!judgeCore.length) state = '判据自含';              // 门的判据住在门内（无 core/lib 判据件 ✓）⇒ **模块身份代理失效** ✗（要靠函数级探针 ✓）
	else if (shared.length === judgeCore.length) state = '已接线';
	else if (shared.length) state = '部分';
	rows.push({
		flag, state,
		gates: mine.map((g) => ({ file: g.file ?? '(未迁移)', flags: g.flags, owner: g.owner })),
		gateFiles: gateFiles.map(rel),
		judgeCore: judgeCore.map(rel),
		shared: shared.map((p) => {
			const direct = (pageCore.get(p) ?? []).map((e) => `${e.from}:${e.line}`);
			// 传递而来的模块（经别的 core 件 reachable ✓）⇒ 给出**传递链**（证据不能只有"传递" ✗）
			const via = direct.length ? null : [...pageCore.keys()].filter((k) => resolveOneLevel([k]).has(p)).map((k) => rel(k));
			return { module: rel(p), pageEvidence: direct, via };
		}),
		missing: judgeCore.filter((p) => !pageSet.has(p)).map(rel),
	});
}

// ── 输出（**三态** ✓ 与 report-polarity-gap 同形 ✓）──
const count = (s) => rows.filter((r) => r.state === s).length;
const wantJson = process.argv.includes('--json');
if (wantJson) {
	console.log(JSON.stringify({ slug: SLUG, scanned: { web: webFiles.length, pageCoreModules: pageCore.size }, summary: { 已接线: count('已接线'), 部分: count('部分'), 未接线: count('未接线'), 判据自含: count('判据自含'), 无对应门: count('无对应门') }, rows }, null, '\t'));
} else {
	console.log(`══ 页面侧覆盖率（车道 E · #215 (A)）══  故事「${SLUG}」· 五条门 × 模块身份级代理`);
	console.log(`  扫描面: editor/web/**（${webFiles.length} 件）＋ editor/lib/core/** ＋ scripts/audit/** ＋ stories/*/gates/**`);
	console.log(`  汇总 ⇒ 已接线 ${count('已接线')} · 部分 ${count('部分')} · 未接线 ${count('未接线')} · 判据自含 ${count('判据自含')} · 无对应门 ${count('无对应门')}（共 ${rows.length} 条 flag）`);
	console.log('');
	for (const r of rows) {
		console.log(`  ── --${r.flag} ⇒ ${r.state}`);
		console.log(`     门: ${r.gates.map((g) => `${g.file}[${(g.flags ?? []).join(',')}]`).join(' / ') || '(无)'}`);
		if (r.judgeCore.length) console.log(`     判据模块: ${r.judgeCore.join(' · ')}`);
		for (const s of r.shared) console.log(`     页内已接: ${s.module}  ← ${s.pageEvidence.length ? `证据 ${s.pageEvidence.join(', ')}` : `**传递**经 ${s.via.join('／')}（无直接 import 行 ✓ 已标 ✓）`}`);
		if (r.missing.length) console.log(`     缺口: ${r.missing.join(' · ')}`);
	}
	console.log('');
	console.log('  口径: **模块身份级代理** ✗ —— 只证"门用的判据模块，页内也 import 了"（必要不充分 ✓）；');
	console.log('        "两侧判定函数逐字同"要靠**探针**证 ✓（§17 ㉓／#908 ①）；未接线 ≠ 判据不存在 ✓。');
}
