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

// `#794` `k6` 弧：判据（＋助手/常量/`mjsFiles`）已归 `lib/host/k6criteria.mjs` ✓；命令体归 `commands.mjs` ✓。
// ⇒ 本壳只**转出 ＋ 转发** ✓（老调用方不变 ✓）；自证与它的夹具（`let bad`／`ok`）**留在壳侧** ✓。
import { definitionsOf, duplicateExportProblems, secondCopyProblems, coreHostProblems, primitiveWriteProblems,
	outsideQuotes, coreHostGlobalProblems, deleteStoryProblems, shellWriteProblems,
	stripCommentsForScan, mjsFiles } from './lib/host/k6criteria.mjs';
export { definitionsOf, duplicateExportProblems, secondCopyProblems, coreHostProblems, primitiveWriteProblems,
	outsideQuotes, coreHostGlobalProblems, deleteStoryProblems, shellWriteProblems };
import { k6Command } from './lib/host/commands.mjs';

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
// ⚠️ **遮蔽器选型**（一个真踩过的坑 ✓）：
//  · **不能**用 `editor/classify-contract.mjs` 的 `maskAll` ✗ —— 它连**字符串字面量**一起遮 ⇒
//    `from 'node:fs'` 里的说明符被遮掉 ⇒ 本判据**永不触发** ✗（"用错遮蔽器 ⇒ 判据无声失效" ✓）；
//  · `editor/lib/core/text.mjs` 的 `maskComments` 是**局部**未导出 ✗ ⇒ 这里先用**最小实现**（只挡注释 ✓），
//    待它导出后换成它 ✓（**已登记为待办**，属"两处实现必漂移"那族 ✓）。
// ⚠️ **遮蔽必须保留换行** ✓（只把**非换行**字符换成空格 ✓ —— 与 `scripts/audit/lib/mask.mjs` 同口径）：
//   否则**行号会被吃掉** ✗（实测：块注释跨两行时，其后第 5 行的违规报成 `line=4` ✗ ——
//   **“行号存在 ≠ 行号正确”** ✓；行注释那条恰好保留了换行 ⇒ 于是那两条 `//` 用例都准 ✗ ⇒ 用例没覆盖块注释这档 ✓）。

let bad = 0;
const ok = (label, cond, extra = '') => { if (cond) console.log(`  ✓ ${label}${extra ? ' · ' + extra : ''}`); else { bad++; console.error(`  ✗ ${label}${extra ? ' · ' + extra : ''}`); } };

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
// `#794`／`#843` 复核：**壳也要走同一个退出契约** ✓ —— 原来直接 `process.exit(k6Command(…))` ✗，
// 而命令体返回 `undefined` 时 Node 会**折成 0** ✗（实测：拿掉 `return 0` ⇒ 工具路 rc=0 ✗）
// ⇒ rc 契约只在 cli 路生效 ✗。改用 `exitWithRc` ✓（与 `k4`／`lint-story` 同形 ✓）。
import { exitWithRc } from './lib/host/proc.mjs';
if (isMain) exitWithRc(k6Command(process.argv.slice(2), { prog: 'node editor/k6.mjs', sub: '' }));