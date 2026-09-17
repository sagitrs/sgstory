// K4 门（`#762` 车道 C）：**生成物标记 · 产物新鲜度 · 逃生舱可枚举**
//
// 为什么需要它（设计稿 §3 的 K4 判据）：D2 把 twee 定为**产物**（源是 `stories/<slug>/data/*.json`）⇒
//   "产物"这个身份必须**机械可判**，否则它只是注释里的一句话：
//     ① **标记**：每个生成物首部必须有 `@generated`（谁生成、源在哪）；
//     ② **新鲜度**：拿 `data/` 重编一次，产物必须**逐字节相同**（＝"带标记的文件确实由某 `data/` 产出"，
//        手改产物 = 下次编译被覆盖 ⇒ 这条会红）；
//     ③ **逃生舱可枚举**：契约分类器（`editor/classify-contract.mjs`）判为 **C 桶**（含任意逻辑）的成员
//        必须在 `editor/escape-hatch.json` 里**逐条登记**（理由 ＋ 票号）；**清单外出现即红**，
//        **清单里腐烂（已不是 C 桶）也红** ⇒ 例外是"可枚举的"，不是"随手加的"。
//
// 口径（避免假红／假绿）：
//   · 本门**自己跑编译器**（不读工作区里可能陈旧的 `build/generated/`）⇒ 判的永远是"当前 data 的产物"；
//   · 只对**有 `data/` 的故事**判（没有 data 的故事＝还没数据化 ⇒ 跳过，不假装判过）；
//   · 分类器把"形状能看懂、但现有 kind 缺字段"判成 **B**（需声明式扩展）⇒ **不算逃生舱**；
//     只有"含任意逻辑、要么下沉引擎要么登记"的才是 **C** ✓。
//
// 用法：node editor/k4.mjs [--selfcheck]（用 `--selfcheck` 而不是 `--selftest`：见下方守卫缺口说明）

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// ⚠️ **自证旗标用 `--selfcheck` 而不是 `--selftest`**：这是**防御性**设计，不是绕坑 —— 本门最初观察到
//   "`<某门> --selftest` 被 import 的模块劫持"（被测模块的 `--selftest` 派发当时**没有 `isMain` 守卫**，
//   会跑自己的自证并 `process.exit`）。**该缺口后来已修**：`compile-story.mjs` 在 `#769` 里补了守卫，
//   `classify-contract.mjs` 在 `#772` 里也守住了（复现：两者同时 import 且 argv 含 `--selftest` ⇒ 无劫持 ✓）。
//   ⇒ 本门**仍保留独立旗标**：多一层防御不吃亏，且将来任一门再犯这族错时不会连带把本门自证吃掉。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';

// ⚠️ **守卫（防 import 副作用）**：被 import 时**只导出判据函数**，不跑门。
//   为什么必要：`commands.mjs` 起会逐个 import 命令体 ⇒ 若无守卫，**每次 `cli.mjs build` 都会跑一遍 K4 门**
//   （实测 0.22s ＋ 1592B 输出）⇒ 而且门红时 `process.exit(1)` 会**劫持导入方**。
//   形状照既有三例（`cli.mjs` / `extract-story.mjs` / `k6.mjs`）：**imports 之后、逻辑之前**（放后面 TDZ —— 踩过）；
//   主跑与自证**两条分支都要**。自证口径：`node --input-type=module -e "await import('<abs>')"` ⇒ **rc=0 ＋ 0 字节**。
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
// **显式降级**：契约分类器（`editor/classify-contract.mjs`，PR `#772`）尚未落地时，逃生舱那条判据**不静默跳过**
//   —— 打印一行"未接线"，其余判据（标记／新鲜度）照跑 ⇒ 本门可以先合、`#772` 落地后自动生效。
let classify = null, contractMembers = null;
try {
	const k = await import('./classify-contract.mjs');
	classify = k.classify; contractMembers = k.contractMembers;
} catch { classify = null; }

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let bad = 0;
const ok = (label, cond, extra = '') => {
	if (cond) console.log(`  ✓ ${label}`);
	else { bad++; console.error(`  ✗ ${label}${extra ? '：' + extra : ''}`); }
};

