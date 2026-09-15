// `#608`：短战斗**相位 → 分支**的真机门（S3 机制上移引擎后，把 `#598` 那一族的形状钉住）。
//
// 为什么需要它：`Game.Combat.waveRecord()` 返回**对象** `{ phase, wave, plan, advance }`，相位有**四种**
// （`continue`／`advance`／`cleared`／`failed`）——而短战斗 widget 原先用 `$last_check.success` 分支：
// `success` 只说"**这一击中了**"，不说"**打完了**"。短档声明（`hits=1`／`rounds=1`）下两者**恰好同构**，
// 所以历史上看不出错；一旦换了声明（增援／多击）就会把 `continue` 当成胜利 ⇒ 提前结算＋提前推进
// ——与 `#598`（长战斗死路：返回对象却与字符串比）**同一族**：相位算了但没人按它分支。
//
// 本门钉两件事（都对**行为**判，不看源码里写了什么）：
//   ① **相位 → 分支**：逐个相位喂进 `waveRecord`，断言
//      · `continue`／`advance` ⇒ **不结算、不推进**、重渲染本段（胜句照印）；
//      · `cleared` ⇒ 胜句 ＋ 结算 ＋ 尾段（故事侧步进）；`failed` ⇒ 败句 ＋ 伤 ＋ 声明面失败笔记 ＋ 尾段；
//   ② **奖励读声明面**：临场改声明（`encounters.short.reward.gold`）⇒ 落袋金币跟着变（不是常量）。
//
// **判别性用例（本门的自证核心）**：`成功` 与 `相位` 交叉——`success=true` 但相位是 `continue`。
// 用 `success` 分支的实现会**照发奖励并推进** ⇒ 当场红（实测：把 widget 改回 success 分支即红，见 PR）。
import { boot } from './boot.mjs';

