// `#1072` 测量仪表（jsdom 外观）：把真实的 `jsdom` 包进来 ＋ 计时 → **被测件一个字都不用改**。
//
// 自律（与 entry 同；见 `instrument-jsdom.mjs` 头顶那六条）：零 `await`／零定时器／零 stdout 写入；
// 只加两次单调时钟读 ＋ 转发；`prototype`／静态成员照旧 → `new`／`instanceof` 不变。
//
//注意：名义面**必须与真实包一致**：被测件只用 `JSDOM` 与 `VirtualConsole`（本仓实测）
// → 这两个显式转发；其余用 `get`（动态透传）兜住"以后有人用了别的名字"。
import { createRequire } from 'node:module';
import { stats, t0 } from './instrument-state.mjs';

const require = createRequire(import.meta.url);
const loadT0 = process.hrtime.bigint();
const real = require('jsdom');
stats.loadMs = Number(process.hrtime.bigint() - loadT0) / 1e6;   // ← 量的是**装载 jsdom 模块图**的成本

const Orig = real.JSDOM;
function Patched(...args) {
	const a = process.hrtime.bigint();
	const inst = new Orig(...args);
	const b = process.hrtime.bigint();
	stats.jsdomMs += Number(b - a) / 1e6;
	if (stats.n === 0) stats.firstAtMs = Number(a - t0) / 1e6;   // 首个构造距**进程起点**多远
	stats.n++;
	return inst;
}
Patched.prototype = Orig.prototype;
Object.setPrototypeOf(Patched, Orig);

export const JSDOM = Patched;
export const VirtualConsole = real.VirtualConsole;
export const jsdom = real;      // 具名兜底（`import { jsdom} from 'jsdom'` 极少见）
export default real;            // `import jsdom from 'jsdom'` → 真实对象
//注意：ESM 命名空间**不能动态补成员** → 上面只显式列了本仓实测用到的两个（`JSDOM`／`VirtualConsole`）＋ 两个兜底。
// **新增用法需在此补一行** —— 这里**不假装自动**（若漏了，被测段会因 `undefined` 而**红**
// 而不是"静默量错"；且 `--profile-selftest` 会跑真段，漏项当场现形）。