export const MARKER = '@generated';
// hasMarker：**行首的注释行**才算标记（不锚定会把「注释里提到这个词」的文件误判成产物）——
// 实测踩到：手写逃生舱文件的注释写了「本文件不带该标记」⇒ 被排除出手写源 ⇒ 分类器看不见它的成员 ⇒ 门报「登记腐烂」的假红。
// （写法上避开：注释里不要写出「星号紧跟斜杠」的字符对 —— 那会提前终结块注释 ✗，实测把整个文件炸成 SyntaxError。）
export const hasMarker = (text) => /^\s*\/\/\s*@generated\b/m.test(String(text ?? ''));

/** 纯函数①：**带标记**判据 —— 生成物首部必须有 `@generated`（含源路径）。 */
export const markerProblems = (files) => {
	const out = [];
	for (const f of files ?? []) {
		if (!String(f.text ?? '').includes(MARKER)) out.push({ path: f.path, why: `生成物没有 \`${MARKER}\` 标记（谁生成、源在哪都看不出来）` });
	}
	return out;
};

/**
 * 纯函数④：**生成物不许独改**（K4-④）—— 迁移期的"两处真相"守卫。
 *
 * 背景：D2 把 twee 定为**产物**、`data/*.json` 为源 ⇒ 一旦某故事"翻面"，工作区里的 twee 只是**投影**。
 * 但"翻面"这个动作本身会制造**两处真相**：有人直接改 tracked 的 twee（看起来跑得通、`equiv` 也可能因为
 * 改了源而变绿），而 `data/` 没动 ⇒ **下次重编就被覆盖**，或更坏：漂移悄悄留着。
 *
 * 判据（**字节面**，不用分类器桶 —— 值 vs 源码那类坑桶分类看不出来）：
 *   对故事目录里**带 `@generated`** 的 tracked `*.twee`，
 *   ① 编译器必须**仍产出同名文件**（否则来源已断 ⇒ 自称产物却没人再生成它）；
 *   ② 其字节必须等于**当场从 `data/` 重编**的产物（否则＝改了产物没改源）。
 * 天然棘轮：**只对带标记的文件生效** ⇒ 手写故事零影响，某文件一旦开始生成就不许再手改。
 * `marks === 0` ⇒ 调用方**必须留痕打印**（"尚未翻面"是**状态**，不是"没问题"）。
 */
export const staleTrackedProblems = (tracked, out) => {
	const marks = tracked.filter(([path, text]) => path.endsWith('.twee') && hasMarker(text));
	const problems = [];
	for (const [path, text] of marks) {
		const base = path.split('/').pop();
		if (!(base in out)) { problems.push({ path, why: '自带 `@generated` 却**无同名产物**（来源已断：没人再从 `data/` 生成它）' }); continue; }
		if (text !== out[base]) problems.push({ path, why: '与**当场从 `data/` 重编**的产物**不一致** ⇒ 有人改了 tracked 的生成物而没改 `data/`（两处真相）' });
	}
	return { marks: marks.length, problems };
};

/**
 * 纯函数③前置：**手写契约源** = 故事目录里所有 `*.twee` 中**不带 `@generated`** 的那些。
 * 为什么按这个口径：分类器判的是"故事**今天声明**的契约形状"——
 *   · 未数据化：契约就在手写 twee 里 ⇒ 分类它 ✓；
 *   · 已数据化：那些 twee 是**产物** ⇒ 分类它们会得到**假欠账**（实测：发射后的 `template` 被判 B，
 *     可它在数据侧是**已支持的 kind**）⇒ 必须排除；数据化故事的逃生舱由编译器的 kind 白名单把关。
 * ⇒ 于是"某故事全部 twee 都是产物"＝**契约已无手写源**，C 桶结构性为 0（留痕打印，不静默）。
 */
