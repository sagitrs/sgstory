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
//   F5「入口页体量 ratchet」（`#603` 片二）：`README.md` 行数 ≤ 上限（默认 120，`README_MAX_LINES` 可覆盖）。
//       —— README 曾长到 270 行/24KB（"什么都有"＝等于没有）：十维密表、整棵目录树、Twee 速查、机制表全塞在入口页。
//       分层之后必须**防止再长回去**，所以给入口页一条会咬人的上限（不是审美，是可判定的）。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'tmp', '.cache']);

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

/** 走仓库里所有 `*.md`（跳过构建产物与依赖目录）。 */
export const allMarkdown = (dir = ROOT, out = []) => {
	for (const name of readdirSync(dir)) {
		if (SKIP_DIRS.has(name)) continue;
		const p = join(dir, name);
		const st = statSync(p);
		if (st.isDirectory()) allMarkdown(p, out);
		else if (name.endsWith('.md')) out.push(relative(ROOT, p));
	}
	return out;
};

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
	console.log(`      扫描 ${files.length} 个 md：围栏奇数 ${oddFiles} 个 · 有标题被吞 ${inFenceFiles} 个`);

	// ── F5：入口页体量 ratchet ──
	if (files.includes('README.md')) {
		const b = checkReadmeBudget(readFileSync(join(ROOT, 'README.md'), 'utf8'));
		for (const p of b.problems) { bad++; console.error(`  ✗ ${p}`); }
		console.log(`      入口页 README.md ${b.lines} 行（上限 ${README_MAX_LINES}）`);
	}

	if (bad) {
		console.error(`\n✗ 文档格式门未通过（${bad} 项）—— 围栏必须成对 · 标题不许落在代码块里 · 入口页不许超上限（#603）`);
		process.exit(1);
	}
	console.log('\n✔ 文档格式门通过（围栏全成对 · 无标题被吞）');
};

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
