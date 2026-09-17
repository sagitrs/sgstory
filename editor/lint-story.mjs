// 故事包 lint（`#762` P0 · 车道 E 第一步 · 伞 `#761`／D-session `#215`）
//
// 「保存即 lint」的 CLI 前置：给一份**故事包**（`stories/<slug>/`，真源＝`data/*.json`），
// 回答「这份包编译得动吗 · 和手写版等价吗 · 它自己的门全绿吗」——**输出与门同结论**
// （门一律经 `scripts/audit.mjs` 原调用路径跑，本文件不重实现任何判据）。
//
// 用法：node editor/lint-story.mjs <slug|目录路径> [--json] [--dist=<index.html 路径>]
//   `--dist`：构建产物路径（默认 `dist/index.html`）——**前置**：部分故事门（a11y 等）需要 dist ⇒ 缺了要
//     给**明确前置 finding**（"先去 build"），不许把"环境态缺失"混成"判据不通过"（红要讲人话）。
//   `--json`：**诊断是数据**（`#794` 第①条）——把 findings 以 JSON 打给 stdout（人读面默认不变）：
//     { slug, dir, ok, findings: [{ step, ok, detail }], steps, gates }
//   步骤（全部 fail-loud，绝不静默缺测）：
//     ① 包形状：00-story.json 可解析 · data/tables.json + data/contract.json 在位（schema v0 成员）
//     ② 编译＋幂等：compile-story 连跑两次，产物逐字节相同（P0 验收判据）
//     ③ 等价：equiv.mjs（L1 结构/多实参行为 ＋ L3 剥注释逐字节；数据化完全后此步自然平凡）
//     ④ 门：本故事**自己**的门（discovery 的 gatesForStory(slug) 发现）经 audit 原路径全量跑
//     ⑤ 形状：test/story-shape.mjs（真实契约＋六条自证，仓既有门）
//   未数据化的故事（无 data/）＝ **红**（理由：未数据化）——不是跳过：lint 的对象就是数据包。
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// ⚠️ **主模块守卫**（本文件同时是库：命令体将被 `lib/host/commands.mjs` 复用）——没有守卫时 `import` 会**执行 CLI**：
//   实测 `import('editor/lint-story.mjs')` ⇒ 打印用法 ＋ `process.exit(2)` ⇒ **把导入方一起杀掉** ✗
//   （"副作用藏在 import 里"）。声明必须放 **imports 之后、逻辑之前**：放后面会 TDZ ✗（`Cannot access 'isMain' before initialization`）。
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
// argv 派生值 ⇒ 只在**被当脚本执行**时取（`import` 时不读 argv ✓ —— 否则模块状态随导入方的 argv 变 ✗）
let JSON_OUT = false;
let DIST = '';
// ⚠️ `slug`／`dir` 也必须是**模块级**：`emit()` 是模块级闭包（`--json` 要打这两个字段）⇒ 放进 `main()` 里会
//   在报错/收尾路径上抛 `ReferenceError: slug is not defined`（实测：搬包体时踩到 ⇒ 被对拍 v3 的 `lint-json` 档抓住 ✓）
let slug = '';
let dir = '';
const findings = [];
let step = 'shape';   // ① 包形状（首个 finding 归属）
const say = (m) => { if (!JSON_OUT) console.log(m); };
const emit = (code) => {
	if (JSON_OUT) process.stdout.write(JSON.stringify({ slug, dir, ok: code === 0, findings }, null, 1) + '\n');
	process.exit(code);
};
const ok = (m) => { findings.push({ step, ok: true, detail: m }); say(`  ✔ ${m}`); };
const fail = (m) => {
	findings.push({ step, ok: false, detail: m });
	if (!JSON_OUT) console.error(`  ✗ ${m}`);
	emit(1);
};
const sh = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });

