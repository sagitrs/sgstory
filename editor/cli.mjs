// `#794`：**统一入口**（子命令派发）。与各工具**共用同一具身体**（`editor/lib/host/commands.mjs`）✓
// ⇒ 等价性**按构造成立** ✓（不是"两个实现碰巧一致" ✗）。
//
// ⚠️ **主模块守卫**：本文件同时是库（命令表以后 WebUI/测试可能 import ✓）⇒ 只在被当脚本执行时才跑 CLI ✓。
//    `isMain` 的声明必须在 **imports 之后、逻辑之前** ✓ —— 放后面会 TDZ ✗（`Cannot access 'isMain' before initialization`，D 踩过 ✓）。
import { fileURLToPath } from 'node:url';
import { buildCommand, extractCommand, classifyCommand } from './lib/host/commands.mjs';

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

/** 子命令表（一处定义 ✓；每条命令的函数体在 `lib/host/commands.mjs` ✓）。 */
const COMMANDS = {
	build: (argv, ctx) => buildCommand(argv, ctx),
	'extract-story': (argv, ctx) => extractCommand(argv, ctx),
	'classify-contract': (argv, ctx) => classifyCommand(argv, ctx),
};

const USAGE = [
	'用法：node editor/cli.mjs <子命令> [参数…]',
	'子命令：',
	'  build <slug> [--out=<dir>]   与 `node editor/compile-story.mjs` **同一具身体** ✓',
	'  classify-contract <slug> [--json]   与 `node editor/classify-contract.mjs` **同一具身体** ✓',
	'  extract-story <slug> [--tables] [--from=<file>] [--out=<file>]   与 `node editor/extract-story.mjs` **同一具身体** ✓',
].join('\n');

/** 无子命令 ⇒ **rc≠0**（不是静默成功 ✗）；`--help` ⇒ rc=0；未知子命令 ⇒ **rc≠0 且点名它** ✗（不静默 fallback ✓）。 */
export const runCli = (argv = process.argv.slice(2), { prog = 'node editor/cli.mjs' } = {}) => {
	const [cmd, ...rest] = argv;
	if (!cmd) { console.error(USAGE); return 2; }
	if (cmd === '--help' || cmd === '-h') { console.log(USAGE); return 0; }
	const fn = COMMANDS[cmd];
	if (!fn) { console.error(`✗ 未知子命令「${cmd}」（不静默 fallback ✗）\n${USAGE}`); return 2; }
	return fn(rest, { prog, sub: cmd });
};

if (isMain) process.exit(runCli());
