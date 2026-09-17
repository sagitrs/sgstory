// K6 门（`#794` 编辑器内核抽取）：**单一内核／防双内核** —— K4「单一真源」的姊妹判据。
//
// 背景（工作项 `#794`「编辑器内核抽取」）：CLI 形态＝「**同一内核 ＋ 薄壳**」；内核锁死 JS/ESM；
//   Go/Rust 只许做进程/UI 壳且**永不复述 schema**。四条防双内核措施里，**三条要靠机械判据**才不腐烂：
//     · 诊断是**数据**（findings）· **单一写路** · **fail-loud 在内核**
//   ⇒ 本门把它们变成可执行判据（"禁令只写在文档里 ⇒ 纪律会腐烂" ✓ 与 "只改代码不同步判据 ⇒
//     判据会静默失去咬合力" 是同一条经验的两面 ✓）。
//
// 判据（三条）
//   ① **能力只许一处定义**：`editor/**` 里每个**导出名**必须恰好在一处被**定义**
//      （`export const/function NAME`／`function NAME(`／`const NAME = `）——重导出（`export { X } from …`）
//      不算定义 ✓。⇒ 两个文件定义同名能力 ＝ 两份内核 ✗（这正是我们这几轮所有假绿的共同形状：
//      `readKey` 读侧/写侧两份、`declCondRefs` 文本/对象两套、假 A 的 `JSON` 克隆 ✗）。
//   ② **壳里不许有内核逻辑**：一旦 `editor/lib/core/**` 出现，则"壳"（`editor/cli.mjs` ＋ `editor/lib/host/**` ＋
//      旧的 6 个 `editor/*.mjs`）不得**定义**任何 core 能力（由 ① 覆盖 ✓）且不得**写故事文件**（`stories/**` ✗）。
//   ③ **未开始要留痕**：`editor/lib/core` 不存在时，只跑 ①，并**打印一行**说明（不静默判过 ✗）。
//
// 用法：node editor/k6.mjs [--selftest]

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// ③b 需要**遮字符串**（见下）；③a 反而**不能**遮字符串 ⇒ 两个口径，别混 ✓。
import { maskAll } from './classify-contract.mjs';

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
// ⚠️ **遮蔽器选型**（一个真踩过的坑 ✓）：
//  · **不能**用 `editor/classify-contract.mjs` 的 `maskAll` ✗ —— 它连**字符串字面量**一起遮 ⇒
//    `from 'node:fs'` 里的说明符被遮掉 ⇒ 本判据**永不触发** ✗（"用错遮蔽器 ⇒ 判据无声失效" ✓）；
//  · `editor/lib/core/text.mjs` 的 `maskComments` 是**局部**未导出 ✗ ⇒ 这里先用**最小实现**（只挡注释 ✓），
//    待它导出后换成它 ✓（**已登记为待办**，属"两处实现必漂移"那族 ✓）。
// ⚠️ **遮蔽必须保留换行** ✓（只把**非换行**字符换成空格 ✓ —— 与 `scripts/audit/lib/mask.mjs` 同口径）：
//   否则**行号会被吃掉** ✗（实测：块注释跨两行时，其后第 5 行的违规报成 `line=4` ✗ ——
//   **“行号存在 ≠ 行号正确”** ✓；行注释那条恰好保留了换行 ⇒ 于是那两条 `//` 用例都准 ✗ ⇒ 用例没覆盖块注释这档 ✓）。
const stripCommentsForScan = (src) => String(src ?? '')
	.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
	.replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDITOR = join(ROOT, 'editor');
const CORE = join(EDITOR, 'lib', 'core');
const HOSTS = [join(EDITOR, 'cli.mjs'), join(EDITOR, 'lib', 'host')];

let bad = 0;
const ok = (label, cond, extra = '') => { if (cond) console.log(`  ✓ ${label}${extra ? ' · ' + extra : ''}`); else { bad++; console.error(`  ✗ ${label}${extra ? ' · ' + extra : ''}`); } };

/** 收集一个目录下的 `.mjs`（不递归进 `node_modules`）。 */
const mjsFiles = (dir) => {
	if (!existsSync(dir)) return [];
	const out = [];
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (name === 'node_modules' || name.startsWith('.')) continue;
		if (statSync(p).isDirectory()) out.push(...mjsFiles(p));
		else if (name.endsWith('.mjs')) out.push(p);
	}
	return out;
};

