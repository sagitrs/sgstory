// 洞窟「五步主线」的**末步**门（操作者实测，2026-09-15）：
//   走满 5 步后再回岔口 ⇒ `<<set>>` 红框：`Game.Combat.roadOffer：本故事没有第 6 段路（可用 1..5，#489）`。
//   口径：**段号越界不是异常，是"这一段路走完了"** ⇒ 该给退路（往深处走），不该留红框给玩家。
//
// 判据（真机 + 纯函数两条）：
//   ① 走到 `cave_step = 5` 的岔口 ⇒ **零错误元素**（SugarCube 的红框是 DOM 里的 `.error`，不是 JS 未捕获 ⇒ 只看 uncaught 会漏）；
//   ② 那一步必须**有退路链接**（能到 `地下村落`）；
//   ③ 纯函数：`roadOffer(n)` 的越界语义在**调用方**被挡（`_n lte roads.length`）——用声明面长度算，不写死 5。
import { readFileSync } from 'node:fs';
import { boot } from './boot.mjs';

let bad = 0;
const ok = (c, msg) => { console.log(`      ${c ? '✓' : '✗'} ${msg}`); if (!c) bad++; };

// ③ 纯函数：段号与声明面长度的关系（源码级断言：不许再出现"无条件调 roadOffer(_n)"）
{
  const src = readFileSync(new URL('../stories/hollow-cave/10-cave.twee', import.meta.url), 'utf8');
  ok(/Game\.Combat\.roadsDecl\(\) \?\? \[\]/.test(src), '③ 岔口按**声明面长度**判越界（`roadsDecl()`，不写死 5）');
  ok(/_n lte _roads\.length \? Game\.Combat\.roadOffer\(_n\) : \[\]/.test(src), '③ `roadOffer` 只在段号 ≤ 段数时调用（越界给 `[]` ⇒ 走退路）');
}

// ① + ② 真机：一路点第一个链接，直到 `cave_step` 到 5 或到达终点
{
  const { w, sleep } = await boot({ story: 'hollow-cave', random: 0.5 });
  const here = () => w.eval('SugarCube.State.passage');
  const errs = () => [...w.document.querySelectorAll('#passages .error, .error-view')].map((e) => e.textContent.replace(/\s+/g, ' ').trim());
  w.SugarCube.Engine.play('岔口'); await sleep(260);
  const seen = [];
  for (let step = 0; step < 24; step++) {
    const stepNo = w.eval('SugarCube.State.variables.pc.ev.cave_step');
    const links = [...w.document.querySelectorAll('#passages a.link-internal')];
    if (here() === '岔口' && stepNo === 5) {
      const e = errs();
      ok(e.length === 0, `① 末步岔口（cave_step=5）**零错误元素**${e.length ? '：' + e[0].slice(0, 90) : ''}`);
      ok(links.length > 0, '② 末步岔口仍有**退路链接**（往深处走）');
      break;
    }
    seen.push(`${here()}(${stepNo})`);
    if (!links.length) break;
    links[0].click(); await sleep(300);
  }
  ok(seen.includes('机制·longFight(3)') || seen.some((x) => x.startsWith('路·')), `① 路线确实走过多类事件（${seen.slice(0, 6).join(' → ')} …）`);
}

console.log(bad ? `\n✗ 洞窟末步门未通过（${bad} 项）` : '\n✔ 洞窟末步门通过（越界走退路 · 不再抛红框）');
process.exit(bad ? 1 : 0);