export const contractSourceText = (files) => {
	const twee = files.filter(([name]) => name.endsWith('.twee'));
	const hand = twee.filter(([, text]) => !hasMarker(text));
	return { text: hand.map(([, t]) => t).join('\n'), handCount: hand.length, markedTwee: twee.length - hand.length, otherCount: files.length - twee.length };
};

/** 纯函数②：**新鲜度**判据 —— 同一份 data 编两次必须逐字节相同（手改产物会在下一次编译被覆盖 ⇒ 这里红）。 */
export const freshnessProblems = (a, b) => {
	const out = [];
	const names = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
	for (const n of names) {
		if ((a?.[n] ?? null) === null) out.push({ path: n, why: '第二次编译没有产出这个文件（产物集合不稳定）' });
		else if (a[n] !== b[n]) out.push({ path: n, why: '两次编译产物不同（不幂等）' });
	}
	return out;
};

/** 纯函数③：**逃生舱可枚举**判据（双向）——
 *  `classified` ＝ 分类器输出（`[{name, bucket, src}]`）· `registry.hatches` ＝ 登记表。 */
export const escapeHatchProblems = (classified, registry, slug = null) => {
	const out = [];
	// **按故事**过滤（登记表是跨故事的 ⇒ 不按 slug 过滤会把别的故事的登记误判成"腐烂"）
	const rows = (registry?.hatches ?? []).filter((h) => (slug == null ? true : h.slug === slug));
	const cBucket = (classified ?? []).filter((m) => m.bucket === 'C').map((m) => m.name).sort();
	const listed = [...new Set(rows.map((h) => h.member))].sort();
	for (const n of cBucket) if (!listed.includes(n)) out.push({ member: n, why: '分类器判为 **C 桶**（含任意逻辑）却没登记 ⇒ 逃生舱必须**可枚举**（补 `editor/escape-hatch.json`：理由 ＋ 票号）' });
	for (const n of listed) if (!cBucket.includes(n)) out.push({ member: n, why: '登记为逃生舱，但分类器**已不把它判为 C 桶**（很可能已被声明式 kind 覆盖）⇒ 删掉这条登记（清单要收缩，不许长期挂账）' });
	// 登记条目自身必须带理由与票号（形式约束）
	for (const h of rows) {
		if (!h.reason || !h.ticket) out.push({ member: h.member, why: '登记条目缺 `reason`／`ticket`（例外必须可追）' });
	}
	return out;
};

