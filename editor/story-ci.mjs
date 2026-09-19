// 用户故事 CI（`#984` · 设计稿 §5 拦路石 #3 的对策 ＝ §7 P3 ④）：**按故事发现 ⇒ 逐故事跑 K 门**。
//
// 用法（宿主壳 ✓；判据住在 `lib/core/storyCi.mjs` ✓）：
//   node editor/story-ci.mjs --list                 # 发现（每行一个故事 ⇒ **能假**：新故事必须出现在这里 ✓）
//   node editor/story-ci.mjs                        # 默认轻档：发现到的每个故事 + 全局面（每轮一次）
//   node editor/story-ci.mjs --full                 # 加**重**面（实测贵 ⇒ 手动/夜跑，⛔ 不进 CI 默认档）
//   node editor/story-ci.mjs --story=<slug|目录>     # 只跑一个（**仓外的用户故事包**走这条 ✓）
//   node editor/story-ci.mjs --stories-dir=<目录>    # 改发现根（默认 `stories/` ✓）—— 给**仓外故事集**用 ✓
//   node editor/story-ci.mjs --selftest             # 壳级自证
//
// ⚠️ 为什么不做成"逐故事跑全套" ✗：实测 K5／K6 是**全局**面、K3 半是引擎级 ✓ ⇒ 照字面做不到
//   （`#984` 的接口口径 ✓：**全局面每轮一次 ＋ 故事作用域面逐故事** ✓）。
// ⚠️ **单跑前先跑构建相** ✗：① 逐故事面里有需要构建产物的段 ⇒ 先 `node build.mjs` ✓；② 全局面 **K5**（台账
//   `--check`）读的是**探针相**的读数 ⇒ 先 `node scripts/probe-gates.mjs --probe=fast` ✓（否则会用**过期**读数
//   判红 ✗ —— 那是台账的口径 ✓，不是本件的 bug ✗）。**进 CI 不必管**：两个相都在 `phase:'build'` ✓ 且都在本段之前 ✓。
//   进 CI 时本段的 `needs` 保证它**排在那两段之后** ✓（它们会往 `stories/` 写临时件 ✗ ⇒ 详见段注释 ✓）。
// ⚠️ 为什么不重造判据 ✗：逐故事面**直接重用 `editor/lint-story.mjs`**（它已经是"包形状 → 编译幂等 →
//   等价 → 故事门 ×N → 形状"的既有编排 ✓）；其余面按 `K_FACES` 表指向**既有命令** ✓。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { K_FACES, buildPlan, summarizeRuns, missingFromPlan, finalVerdict } from './lib/core/storyCi.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STORIES = join(ROOT, 'stories');

/** 发现口径 ✓（照既有先例 `scripts/report-page-coverage.mjs:97` ⇒ **不新造** ✗）：`stories/<d>/00-story.json` 存在。 */
export const discoverStories = (dir = STORIES) =>
	existsSync(dir) ? readdirSync(dir).filter((d) => existsSync(join(dir, d, '00-story.json'))).sort() : [];

