/* 无头单测运行器（CI 用）—— 完整镜像 tests/unit/unit.html 的加载序：
 *
 *   shims.js → dist/bundle.js（build.py 生成）→ framework/harness.js
 *   → dist/manifest.js 清单里的全部 *.test.js → __runTests() → __unitResult
 *
 * 与 unit.html 唯一的差别：DOM 是无操作桩（harness 的结果渲染不落地，
 * 断言只读 window.__unitResult）。因此本文件同时测到 harness 本身。
 *
 * 用法：先 python3 build.py（生成 dist/bundle.js 与 manifest），再
 *       node tests/unit/headless.mjs
 * 退出码：全部通过 0；有失败 1。
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const unitDir = import.meta.dirname;
const load = (f) => eval(fs.readFileSync(path.join(unitDir, f), 'utf8'));

/* ---- 最小 DOM 桩：harness.__runTests 只用这三处 ---- */
const stubEl = () => ({ insertAdjacentHTML() {}, innerHTML: '' });
globalThis.document = {
	title: '',
	getElementById: (id) => stubEl(),
};

/* ---- 浏览器全局（镜像 shims.js 的语义，真正加载的仍是仓库里的 shims.js）---- */
globalThis.window = globalThis;
load('framework/shims.js'); // 定义 setup / State / SugarCube / jQuery 桩

const chain = new Proxy(function () {}, {
	get(_t, prop) {
		if (prop === 'length') return 0;
		if (prop === Symbol.toPrimitive) return () => '';
		if (prop === 'then') return undefined; // 别让桩被当作 thenable
		return () => chain;
	},
	apply() {
		return chain;
	},
});
globalThis.jQuery = chain;
globalThis.$ = chain;
globalThis.location = { href: '' };

/* ---- 按 unit.html 的 <script> 序加载 ---- */
load('dist/bundle.js');
load('framework/harness.js');
const manifestSrc = fs.readFileSync(path.join(unitDir, 'dist/manifest.js'), 'utf8');
const files = JSON.parse(manifestSrc.slice(manifestSrc.indexOf('['), manifestSrc.lastIndexOf(']') + 1));
for (const f of files) load(f);

/* ---- 跑（真 harness）→ 断言 ---- */
await window.__runTests();
const r = window.__unitResult;
console.log(`单测：pass=${r.pass} fail=${r.fail} total=${r.total}`);
/* total=0 时上面的 fail/pass 比较全部空转（零用例静默绿）——显式拦截 */
if (!r.total || r.fail > 0 || r.pass !== r.total) {
	console.error(r.total ? '单测未全绿' : '单测清单为空（manifest 生成异常？）——拒绝静默绿');
	process.exit(1);
}
