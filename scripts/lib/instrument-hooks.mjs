// `#1072` 测量仪表（解析钩子）：把 `import … from 'jsdom'` **重定向到本地 shim** ✓。
//
// ⚠️ 为什么必须走 ESM 解析钩子：本仓被测件用 `import { JSDOM } from 'jsdom'`（ESM 具名导入）——
//   **实测**：这条路**不经过** CJS 的 `Module._load`（挂钩后 `LOAD-NEVER-SAW-jsdom` ✗）⇒ 只有解析钩子拦得到 ✓。
// ✅ **惰性**：只在**真的**有人 `import 'jsdom'` 时才改写解析结果 ⇒ 不用 jsdom 的段**零影响** ✓
//   （这正是上一版"无条件 `require('jsdom')`"缺陷的修法 ✓）。
//
// ## ⚠️ 自我识别（必需，否则成环 ✗）
// shim 内部要用 `createRequire` 取**真实** jsdom —— 而 `registerHooks` 的钩子**对 CJS `require` 也生效** ✓
// ⇒ 若不设防，shim 自己的 `require('jsdom')` 会被重定向回 shim ⇒ `ERR_REQUIRE_CYCLE_MODULE` ✗
//   （**实测踩过**：`Cannot require() ES Module … in a cycle` ✓）。
// ⇒ 判据：**父模块就是 shim 自己** ⇒ 放行（让它拿到真包 ✓）。
export const resolve = (specifier, context, nextResolve) => {
	if (specifier === 'jsdom') {
		const self = new URL('./instrument-jsdom-shim.mjs', import.meta.url).href;
		if (context.parentURL === self) return nextResolve(specifier, context);   // ← 自己人 ⇒ 放行 ✓
		return { url: self, shortCircuit: true, format: 'module' };
	}
	return nextResolve(specifier, context);
};
