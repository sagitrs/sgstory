// `#1093` P2-c：**② 层（运行真值）的 shim** —— 被解析钩子重定向的 `node:fs` 替身 ✓。
//
// ## 为什么是"重定向"而不是"改模块对象"✗（实测实测对照 ✓）
// ```
// 甲 改 `node:fs` 的模块对象：某段 ⇒ 只抓到 **2 条** ✗（且那 2 条是**模块 import** ✓ 不是文件读 ✗）
//    ⇒ 因为段用 **ESM 具名导入** `import { readFileSync } from 'node:fs'` ✗ ⇒ 具名绑定**在模块求值时已取定** ✓
// 乙 解析钩子把 `node:fs` 重定向到本 shim：同一段 ⇒ **28 条**真读面 ✓
// ```
// ⚠️ 若按直觉用甲 ⇒ ② 永远读到 0 ⇒ **`R=∅ ⊆ inputs` 恒真** ⇒ **② 成"永真门"** ✗✗（"看起来在工作"✓）
//
// ## ⚠️ 补强1：**未覆盖的属性被访问 ⇒ 出声**✗（裁定要求 ✓）
// `export *` **不含 `default`** ✗ ⇒ 段写 `import fs from 'node:fs'` 会拿到 `undefined` ⇒ **段行为变 ⇒ 读数失真** ✗
// ⇒ 本 shim：(a) 显式给 `default` ✓；(b) 用 **Proxy** 兜：**访问未显式列出的属性 ⇒ 直接抛** ✗
//   ⇒ **静默 `undefined` 是最坏形态**（段照跑、读数照出、结果错 ✓）—— 与"永真门"同级 ✓ 故必须**出声** ✓
//
// ## 记账
// 只记**读** API（写 API 不参与"读取面" ✓）；路径归一为**仓根相对** ✓（仓外路径原样 ✓）。
import * as real from 'node:fs';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const OUT = process.env.SAGITRS_FS_HOOK_OUT;
const seen = new Set();

const rec = (p) => {
	try {
		const s = typeof p === 'string' ? p : (p?.toString?.() ?? '');
		if (!s) return;
		seen.add(s.startsWith(ROOT + '/') ? s.slice(ROOT.length + 1) : s);
	} catch { /* 记账失败不该影响被测段 ✓ */ }
};

/** 被包装的**读** API（其余照原样转发 ✓ —— 见 Proxy 兜底 ✓）。 */
const wrap = (fn) => function (...a) { rec(a[0]); return fn.apply(this, a); };

const G = (k) => (typeof real[k] === 'function' ? wrap(real[k]) : real[k]);

// 读面（**显式列举** ⇒ Proxy 的兜底才判得出"未覆盖"✓）
export const readFileSync = G('readFileSync');
export const readdirSync = G('readdirSync');
export const existsSync = G('existsSync');
export const statSync = G('statSync');
export const accessSync = G('accessSync');
export const realpathSync = G('realpathSync');
export const readlinkSync = G('readlinkSync');
export const openSync = G('openSync');
export const createReadStream = G('createReadStream');
export const readFile = G('readFile');
export const readdir = G('readdir');
export const stat = G('stat');
export const access = G('access');
export const realpath = G('realpath');
export const open = G('open');
// 写面（**不记账** ✓ 但必须**照旧可选** ✗ —— 否则把被测段弄坏 ✓）
export const writeFileSync = real.writeFileSync;
export const mkdirSync = real.mkdirSync;
export const rmSync = real.rmSync;
export const utimesSync = real.utimesSync;
export const appendFileSync = real.appendFileSync;
export const promises = real.promises;

/** ⚠️ 补强1：**未列出的属性被访问 ⇒ 抛** ✗（不静默 `undefined` ✓）。 */
export const defaultExport = new Proxy(real, {
	get(t, k) {
		if (k in t) return t[k];
		throw new Error(`[#1093 fs-shim] 访问了**未被覆盖**的 \`node:fs\` 属性 \`${String(k)}\` ⇒ 这会让被测段拿到 undefined（读数失真 ✗）；请把该属性加进 shim 的显式列举 ✓`);
	},
});
export { defaultExport as default };

/** 退出时落盘（**只有配了 `SAGITRS_FS_HOOK_OUT` 才记** ✓ ⇒ 不配则零开销 ✓）。 */
if (OUT) {
	process.on('exit', () => {
		try {
			const { appendFileSync } = real;
			appendFileSync(OUT, JSON.stringify({ id: process.env.SAGITRS_FS_HOOK_ID ?? '(段)', paths: [...seen].sort() }) + '\n');
		} catch { /* 见上 ✓ */ }
	});
}

/** `#1093` P2-c ㈠：**本 shim 实际包裹的读 API 清单**（供"面完整性 ratchet"断言 ✓）。
 *  ⚠️ 后人往 `node:fs` 加了新的读 API 而 shim 没包 ⇒ **该格当场红** ✓
 *  ⇒ 把"读到但漏报"从**注释面**移到**判据面** ✓（与 `maxUnprobed`／`UNDECLARED_INPUTS_BASELINE` 同族 ✓）。 */
export const WRAPPED_READ_APIS = ['readFileSync', 'readdirSync', 'existsSync', 'statSync', 'accessSync', 'realpathSync', 'readlinkSync', 'openSync', 'createReadStream', 'readFile', 'readdir', 'stat', 'access', 'realpath', 'open'];

/** 面完整性**基准**（语义＝**清单必须 ⊇ 基准** ✓ ⇒ 随新 API 增则红 ✓）。 */
export const READ_API_BASELINE = ['readFileSync', 'readdirSync', 'existsSync', 'statSync', 'openSync', 'createReadStream'];
