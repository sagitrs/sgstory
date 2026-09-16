// 故事包 lint（`#762` P0 · 车道 E 第一步 · 伞 `#761`／D-session `#215`）
//
// 「保存即 lint」的 CLI 前置：给一份**故事包**（`stories/<slug>/`，真源＝`data/*.json`），
// 回答「这份包编译得动吗 · 和手写版等价吗 · 它自己的门全绿吗」——**输出与门同结论**
// （门一律经 `scripts/audit.mjs` 原调用路径跑，本文件不重实现任何判据）。
//
// 用法：node editor/lint-story.mjs <slug>
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
const ok = (m) => console.log(`  ✔ ${m}`);
const fail = (m) => { console.error(`  ✗ ${m}`); process.exit(1); };
const sh = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });

const arg = process.argv[2];
if (!arg) { console.error('用法：node editor/lint-story.mjs <slug|目录路径>'); process.exit(2); }
// `<slug>`＝stories/<slug>；含路径分隔符或已存在的目录 ⇒ 当**目录**（临时探针/仓外包亦可用；CLI 契约向后兼容）
const asPath = arg.includes('/') || existsSync(arg);
const dir = asPath ? arg : join(ROOT, 'stories', arg);
const slug = asPath ? arg.replace(/\/+$/, '').split('/').pop() : arg;
console.log(`lint-story：${slug}${asPath ? `（路径 ${dir}）` : ''}`);
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
const req = sh('node', ['editor/equiv.mjs', slug]);
if (req.status !== 0) fail(`等价判据未过（L1/L3）：\n${(req.stdout || req.stderr || '').slice(0, 800)}`);
ok('等价（L1 结构/行为 ＋ L3 剥注释形式）');

// ── ④ 门：本故事自己的门，经 audit 原路径（同结论保证＝同一调用面，零重实现）──
const { gatesForStory } = await import(join(ROOT, 'scripts/audit/discovery.mjs'));
const gates = await gatesForStory(slug);
const flags = [...new Set(gates.flatMap((g) => g.flags ?? []))];
if (!flags.length) fail('本故事没有可跑的门（gatesForStory 为空）——门是 lint 的一部分，缺门＝红');
const ra = sh('node', ['scripts/audit.mjs', '--story', slug, '--check', ...flags.map((f) => `--${f}`)]);
if (ra.status !== 0) fail(`故事门有红（${flags.length} 面）：\n${(ra.stdout || ra.stderr || '').slice(0, 1200)}`);
ok(`故事门 ×${flags.length} 面全绿（audit 原路径）`);

// ── ⑤ 形状门（真实契约 ＋ 自证六条）──
const rs = sh('node', ['test/story-shape.mjs']);
if (rs.status !== 0) fail(`story-shape 门红：\n${(rs.stdout || rs.stderr || '').slice(0, 600)}`);
ok('story-shape 门');

console.log(`\n✔ lint-story：${slug} 通过（包形状 · 编译幂等 · 等价 · 门 ×${flags.length} · 形状）`);
