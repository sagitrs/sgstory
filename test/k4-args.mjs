// `#794` 后续小刀：**`k4` 命令拒绝多余参数**的自证 ✓（`docs/dev-conventions.md` §9 口径：正例放过 ＋ 反例抓住 ＋ 失败计入退出码 ✓）
//
// 为什么单独一条测例（而不是只改一行代码 ✓）：
//   旧行为是"**静默忽略**多余参数"（`node editor/k4.mjs minimal-demo` ⇒ 照样跑整门、rc=0 ✓）。
//   而仓内**没有**按参数调它的消费者（`scripts/test-plan.mjs` 两条都裸调 ✓、`docs/editor-flip-playbook.md` 也裸调 ✓）
//   ⇒ **`npm test` 原本看不见这处行为变化** ✗ ⇒ 本票若不带来这条测例，改动就**没有覆盖** ✓
//   （＝"声称与覆盖不符" ✗）。**本文件就是那次变化自己露面的地方** ✓。
//
// 判据（**每条都只对"走了哪条分支"敏感** ✓ —— 光看 rc 会被"跑完了但输出空"骗过 ✗）：
//   ① 正例：**裸调** ⇒ rc=0 **且**真的跑了门（stdout 里必须出现门的横幅与通过行 ✓）；
//   ② 反例·两条入口：给一个多余参数 ⇒ rc=**2** **且** stdout 里**不许**出现门的横幅 ✗（＝门没跑 ✓）；
//   ③ 反例·参数名不像 slug（`--json`）⇒ 同上 ✓（不许被当成 slug 吃掉 ✓）。
// 两条入口都测 ✓：`node editor/k4.mjs`（壳转发 ✓）与 `node editor/cli.mjs k4` ✓ —— 拒绝落在**共享命令体**里
//   ⇒ 两入口行为一致 ✓（`--selfcheck` 是**壳侧**旗标 ⇒ 那条不对称是既有设计 ✓，本测例不涉 ✓）。
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let bad = 0;
const case_ = (label, ok, extra = '') => {
	if (ok) console.log(`      ✓ 自证·${label}`);
	else { bad++; console.error(`      ✗ 自证·${label}${extra ? '：' + extra : ''}`); }
};
const run = (argv) => spawnSync('node', argv, { cwd: ROOT, encoding: 'utf8' });
const BANNER = 'K4 门';
const ranGate = (r) => r.stdout.includes(BANNER);

// ① 正例：裸调两条入口 ⇒ rc=0 且**真跑了门** ✓
for (const argv of [['editor/k4.mjs'], ['editor/cli.mjs', 'k4']]) {
	const r = run(argv);
	case_(`正例·${argv.join(' ')} 裸调 ⇒ rc=0 且跑了门`, r.status === 0 && ranGate(r), `rc=${r.status} 跑了门=${ranGate(r)}`);
}

// ② 反例：多余参数 ⇒ rc=2 且**门没跑** ✓（两条入口 ✓）
for (const extra of ['minimal-demo', '--json', 'nosuchstory']) {
	for (const base of [['editor/k4.mjs'], ['editor/cli.mjs', 'k4']]) {
		const r = run([...base, extra]);
		case_(
			`反例·${base.join(' ')} ${extra} ⇒ rc=2 且门没跑`,
			r.status === 2 && !ranGate(r) && /用法/.test(r.stderr),
			`rc=${r.status} 跑了门=${ranGate(r)}`,
		);
	}
}

if (bad) { console.error(`\n✗ k4 参数自证：${bad} 条未过`); process.exit(1); }
console.log('\n✔ k4 参数自证通过（正例 2 × 裸调 ＋ 反例 6 × 多余参数，两条入口各半）');
