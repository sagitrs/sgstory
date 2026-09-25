// 复现：启用车卡的新格式故事 ⇒ `Game.Chargen` **未定义**（引擎段序缺陷）
// 跑法：SG_STORIES_DIR=test/fixtures/m3-chargen-fixture/stories node test/fixtures/m3-chargen-fixture/repro-chargen-undefined.mjs
import { boot } from '../../../test/boot.mjs';

const { w } = await boot({ random: 0.5 });
console.log('1 Sg.story.chargen 类型 = ' + typeof w.Sg?.story?.chargen + '（故事面 **在** ✓）');
console.log('2 Game.Chargen 类型     = ' + typeof w.Game?.Chargen + '（应为 object；实得 undefined ⇒ 本缺陷）');
const r = (() => { try { return w.Game.Chargen.rounds.length; } catch (e) { return 'ERR ' + e.message.slice(0, 60); } })();
console.log('3 Game.Chargen.rounds   = ' + String(r) + '（消费者 `properties.mjs:115` 就在这行崩）');
w.eval('if (typeof window.Sg?.story?.chargen === "function") { window.Game.Chargen = { get rounds(){ return window.Sg.story.chargen?.()?.rounds; } }; }');
console.log('4 手动重建那段逻辑后   = ' + typeof w.Game?.Chargen + '，rounds=' + String(w.Game?.Chargen?.rounds?.length)
	+ ' ⇒ **逻辑本身对，只是执行时机不对** ✓');
try { w.close(); } catch { /* ignore */ }
