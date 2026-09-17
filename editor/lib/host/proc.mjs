// `#794` 内核抽取 · **host 层**（Node 侧）：跑子进程这件事，集中到这里，供**壳**使用。
// 为什么它属于 host 而不是 core：`child_process` 是宿主能力（浏览器里没有 ✗）——
// core（`editor/lib/core/**`）只能**接参**（谁要给谁 ✓），不许自己 import 这一层 ✓（K6 判据③在盯 ✓）。
//
// 语义**逐字沿用**原调用点（`execFileSync` 的默认为：stdout 被**捕获**（不打印 ✓）、stderr 继承给父进程 ✓）——
// 换实现时最怕"顺手把子进程输出放出来" ✗（那会让 stdout 多出内容 ⇒ CLI 面变了 ⇒ 对拍能看出来 ✓）。
import { execFileSync } from 'node:child_process';

/** 跑一个进程，返回它的 stdout（**字符串**；失败即抛 —— 调用方按需 catch ✓，与 `execFileSync` 一致）。 */
export const runCapture = (cmd, args = [], opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts });

/** 跑一个进程，**不取** stdout（stdout 被捕获后丢弃 ✓，stderr 仍继承 ⇒ 与不带 `encoding` 的 `execFileSync` 同 ✓）。 */
export const run = (cmd, args = [], opts = {}) => execFileSync(cmd, args, opts);

/** 跑 `node <脚本> <参数…>`（多个壳都在做同一件事 ⇒ 一处定义 ✓）。 */
export const runNode = (args = [], opts = {}) => execFileSync('node', args, opts);
