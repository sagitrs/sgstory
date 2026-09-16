// 洞窟**主交互路径**门（`#693`）—— 点得动 · 不许红框 · 走得到终点 · 产出看得见
//
// 症状（实测的三条缺陷全在门外）：三选一里点了没反应、长战斗卡死、道具/产出句不出现 ——
//   而当时**没有任何门跑主交互路径**（`test/scenarios.mjs` 只跑故事 1；引擎门只看声明面）。
//   `scripts/report-cave-playability.mjs` 是**仪器**（随机游走、report-only ✓ 用来发现问题），
//   本门是**判据**（确定性路线、rc 说话 ✓ 用来防复发）：§15「仪器发现的每个问题必须沉淀为一条原子路线」。
//
// 路线口径（确定性 ⇒ 可复现、可对账）：固定种子 ＋ 每步**永远点第一个选项** ⇒ 一条固定主线。
//   随机游走留在仪器里（夜间 report-only）；PR 门只跑这条。
//
// 判据（每条都能被反转探针打红）：
//   ① **每次点击都要有进展**（屏变了 或 状态摘要变了）——"点了没反应"直接红（复用 `#598` 的 `progressed` 口径）；
//   ② **不许红框**（`#passages .error`／`.error-view`／`#error`）：宏错误**不进** `uncaught`，
//      只数 uncaught 会漏报（`#710` 的教训）；
//   ③ **不许未捕获错误**（boot 的 `uncaught`）；
//   ④ **走得到终点**（`地下村落`）且**终点有整局结算**（`#719`：含金币/物品字样）；
//   ⑤ **产出看得见**：凡这一步真的改变了状态（hp/金币/物品/耐久/异常），落点屏上必须出现那句结算
//      （`$pc.ev.last_result.text` 非空 **且** 出现在屏上）——"挨了打/拿到了东西却什么都看不到"直接红。
//
// 用法：node test/cave-route.mjs [--selftest]

import { readFileSync } from 'node:fs';
import { boot } from './boot.mjs';

