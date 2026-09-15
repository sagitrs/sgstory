// `#598`：长战斗（`机制·longFight`）**点得动、走得掉** 的真机回归门。
//
// 为什么需要它（操作者实测的缺陷）：那条链接点了**没有任何反应**，而长战斗是**死路**——
//   ① `Game.Combat.waveRecord()` 返回的是**对象** `{ phase, plan, wave, advance }`，而段落里拿**整个对象**
//      与 `"advance"` / `"cleared"` / `"failed"` 比 ⇒ 三个分支全不中、只落到 `<<else>>` ⇒ 两条 `<<caveNext>>` 出口不可达；
//   ② `advance`／`else` 两支用 `<<include "机制·longFight">>` 重渲染 ⇒ `<<include>>` **只是就地插入、不换段落**
//      ⇒ 波次计数与结果槽都不刷新 ⇒ 玩家侧"点了没反应"。
// 静态门（`--sitedisc`／`--rules`／`--cave`）看不见这类**运行期**死路；`test/story-runtime.mjs` 驱动的是启动契约，
// `test/scenarios.mjs` 的 38 条路线只跑故事 1 ⇒ 这条路径此前**零覆盖**。本门就补这一段。
//
// 判据（两条路都走）：
//   ① **每一次点击都要有进展**（屏文本变了 **或** 波次计数变了）——"点了没反应"直接红；
//   ② **有限次内必须离开** `机制·longFight`（落到 `岔口`／`地下村落`／`倒下` 之一）——死路直接红。
import { boot } from './boot.mjs';

let bad = 0;
const case_ = (label, ok, extra = '') => {
	if (ok) console.log(`      ✓ 自证·${label}`);
	else { bad++; console.error(`      ✗ 自证·${label}${extra ? '：' + extra : ''}`); }
};

/** 纯函数：这一击**算不算有进展**（屏变了 或 波次计数变了；两样都没变＝"点了没反应"）。 */
export const progressed = ({ before = '', after = '', waveBefore = null, waveAfter = null } = {}) =>
	before !== after || JSON.stringify(waveBefore) !== JSON.stringify(waveAfter);

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** 真机走一场长战斗：返回 `{ clicks, leftTo, screens }`。 */
const runFight = async (random) => {
	const { w, sleep } = await boot({ story: 'hollow-cave', random });
	const S = w.SugarCube.State.variables;
	const screen = () => norm(w.document.querySelector('#passages')?.textContent);
	const link = () => [...w.document.querySelectorAll('#passages a.link-internal')].find((a) => a.textContent.includes('逼它退到石壁边'));
	S.pc.hp = S.pc.max_hp ?? 12;
	// 注：`State.variables` 的**节点引用**在渲染后会陈旧（我实测过：直接读 `S.pc.ev.fight` 会拿到 `undefined`，
	// 而 in-page 读是好的）⇒ 波次状态一律**在页内取**，不用 Node 侧的陈旧引用。
	const wave = () => w.eval('JSON.stringify(SugarCube.State.variables.pc?.ev?.fight?.wave ?? null)');
	w.SugarCube.Engine.play('机制·longFight');
	await sleep(200);
	let clicks = 0;
	let stuckAt = null;
	for (; clicks < 12; clicks++) {
		const a = link();
		if (!a) break;                          // 已离开长战斗
		const before = screen(), wb = wave();
		a.click();
		await sleep(250);
		const after = screen(), wa = wave();
		if (!progressed({ before, after, waveBefore: wb, waveAfter: wa })) { stuckAt = clicks + 1; break; }
		if (w.SugarCube.State.passage !== '机制·longFight') { clicks++; break; }
	}
	// `#661`：离开长战斗后**结果句必须到玩家眼前**（文本曾在 link 缓冲、`<<goto>>` 在尾段里跑 ⇒ 整段丢）
	return { clicks, leftTo: w.SugarCube.State.passage, stuckAt, endText: screen(), gold: Number(w.eval('SugarCube.State.variables.pc.gold')) || 0 };
};

console.log('══ 长战斗「点得动、走得掉」门（#598）══');

// ── 自证（纯函数）──
{
	case_('正例：屏变了 ⇒ 有进展', progressed({ before: '甲', after: '乙' }) === true);
	case_('正例：屏没变但波次计数变了 ⇒ 有进展', progressed({ before: '甲', after: '甲', waveBefore: '{"rounds":0}', waveAfter: '{"rounds":1}' }) === true);
	case_('🔴 反例（本票的缺陷形态）：屏与波次都没变 ⇒ 不算进展（"点了没反应"）', progressed({ before: '甲', after: '甲', waveBefore: '{"rounds":1}', waveAfter: '{"rounds":1}' }) === false);
	case_('边界：两侧都是 null 波次且屏同 ⇒ 不算进展', progressed({ before: '甲', after: '甲' }) === false);
}

// ── 真机：败路（骰面恒定 11 ⇒ 力量豁免 DC13 必败）与胜路（骰面恒定 20 ⇒ 必胜）──
for (const [label, random] of [['败路（random=0.5 ⇒ d20=11）', 0.5], ['胜路（random=0.99 ⇒ d20=20）', 0.99]]) {
	const r = await runFight(random);
	if (r.stuckAt) { bad++; console.error(`      ✗ ${label}：第 ${r.stuckAt} 击**没有进展**（屏与波次都没变）——"点了没反应"`); continue; }
	// ⚠️ 判定顺序（`#668` dev 交叉验证的发现）：**结构性判据（死路）先判**，且下面两条**都不 `continue`**——
	// 曾经把 `#661` 的"句不可见"判在"没离开"之前且 `continue`，于是**死路**会被遮成"句不可见"（triage 被误导）。
	// 两类是**独立**失效方式：一起报，别让前一条吃掉后一条。
	if (r.leftTo === '机制·longFight') { bad++; console.error(`      ✗ ${label}：点了 ${r.clicks} 次仍**没离开**长战斗 ⇒ 死路`); }
	// `#661`：离开后**结果句必须到玩家眼前**（`runFight` 里取的是落点屏文本）
	if (!/最后一只也塌下去了|你被压在地上/.test(r.endText ?? '')) { bad++; console.error(`      ✗ ${label}：离开后**看不到胜/败句**（\`#661\`）——屏：${String(r.endText).slice(0, 80)}`); }
	console.log(`      ✓ ${label}：${r.clicks} 击后离开 ⇒ ${r.leftTo}（金币 ${r.gold}）`);
	const isWin = r.gold > 0;
	if (label.startsWith('胜路') && !isWin) { bad++; console.error(`      ✗ ${label}：打赢了却没拿到金币（${r.gold}）——长战斗奖励没落`); }
}

if (bad) {
	console.error(`\n✗ 长战斗门未通过（${bad} 项）—— 每一次点击都要有进展，且必须走得掉（#598）`);
	process.exit(1);
}
console.log('\n✔ 长战斗门通过（每次点击都有进展 · 败路/胜路都能离开）');
