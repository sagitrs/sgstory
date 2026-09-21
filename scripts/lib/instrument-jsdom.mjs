// `#1072` 测量仪表（入口）：由 `scripts/run-tests.mjs --profile` 经 `NODE_OPTIONS=--import=<本文件>` 注入 ✓。
//
// ```
// NODE_OPTIONS=--import=<本文件 file URL>    # 每段（及其派生的 node 子进程）都自动带上 ✓
// SAGITRS_PROFILE_OUT=<jsonl 落点>           # 读数逐条 append ✓（不往 stdout 写 ✗ —— 那是被测件的判据面 ✓）
// SAGITRS_PROFILE_ID=<段 id>                 # 归属 ✓
// ```
//
// ## 它回答什么
// `#26`（2026-09-07）诊断「jsdom 启动约 19 次占 79%」并把全链压到 ~45s；13 天后回到 429.7s；
// 今天**没有同口径读数** ⇒ "共享 harness 能省多少"只能猜 ✗ ⇒ 本仪器**先测再改** ✓（§17 ㉔ 代理 ≠ 直接读数）。
//
// ## ⚠️ 硬约束：**仪器不得改变被测行为** ✗（本仓栽过："40ms 计时器永久吊住事件循环"✓）
// 逐条自律（**能被 `--profile-selftest` 证伪**，不靠自说 ✓）：
//   ① 零 `await`／零 Promise ⇒ 不插入微任务、不改事件循环相位 ✓；
//   ② 零定时器 ⇒ 不改事件循环关闭时机 ✓；
//   ③ 零 stdout/stderr 写入 ⇒ 不污染被测件的判据输出 ✓；
//   ④ 只做单调时钟读（`process.hrtime.bigint()`）＋ 一次函数转发 ✓；
//   ⑤ **惰性装载** ✓ —— 只用 ESM 解析钩子把 `import 'jsdom'` 指到 shim；
//      **不用 jsdom 的段 ⇒ 一个字节都不碰** ✗（上一版"无条件 `require('jsdom')`"实测给无关段凭空加了
//      ~250ms（`0.02s ⇒ 0.27s`）⇒ **已自查出并改掉** ✓ —— 见 `instrument-state.mjs` 顶注）；
//   ⑥ 落盘只在 `exit`（同步、尽力而为、**失败吞掉**：测量失败不该把被测段弄红 ✗）。
//
// ## 诚实声明（别把口径读大）
// · `jsdomMs` 量的是「**构造调用本身**」✗，不是"窗口就绪"（`boot()` 里还有 `pollUntil` 轮询、
//   内联脚本执行、`load` 事件 ⇒ 那些落在"其余"里 ✓）；
// · `loadMs` 是**装载 jsdom 模块图**的成本（≈200+ms 级 ⇒ 往往比构造本身大 ✓）；
// · 表里因此分 `jsdom 实测` ／ `其余（推算）` 两栏，**推算栏写明是推算** ✓。
import { appendFileSync } from 'node:fs';
import { register, registerHooks } from 'node:module';
import { stats } from './instrument-state.mjs';
import { resolve } from './instrument-hooks.mjs';

const OUT = process.env.SAGITRS_PROFILE_OUT;
const ID = process.env.SAGITRS_PROFILE_ID ?? '(未命名段)';
// ⚠️ **必须在装载时取**（不是 exit 时 ✗）：写在 exit 里会取成"整段运行时长"
//   —— 自查实测：不用 jsdom 的段记成 30ms、用 jsdom 的段记成 310ms（＝该段总时长 ✗）⇒ 已改 ✓。
const uptimeAtLoadMs = Number((process.uptime() * 1000).toFixed(1));

// ⚠️ 没配落点 ⇒ **整个仪器不装**（不是"装了但静默不记" ✗）：不装 ⇒ 零开销、零影响面 ✓。
if (OUT) {
	// ⑤ 惰性：只登记一条解析钩子（**它本身不载入 jsdom** ✓）⇒ 不用 jsdom 的段零影响 ✓。
	//   静默失败：钩子装不上 ⇒ 退化成"没有读数"（表里显示 `—` ✓），**不把被测段弄红** ✓。
	//
	//   ⚠️ **优先同步钩子**（`registerHooks`，Node 22.15+ ✓）：**同线程、零额外开销** ✓。
	//   **实测代价对比**（同一个"不用 jsdom"的段，取最小）：
	//     `register()`（worker 线程）⇒ **0.05s**（凭空 +40ms ✗ —— 起钩子线程的代价）
	//     `registerHooks()`（同线程）  ⇒ **0.02s**（与不装仪器**同量级** ✓）
	//   ⇒ 仪器要"不改被测行为"，这一档差就是分水岭 ✓ ⇒ 主路径走同步；老 Node 退化成 worker（并在读数里可辨 ✓）。
	try {
		if (typeof registerHooks === 'function') registerHooks({ resolve });
		else register('./instrument-hooks.mjs', import.meta.url);
	} catch { /* 见上 ✓ */ }

	process.on('exit', () => {
		try {
			appendFileSync(OUT, JSON.stringify({
				id: ID, pid: process.pid, n: stats.n,
				jsdomMs: Number(stats.jsdomMs.toFixed(1)),
				loadMs: stats.loadMs === null ? null : Number(stats.loadMs.toFixed(1)),
				firstAtMs: stats.firstAtMs === null ? null : Number(stats.firstAtMs.toFixed(1)),
				// 钩子用哪条路径（同步＝同线程零开销 ✓；`worker`＝老 Node 的退化路径，读数会被 +40ms 级污染 ✗）
				hooks: typeof registerHooks === 'function' ? 'sync' : 'worker',
				// 仪器装载时进程已运行多久（≈node 启动 ＋ 装载开销 ✓；**装载时取的** ✓）
				uptimeAtLoadMs,
				version: 4,
			}) + '\n');
		} catch { /* ⑥ ✓ */ }
	});
}
