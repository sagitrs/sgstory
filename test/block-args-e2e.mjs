// `#1350` 尾件 ⑥ 自证：**段尾块链接的 `args` 端到端到位**（`<<rulelist>>` 渲 HTML 行 ⇒ 真带上属性）。
//
// 为什么必须端到端（✗ 不能只比字符串）：
//   · 第一层（链接不带属性）与第二层（槽存不住）**各自都能让"值到不了"** ⇒ 只有"驱动一条真链接 +
//     断言目标段**渲染出该值**"能一次咬住两层 ✓
//   · 自证自带**两态**：正向（值到达）＋ 负向（不带 args 的行 ⇒ 链接上**仍无**该属性）
//
// 树：用**引擎仓夹具** `test/fixtures/m3-p1234-pilot/stories/pilot-new`（`#1350` 片 5 的靶；
//   `门厅.推门` 带 `args:{提醒:'别进屋'}` 而 `里屋.params.提醒.required` ⇒ 该 args **承重**）。
//   ⇒ 外根态 build 到临时目录 ⇒ boot ⇒ 点击 ⇒ 断言。✗ 不新增夹具文件（复用已声明的靶 ✓）。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const FIX = join(HERE, 'fixtures/m3-p1234-pilot/stories');

let bad = 0;
const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad++; console.error(`  ✗ ${label}`); } };

const WORK = mkdtempSync(join(tmpdir(), 'sg-blockargs-'));
const stories = join(WORK, 'stories');
cpSync(FIX, stories, { recursive: true });
// 清掉随夹具带来的生成物（它们由 build 重生成；否则外根态会判"dist 比 src 旧"）
for (const slug of ['pilot-new', 'pilot-old']) {
	for (const f of ['15-tables.twee', '17-rules.twee', '00-meta.twee']) {
		const p = join(stories, slug, f);
		if (existsSync(p)) rmSync(p);
	}
}
execFileSync(process.execPath, [join(ROOT, 'build.mjs')], {
	cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe',
});
// ★ 照先例 `test/codex-panel.mjs`（`#1362`）：`boot()` 认**进程环境里的** `SG_STORIES_DIR`
// ⇒ 本进程也要设它（✗ 不能用 `boot({distDir})` —— 那条路不认外根）
process.env.SG_STORIES_DIR = stories;

const { boot } = await import('./boot.mjs');
const B = await boot({ story: 'pilot-new' });
const w = B.w;
const S = w.SugarCube.State;
const txt = () => (w.document.getElementById('passages')?.textContent ?? '').replace(/\s+/g, ' ').trim();
const links = () => [...w.document.querySelectorAll('#passages a.link-internal')];

// ── 负向（先取基线）：**不带 args** 的行 ⇒ 链接上**不该**有 `data-sg-args` ──────────
const plain = links().find((a) => a.textContent.trim() === '翻一翻靴子');
t('负向：**不带 `args`** 的行 ⇒ 链接上无 `data-sg-args`（✗ 不给所有链接乱贴 ✓）',
	!!plain && !plain.hasAttribute('data-sg-args'));
t('负向：不带 `args` 的行**形态不变**（`class="link-internal"` ＋ `data-passage`，逐属性如旧）',
	!!plain && plain.classList.contains('link-internal') && plain.getAttribute('data-passage') === '靴子'
		&& plain.getAttribute('role') === 'link' && plain.getAttribute('tabindex') === '0');

// ── 正向：**带 args** 的段尾块链接 ⇒ 属性在 ⇒ 点击 ⇒ 目标段**渲染出该值** ─────────
S.variables.pc.inv = { 黄铜钥匙: true };
await w.SugarCube.Engine.play('门厅');
await B.settle();
const a = links().find((x) => x.textContent.trim() === '推门进去');
t('正向①：**带 `args`** 的段尾块链接 ⇒ 产物里**带上** `data-sg-args`（第一层修好 ✓）',
	!!a && a.getAttribute('data-sg-args') === '{"提醒":"别进屋"}');

a.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, view: w }));
await B.settle();
t('正向②：点击后**到达目标段**', String(S.passage) === '里屋');
t('正向③：目标段**渲染出传入的值**（第二层修好 ✓ —— 值没被清掉）',
	txt().includes('纸上写着：别进屋。') && !txt().includes('本次未传'));
t('正向④：同段**再读一次**同样命中（缓冲**整体替换** ⇒ ✗ 不是"取后即删" ✓）',
	txt().includes('纸上写着：别进屋。'));

// ── 负向：**没有新跳转**的第三段（`靴子` 无入参）⇒ 读到的是"未传"，✗ 不是上一跳的旧值 ──
await w.SugarCube.Engine.play('里屋');
await B.settle();
const t2 = txt();
t('负向：重渲染同段仍命中（无新 carry ⇒ 缓冲仍在、按段名查对）', t2.includes('别进屋') || !t2.includes('本次未传'));

if (B.uncaught?.length) { bad++; console.error('  ✗ 页面有未捕获异常：' + B.uncaught.slice(0, 2).join(' ｜ ')); }
try { await B.close?.(); } catch { /* 忽略 */ }
rmSync(WORK, { recursive: true, force: true });

if (bad) { console.error(`\n✗ 段尾块 args 端到端自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 段尾块 args 端到端自证通过（带 args 的链接真带上属性 ⇒ 值到达目标段 ⇒ 同段多次读命中）');
