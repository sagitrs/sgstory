/* `sgstory#1998` 判据**子进程探针**：装载一份**产物** bundle，按情形打印一行 JSON 读数给父进程（门）。
 *
 * 为什么要子进程（两件都是实情，✗ 洁癖）：
 *   ① bundle 是**脚本**（靠全局 `setup`／`window`），同进程里 eval 两份会互相污染；
 *   ② 「装载即注册宿主」这一步**不可回退**（登记表是模块级）⇒ **一次进程只量一份产物**。
 *
 * 用法：node tests/gates/_host-probe.mjs <bundle 路径> <headless|all>
 * 输出：单行 JSON（父进程解析）：
 *   headless ⇒ { hostOf, outputLines, ranStopped, ranSteps }
 *   all      ⇒ { hostOf, portsKeys, portOfThrew }
 */
import fs from 'node:fs';
import path from 'node:path';

const [bundlePath, arm] = process.argv.slice(2);
if (!bundlePath || !arm) {
	console.error('用法：node tests/gates/_host-probe.mjs <bundle 路径> <headless|all>');
	process.exit(2);
}
const ROOT_DIR = path.resolve(import.meta.dirname, '..', '..');
const load = (f) => eval(fs.readFileSync(f, 'utf8'));

/* 与 `tests/unit/headless.mjs` 同一套装置（宿主仿真 ＋ shims ＋ 最小 DOM 桩）——
 * ★口径：探针**不另造**一套装载面；它量的就是单测装置装载的那份产物。 */
globalThis.window = globalThis;
globalThis.document = { title: '', getElementById: () => ({ insertAdjacentHTML() {}, innerHTML: '' }) };
globalThis.location = { href: '' };
load(path.join(ROOT_DIR, 'tests/unit/framework/host.js'));
load(path.join(ROOT_DIR, 'tests/unit/framework/shims.js'));
const chain = new Proxy(function () {}, {
	get: (_t, p) => (p === 'length' ? 0 : p === Symbol.toPrimitive ? () => '' : p === 'then' ? undefined : () => chain),
	apply: () => chain,
});
globalThis.jQuery = chain;
globalThis.$ = chain;
load(bundlePath);

const R = setup.RPG;
const 读数 = { arm };
try {
	if (arm === 'headless') {
		读数.hostOf = R.hostOf();
		const P = R.portOf('persist'), L = R.portOf('lifecycle');
		/* 适配器自身的契约读数（本臂在**真产物**上取）*/
		读数.persist = (() => {
			const f = { a: 1, b: { c: 2 } };
			P.save(f, { slot: 'probe-slot' });
			const got = P.load('probe-slot');
			got.b.c = 99;                                   // ★改副本 ⇒ 不得影响内存里那份（✗ 递内部引用）
			return { has: P.has('probe-slot'), 深拷贝: JSON.stringify(P.load('probe-slot')) === JSON.stringify(f),
				slotSemantics: P.slotSemantics(), slots: P.slots?.() ?? null };
		})();
		读数.migrateThrew = (() => { try { P.migrate({}, 0); return null; } catch (e) { return String(e?.message ?? e); } })();
		读数.lifecycle = (() => {
			const t = L._track(L._token());
			const 前 = L.isCurrent(t);
			const 结 = L.cancelPending('probe');
			return { 前, 后: L.isCurrent(t), canceled: 结.canceled, epoch: L.epoch() };
		})();
		读数.navigated = (() => { let 见 = null; const 退 = L.onPassage((p) => { 见 = p; }); L.navigate('probe-passage'); 退(); return 见; })();
		/* 真适配器上跑一条最小场景（构造时**不注入** ports ⇒ 只能走选择面） */
		const A = new R.GameSession({ id: 'probe', rng: { v: 0, next() { this.v += 1; return this.v; } } });
		A.mount('min', (ctx) => ({
			id: 'min',
			enter: (c) => { c.commit({ entered: true }); },
			render: (c) => { c.ports.render.output(`步${c.facts().n ?? 0}`); },
			actions: [{ id: 'go', when: (c) => c.facts().done !== true, run: (c) => { c.commit({ done: true, n: 1 }); } }],
		}));
		A.enter('min');
		A.input.push({ id: 'go' });
		const r = A.run({ maxSteps: 10 });
		读数.ranStopped = r.stopped;
		读数.ranSteps = r.steps;
		读数.outputLines = R.portOf('render').lines().filter((x) => x.kind === 'output').map((x) => x.text);
	} else {
		读数.hostOf = R.hostOf();
		读数.portsKeys = Object.keys(R.ports).sort();
		try { R.portOf('persist'); 读数.portOfThrew = null; }
		catch (e) { 读数.portOfThrew = String(e?.message ?? e); }
	}
} catch (e) {
	读数.error = String(e?.message ?? e);
}
console.log(JSON.stringify(读数));
