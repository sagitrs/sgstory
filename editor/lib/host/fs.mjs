// `#794` 内核抽取 · **host 层**（Node 侧）：把「宿主能力」集中到一处，供薄壳与 core 的调用方使用。
// 为什么要有这一层：core 必须**浏览器安全**（不得 `node:fs`／`node:child_process`／`node:vm` ✗）
// ⇒ 凡"读仓库文件／跑编译器／起子进程"的动作，都由本层实现、以**注入**的形式给 core 用。
// 目标是「一个内核 · 三种宿主」：CLI（Node 实现）· WebUI（iframe 实现）· 测试/门（直接 import）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { scriptBodies } from '../core/text.mjs';

/** 仓库根（本文件在 `editor/lib/host/` ⇒ 上溯三层）。 */
export const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** 引擎常量文件（`Game.Era`／`Game.Damage` 等）——沙箱里必须先跑它（真加载顺序里引擎在前）。 */
export const ENGINE_CONST = 'src/engine/10-const.twee';

/** 引擎常量 ＋ 故事各段共用的「先跑引擎」前缀（`equiv`／`extract-story` 都要）。 */
export const engineScripts = () => scriptBodies(readFileSync(join(ROOT, ENGINE_CONST), 'utf8')).join('\n');

/** 读仓库内的一份文本（宿主能力的最小面）。 */
export const readText = (relOrAbs) => readFileSync(relOrAbs.startsWith('/') ? relOrAbs : join(ROOT, relOrAbs), 'utf8');
