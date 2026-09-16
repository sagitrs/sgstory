// 战斗日志门（`#701`）——**可回看的一手一句**
//
// 症状（反馈①）：战斗屏只有**最后一手**（`fightlog` 渲染 `pc.ev.fight.log` 这一格），
//   翻页/重渲染后旧的就没了 ⇒ "第几回合、刚才对手干了什么、我为什么这么判定"全不可见。
//
// 判据（四条，缺一条都会退回到"只有最后一手"）：
//   ① **有界**：`pc.ev.fight.history` 长度 ≤ `Game.Combat.HISTORY_MAX`（上限住引擎 = 单一权威）；
//   ② **保留最近**：超出后保留的是**最近** N 手（`n` 递增且首尾连续）——不是最早的 N 手；
//   ③ **渲染只读**：渲染 `<<fightlog>>` 两次 ⇒ `pc.ev.fight` 逐字节不变（`#315`：渲染路径不得改状态）；
//   ④ **降级**：没有 `history`（未打过仗／未启用）⇒ 历史块**整块不出现**（不留空行）；
//   ⑤ **可回看**：真机走一场战斗点 3 次 ⇒ 屏上能看到历史（≥3 手），且**重渲染后仍在**（不被冲掉）。
//
// 为什么要有"渲染只读"这一条：`#300` 那类"丢进度"的老毛病就长在这条线上 —— 渲染期一旦写状态，
//   读档/重渲染就会把历史抹掉，而"看起来有日志"会让人以为没事。
//
// 用法：node test/fight-history.mjs [--selftest]

import { readFileSync } from 'node:fs';
import { boot } from './boot.mjs';

let bad = 0;
const ok = (label, cond, extra = '') => {
	if (cond) console.log(`  ✓ ${label}`);
	else { bad++; console.error(`  ✗ ${label}${extra ? '：' + extra : ''}`); }
};

/** 纯函数：`history` 是否满足"有界 ＋ 保留最近"（`n` 严格递增、末项 = moves）。 */
export const historyProblems = (h, moves, max) => {
	const out = [];
	if (!Array.isArray(h)) return [{ why: 'history 不是数组' }];
	if (h.length > max) out.push({ why: `history 长度 ${h.length} 超过上限 ${max}（无界增长）` });
	for (let i = 1; i < h.length; i++) if (!(h[i].n > h[i - 1].n)) out.push({ why: `第 ${i} 项 n 没有递增（${h[i - 1].n} → ${h[i].n}）` });
	if (h.length && moves != null && h[h.length - 1].n !== moves) out.push({ why: `末项 n=${h[h.length - 1].n} 与 moves=${moves} 不一致` });
	if (h.length >= max && h[0].n !== moves - max + 1) out.push({ why: `截断后应保留最近 ${max} 手（首项 n=${h[0].n}，期望 ${moves - max + 1}）——不是最早的 N 手` });
	for (const e of h) {
		if (typeof e?.n !== 'number' || !e.you) { out.push({ why: `条目结构不完整（${JSON.stringify(e)}）——至少要 { n, you, foes }` }); break; }
	}
	return out;
};

if (process.argv.includes('--selftest')) {
	const cases = [
		['正例：3 手、上限 6 ⇒ 0 条', historyProblems([{ n: 1, you: 'a', foes: [] }, { n: 2, you: 'b', foes: [] }, { n: 3, you: 'c', foes: [] }], 3, 6).length === 0],
		['🔴 反例：超上限 ⇒ 报', historyProblems(Array.from({ length: 8 }, (_, i) => ({ n: i + 1, you: 'x', foes: [] })), 8, 6).length >= 1],
		['🔴 反例：`n` 不递增 ⇒ 报', historyProblems([{ n: 2, you: 'a', foes: [] }, { n: 1, you: 'b', foes: [] }], 2, 6).length >= 1],
		['🔴 反例：截断保留了最早的 N 手 ⇒ 报', historyProblems(Array.from({ length: 6 }, (_, i) => ({ n: i + 1, you: 'x', foes: [] })), 10, 6).length >= 1],
		['✅ 正例：截断保留最近 N 手 ⇒ 不报', historyProblems(Array.from({ length: 6 }, (_, i) => ({ n: i + 5, you: 'x', foes: [] })), 10, 6).length === 0],
	];
	for (const [label, cond] of cases) { if (cond) console.log(`  ✓ 自证·${label}`); else { bad++; console.error(`  ✗ 自证·${label}`); } }
	if (bad) { console.error(`\n✗ 自证未通过（${bad} 项）`); process.exit(1); }
	console.log('\n✔ 自证通过（5 条：边界 2 ＋ 反例 3）');
	process.exit(0);
}

console.log('══ 战斗日志门（`#701`）—— 可回看的一手一句 ══');

