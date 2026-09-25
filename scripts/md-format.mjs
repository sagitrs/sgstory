// ── 文档格式门（`#603`）：`*.md` 的围栏必须配对、标题不许落在代码块里 ──────────────
//
// 背景（"README 完全不可读"，实测**属实**）：
// `README.md` 第 57 行有一个**多余的** ```（`git blame` → 初版 `974605d` 就在），
// 于是从那里起**开/闭角色整体错位一位** —— 后面每个"开围栏"实际在**关闭**、每个"闭围栏"实际在**开启**
// → 四个标题（`## 知识模型`／`## 工程约定`／`## 目录结构`／`## Twee 语法速查`）在 GitHub 上
// 被渲染成**代码块里的字面量**（不是节！），而本该是代码的目录树／示意图反而被当成普通正文。
// 人眼在编辑器里看不出来（源码"看着挺整齐"）——**只有渲染才暴露**，所以必须有门。
//
// 为什么此前零机检：L0 `test/integrity.mjs` 扫 `src/*.twee`；`--text --craft` 扫叙事文本；
// `docs/**` 与 `README.md` 从来没有格式门（全仓 34 个 md，正是这一个破了）。
//
// 判据（纯函数，自带自证；**失败计入退出码**）：
// F1「围栏配对」：每个 `*.md` 的围栏总数为**偶数**。
// F2「标题不在块内」：逐行模拟 GitHub 的围栏状态机（每个围栏行翻转一次），
// 任何 `#…` 标题出现在**块内** → 判红，并**点名文件与行号**。
// F3「围栏行不被当作正文标签」：围栏行的语言串里不许再混 `` ` ``（防"```` ```js ``` ``"这类的成因复现）。
// F5「表格块被空行打断后又续」（`#974`）：一行 `|` 起头 → 走到表块末 → 下一行**空行** → 再下一行**又是 `|` 行、
// 且其后一行**不是分隔行**（→ 不是新表头）** → 判红并点名两处行号。
//注意：**F5 是行级代理** —— **不保证渲染正确**：它**不咬**「表头缺失／分隔行列数与数据行不齐」（GFM 会让它不成表、本判据看不见）
// 也不咬渲染层的其它问题；**并列两张正当表**（空行 ＋ 新表头 ＋ 分隔行）→ **放行**（＝本判据**第一版**的假阳性形态，已写成自证里的一条正例）。
// → 要「表没问题」的**定性** → 用**渲染器**或人眼（与 §17 ㉔「**代理 ≠ 直接读数**」同格）。
// F4「引用的仓内路径必须存在」（`#606` 片一）：反引号里写的 `src/`／`stories/`／`scripts/`／`test/`／`docs/`／`vendor/` 路径，
// 必须真在仓库里（或能通配到）。**为什么需要**：`src/*.twee` 在 `#458`／`#460` 搬到 `stories/<slug>/` 之后，
// 文档里 **14 处引用从未更新**（`baselines.md`／`notes-model-batches.md`／`impl-map.md`／`engine-story-boundary.md`／`game-outline.md`／`README.md`）——
// 而 markdown 链接（`[x](path)`）**死链是 0**：坏的**全住在反引号里**、没有门。
// 历史叙述确需引用已消失的路径时，同行写 `<!-- path-exempt: 理由 -->`（门会**留痕打印**豁免，便于收编）。
// **两类边界（照这两句判，别自行推）**：
// ① **"尚未创建" → 放行**（全仓都不存在同名文件＝**设计稿里"新增"的模块**，如当时的 `scripts/audit/discovery.mjs`）——
// 此时门只**登记**（打印"待创建"），不判红；否则任何前瞻性文档都会被门按住（`#610` 的实测）。
// ② **"同名文件在别处" → 红**（搬家/改名后引用没跟）：判据＝**全仓有同名文件但引用的那个路径不存在**，
// 报错会**点名文件与行号**——这是 F4 真正要咬的那一类（`#458`/`#460` 的 14 处陈旧引用就是它）。
// F5「入口页体量 ratchet」（`#603` 片二）：`README.md` 行数 ≤ 上限（默认 120，`README_MAX_LINES` 可覆盖）。
// F6「残留版本控制冲突标记」（`#1084`，实测缺口）：解 rebase/merge 冲突后没删净的 `<<<<<<< `/`>>>>>>> `（行首带尾随内容）→ 红；
// 裸 `=======` **不单独判**（它是合法 Markdown：setext 标题下划线／分隔线），只在**被 <<< / >>> 夹住**时附报。
// —— README 曾长到 270 行/24KB（"什么都有"＝等于没有）：十维密表、整棵目录树、Twee 速查、机制表全塞在入口页。
// 分层之后必须**防止再长回去**，所以给入口页一条会咬人的上限（不是审美，是可判定的）。
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { globSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// `#1089`（裁定乙′）：**未跟踪扫描面 → 红** 的共用助手（一处定义、三门复用）。
import { untrackedScannedProblems, isUntrackedExemptLine } from './lib/untracked-guard.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** 纯函数：分析一段 markdown，返回 `{ fences, odd, headingsInFence, problems}`。 */
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
	//注意：F2 **只在奇偶已错时**当诊断用：正常文件里代码块内的 `#`（bash/python 注释）**不是缺陷**——
	// 我曾把它无条件当红报（`--truth` 那几行 bash 注释就误报过）→ 判据的**唯一**可证伪项是奇偶（F1），
	// F2 只是"错位之后，哪些标题被吞了"的点名。成对围栏的文件一律不看 F2。
	if (fences.length % 2 !== 0) {
		for (const h of headingsInFence) {
			problems.push(`${file}：**被吞的标题**（诊断）L${h.line}「${h.text}」⇒ 修好围栏后它会恢复成一节`);
		}
	}
	for (const f of fences) {
		if (/`/.test(f.info)) problems.push(`${file}：L${f.line} 围栏行的语言串里混进了反引号「${f.info}」`);
	}
	// ── F5「表格块被空行打断后又续上」（`#974`）──
	// 为什么需要：**GFM 表格在第一个空行处结束** → 夹一个空行再续 `|` 行 → **后面那些行掉出 `<table>`**
	//（实测：`#973` 就因此在 §7 表里把 **P4 验收那行**弄出了表格，而**当时本门 rc=0** —— 它原先不校验表格）。
	//注意：判据取**最小行级**形态：只咬"**表块 → 空行 → 又见 `|` 行**" → **不必引入渲染器**。
	for (let i = 0; i < lines.length; i++) {
		if (!/^\s*\|/.test(lines[i] ?? '')) continue;          // 不是表行 → 跳过
		let j = i;
		while (j + 1 < lines.length && /^\s*\|/.test(lines[j + 1])) j += 1;   // 走到本表块末
		const blank = j + 1;
		//注意：**先量再判**（本判据第一版就在 **`docs/game-outline.md` 上假阳性**）：两张**并列的表**也是合法的
		// —— 它们靠"空行 ＋ **新表头 ＋ 分隔行**"分家 → 所以只有"空行之后又续 `|` 行、**且它不是新表头**"才算破。
		const cont = lines[blank + 1] ?? '';
		const contIsNewTable = /^\s*\|/.test(cont) && /^\s*\|[\s:|-]+\|[\s:|-]*$/.test(lines[blank + 2] ?? '');
		if ((lines[blank] ?? 'x').trim() === '' && /^\s*\|/.test(cont) && !contIsNewTable) {
			problems.push(`${file}：L${i + 1}-L${j + 1} 与 L${blank + 2} 本属**同一张表**，却被 L${blank + 1} 的**空行**打断 ✗`
				+ ' ⇒ **GFM 表格在第一个空行处结束** ⇒ 后面那些行**掉出 `<table>`**（渲染出来还是"像表"✓，所以只有渲染器或本判据看得见）');
		}
		i = j;
	}
	return { fences, odd: fences.length % 2 !== 0, headingsInFence, problems };
};

const PATH_ROOTS = 'src|stories|scripts|test|docs|vendor';
/** 反引号里的仓内路径（含通配）＋可选的同行豁免标记。 */
/** `#1362` 族第 4 例（竞态）：**列到清单、但读的那一刻它已消失** ⇒ 跳过并记名（`read` 注入 ⇒ 自证能假）。
 * 现场：`test/untracked-guard.mjs` 的端到端格会**临时 `git add` 一个夹具 md** 再删 ⇒ 并发的本门
 * `ls-files '*.md'` 会在**那个短窗口内**列到它 ⇒ 直接 `readFileSync` ⇒ `ENOENT` ✗
 * （实测：与本件并发 12 轮命中 1 次；把夹具名改成"每次唯一"**治不了**它 ⇒ 真因是 **TOCTOU** ✗ 不是重名）。
 * 口径：**跳过并出声**（✗ 不算门失败、✗ 不静默 —— "列名单"与"读"是两个时点）。 */
export const readAlive = (files = [], read = () => '') => {
	const texts = [];
	const vanished = [];
	for (const f of files) {
		try { texts.push({ f, text: read(f) }); }
		catch { vanished.push(f); }
	}
	return { texts, vanished };
};

export const PATH_REF = new RegExp('`((?:' + PATH_ROOTS + ')/[A-Za-z0-9_./\\-*]+\\.(?:twee|mjs|js|md|json|css))`', 'g');
export const PATH_EXEMPT = /<!--\s*path-exempt:\s*([^*]*?)-->/;

/**
 * 纯函数：检查一段 markdown 里引用的仓内路径。
 *
 * **判红口径（关键，`#606` 片一在 CI 上被教育过一次）**：
 * 只把「**同名文件在别处存在**」的路径当陈旧引用判红（＝"文件搬了/改名了，引用没跟"），
 * 因为那正是本门要咬的缺陷类（`src/15-tables.twee` → `stories/mist-forest/…`）。
 * 同名文件在全仓**根本不存在**的引用 → 视为**尚未创建**（设计稿里"新增 `scripts/audit/discovery.mjs`"这种），
 * **只登记打印、不判红** —— 否则任何设计稿都会被门挡住（`docs/story-gates-design.md` 实测）。
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
 * 为什么不再走文件系统遍历：`build/` 这类 **gitignored 产物/临时目录**下面出现的 `*.md`（例如
 * `ui-migration-diff --out=build/…` 的正常产物、或往届临时文件）会被当成"仓内文档"扫描 →
 * ① 本地**假红**（实测：`build/_t5.md` 引用了搬走的 `src/70-codex.twee`）② 与并行段**竞态**
 *（同一轮 `npm test` 里边写 `build/ui-migration-diff.md` 边扫它）。
 * `git ls-files` 从**结构上**排除这类目录 —— 比"记得把每个目录名加进 SKIP_DIRS"可靠。
 * 另：本门已经依赖 git（F4 的路径存在性也用 `git ls-files`），不多一层新依赖。 */
/** F6（`#1084`）：残留冲突标记。注意：只咬「行首**带尾随内容**」的 `<<<<<<< `/`>>>>>>> `（git 形态如 `<<<<<<< HEAD`／`>>>>>>> <oid> (msg)`）；
 * 裸 `=======` 不单独判（合法 setext／分隔线）——只在同文件已因 <<< / >>> 报红时附报「疑似冲突中段」。 */
export const CONFLICT_START_RE = /^<{7} \S/;
export const CONFLICT_END_RE = /^>{7} \S/;
export const conflictMarkerProblems = (text, { file = '<mem>' } = {}) => {
	const lines = String(text).split('\n');
	const out = [];
	let hasPair = false;
	lines.forEach((line, i) => {
		if (CONFLICT_START_RE.test(line) || CONFLICT_END_RE.test(line)) {
			hasPair = true;
			out.push(`${file}：L${i + 1} 残留的版本控制冲突标记「${line.slice(0, 12)}…」⇒ 解冲突后没删净（#1084 实测：游离 >>>>>>> 进过 commit 而三门全绿 ✗）`);
		}
	});
	if (hasPair) {
		lines.forEach((line, i) => {
			if (/^={7}\s*$/.test(line)) out.push(`${file}：L${i + 1} 疑似冲突中段「=======」（与上方冲突标记同文件）⇒ 一并删净`);
		});
	}
	return out;
};

export const allMarkdown = () =>
	execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);

const main = () => {
	let bad = 0;
	console.log('══ 文档格式门（`*.md` 围栏配对 · 标题不入块，#603）══');

	// ── 自证（纯函数；含 本票的缺陷形态）──
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
		['🔴 竞态：**列到但读不到** ⇒ 跳过并记名（✗ 不抛、✗ 不静默）',
			(() => { const r = readAlive(['a.md', 'gone.md'], (f) => { if (f === 'gone.md') throw new Error('ENOENT'); return '# ok\n'; });
				return r.texts.length === 1 && r.texts[0].f === 'a.md' && r.vanished.length === 1 && r.vanished[0] === 'gone.md'; })()],
		['🔴 竞态 正例：读得到就**不该**被记进 vanished（✗ 不误伤正常件）',
			(() => { const r = readAlive(['a.md', 'b.md'], () => '# ok\n');
				return r.texts.length === 2 && r.vanished.length === 0; })()],
		['🔴 F5：表块 ⇒ 空行 ⇒ 又见 `|` 行 ⇒ **判红并点名两处行号**（`#973` 的真形态）',
			analyzeMarkdown('| a |\n| - |\n| b |\n\n| c |\n').problems.some((p) => p.includes('L1-L3') && p.includes('L5') && p.includes('同一张表'))],
		['F5 正例：**并列两张表**（空行 ＋ **新表头 ＋ 分隔行**）⇒ 不报（`docs/game-outline.md` 的真形态 ⇒ 第一版在此**假阳性** ✗）',
			analyzeMarkdown('| 甲 | 乙 |\n| - | - |\n| 1 | 2 |\n\n| 丙 | 丁 |\n| - | - |\n| 3 | 4 |\n').problems.length === 0],
		['F5 正例：表块 ⇒ 空行 ⇒ **普通正文**（正常结束）⇒ 不报',
			analyzeMarkdown('| a |\n| - |\n\n正文\n').problems.length === 0],
		['入口页 100 行（≤120）⇒ 不报', checkReadmeBudget(Array(100).fill('x').join('\n'), { max: 120 }).problems.length === 0],
		['🔴 入口页 200 行 ⇒ 判红并点名行数上限', checkReadmeBudget(Array(200).fill('x').join('\n'), { max: 120 }).problems.some((p) => p.includes('200 行') && p.includes('godfile'))],
		['🔴 F6：`>>>>>>> <sha> (msg)` ⇒ 判红（#1084 的实测缺口形态）', conflictMarkerProblems('正文\n>>>>>>> deadbeef (test)\n', { file: 'a.md' }).some((p) => p.includes('L2') && p.includes('冲突标记'))],
		['🔴 F6：`<<<<<<< HEAD` ⇒ 判红并点名', conflictMarkerProblems('<<<<<<< HEAD\n正文\n', { file: 'a.md' }).some((p) => p.includes('L1') && p.includes('<<<<<<<'))],
		['F6 正例：裸 `=======`（无冲突对）⇒ **不报**（合法 setext／分隔线）', conflictMarkerProblems('标题\n=======\n\n正文\n---\n', { file: 'a.md' }).length === 0],
		['F6 正例：行内/缩进的标记不是冲突标记 ⇒ 不报', conflictMarkerProblems('提及 `>>>>>>>` 于句中或缩进 ⇒ 非行首\n', { file: 'a.md' }).length === 0],
		['🔴 F6：被夹住的 `=======` ⇒ 附报「疑似冲突中段」', conflictMarkerProblems('<<<<<<< HEAD\n甲\n=======\n乙\n>>>>>>> abc (m)\n', { file: 'a.md' }).some((p) => p.includes('L3') && p.includes('冲突中段'))],
	];
	for (const [label, ok] of self) {
		if (ok) console.log(`      ✓ 自证·${label}`);
		else { bad++; console.error(`      ✗ 自证·${label}`); }
	}

	// ── 真扫：全仓 `*.md` ──
	const files = allMarkdown();
	// ★ 竞态（`#1362` 族第 4 例，实测）：列清单之后、读到某件之前它可能**已消失** ⇒ 见 `readAlive` 头注。
	const alive = readAlive(files, (f) => readFileSync(join(ROOT, f), 'utf8'));
	const vanished = alive.vanished;
	let oddFiles = 0, inFenceFiles = 0;
	for (const { f, text } of alive.texts) {
		const r = analyzeMarkdown(text, { file: f });
		if (r.odd) oddFiles++;
		if (r.odd && r.headingsInFence.length) inFenceFiles++;  // 只在**奇偶错位**的文件里才算'被吞'
		for (const p of [...r.problems, ...conflictMarkerProblems(text, { file: f })]) { bad++; console.error(`  ✗ ${p}`); }
	}
	const leaked = files.filter((f) => /^(?:build|dist|node_modules|tmp|\.cache)\//.test(f));
	if (leaked.length) { bad++; console.error(`  ✗ 清单里混进了 gitignored 目录：${leaked.slice(0, 3).join('、')}——本门只许扫 git 跟踪的文档（#617）`); }
	console.log(`      扫描 ${files.length} 个 md（**git 跟踪**，天然排除 build/ 等 gitignored 目录）：围栏奇数 ${oddFiles} 个 · 有标题被吞 ${inFenceFiles} 个`);
	if (vanished.length) console.log(`      · 竞态跳过 ${vanished.length} 件（列清单后消失 —— 并发段临时件，✗ 不算门失败）：${vanished.slice(0, 3).join('、')}`);

	// ── `#1089`（裁定乙′）：**未跟踪的 `*.md` → 红** —— 本门扫面＝`git ls-files '*.md'` → 未跟踪的
	// `*.md` **连 F6（残留冲突标记）都看不见它** → 那是**假绿**（`#1019`／`#1028` 同族）。
	// 豁免：件内任意一行写 `untracked-exempt: <理由 ＋ 票号>`（**缺任一项不生效**）＋ **必须留痕**。
	{
		const others = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
		const isMd = (p) => p.endsWith('.md');
		const exempted = others.filter((q) => {
			if (!isMd(q)) return false;
			try { return readFileSync(join(ROOT, q), 'utf8').split('\n').some(isUntrackedExemptLine); } catch { return false; }   // 读不到 → 不当豁免（保守）
		});
		if (exempted.length) console.log(`  · 留痕：未跟踪但**已豁免** ${exempted.length} 件（带 \`untracked-exempt:\` 标记 ✓）：${exempted.join('、')}`);
		const g = untrackedScannedProblems({ untracked: others, isScanned: isMd, exempted });
		if (g.problems.length) { bad++; for (const m of g.problems) console.error(`  ${m}`); }
	}

	// ── F4：引用的仓内路径必须存在（`#606` 片一）──
	const tracked = new Set(execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean));
	// 存在性 = 已跟踪 **或** 工作区里真有 —— 否则「刚写好还没 git add」的文档会被误判成陈旧（实测撞过一次）。
	const existsInRepo = (p) => tracked.has(p) || existsSync(join(ROOT, p));
	const globMatchesInRepo = (p) => (p.includes('*') ? globSync(p, { cwd: ROOT }) : []);
	const basenameIndex = new Set([...tracked].map((p) => p.split('/').pop()));
	let pathRefs = 0, pathBad = 0, exempted = 0, plannedPaths = 0;
	for (const { f, text } of alive.texts) {
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
