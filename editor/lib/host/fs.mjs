// `#794` 内核抽取 · **host 层**（Node 侧）：把「宿主能力」集中到一处，供薄壳与 core 的调用方使用。
// 为什么要有这一层：core 必须**浏览器安全**（不得 `node:fs`／`node:child_process`／`node:vm`）
// → 凡"读仓库文件／跑编译器／起子进程"的动作，都由本层实现、以**注入**的形式给 core 用。
// 目标是「一个内核 · 三种宿主」：CLI（Node 实现）· WebUI（iframe 实现）· 测试/门（直接 import）。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { scriptBodies } from '../core/text.mjs';

/** 仓库根（本文件在 `editor/lib/host/` → 上溯三层）。 */
export const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** 引擎常量文件（`Game.Era`／`Game.Damage` 等）——沙箱里必须先跑它（真加载顺序里引擎在前）。 */
export const ENGINE_CONST = 'src/engine/10-const.twee';

/** 引擎常量 ＋ 故事各段共用的「先跑引擎」前缀（`equiv`／`extract-story` 都要）。 */
export const engineScripts = () => scriptBodies(readFileSync(join(ROOT, ENGINE_CONST), 'utf8')).join('\n');

/** 读一份文本（**路径原样**，不自行拼 ROOT —— 有些调用点故意用 cwd 相对路径）。
 *注意：**不要 catch**：`readFileSync` 的 `ENOENT` 文案与退出码是**可观测行为**（错路对拍在比它们）。 */
export const readText = (p) => readFileSync(p, 'utf8');

/** 写一份文本（同上：路径原样、不 catch）。 */
export const writeText = (p, text) => writeFileSync(p, text, 'utf8');

/** 建目录（递归），同上：路径原样、不 catch。 */
export const mkdirp = (dir) => mkdirSync(dir, { recursive: true });

/** 存在性（`readStoryPackage` 用它区分"文件不在"与"解析失败"）。 */
export const exists = (p) => existsSync(p);
