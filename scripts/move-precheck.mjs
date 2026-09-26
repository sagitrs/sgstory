// ── 搬家的"六处同步"校验（#458）─────────────────────────────────────────────
// 背景（我实测踩过，写下来免得重踩）：一次"搬家/新增文件"要同时改**六处**，漏哪一处都有代价：
// ① 源文件本体 ② `ORDER`（漏 → build 直接退 1："未登记/不存在"）
// ③ `MODULES`（漏 → **崩**：`MODULES[f].deps` 取 undefined）
// ④ `stories/*/00-story.json` 的 `files`（漏 → 审计**退 1 却没有 行**，排查成本很高）
// ⑤ `CONST_SECTION.files`（漏 → 报 `stale-declaration`；这是 #457 特意加的"反沉默"）
// ⑥ **聚合返回**（`15-tables.twee` 的 `return { …, Era, …}`：把常量段挪走而不改它 → `ReferenceError`）
// → 本脚本一次跑完六处一致性；`npm test` 里挂着它，以后**新增文件**也会被它兜住。
//
//注意：与 `--literals` 的分工：那边判"常量段里有没有裸字面量"，这边判"**账本之间**是否自洽"。两者互补。
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, STORIES_DIR } from './dist-paths.mjs';
import { ORDER, MODULES, CONST_SECTION, allSourceFiles, storyManifests, checkRegistration, storyTablesOrderProblems, deriveStoryTableConsumers } from './module-order.mjs';

const SRC = join(ROOT, 'src');
// `#1267` 故事根口：与构建/audit 同根（受 `SG_STORIES_DIR` 控制）。
const STORIES = STORIES_DIR;

/** 磁盘上的源文件（相对 `src/`）。 */
export const diskSources = (dir = SRC) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.twee')).sort() : []);

/** 所有故事的 `files` —— **已归单一权威**（`module-order.mjs` 的 `storyManifests()`）。
 * `#893` 第三步：`build.mjs`／`test/layering.mjs`／本脚本**三处共用**（各写一份必漂移）。
 * 本处不再自定义，只作**转出**（老调用方不变；出参字段 `slug`／`files` 逐字相同）。 */
export { storyManifests };

/** 聚合返回里的标识符（`15-tables.twee` 的 `return { a, b, Era}`）——与同文件的本地声明对账。
 * 取**最后一个** `return {…};`：文件里其它函数也会 `return {…}`（我第一版取第一个 → 误报「total」未声明）。 */
export const aggregatorChecks = (srcText) => {
	const all = [...String(srcText).matchAll(/return\s*\{([^}]*)\}\s*;/g)];
	if (!all.length) return { found: false, missing: [] };
	const m = all[all.length - 1];
	// 实测：`return { flag, why: expr}` 里 `why` 是**键**、不是被引用的标识符 → 键不算、只查值侧。
	const returned = m[1].split(',').flatMap((part) => {
		const t = part.trim(); if (!t) return [];
		if (t.includes(':')) return [t.slice(t.indexOf(':') + 1).trim()];   // 键值对 → 只看值
		return [t];                                                          // 简写 → 自己就是被引用者
	}).filter(Boolean);
	const declared = new Set([...String(srcText).matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map((x) => x[1]));
	// 也允许 `import`/函数参数等来源：只报"既没本地声明、也不在文件里出现过赋值"的名字
	const assigned = new Set([...String(srcText).matchAll(/([A-Za-z_$][\w$]*)\s*=/g)].map((x) => x[1]));
	return { found: true, missing: returned.filter((id) => !declared.has(id) && !assigned.has(id)) };
};

/** 纯函数：六处自洽性（供自证喂合成输入）。
 * `#893` 第三步：`②③④` 按**层**分工（引擎件 → `ORDER` ⧸ `MODULES`；故事件 → **它自己的清单**）——
 * 走单一权威 `checkRegistration()`；与 `test/layering.mjs` 的**唯一区别**：这里 `requireModules: true`
 *（`MODULES` 缺项是"账本不自洽"，属本脚本的六处同步面）。 */
