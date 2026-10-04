/* 注册面汇总的**探针**（`sgstory#295` 乙 的判据腿）—— 把 bundle 装进 Node，数 `console.warn`
 *
 * 它只做一件事：加载 `tests/unit/framework/{host,shims}.js` ＋ `tests/unit/dist/bundle.js`
 * （**与 `tests/unit/headless.mjs` 同一套底座**，逐字搬自那档的引导段），**捕获 console.warn**，
 * 等一个宏任务（让 `RPG.regWarn` 的**自动汇总**落点跑完），然后把读数打成一行 JSON：
 *   `{"warns": [...], "条数": n}` —— `条数` 取 `RPG.regWarn.汇总({印:false})`（✗ 不重复打印）。
 *
 * 用法：node tests/gates/_regwarn-probe.mjs      （退出码：0＝读出读数；2＝装置错）
 * ⚠ 本件**只读**：✗ 不改引擎状态机、✗ 不跑用例；它存在的理由是「计数必须来自**真 bundle**」。
 */
import fs from 'node:fs';
import path from 'node:path';

const unitDir = path.join(import.meta.dirname, '..', 'unit');
const load = (f) => eval(fs.readFileSync(path.join(unitDir, f), 'utf8'));

const warns = [];
const 原warn = console.warn;
console.warn = (...a) => { warns.push(a.map((x) => String(x)).join(' ')); };

const stubEl = () => ({ insertAdjacentHTML() {}, innerHTML: '' });
globalThis.document = { title: '', getElementById: () => stubEl() };
globalThis.window = globalThis;
globalThis.__TRACE = false;
load('framework/host.js');
load('framework/shims.js');
const chain = new Proxy(function () {}, {
	get(_t, prop) {
		if (prop === 'length') return 0;
		if (prop === Symbol.toPrimitive) return () => '';
		if (prop === 'then') return undefined;
		return () => chain;
	},
	apply() { return chain; },
});
globalThis.jQuery = chain;
globalThis.$ = chain;
globalThis.location = { href: '' };

try {
	load('dist/bundle.js');
} catch (e) {
	console.error(`✗ 装置错：bundle 加载失败 —— ${e?.message ?? e}`);
	process.exit(2);
}

/* ★等一个宏任务：自动汇总（`setTimeout(…, 0)`）在第一次 `报()` 时挂上 ⇒ 这里必须让出控制权。 */
await new Promise((r) => setTimeout(r, 30));
console.warn = 原warn;
const 条数 = globalThis.setup?.RPG?.regWarn?.条数?.() ?? null;
process.stdout.write(JSON.stringify({ warns, 条数 }) + '\n');
