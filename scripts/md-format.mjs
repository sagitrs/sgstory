// ── 文档格式门（`#603`）：`*.md` 的围栏必须配对、标题不许落在代码块里 ──────────────
//
// 背景（操作者："README 完全不可读"，实测**属实**）：
//   `README.md` 第 57 行有一个**多余的** ``` （`git blame` ⇒ 初版 `974605d` 就在），
//   于是从那里起**开/闭角色整体错位一位** —— 后面每个"开围栏"实际在**关闭**、每个"闭围栏"实际在**开启**
//   ⇒ 四个标题（`## 知识模型`／`## 工程约定`／`## 目录结构`／`## Twee 语法速查`）在 GitHub 上
//   被渲染成**代码块里的字面量**（不是节！），而本该是代码的目录树／示意图反而被当成普通正文。
//   人眼在编辑器里看不出来（源码"看着挺整齐"）——**只有渲染才暴露**，所以必须有门。
//
// 为什么此前零机检：L0 `test/integrity.mjs` 扫 `src/*.twee`；`--text --craft` 扫叙事文本；
// `docs/**` 与 `README.md` 从来没有格式门（全仓 34 个 md，正是这一个破了）。
//
// 判据（纯函数，自带自证；**失败计入退出码**）：
//   F1「围栏配对」：每个 `*.md` 的围栏总数为**偶数**。
//   F2「标题不在块内」：逐行模拟 GitHub 的围栏状态机（每个围栏行翻转一次），
//       任何 `#…` 标题出现在**块内** ⇒ 判红，并**点名文件与行号**。
//   F3「围栏行不被当作正文标签」：围栏行的语言串里不许再混 `` ` ``（防"```` ```js ``` ``"这类的成因复现）。
//   F4「引用的仓内路径必须存在」（`#606` 片一）：反引号里写的 `src/`／`stories/`／`scripts/`／`test/`／`docs/`／`vendor/` 路径，
//       必须真在仓库里（或能通配到）。**为什么需要**：`src/*.twee` 在 `#458`／`#460` 搬到 `stories/<slug>/` 之后，
//       文档里 **14 处引用从未更新**（`baselines.md`／`notes-model-batches.md`／`impl-map.md`／`engine-story-boundary.md`／`game-outline.md`／`README.md`）——
//       而 markdown 链接（`[x](path)`）**死链是 0**：坏的**全住在反引号里**、没有门。
//       历史叙述确需引用已消失的路径时，同行写 `<!-- path-exempt: 理由 -->`（门会**留痕打印**豁免，便于收编）。
//   F5「入口页体量 ratchet」（`#603` 片二）：`README.md` 行数 ≤ 上限（默认 120，`README_MAX_LINES` 可覆盖）。
//       —— README 曾长到 270 行/24KB（"什么都有"＝等于没有）：十维密表、整棵目录树、Twee 速查、机制表全塞在入口页。
//       分层之后必须**防止再长回去**，所以给入口页一条会咬人的上限（不是审美，是可判定的）。
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { globSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** 纯函数：分析一段 markdown，返回 `{ fences, odd, headingsInFence, problems }`。 */
export const analyzeMarkdown = (text, { file = '<mem>' } = {}) => {
	const lines = String(text).split('\n');
	const fences = [];                 // 围栏行号（1-based）
	const headingsInFence = [];
	let inFence = false;
	lines.forEach((line, i) => {
		const t = line.trim();
		if (t.startsWith('```')) {
			fences.push({ line: i + 1, open: !inFence, info: t.slice(3).trim() });
			inFence = !inFence;
			return;
		}
		if (inFence && /^#{1,6}\s+\S/.test(t)) headingsInFence.push({ line: i + 1, text: t });
	});
	const problems = [];
	if (fences.length % 2 !== 0) {
		problems.push(`${file}：围栏总数 **${fences.length}（奇数）** ⇒ 从第一个围栏（L${fences[0]?.line ?? '?'}）起`
			+ '开/闭角色整体错位一位：后面的「开围栏」其实在关闭、后面的「闭围栏」其实在开启');
	}
	// ⚠️ F2 **只在奇偶已错时**当诊断用：正常文件里代码块内的 `#`（bash/python 注释）**不是缺陷**——
	// 我曾把它无条件当红报（`--truth` 那几行 bash 注释就误报过）⇒ 判据的**唯一**可证伪项是奇偶（F1），
	// F2 只是"错位之后，哪些标题被吞了"的点名。成对围栏的文件一律不看 F2。
	if (fences.length % 2 !== 0) {
		for (const h of headingsInFence) {
			problems.push(`${file}：**被吞的标题**（诊断）L${h.line}「${h.text}」⇒ 修好围栏后它会恢复成一节`);
		}
	}
	for (const f of fences) {
		if (/`/.test(f.info)) problems.push(`${file}：L${f.line} 围栏行的语言串里混进了反引号「${f.info}」`);
	}
	return { fences, odd: fences.length % 2 !== 0, headingsInFence, problems };
};

const PATH_ROOTS = 'src|stories|scripts|test|docs|vendor';
/** 反引号里的仓内路径（含通配）＋可选的同行豁免标记。 */
export const PATH_REF = new RegExp('`((?:' + PATH_ROOTS + ')/[A-Za-z0-9_./\\-*]+\\.(?:twee|mjs|js|md|json|css))`', 'g');
export const PATH_EXEMPT = /<!--\s*path-exempt:\s*([^*]*?)-->/;

/**
 * 纯函数：检查一段 markdown 里引用的仓内路径。
 *
 * **判红口径（关键，`#606` 片一在 CI 上被教育过一次）**：
 *   只把「**同名文件在别处存在**」的路径当陈旧引用判红（＝"文件搬了/改名了，引用没跟"），
 *   因为那正是本门要咬的缺陷类（`src/15-tables.twee` → `stories/mist-forest/…`）。
 *   同名文件在全仓**根本不存在**的引用 ⇒ 视为**尚未创建**（设计稿里"新增 `scripts/audit/discovery.mjs`"这种），
 *   **只登记打印、不判红** —— 否则任何设计稿都会被门挡住（`docs/story-gates-design.md` 实测）。
 * `exists`／`globMatches`／`basenameExists` 由调用方注入（自证用假实现）。
 */
export const checkPathRefs = (text, { file = '<mem>', exists = () => true, globMatches = () => [], basenameExists = () => false } = {}) => {
	const problems = [], exemptions = [], planned = [];
	String(text).split('\n').forEach((line, i) => {
		const ex = PATH_EXEMPT.exec(line);
		for (const m of line.matchAll(PATH_REF)) {
			const p = m[1];
			if (exists(p) || globMatches(p).length) continue;
			if (ex) { exemptions.push(`${file}:${i + 1} 豁免「${p}」（理由：${ex[1].trim()}）`); continue; }
			if (!basenameExists(p)) { planned.push(`${file}:${i + 1} 尚未创建「${p}」（设计稿正常；若它其实搬过家 ⇒ 是缺陷）`); continue; }
			problems.push(`${file}:${i + 1}：引用的仓内路径**不存在** \`${p}\`（同名文件在别处 ⇒ 像是搬家后没跟；确需引用历史路径时同行加 <!-- path-exempt: 理由 -->）`);
		}
	});
	return { problems, exemptions, planned };
};

/** 入口页体量上限（行）。分层后的 README 是 79 行；留余量到 120，再超就说明参考件又在往入口页塞。 */
export const README_MAX_LINES = Number(process.env.README_MAX_LINES ?? 120);

/** 纯函数：入口页体量检查。 */
export const checkReadmeBudget = (text, { max = README_MAX_LINES, file = 'README.md' } = {}) => {
	const lines = String(text).split('\n').length;
	return {
		lines,
		problems: lines > max
			? [`${file}：**入口页 ${lines} 行 > 上限 ${max} 行** ⇒ 又在变 godfile；`
				+ '把"参考件"（目录树/速查表/维度表/机制表）移到 `docs/` 并在 `docs/README.md` 登记，入口页只留入口']
			: [],
	};
};

/** 仓库里的 `*.md` 清单 = **git 跟踪的那些**（`#617`）。
 *  为什么不再走文件系统遍历：`build/` 这类 **gitignored 产物/临时目录**下面出现的 `*.md`（例如
 *  `ui-migration-diff --out=build/…` 的正常产物、或往届临时文件）会被当成"仓内文档"扫描 ⇒
 *  ① 本地**假红**（实测：`build/_t5.md` 引用了搬走的 `src/70-codex.twee`）② 与并行段**竞态**
 *  （同一轮 `npm test` 里边写 `build/ui-migration-diff.md` 边扫它）。
 *  `git ls-files` 从**结构上**排除这类目录 —— 比"记得把每个目录名加进 SKIP_DIRS"可靠。
 *  另：本门已经依赖 git（F4 的路径存在性也用 `git ls-files`），不多一层新依赖。 */
export const allMarkdown = () =>
	execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);

const main = () => {
	let bad = 0;
	console.log('══ 文档格式门（`*.md` 围栏配对 · 标题不入块，#603）══');

	// ── 自证（纯函数；含 🔴 本票的缺陷形态）──
	const self = [
		['成对围栏 + 标题在块外 ⇒ 无问题', analyzeMarkdown('# 甲\n\n```\ncode\n```\n\n## 乙\ntext\n').problems.length === 0],
		['🔴 奇数围栏 ⇒ 判红（本票形态）', analyzeMarkdown('# 甲\n\n```\ncode\n').problems.some((p) => p.includes('奇数'))],
		['🔴 奇数围栏 ⇒ 点名被吞的标题与行号', analyzeMarkdown('# 甲\n\n```\n## 乙 被吞了\n').problems.some((p) => p.includes('L4') && p.includes('被吞的标题'))],
		['正例：标题紧跟围栏之后（块外）⇒ 不误报', analyzeMarkdown('```\ncode\n```\n## 丙\n').problems.length === 0],
		['正例：**成对**围栏里的 bash 注释（`# 十一门 …`）⇒ 不误报（这是我第一版误报过的形态）',
			analyzeMarkdown('## 节\n\n```bash\nnpm run audit\n                 #   十一门 —— --truth …\n```\n').problems.length === 0],
		['围栏行语言串混反引号 ⇒ 判红', analyzeMarkdown('```js`\ncode\n```\n').problems.some((p) => p.includes('反引号'))],
		['F4 正例：存在的路径 ⇒ 不报', checkPathRefs('见 `src/10-core.twee`', { exists: (p) => p === 'src/10-core.twee' }).problems.length === 0],
		['🔴 F4 反例：同名文件在别处（搬家后没跟）⇒ 判红并点名文件行号', checkPathRefs('一行\n见 `src/15-tables.twee`', { exists: () => false, basenameExists: (p) => p.endsWith('15-tables.twee') }).problems.some((p) => p.includes(':2') && p.includes('src/15-tables.twee'))],
		['F4 边界：同名文件全仓都没有（设计稿里"新增"的模块）⇒ 不判红、只登记', checkPathRefs('新增 `scripts/audit/discovery.mjs`', { exists: () => false }).problems.length === 0 && checkPathRefs('新增 `scripts/audit/discovery.mjs`', { exists: () => false }).planned.length === 1],
		['F4 边界：能通配到的路径 ⇒ 不报', checkPathRefs('见 `src/*.twee`', { exists: () => false, globMatches: () => ['src/10-core.twee'] }).problems.length === 0],
		['F4 边界：同行豁免标记 ⇒ 不报且留痕', checkPathRefs('原 `src/15-tables.twee` <!-- path-exempt: 搬家前的位置 -->', { exists: () => false }).exemptions.length === 1],
		['入口页 100 行（≤120）⇒ 不报', checkReadmeBudget(Array(100).fill('x').join('\n'), { max: 120 }).problems.length === 0],
		['🔴 入口页 200 行 ⇒ 判红并点名行数上限', checkReadmeBudget(Array(200).fill('x').join('\n'), { max: 120 }).problems.some((p) => p.includes('200 行') && p.includes('godfile'))],
	];
	for (const [label, ok] of self) {
		if (ok) console.log(`      ✓ 自证·${label}`);
		else { bad++; console.error(`      ✗ 自证·${label}`); }
	}

	// ── 真扫：全仓 `*.md` ──
	const files = allMarkdown();
	let oddFiles = 0, inFenceFiles = 0;
	for (const f of files) {
		const r = analyzeMarkdown(readFileSync(join(ROOT, f), 'utf8'), { file: f });
		if (r.odd) oddFiles++;
		if (r.odd && r.headingsInFence.length) inFenceFiles++;  // 只在**奇偶错位**的文件里才算'被吞'
		for (const p of r.problems) { bad++; console.error(`  ✗ ${p}`); }
	}
	const leaked = files.filter((f) => /^(?:build|dist|node_modules|tmp|\.cache)\//.test(f));
	if (leaked.length) { bad++; console.error(`  ✗ 清单里混进了 gitignored 目录：${leaked.slice(0, 3).join('、')}——本门只许扫 git 跟踪的文档（#617）`); }
	console.log(`      扫描 ${files.length} 个 md（**git 跟踪**，天然排除 build/ 等 gitignored 目录）：围栏奇数 ${oddFiles} 个 · 有标题被吞 ${inFenceFiles} 个`);

	// ── F4：引用的仓内路径必须存在（`#606` 片一）──
	const tracked = new Set(execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean));
	// 存在性 = 已跟踪 **或** 工作区里真有 —— 否则「刚写好还没 git add」的文档会被误判成陈旧（实测撞过一次）。
	const existsInRepo = (p) => tracked.has(p) || existsSync(join(ROOT, p));
	const globMatchesInRepo = (p) => (p.includes('*') ? globSync(p, { cwd: ROOT }) : []);
	const basenameIndex = new Set([...tracked].map((p) => p.split('/').pop()));
	let pathRefs = 0, pathBad = 0, exempted = 0, plannedPaths = 0;
	for (const f of files) {
		const text = readFileSync(join(ROOT, f), 'utf8');
		pathRefs += [...text.matchAll(PATH_REF)].length;
		const r = checkPathRefs(text, { file: f, exists: existsInRepo, globMatches: globMatchesInRepo, basenameExists: (p) => basenameIndex.has(p.split('/').pop()) });
		pathBad += r.problems.length;
		exempted += r.exemptions.length;
		plannedPaths += r.planned.length;
		for (const pr of r.problems) { bad++; console.error(`  ✗ ${pr}`); }
		for (const e of r.exemptions) console.log(`      · 豁免留痕 ${e}`);
		for (const pl of r.planned) console.log(`      · 登记（尚未创建）${pl}`);
	}
	console.log(`      路径引用 ${pathRefs} 处：陈旧 ${pathBad} 处（同名在别处）· 尚未创建 ${plannedPaths} 处（设计稿里"新增"的模块，只登记）· 豁免留痕 ${exempted} 处`);

	// ── F5：入口页体量 ratchet ──
	if (files.includes('README.md')) {
		const b = checkReadmeBudget(readFileSync(join(ROOT, 'README.md'), 'utf8'));
		for (const p of b.problems) { bad++; console.error(`  ✗ ${p}`); }
		console.log(`      入口页 README.md ${b.lines} 行（上限 ${README_MAX_LINES}）`);
	}

	if (bad) {
		console.error(`\n✗ 文档格式门未通过（${bad} 项）—— 围栏必须成对 · 标题不许落在代码块里 · 引用路径必须存在 · 入口页不许超上限（#603／#606）`);
		process.exit(1);
	}
	console.log('\n✔ 文档格式门通过（围栏全成对 · 无标题被吞）');
};

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