{
	const { w, close } = await boot({ story: 'hollow-cave', random: 0.5 });
	// 本门测的是**机制**（history 有界／保留最近／渲染只读／降级）⇒ 直接驱动引擎，
	// 不依赖段落流（段落流那条路由 `test/cave-longfight.mjs`／`test/foe-5e.mjs` 覆盖）。
	const E = (code) => JSON.parse(JSON.stringify(w.eval(`(() => { const pc = SugarCube.State.variables.pc; ${code} })()`) ?? null));
	// 建一个**最小可用 pc**（本门只跑引擎 + 渲染，不需要故事建卡流程）
	w.eval("SugarCube.State.variables.pc = { hp: 60, max_hp: 60, ev: {}, gear: [], gearHp: {}, statuses: {}, inv: {}, abilities: {}, skills: [], gold: 0 };");

	// 打 4 手（直接驱动 5e 回合：waveBegin ⇒ foeSpawn ⇒ foeRound ⇒ waveRecord）
	const hist = E(`
		const act = Sg.story.combatAction("洞窟·挥剑");
		Game.Combat.waveBegin(pc, "short");
		Game.Combat.foeSpawn(pc, 0);
		for (let i = 0; i < 4; i++) {
			const r = Game.Combat.foeRound(pc, act);
			pc.hp = Math.max(1, pc.hp - r.hurt);
			const p = Game.Combat.waveRecord(pc, true);
			if (p.phase === "cleared" || p.phase === "failed") { Game.Combat.waveBegin(pc, "short"); Game.Combat.foeSpawn(pc, 0); }
		}
		return { h: pc.ev.fight.history ?? null, moves: pc.ev.fight.moves ?? null, max: Game.Combat.HISTORY_MAX };
	`);
	ok('⑤ 真机：打 4 手后 `history` ≥3 手（不是只有最后一手）', Array.isArray(hist.h) && hist.h.length >= 3, JSON.stringify(hist).slice(0, 180));
	ok('① 有界：长度 ≤ `HISTORY_MAX`（上限住引擎）', Array.isArray(hist.h) && hist.h.length <= hist.max, `len=${hist.h?.length} max=${hist.max}`);
	ok('② 保留最近：`n` 递增且末项 = `moves`', historyProblems(hist.h, hist.moves, hist.max).length === 0,
		JSON.stringify(historyProblems(hist.h, hist.moves, hist.max)));

	// ③ 渲染只读：渲染两次 ⇒ 状态逐字节不变
	const before = E('return JSON.stringify(pc.ev.fight);');
	w.eval("(() => { const d = document.createElement('div'); document.body.appendChild(d); $(d).wiki('<<fightlog>>'); })()");
	w.eval("(() => { const d = document.createElement('div'); document.body.appendChild(d); $(d).wiki('<<fightlog>>'); })()");
	const after = E('return JSON.stringify(pc.ev.fight);');
	ok('③ 渲染路径**只读**（渲染两次 ⇒ `pc.ev.fight` 逐字节不变）', before === after, `${String(before).length}B → ${String(after).length}B`);

	// ⑤' 屏上能看到历史（含「第 N 手」）
	const html = w.eval("(() => { const d = document.createElement('div'); document.body.appendChild(d); $(d).wiki('<<fightlog>>'); return d.textContent; })()");
	ok('⑤ 屏上能看到历史（含「第 N 手」）', /第 \d+ 手/.test(String(html)), String(html).replace(/\s+/g, ' ').slice(0, 140));

	// ④ 降级：没有 history ⇒ 整块不出现
	w.eval('SugarCube.State.variables.pc.ev.fight = {};');
	const out = w.eval("(() => { const d = document.createElement('div'); document.body.appendChild(d); $(d).wiki('<<fightlog>>'); return d.innerHTML; })()");
	ok('④ 降级：没有 `history` ⇒ 历史块整块不出现（不留空行）', !/fight-history/.test(String(out)) && !/第 \d+ 手/.test(String(out)), String(out).slice(0, 100));

	// 故事 1 路径：`fightact`（点击时）也必须把这一手落进 history —— 否则「可回看」只在故事 2 成立
	{
		const core = readFileSync(new URL('../src/10-core.twee', import.meta.url), 'utf8');
		const act = core.slice(core.indexOf('<<widget "fightact">>'), core.indexOf('<<widget "fightlog">>'));
		ok('⑥ 故事 1 路径：`fightact` 调用了 `Game.Combat.pushLog`（落历史）', /Game\.Combat\.pushLog\(/.test(act));
		ok('⑥ 故事 1 路径：落历史在 `resolveFoe` **之后**（先算完再攒）', act.indexOf('pushLog') > act.indexOf('resolveFoe'));
	}

	close();
}

if (bad) {
	console.error(`\n✗ 战斗日志门未通过（${bad} 项）—— 战斗屏只有最后一手＝玩家看不见"第几回合、对手干了什么"。`);
	process.exit(1);
}
console.log('\n✔ 战斗日志门通过（有界 · 保留最近 · 渲染只读 · 降级不出现 · 真机 ≥3 手可回看）');
