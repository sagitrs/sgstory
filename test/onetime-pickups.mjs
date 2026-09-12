// 一次性拾取门（#358）：**场地状态**与**背包持有**必须分开。
//
// 为什么：#358 实锤——花田/门厅的可采性原本只看 `inv["月光花"]` / `inv["坏哨"]`，
// 于是把花赠给女巫（或喂给龙）、把哨换掉之后，**同一块地/同一根钉子又能再取一次**，
// 绕过了「献龙／涂毒／赠礼」三选一与「换哨」的取舍。现在改成看 `world.flower_taken`
// / `world.whistle_taken`（场地是否已被取走），与背包无关。
//
// 用法：node test/onetime-pickups.mjs
import { newGame } from './harness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (cond, msg) => { if (!cond) { bad++; console.error(`  ✗ ${msg}`); } else console.log(`  ✓ ${msg}`); };

// ── ① 塔外花田：摘过之后（哪怕花已不在背包）不能再摘 ──
{
	const s = await newGame({ random: 0.99, session: { wait: 140 } });   // d20 恒 20 → 检定必成
	const w = s.w;
	try {
		await s.clickByLabel('问一句女巫小屋怎么走，然后过去');
		await s.clickByLabel('往林子深处走');
		await s.clickByLabel('继续往塔那边走');
		await s.clickByLabel('塔基墙根那片花');
		await s.clickByLabel('伸手去摘最靠里的那一朵');
		const pc = w.SugarCube.State.variables.pc;
		check(pc.inv['月光花'] === true, '花田：摘到月光花');
		check(pc.world.flower_taken === true, '花田：场地状态 world.flower_taken 已置位');
		// 模拟「赠给女巫 / 喂给龙」：花离手
		w.eval("(function(){delete SugarCube.State.variables.pc.inv['月光花'];})()");
		w.SugarCube.Engine.play('塔外花田'); await sleep(200);
		const links = [...w.document.querySelectorAll('#passages a.link-internal')].map((a) => a.textContent.trim());
		const text = (w.document.querySelector('#passages')?.textContent ?? '').replace(/\s+/g, '');
		check(!links.some((x) => x.includes('伸手去摘') || x.includes('退到上风头')), '#358：花已离手后，花田不得再给采摘选项');
		check(text.includes('已经摘过一朵'), '#358：花田应显示「已经摘过一朵了」');
	} catch (e) { bad++; console.error(`  ✗ 花田用例异常：${e.message.slice(0, 120)}`); } finally { w.close?.(); }
}

// ── ② 门厅：摘过哨子之后（哪怕哨已换掉）不能再摘 ──
{
	const s = await newGame({ random: 0.99, session: { wait: 140 } });
	const w = s.w;
	try {
		w.eval(`(function(){const pc=SugarCube.State.variables.pc;pc.inv={};pc.ev=pc.ev||{};pc.world=pc.world||{};pc.keeper=pc.keeper||{};})()`);
		w.SugarCube.Engine.play('门厅'); await sleep(200);
		await s.clickByLabel('把墙上那支哨子摘下来');
		const pc = w.SugarCube.State.variables.pc;
		check(pc.inv['坏哨'] === true, '门厅：摘到坏哨');
		check(pc.world.whistle_taken === true, '门厅：场地状态 world.whistle_taken 已置位');
		// 模拟「换哨」：坏哨离手（换成好哨）
		w.eval("(function(){const pc=SugarCube.State.variables.pc;delete pc.inv['坏哨'];pc.inv['好哨']=true;})()");
		w.SugarCube.Engine.play('门厅'); await sleep(200);
		const links = [...w.document.querySelectorAll('#passages a.link-internal')].map((a) => a.textContent.trim());
		check(!links.some((x) => x.includes('摘下来') || x.includes('摘哨子')), '#358：哨子已离手后，门厅不得再给摘取选项');
	} catch (e) { bad++; console.error(`  ✗ 门厅用例异常：${e.message.slice(0, 120)}`); } finally { w.close?.(); }
}

if (bad) {
	console.error(`\n✗ 一次性拾取门：${bad} 项（场地状态与背包持有没分开）`);
	process.exit(1);
}
console.log('✔ 一次性拾取：场地状态与背包分离（赠出/换走之后不得重取）');
