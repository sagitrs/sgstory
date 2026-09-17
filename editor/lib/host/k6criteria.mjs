// `#794` 第 4 条 · `k6` 弧：**K6 门判据**（9 个函数 ＋ 扫描助手 ＋ 路径常量 ✓）—— 归 **host** ✓。
// ⚠️ **为什么不是 core** ✓：第一版按"看起来纯"放 core ✗ ⇒ 被**真 import** 否掉 ✓（用 `join`／`dirname`／
//   `fileURLToPath` ⇒ 不纯 ✗）；而 **K6 ③ 的口径**正是"core 不许碰宿主" ✓ ⇒ 是**适用面**（＝判据的理由）
//   要求它们住 host ✓。
// ⚠️ **按实测坐标整块搬** ✓ —— 本文件块内**夹着**自证夹具（`:44–:45` ✓）与 `mjsFiles`（`:47–:58` ✓）⇒
//   按空行推断块尾会**吞邻居** ✗、按括号配平会被**正则字面量**带偏 ✗（两种今天都实测踩到 ✓）。
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { maskAll } from '../core/contract.mjs';

export const stripCommentsForScan = (src) => String(src ?? '')
	.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
	.replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

// 路径常量与两件助手：**命令体（host）与壳都要用** ⇒ 一并转出 ✓（原来它们是模块级私有 ✓）。
// ⚠️ **搬进 `editor/lib/host/` 后，原来的相对算术会静默变** ✗：原文件在 `editor/` ⇒ `dirname(...) + '..'` ＝**仓根** ✓；
//   搬来后同样的写法 ⇒ 上一层是 `editor/lib` ✗ ⇒ `EDITOR`/`CORE`/`HOSTS` 全错 ✗（**模块自己的位置是它语义的一部分** ✓）。
//   ⇒ 逐级上溯写死 ✓ ＋ **load-time 断言**（算错了当场红 ✗，不许静默 ✓）。
const HERE = dirname(fileURLToPath(import.meta.url));   // editor/lib/host
export const REPO_ROOT = join(HERE, '..', '..', '..');   // 仓根 ✓（**不叫 `ROOT`** ✗：`fs.mjs` 已导出 `ROOT`（且**带尾斜杠** ✗）⇒
//   同名会让 K6 ① 报"两份内核" ✓，而两者语义确实不同（一个带尾斜杠 ✓）⇒ **一名一物** ✓。）
export const EDITOR = join(REPO_ROOT, 'editor');
if (!existsSync(join(EDITOR, 'cli.mjs'))) throw new Error(`k6 判据模块算错了根路径 ✗：EDITOR=${EDITOR}（模块位置变了 ⇒ 相对算术要改 ✓）`);
export const CORE = join(EDITOR, 'lib', 'core');
export const HOSTS = [join(EDITOR, 'cli.mjs'), join(EDITOR, 'lib', 'host')];

/** 收集一个目录下的 `.mjs`（不递归进 `node_modules`）—— 判据的**取数**步骤 ✓（随判据一起搬 ✓）。 */
export const mjsFiles = (dir) => {
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
