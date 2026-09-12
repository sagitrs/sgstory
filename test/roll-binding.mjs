// 历史结果绑定门（#361）：历史正文里的骰面必须绑定**产生它的那次行动**。
//
// 实锤：`森林边缘` 的「听雾」结果块用 `<<lastcheck>>`（读最新骰面）渲染 —— 玩家听雾成功、
// 再去洞穴动武，回森林时听雾正文上方会挂着**战斗骰**（「运动检定／洞穴·战斗」）并重复显示。
// 修法：历史块用 `<<lastcheckFor "森林·察觉">>`（只在最新骰面确实属于该位点时复显）。
//
// 判据（本门）：走「听雾 → 洞穴动武 → 回森林边缘」，断言森林侧的听雾块**不含**战斗位点名。
// 用法：node test/roll-binding.mjs
import { newGame } from './harness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const s = await newGame({ random: 0.99, session: { wait: 140 } });   // d20 恒 20：听雾/战斗都必成
const w = s.w;
const text = () => (w.document.querySelector('#passages')?.textContent ?? '').replace(/\s+/g, ' ');
try {
	await s.clickByLabel('推门出发，走进暮色');
	await s.clickByLabel('在雾里站住，听一听');
	if (!text().includes('雾里浮起一点灯火')) throw new Error('听雾结果没出现（前置失败）');
	// 听雾当场：听雾块应带上**自己那次**骰面（森林·察觉）
	if (!text().includes('森林·察觉')) { bad++; console.error('  ✗ #361：听雾当场没有复显自己的骰面（修复过度）'); }
	else console.log('  ✓ 听雾当场复显自己的骰面（森林·察觉）');
	await s.clickByLabel('走进山脚的洞穴');
	await s.clickByLabel('拔家伙');
	await sleep(250);
	w.SugarCube.Engine.play('森林边缘'); await sleep(220);
	const t = text();
	if (t.includes('洞穴·战斗')) { bad++; console.error('  ✗ #361：森林侧的听雾正文串入了洞穴战斗的位点名（历史结果没绑定到自己的行动）'); }
	else console.log('  ✓ 历史听雾块不再串入战斗骰');
	// 洞穴战斗之后回森林：听雾正文还在，但**不该挂任何骰面**（既不串战斗的，也不伪造自己的）
	if (!t.includes('雾里浮起一点灯火')) { bad++; console.error('  ✗ #361：听雾正文丢了（历史结果不应被清掉）'); }
	else if (t.includes('森林·察觉')) { bad++; console.error('  ✗ #361：森林侧仍挂着过期骰面（应只在当场复显）'); }
	else console.log('  ✓ 跨段后听雾正文保留、骰面不串台（不留过期骰面）');
} catch (e) { bad++; console.error(`  ✗ 用例异常：${e.message.slice(0, 140)}`); } finally { w.close?.(); }
// ── #364：结局未消费的临时结果不得串到设定集 ──
{
	const s2 = await newGame({ random: 0.99, session: { wait: 140 } });
	const w2 = s2.w;
	try {
		// 造一个「有未消费结果」的状态：掷一次并把结果留在槽里，然后进结局页
		w2.eval(`(function(){const pc=SugarCube.State.variables.pc;pc.ev=pc.ev||{};pc.ev.last_result={p:'森林边缘',era:SugarCube.State.variables.era,text:'（测试用临时结果）',hasCheck:false};})()`);
		w2.SugarCube.Engine.play('结局 平凡之路'); await sleep(200);
		const keep = w2.SugarCube.State.variables.pc.ev.last_result;
		if (keep) { bad++; console.error('  ✗ #364：结局页没有把 last_result 消费掉（会挂到别的页面）'); }
		else console.log('  ✓ 结局页消费掉未显示的临时结果');
		// 再开设定集：不得出现那条陈旧结果
		w2.SugarCube.Engine.play('设定集'); await sleep(200);
		const txt = (w2.document.querySelector('#passages')?.textContent ?? '');
		if (txt.includes('（测试用临时结果）')) { bad++; console.error('  ✗ #364：陈旧结果串到了设定集'); }
		else console.log('  ✓ 设定集不再串入陈旧结果');
	} catch (e) { bad++; console.error(`  ✗ #364 用例异常：${e.message.slice(0, 120)}`); } finally { w2.close?.(); }
}

if (bad) { console.error(`\n✗ 历史结果绑定门：${bad} 项`); process.exit(1); }
console.log('✔ 历史结果绑定到产生它的行动（跨段不串台）');