if (isMain && process.argv.includes('--selfcheck')) {
	const cases = [
		['正例①：生成物带标记 ⇒ 不报', markerProblems([{ path: 'a', text: `:: X [script]\n// ${MARKER} by y（源：z）` }]).length === 0],
		['🔴 反例①：生成物没标记 ⇒ 报', markerProblems([{ path: 'a', text: ':: X [script]' }]).length === 1],
		['正例②：两次编译逐字节相同 ⇒ 不报', freshnessProblems({ a: 'x' }, { a: 'x' }).length === 0],
		['🔴 反例②：两次不同 ⇒ 报（不幂等 ⇒ 手改会被覆盖/工作区常脏）', freshnessProblems({ a: 'x' }, { a: 'y' }).length === 1],
		['正例③：C 桶已登记且带理由票号 ⇒ 不报', escapeHatchProblems([{ name: 'lootText', bucket: 'C' }], { hatches: [{ member: 'lootText', reason: 'r', ticket: '#736' }] }).length === 0],
		['🔴 反例③：C 桶没登记 ⇒ 报（清单外出现）', escapeHatchProblems([{ name: 'x', bucket: 'C' }], { hatches: [] }).length === 1],
		['🔴 反例③：登记腐烂（已不是 C 桶）⇒ 报（清单要收缩）', escapeHatchProblems([{ name: 'x', bucket: 'A' }], { hatches: [{ member: 'x', reason: 'r', ticket: '#1' }] }).length === 1],
		['🔴 反例③：登记缺理由/票号 ⇒ 报', escapeHatchProblems([{ name: 'x', bucket: 'C' }], { hatches: [{ member: 'x' }] }).length === 1],
		['边界③：B 桶（需声明式扩展）**不算**逃生舱 ⇒ 不报', escapeHatchProblems([{ name: 'x', bucket: 'B' }], { hatches: [] }).length === 0],
		['边界③：登记表按**故事**过滤（别的故事的登记不算腐烂）', escapeHatchProblems([{ name: 'x', bucket: 'A' }], { hatches: [{ member: 'x', slug: 'other', reason: 'r', ticket: '#1' }] }, 'mine').length === 0],
		['边界③前置：手写契约源**排除产物**（带 `@generated` 的 twee 不算源）', contractSourceText([['a.twee', ':: X\n// @generated by y'], ['b.twee', ':: Y'], ['c.json', '{}']]).handCount === 1],
		['🔴 反例③前置：**行内**提到 `@generated`（不在行首）⇒ **仍算手写源**（锚定：锚定错了会把逃生舱文件整个排除 ⇒ 门假红）', contractSourceText([['a.twee', ':: X [script]\n// 本文件不带 @generated ⇒ 它是手写件\nObject.assign({}, {})']]).handCount === 1],
		['边界③前置：全是产物 ⇒ 手写源为空（C 桶结构性为 0，不静默）', contractSourceText([['a.twee', '// @generated']]).handCount === 0],
		['边界③前置：非 `.twee` 文件不计入手写源', contractSourceText([['d.md', 'hello']]).handCount === 0],
		['正例④：带标记的 tracked 文件与产物**逐字节相同** ⇒ 不报', staleTrackedProblems([['stories/s/15-tables.twee', 'x\n// @generated by c']], { '15-tables.twee': 'x\n// @generated by c' }).problems.length === 0],
		['🔴 反例④：带标记但**与重编产物不一致** ⇒ 报（两处真相）', staleTrackedProblems([['stories/s/15-tables.twee', 'x\n// @generated']], { '15-tables.twee': 'y\n// @generated' }).problems.length === 1],
		['🔴 反例④：带标记却**没有同名产物** ⇒ 报（来源已断）', staleTrackedProblems([['stories/s/15-tables.twee', '// @generated']], { '其它.twee': 'x' }).problems.length === 1],
		['边界④：**不带标记**的手写文件 ⇒ 不报（天然棘轮：手写故事零影响）', staleTrackedProblems([['stories/s/15-tables.twee', '手写']], { '15-tables.twee': '别的' }).problems.length === 0],
		['边界④：非 `.twee`（如产物 `audit.json`）⇒ 不报（本判据只管编译器产出的 twee）', staleTrackedProblems([['stories/s/audit.json', '// @generated']], {}).problems.length === 0],
	];
	for (const [label, cond] of cases) { if (cond) console.log(`  ✓ 自证·${label}`); else { bad++; console.error(`  ✗ 自证·${label}`); } }
	if (bad) { console.error(`\n✗ 自证未通过（${bad} 项）`); process.exit(1); }
	console.log('\n✔ 自证通过（17 条：标记 2 ＋ 新鲜度 2 ＋ 逃生舱双向 5 ＋ 手写源口径 3 ＋ 生成物不许独改 5）');
	process.exit(0);
}

