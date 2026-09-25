// `#1409` 最小复现（跑法见 README）
import { boot } from '../../../test/boot.mjs';

const { w, sleep } = await boot({ random: 0.5 });
const pc = () => w.SugarCube.State.variables.pc;

console.log('1 开局（pcDefaults 生效）: hp=' + String(pc().hp) + ' max_hp=' + String(pc().max_hp) + ' salves=' + String(pc().salves));
w.eval('(function(){const v=SugarCube.State.variables;v.pc.hp=7;v.pc.max_hp=14;})()');
console.log('2 显式设 hp=7 => 读回 ' + String(pc().hp) + ' (typeof ' + typeof pc().hp + ')');
w.SugarCube.Engine.play('结局 死亡');
await sleep(200);
console.log('3 直接跳结局段 => hp=' + String(pc().hp) + ' (typeof ' + typeof pc().hp + ') max_hp=' + String(pc().max_hp));

const p2 = w.SugarCube.State.variables.pc;
let cur = 7; const log = [];
Object.defineProperty(p2, 'hp', { configurable: true,
	get() { log.push('GET'); return cur; }, set(v) { log.push('SET ' + String(v)); cur = v; } });
w.eval('(function(){const v=SugarCube.State.variables;v.pc.max_hp=14;})()');
w.SugarCube.Engine.play('结局 死亡'); await sleep(200);
console.log('4 劫持 get/set 后再跳 => 终值=' + String(cur) + ' (typeof ' + typeof cur + ') 访问序列=' + JSON.stringify(log.slice(0, 8)));
try { w.close(); } catch { /* ignore */ }
