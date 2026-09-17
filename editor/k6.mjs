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
import { fileURLToPath } from 'node:url';
// ⚠️ **遮蔽器选型**（一个真踩过的坑 ✓）：
//  · **不能**用 `editor/classify-contract.mjs` 的 `maskAll` ✗ —— 它连**字符串字面量**一起遮 ⇒
//    `from 'node:fs'` 里的说明符被遮掉 ⇒ 本判据**永不触发** ✗（"用错遮蔽器 ⇒ 判据无声失效" ✓）；
//  · `editor/lib/core/text.mjs` 的 `maskComments` 是**局部**未导出 ✗ ⇒ 这里先用**最小实现**（只挡注释 ✓），
//    待它导出后换成它 ✓（**已登记为待办**，属"两处实现必漂移"那族 ✓）。
const stripCommentsForScan = (src) => String(src ?? '').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

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

/** 纯函数③：壳文件里对 `stories/**` 的写入 ⇒ 问题（单一写路 ✓）。 */
export const shellWriteProblems = (files) => {
	const out = [];
	for (const [path, text] of files) {
		if (/writeFileSync|writeFile\(|createWriteStream/.test(text) && /stories\//.test(text)) out.push({ path });
	}
	return out;
};

if (process.argv.includes('--selftest')) {
	const cases = [
		['正例·同一导出名只定义一处 ⇒ 不报', duplicateExportProblems(definitionsOf([['a.mjs', 'export const foo = 1;\n']])).length === 0],
		['🔴 反例·两个文件导出同名 ⇒ 报（两份内核）', duplicateExportProblems(definitionsOf([['a.mjs', 'export const foo = 1;\n'], ['b.mjs', 'export function foo() {}\n']])).length === 1],
		['边界·通用局部名（`main`/`argOf`）在多文件各有一份 ⇒ **不报**（第一版在这里报了一堆假阳性 ✗）', duplicateExportProblems(definitionsOf([['a.mjs', 'function main() {}\n'], ['b.mjs', 'function main() {}\n']])).length === 0],
		['边界·重导出**不算**定义', duplicateExportProblems(definitionsOf([['a.mjs', 'export const foo = 1;\n'], ['b.mjs', "export { foo } from './a.mjs';\n"]])).length === 0],
		['🔴 反例·core 能力在 core 之外被**非导出**抄一份 ⇒ 报', secondCopyProblems(definitionsOf([['editor/lib/core/x.mjs', 'export const compile = () => 1;\n'], ['editor/cli.mjs', 'const compile = () => 2;\n']]), ['compile'], 'editor/lib/core').length === 1],
		['边界·core 内部自己定义 ⇒ 不报', secondCopyProblems(definitionsOf([['editor/lib/core/x.mjs', 'export const compile = () => 1;\n']]), ['compile'], 'editor/lib/core').length === 0],
		['🔴 反例·壳里写 stories/** ⇒ 报（单一写路）', shellWriteProblems([['cli.mjs', "writeFileSync('stories/x/15-tables.twee', t)"]]).length === 1],
		['边界·壳里只读不写 ⇒ 不报', shellWriteProblems([['cli.mjs', "readFileSync('stories/x/15-tables.twee')"]]).length === 0],
		['🔴 反例·core 里 import `node:fs` ⇒ 报（内核碰宿主 ✗）', coreHostProblems([['editor/lib/core/a.mjs', "import { readFileSync } from 'node:fs';\n"]]).length === 1],
		['🔴 反例·core 里 **动态** import ⇒ 报（只挡静态等于只挡一半 ✗）', coreHostProblems([['editor/lib/core/a.mjs', "const fs = await import('node:child_process');\n"]]).length === 1],
		['🔴 反例·**带空格**的动态形 ⇒ 也必须报（只写紧接括号会漏它 ✗）', coreHostProblems([['editor/lib/core/a.mjs', "const fs = await import ( 'node:fs' );\n"]]).length === 1],
		['③ 命中必须**点名行号**（判据要点到位 ✓）', (coreHostProblems([['editor/lib/core/a.mjs', "// x\nimport { readFileSync } from 'node:fs';\n"]])[0] ?? {}).line === 2],
		['🔴 反例·core 里裸写 「from vm」（不带 node: 前缀）⇒ 也报', coreHostProblems([['editor/lib/core/a.mjs', "import x from 'vm';\n"]]).length === 1],
		['正例·core 里只 import 同行模块 ⇒ 不报', coreHostProblems([['editor/lib/core/a.mjs', "import { t } from './text.mjs';\n"]]).length === 0],
		['边界·**注释里**提 `node:fs` ⇒ 不报（先遮注释 ✓；遮蔽器必须只遮注释 ✗ 不能连字符串一起遮）', coreHostProblems([['editor/lib/core/a.mjs', "// 这里不用 node:fs\nexport const x = 1;\n"]]).length === 0],
	];
	for (const [label, cond] of cases) { if (cond) console.log(`  ✓ 自证·${label}`); else { bad++; console.error(`  ✗ 自证·${label}`); } }
	if (bad) { console.error(`\n✗ 自证未通过（${bad} 项）`); process.exit(1); }
	console.log(`\n✔ 自证通过（${cases.length} 例）`);
	process.exit(0);
}

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
} else console.log('  · `editor/lib/core` **尚未出现** ⇒ 判据③ 暂无对象（留痕 ✓，抽取落地后自动生效 ✓）');
// ①b：`lib/core` 出现后 —— core 导出的能力**不许在 core 之外再被定义**（含非导出副本 ✗，抄的人往往不导出 ✓）
if (coreStarted) {
	const coreFiles = mjsFiles(CORE).map((p) => p.slice(ROOT.length + 1));
	const coreExports = [...defs.exported.keys()].filter((n) => (defs.exported.get(n) ?? []).some((p) => coreFiles.includes(p)));
	const second = secondCopyProblems(defs, coreExports, 'editor/lib/core');
	for (const s of second.slice(0, 8)) console.error(`  ✗ 内核能力「${s.name}」在 core 之外**被再定义**（第二份内核 ✗）：${s.paths.join(' · ')}`);
	ok('①b core 能力不许在 core 之外再定义', second.length === 0, `core 导出 ${coreExports.length} 个 · 副本 ${second.length}`);
} else console.log('  · `editor/lib/core` **尚未出现** ⇒ 判据①b 暂无对象（留痕 ✓，抽取落地后自动生效 ✓）');
const hosts = HOSTS.flatMap((p) => (existsSync(p) && statSync(p).isDirectory() ? mjsFiles(p).map((q) => [q.slice(ROOT.length + 1), readFileSync(q, 'utf8')]) : (existsSync(p) ? [[p.slice(ROOT.length + 1), readFileSync(p, 'utf8')]] : [])));
const shellWrites = shellWriteProblems(hosts);
if (shellWrites.length) for (const w of shellWrites) console.error(`  ✗ 壳文件「${w.path}」在写 stories/** ⇒ 违反了单一写路 ✗`);
ok('② 壳里不许写故事文件（单一写路）', shellWrites.length === 0, `壳 ${hosts.length} 个 · 违规 ${shellWrites.length}`);
if (!coreStarted) console.log('  · `editor/lib/core` **尚未出现** ⇒ 内核抽取未开始：本门此刻只跑判据①（②暂无对象）——**这行就是留痕** ✓，抽取落地后自动生效 ✓');

if (bad) { console.error(`\n✗ K6 门未通过（${bad} 项）—— 防双内核：能力单一定义 · 壳薄 · 单一写路。`); process.exit(1); }
console.log('\n✔ K6 门通过（单一内核 · 壳薄 · 单一写路）');
