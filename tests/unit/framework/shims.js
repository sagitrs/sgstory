/* SugarCube 环境 shim：让插件源码无需引擎即可在测试页加载。
 * 被测物（dist/bundle.js）在本文件之后加载——新增引擎依赖
 * （新全局、新 DOM 结构）需要同步扩展这里，否则 bundle 加载即失败。
 *
 * 两个测试入口都加载本文件：浏览器测试页 `unit.html`（按 <script> 序）与
 * 无头运行器 `tests/unit/headless.mjs`（见其 `load('framework/shims.js')`）。
 *
 * 宿主接触面的**实现体**在 `framework/host.js`（同目录手写件，先于本文件
 * 加载）：故事变量（含导航即克隆语义）、段落导航（含旧输出块关闭）、按段落
 * 归档的输出、存档往返（含原型退化语义）。本文件只把三个全局指向它；输出
 * 捕获由 harness 在被测物加载后调用 `__host.install()` 完成（那时
 * `Object.prototype.perform` 才存在）。
 */
window.setup = {}; // SugarCube 官方预留的作者命名空间

if (!window.__host) {
	throw new Error('framework/host.js 未加载——它必须先于 shims.js（见 unit.html 的加载序与 headless.mjs 的 load 序）');
}

window.State = window.__host.state;                  // 故事变量（含导航即克隆）
window.SugarCube = { Engine: window.__host.engine }; // 段落导航（含输出块开合）
window.Save = window.__host.save;                    // 存档往返（含原型退化语义）

/* jQuery 桩：可链式调用的 no-op——单元测试只断言状态与异常，不断言 DOM */
const chain = new Proxy(function () {}, {
	get(_t, prop) {
		if (prop === 'length') return 0;
		if (prop === Symbol.toPrimitive) return () => '';
		return () => chain;
	},
	apply() { return chain; },
});
window.jQuery = chain;
window.$ = chain;
