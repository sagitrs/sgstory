// `#1486` 自证（照 CR 甲）：**`sources[]` 真被接上**（✗ "判据本体对 ≠ 真被接上" —— `#1504` 族教训）
//
// ★为什么必须另开一格：★纯函数自证（`test/merge-sources.mjs` 21 格）测的是**合并器本身** ✓
//   ⇒ ★但它**测不到"编译期读路有没有调它"** ✗ —— ★本件补的正是那一格（端到端：夹具 ⇒ build ⇒ 产物）✓
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const ROOT = process.cwd();
const FIX = 'test/fixtures/m3-nav-fixture';
const STORIES = join(ROOT, FIX, 'stories');
const DIST = join(ROOT, FIX, 'dist/stories/nav-basic/index.html');
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };

// ① 夹具前提（★缺一即"本件未判"而不是"绿"）
const tbl = JSON.parse(readFileSync(join(STORIES, 'nav-basic/data/tables.json'), 'utf8'));
const sharedF = join(ROOT, FIX, 'shared/dnd-extra.json');
t('① 夹具前提：`tables.json` 带 `sources[]` ＋ 共享件在（✗ 否则本件没对象）',
	Array.isArray(tbl.sources) && tbl.sources.length > 0 && existsSync(sharedF), JSON.stringify(tbl.sources));

// ② ★**端到端**：清生成物 ⇒ build ⇒ ★**共享层的内容真进产物**
for (const f of ['15-tables.twee', '17-rules.twee', '00-meta.twee']) { const q = join(STORIES, 'nav-basic', f); if (existsSync(q)) rmSync(q); }
if (existsSync(join(ROOT, FIX, 'dist'))) rmSync(join(ROOT, FIX, 'dist'), { recursive: true, force: true });
execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: STORIES }, stdio: 'pipe' });
const html = readFileSync(DIST, 'utf8');
t('★② **合并真到达产物**（共享层的位点 `来自共享层` 在 build 产物里 ✓ —— ✗ 不是"合并器对但没人调"）',
	html.includes('来自共享层'), '产物里找不到共享层的位点');

// ③ ★反向（防空判）：**故事自己的内容仍在**（✗ 不是"合并把故事整份换掉"）
t('★③ 反向：故事自己的内容**仍在**（`section`/自身位点未被共享层吞掉 ✓）', html.includes('Game Tables') || html.includes('nav-basic'));

if (bad) { console.error(`\n✗ sources[] 接线自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ sources[] 接线自证通过（编译期读路真调了合并器 ⇒ 共享层到达产物）');