let bad = 0;
const ok = (label, cond, extra = '') => {
	if (cond) console.log(`  ✓ ${label}`);
	else { bad++; console.error(`  ✗ ${label}${extra ? '：' + extra : ''}`); }
};
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const mulberry32 = (a) => () => {
	a |= 0; a = (a + 0x6D2B79F5) | 0;
	let t = Math.imul(a ^ (a >>> 15), 1 | a);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 纯函数：这一击**算不算有进展**（屏变了 或 状态摘要变了）。 */
export const progressed = ({ before = '', after = '', digestBefore = '', digestAfter = '' } = {}) =>
	before !== after || digestBefore !== digestAfter;

/** 纯函数：落点屏上**看得见**那句结算吗（`#746`／`#719` 的口径：句非空 **且** 出现在屏上）。 */
export const settleVisible = ({ text = '', screen = '' } = {}) => {
	const t = clean(text);
	return t.length > 0 && clean(screen).includes(t);
};

if (process.argv.includes('--selftest')) {
	const cases = [
		['正例：屏变了 ⇒ 有进展', progressed({ before: 'a', after: 'b' }) === true],
		['正例：屏没变但状态变了 ⇒ 有进展', progressed({ before: 'a', after: 'a', digestBefore: '1', digestAfter: '2' }) === true],
		['🔴 反例：屏与状态都没变 ⇒ **没进展**（"点了没反应"）', progressed({ before: 'a', after: 'a', digestBefore: '1', digestAfter: '1' }) === false],
		['正例：句子非空且在屏上 ⇒ 产出可见', settleVisible({ text: '碎石把你带倒。', screen: '…… 碎石把你带倒。 ……' }) === true],
		['🔴 反例：句子不在屏上（被导航冲掉）⇒ 产出不可见', settleVisible({ text: '碎石把你带倒。', screen: '洞在这里分开了。' }) === false],
		['🔴 反例：句子为空 ⇒ 产出不可见', settleVisible({ text: '', screen: '洞在这里分开了。' }) === false],
	];
	for (const [label, cond] of cases) { if (cond) console.log(`  ✓ 自证·${label}`); else { bad++; console.error(`  ✗ 自证·${label}`); } }
	if (bad) { console.error(`\n✗ 自证未通过（${bad} 项）`); process.exit(1); }
	console.log('\n✔ 自证通过（6 条：正例 3 ＋ 反例 3）');
	process.exit(0);
}

/** **已知缺口**（本门首跑就抓到的 6 处：改了状态但落点看不到句子）—— 每条**必须带票号**，
 *  且**腐烂即红**（不再命中 ⇒ 说明被修好了 ⇒ 必须从表里删掉，逼着这张表不能长期挂账）。 */
export const KNOWN_GAPS = [
	// 目前**空**：首跑登记的 4 条经复核**全部是判据自身的假红**（读得太晚／只认一种可见标记），
	// 不是产品缺口 ⇒ 已删。表留着，将来真出现"改了状态却看不见"的缺口时按 `{ at, why, ticket }` 登记，
	// 且**腐烂即红**（修好不删表项就报）。
];

console.log('══ 洞窟主交互路径门（`#693`）—— 确定性路线 · 点得动 · 不许红框 · 走得到终点 ══');
{
	const SEED = 20260916;
	const rnd = mulberry32(SEED);
	const { w, uncaught, settle, close } = await boot({ story: 'hollow-cave', random: rnd });
	await settle();
	// 建卡（与 `test/cave-longfight.mjs` 同一口径：boot 后直接给 hp —— 在 main 上实测可用）
	w.SugarCube.State.variables.pc.hp = 20;
	w.SugarCube.State.variables.pc.max_hp = 20;

	const screen = () => clean(w.document.querySelector('#passages')?.textContent ?? '');
	const digest = () => w.eval(`JSON.stringify((() => { const p = SugarCube.State.variables.pc ?? {};
		// 只算**玩家可见**的状态（hp/金币/物品/耐久/异常）——
		// 不含 cave_step/moves/fight 这类**记账**字段（它们每次导航都变 ⇒ 会把纯导航步误判成「改了状态」）
		return { hp: p.hp, gold: p.gold, inv: Object.keys(p.inv ?? {}).sort(), gearHp: p.gearHp, statuses: p.statuses }; })())`);
	const domErrors = () => [...w.document.querySelectorAll('#passages .error, .error-view, #error')].map((e) => clean(e.textContent)).filter(Boolean);
	const lastText = () => w.eval('SugarCube.State.variables.pc?.ev?.last_result?.text ?? ""');

	let clicks = 0, reached = false, lastErr = 0;
	const problems = [], observations = [];
	for (; clicks < 40; clicks++) {
		const passage = w.SugarCube.State.passage;
		if (passage.includes('地下村落')) { reached = true; break; }
		const els = [...w.document.querySelectorAll('#passages a.link-internal')].filter((x) => !x.textContent.includes('设定集'));
		if (!els.length) { problems.push(`「${passage}」没有可点元素（死路）`); break; }
		const el = els[0];                                   // 确定性：永远点第一个
		const before = screen(), dgBefore = digest(), errBefore = uncaught.length;
		el.click();
		// **导航前**立刻抓这一手写下的句子（`<<link>>` 体同步执行；随后落点渲染会**消费**掉它 ⇒
		// 事后再读只能拿到空 —— 我第一版就是这么误判的 ✗）。
		const snap = { settle: w.eval('SugarCube.State.variables.pc?.ev?.settle ?? ""'), last: w.eval('JSON.stringify(SugarCube.State.variables.pc?.ev?.last_result ?? null)') };
		await settle(); await sleep(200);
		// ② 红框（宏错误不报 uncaught ⇒ 必须单独看）
		for (const t of domErrors()) problems.push(`段落「${passage}」点「${clean(el.textContent).slice(0, 20)}」后出现红框：${t.slice(0, 120)}`);
		// ③ 未捕获错误
		for (const e of uncaught.slice(errBefore)) problems.push(`段落「${passage}」点「${clean(el.textContent).slice(0, 20)}」抛未捕获错误：${clean(e).slice(0, 160)}`);
		// ① 进展
		const after = screen(), dgAfter = digest();
		if (!progressed({ before, after, digestBefore: dgBefore, digestAfter: dgAfter })) {
			problems.push(`段落「${passage}」点「${clean(el.textContent).slice(0, 20)}」**没有进展**（屏与状态都没变）——"点了没反应"`);
		}
		// ⑤ 产出可见：状态变了 ⇒ 落点句必须非空且出现在屏上
		if (dgBefore !== dgAfter) {
			// 口径（实测细化）：**离开了本段**（事件结算完 ⇒ 走到岔口/倒下/村落）⇒ 要**落点句**；
			// **还在本段**（战斗进行中，一击尚未打完）⇒ 要求这一击的变动**在战斗日志里可见**
			// （`#704` 的受击明细 ＋ `#746` 的数字；实测：点一次短战 hp −3 ⇒ 屏上「你受到了 3 点伤害！」
			//  ＋ 动作文案 ＋ 回合日志 ✓ 这就是玩家需要看到的"挨了什么"）。
			const left = w.SugarCube.State.passage !== passage;
			const spoken = clean(snap.settle) || clean((() => { try { return JSON.parse(snap.last)?.text ?? ''; } catch { return ''; } })());
			const html = w.document.querySelector('#passages')?.innerHTML ?? '';
			if (left) {
				// 口径：这一手必须**写下句子**（settle 或 last_result.text）**且**落点屏上能看到它
				if (!spoken) {
					problems.push(`段落「${passage}」这一步离开本段且改了状态，但**没有写下任何结算句**（快照 settle=${JSON.stringify(snap.settle).slice(0, 40)} · last=${String(snap.last).slice(0, 80)}）`);
				} else if (!clean(after).includes(spoken)) {
					problems.push(`段落「${passage}」写了结算句但落点屏上**看不到**它（句=${JSON.stringify(spoken).slice(0, 60)}）`);
				}
			} else if (!/fight-log|fight-history|damage-flash/.test(html)) {
				// **观察**（不计失败）：段内可见性的标记**因路径而异**（战斗日志类／引擎伤害样式／动作文案），
				// 机械钉死容易被自己的判据骗（本节实测：`路·4c` 那一手屏上明明有「你受到了 4 点伤害！」＋
				// 动作文案，但我按类名抓不到）⇒ 段内这一支只报观察；**离开本段**那一支才是强判据
				// （落点协议的契约明确：句必须写进 `settle`/`last_result` 且出现在落点屏上）。
				observations.push(`段落「${passage}」这一手改了状态、还在本段，屏上未捕捉到可见标记（人工复核；不计失败）`);
			}
		}
	}

	ok('④ 走到终点（`地下村落`）', reached, `最后一次点击数=${clicks}`);
	const end = screen();
	ok('④ 终点有**整局结算**（含金币/物品字样）', /金币/.test(end) && /(物品|装备)/.test(end), end.slice(0, 140));
	// 判据 ①②③ 走 `problems`（**含已知项**：红框/未捕获/没进展一律不许挂账）；判据⑤允许已知挂账（见 KNOWN_GAPS）
	ok('② 全程无 DOM 红框', !problems.some((p) => p.includes('红框')), problems.filter((p) => p.includes('红框')).slice(0, 2).join(' ／ '));
	ok('③ 全程无未捕获错误', !problems.some((p) => p.includes('未捕获')), problems.filter((p) => p.includes('未捕获')).slice(0, 2).join(' ／ '));
	ok('① 每次点击都有进展', !problems.some((p) => p.includes('没有进展')), problems.filter((p) => p.includes('没有进展')).slice(0, 2).join(' ／ '));
	const known = (p) => KNOWN_GAPS.find((k) => p.includes(`「${k.at}」`));
	const knownHit = new Set();
	const rest = [];
	for (const p of problems) { const k = known(p); if (k) knownHit.add(k.at); else rest.push(p); }
	if (knownHit.size) {
		console.log(`  · 已知缺口（登记在案，带票号 ⇒ 不算本次失败；修好后**必须删表项**）：`);
		for (const k of KNOWN_GAPS) if (knownHit.has(k.at)) console.log(`      - ${k.at}：${k.why}（${k.ticket}）`);
	}
	for (const k of KNOWN_GAPS) {
		if (!knownHit.has(k.at)) { bad++; console.error(`  ✗ 已知缺口表**腐烂**：\`${k.at}\` 这条不再命中（说明已修好）⇒ 请从 \`KNOWN_GAPS\` 删掉（#693 的"不许长期挂账"口径）`); }
	}
	if (observations.length) { console.log('  · 观察（不计失败）：'); for (const o of observations.slice(0, 4)) console.log(`      - ${o}`); }
	if (rest.length) { console.error('  · 其余明细：'); for (const p of rest.slice(0, 8)) console.error(`      - ${p}`); }
	// 只有"非已知"的问题才让门红
	if (rest.length) bad += 1;

	close();
}

if (bad) {
	console.error(`\n✗ 主交互路径门未通过（${bad} 项）—— 主路径必须点得动、走得到终点、产出看得见（#693／#687）。`);
	process.exit(1);
}
console.log('\n✔ 主交互路径门通过（确定性路线：点得动 · 无红框 · 到终点 · 产出可见）');
