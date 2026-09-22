// `#794` `equiv` 弧第 2 票：**碰窗/vm 的助手** → 宿主侧（core 不许碰宿主 K6 ③）。
//注意：**逐字搬家**（行集法可核）：本文件这几块与 `editor/equiv.mjs` 搬家前**逐字节相同**。
import vm from 'node:vm';
import { engineScripts } from './fs.mjs';

/** 浏览器语义的沙箱（`window` 就是全局对象 → `window.Sg = {}` 之后裸 `Sg` 也能解析）。 */
export const sandboxOf = () => {
	// 同样先跑引擎常量（`Game.Era`/`Game.Damage` 是引擎政策，不是故事数据）
	const box = { console: { log() {}, error() {} }, Sg: {} };
	box.window = box;
	vm.createContext(box);
	vm.runInContext(engineScripts(), box, { timeout: 5000 });
	return box;
};

export const runScript = (body) => {
	// **环境契约**（同一族坑的第三处）：故事段会直接读引擎常量（`window.Game.Era.PRESENT` 等）
	// → 沙箱必须**先跑引擎常量**（真加载顺序：`ORDER` 里引擎在前）。少了它，抽出来的/比对的两侧都会静默缺字段。
	const sandbox = { console: { log() {}, error() {} } };
	sandbox.window = sandbox;
	vm.createContext(sandbox);
	vm.runInContext(engineScripts() + '\n' + String(body), sandbox, { timeout: 5000 });
	return sandbox.window;
};

/** 纯函数：在一份**空白** vm 里跑脚本，返回它的 `window`。 */
/** 求值一侧的脚本体，**失败也返回结果**（判据的红要讲人话，不许抛栈 —— 复核席实测：
 * 基线被改坏时 `equiv` 吐的是**崩溃栈**，看红的人会误判"是不是环境坏了"）。 */
export const evalSide = (body, label = '') => {
	try { return { win: runScript(body) }; }
	catch (e) { return { err: `${label}求值失败：${String(e?.message ?? e).slice(0, 140)}` }; }
};
