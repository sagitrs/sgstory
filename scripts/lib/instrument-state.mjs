// `#1072` 测量仪表（共享状态）：三个文件（entry／hooks／shim）都在**主线程**里跑 → 用一个模块传状态。
//
//注意：为什么**不能**只用一个文件（曾经的实现，已自查出缺陷）：那版在装载时**无条件 `require('jsdom')`**
// → 把整个 jsdom 模块图带进**每个**被测进程 → 不用 jsdom 的段被凭空加了 ~250ms
//（实测：`0.02s → 0.27s`）→ **改变了被测行为** —— 正是本票硬约束要防的事。
// → 现在改成**惰性**：只在被测件**真的** `import 'jsdom'` 时才装（见 `instrument-hooks.mjs`）。
export const stats = {
	/** 本进程内 `new JSDOM(...)` 的累计耗时（ms） */
	jsdomMs: 0,
	/** 构造次数 */
	n: 0,
	/** 首个构造的**进程内偏移**（≈"第一次开窗"的时刻） */
	firstAtMs: null,
	/** 装载 jsdom 模块图本身的耗时（ms）——注意：由**被测件那一侧**的 shim 量 → 不含我们的强载 */
	loadMs: null,
};

/** 进程起点（单调时钟 → 不受系统时间调整影响） */
export const t0 = process.hrtime.bigint();

export const msSinceT0 = () => Number(process.hrtime.bigint() - t0) / 1e6;