/** 纯函数①：文件名 → 文本 ⇒ `{ name: [文件…] }`（**定义**处）。
 *  两种粒度分开（第一版把二者混在一起 ⇒ 报了一堆通用局部名 ✗ `main`/`selftest`/`argOf` ✗ = 假阳性）：
 *   · `exported`：**导出名**的定义处 ✓ ——“两个文件导出同名能力”就是两份内核 ✗；
 *   · `any`：**任何**定义处（含非导出）✓ —— 只用于“core 能力不许在 core 之外再出现”✗（抄的人往往不导出 ✓）。 */
export const definitionsOf = (files) => {
	const exported = new Map(), any = new Map();
	const P_EXPORT = [
		/^\s*export\s+const\s+([A-Za-z_$][\w$]*)\s*=/gm,
		/^\s*export\s+function\s+([A-Za-z_$][\w$]*)\s*\(/gm,
		/^\s*export\s+async\s+function\s+([A-Za-z_$][\w$]*)\s*\(/gm,
		/^\s*export\s+(?:let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm,
	];
	const P_ANY = [...P_EXPORT,
		/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\(|function|async)/gm,
		/^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/gm,
	];
	const push = (map, name, path) => { if (name.length < 3) return; if (!map.has(name)) map.set(name, []); if (!map.get(name).includes(path)) map.get(name).push(path); };
	for (const [path, text] of files) {
		for (const re of P_EXPORT) for (const m of String(text).matchAll(re)) push(exported, m[1], path);
		for (const re of P_ANY) for (const m of String(text).matchAll(re)) push(any, m[1], path);
	}
	return { exported, any };
};

/** 纯函数②：**导出名**在 ≥2 个文件被定义 ⇒ 两份内核（判据①）。 */
export const duplicateExportProblems = ({ exported }) => {
	const out = [];
	for (const [name, paths] of exported) if (paths.length > 1) out.push({ name, paths });
	return out.sort((a, b) => b.paths.length - a.paths.length || a.name.localeCompare(b.name));
};

/** 纯函数②b：`coreExports`（内核导出的能力名）若在 `allowedDir` 之外**再被定义**（含非导出副本）⇒ 问题（判据①b）。 */
export const secondCopyProblems = ({ any }, coreExports, allowedDir) => {
	const out = [];
	for (const name of coreExports) {
		const paths = (any.get(name) ?? []).filter((p) => !p.startsWith(allowedDir));
		if (paths.length) out.push({ name, paths });
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
};

/** 纯函数④：**内核不许碰宿主**（`#794` 第 3 步）—— `editor/lib/core/**` 里出现 `node:*`（或裸的宿主模块名）⇒ 问题。
 *  为什么需要它：①②③管的是“有没有**第二份实现**”✗；这一条管的是“内核有没有**偷偷碰宿主**”✗ ——
 *  它是“**浏览器安全**”从**口号**变成**可机检**的那一步 ✓（否则只能靠“我记得别写”✗）。
 *  只扫 `.mjs` 的直接源码（**先遮注释** ⇒ 注释里提 `node:fs` 不算 ✗）。 */
export const coreHostProblems = (files) => {
	const HOST_ONLY = ['fs', 'vm', 'child_process', 'path', 'os', 'worker_threads', 'net', 'http', 'https', 'url', 'crypto', 'module', 'process'];
	const out = [];
	for (const [path, text] of files) {
		const t = stripCommentsForScan(text);
		const specs = [
			...[...t.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => [m[1], m.index]),
			...[...t.matchAll(/\bimport\s+['"]([^'"]+)['"]/g)].map((m) => [m[1], m.index]),
			// **动态形也要挡** ✗（**函数级实测**才会发现它 ✓ —— 只读代码看不出来 ✓）：`import(` 与 `import (` **都要** —— `\s*\(` 允许中间空白 ✓
			//（我第一版只写紧接括号 ⇒ 带空格的写法会被漏 ✗，后续修复修正了这点 ✓）。
			...[...t.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g)].map((m) => [m[1], m.index]),
			...[...t.matchAll(/\brequire\(\s*['"]([^'"]+)['"]/g)].map((m) => [m[1], m.index]),
		];
		for (const [s, at] of specs) {
			const bare = String(s).replace(/^node:/, '');
			// **豁免面写死** ✓：只被主流程对 `lib/core` 调用 ✓（`lib/host/**` 本来就该碰 fs/vm/child_process ✓）；
			// 也**不得**把扫描面放宽到 `editor/lib/**` ✗（会误报 `lib/host/literals.mjs` 的 `node:vm` ✓——那是合法的 ✓）。
			if (String(s).startsWith('node:') || HOST_ONLY.includes(bare)) out.push({ path, token: s, line: t.slice(0, at).split('\n').length });
		}
	}
	return out;
};

/** L1（`#794`）：**原语写只许出现在 `lib/host/**`** ✓ —— 代替旧口径（"同文件内写调用 ＋ 字面 `stories/`"）。
 *  为什么换：旧口径的**声称**（"壳里不许写故事文件"）**大于它的覆盖** ✗ —— 实测三形：
 *   字面路径＋写＝命中 ✓／**运行期拼路径＋写＝漏** ✗／**host helper 写＋运行期路径＝漏** ✗。
 *  新口径直接**不依赖路径长什么样** ✓：只要在 `lib/host/**` 之外出现原语写 ⇒ 红 ✓（覆盖与声称对齐 ✓）。
 *  与 L2 的分工：L1 ＝**原语级**（谁调了 fs 写 ✓，本函数）；L2 ＝**语义级**（写故事包只许经 `writeStoryPackage` ✓，由 core 的测试用**记录型 io** 验 ✓）。 */
export const primitiveWriteProblems = (files, hostDir = 'editor/lib/host') => {
	const out = [];
	for (const [path, text] of files) {
		if (String(path).startsWith(hostDir)) continue;          // 宿主层：本来就该写 ✓
		// ⚠️ **必须遮字符串** ✗：观测对象是"**代码里的调用**" ✓，而字符串里写 `writeFileSync(...)` 只是**片段**
		//（例如本门自己的自证用例 ✓）⇒ 不遮就会**自咬** ✓（今天实测侥幸没咬——取决于用例字符串当时怎么写 ✓
		// ⇒ 把"侥幸"换成"口径" ✓）。与 ③b 同一条规则：**遮蔽口径与观测对象匹配** ✓。
		const t = maskAll(text);
		for (const m of t.matchAll(/\b(writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|writevSync)\s*\(/g)) {
			out.push({ path, token: m[1], line: t.slice(0, m.index).split('\n').length });
		}
	}
	return out;
};

/** ③b（`#794`）：**内核不许碰宿主全局**（浏览器侧那一半 ✓）—— 与 ③a 对称：
 *   ③a 挡 **Node 侧 import**（`node:*`／裸宿主模块 ✓）；③b 挡 **宿主全局**（**两宿主各自特有**的那些 ✓）。
 *  为什么两边都要：core 的约束是"**两宿主都能跑**" ✗ ⇒ 只挡 Node 侧只挡了一半 ✗（与"只挡静态 import"同族 ✓）。
 *  ⚠️ **不进表**的东西（进了就会误报一片 ⇒ 门会被关掉 ✗）：`JSON`/`Math`/`Promise`/`Object`/`Array` 等**通用**全局 ✓；
 *   还有 **`console`** ✗ —— 它两宿主都有、core 里**可用** ✓；"core 不该拿它当输出通道"是**另一条判据**
 *   （"诊断是数据" ✓）⇒ **别把两个问题绑在一起** ✗。
 *  ⚠️ **必须同时覆盖 `globalThis.<名>`** ✗（只匹配裸标识符会漏它 ✓ —— 与 `#806` 漏动态 import 同族 ✓；
 *   反过来，**属性访问** `io.fetch` ✗ 不该报 ⇒ 裸名那条加负向后顾 ✓）。
 *  报文要**告诉人怎么办** ✓：该能力应由**宿主注入** ✓（`fetch` 尤其典型：WebUI 天然有 ✓、CLI 经 `node:fs` ✓
 *   ⇒ 同一条缝两实现 ✓，如 `evalLiteral` ✓）。 */
/** 命中是否落在**该行引号之外** ✓ —— 依据是**语义**：**"伸手"不可能发生在字符串里** ✗
 *  （在字符串里写 `window.` 只是**数据**；只有裸写才是**真的去取** ✓）。
 *  为什么不用现成遮蔽器：实测 `maskAll` 在 `emit.mjs`（大量模板串/转义 ✓）上**失准** ✗ ⇒ 残留 5 处假报 ✓；
 *  行内判定的失效模式是"漏报字符串里的假用法" ✓ —— 而那本来就不是用法 ✓ ⇒ 方向安全 ✓。 */
export const outsideQuotes = (line, col) => {
	let q = null;
	for (let i = 0; i < col; i++) {
		const c = line[i];
		if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
		if (c === "'" || c === '"' || c === '`') q = c;
	}
	return q === null;
};

export const coreHostGlobalProblems = (files) => {
	const GLOBALS = ['document', 'window', 'fetch', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'process', 'Buffer', '__dirname', 'require', 'navigator', 'location', 'alert'];
	// ⚠️ 只看**用法**（`名(` 调用 ／ `名.` 属性访问 ✓），不看"出现" ✗ —— 因为 core 会**合法地提及**它们：
	// `classify.mjs` 在字符串与**正则字面量**里提 `window.Sg.story`（它扫源码文本是本职 ✓）。
	// 实测：只看"出现" ⇒ 35 处误报 ✗；遮字符串后仍 19 处 ✗（`maskAll` 不遮正则 ✗）⇒ 改成看用法的这一刻归零 ✓。
	const re = new RegExp(String.raw`(?<![.\w$])(?:${GLOBALS.join('|')})\s*[.(]|globalThis\.(?:${GLOBALS.join('|')})\b`, 'g');
	const out = [];
	for (const [path, text] of files) {
		// ⚠️ 遮蔽口径**与 ③a 相反** ✓：③a 看**说明符**（在字符串里 ✓）⇒ **不能**遮字符串；
		// ③b 看**标识符用法** ⇒ **必须**遮字符串／正则 ✓ —— 否则 `classify.mjs` 在字符串里提 `window.Sg.story`
		// （它扫源码文本是本职 ✓）会被误报 ✗（实测：35 处全是它 ✓）。⇒ **遮蔽口径必须与判据的观测对象匹配** ✓。
		const t = maskAll(text);
		for (const m of t.matchAll(re)) {
			const line = t.slice(0, m.index).split('\n').length;
			// ⚠️ 引号判定要跑在**原始行**上 ✓ —— 遮蔽文本里引号已被换成空格 ✗（我第一版就栽在这 ✓）；
			//    索引可以照用遮蔽文本的 ✓，因为 `maskAll` **保长** ✓（这正是它保长的用处之一 ✓）。
			const lineText = String(text).split('\n')[line - 1] ?? '';
			const col = m.index - (t.slice(0, m.index).lastIndexOf('\n') + 1);
			if (!outsideQuotes(lineText, col)) continue;          // 字符串里的提及不是用法 ✓
			out.push({ path, token: m[0], line });
		}
	}
	return out;
};

/** L1′（`#794`）：**删除原语只许删非故事面** —— 与 L1 **分开的一条判据** ✗（不并进 L1）。
 *  为什么不并：L1 的理由是"**故事文件的写**只有一条路" ✓ ⇒ 把删除也做成**路径无关** ✗ 会连
 *  `rmSync(tmpdir())`／`rmSync(build/generated)` 一起咬 ✗ ⇒ 那是**把判据外推到它理由之外** ✗
 *  （＝今天那条规则的第②面：**声称 vs 覆盖** ✓）。
 *  ⇒ L1′ 的判据：**删除原语的参数里出现 `stories/` 才算** ✓（其理由正是"别从壳里删故事文件" ✓）。
 *  ⚠️ **显式边界** ✓：**运行期拼路径的删除不在覆盖内** ✗（`const p = join('stories', …); rmSync(p)` ⇒ 本判据**看不见** ✓）
 *  —— 别假装覆盖 ✓（与本门"引号未闭合 ⇒ 明记边界"同形 ✓）；要收它得做数据流分析（成本高、收益低 ✗）。 */
export const deleteStoryProblems = (files) => {
	const out = [];
	for (const [path, text] of files) {
		// ⚠️ 遮蔽口径**与 L1 相反** ✓（今天第三个口径 ✓）：L1′ 的观测对象是"**调用参数里的字符串**" ✓
		// ⇒ **不能**遮字符串 ✗；但又要防"字符串里的**提及**" ✗ ⇒ 用 `outsideQuotes` 判"**调用本身**是否在引号外" ✓
		// （与 ③b 同一把工具、同样跑在**原始行**上 ✓ —— 因为索引可跨用：遮蔽器**保长** ✓）。
		// ⇒ 三个口径并排：L1 遮字符串（看代码调用）· L1′ 不遮字符串但查调用位置（看参数）· ③a 不遮（看说明符）✓。
		const t = stripCommentsForScan(text);
		for (const m of t.matchAll(/\b(rmSync|unlinkSync|rmdirSync|unlink|rmdir|rm)\s*\(([^)\n]*)/g)) {
			if (!/stories\//.test(m[2])) continue;
			const line = t.slice(0, m.index).split('\n').length;
			const lineText = String(text).split('\n')[line - 1] ?? '';
			const col = m.index - (t.slice(0, m.index).lastIndexOf('\n') + 1);
			if (!outsideQuotes(lineText, col)) continue;          // 字符串里的**提及**不是调用 ✓
			out.push({ path, token: m[1], line });
		}
	}
	return out;
};

/** 纯函数③：壳文件里对 `stories/**` 的写入 ⇒ 问题（单一写路 ✓）。 */
export const shellWriteProblems = (files) => {
	const out = [];
	for (const [path, text] of files) {
		if (/writeFileSync|writeFile\(|createWriteStream/.test(text) && /stories\//.test(text)) out.push({ path });
	}
	return out;
};

if (isMain && process.argv.includes('--selftest')) {
	const cases = [
		['正例·同一导出名只定义一处 ⇒ 不报', duplicateExportProblems(definitionsOf([['a.mjs', 'export const foo = 1;\n']])).length === 0],
		['🔴 反例·两个文件导出同名 ⇒ 报（两份内核）', duplicateExportProblems(definitionsOf([['a.mjs', 'export const foo = 1;\n'], ['b.mjs', 'export function foo() {}\n']])).length === 1],
		['边界·通用局部名（`main`/`argOf`）在多文件各有一份 ⇒ **不报**（第一版在这里报了一堆假阳性 ✗）', duplicateExportProblems(definitionsOf([['a.mjs', 'function main() {}\n'], ['b.mjs', 'function main() {}\n']])).length === 0],
		['边界·重导出**不算**定义', duplicateExportProblems(definitionsOf([['a.mjs', 'export const foo = 1;\n'], ['b.mjs', "export { foo } from './a.mjs';\n"]])).length === 0],
		['🔴 反例·core 能力在 core 之外被**非导出**抄一份 ⇒ 报', secondCopyProblems(definitionsOf([['editor/lib/core/x.mjs', 'export const compile = () => 1;\n'], ['editor/cli.mjs', 'const compile = () => 2;\n']]), ['compile'], 'editor/lib/core').length === 1],
		['边界·core 内部自己定义 ⇒ 不报', secondCopyProblems(definitionsOf([['editor/lib/core/x.mjs', 'export const compile = () => 1;\n']]), ['compile'], 'editor/lib/core').length === 0],
		['🔴 反例·壳里写 stories/** ⇒ 报（单一写路）', shellWriteProblems([['cli.mjs', "writeFileSync('stories/x/15-tables.twee', t)"]]).length === 1],
		['边界·壳里只读不写 ⇒ 不报', shellWriteProblems([['cli.mjs', "readFileSync('stories/x/15-tables.twee')"]]).length === 0],
		// L1（`#794`）：原语写只许出现在 `lib/host/**` —— 换掉的正是「覆盖小于声称」那个口径 ✗
		['🔴 反例·工具里字面路径写 ⇒ 报', primitiveWriteProblems([['editor/tool.mjs', "writeFileSync('stories/x/15-tables.twee', t)"]]).length === 1],
				['🔴 反例·壳里**真写**（代码里的调用）⇒ 必报 ✓', primitiveWriteProblems([['editor/tool.mjs', "await io.writeText(p, t);\nwriteFileSync(p2, t);"]]).length === 1],
				['🔴 反例·壳里 `rmSync(\'stories/x\')` ⇒ 报（L1′：落到 stories/** 的删除 ✓）', deleteStoryProblems([['editor/tool.mjs', "rmSync('stories/x/15-tables.twee');"]]).length === 1],
		['边界·`rmSync(tmpdir())` ⇒ **不报**（L1′ 的理由只管故事面 ✓ —— 并进 L1 就会误伤它 ✗）', deleteStoryProblems([['editor/tool.mjs', 'rmSync(mkdtempSync(tmpdir()));']]).length === 0],
		['边界·`rmSync(build/generated)` ⇒ 不报 ✓', deleteStoryProblems([['editor/tool.mjs', "rmSync('build/generated/x');"]]).length === 0],
		['边界·**运行期拼路径**的删除 ⇒ 不报（**显式边界** ✓ 不假装覆盖 ✗）', deleteStoryProblems([['editor/tool.mjs', "const p = join('stories', s); rmSync(p);"]]).length === 0],
['边界·**字符串里含片段** ⇒ 不报（不遮字符串就会自咬 ✓）', primitiveWriteProblems([['editor/tool.mjs', "const s = \"writeFileSync('stories/x', t)\";"]]).length === 0],
['🔴 反例·工具里运行期拼路径写 ⇒ 也必须报（旧口径这里漏 ✗）', primitiveWriteProblems([['editor/tool.mjs', "const p = join('stories', slug, 'x');\nwriteFileSync(p, t);"]]).length === 1],
		['边界·lib/host 里的原语写 ⇒ 允许 ✓（宿主层本来就该写 ✓）', primitiveWriteProblems([['editor/lib/host/fs.mjs', 'writeFileSync(p, t)']]).length === 0],
		['边界·只经 host helper 写（自己不调原语）⇒ 不报（语义级由 L2 守 ✓）', primitiveWriteProblems([['editor/tool.mjs', 'await io.writeText(p, t);']]).length === 0],
		['③ 命中必须点名 file:line', (primitiveWriteProblems([['editor/tool.mjs', "// x\nwriteFileSync('a', t);"]])[0] ?? {}).line === 2],
		// ③b（宿主全局，浏览器侧那一半 ✓）：含 guest 点的 `globalThis.<名>` 形 ✗ 与三条边界 ✓
		['🔴 反例·裸 `fetch(` ⇒ 报', coreHostGlobalProblems([['editor/lib/core/x.mjs', 'const r = fetch(u);']]).length === 1],
		['🔴 反例·`globalThis.fetch` ⇒ 也必须报（只匹配裸名会漏它 ✗ —— 与漏动态 import 同族 ✓）', coreHostGlobalProblems([['editor/lib/core/x.mjs', 'const r = globalThis.fetch(u);']]).length === 1],
		['边界·字符串里的 `window.` ⇒ 不报（emit.mjs 生成代码片段的形状 ✓；依据是语义：伸手不可能发生在字符串里 ✓）', coreHostGlobalProblems([['editor/lib/core/x.mjs', "if (S(c).startsWith('window.')) return c;"]]).length === 0],
		['边界·属性访问 `io.fetch` ⇒ 不报（合法 ✓）', coreHostGlobalProblems([['editor/lib/core/x.mjs', 'io.fetch(u);']]).length === 0],
		['边界·通用全局与 console ⇒ 不进表／不报（否则误报一片 ⇒ 门会被关掉 ✗）', coreHostGlobalProblems([['editor/lib/core/x.mjs', 'JSON.parse(t); Math.max(1,2); console.log(1);']]).length === 0],
		// **双向**用例（guest 补的那条是关键 ✗）：**同一行既有引号又有真用法** ⇒ 行内引号判定不许把整行当字符串 ✗
		['🔴 反例·同一行「引号 ＋ 真用法」⇒ 必须报（行内判定把整行当字符串就会漏 ✗）', coreHostGlobalProblems([['editor/lib/core/x.mjs', "const u = 'x'; fetch(u);"]]).length === 1],
		['🔴 反例·同一行「真用法 ＋ 引号」（顺序相反）⇒ 也必须报', coreHostGlobalProblems([['editor/lib/core/x.mjs', "fetch(u); const u = 'x';"]]).length === 1],
		['🔴 反例·两个引号之后还有真用法 ⇒ 保长索引不许错位', coreHostGlobalProblems([['editor/lib/core/x.mjs', "const a = 'p'; const b = 'q'; window.Sg = 1;"]]).length === 1],
		// 已知边界（**不判红、写理由** ✓）：同一行里引号**未闭合**（非法 JS，只有模板串允许跨行 ✗）⇒ 整行被判为串内 ⇒ 可能漏 ✓。
		// 该输入**不能运行** ✓ ⇒ 漏它不影响真实代码 ✓；若将来要收，方向是"按模板串真实跨行状态跟踪"（成本高、收益低 ✗）。
		['🔴 反例·core 里 import `node:fs` ⇒ 报（内核碰宿主 ✗）', coreHostProblems([['editor/lib/core/a.mjs', "import { readFileSync } from 'node:fs';\n"]]).length === 1],
		['🔴 反例·core 里 **动态** import ⇒ 报（只挡静态等于只挡一半 ✗）', coreHostProblems([['editor/lib/core/a.mjs', "const fs = await import('node:child_process');\n"]]).length === 1],
		['🔴 反例·**带空格**的动态形 ⇒ 也必须报（只写紧接括号会漏它 ✗）', coreHostProblems([['editor/lib/core/a.mjs', "const fs = await import ( 'node:fs' );\n"]]).length === 1],
		['③ 命中必须**点名行号**（判据要点到位 ✓）', (coreHostProblems([['editor/lib/core/a.mjs', "// x\nimport { readFileSync } from 'node:fs';\n"]])[0] ?? {}).line === 2],
		['🔴 反例·core 里裸写 「from vm」（不带 node: 前缀）⇒ 也报', coreHostProblems([['editor/lib/core/a.mjs', "import x from 'vm';\n"]]).length === 1],
		['正例·core 里只 import 同行模块 ⇒ 不报', coreHostProblems([['editor/lib/core/a.mjs', "import { t } from './text.mjs';\n"]]).length === 0],
		['边界·**注释里**提 `node:fs` ⇒ 不报（先遮注释 ✓；遮蔽器必须只遮注释 ✗ 不能连字符串一起遮）', coreHostProblems([['editor/lib/core/a.mjs', "// 这里不用 node:fs\nexport const x = 1;\n"]]).length === 0],
		// “**行号存在 ≠ 行号正确**” ✓（实测抓到过：块注释被换成单个空格 ⇒ 吃掉内部换行 ⇒ 后续行号整体上移 ✗）：
		['③ 块注释**跨两行** ⇒ 其后违规的行号仍准（遮蔽必须保留换行 ✓）', (coreHostProblems([['editor/lib/core/a.mjs', "/* a\n b */\nconst x = 1;\nconst y = 2;\nimport { f } from 'node:fs';\n"]])[0] ?? {}).line === 5],
		['③ 行注释在其前 ⇒ 行号也不偏移', (coreHostProblems([['editor/lib/core/a.mjs', "// c\nconst x = 1;\nimport { f } from 'node:fs';\n"]])[0] ?? {}).line === 3],
	];
	for (const [label, cond] of cases) { if (cond) console.log(`  ✓ 自证·${label}`); else { bad++; console.error(`  ✗ 自证·${label}`); } }
	if (bad) { console.error(`\n✗ 自证未通过（${bad} 项）`); process.exit(1); }
	console.log(`\n✔ 自证通过（${cases.length} 例）`);
	process.exit(0);
}

/** 主跑：**只在被直接执行时**跑 ✓ —— 被 `import` 时不许跑门、更不许 `process.exit` ✗
 *  （否则下游"去喂函数"式探针会被劫持 ✓ —— 本门之前正缺这一层 ✓）。 */
const main = () => {
	console.log('══ K6 门（`#794` 单一内核）—— 能力只许一处定义 · 壳里不许有内核逻辑 · 单一写路 ══');

	const files = mjsFiles(EDITOR).map((p) => [p.slice(ROOT.length + 1), readFileSync(p, 'utf8')]);
	ok('取到 `editor/**` 的模块', files.length > 0, `${files.length} 个`);

	const defs = definitionsOf(files);
	const dups = duplicateExportProblems(defs);
	if (dups.length) for (const d of dups.slice(0, 8)) console.error(`  ✗ 导出能力「${d.name}」被**多处定义**（两份内核 ✗）：${d.paths.join(' · ')}`);
	ok('① 导出能力只许一处定义', dups.length === 0, `重复 ${dups.length} 项`);

	const coreStarted = existsSync(CORE);
	// ③ **内核不许碰宿主**（`#794` 第 3 步）：`lib/core/**` 里出现 `node:*`／裸宿主模块名 ⇒ 红 ✓
	//（“浏览器安全”只有机检得住 ✓；今天 `core` 是干净的 ⇒ 它是**纯红**判据、不需登记表 ✓）。
	if (coreStarted) {
		const coreOnly = mjsFiles(CORE).map((p) => [p.slice(ROOT.length + 1), readFileSync(p, 'utf8')]);
		const hostHits = coreHostProblems(coreOnly);
		for (const h of hostHits.slice(0, 8)) console.error(`  ✗ 内核文件「${h.path}:${h.line}」引了宿主能力「${h.token}」⇒ 破坏了浏览器安全 ✗（应经 **注入的宿主能力** 取 ✓）`);
		ok('③ 内核不碰宿主（`lib/core/**` 无 `node:*`／裸宿主模块）', hostHits.length === 0, `core ${coreOnly.length} 个文件 · 命中 ${hostHits.length}`);
		// ③b（`#794`）：**浏览器侧那一半** —— 宿主全局（含 `globalThis.<名>` 形 ✗）；通用全局与 `console` **不进表** ✗
		const globalHits = coreHostGlobalProblems(coreOnly);
		for (const h of globalHits.slice(0, 8)) console.error(`  ✗ 内核文件「${h.path}:${h.line}」用到宿主全局「${h.token}」⇒ **两宿主都能跑**是 core 的硬约束 ✗（该能力应由**宿主注入** ✓，如 evalLiteral／io ✓）`);
		ok('③b 内核不碰宿主全局（浏览器侧；`globalThis.<名>` 也挡 ✓；通用全局与 console 不进表 ✓）', globalHits.length === 0, `core ${coreOnly.length} 个文件 · 命中 ${globalHits.length}`);
	} else console.log('  · `editor/lib/core` **尚未出现** ⇒ 判据③ 暂无对象（留痕 ✓，抽取落地后自动生效 ✓）');
	// ①b：`lib/core` 出现后 —— core 导出的能力**不许在 core 之外再被定义**（含非导出副本 ✗，抄的人往往不导出 ✓）
	if (coreStarted) {
		const coreFiles = mjsFiles(CORE).map((p) => p.slice(ROOT.length + 1));
		const coreExports = [...defs.exported.keys()].filter((n) => (defs.exported.get(n) ?? []).some((p) => coreFiles.includes(p)));
		const second = secondCopyProblems(defs, coreExports, 'editor/lib/core');
		for (const s of second.slice(0, 8)) console.error(`  ✗ 内核能力「${s.name}」在 core 之外**被再定义**（第二份内核 ✗）：${s.paths.join(' · ')}`);
		ok('①b core 能力不许在 core 之外再定义', second.length === 0, `core 导出 ${coreExports.length} 个 · 副本 ${second.length}`);
	} else console.log('  · `editor/lib/core` **尚未出现** ⇒ 判据①b 暂无对象（留痕 ✓，抽取落地后自动生效 ✓）');
	// L1（`#794`）：扫面从"cli ＋ host"扩到**全部 `editor/**`** ✓（旧口径的覆盖小于它的声称 ✗）。
	const editors = files;   // 判据① 已经读过全部 editor/**/*.mjs ✓（同一次读取，不重扫 ✓）
	const primWrites = primitiveWriteProblems(editors);
	if (primWrites.length) for (const w of primWrites.slice(0, 8)) console.error(`  ✗ 「${w.path}:${w.line}」出现原语写「${w.token}(…）」⇒ 原语写只许出现在 lib/host/** ✓（换 import 来源或抽到 host ✓）`);
	ok('② 原语写只许出现在 `lib/host/**`（L1；扫**全部** `editor/**` ✓ 不依赖路径长什么样 ✓）', primWrites.length === 0, `扫描 ${editors.length} 个文件 · 违规 ${primWrites.length}`);
	const delHits = deleteStoryProblems(editors);
	for (const h of delHits.slice(0, 8)) console.error(`  ✗ 「${h.path}:${h.line}」用「${h.token}(…）」删 stories/** ⇒ 故事面删除应经 host 的能力 ✓（边界：运行期拼路径的删除**不在覆盖内** ✗）`);
	ok('②b 删除原语不许落到 `stories/**`（L1′；与 L1 分开 ✓；边界：运行期拼路径不覆盖 ✓）', delHits.length === 0, `扫描 ${editors.length} 个文件 · 违规 ${delHits.length}`);
	if (!coreStarted) console.log('  · `editor/lib/core` **尚未出现** ⇒ 内核抽取未开始：本门此刻只跑判据①（②暂无对象）——**这行就是留痕** ✓，抽取落地后自动生效 ✓');

	if (bad) { console.error(`\n✗ K6 门未通过（${bad} 项）—— 防双内核：能力单一定义 · 壳薄 · 单一写路。`); process.exit(1); }
	console.log('\n✔ K6 门通过（单一内核 · 壳薄 · 单一写路）');
};
if (isMain) main();
