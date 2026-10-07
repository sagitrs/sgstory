/* GitHub Actions 步骤键形门（`sgstory#1994` 的教训机械化）—— 每步须有 `run`／`uses`，且一块里 `run` 不得出现两次
 *
 * ## 为什么要有这道门（一次真事，`2276a95b`）
 *   `#1987` 往 `test.yml` 里插两步时，把「引用形与 pin 完整性门」的 `name:` 与它的 `run:` **插开了** ⇒
 *   那行 `run:` 跑到了**下一个 step 的块里**、且与那块的 `run:` **缩进完全相同** ⇒ 于是：
 *     ① **第 3 步成了「有 `name`、没 `run`／`uses`」的步** ⇒ GitHub 判定**整个 workflow 无效** ✗
 *        ⇒ 症状：**该 PR 一个 run 都不起**、`main` 从此全红、run 名**退化成文件路径**（读不到 `name:` 的表现）。
 *     ② 那一块里出现**两个同名的键 `run:`** ⇒ YAML 的 **last-wins** 让后者**顶掉**前者 ✗
 *        ⇒ 「★直构棘轮」那步**实跑的是 `refs-integrity.mjs`** ⇒ **步名与实跑不符**（「假绿」一族）。
 *
 * ## ★机制注（后来人最容易搞错的一点）
 *   **重复键不是「续行折行」。** 那两行的缩进**一模一样** ✓ —— 若第二行**更深**，YAML 会把它当**前一标量的续行**
 *   （这时 `run` 的值里会多出一行 `run: …`，同样是坏，但**症状与修法都不同**）。本例是**同一映射的重复键** ⇒
 *   **`yaml.safe_load` 不报错**（PyYAML 对重复键 last-wins、静默 ✗）⇒ ★**只做「能解析吗」是不够的** ✓。
 *   ⇒ 故本门**不引 YAML 解析器**（本仓 CI 不装依赖 ✓），改走**缩进感知的行扫**，直接判**键形**：
 *     A. 每个 step 块须含 `run:` 或 `uses:`（缺 ⇒ 无效 workflow ⇒ 红）；
 *     B. 一个 step 块里 `run:` **至多出现一次**（重复 ⇒ last-wins 顶掉 ⇒ 步名会撒谎 ⇒ 红）；
 *     C. 每个 workflow 文件须有**非空 `name:`**（缺 ⇒ run 列表显示文件路径、人读不出是哪条门 ⇒ 红）。
 *
 * ## 判据的边界（✗ 不假装它比实际更强）
 *   · 行扫**不理解** `uses:` 的 `with:` 块／多行字符串里的内容 ⇒ 值里**恰好**出现形如 `run:` 的行时，可能误报
 *     ⇒ 遇到这种写法，把该值写成**更深的缩进**（YAML 会当续行 ✓）或改用 `uses:` ✓；
 *   · 它**不**判「步名与实跑是否相称」（那要读命令语义 ✗）—— 本门只保证**结构上不撒谎**；
 *   · 它**不**判 workflow 的其它 schema 规则（触发条件、表达式等 ✗）。
 *
 * ## 读数（分母显式）
 *   workflows 扫描数 N ／ step 块数 M ／ 违规 K。K>0 ⇒ 红。
 *
 * ## 退出码
 *   0 = 门绿；1 = 有红（逐条具名：文件:行 ＋ 步名 ＋ 缺什么）；2 = 装置错（找不到 workflow 目录／目录里无文件 ⇒ **证不出** ⇒ ✗ 不静默当绿）
 *
 * 用法：node tests/gates/workflow-steps.mjs [--root <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';

const 取参数 = (名, 默认 = null) => {
	const i = process.argv.indexOf(名);
	return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : 默认;
};
const root = path.resolve(取参数('--root', process.cwd()));
const wfDir = path.join(root, '.github', 'workflows');

if (!fs.existsSync(wfDir)) {
	console.error(`✗ 装置错：找不到 \`${path.relative(root, wfDir)}\` ⇒ **证不出**步骤键形（✗ 不静默当绿）`);
	process.exit(2);
}
const 文件们 = fs.readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f)).sort();
if (文件们.length === 0) {
	console.error(`✗ 装置错：\`${path.relative(root, wfDir)}\` 里没有 .yml／.yaml ⇒ **证不出**（✗ 不静默当绿）`);
	process.exit(2);
}

const 问题 = [];
let 步块数 = 0;

for (const f of 文件们) {
	const 行 = fs.readFileSync(path.join(wfDir, f), 'utf8').split('\n');

	/* C：workflow 级 name 须非空（顶层、`on:` 之前） */
	const 顶层名 = 行.findIndex((l) => /^name:\s*\S/.test(l));
	const on行 = 行.findIndex((l) => /^on:\s*$/.test(l) || /^on:\s*\S/.test(l));
	if (顶层名 < 0 || (on行 >= 0 && 顶层名 > on行)) {
		问题.push(`${f}: 缺**非空**顶层 \`name:\`（run 列表会显示成文件路径、人读不出是哪条门）`);
	}

	/* 找 step 块：**只在 `steps:` 的辖域内**（★初版我漏了这条 ⇒ 把 `on:` 下的 `- cron:` 误当步骤 ✗ ⇒
	 *   K0 洁净副本当场把门自己红出来 —— 这就是「门自身要有对照」的用处 ✓）。
	 *   判法：见到 `<缩进>steps:` ⇒ 打开辖域；只有**缩进更深**的 `- <key>:` 才算步骤；缩进回到 ≤ 辖域即关闭。 */
	const 步起 = [];
	let 辖 = null;                                  // steps: 的缩进
	for (let i = 0; i < 行.length; i++) {
		const l = 行[i];
		if (l.trim() === '' || /^\s*#/.test(l)) continue;
		const 缩 = l.match(/^\s*/)[0].length;
		const mS = /^(\s*)steps\s*:\s*$/.exec(l);
		if (mS) { 辖 = mS[1].length; continue; }
		if (辖 === null) continue;
		if (缩 <= 辖) { 辖 = null; continue; }       // 走出辖域（✗ 不回溯本行：它是键值/新块，不是步骤 ✓）
		const m = /^(\s*)-\s+(\S[^:]*):/.exec(l);
		if (m && m[1].length > 辖) 步起.push({ i, 缩进: m[1].length, 键: m[2].trim(), 原文: l });
	}
	for (let k = 0; k < 步起.length; k++) {
		const 起 = 步起[k];
		/* 块尾：下一个 step 起（同缩进）或缩进更浅的行 */
		let 止 = 行.length;
		for (let j = 起.i + 1; j < 行.length; j++) {
			if (行[j].trim() === '') continue;
			const 缩 = 行[j].match(/^\s*/)[0].length;
			if (缩 <= 起.缩进 && /^-\s/.test(行[j].trim())) { 止 = j; break; }
			if (缩 <= 起.缩进 && !/^\s*-/.test(行[j])) { 止 = j; break; }
		}
		const 块 = 行.slice(起.i, 止);
		步块数 += 1;

		/* 键缩进 = `-` 缩进 + 2（`- name:` ⇒ name 在 缩进+2 列 ✓） */
		const 键缩进 = 起.缩进 + 2;
		const 键 = [];
		for (let n = 0; n < 块.length; n++) {
			const mm = /^(\s*)([A-Za-z_][\w.-]*)\s*:/.exec(块[n]);
			if (mm && mm[1].length === 键缩进) 键.push({ 名: mm[2], 行号: 起.i + n + 1 });
		}
		const 名 = (() => {
			const 首 = 块[0].replace(/^\s*-\s*/, '');
			return /^name\s*:/.test(首) ? 首.replace(/^name\s*:\s*/, '').slice(0, 44) : (起.键 || '(无名)');
		})();

		/* A：须有 run 或 uses */
		const run数 = 键.filter((x) => x.名 === 'run');
		const 有uses = 起.键 === 'uses' || 键.some((x) => x.名 === 'uses');
		if (run数.length === 0 && !有uses) {
			问题.push(`${f}:${起.i + 1}: 步骤「${名}」**既无 run 也无 uses** ⇒ workflow 无效（PR 一个 run 都不起、全仓全红）`);
		}
		/* D（`P1-3` 实测 · 「可解析验」的**本仓那一类**）：**标量值里带「`: `」须加引号** ——
		 *   YAML 里 `key: 值里还有: 空格` ⇒ **解析失败** ⇒ ★**整个 workflow 不加载**：CI 只报 `failure`、
		 *   **不报步**（× 本门当时全绿 ⇒ 假绿，是 developer-9 `#2050` 踩到的形 ✓）。
		 *   ⚠ 只判本类 ✓：✗ 完整 YAML 解析（本门是**行扫**、不引解析器依赖 ✓）；引号内的冒号**合法** ✓；
		 *     `a:b`（冒号后**无空格**）合法 ✓（命令行里常见 ✓）。 */
		{
			const re = /^(\s*)(?:-\s+)?([A-Za-z_][\w.-]*):\s+(.+)$/;   // ★允许 `- name: …`（列表项形 —— 我第一版漏了它 ⇒ K6 假绿 ✓）
			for (let i = 0; i < 行.length; i++) {
				const m = re.exec(行[i]);
				if (!m) continue;
				const 值 = m[3].trim();
				if (值.startsWith('"') || 值.startsWith("'") || 值.startsWith('|') || 值.startsWith('>') || 值.startsWith('#')) continue;
				if (/:\s/.test(值) || 值.endsWith(':')) {
					问题.push(`${f}:${i + 1}: 标量值里带「\`: \`」而**未加引号** ⇒ YAML **解析失败** ⇒ 整个 workflow 不加载（症状：CI 只报 failure、不报步）⇒ 请给该值加引号 ✓`);
				}
			}
		}
		/* B：一块里 run 不得重复 */
		if (run数.length > 1) {
			问题.push(`${f}:${run数.map((x) => x.行号).join(',')}: 步骤「${名}」有 **${run数.length} 个 \`run:\`** ⇒ YAML last-wins 会**顶掉**前者 ⇒ 步名与实跑不符（假绿）`);
		}
	}
}

console.log(`  扫描：workflows ${文件们.length} 个 ／ step 块 ${步块数} 个`);
if (问题.length > 0) {
	console.log('\n✗ 门红：');
	for (const p of 问题) console.log(`  - ${p}`);
	process.exit(1);
}
console.log('\n✓ 门绿（每步有 run/uses、块内 run 不重复、workflow 有 name）');
process.exit(0);
