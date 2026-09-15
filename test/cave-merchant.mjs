// 洞窟「商人」（`#696` 金币出口，操作者 2026-09-15 裁定：旅人里随机出现商人）——真机门。
//
// 判据（每条对应一处坏法）：
//   ① **出现了**：强制 `cave_trade = "merchant"` ⇒ 屏上能买到货，且**报价来自声明面的价格表**；
//   ② **买得动**：点一次 ⇒ 金币按价扣、物品进包；
//   ③ **买不起就不显示**（钱不够时不许出现"点了才知道买不起"的行）；
//   ④ **火把油**：把耐久补回 2（火把是本故事的核心资源 ⇒ 它需要一个出口）；
//   ⑤ **不误伤原路**：`plain` 分支仍是"一口价干粮 ＋ 开口求他"；
//   ⑥ **价格唯一源**：改 `Game.Economy.prices` ⇒ 标签上的数字**跟着变**（内容里不写死）。
import { boot } from './boot.mjs';

let bad = 0;
const ok = (c, msg) => { console.log(`      ${c ? '✓' : '✗'} ${msg}`); if (!c) bad++; };
const links = (w) => [...w.document.querySelectorAll('#passages a.link-internal')].map((a) => a.textContent.trim());
const enter = async (state, gold) => {
  const { w, sleep } = await boot({ story: 'hollow-cave', random: 0.5 });
  w.SugarCube.Engine.play('醒来'); await sleep(200);
  w.eval(`(function(){const pc=SugarCube.State.variables.pc; pc.gold=${gold}; pc.ev.cave_att='neutral'; ${state}})()`);
  w.SugarCube.Engine.play('机制·traveller'); await sleep(300);
  return { w, sleep };
};
const clickLink = async (w, sleep, re) => {
  const a = [...w.document.querySelectorAll('#passages a.link-internal')].find((x) => re.test(x.textContent));
  if (!a) return false;
  a.click(); await sleep(340); return true;
};

// ① + ② + ④
{
  const { w, sleep } = await enter("pc.ev.cave_trade='merchant'; pc.gearHp={火把:1};", 20);
  const buy = links(w).filter((t) => /^买/.test(t));
  ok(buy.length === 4, `① 商人摆出 4 件货（撬棍/手套/铁撬/干粮）⇒ 实际 ${JSON.stringify(buy)}`);
  ok(links(w).some((t) => /添油/.test(t)), '④ 火把掉耐久时出现「给火把添油」');
  await clickLink(w, sleep, /买撬棍/);
  const st = w.eval('(function(){const pc=SugarCube.State.variables.pc;return {gold:pc.gold,inv:Object.keys(pc.inv)};})()');
  ok(st.gold === 14 && st.inv.includes('撬棍'), `② 买撬棍 ⇒ 金币 20→14、行囊含撬棍（实际 ${JSON.stringify(st)}）`);
  await clickLink(w, sleep, /添油/);
  ok(w.eval('SugarCube.State.variables.pc.gearHp["火把"]') === 2 && w.eval('SugarCube.State.variables.pc.gold') === 10, '④ 添油 ⇒ 耐久回 2、金币再扣 4');
  ok(links(w).some((t) => /继续走/.test(t)), '② 买完可以继续买、也能自己决定走（「谢过他，继续走」在）');
}

// ③ 钱不够 ⇒ 一件也不显示（含 3 金的干粮）
{
  const { w } = await enter("pc.ev.cave_trade='merchant';", 2);
  ok(links(w).filter((t) => /^买/.test(t)).length === 0, '③ 只有 2 金 ⇒ 买不起的行**一个都不显示**');
}

// ⑤ plain 分支未受影响
{
  const { w } = await enter("pc.ev.cave_trade='plain';", 10);
  const t = links(w).join('｜');
  ok(/掏出 3 枚金币/.test(t) && /开口求他/.test(t), `⑤ plain 分支仍是原样（一口价 ＋ 开口求他）：${t.slice(0, 60)}`);
  ok(!/^买/.test(t) && !/添油/.test(t), '⑤ plain 分支**不出现**商人的货（两个分支互斥，不是叠加）');
}

// ⑥ 价格唯一源：改声明面的价 ⇒ 标签跟着变
{
  const { w, sleep } = await enter("pc.ev.cave_trade='merchant';", 20);
  w.eval('Game.Economy.prices["撬棍"] = 9');
  w.eval('SugarCube.Engine.play("机制·traveller")'); await sleep(300);
  ok(links(w).some((t) => /买撬棍（9 金币）/.test(t)), `⑥ 改声明面价格 ⇒ 标签变（实际 ${JSON.stringify(links(w).filter((x) => /撬棍/.test(x)))}）`);
}

console.log(bad ? `\n✗ 洞窟商人门未通过（${bad} 项）` : '\n✔ 洞窟商人门通过（随机出现 · 报价读声明面 · 买不起不显示 · 火把油 · plain 不受影响）');
process.exit(bad ? 1 : 0);
