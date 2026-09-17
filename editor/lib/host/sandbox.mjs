// `#794` 内核抽取 · **host 层**：`vm` 沙箱（跑故事的 `[script]` 段）。
//
// ⚠️ **威胁模型（明文，不是默会）**：本沙箱只用来跑**本仓自己的故事脚本** ✓，**不是**用来处理不可信输入的 ✗
//   —— `node:vm` **不是安全边界** ✓：实测 `Sg.constructor.constructor('return typeof process')()` 取得 `"object"`
//   （`Sg`／`Game` 是**宿主域对象** ⇒ 存在逃逸桥 ✓；**旧实现逐字相同** ⇒ 既有事实，不是抽取引入的 ✗）。
//   ⇒ 结论：**已知且接受** ✓（跑自己的脚本 ✓），但**不得**把本沙箱当作隔离外部输入的机制 ✗；
//   真要跑不可信脚本 ⇒ 必须换真隔离（独立进程／`--experimental-permission` 一类 ✓），那是**另一件事** ✓。
// 为什么住 host：`node:vm` 是宿主能力 ✗ ⇒ core 不许碰 ✓（K6 ③ 在盯 ✓）。
// 为什么抽出来：**命令体**（`lib/host/commands.mjs`）与**本模块的自证**都要用它 ✓
//   ⇒ 只搬命令体、把 runStory 留在壳里 ⇒ 就会出现第二份 ✗（"一处定义"那条纪律 ✓）。
import vm from 'node:vm';
import { join } from 'node:path';
import { readText, ROOT, engineScripts } from './fs.mjs';
import { scriptBodies } from '../core/text.mjs';
import { sectionFile } from '../core/story.mjs';
export const runStory = (scripts, { preset = true } = {}) => {
	const diag = [];
	// 预置两个根容器：故事的各 `[script]` 段之间**互有依赖**（`15-tables` 建 `window.Sg`／`Game`，
	// `17-rules` 直接用 `window.Sg.story ??= {}`）——只跑其中一段时必须先给容器，否则 `TypeError: … reading 'story'`。
	const sandbox = { console: { log: (...a) => diag.push(a.join(' ')), error: (...a) => diag.push(a.join(' ')) } };
	sandbox.window = sandbox;
	if (preset) { sandbox.Sg = {}; sandbox.Game = {}; }
	vm.createContext(sandbox);
	vm.runInContext(String(scripts), sandbox, { timeout: 5000 });
	return { Sg: sandbox.Sg, Game: sandbox.Game, diag };
};

/** 纯函数：把 `() => <局部常量>` 解析成它的**值**（不手抄）。
 *  做法：在浏览器语义沙箱里跑该文件的 `[script]` 段 ＋ 追加一行 `window.__probe = <标识符>;` ⇒ 读出来。
 *  取不到（未定义/非 JSON 化）⇒ 返回 null（调用方保持 B 桶，不假装成功）。
 *  住 host ✓（用 `node:vm` ✓）；与 `runStory` 同窝 ✓（两个都是"跑一段脚本、取它的世界" ✓）。
 *  ⚠️ 夹具注意：若夹具里出现 `Object.assign((window.Sg.story ??= {}), …)`，缺 `window.Sg` 会落 catch ⇒ 返回 null ✓
 *  （判 B 是**形状问题**，不是本函数坏了 ✓ —— 我一次探针就是这么误标的 ✗）。 */
export const resolveLocalConst = (fileText, sectionName, ident) => {
	const bodies = scriptBodies(fileText);
	const box = { console: { log() {}, error() {} } };
	box.window = box;
	vm.createContext(box);
	try {
		vm.runInContext(engineScripts() + '\n' + bodies.join('\n') + `\n;window.__probe = (typeof ${ident} === 'function' ? undefined : ${ident});`, box, { timeout: 5000 });
	} catch { return null; }
	const v = box.__probe;
	if (v === undefined) return null;
	try { return JSON.parse(JSON.stringify(v)); } catch { return null; }
};

/** 引擎常量 ＋ 故事某一段的脚本体（**读文件** ⇒ 住 host ✓）。
 *  **消费者现状**：命令体（`lib/host/commands.mjs`，下一票）✓；**自证目前不消费它** ✗（同 `sectionFile` ✓）。 */
export const engineOf = (slug, fromPath = null) => {
	const text = readText(fromPath ?? join(ROOT, `stories/${slug}/${sectionFile('Game Tables')}`));
	return engineScripts() + '\n' + scriptBodies(text).join('\n');
};
