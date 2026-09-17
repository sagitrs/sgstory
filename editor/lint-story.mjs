// 故事包 lint（`#762` P0 · 车道 E 第一步 · 伞 `#761`／D-session `#215`）
//
// 「保存即 lint」的 CLI：给一份**故事包**（`stories/<slug>/`，真源＝`data/*.json`）⇒ 回答
// 「编译得动吗 · 和冻结基线等价吗 · 它自己的门全绿吗」——**输出与门同结论**（门一律经 `scripts/audit.mjs`
// 原调用路径跑，本工具不重实现任何判据）。
//
// 用法：node editor/lint-story.mjs <slug|目录路径> [--json] [--dist=<index.html 路径>]
//   `--json`：诊断是数据（findings 以 JSON 打给 stdout）｜`--dist`：部分故事门（a11y 等）需要构建产物，
//   缺了要给**明确前置 finding**（"先去 build"），不许把"环境态缺失"混成"判据不通过"。
//   步骤：① 包形状 ② 编译＋幂等 ③ 等价（显式冻结基线 ＋ L3 report）④ 故事自己的门（audit 原路径）⑤ 形状门。
//
// `#794` 第 4 条：**命令体已搬到 `lib/host/commands.mjs` 的 `lintCommand`** ✓ ——
//   本壳只做两件事：**转发自己的 argv** ✓（`sub: ''` ⇒ 用法行报自己的程序名 ✓，与另三壳同形 ✓）
//   与**统一退出**（`exitWithRc` ✓：命令体是 **async** ✓ —— 因 `gatesForStory` 经逐个 `await import()` 载门模块，
//   ESM 无法同步化 ✓ ⇒ 入口统一 await ＋ **rc 必须是 number**（非 number 当场抛 ✗，不许静默 0 ✓））。
import { fileURLToPath } from 'node:url';
import { lintCommand } from './lib/host/commands.mjs';
import { exitWithRc } from './lib/host/proc.mjs';

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) exitWithRc(lintCommand(process.argv.slice(2), { prog: 'node editor/lint-story.mjs', sub: '' }));