if (isMain) {
// 主跑包一对括号即可 —— 刻意不重排缩进：让本次 diff 只含守卫本身，便于逐字节复核。
console.log('══ K4 门（`#762` 车道 C）—— 生成物标记 · 新鲜度 · 逃生舱可枚举 ══');
{
	const storiesDir = join(ROOT, 'stories');
	// 判**所有故事目录**（不是只有 `data/` 的）：③ 逃生舱判据不依赖 `data/` —— 上一版按 `data/` 取故事，
	// 结果洞窟（缺 `contract.json`）**整段被跳过** ⇒ 它的 C 桶（`eventPool`）根本没人查 ✗。
	// 这正是 `#777` 修的那族错（"读不到输入却当成没有"）——我自己的门也犯了一次。
	const slugs = readdirSync(storiesDir).filter((s) => statSync(join(storiesDir, s)).isDirectory() && !s.startsWith('.'));
	ok('取到故事目录', slugs.length > 0, slugs.join('、'));
	ok('其中至少一个已数据化（有 `data/` 才算，未数据化的 ①/② 不假装判过）', slugs.some((s) => existsSync(join(storiesDir, s, 'data'))), slugs.filter((s) => existsSync(join(storiesDir, s, 'data'))).join('、'));
	if (!slugs.length) { console.error('  ✗ 没有可判的故事 —— 不静默判过'); process.exit(1); }

	const registryPath = join(ROOT, 'editor', 'escape-hatch.json');
	ok('逃生舱登记表存在（`editor/escape-hatch.json`）', existsSync(registryPath), registryPath);
	const registry = existsSync(registryPath) ? JSON.parse(readFileSync(registryPath, 'utf8')) : { hatches: [] };

	for (const slug of slugs) {
		const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
		const dataDir = join(storiesDir, slug, 'data');
		const tablesPath = join(dataDir, 'tables.json');
		const contractPath = join(dataDir, 'contract.json');
		const dataReady = existsSync(tablesPath) && existsSync(contractPath);
		if (!dataReady) console.log(`  · ${slug}：data/ 不全（缺 tables/contract）⇒ 只有 ①/② 跳过；**③ 逃生舱判据照跑**（它不依赖 data/）`);

		// ①＋② 标记与新鲜度：**自己跑编译器**两次（不读工作区里可能陈旧的 `build/generated/`）
		//    ⚠️ 走 CLI 而不是 API：编译器的内部形状会变（`#769` 把 `compile` 改成 `compileStory` 并且改成**写文件**），
		//    而 CLI（`<slug> --out=<dir>`）是它对外的稳定面 ⇒ 门对内部重构免疫。
		const runCompile = () => {
			const dir = mkdtempSync(join(tmpdir(), 'k4-'));
			execFileSync('node', [join(ROOT, 'editor', 'compile-story.mjs'), slug, `--out=${dir}`], { cwd: ROOT, stdio: 'pipe' });
			const out = {};
			for (const f of readdirSync(dir)) out[f] = readFileSync(join(dir, f), 'utf8');
			rmSync(dir, { recursive: true, force: true });
			return out;
		};
		let fresh = {};
		if (dataReady) {
			const a = runCompile(), b = runCompile();
			fresh = a;
			for (const p of markerProblems(Object.entries(a).map(([path, text]) => ({ path: `${slug}/${path}`, text })))) { console.error(`  ✗ ${p.path}：${p.why}`); bad++; }
			for (const p of freshnessProblems(a, b)) { console.error(`  ✗ ${slug} ${p.path}：${p.why}`); bad++; }
		}

		// ④ **生成物不许独改**（K4-④）：迁移期的"两处真相"守卫 —— 带 `@generated` 的 tracked twee 必须等于当场重编的字节。
		//    只对**带标记**的文件生效（天然棘轮）；未翻面时**留痕打印**（"尚未翻面"是状态，不是"没问题"）。
		const trackedFiles = execFileSync('git', ['ls-files', `stories/${slug}`], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
			.map((rel) => [rel, readFileSync(join(ROOT, rel), 'utf8')]);
		const { marks, problems: staleProblems } = staleTrackedProblems(trackedFiles, fresh);
		if (!marks) console.log(`  · ${slug}：**尚未翻面**（0 个带 \`@generated\` 的 tracked twee）⇒ K4-④ 本次无可判对象（这是**状态**，不是"没问题"）`);
		else console.log(`  · ${slug}：K4-④ 已翻面文件 ${marks} 个 ⇒ 与当场重编产物逐字节比对`);
		for (const prob of staleProblems) { console.error(`  ✗ ${prob.path}：${prob.why}`); bad++; }

		// ③ 逃生舱：分类器（**真源**：逐成员分类 —— `classify()` 吃的是**单个成员的源码**）vs 登记表
		//    ⚠️ 判的是**手写契约源**（见 `contractSourceText`）：已数据化故事的 twee 是**产物**，
		//    分类产物会得到**假欠账**（实测：发射后的 `template` 被判 B，而它在数据侧是已支持的 kind）。
		if (!classify) { console.log(`  · ${slug}：契约分类器未接线（editor/classify-contract.mjs 未落地，PR #772）⇒ **逃生舱判据本次跳过**（不静默：这行就是留痕）`); continue; }
		const storyDir = join(storiesDir, slug);
		const { text: srcText, handCount, markedTwee } = contractSourceText(readdirSync(storyDir).filter((f) => statSync(join(storyDir, f)).isFile()).map((f) => [f, readFileSync(join(storyDir, f), 'utf8')]));
		const classified = contractMembers(srcText).map((m) => ({ name: m.name, src: m.src, bucket: classify(m.src).bucket }));
		// 契约已全部由 `data/` 产出（手写侧只剩非契约文件）⇒ 逃生舱由编译器 kind 白名单把关
		const noHandContract = classified.length === 0;
		if (noHandContract && markedTwee > 0) console.log(`  · ${slug}：契约**已全部由 data/ 产出**（带标记 twee ${markedTwee} 个，手写侧剩 ${handCount} 个非契约文件）⇒ C 桶结构性为 0`);
		// **取不到输入就不许判过**（`#777` 那族错：分类器曾只扫首个 `Sg.story` 块 ⇒ 少 8 名成员却“静默地没问题”）。
		// 手写源非空却一个成员都找不到 ⇒ 只能是我读错了位置（或契约换了写法）⇒ 判红，不静默。
		if (noHandContract && markedTwee === 0) { console.error(`  ✗ ${slug}：手写契约源非空（${handCount} 文件）却分类出 **0 名成员**、且没有任何带标记的产物 ⇒ 判据失效（不是通过）`); bad++; continue; }
		for (const p of escapeHatchProblems(classified, registry, slug)) { console.error(`  ✗ ${slug}【${p.member}】${p.why}`); bad++; }
		const buckets = classified.reduce((acc, m) => { acc[m.bucket] = (acc[m.bucket] ?? 0) + 1; return acc; }, {});
		console.log(`  · ${slug}：契约源 ${srcText.length}B（手写 twee ${handCount}／带标记 twee ${markedTwee}）· ${dataReady ? '标记 ✓ · 幂等 ✓ · ' : '①/② 跳过（无 data/）· '}分类 A${buckets.A ?? 0}/B${buckets.B ?? 0}/C${buckets.C ?? 0}/D${buckets.D ?? 0}`);
		// **欠账实测打印**（不写进数据文件、不手写数字 ⇒ 不会腐烂）：B ＝ 待补声明式 kind，D ＝ 待下沉引擎能力。
		// 为什么要打出来：`escape-hatch.json` 只登记 **C**（真逃生舱）；B/D 是"排期欠账"而不是"表达不了"，
		// 但**不写出来就会被读成"清单空 ⇒ 没欠账"**（这两类只是不进棘轮，不是不存在）。
		const names = (b) => classified.filter((m) => m.bucket === b).map((m) => m.name).join('、') || '（无）';
		console.log(`      欠账（B 待补 kind）：${names('B')}`);
		console.log(`      欠账（D 待下沉引擎）：${names('D')}`);
	}
}
if (bad) {
	console.error(`\n✗ K4 门未通过（${bad} 项）—— 产物必须有标记、必须新鲜、逃生舱必须可枚举。`);
	process.exit(1);
}
console.log('\n✔ K4 门通过（标记 · 幂等/新鲜度 · 逃生舱登记双向一致 · 生成物不许独改）');
}
