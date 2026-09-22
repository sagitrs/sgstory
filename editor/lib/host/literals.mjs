// `#794` 内核抽取 · **host 层**（Node 侧）：把「源码文本 → 值」这件事**注入**给 core。
// 为什么它必须在 host：这里用 `node:vm` 求值 → 浏览器里没有 → core（浏览器安全）不得直接用它，
// 只能由宿主提供等价能力（WebUI 侧是 iframe／真浏览器；CLI 侧是本文件）。
// 搬动方式：**逐字搬家**，只把 vm 依赖留在这一层 —— 它是"字面量→值"的唯一权威，动它最容易假改。
import vm from 'node:vm';

/** **宿主能力**：`literalValue(src)` —— 见上（同名前身住在 `editor/classify-contract.mjs`）。 */
export const literalValue = (src) => {
	try {
		const v = vm.runInContext(`(${String(src)})`, vm.createContext({ console: { log() {} } }), { timeout: 1000 });
		//注意：**值里含函数 → 一律不当字面量**：`JSON.parse(JSON.stringify(...))` 会把函数**静默丢掉** →
		// 判成 `const` 后一旦数据化 → 函数消失、行为静默改变（实测：`socialHooks` 这类"字面量＋函数"的成员
		// 曾被判 A —— 那是**假 A**）。→ 深查一层，含函数就返回 undefined（调用方落 B，诚实）。
		const hasFn = (x, d = 0) => {
			if (typeof x === 'function') return true;
			if (d > 6 || !x || typeof x !== 'object') return false;
			return Object.values(x).some((y) => hasFn(y, d + 1));
		};
		if (hasFn(v)) return undefined;
		return JSON.parse(JSON.stringify(v));
	} catch { return undefined; }
};
