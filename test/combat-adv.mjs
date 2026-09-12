// 战斗跨回合优势门（#352）：动作宣告「下一击有优势」→ **下一回合的那一手必须真的取高**。
//
// 为什么需要它：`Game.Combat.applyEffect` 把 `eff.adv` 记进 `fight.adv`，但旧实现的**回合推进块**
// 紧接着 `<<set _f.adv to 0>>` —— 刚记上就被清零，于是 UI 显示「下一击有优势」而下一手仍单骰（#352）。
// 此前的门只测「同轮内」的战斗效果，**跨回合状态**没有覆盖。
//
// ⚠️ 这道门的第一版**测错了字段**（记在这里，因为它比「不会变红」更危险）：
//   它读 `pc.ev.last_roll.rolls`——那是**交涉路径**的字段，靠 `<<snapshot>>` 写入，而战斗段落不调
//   `<<snapshot>>` → 读到的是陈旧值，恒为 `0` → 那道门**永远不可能变绿**：修复合入后照样报「单骰」，
//   差一点就把「已修好」误判成「没修好」。现在改用 #352 修复**引入的语义字段** `_f.log.you.rolledWithAdv`
//   （＝「这一手是在结转优势下掷的」），并用真产物探针证明它会红会绿。
//
// 自证：`node test/combat-adv.mjs --selftest`（正例 1 + 反例 3）
// 真产物探针（已实测）：把 `src/10-core.twee` 回合推进块里重新加回 `<<set _f.adv to 0>>` → 本门红。

import { boot, CLICKABLE_SEL } from './boot.mjs';

// 判定（纯函数，便于自证）：obs = [{ label, advBefore, rolledWithAdv }]
export const judge = (obs) => {
	const carried = obs.filter((o) => o.advBefore > 0);
	if (!carried.length) return { verdict: 'uncalibrated', msg: `未能在 ${obs.length} 手里触发「下一击有优势」——本用例需校准（不计为通过）` };
	const used = carried.filter((o) => o.rolledWithAdv === true);
	if (used.length) return { verdict: 'pass', msg: `跨回合优势生效：${used.length} 手在结转优势下掷骰（例：上一手准备 →「${used[0].label}」rolledWithAdv=true）` };
	return {
		verdict: 'fail',
		msg: `跨回合优势未生效：${carried.length} 手结转了优势，但没有一手在优势下掷骰（例：「${carried[0].label}」rolledWithAdv=${carried[0].rolledWithAdv}）`,
	};
};

const selftest = () => {
	let bad = 0;
	const t = (msg, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${msg}`); };
	t('正例：结转优势且下一手 rolledWithAdv=true → 通过', judge([{ label: 'a', advBefore: 1, rolledWithAdv: true }]).verdict === 'pass');
	t('反例①：结转了优势但下一手没取高 → 判失败', judge([{ label: 'a', advBefore: 1, rolledWithAdv: false }]).verdict === 'fail');
	t('反例②：整段没有出现过结转优势 → 判「需校准」', judge([{ label: 'a', advBefore: 0, rolledWithAdv: false }]).verdict === 'uncalibrated');
	t('反例③：一手都没观测到 → 判「需校准」', judge([]).verdict === 'uncalibrated');
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过：正例通过 / 结转未用红 / 场景没跑到红（不会空判）');
};

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

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
const obs = [];
for (let round = 1; round <= 6; round++) {
	const f = pc().ev.fight;
	if (!f || f.done) break;
	const off = f.offer ?? [];
	const els = actsOnScreen();
	if (!off.length || !els.length) break;
	const advIdx = off.findIndex((key) => A[key]?.ok?.adv || A[key]?.crit?.adv);
	const pick = advIdx >= 0 ? advIdx : 0;
	const label = (els[pick]?.textContent ?? '?').replace(/\s+/g, '').slice(0, 20);
	const advBefore = f.adv ?? 0;
	await click(els[pick]);
	const g = pc().ev.fight;
	obs.push({ round, label, advBefore, rolledWithAdv: g?.log?.you?.rolledWithAdv === true });
}

const v = judge(obs);
if (v.verdict === 'pass') console.log(`✓ ${v.msg}`);
else { console.log(`${v.verdict === 'fail' ? '✗' : '○'} ${v.msg}`); }
console.log(`\n  观测 ${obs.length} 手：${obs.map((o) => `#${o.round}${o.advBefore > 0 ? `[结转${o.advBefore}]` : ''}${o.rolledWithAdv ? '→取高' : ''}`).join(' ')}`);
if (v.verdict !== 'pass') { console.error('\n✗ 战斗跨回合优势门未通过'); process.exit(1); }
console.log('✔ 战斗跨回合优势门通过');