export const checkPlaces = ({ srcFiles, srcContents = null, order, modules, manifests, constFiles, aggregatorSrc, consumer, exists = null }) => {
	const out = [...checkRegistration({ sources: Object.fromEntries(srcFiles.map((f) => [f, ''])), order, modules, manifests, requireModules: true, ...(exists ? { exists } : {}) })];
	// `#1002`：**故事声明面必须排在消费它的引擎件之前** —— `checkRegistration()` 管不到这一格
	//（`#998` 实测：漏排 → 故事表盖掉引擎挂在 `Game.*` 上的方法 → 门 TypeError → 后面的故事面全没跑）
	// `#1220`：把**内容**喂给派生（原先只传名字加空串 → 派生会扫空）
	// `#1267` ③：透传 `consumer`（调用方可显式指定消费点 → 才能构造"**同层**消费点在表之前"的能假格）。
	out.push(...storyTablesOrderProblems({ order, manifests, ...(consumer ? { consumer } : {}), ...(srcContents ? { sources: srcContents } : {}) }));
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
// `#1220` 反向核：派生出的消费件数**钉死**（引擎侧增删赋值件时同片更新这个数）——防"扫描抽空 → 判据静默变松"
// `#1437`（D 块分家）：引擎**新增一件** `src/engine/40-sim/05-decl.twee`（故事声明公共门面）⇒ 本数 **11 ⇒ 12** ✓
//   ★本条正是那颗「引擎侧增删赋值件 ⇒ 同片更新本数」的钉 ⇒ ✗ 不是改松判据，而是**照它的要求**更新（同片 ✓）。
const EXPECTED_CONSUMERS = 12;
const derivedCount = deriveStoryTableConsumers({ sources: Object.fromEntries(srcFiles.map((f) => { try { return [f, readFileSync(f, 'utf8')]; } catch { return [f, '']; } })) }).length;
if (derivedCount !== EXPECTED_CONSUMERS) {
	console.error(`✗ 消费侧派生件数 ${derivedCount} ≠ 钉死值 ${EXPECTED_CONSUMERS} ⇒ 引擎侧增删了赋值件：同片更新本数（判据不能静默变松）`);
	process.exit(1);
}
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
	const base = { srcFiles: ['src/a.twee'], order: ['src/a.twee'], modules: { 'src/a.twee': { layer: 'engine' } }, manifests: [{ slug: 's', files: [] }], constFiles: ['src/a.twee'], aggregatorSrc: null };
	t('正例：六处自洽 ⇒ 0 报', checkPlaces(base).length === 0);
	t('**引擎件**漏 ORDER ⇒ unlisted-file（安全网不撤）', checkPlaces({ ...base, order: [] }).some((x) => x.code === 'unlisted-file'));
	t('**引擎件**漏 MODULES ⇒ missing-modules', checkPlaces({ ...base, modules: {} }).some((x) => x.code === 'missing-modules'));
	t('ORDER 里的文件不存在 ⇒ missing-file', checkPlaces({ ...base, order: ['src/a.twee', 'src/gone.twee'] }).some((x) => x.code === 'missing-file'));
	t('**故事件**无人认领 ⇒ unclaimed-file（引擎件豁免）', checkPlaces({ ...base, srcFiles: ['stories/s/x.twee'], order: [], modules: {}, manifests: [{ slug: 's', files: [] }], constFiles: [] }).some((x) => x.code === 'unclaimed-file'));
	t('**故事件**不在 ORDER、但在清单里 ⇒ 0 报（#893 新口径：换登记处 ✓）', checkPlaces({ ...base, srcFiles: ['stories/s/a.twee'], order: [], modules: {}, manifests: [{ slug: 's', files: ['stories/s/a.twee'] }], constFiles: [] }).length === 0);
	t('**引擎件**即使被清单认领，仍必须 ⊂ ORDER ⇒ unlisted-file（安全网不撤）', checkPlaces({ ...base, order: [], manifests: [{ slug: 's', files: ['src/a.twee'] }] }).some((x) => x.code === 'unlisted-file'));
	// `#1002`：**故事声明面必须排在消费它的引擎件之前**（`#998` 实测出来的洞）
	const TBL = 'stories/s/15-tables.twee';
	const CONS = 'src/engine/40-sim/21-resolve.twee';
	const withStory = { ...base, srcFiles: [TBL], order: [TBL, CONS], modules: { [CONS]: { layer: 'engine' } }, manifests: [{ slug: 's', files: [TBL] }], constFiles: [] };
	t('正例：故事表排在消费侧**之前** ⇒ 0 报 ✓', checkPlaces(withStory).filter((x) => x.code.startsWith('tables-')).length === 0);
	// `#1267` 尾件③（裁定甲）：生效加载序 = 引擎 ORDER ∪ 该故事清单 → **清单里的件必在序中**，
	// 故原"不在 ORDER → tables-not-in-order"失去对象（`#893` 起故事件登记在自己的清单）。
	// 新语义下该 code 管的是"**既不在 ORDER、也不在该故事清单**"→ 用"清单里没有这张表"表达。
	t('🔴 反例：该故事清单里没有这张表（且不在 ORDER）⇒ 不判该面（本格管的就是一个面 ✓）',
		checkPlaces({ ...withStory, manifests: [{ slug: 's', files: ['stories/s/10-x.twee'] }] })
			.filter((x) => x.code.startsWith('tables-')).length === 0);
	// `#1267` ③（裁定甲）：**跨层不再要求先后** —— 引擎消费者按生效序在故事件之前，而现有实测
	// 证明消费者工作在"故事表按清单序后到"之下（**前提已显式写出**，见 `module-order.mjs` 的
	// `storyTablesOrderProblems` 注释）→ 本格改为**验跨层不报**。
	t('跨层（引擎消费点 vs 故事表）⇒ **不再要求先后**、0 报（前提：消费者容忍后到的故事表）',
		checkPlaces({ ...withStory, order: [CONS, TBL] }).filter((x) => x.code.startsWith('tables-')).length === 0);
	//   **能假格（同层）**：同故事里消费件排在表**之前**（生效序里）→ **必须红**。
	t('🔴 能假（同层）：同故事的消费件排在表之前 ⇒ tables-after-consumer ✗',
		// 同层场景：**两者都不在 ORDER**（引擎 ORDER 只管引擎件）→ 生效序由**清单序**决定 →
		// 消费件在清单里排前面 → 表在后 → 必须红。
		checkPlaces({ ...withStory, srcFiles: ['stories/s/10-cons.twee', TBL], order: [CONS],
			manifests: [{ slug: 's', files: ['stories/s/10-cons.twee', TBL] }],
			consumer: 'stories/s/10-cons.twee' }).some((x) => x.code === 'tables-after-consumer'));
	t('边界：清单里**没有** `15-tables` 面 ⇒ 不判（这格管的是那一个面 ✓）', checkPlaces({ ...base, manifests: [{ slug: 's', files: [] }] }).filter((x) => x.code.startsWith('tables-')).length === 0);
	// `#1271`：**报文须与事实相符** —— 两支能假（同一输入只改"磁盘在不在"）
	{
		const b = { ...base, manifests: [{ slug: 's', files: ['stories/s/data/tables.json'] }] };
		t('🔴 `#1271` ①：清单列了**磁盘存在**但不属自动发现面的件 ⇒ 报「不应列入清单」（不是"缺件"）',
			checkPlaces({ ...b, exists: () => true }).some((x) => x.code === 'manifest-should-not-list'));
		t('🔴 `#1271` ②：清单列了**磁盘不存在**的件 ⇒ 仍报「缺件（改名或删除）」（真守卫保留）',
			checkPlaces({ ...b, exists: () => false }).some((x) => x.code === 'missing-manifest-file'));
	}

	// `#1220`：消费侧改**派生**后的三格（能假／出声／反向核件数）
	const SOCIAL = 'src/engine/40-sim/32-social.twee';
	const synthContents = { [SOCIAL]: 'Object.assign((window.Game.Social ??= {}), {' };
	const derived = { ...withStory, srcFiles: [TBL, SOCIAL], order: [TBL, CONS, SOCIAL], modules: { [CONS]: { layer: 'engine' }, [SOCIAL]: { layer: 'engine' } }, srcContents: synthContents };
	t('派生正例：表在**全体**消费件（含派生的那件）之前 ⇒ 0 报 ✓',
		checkPlaces(derived).filter((x) => x.code.startsWith('tables-')).length === 0);
	// `#1267` ③：同上 —— 派生的消费件也在**引擎层** → 跨层不要求先后。
	// 该格保留"派生面仍能被算出来"的意义（改验：派生的消费件在生效序里靠后 → 仍 0 报）。
	t('派生跨层：表排在派生的消费件之后 ⇒ 0 报（跨层不要求先后；前提同上）',
		checkPlaces({ ...derived, order: [CONS, SOCIAL, TBL] }).filter((x) => x.code.startsWith('tables-')).length === 0);
	t('🔴 派生不到 ⇒ 出声 consumer-underivable（不静默退回旧默认 ✗）',
		checkPlaces({ ...derived, srcContents: {} }).some((x) => x.code === 'consumer-underivable'));
	t('常量声明指向不存在的文件 ⇒ stale-const-decl', checkPlaces({ ...base, constFiles: ['gone.twee'] }).some((x) => x.code === 'stale-const-decl'));
	// `#899` ①：清单**显式必需** —— 不传 → **点名抛错**（合成输入不得读盘）
	t('缺 `manifests` ⇒ 点名抛错（不读盘 ✗）', (() => {
		try { checkPlaces({ ...base, manifests: undefined }); return false; }
		catch (e) { return /manifests/.test(String(e.message)); }
	})());
	t('聚合 return 引用未声明标识符 ⇒ aggregator-broken（挪常量段常犯）', aggregatorChecks('const Era = {}; return { Era, Gone };').missing.join() === 'Gone');
	t('聚合 return 里都是已声明的 ⇒ 空', aggregatorChecks('const Era = {}, Damage = {}; return { Era, Damage };').missing.length === 0);
	t('聚合 return 的对象**键**不算引用（`{ flag, why: obj }` ⇒ 只查 `flag` 与 `obj`）', aggregatorChecks('const flag = 1, obj = {}; return { flag, why: obj };').missing.length === 0);
	if (bad) { console.error(`\n✗ move-precheck 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ move-precheck 自证通过（六处 × 正反例 ＋ 两层登记（#893）＋ 聚合返回）');
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
