// `#794` 内核抽取 · **host 层**：`vm` 沙箱（跑故事的 `[script]` 段）。
// 为什么住 host：`node:vm` 是宿主能力 ✗ ⇒ core 不许碰 ✓（K6 ③ 在盯 ✓）。
// 为什么抽出来：**命令体**（`lib/host/commands.mjs`）与**本模块的自证**都要用它 ✓
//   ⇒ 只搬命令体、把 runStory 留在壳里 ⇒ 就会出现第二份 ✗（"一处定义"那条纪律 ✓）。
import vm from 'node:vm';
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
