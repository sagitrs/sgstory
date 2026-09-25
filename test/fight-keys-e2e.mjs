// `#1413` 自证：**战斗结果维**（`fight:<池名>.won` / `.lost` / `.done`）—— 引擎侧 · fixture 驱动 · ✗ 不跑真故事。
//
// 诉求：新格式下作者**能起战斗**（`<<fightbegin>>`／`<<fightlog>>`／`<<fightpanel>>`），但**"赢/输"无处声明** ✗
//   ⇒ 旧故事只能在散文里写 `<<if $pc.hp gt 0>>` ＋ `<<if $pc.ev.fight.round gt 2>>` ＋ `<<set $pc.ev.fight.done to true>>`
//      （＝**散文里写计算**，新格式没有落点 ✗）。
//
// 形态（甲，与 `chk:` **同构**）：`<<fightend "<池名>" [won|lost]>>` ⇒ 引擎落
//   `State.variables.fights[<池名>] = { won, lost, done, round, pcHp }` ⇒ 条件行可写 `fight:<池名>.won` ✓
//   ★**结果由作者显式给**（✗ 引擎不判"打够几回合算赢" —— 那是故事策略 ✗）；不传也落事实（won/lost 都为 false）
//   ★**未收尾就引用 ⇒ fail-loud 点名**（照 `chk:` 那条"本次尚未检定"先例 ⇒ ✗ 不静默当 false）
//
// 三段两态：① 未收尾 ⇒ 分叉都不出 ＋ fail-loud ② 收尾 won ⇒ 只出「胜」③ 收尾 lost ⇒ 只出「败」
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
// ★ 用**临时外根**（照 `hp-nan-e2e`／`block-args-e2e` 同族先例）—— ✗ 不用仓内根：
//   仓内根会让 `assertFreshDist` 拿"**引擎源** mtime"比"该夹具 dist" ⇒ 恒判旧 ⇒ 假红 ✗（实测踩到 ✓）
const WORK = mkdtempSync(join(tmpdir(), 'sg-fightkeys-'));
const stories = join(WORK, 'stories');
cpSync(join(ROOT, 'test/fixtures/m3-fight-keys/stories'), stories, { recursive: true });
for (const f of ['15-tables.twee', '17-rules.twee', '00-meta.twee']) {
	const q = join(stories, 'fk', f); if (existsSync(q)) rmSync(q);
}
execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' });
process.env.SG_STORIES_DIR = stories;
const { boot } = await import('./boot.mjs');
const B = await boot({ story: 'fk', random: 0.5 });
const w = B.w, S = w.SugarCube.State;
const links = () => [...w.document.querySelectorAll('#passages a.link-internal')].map((a) => a.textContent.trim());
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };
t('① 未收尾时：两条分叉**都不出现**（`fight:` 引用尚未收尾 ⇒ 条件求值 fail-loud ⇒ 页面有报错）',
	!links().some((x) => x.includes('查看战果')));
const pageTxt = (w.document.getElementById('passages')?.textContent ?? '');
t('① 且是 **fail-loud 点名**（✗ 不静默当 false）', /尚未收尾/.test(pageTxt), pageTxt.slice(0, 90));
// ② 收尾为 won ⇒ 只剩「胜」那条
// ★ 顺序：**先设战斗态 ⇒ 再收尾**（fightend 读 `pc.ev.fight.pool` 判"是不是这一场"）
w.eval('(function(){SugarCube.State.variables.fights={};SugarCube.State.variables.pc.ev.fight={pool:"雾影",namedFoe:true,round:3,done:false};})()');
w.eval('(function(){const d=document.createElement("div");document.body.appendChild(d);new SugarCube.Wikifier(d,"<<fightend \\"雾影\\" won>>");})()');
await w.SugarCube.Engine.play('斗'); await B.settle();
t('② 收尾 won ⇒ 出现「胜」那条（`fight:雾影.won` 命中）', links().includes('查看战果（胜）'), links().join(' | '));
t('② 且**不出现**「败」那条', !links().includes('查看战果（败）'));
// ③ 重开一局、收尾为 lost
w.eval('(function(){SugarCube.State.variables.fights={};SugarCube.State.variables.pc.ev.fight={pool:"雾影",namedFoe:false,round:2,done:false};})()');
w.eval('(function(){const d=document.createElement("div");document.body.appendChild(d);new SugarCube.Wikifier(d,"<<fightend \\"雾影\\" lost>>");})()');
await w.SugarCube.Engine.play('斗'); await B.settle();
t('③ 收尾 lost ⇒ 出现「败」那条', links().includes('查看战果（败）'), links().join(' | '));
t('③ 且**不出现**「胜」那条', !links().includes('查看战果（胜）'));
if (B.uncaught?.length) console.log('  （uncaught 非空属正常：① 的 fail-loud 就是抛错）', B.uncaught.slice(0, 1).join('').slice(0, 60));

if (bad) { console.error(`\n✗ fight: 结果维自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ fight: 结果维自证通过（未收尾 fail-loud ＋ won/lost 各自唯一分叉）');
try { rmSync(WORK, { recursive: true, force: true }); } catch { /* 忽略 */ }
