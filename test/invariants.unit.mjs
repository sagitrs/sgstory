// #189 规则属性三件套——单测（负例红 / 正例绿）；逻辑本体在 test/invariants.mjs
import { mkHist, checkStep } from './invariants.mjs';
const pc = (o = {}) => ({ abilities: {}, inv: {}, ev: {}, world: {}, keeper: {}, dragon: {}, ...o });
let fails = 0;
const expect = (cond, msg) => { if (!cond) { console.log(`  ✗ ${msg}`); fails++; } };
// ① 单调：defeats 回落 → 红；增/持平 → 绿
let h = mkHist(); checkStep(h, pc({ dragon: { defeats: 2 } }));
expect(checkStep(h, pc({ dragon: { defeats: 0 } })).some((x) => x.includes('defeats 回落')), '负例①：defeats 2→0 应回落报警');
h = mkHist(); checkStep(h, pc({ dragon: { defeats: 1 } }));
expect(checkStep(h, pc({ dragon: { defeats: 3 } })).length === 0, '正例①：defeats 1→3 不报');
// ② once-only：置位后回落 → 红；未置位 → 绿
h = mkHist(); checkStep(h, pc({ world: { goblin_gone: true } }));
expect(checkStep(h, pc({ world: { goblin_gone: false } })).some((x) => x.includes('goblin_gone')), '负例②：goblin_gone true→false 应报警');
h = mkHist(); expect(checkStep(h, pc({ world: {} })).length === 0, '正例②：未置位不报');
// ③ 前置蕴含：好哨在手却没还杖/没交坏哨 → 红；卷轴无日记 → 红；齐备态 → 绿
h = mkHist();
const r3 = checkStep(h, pc({ inv: { '好哨': true, '坏哨': true }, world: {} }));
expect(r3.some((x) => x.includes('还过杖')), '负例③a：好哨⇒还过杖应报警');
expect(r3.some((x) => x.includes('坏哨已交出')), '负例③b：好哨⇒坏哨已交出应报警');
h = mkHist();
expect(checkStep(h, pc({ inv: { '传送术卷轴': true } })).some((x) => x.includes('日记同源')), '负例④：卷轴⇒日记同源应报警');
h = mkHist();
expect(checkStep(h, pc({ inv: { '好哨': true, '完整星图': true, '传送术卷轴': true, '日记': true, '守林人的钥匙': true }, ev: { seer_gave: true }, world: { family_favor: true }, keeper: { met: true } })).length === 0, '正例③：齐备态不报');
console.log(fails === 0 ? '✔ #189 三件套单测通过（负例①②③a③b④ 红、正例①②③ 绿）' : `✗ ${fails} 项`);
process.exit(fails ? 1 : 0);