const main = async () => {
	JSON_OUT = process.argv.includes('--json');
	DIST = (process.argv.find((a) => a.startsWith('--dist=')) ?? '').slice('--dist='.length)
		|| new URL('../dist/index.html', import.meta.url).pathname;
	const arg = process.argv[2];
	if (!arg) { console.error('用法：node editor/lint-story.mjs <slug|目录路径> [--json]'); process.exit(2); }
	// `<slug>`＝stories/<slug>；含路径分隔符或已存在的目录 ⇒ 当**目录**（临时探针/仓外包亦可用；CLI 契约向后兼容）
	const asPath = arg.includes('/') || existsSync(arg);
	dir = asPath ? arg : join(ROOT, 'stories', arg);
	slug = asPath ? arg.replace(/\/+$/, '').split('/').pop() : arg;
	say(`lint-story：${slug}${asPath ? `（路径 ${dir}）` : ''}`);
	if (!existsSync(dir)) fail(`故事目录不存在：${dir}`);
	let manifest = null;
	try { manifest = JSON.parse(readFileSync(join(dir, '00-story.json'), 'utf8')); }
	catch (e) { fail(`00-story.json 不可解析：${e.message}`); }
	if (!Array.isArray(manifest?.files) || !manifest.files.length) fail('00-story.json 缺 files（非空数组）');
	const dataTables = join(dir, 'data', 'tables.json');
	const dataContract = join(dir, 'data', 'contract.json');
	if (!existsSync(dataTables) || !existsSync(dataContract)) {
		fail('未数据化（缺 data/tables.json 或 data/contract.json）——lint 的对象是数据包；先走 #762 的数据化往返');
	}
	try { JSON.parse(readFileSync(dataTables, 'utf8')); JSON.parse(readFileSync(dataContract, 'utf8')); }
	catch (e) { fail(`data/*.json 不可解析：${e.message}`); }
	ok(`包形状（files×${manifest.files.length} · tables/contract 可解析）`);

	// ── ② 编译＋幂等 ──
	step = 'compile';
	const gen = join(ROOT, 'build', 'generated', slug);
	rmSync(gen, { recursive: true, force: true });
	let r1 = sh('node', ['editor/compile-story.mjs', slug]);
	if (r1.status !== 0) fail(`编译失败（第一次）：\n${(r1.stderr || r1.stdout || '').slice(0, 800)}`);
	const snap = join(ROOT, 'build', 'generated', `${slug}.lint-snap`);
	rmSync(snap, { recursive: true, force: true });
	sh('cp', ['-r', gen, snap]);
	const r2 = sh('node', ['editor/compile-story.mjs', slug]);
	if (r2.status !== 0) fail(`编译失败（第二次）：\n${(r2.stderr || r2.stdout || '').slice(0, 800)}`);
	const diff = sh('diff', ['-r', snap, gen]);
	if (diff.status !== 0) fail(`编译不幂等（两次产物有差）：\n${(diff.stdout || '').slice(0, 400)}`);
	rmSync(snap, { recursive: true, force: true });
	ok('编译 ＋ 幂等（两次产物逐字节相同）');

	// ── ③ 等价（L1/L3）──
	step = 'equiv';
	const req = sh('node', ['editor/equiv.mjs', slug]);
	if (req.status !== 0) fail(`等价判据未过（L1/L3）：\n${(req.stdout || req.stderr || '').slice(0, 800)}`);
	ok('等价（L1 结构/行为 ＋ L3 剥注释形式）');

	// ── ④ 门：本故事自己的门，经 audit 原路径（同结论保证＝同一调用面，零重实现）──
	const { gatesForStory } = await import(join(ROOT, 'scripts/audit/discovery.mjs'));
	const gates = await gatesForStory(slug);
	const flags = [...new Set(gates.flatMap((g) => g.flags ?? []))];
	if (!flags.length) fail('本故事没有可跑的门（gatesForStory 为空）——门是 lint 的一部分，缺门＝红');
	// 前置：故事门里有的要读构建产物（a11y 等）⇒ 缺 dist 就**明确说"缺前置"**，不混成门红（红要讲人话）
	step = 'precondition';
	const DIST_GATES = ['a11y'];   // 需要 dist 的门面（新增即在此列）
	if (flags.some((f) => DIST_GATES.includes(f)) && !existsSync(DIST)) {
		fail(`前置缺失：${DIST} 不存在 ⇒ 先跑 \`node build.mjs\`（故事门里的 a11y 等需要构建产物；这是环境态，不是判据不通过）`);
	}
	step = 'gates';
	const ra = sh('node', ['scripts/audit.mjs', '--story', slug, '--check', ...flags.map((f) => `--${f}`)]);
	if (ra.status !== 0) fail(`故事门有红（${flags.length} 面）：\n${(ra.stdout || ra.stderr || '').slice(0, 1200)}`);
	ok(`故事门 ×${flags.length} 面全绿（audit 原路径）`);

	// ── ⑤ 形状门（真实契约 ＋ 自证六条）──
	step = 'story-shape';
	const rs = sh('node', ['test/story-shape.mjs']);
	if (rs.status !== 0) fail(`story-shape 门红：\n${(rs.stdout || rs.stderr || '').slice(0, 600)}`);
	ok('story-shape 门');

	say(`\n✔ lint-story：${slug} 通过（包形状 · 编译幂等 · 等价 · 门 ×${flags.length} · 形状）`);
	emit(0);
};

if (isMain) await main();
