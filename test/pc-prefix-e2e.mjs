// `#1474` 自证：**效果面路径不带 `pc.` 前缀**（写侧一处收束 ⇒ fail-loud 点名）—— 引擎侧 · fixture 驱动
//
// 真因（作者实测）：`pc.` 前缀**只在 `cond` 面被宣告**（那是**读侧**取值语法）；
//   而效果面（`sets`／`adds`／`yields.y.path`）的路径是**相对 `pc`** 的 ⇒ ★写成 `pc.心情`
//   会被 `split('.')` 成 `['pc','心情']` ⇒ **静默写到 `pc.pc.心情`** ✗
//   （界面无错、报文自称成功、而**真正该写的地方没写** —— 与 `#1419`／`#1423`「数据在但不生效」族同族）
// ★裁定＝**甲-2**（写侧一处收束）：`applySets`／`applyAdds`／`applyYields` 的路径**都经 `Sg.notes.writePath`**
//   ⇒ ★**一处拦 ⇒ 将来第四个效果字段自动覆盖**（✗ 三处各加 ⇒ 第四处必漏 —— "同概念多入口"的老病）
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const WORK = mkdtempSync(join(tmpdir(), 'sg-pcprefix-'));
const stories = join(WORK, 'stories');
cpSync(join(ROOT, 'test/fixtures/m3-adds-fixture/stories'), stories, { recursive: true });
for (const f of ['15-tables.twee', '17-rules.twee', '00-meta.twee']) {
	const q = join(stories, 'ad', f); if (existsSync(q)) rmSync(q);
}
execFileSync(process.execPath, [join(ROOT, 'editor/compile-story.mjs'), 'ad', `--out=${join(stories, 'ad')}/`], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' });
execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' });
process.env.SG_STORIES_DIR = stories;
const { boot } = await import('./boot.mjs');
const B = await boot({ story: 'ad', random: 0.5 });
const w = B.w, S = w.SugarCube.State, R = w.Sg.rules, N = w.Sg.notes;
const pc = S.variables.pc;
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };
const throws = (fn) => { try { fn(); return ''; } catch (e) { return String(e && e.message || e); } };

// ① 三处**各抛**（★不是"一处抛就算"—— 三个调用方都要经同一条路 ✓）
const e1 = throws(() => R.applySets({ sets: ['pc.心情'] }, pc));
t('① `sets` 带 `pc.` 前缀 ⇒ **抛错点名**', /pc\./.test(e1) && /前缀/.test(e1), e1.slice(0, 80));
const e2 = throws(() => R.applyAdds({ adds: { 'pc.心情': 1 } }, pc));
t('② `adds` 带 `pc.` 前缀 ⇒ **抛错点名**', /pc\./.test(e2) && /前缀/.test(e2), e2.slice(0, 80));
const e3 = throws(() => R.applyYields({ yields: [{ id: 'x', path: 'pc.心情' }] }, pc));
t('③ `yields.y.path` 带 `pc.` 前缀 ⇒ **抛错点名**', /pc\./.test(e3) && /前缀/.test(e3), e3.slice(0, 80));
t('★④ 且**报文点出"会静默落到 `pc.pc.…`"**（✗ 不只说"非法" —— 要让人知道真后果 ✓）',
	/pc\.pc\./.test(e1), e1.slice(0, 110));

// ⑤⑥⑦ **不误报面**（照写作者的"别顺手改"三条）
t('⑤ ★裸键**在 `writePath` 层**不加 `ev.`（那是 `applySets` 的活 ⇒ `writePath` 只认已拼好的路径）——★读真相 ✓',
	(() => { N.writePath(pc, '裸键', 7); return pc.裸键 === 7 && pc.ev?.裸键 === undefined; })());
t('⑤b 而 `applySets` 的**裸键**仍默认 `ev.`（作者面口径不变 ✓）',
	(() => { R.applySets({ sets: ['心情A'] }, pc); return pc.ev.心情A === true; })());
t('⑥ `ev.` ／ `world.` 仍过',
	(() => { N.writePath(pc, 'world.心情', 3); return pc.world.心情 === 3; })());
t('⑦ ★`gives` 的**库存键名**不拦（`pc.inv["pc.心情"]` 合理 ✓ —— 库存键不是"笔记路径"）',
	(() => { R.applyGrants({ gives: ['pc.心情'] }, pc); return pc.inv['pc.心情'] === true; })());

if (B.uncaught?.length) { bad++; console.error('  ✗ 页面有未捕获异常：' + B.uncaught.slice(0, 2).join(' ｜ ')); }
try { await B.close?.(); } catch { /* 忽略 */ }
rmSync(WORK, { recursive: true, force: true });
if (bad) { console.error(`\n✗ pc. 前缀拒绝自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ pc. 前缀拒绝自证通过（写侧一处收束 · 三处各抛 · 不误伤裸键/ev./world./gives）');
