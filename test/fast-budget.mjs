// ★★ `#1655`：**PR 档（`fast`）Σcost 预算/棘轮**的**行为化自证** —— 判据是纯函数
//   （`scripts/test-plan.mjs` 的 `fastBudgetProblems`），本件把它的**每一格**钉住（含成对的反例／边界）。
//
// ## 为什么单独一件（与 `test/plan-needs.mjs`／`test/untracked-guard.mjs` 同形）
// **判据在纯函数里 ⇒ 能被单测**；而"**跑器/门有没有真的调它**"单测看不出来（那由段登记 ＋ 真树格守）。
// → 本件管"**判据本身对**"＋"**主干当下必须过**"。
//
// ## 四格（★"能假"是硬要求）
// ① **正例·真树**：★主干当下 ⇒ **0 问题**（★它一入库，★任何**把它推高**的笔都会被挡 ✓）；
// ② **反例·涨**：★把任一段 cost 调大（＋50）⇒ **必红**（★这是棘轮的**方向** ✓）；
// ③ **边界·降**：★删段／降 cost（Σcost 降）⇒ **不报**（★棘轮只挡"涨"，✗ 不挡"降" ✓）；
// ④ **反假绿**：★预算**极小**（如 1s）⇒ **必红** ⇒ ★证明②的红来自**判据**、✗ 来自"恒红" ✓。
//
// note：**`cost` 是估算值**（✗ 实测秒）⇒ ★把某段 cost 改小**也能"过格"** ✗ ——
//   本判据**只读** `testPlan()`（✗ 不引入第二份 cost 表 ⇒ 单一权威 ✓）；
//   ★**改 `cost` ＝ 改判据输入** ⇒ 它在 `test-plan.mjs` 里，与判据**同处一处评审** ✓。
import { testPlan, tierOf, FAST_COST_BUDGET, fastBudgetProblems } from '../scripts/test-plan.mjs';

let bad = 0;
const t = (label, ok, extra = '') => {
	if (ok) console.log(`      ✓ 自证·${label}`);
	else { bad++; console.error(`      ✗ 自证·${label}${extra ? '：' + extra : ''}`); }
};

const plan = testPlan();
const fast = plan.filter((s) => tierOf(s) === 'fast');
const sum = fast.reduce((a, s) => a + (Number(s.cost) || 0), 0);

// ── ① 正例·**真树**：主干当下必须在预算内 ────────────────────────────────
{
	const probs = fastBudgetProblems(plan);
	t(`★真树：主干当下 **fast Σcost ＝ ${sum.toFixed(1)}s ≤ 预算 ${FAST_COST_BUDGET}s**（${fast.length} 段）⇒ 0 问题`,
		probs.length === 0, probs[0]?.why?.slice(0, 200) ?? `Σcost=${sum.toFixed(1)}`);
}

// ── ② 反例·**涨** ⇒ 必红（棘轮的方向）────────────────────────────────────
{
	// ★挑一个真实存在的 fast 段，把它的 cost **虚拟**调大 50（✗ 不动仓内件 —— 传合成计划 ✓）
	const victim = fast.find((s) => (Number(s.cost) || 0) > 0) ?? fast[0];
	const bumped = plan.map((s) => (s.id === victim.id ? { ...s, cost: (Number(s.cost) || 0) + 50 } : s));
	const probs = fastBudgetProblems(bumped);
	t(`🔴 反例·涨：把 「${victim.id}」 的 cost ＋50 ⇒ **必红**（★棘轮的方向 ✓）`,
		probs.length === 1 && /超预算/.test(probs[0].why), JSON.stringify(probs).slice(0, 200));
	t('🔴 且报文里**点名超出的量**（✗ 只说"超了" ✓）', probs.length === 1 && /超出 [0-9.]+s/.test(probs[0].why));
	t('🔴 且报文里给出**二择一**的处置（说明 ∨ 移 full ✓）', probs.length === 1 && /移到/.test(probs[0].why) && /说明/.test(probs[0].why));
}

// ── ③ 边界·**降** ⇒ 不报（棘轮只挡涨）────────────────────────────────────
{
	// (a) 删掉 cost 最高的一段；(b) 把所有 cost 归零 —— 两种"降"都不该报 ✓
	const maxSeg = fast.slice().sort((a, b) => (Number(b.cost) || 0) - (Number(a.cost) || 0))[0];
	const dropped = plan.filter((s) => s.id !== maxSeg.id);
	const zeroed = plan.map((s) => (tierOf(s) === 'fast' ? { ...s, cost: 0 } : s));
	t(`边界·降：删掉 cost 最高的 fast 段（「${maxSeg.id}」 ${maxSeg.cost}s）⇒ **不报**（✗ 不挡"降" ✓）`,
		fastBudgetProblems(dropped).length === 0);
	t('边界·降：fast 各段 cost 全归零 ⇒ **不报**', fastBudgetProblems(zeroed).length === 0);
}

// ── ④ 反假绿：预算极小 ⇒ 必红（★证明②的红来自判据、✗ "恒红"）────────────
{
	t('🔴 反假绿：预算给 **1s** ⇒ **必红**（★若这一格也不红 ⇒ ② 的"红"没有意义 ✓）',
		fastBudgetProblems(plan, 1).length === 1);
	t('🔴 反假绿·对侧：预算给**极大**（99999s）⇒ 不报（★证明判据不是恒红 ✓）',
		fastBudgetProblems(plan, 99999).length === 0);
}

// ── ⑤ 口径同源：`fast` 的选择面 ＝ `tierOf`（✗ 本件另写一份"哪些算 fast"）────
{
	// ★用**只含 fast 段**与**只含 full 段**的合成计划各试一次：前者按 Σcost 判、后者恒 0 ✓
	const onlyFull = plan.filter((s) => tierOf(s) === 'full');
	t('口径同源：**全是 full 段**的计划 ⇒ Σcost 不计入（★缺省 `fast` 口径 ⧗ 与选择器**同一处** ✓）',
		fastBudgetProblems(onlyFull, 1).length === 0);
	t('口径同源：**缺 `tier` 的段**（＝缺省 fast）⇒ **计入**（★与 `tierOf` 同口径 ✓）',
		fastBudgetProblems([{ id: 'zz-x', cost: 10 }], 5).length === 1);
}

console.log(bad === 0
	? `\n✔ PR 档预算棘轮通过（fast Σcost ${sum.toFixed(1)}s ≤ 预算 ${FAST_COST_BUDGET}s · ${fast.length} 段 · 能假四格 ✓）`
	: `\n✗ PR 档预算棘轮：${bad} 格未过`);
process.exit(bad === 0 ? 0 : 1);
