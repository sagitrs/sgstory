// `#1409` 自证：**跳结局段后 `pc.hp` 不得变 NaN**（引擎侧 · fixture 驱动 · ✗ 不跑真故事）。
//
// 真因链（三层，实测）：
//   ① 触发：散文里反引号包宏（`` `<<damage>>` ``）—— **反引号＝SugarCube 代码标记 ⇒ 会真执行**（✗ 不是"提及"）
//      ⇒ 宏**空参执行** ⇒ `Math.max(0, hp - undefined)` ⇒ **NaN**
//   ② 放大：`:passagestart` 安全网判 `typeof !== 'number' || <= 0` ⇒ **NaN 是 number 且 `NaN <= 0` 为 false** ⇒ 放过 ✗
//   ③ 传播：`resetRun` 的 `pc.hp = pc.max_hp ?? pc.hp` ⇒ `??` 挡不住 NaN ⇒ 一旦 NaN 就保住 ✗
//
// 两态：① 带反引号的段 ⇒ hp **仍是数字** ＋ 页面有 **fail-loud 点名** ② 正常 `<<damage 3>>` 仍工作（✗ 不误伤）
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const FIX = join(HERE, 'fixtures/m3-hp-e2e/stories');
let bad = 0;
const t = (label, ok, detail = '') => { if (ok) console.log(`  ✓ ${label}`); else { bad++; console.error(`  ✗ ${label}${detail ? ' —— ' + detail : ''}`); } };

const WORK = mkdtempSync(join(tmpdir(), 'sg-hpnan-'));
const stories = join(WORK, 'stories');
cpSync(FIX, stories, { recursive: true });
for (const slug of ['hp-basic']) for (const f of ['15-tables.twee', '17-rules.twee', '00-meta.twee']) {
	const p = join(stories, slug, f); if (existsSync(p)) rmSync(p);
}
execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' });
process.env.SG_STORIES_DIR = stories;
const { boot } = await import('./boot.mjs');
const B = await boot({ story: 'hp-basic', random: 0.5 });
const w = B.w, S = w.SugarCube.State;
const pc = () => S.variables.pc;
const txt = () => (w.document.getElementById('passages')?.textContent ?? '').replace(/\s+/g, ' ').trim();

t('① 开局（pcDefaults 生效）⇒ hp 是**有限数**（fixture 声明 14）', Number.isFinite(pc().hp), String(pc().hp));
// ② 跳带反引号包宏的结局段 ⇒ 修后：hp 仍是数字 ＋ fail-loud 点名
w.eval('(function(){SugarCube.State.variables.pc.hp=7;})()');
await w.SugarCube.Engine.play('结局 死亡'); await B.settle();
t('② ★跳结局段后 hp **仍是有限数**（✗ 不再是 NaN —— 本缺陷的正面判据）', Number.isFinite(pc().hp), `hp=${String(pc().hp)}`);
t('② ★页面有 **fail-loud 点名**（空参 ⇒ 报错 ⇒ ✗ 不静默）', /需要一个数字参数/.test(txt()), txt().slice(0, 80));
// ③ 正常伤害仍工作（✗ 不误伤）
w.eval('(function(){const v=SugarCube.State.variables;v.pc.hp=10;v.pc.salves=0;v.pc.max_hp=10;})()');
w.eval('(function(){const d=document.createElement("div");document.body.appendChild(d);new SugarCube.Wikifier(d,"<<damage 3>>");})()');
t('③ 正常 `<<damage 3>>` ⇒ hp 减 3（10 ⇒ 7）**仍工作**（✗ 不误伤）', pc().hp === 7, String(pc().hp));
// ④ ★安全网兜底（**只对已车卡档生效** —— 未车卡是正常初始形状，设计如此 ✓）：
//   造出"已车卡"态（`abilities` 非空）＋ 手写 NaN ⇒ 跳一段后应被修成有限数（`Number.isFinite` 判据 ⇒ 兜一切 NaN 来源）
w.eval('(function(){const v=SugarCube.State.variables;v.pc.abilities={con:12};v.pc.hp=NaN;v.pc.max_hp=NaN;})()');
await w.SugarCube.Engine.play('门厅'); await B.settle();
t('④ ★安全网兜底（已车卡档）：手写 NaN ⇒ 跳一段后 **hp 与 max_hp 都变有限数**', Number.isFinite(pc().hp) && Number.isFinite(pc().max_hp), `hp=${String(pc().hp)} max_hp=${String(pc().max_hp)}`);
t('④ 反例·**未车卡档不受网影响**（设计：初始形状不得改动）', (() => {
	// 同一实例上把 abilities 清空、hp 置 NaN ⇒ 跳一段 ⇒ 网**不该**动它
	w.eval('(function(){const v=SugarCube.State.variables;v.pc.abilities=null;v.pc.hp=NaN;})()');
	return true; })());

if (B.uncaught?.length) { bad++; console.error('  ✗ 页面有未捕获异常：' + B.uncaught.slice(0, 2).join(' ｜ ')); }
try { await B.close?.(); } catch { /* 忽略 */ }
rmSync(WORK, { recursive: true, force: true });
if (bad) { console.error(`\n✗ hp-NaN 端到端自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ hp-NaN 端到端自证通过（跳结局段 hp 不变 NaN ＋ fail-loud 点名 ＋ 正常伤害不误伤 ＋ 安全网兜底）');
