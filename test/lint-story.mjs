// lint-story 自证门（车道 E · `#762` P0 · D-session `#215`）
//
// 三条（`docs/dev-conventions.md` §9 口径：正例必须放过 ＋ 反例必须抓住，失败计入退出码）：
//   ① 正例：minimal-demo 全链绿（包形状 → 编译幂等 → 等价 → 门 ×N → 形状）
//   ② 反例·数据坏：tables.json 被改成非法 JSON ⇒ 必须红在「包形状」步（fail-loud，不许静默）
//   ③ 反例·未数据化：hollow-cave（尚无 data/）⇒ 必须红在「未数据化」（不是跳过）
// 反例的手法：**临时目录副本**（改副本的 00-story.json 指向？不——lint 以 slug 定位 stories/<slug>）⇒
//   ② 直接改真文件再**即时恢复**（finally），改动窗口内跑 lint；恢复后复跑一次正例自证无残留。
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let bad = 0;
const case_ = (label, ok, extra = '') => {
	if (ok) console.log(`      ✓ 自证·${label}`);
	else { bad++; console.error(`      ✗ 自证·${label}${extra ? '：' + extra : ''}`); }
};
const lint = (slug) => spawnSync('node', ['editor/lint-story.mjs', slug], { cwd: ROOT, encoding: 'utf8' });

// ① 正例
const r1 = lint('minimal-demo');
case_('正例·minimal-demo 全链绿', r1.status === 0, r1.status === 0 ? '' : (r1.stdout + r1.stderr).slice(0, 300));

// ② 反例·数据坏（改真文件 → 红 → finally 恢复 → 复跑正例自证无残留）
const p = join(ROOT, 'stories/minimal-demo/data/tables.json');
const orig = readFileSync(p, 'utf8');
try {
	writeFileSync(p, '{ oops');
	const r2 = lint('minimal-demo');
	const out = (r2.stdout || '') + (r2.stderr || '');
	case_('反例·坏 JSON 红在包形状', r2.status === 1 && out.includes('不可解析'), `status=${r2.status}`);
} finally { writeFileSync(p, orig); }
const r2b = lint('minimal-demo');
case_('反例后无残留（复跑正例）', r2b.status === 0);

// ③ 反例·未数据化（**临时探针目录**——不绑某故事的数据化进度：hollow-cave 翻面后此档会失去意义）
import { mkdtempSync, writeFileSync as wf, rmSync as rm } from 'node:fs';
import { tmpdir } from 'node:os';
const probe = mkdtempSync(join(tmpdir(), 'lint-story-probe-'));
try {
	wf(join(probe, '00-story.json'), JSON.stringify({ slug: 'probe', files: ['10-x.twee'] }));
	const r3 = spawnSync('node', ['editor/lint-story.mjs', probe], { cwd: ROOT, encoding: 'utf8' });
	const out3 = (r3.stdout || '') + (r3.stderr || '');
	case_('反例·未数据化红（非跳过）', r3.status === 1 && out3.includes('未数据化'), `status=${r3.status}`);
} finally { rm(probe, { recursive: true, force: true }); }

if (bad) { console.error(`\n✗ lint-story 自证门：${bad} 条未过`); process.exit(1); }
console.log('\n✔ lint-story 自证门通过（正例 1 · 反例 2 · 无残留）');
