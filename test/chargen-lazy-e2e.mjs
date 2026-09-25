// `#1418` 自证：**启用车卡的新格式故事 ⇒ `Game.Chargen` 必须在**（引擎侧 · fixture 驱动 · ✗ 不跑真故事）。
//
// 根因（读码 ＋ 实测）：`src/80-script.twee` 里 `Game.Chargen` 由**一次性 `if (typeof Sg.story.chargen === 'function')`**
//   建立 ⇒ 而 `Sg.story.chargen`（故事数据面生成的 `18-chargen.twee`）按段序**排在引擎件之后** ⇒
//   本段执行那一刻它**还没到** ⇒ **`Game.Chargen` 永不定义** ✗
//   （＝"**数据在但不生效**"：产物里有 `Sg.story.chargen`、build 绿、界面无报错 ✗）
// 修法：**访问时惰性求值**（getter 代理 ⇒ 首次访问时才建，那时故事面早已在场 ✓）
//
// 两态：① `Game.Chargen` 类型是 object（✗ 不是 undefined）＋ `rounds` 可读（＝3）
//      ② 车卡真跑得动：`applyPreset(0)` ⇒ 出身/背景被施加 ＋ `finalized=true` ＋ `max_hp` 是有限数
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
// ★ 用**临时外根**（照 `hp-nan-e2e`／`block-args-e2e` 同族先例）：仓内根会让 `assertFreshDist` 拿
//   "引擎源 mtime"比"夹具 dist" ⇒ 恒判旧 ⇒ 假红 ✗（实测踩到过 ✓）
const WORK = mkdtempSync(join(tmpdir(), 'sg-chargen-'));
const stories = join(WORK, 'stories');
cpSync(join(ROOT, 'test/fixtures/m3-chargen-fixture/stories'), stories, { recursive: true });
for (const f of ['15-tables.twee', '17-rules.twee', '18-chargen.twee', '00-meta.twee']) {
	const q = join(stories, 'cg', f); if (existsSync(q)) rmSync(q);
}
execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' });
process.env.SG_STORIES_DIR = stories;
const { boot } = await import('./boot.mjs');
const B = await boot({ story: 'cg', random: 0.5 });
const w = B.w;
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };

t('① 前提：故事数据面在（`Sg.story.chargen` 是 function）', w.eval('typeof window.Sg?.story?.chargen') === 'function');
t('① ★`Game.Chargen` **类型是 object**（✗ 不是 undefined —— 本缺陷的正面判据）',
	w.eval('typeof window.Game?.Chargen') === 'object', String(w.eval('typeof window.Game?.Chargen')));
t('① ★`Game.Chargen.rounds` **可读且为 3**（消费者 `test/properties.mjs` 正是这样读的）',
	w.eval('window.Game?.Chargen?.rounds?.length') === 3, String(w.eval('window.Game?.Chargen?.rounds?.length')));
w.eval('(function(){SugarCube.State.variables.pc = window.Game.Pc.defaults();})()');
t('② 车卡真跑得动：`applyPreset(0)` ⇒ 出身/背景被施加（`北地人`／`刀客`）', (() => {
	try { w.eval('(function(){window.Game.Chargen.applyPreset(0);})()'); }
	catch (e) { console.error('      applyPreset 抛：' + String(e.message).slice(0, 90)); return false; }
	return w.eval('SugarCube.State.variables.pc.classLabel') === '北地人'
		&& w.eval('SugarCube.State.variables.pc.bgLabel') === '刀客';
})());
t('② 且 `finalize` 生效：`finalized=true` ＋ `max_hp` 与 `hp` 都是**有限数**（✗ 不是 undefined/NaN）', (() => {
	const fin = w.eval('SugarCube.State.variables.pc.finalized');
	const hp = w.eval('SugarCube.State.variables.pc.hp');
	const mx = w.eval('SugarCube.State.variables.pc.max_hp');
	return fin === true && Number.isFinite(hp) && Number.isFinite(mx);
})(), String(w.eval('JSON.stringify({fin:SugarCube.State.variables.pc.finalized,hp:SugarCube.State.variables.pc.hp,mx:SugarCube.State.variables.pc.max_hp})')));

if (B.uncaught?.length) { bad++; console.error('  ✗ 页面有未捕获异常：' + B.uncaught.slice(0, 2).join(' ｜ ')); }
try { await B.close?.(); } catch { /* 忽略 */ }
rmSync(WORK, { recursive: true, force: true });
if (bad) { console.error(`\n✗ chargen 惰性安装自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ chargen 惰性安装自证通过（Game.Chargen 在场 ＋ rounds 可读 ＋ 车卡真跑得动 ＋ finalize 生效）');
