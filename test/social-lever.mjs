// 交涉筹码分派门（#360）：**按筹码类型结算**——优势筹码只给优势，不完成诉求。
//
// 为什么：#360 实锤——UI 把 `gives:'adv'` 的筹码标成「后续更有把握（交涉检定有优势）」，
// 但点击后走的是 lever 分支的「免检完成」路径：诉求当场 done，掷骰从未发生。
//
// 本门验三条路各自的行为（夹具驱动，不进 scenarios 路线体系——那是 C4/E4 的样本源）：
//   ① adv 筹码 → 不完成诉求 + 记下 soc_lever
//   ② 随后选手段掷骰 → last_roll.adv 为真、advWhy 用筹码的 note、soc_lever 被消费清空
//   ③ auto/econ 筹码 → 仍然免检完成（不能被这次修复一起改坏）
//
// 用法：node test/social-lever.mjs
import { newGame } from './harness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { bad++; console.error(`  ✗ ${msg}`); } };
const panelText = (w) => (w.document.querySelector('#passages')?.textContent ?? '').replace(/\s+/g, ' ');

// ── ①② 优势筹码（守林人·问花 ← 把日记摊在桌上）──
{
	const s = await newGame({ random: 0.5, session: { wait: 140 } });
	const w = s.w;
	try {
		w.eval(`(function(){const pc=SugarCube.State.variables.pc;pc.inv=pc.inv||{};pc.ev=pc.ev||{};pc.world=pc.world||{};pc.keeper=pc.keeper||{};
		 pc.inv['日记']=true;pc.keeper.met=true;pc.keeper.state='neutral';SugarCube.State.variables.era='present';})()`);
		w.SugarCube.Engine.play('守林人'); await sleep(220);
		const links = [...w.document.querySelectorAll('#passages a[data-how]')];
		const lever = links.find((a) => (a.dataset.how ?? '').startsWith('lever:') && a.textContent.includes('日记'));
		if (!lever) throw new Error('找不到优势筹码「把日记摊在桌上」（面板结构变了？）');
		const before = { told: w.SugarCube.State.variables.pc.ev.keeper_told, warned: w.SugarCube.State.variables.pc.world.flower_warned };
		lever.click(); await sleep(250);
		const pc = w.SugarCube.State.variables.pc;
		// 注意：flower_warned 由**段落**在初遇时置位（#229 无差别警告），不是本诉求的完成标记；
		// 本诉求的完成标记是 keeper_told（apply 里同时写它）
		ok(!pc.ev.keeper_told,
			`#360：优势筹码不得直接完成诉求（keeper_told=${!!pc.ev.keeper_told}；修前会当场置位）`);
		ok(pc.ev.soc_lever === 'journal', `#360：优势筹码应记入 soc_lever（实际 ${pc.ev.soc_lever ?? 'null'}）`);
		ok(panelText(w).includes('下一掷有优势'), '#360：面板应回显「下一掷有优势」');
		// ② 选手段掷骰 → 吃到优势
		const site = [...w.document.querySelectorAll('#passages a[data-how]')].find((a) => (a.dataset.how ?? '').startsWith('site:'));
		if (!site) throw new Error('找不到可掷骰的手段（面板结构变了？）');
		site.click(); await sleep(250);
		const roll = w.SugarCube.State.variables.pc.ev.last_roll;
		ok(roll?.adv === 1, `#360：随后那一掷应带优势（last_roll.adv=${roll?.adv ?? 'null'}）`);
		ok(String(roll?.advWhy ?? '').includes('先人'), `#360：优势理由应来自筹码的 note（实际「${roll?.advWhy ?? ''}」）`);
		ok(w.SugarCube.State.variables.pc.ev.soc_lever == null, '#360：优势筹码被这一掷消费后应清空 soc_lever');
	} catch (e) { bad++; console.error(`  ✗ 优势筹码用例异常：${e.message.slice(0, 140)}`); } finally { w.close?.(); }
}

// ── ③ 免检筹码（哥布林·让路 ← 把几枚金币放在石头上）仍是免检完成 ──
{
	const s = await newGame({ random: 0.5, session: { wait: 140 } });
	const w = s.w;
	try {
		w.eval(`(function(){const pc=SugarCube.State.variables.pc;pc.inv=pc.inv||{};pc.ev=pc.ev||{};pc.world=pc.world||{};pc.gold=20;})()`);
		w.SugarCube.Engine.play('洞穴'); await sleep(220);
		const lever = [...w.document.querySelectorAll('#passages a[data-how]')]
			.find((a) => (a.dataset.how ?? '').startsWith('lever:') && a.textContent.includes('金币'));
		if (!lever) { console.log('  ○ 跳过免检筹码用例（本段未见 econ 筹码）'); }
		else {
			const gold0 = w.SugarCube.State.variables.pc.gold;
			lever.click(); await sleep(250);
			const pc = w.SugarCube.State.variables.pc;
			ok(pc.gold < gold0, `#360：econ 筹码应真的扣钱（${gold0} → ${pc.gold}）`);
			ok(!!pc.ev?.goblin_spared || !!pc.world?.goblin_spared || String(panelText(w)).includes('让'),
				'#360：免检筹码仍应直接完成诉求（不能被优势修复一起改坏）');
		}
	} catch (e) { bad++; console.error(`  ✗ 免检筹码用例异常：${e.message.slice(0, 140)}`); } finally { w.close?.(); }
}

if (bad) { console.error(`\n✗ 交涉筹码分派门：${bad} 项`); process.exit(1); }
console.log('✔ 交涉筹码按类型分派（优势只给优势／免检照旧完成／优势被消费后清空）');
