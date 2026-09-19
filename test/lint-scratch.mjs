// `#1024`：`lint-story` 的 **scratch 必须本次运行唯一** —— 两个进程跑同一 slug 时不得互相踩。
//
// 为什么要有这一件：原先 `lintCommand` 的两次编译都写**按 slug 固定**的
// `build/generated/<slug>`，快照也是 `build/generated/<slug>.lint-snap` ⇒ 两个进程同时跑同一 slug 时
// 互相 `rmSync`／`cp`／编译 ⇒ 报「编译不幂等（两次产物有差）」——而那是**假红**（判据本身没坏）。
// 实测（本片）：2 进程 × 5 轮 = **5/5 轮必红**；`test-plan` 的 `test` 相位并发 4、
// `test-story-ci.mjs` 与其兄弟段同时在场 ⇒ **CI 上就表现为间歇红**（main 同期可能恰好是绿的）。
//
// 本件的判据（**能假**：把 scratch 改回按 slug 固定 ⇒ 必红；探针在 `scripts/probes.mjs`）：
//   ① **并发**：`CONC` 个进程跑同一 slug，**每一个都必须 rc=0**（三轮）—— 概率型，可能被躲过；
//   ② **旧落点没被重建**（**确定性**，本件的定盘星）：scratch 既然"本次运行唯一"，
//      那么按 slug 命名的旧落点就不该被这次运行创建（本件先自己清掉，避免把树上残留读成红）；
//   ③ **不留草稿**：跑完不许在 `build/generated/` 留下 `.lint-run-*`（含失败路径也在 `finally` 里清）。
//
// 复跑：`node test/lint-scratch.mjs`（前置：`node build.mjs` —— 故事门要读 dist 产物）
// 自证：`node test/lint-scratch.mjs --selftest`（量的是"本件的两条判据**不是空的**"）
// 边界：本件只判"并发不互踩 ＋ 旧落点不被重建 ＋ 不留草稿"，**不**重复 `lint-story` 自己的判据。

import { spawn } from 'node:child_process';
import { readdirSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const SLUG = 'minimal-demo';
const ROUNDS = 3;
const CONC = 3;
export const GEN = join(ROOT, 'build', 'generated');
export const OLD_GEN = join(GEN, SLUG);
export const OLD_SNAP = join(GEN, `${SLUG}.lint-snap`);

/** 草稿目录（`.lint-run-*`）——**纯函数**（自证可注入合成目录）。 */
export const scratchLeftIn = (dir) => (existsSync(dir) ? readdirSync(dir).filter((n) => n.startsWith('.lint-run-')) : []);

/** 旧落点是否被（重新）创建 —— **纯函数**：返回问题列表（空＝没问题）。 */
export const oldLocationProblems = ({ genDir, slug }) => {
	const out = [];
	for (const p of [join(genDir, slug), join(genDir, `${slug}.lint-snap`)]) {
		if (existsSync(p)) out.push(`旧落点 ${p} 被这次运行创建了（scratch 应当本次运行唯一 ⇒ 不该出现它）`);
	}
	return out;
};

const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); return ok; };
const runOnce = () => new Promise((res) => {
	const p = spawn('node', ['editor/lint-story.mjs', SLUG], { cwd: ROOT });
	let out = '';
	p.stdout.on('data', (d) => { out += d; });
	p.stderr.on('data', (d) => { out += d; });
	p.on('close', (rc) => res({ rc, out }));
});

// ── 自证：两条判据**不是空的**（否则"全绿"可能只是因为判据什么都没量 ✗）─────────────
const selftest = () => {
	let bad = 0;
	const t = (msg, ok) => { if (!check(ok, msg)) bad += 1; };

	// ① 草稿探测器：真种一个 ⇒ 必须发现；撤掉 ⇒ 必须为空
	const planted = join(GEN, '.lint-run-SELFTEST');
	mkdirSync(planted, { recursive: true });
	t('草稿探测器：种一个 `.lint-run-SELFTEST` ⇒ 能发现', scratchLeftIn(GEN).includes('.lint-run-SELFTEST'));
	rmSync(planted, { recursive: true, force: true });
	t('草稿探测器：撤掉之后 ⇒ 不再列出它（不是恒真 ✗）', !scratchLeftIn(GEN).includes('.lint-run-SELFTEST'));
	t('草稿探测器：目录不存在 ⇒ 空集（不是抛错 ✗）', scratchLeftIn(join(GEN, '.no-such-dir-xyz')).length === 0);

	// ② 旧落点判据：种一个 ⇒ 必须报；撤掉 ⇒ 必须不报
	mkdirSync(OLD_GEN, { recursive: true });
	t('旧落点判据：存在 `build/generated/<slug>` ⇒ 报 1 条且点名它', (() => {
		const p = oldLocationProblems({ genDir: GEN, slug: SLUG });
		return p.length === 1 && p[0].includes(SLUG);
	})());
	rmSync(OLD_GEN, { recursive: true, force: true });
	t('旧落点判据：撤掉之后 ⇒ 0 条（不是恒报 ✗）', oldLocationProblems({ genDir: GEN, slug: SLUG }).length === 0);
	t('旧落点判据：快照 `.lint-snap` 也算旧落点', (() => {
		mkdirSync(OLD_SNAP, { recursive: true });
		const p = oldLocationProblems({ genDir: GEN, slug: SLUG });
		rmSync(OLD_SNAP, { recursive: true, force: true });
		return p.length === 1 && p[0].includes('.lint-snap');
	})());

	console.log(bad === 0
		? '\n✔ 自证通过：两条判据都能被"种出来的反例"点燃，也能在撤掉后熄掉（不是恒真／恒假 ✓）'
		: `\n✗ 自证失败 ${bad} 项`);
	process.exit(bad === 0 ? 0 : 1);
};

