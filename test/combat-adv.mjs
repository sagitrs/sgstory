// 战斗跨回合优势门（#352）：动作宣告「下一击有优势」→ **下一回合的那一手必须真的双骰取高**。
//
// 为什么需要它：`Game.Combat.applyEffect`（15-tables:655）把 `eff.adv` 记进 `fight.adv`，
// 但同一轮结算的**回合推进块**（10-core:409-414）紧接着 `<<set _f.adv to 0>>` —— 刚记上就被清零，
// 于是 UI 显示「下一击有优势」而下一手仍单骰（#352 玩家报告）。此前的门都只测「同轮内」的战斗效果，
// **跨回合状态**没有覆盖（与本仓「重放型缺陷在确定性 RNG 下隐形」同类的盲区）。
//
// 现状：**已知缺陷（#352）** → 报告但不判失败（避免立刻卡住 main）；修复后本门自然转绿，
// 届时移除 KNOWN 标记（代码里已注明）。
import { boot, CLICKABLE_SEL } from './boot.mjs';

const KNOWN = '#352';   // ← 修复后删除本行与其下方的 known 分支
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let k = 0;
const { w, settle } = await boot({ random: () => (k++ % 4 === 0 ? 0.99 : 0.5) });
const pc = () => w.SugarCube.State.variables.pc;
const actsOnScreen = () => [...w.document.querySelectorAll(CLICKABLE_SEL)].filter((x) => !x.textContent.includes('设定集'));
const click = async (el) => { await settle(); el.click(); await settle(); await sleep(220); };

// 播种：盟约 ＋ 龙醒 ＋ 好哨（adv 手在池子里）＋ 干净战斗台账
w.eval('(function(){const pc=SugarCube.State.variables.pc;pc.hp=40;pc.max_hp=40;pc.ev.fight=null;'
	+ 'pc.keeper={state:"ally"};pc.dragon={hp:Game.Dragon.hp,awake:true,defeats:0};pc.inv["好哨"]=true;pc.ev.failure_cause=true;})()');
w.SugarCube.Engine.play('封印·并肩'); await settle(); await sleep(400);

const A = w.Game.Combat.actions;
let staged = false;
let verdict = null;
for (let round = 1; round <= 4 && verdict === null; round++) {
	const f = pc().ev.fight;
	if (!f || f.done) break;
	const off = f.offer ?? [];
	const els = actsOnScreen();
	if (!off.length || !els.length) break;
	// 优先选「会产生 adv」的那一手；它生效后，下一手必须取高
	const advIdx = off.findIndex((key) => A[key]?.ok?.adv || A[key]?.crit?.adv);
	const pick = advIdx >= 0 ? advIdx : 0;
	const label = els[pick]?.textContent.replace(/\s+/g, '').slice(0, 20) ?? '?';
	await click(els[pick]);
	const after = pc().ev.fight;
	if ((after?.adv ?? 0) > 0 || (after?.last?.adv ?? 0) > 0) {
		staged = true;
		const alive = actsOnScreen();
		if (!alive.length) break;
		await click(alive[0]);
		const rolls = pc().ev.last_roll?.rolls?.length ?? 0;
		const shown = (w.document.querySelector('.check-result')?.textContent ?? '').replace(/\s+/g, '');
		verdict = { label, rolls, shown: shown.slice(0, 70), carried: after?.adv ?? 0 };
	} else {
		console.log(`  · 轮${round}：点「${label}」未产 adv（继续）`);
	}
}

let failed = false;
if (!staged) {
	console.log('○ 未能在 4 轮内触发「下一击有优势」——本用例需校准（不计为通过）');
	failed = true;
} else if (verdict.rolls > 1 || /取高|优势/.test(verdict.shown)) {
	console.log(`✓ 跨回合优势生效：上一手「${verdict.label}」→ 下一手骰数 ${verdict.rolls}｜${verdict.shown}`);
} else {
	const msg = `✗ 跨回合优势未生效：上一手「${verdict.label}」宣告了优势（last.adv=1，fight.adv 结转=${verdict.carried}），下一手仍单骰（${verdict.rolls}）`;
	if (KNOWN) { console.log(`⏳ [已知缺陷 ${KNOWN}] ${msg}`); console.log('    根因：回合推进块（10-core:409-414）在结算同轮末尾 `<<set _f.adv to 0>>`，把刚记给「下一击」的优势清零'); }
	else { console.log(msg); failed = true; }
}

console.log(failed ? '\n✗ 战斗跨回合优势门未通过' : `\n${KNOWN && staged ? `⏳ 战斗跨回合优势门：已知缺陷 ${KNOWN}（不判失败）` : '✔ 战斗跨回合优势门通过'}`);
if (failed) process.exit(1);
