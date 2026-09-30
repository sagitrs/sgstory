/* SugarCube 环境 shim：让插件源码无需引擎即可在测试页加载。
 * 被测物（dist/bundle.js）在本文件之后加载——新增引擎依赖
 * （新全局、新 DOM 结构）需要同步扩展这里，否则 bundle 加载即失败。
 */
window.setup = {}; // SugarCube 官方预留的作者命名空间
window.State = { variables: {} }; // 故事变量（loot/give 等模块读写它）
window.SugarCube = { Engine: { play() {}, restart() {} } }; // 导航桩

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