const run = (cmd) => {
	const t0 = Date.now();
	const r = spawnSync('node', cmd, { cwd: ROOT, encoding: 'utf8' });
	return { cmd, rc: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}`, ms: Date.now() - t0 };
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
	const argv = process.argv.slice(2);
	// ── 壳级自证（与 `editor/k4.mjs` 同口径 ✓：只在工具路 ✓）──
	if (argv.includes('--selftest')) {
		const cases = [
			['发现口径：非目录 ⇒ 空（不抛 ✗）', discoverStories(join(ROOT, 'stories/__nope__')).length === 0],
			// ⚠️ **不许断言「恰好三个」** ✗（`#989` 的根因 ✓）：本仓跑器是**并行**的 —— 别的段会在运行中往
			//   `stories/` 放临时故事（`web-preview` 的 `stories/__e2e` ✓、`new-story-fixture` ✓）⇒ 精确等值会**随机红** ✗。
			//   要断言的是「**真故事都在**」（⊇ ✓），不是「只有它们」（＝ ✗）。
			['发现口径：三个真故事**都在**（⊇ ✓ —— 不赌「恰好三个」✗）', ['hollow-cave', 'minimal-demo', 'mist-forest'].every((s) => discoverStories().includes(s))],
			['表：每条 K 都指既有命令且带证据 ✓', K_FACES.every((f) => Array.isArray(f.cmd('s')) && typeof f.evidence === 'string' && f.evidence.length > 0)],
			// ⚠️ 三个数不一样是**对的** ✗：表里 global 有 **5** 条（K2/K3/K4/K5/K6 ✓），但 **K3 是 heavy** ✓
			//   ⇒ 轻档只跑 4 条（K3 已由既有段 `test-story-runtime-mjs` 跑 ✓、不重复 ✗）、`--full` 才 5 条 ✓。
			['接口口径：全局面**每轮一次**（与故事数无关 ✓）', K_FACES.filter((f) => f.scope === 'global').length === 5
				&& buildPlan({ stories: ['a', 'b'] }).filter((p) => p.scope === 'global').length === 4
				&& buildPlan({ stories: ['a', 'b', 'c'], full: true }).filter((p) => p.scope === 'global').length === 5],
			['重面只在 --full 里 ✓（默认不把重门乘故事数 ✗）', !buildPlan({ stories: ['a'] }).some((p) => p.tier === 'heavy') && buildPlan({ stories: ['a'], full: true }).some((p) => p.tier === 'heavy')],
			['🔴 能假：发现了却没进编排 ⇒ 点名（不是静默漏掉 ✗）', missingFromPlan({ stories: ['a', 'b'], plan: [{ cmd: ['x', 'a'] }] }).length === 1],
			['汇总：任一 rc≠0 ⇒ ok=false ＋ 失败清单 ✓', (() => { const s = summarizeRuns([{ cmd: ['x'], rc: 0 }, { cmd: ['y'], rc: 1 }]); return s.ok === false && s.total === 2 && s.failed[0].cmd === 'y'; })()],
			['汇总：全 0 ⇒ ok=true ✓', summarizeRuns([{ cmd: ['x'], rc: 0 }]).ok === true],
		];
		let bad = 0;
		for (const [label, ok] of cases) { if (ok) console.log(`      ✓ 自证·${label}`); else { bad++; console.error(`      ✗ 自证·${label}`); } }
		console.log(bad ? `✗ story-ci 自证：${bad} 条不合格` : '✔ story-ci 自证通过');
		process.exit(bad ? 1 : 0);
	}

	// ── `--list`（**能假的那一格** ✗：新故事必须出现 ⇒ 否则"自动被覆盖"是空话 ✓）──
	if (argv.includes('--list')) {
		const root = (argv.find((a) => a.startsWith('--stories-dir=')) ?? '').slice('--stories-dir='.length) || STORIES;
		for (const s of discoverStories(root)) console.log(s);
		process.exit(0);
	}

	const full = argv.includes('--full');
	const one = (argv.find((a) => a.startsWith('--story=')) ?? '').slice('--story='.length) || null;
	// `--story=` 可给**目录**（仓外用户故事包 ✓）或 slug ✓；给目录时只跑那一个（发现不适用 ✗）
	// 发现根可换 ✓（`--stories-dir=`）：既能指**仓外故事集** ✓，也让本件的自证能用临时目录 ✗ ——
	//   不往仓内塞夹具 ✓（往 `stories/` 塞会在并发段里被别人看见 ✗，与 `#976` 同类事故 ✓）。
	const root = (argv.find((a) => a.startsWith('--stories-dir=')) ?? '').slice('--stories-dir='.length) || STORIES;
	const stories = one && !existsSync(join(root, one)) ? [] : discoverStories(root);
	const plan = buildPlan({ stories, slug: one, full });

	const missing = missingFromPlan({ stories, plan });
	// ⚠️ **取不到输入就不许判过** ✗（与 `commands.mjs` 同口径 ✓）：发现到 0 个故事时逐故事面会**整批消失** ✓，
	//   若不判红，末行照写「通过」✗ —— 目录改名／路径写错／CI 工作目录变，都会让 CI **照绿** ✗。
	//   （这是本件自己那条探针的**镜像** ✗：它堵「发现到了却没进编排」✓，这里堵「一个都没发现」✓。）
	//   口径：全局面**照跑** ✓（不因 0 故事跳过 ⇒ 诊断完整 ✓）；跑完再判红并点名 ✓。
	const zeroStories = !one && stories.length === 0;
	console.log(`══ 用户故事 CI（\`#984\`）══ 发现 ${stories.length} 个故事${one ? ` · 只跑 ${one}` : ''}${full ? ' · **--full**（含重面 ✓）' : ' · 轻档 ✓'}`);
	if (missing.length) {
		for (const m of missing) console.error(`  ✗ ${m.slug}：${m.why}`);
		process.exit(1);
	}
	const results = [];
	for (const p of plan) {
		const r = run(p.cmd);
		results.push(r);
		const tag = r.rc === 0 ? '✔' : '✗';
		console.log(`  ${tag} [${p.k}] ${p.name}  ${(r.ms / 1000).toFixed(1)}s`);
		if (r.rc !== 0) console.error(`\n${r.out.slice(-1200)}`);
	}
	// ⚠️ **唯一裁决** ✓（`#989`）：末行的 `✔/✗`、`x/y`、清单、**退出码**全从这一处长出来 ✓
	//   —— 原先末行只由 `summarizeRuns` 拼 ✗、rc 另算 ✗ ⇒ 会出现"末行印 ✔ 4/4 通过 而 rc=1"✗。
	const v = finalVerdict({ results, zeroStories, root, rootExists: existsSync(root) });
	for (const f of v.failed) if (!f.cmd) console.error(`  ✗ ${f.reason}`);   // 非命令类失败（0 故事 ✓）单独交代原因 ✓
	console.log(`\n${v.ok ? '✔' : '✗'} 用户故事 CI：${v.passed}/${v.total} 通过 · 墙钟 ${(v.ms / 1000).toFixed(1)}s${v.ok ? '' : ` · 失败 ${v.failed.map((f) => (f.cmd ? `\`${f.cmd}\`` : f.reason)).join('、')}`}`);
	process.exit(v.ok ? 0 : 1);
}

export { run };