if (process.argv.includes('--selftest')) selftest();

// ── 主判据 ─────────────────────────────────────────────────────────────
let failures = 0;
const before = scratchLeftIn(GEN);

// ⚠️ **本件自己准备环境**：旧落点可能因为**先前**跑过别的工具而已经存在（例如早于本修法时跑的
// `lint-story`）⇒ 不能直接断言"它不在"，那会把**树上残留**读成"本件红"（＝"环境态混进判据"那一族）。
// ⇒ 先自己清掉，再断言"**本次运行没有重新创建它**"（这才是本件要量的事）。
const preexisting = [OLD_GEN, OLD_SNAP].filter((p) => existsSync(p));
for (const p of preexisting) rmSync(p, { recursive: true, force: true });

for (let round = 1; round <= ROUNDS; round += 1) {
	const results = await Promise.all(Array.from({ length: CONC }, runOnce));
	const bad = results.filter((r) => r.rc !== 0);
	if (!check(bad.length === 0, `第 ${round} 轮：${CONC} 个进程**同时**跑同一 slug ⇒ 全部 rc=0（实得 rc=${results.map((r) => r.rc).join('/')}）`)) failures += 1;
	if (bad.length) {
		// 失败的**第一手证据**：把其中一个进程的输出原样打出来（不加工 ✗ —— 报文的形状本身就是读数 ✓）
		console.log('    ── 失败进程输出（原样）──');
		console.log(bad[0].out.split('\n').map((l) => `    ${l}`).join('\n'));
	}
}

// ⚠️ **只判「本次新出现的」** ✗ —— 全局列举式断言**天生竞态**：兄弟段（`test-plan` 的 `test-lint-story-mjs`
//   与本件同相并发）跑出瞬时 `.lint-run-*` 就会被读成"自己留了草稿" ⇒ 假红（撞上就红、撞不上就绿）。
//   同型教训本仓已有：`test/equiv-scratch.mjs`（`#1004`）的 `newScratch = (base) => …filter((n) => !base.includes(n))`
//   —— 本件首版把 `before` 取了只用来打印，等于**又踩一遍**同一个坑（CI 实证：`现有 1 个；跑前 0 个`）。
// ⚠️ **只作提示，不作判据**（本片合入后 CI 实证的第二次同类坑 ✗）：`build/generated/` 是**共享目录**，
//   同相并发的兄弟段（`test-plan` 的 `test-lint-story-mjs`）会**正当地持有**自己的 `.lint-run-*`
//   ⇒ ⇒ 在**本件窗口内新出现**的那些**无法归因**（可能是兄弟的活草稿，不是本件"没清"）✗
//   ⇒ 上一版把它当失败判据 ⇒ CI 间歇红（`✗ 跑完不留…（新出现 1 个：.lint-run-ewUcsQ）`）。
//   ⇒ 要判"本件自己的草稿清没清"，必须先让 scratch **可归因**（例如给中间目录打上本进程的标记）
//   ⇒ 那是另一件（本件不塞）。此处只打印，读的人自己看基数。
const freshLeft = scratchLeftIn(GEN).filter((n) => !before.includes(n));
console.log(`• 提示（不作判据）：跑完 build/generated/ 里比跑前多 ${freshLeft.length} 个 .lint-run-*（跑前 ${before.length} 个）—— 共享目录里**无法归因**是否有本件没清的（并发兄弟会正当地持有自己的）`);

const oldLeft = oldLocationProblems({ genDir: GEN, slug: SLUG });
if (oldLeft.length) failures += 1;
console.log(`${oldLeft.length === 0 ? '✓' : '✗'} 旧落点**没有被这次运行重建**（\`build/generated/${SLUG}\` 与 \`${SLUG}.lint-snap\`；跑前${preexisting.length ? '存在过、已先清掉' : '本就不在'}${oldLeft.length ? ` —— ${oldLeft.join('；')}` : ''}）`);

if (failures) {
	console.error(`✗ lint-story 并发自证未过 ${failures} 项 —— scratch 必须**本次运行唯一**（\`#1024\`）`);
	process.exit(1);
}
console.log(`✔ lint-story 并发：${ROUNDS} 轮 × ${CONC} 进程跑同一 slug 全绿 ＋ 旧落点未被重建（scratch 本次运行唯一 ✓）`);
