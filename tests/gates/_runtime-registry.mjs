/* 运行期注册表读数（`#1807` 折；供 `registration.mjs` 的交叉核对调用）
 *
 * ★为何要有这个文件：`registration.mjs` 是**静态**扫描（正则）⇒ 必然漏循环/表驱动形。
 *   而**运行期注册表才是权威**。本文件**镜像 `headless.mjs` 的加载序**
 *   （shims.js → dist/bundle.js），读出三张注册表的真实条目数，输出 JSON 供门解析。
 *
 * ★为何不把 bootstrap 写在门里：门在**自己的进程**里 eval bundle 需要复刻整套桩
 *   （本席首版即栽在此：桩不全 ⇒ `Cannot read properties of undefined (reading 'on')`）。
 *   独立文件 ＋ **镜像既有运行器** ⇒ 加载序**只有一处权威**（headless.mjs），
 *   本文件与它同步（若 headless 改了加载序，此处须同改 —— 下方 README 亦记此约束）。
 *
 * 用法：node tests/gates/_runtime-registry.mjs   ⇒ 打印一行 JSON
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.join(import.meta.dirname, '..', '..'));
const unitDir = path.join(ROOT, 'tests/unit');
const load = (f) => eval(fs.readFileSync(path.join(unitDir, f), 'utf8'));

/* ★捕获**重复注册告警**（`#1807` 二轮 RC 的 B 项）：注册面遇重复 id 是 `console.warn` 后**覆盖**
 *   ⇒ **告警本身就是权威信号** —— 而盲区（循环/builder 形）里的重复**静态扫不到**，只有运行期看得见。
 *   本段把告警按注册面分类计数，供门比对基线（✗ 只看静态扫描数 ⇒ 盲区内的重复会漏）。 */
const warnings = [];
const realWarn = console.warn;
console.warn = (...a) => { warnings.push(a.map(String).join(' ')); };

const stubEl = () => ({ insertAdjacentHTML() {}, innerHTML: '' });
globalThis.document = { title: '', getElementById: () => stubEl() };
globalThis.window = globalThis;
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
load('dist/bundle.js');

const R = globalThis.setup?.RPG ?? {};
const n = (m) => (m && typeof m.size === 'number' ? m.size : null);
console.warn = realWarn;
const dupOf = (kind) => warnings
	.filter((w) => new RegExp(`^\\[RPG\\] ${kind} id「`).test(w))
	.map((w) => (w.match(/id「([^」]+)」/) ?? [])[1])
	.filter(Boolean);
process.stdout.write(JSON.stringify({
	items: n(R.items), characters: n(R.characters), effects: n(R.effects),
	stocks: n(R.stocks),
	dups: { item: dupOf('道具'), character: dupOf('角色'), effect: dupOf('效果') },
}) + '\n');
