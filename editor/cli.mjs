// `#794`：**统一入口**（子命令派发）。与各工具**共用同一具身体**（`editor/lib/host/commands.mjs`）✓
// ⇒ 等价性**按构造成立** ✓（不是"两个实现碰巧一致" ✗）。
//
// ⚠️ **主模块守卫**：本文件同时是库（命令表以后 WebUI/测试可能 import ✓）⇒ 只在被当脚本执行时才跑 CLI ✓。
//    `isMain` 的声明必须在 **imports 之后、逻辑之前** ✓ —— 放后面会 TDZ ✗（`Cannot access 'isMain' before initialization`，D 踩过 ✓）。
import { fileURLToPath } from 'node:url';
import { buildCommand, extractCommand, classifyCommand, equivCommand, lintCommand, k4Command, k6Command } from './lib/host/commands.mjs';
import { exitWithRc } from './lib/host/proc.mjs';

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

/** 子命令表（一处定义 ✓；每条命令的函数体在 `lib/host/commands.mjs` ✓）。 */
// `#794`／`#845`：**导出注册表本体** ✓ —— 供 CLI 面等价条目**派生**（每加一条命令自动多一组对照 ✓；
// 手列的话，加第四条时又得有人记得改测试 ✗）。导出**不破坏「一处定义」** ✓（`COMMANDS` 仍只在这里定义一次 ✓ ⇒ K6 ① 不受影响 ✓）。
export const COMMANDS = {
	build: (argv, ctx) => buildCommand(argv, ctx),
	'extract-story': (argv, ctx) => extractCommand(argv, ctx),
	'classify-contract': (argv, ctx) => classifyCommand(argv, ctx),
	equiv: (argv, ctx) => equivCommand(argv, ctx),
	'lint-story': (argv, ctx) => lintCommand(argv, ctx),
	k4: (argv, ctx) => k4Command(argv, ctx),
	k6: (argv, ctx) => k6Command(argv, ctx),
};

const USAGE = [
	'用法：node editor/cli.mjs <子命令> [参数…]',
	'子命令：',
	'  build <slug> [--out=<dir>]   与 `node editor/compile-story.mjs` **同一具身体** ✓',
	'  k6   与 `node editor/k6.mjs` **同一具身体** ✓（防双内核门）',
	'  equiv <slug> [--rules] [--l3=hard|report] [--hand=<file>]   与 `node editor/equiv.mjs` **同一具身体** ✓',
	'  lint-story <slug|目录路径> [--json] [--dist=<file>]   与 `node editor/lint-story.mjs` **同一具身体** ✓',
	'  classify-contract <slug> [--json]   与 `node editor/classify-contract.mjs` **同一具身体** ✓',
	'  extract-story <slug> [--tables] [--from=<file>] [--out=<file>]   与 `node editor/extract-story.mjs` **同一具身体** ✓',
	'  k4（无参数）   与 `node editor/k4.mjs` **同一具身体** ✓（生成物标记 · 新鲜度 · 逃生舱可枚举）',
].join('\n');

/** 无子命令 ⇒ **rc≠0**（不是静默成功 ✗）；`--help` ⇒ rc=0；未知子命令 ⇒ **rc≠0 且点名它** ✗（不静默 fallback ✓）。 */
// **命令体的 rc 契约**（`#794`）：命令体**可以**返回 `number | Promise<number>` ✓（`lint-story` 就是 async ✓ ——
// `gatesForStory` 经逐个 `await import()` 载门模块 ⇒ ESM 无法同步化 ✓）。
// 入口**统一**走 `exitWithRc` ✓：thenable ⇒ await 完再退 ✓；**非 number ⇒ 当场抛** ✗（不许静默
// `process.exit(Promise)` ⇒ rc 变 0 ✗，而**没有任何门会红** ✗）。
export const runCli = (argv = process.argv.slice(2), { prog = 'node editor/cli.mjs' } = {}) => {
	const [cmd, ...rest] = argv;
	if (!cmd) { console.error(USAGE); return 2; }
	if (cmd === '--help' || cmd === '-h') { console.log(USAGE); return 0; }
	const fn = COMMANDS[cmd];
	if (!fn) { console.error(`✗ 未知子命令「${cmd}」（不静默 fallback ✗）\n${USAGE}`); return 2; }
	return fn(rest, { prog, sub: cmd });
};

if (isMain) exitWithRc(runCli());
