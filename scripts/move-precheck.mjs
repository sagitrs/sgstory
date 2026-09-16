// ── 搬家的"六处同步"校验（#458）─────────────────────────────────────────────
// 背景（我实测踩过，写下来免得重踩）：一次"搬家/新增文件"要同时改**六处**，漏哪一处都有代价：
//   ① 源文件本体            ② `ORDER`（漏 ⇒ build 直接退 1："未登记/不存在"）
//   ③ `MODULES`（漏 ⇒ **崩**：`MODULES[f].deps` 取 undefined）
//   ④ `stories/*/00-story.json` 的 `files`（漏 ⇒ 审计**退 1 却没有 ✗ 行**，排查成本很高）
//   ⑤ `CONST_SECTION.files`（漏 ⇒ 报 `stale-declaration`；这是 #457 特意加的"反沉默"）
//   ⑥ **聚合返回**（`15-tables.twee` 的 `return { …, Era, … }`：把常量段挪走而不改它 ⇒ `ReferenceError`）
// ⇒ 本脚本一次跑完六处一致性；`npm test` 里挂着它，以后**新增文件**也会被它兜住。
//
// ⚠️ 与 `--literals` 的分工：那边判"常量段里有没有裸字面量"，这边判"**账本之间**是否自洽"。两者互补。
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT } from './dist-paths.mjs';
import { ORDER, MODULES, CONST_SECTION, LAYER_OF, allSourceFiles } from './module-order.mjs';

const SRC = join(ROOT, 'src');
const STORIES = join(ROOT, 'stories');

/** 磁盘上的源文件（相对 `src/`）。 */
export const diskSources = (dir = SRC) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.twee')).sort() : []);

/** 所有故事的 `files`（裸文件名集合）。 */
export const storyManifests = (dir = STORIES) => {
	const out = [];
	if (!existsSync(dir)) return out;
	for (const slug of readdirSync(dir)) {
		const p = join(dir, slug, '00-story.json');
		if (!existsSync(p)) continue;
		const j = JSON.parse(readFileSync(p, 'utf8'));
		out.push({ slug, files: j.files ?? [] });
	}
	return out;
};

/** 聚合返回里的标识符（`15-tables.twee` 的 `return { a, b, Era }`）——与同文件的本地声明对账。
 *  取**最后一个** `return {…};`：文件里其它函数也会 `return {…}`（我第一版取第一个 ⇒ 误报「total」未声明 ✗）。 */
export const aggregatorChecks = (srcText) => {
	const all = [...String(srcText).matchAll(/return\s*\{([^}]*)\}\s*;/g)];
	if (!all.length) return { found: false, missing: [] };
	const m = all[all.length - 1];
	// 实测：`return { flag, why: expr }` 里 `why` 是**键**、不是被引用的标识符 ⇒ 键不算、只查值侧。
	const returned = m[1].split(',').flatMap((part) => {
		const t = part.trim(); if (!t) return [];
		if (t.includes(':')) return [t.slice(t.indexOf(':') + 1).trim()];   // 键值对 ⇒ 只看值
		return [t];                                                          // 简写 ⇒ 自己就是被引用者
	}).filter(Boolean);
	const declared = new Set([...String(srcText).matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map((x) => x[1]));
	// 也允许 `import`/函数参数等来源：只报"既没本地声明、也不在文件里出现过赋值"的名字
	const assigned = new Set([...String(srcText).matchAll(/([A-Za-z_$][\w$]*)\s*=/g)].map((x) => x[1]));
	return { found: true, missing: returned.filter((id) => !declared.has(id) && !assigned.has(id)) };
};

/** 纯函数：六处自洽性（供自证喂合成输入）。 */
export const checkPlaces = ({ srcFiles, order, modules, manifests, constFiles, aggregatorSrc }) => {
	const out = [];
	for (const f of srcFiles) if (!order.includes(f)) out.push({ code: 'unlisted-file', msg: `src/${f} 未进 ORDER` });
	for (const f of order) if (!srcFiles.includes(f)) out.push({ code: 'missing-file', msg: `ORDER 里的 src/${f} 不存在` });
	for (const f of srcFiles) if (!(f in modules)) out.push({ code: 'missing-modules', msg: `src/${f} 未进 MODULES（漏了会崩）` });
	const claimed = new Set(manifests.flatMap((m) => m.files));
	for (const f of srcFiles) {
		if ((LAYER_OF[f] ?? 'story') === 'engine') continue;   // 引擎文件不必属于某个故事（f 是路径 ✓）
		if (!claimed.has(f)) out.push({ code: 'unclaimed-file', msg: `src/${f} 既非引擎文件、也不属于任何故事清单` });
	}
	for (const f of [...constFiles]) if (!srcFiles.some((x) => x === f || x.endsWith(`/${f}`))) out.push({ code: 'stale-const-decl', msg: `CONST_SECTION.files 里的 ${f} 不存在（搬走了没更新声明）` });
	if (aggregatorSrc) {
		const a = aggregatorChecks(aggregatorSrc);
		if (a.found) for (const id of a.missing) out.push({ code: 'aggregator-broken', msg: `聚合 return 引用了未声明的「${id}」（挪走常量段常犯）` });
	}
	return out;
};