let bad = 0;
const ok = (cond, msg, extra = '') => {
	if (cond) console.log(`      ✓ ${msg}`);
	else { bad++; console.error(`      ✗ ${msg}${extra ? '：' + extra : ''}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('══ 短战斗相位门（#608）══');

/** 纯函数：相位 → 期望的**结果分类**（`#598` 形状的判据面；自证用）。 */
export const phaseKind = (phase) => (phase === 'cleared' ? 'win' : phase === 'failed' ? 'lose' : phase === 'continue' || phase === 'advance' ? 'ongoing' : 'unknown');

// ── 自证（纯函数）：四相位分类，含"未知相位不许当成胜利"──
{
	ok(phaseKind('cleared') === 'win' && phaseKind('failed') === 'lose', '自证·正例：`cleared`⇒win · `failed`⇒lose');
	ok(phaseKind('continue') === 'ongoing' && phaseKind('advance') === 'ongoing', '自证·正例：`continue`／`advance`⇒**未结束**（不结算不推进）');
	ok(phaseKind('whatever') === 'unknown', '自证·反例：未知相位 ⇒ `unknown`（**绝不许**落进"胜利"那一支）');
	ok(phaseKind(undefined) === 'unknown', '自证·反例：相位缺失（undefined）⇒ `unknown`');
}

const PILOT = '机制·shortFight';
const TAIL_STEP = 1;   // 尾段＝`机制·shortFight·尾`（本故事的 `<<caveNext>>` ⇒ 步数 +1）
const WIN_SENTENCE = '刃压住了它';       // 第 ③ 实参（胜句）
const LOSE_SENTENCE = '它撞在你肋上';    // 第 ④ 实参（败句）

/** 跑一个相位：返回点击后的观测（落点／金币／hp／步数／失败笔记／屏文本）。 */
const runPhase = async ({ phase, dice = 0.99, rewardGold = null, label }) => {
	const { w, close } = await boot({ story: 'hollow-cave', random: () => dice });
	try {
		// 观测起点：清金币/步数/笔记，保证"变没变"可判
		w.eval('(function(){const v=SugarCube.State.variables;v.pc.gold=0;v.pc.ev.cave_step=0;v.pc.hp=v.pc.max_hp;if(v.pc.ev.notes)delete v.pc.ev.notes.n_cave_battered;if(v.pc.ev)delete v.pc.ev.cave_battered;return 1})()');
		if (rewardGold != null) {
			// **临场改声明**（不碰引擎）：包一层 `mechanics()`，把短档金币换成别值 ⇒ 落袋必须跟着变
			w.eval(`(function(){const S=SugarCube;const orig=Sg.story.mechanics;Sg.story.mechanics=()=>{const m=orig();return {...m,encounters:{...m.encounters,short:{...m.encounters.short,reward:{...m.encounters.short.reward,gold:${rewardGold}}}}};};return 1})()`);
		}
		// 注入相位（`waveRecord` 是唯一被替换的东西；`waveBegin` 仍是真的）
		w.eval(`(function(){Game.Combat.waveRecord=(pc,ok)=>({ phase: ${JSON.stringify(phase)}, wave: pc?.ev?.fight?.wave ?? null, plan: null, advance: ${JSON.stringify(phase === 'advance')} });return 1})()`);
		w.SugarCube.Engine.play(PILOT);
		await sleep(260);
		const hpBefore = w.eval('SugarCube.State.variables.pc.hp');
		const link = [...w.document.querySelectorAll('#passages a.link-internal, #passages .choice-card a')].find((a) => (a.textContent ?? '').includes('迎面劈过去'));
		if (!link) throw new Error(`找不到短战斗链接（相位 ${phase}）`);
		link.click();
		await sleep(300);
		const text = (w.document.querySelector('#passages')?.textContent ?? '').replace(/\s+/g, ' ').trim();
		return {
			label, phase,
			passage: String(w.SugarCube.State.passage ?? ''),
			gold: w.eval('SugarCube.State.variables.pc.gold'),
			hpBefore, hp: w.eval('SugarCube.State.variables.pc.hp'),
			step: w.eval('SugarCube.State.variables.pc.ev.cave_step'),
			note: !!w.eval("Sg.notes.has('n_cave_battered')"),
			text,
		};
	} finally { try { close?.(); } catch { /* 关窗失败不影响结论 */ } }
};

// ③ **可见性**（`#661` 修复后补上；`#608` 的门当初**刻意不判**它——那时两句根本没到玩家眼前，钉住＝把 bug 当期望）：
//   胜句／败句必须**出现在屏上**（跨段导航后仍可见）。根因是"文本打在 link 动作缓冲里、而 `<<goto>>` 在**尾段/widget** 里跑"
//   ⇒ 留屏包装器读不到它；修法＝分支句改走 `<<actOut>>`（`#262` 的**既定协议**：就地显示 ＋ 存 `$pc.ev.last_result`）。
//   **探针**：把任一分支句改回裸 `<<print>>`／裸文本 ⇒ 本门当场红（实测）。

// ── ① 四相位 → 分支 ──
for (const [phase, dice] of [['cleared', 0.99], ['failed', 0.01], ['continue', 0.99], ['advance', 0.99]]) {
	const r = await runPhase({ phase, dice, label: `相位 ${phase}` });
	const kind = phaseKind(phase);
	if (kind === 'win') {
		ok(r.gold > 0, `${phase}：**结算**（金币 ${r.gold} > 0）`, `gold=${r.gold}`);
		ok(r.step === TAIL_STEP, `${phase}：**推进**（步数 = ${TAIL_STEP}，尾段跑过）`, `step=${r.step}`);
		ok(r.text.includes(WIN_SENTENCE), `${phase}：**胜句出现在屏上**（\`#661\`）`, r.text.slice(0, 80));
	} else if (kind === 'lose') {
		ok(r.gold === 0, `${phase}：**不结算**（金币 0）`, `gold=${r.gold}`);
		ok(r.text.includes(LOSE_SENTENCE), `${phase}：**败句出现在屏上**（\`#661\`）`, r.text.slice(0, 80));
		ok(r.hp < r.hpBefore, `${phase}：受伤（${r.hpBefore}→${r.hp}）`);
		ok(r.note, `${phase}：写了**声明面的失败笔记**（\`n_cave_battered\`）`);
		ok(r.step === TAIL_STEP, `${phase}：**推进**（步数 = ${TAIL_STEP}）`, `step=${r.step}`);
	} else {
		// **判别性用例**：`success=true`（dice 0.99）但相位说"没打完" ⇒ 一律不许结算/推进
		ok(r.gold === 0, `${phase}：**未结束 ⇒ 不结算**（金币 0；这正是"用 success 分支"会红的地方）`, `gold=${r.gold}`);
		ok(r.step === 0, `${phase}：**未结束 ⇒ 不推进**（步数 0）`, `step=${r.step}`);
		ok(r.passage === PILOT, `${phase}：重渲染本段（落点＝${PILOT}）`, `落点=${r.passage}`);
		ok(r.text.includes(WIN_SENTENCE), `${phase}：胜句照印（重渲染后仍可见，\`#661\`）`, r.text.slice(0, 80));
	}
}

// ── ② 奖励读**声明面**（改声明 ⇒ 行为跟着变）──
{
	const r = await runPhase({ phase: 'cleared', dice: 0.99, rewardGold: 7, label: '声明面 gold=7' });
	ok(r.gold === 7, '改声明 `reward.gold=7` ⇒ 落袋 7（证明不是常量）', `gold=${r.gold}`);
	const r2 = await runPhase({ phase: 'cleared', dice: 0.99, rewardGold: 1, label: '声明面 gold=1' });
	ok(r2.gold === 1, '改声明 `reward.gold=1` ⇒ 落袋 1（同上，反例方向）', `gold=${r2.gold}`);
}

if (bad) {
	console.error(`\n✗ 短战斗相位门未通过（${bad} 项）—— 分支只看 \`waveRecord().phase\`：未结束不许结算/推进（#608／#598 同族）`);
	process.exit(1);
}
console.log('\n✔ 短战斗相位门通过（四相位各归其位 · 未结束不结算不推进 · 奖励与失败笔记都走声明面）');
console.log('   · 注：胜/败句的**可见性**是既有缺陷（另票），本门只判状态面（金币/步数/伤/笔记/落点）。');