// ── main ────────────────────────────────────────────────────────────────
const srcFiles = allSourceFiles();   // #458：dogfooding——自己的校验也走单一权威（**路径视角**，与 ORDER/清单一致）
const aggregatorPath = srcFiles.includes('15-tables.twee') ? join(SRC, '15-tables.twee') : null;
const problems = checkPlaces({
	srcFiles,
	order: ORDER,
	modules: MODULES,
	manifests: storyManifests(),
	constFiles: CONST_SECTION.files ?? [],
	aggregatorSrc: aggregatorPath ? readFileSync(aggregatorPath, 'utf8') : null,
});

// 单根假设：`scripts/**` 与 `test/**` 里写死的 `'src/…` 路径（搬家时要一起改）
const singleRoot = [];
const walk = (d) => {
	for (const e of readdirSync(d, { withFileTypes: true })) {
		const p = join(d, e.name);
		if (e.isDirectory()) { if (!/node_modules/.test(e.name)) walk(p); continue; }
		if (!e.name.endsWith('.mjs')) continue;
		const t = readFileSync(p, 'utf8');
		const hits = [...t.matchAll(/['"]src\/([A-Za-z0-9._-]+\.twee)/g)].length;
		if (hits) singleRoot.push({ file: relative(ROOT, p), hits });
	}
};
for (const d of ['scripts', 'test']) if (existsSync(join(ROOT, d))) walk(join(ROOT, d));

if (process.argv.includes('--selftest')) {
	let bad = 0;
	const t = (msg, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${msg}`); };
	const base = { srcFiles: ['a.twee'], order: ['a.twee'], modules: { 'a.twee': {} }, manifests: [{ slug: 's', files: ['a.twee'] }], constFiles: ['a.twee'], aggregatorSrc: null };
	t('正例：六处自洽 ⇒ 0 报', checkPlaces(base).length === 0);
	t('漏 ORDER ⇒ unlisted-file', checkPlaces({ ...base, order: [] }).some((x) => x.code === 'unlisted-file'));
	t('漏 MODULES ⇒ missing-modules（漏了会崩）', checkPlaces({ ...base, modules: {} }).some((x) => x.code === 'missing-modules'));
	t('ORDER 里的文件不存在 ⇒ missing-file', checkPlaces({ ...base, order: ['a.twee', 'gone.twee'] }).some((x) => x.code === 'missing-file'));
	t('故事层文件无人认领 ⇒ unclaimed-file（引擎文件豁免）', checkPlaces({ ...base, manifests: [{ slug: 's', files: [] }] }).some((x) => x.code === 'unclaimed-file'));
	t('常量声明指向不存在的文件 ⇒ stale-const-decl', checkPlaces({ ...base, constFiles: ['gone.twee'] }).some((x) => x.code === 'stale-const-decl'));
	t('聚合 return 引用未声明标识符 ⇒ aggregator-broken（挪常量段常犯）', aggregatorChecks('const Era = {}; return { Era, Gone };').missing.join() === 'Gone');
	t('聚合 return 里都是已声明的 ⇒ 空', aggregatorChecks('const Era = {}, Damage = {}; return { Era, Damage };').missing.length === 0);
	t('聚合 return 的对象**键**不算引用（`{ flag, why: obj }` ⇒ 只查 `flag` 与 `obj`）', aggregatorChecks('const flag = 1, obj = {}; return { flag, why: obj };').missing.length === 0);
	if (bad) { console.error(`\n✗ move-precheck 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ move-precheck 自证通过（六处 × 正反例 ＋ 聚合返回）');
	process.exit(0);
}

if (problems.length) {
	console.error(`✗ 六处同步校验未通过 ${problems.length} 项：`);
	for (const p of problems) console.error(`    [${p.code}] ${p.msg}`);
	process.exit(1);
}
console.log(`✔ 六处同步一致（源文件 ${srcFiles.length} · ORDER ${ORDER.length} · MODULES ${Object.keys(MODULES).length} · 故事清单 ${storyManifests().map((m) => `${m.slug}:${m.files.length}`).join('、')} · 常量声明 ${(CONST_SECTION.files ?? []).length}）`);
if (singleRoot.length) {
	console.log(`  单根假设（搬家时要一起改）：${singleRoot.map((x) => `${x.file}×${x.hits}`).join(' · ')}`);
}
