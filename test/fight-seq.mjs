// 战斗序列对照门（`#493` 判据 2）——**同种子 ＋ 同动作序列**下 dump「掷骰/伤害/HP」序列，与基线逐字节比对。
//
// 为什么必须有它（票面原话）：分布口径可能"看起来一样"而掷骰序已经变了——**掷骰序改变＝下一次平衡会漂**，
// 这是最容易被漏掉的一类回归。所以 `#493`（故事 1 战斗改走共用引擎）的**最强证据**是这份序列对照：
// 迁移前后各跑一遍，**逐字节相同**才算"平衡没变"。
//
// 口径（读之前先看这三条，否则会误读）：
//   · **种子＋策略固定**：`boot({ random })` 注入固定 PRNG（`mulberry32`，`--seed=` 可换）；每轮固定取
//     `offer` 的第 0 张（`policy=first`）或"优先取带优势的那张"（`policy=adv`）——都**与判定结果无关**，
//     否则"策略随结果变"会把序列对照变成自证；
//   · **场景固定**：故事 1 的封印战直接 `Engine.play('封印·并肩')` 起手（不给全套通关），并显式播种
//     `hp/inv/dragon/keeper`（与 `test/combat-adv.mjs` 同一套种子状态 ⇒ 两条门看的是同一场仗）；
//   · **比对的是"这一手发生了什么"**：`{round, act, roll, total, success, kind, dmg, hurt, adv, skipFoe, hp}`——
//     对手那一半算在 `hurt`／`skipFoe` 里，够抓"掷骰序/减伤序"的漂移。
//
// 自证：`node test/fight-seq.mjs --selftest`（比对函数必须咬得住：改一个数字 ⇒ 点名步号与字段）
// 基线：`node test/fight-seq.mjs --update`（**只在有意改行为时**跑；PR 里必须逐条归因）
// 确定性：本门每次跑都会**连跑两遍**并断言两遍逐字节相同（抓"序列里混进了非确定源"这类隐患）。

import { boot, CLICKABLE_SEL } from './boot.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BASE = 'test/fight-seq-baseline.json';

/** 固定 PRNG（mulberry32）：同种子 ⇒ 同序列。**不依赖 `Math.random`**（sim 有"不得直调"的门）。 */
export const mulberry32 = (a) => () => {
	a |= 0; a = (a + 0x6D2B79F5) | 0;
	let t = Math.imul(a ^ (a >>> 15), 1 | a);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** 序列的规范形（比对/落盘都用它）：**只留可判定的字段**，键序固定。 */
export const canon = (steps) => JSON.stringify(steps.map((s) => ({
	scenario: s.scenario, step: s.step, round: s.round, act: s.act,
	roll: s.roll, total: s.total, success: s.success, kind: s.kind,
	dmg: s.dmg, hurt: s.hurt, adv: s.adv, skipFoe: s.skipFoe, hp: s.hp,
	checks: s.checks ?? [],
})));

/** 逐字节比对 ⇒ 第一处不同（步号＋字段）。相同 ⇒ `null`。 */
export const firstDiff = (base, now) => {
	if (base === now) return null;
	let b, n;
	try { b = JSON.parse(base); n = JSON.parse(now); } catch { return { step: -1, field: '(非 JSON——基线或产物损坏)' }; }
	if (b.length !== n.length) return { step: Math.min(b.length, n.length), field: `步数 ${b.length} → ${n.length}` };
	for (let i = 0; i < b.length; i++) {
		for (const k of Object.keys(b[i])) if (b[i][k] !== n[i][k]) return { step: i, field: `${k}：${JSON.stringify(b[i][k])} → ${JSON.stringify(n[i][k])}` };
	}
	return { step: -1, field: '(键序不同但值相同——请用 canon())' };
};

const selftest = () => {
	let bad = 0;
	const t = (msg, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${msg}`); };
	const a = [{ scenario: 's', step: 0, round: 1, act: 'x', roll: 7, total: 12, success: true, kind: 'good', dmg: 3, hurt: 0, adv: 0, skipFoe: false, hp: 40 }];
	t('正例：同一份序列 ⇒ 无差异', firstDiff(canon(a), canon(a)) === null);
	t('🔴 反例①：掷骰变了（roll 7→8）⇒ 点名步 0 与字段 roll', (() => { const d = firstDiff(canon(a), canon([{ ...a[0], roll: 8 }])); return d && d.step === 0 && d.field.startsWith('roll'); })());
	t('🔴 反例②：伤害变了（dmg 3→4）⇒ 点名 dmg', (() => { const d = firstDiff(canon(a), canon([{ ...a[0], dmg: 4 }])); return d && d.step === 0 && d.field.startsWith('dmg'); })());
	t('🔴 反例③：步数变了（少了最后一手）⇒ 点名步数', (() => { const d = firstDiff(canon([...a, { ...a[0], step: 1 }]), canon(a)); return d && d.field.startsWith('步数'); })());
	t('🔴 反例④：产物不是 JSON ⇒ 报"损坏"（不静默判过）', (() => { const d = firstDiff(canon(a), 'not json'); return d && d.step === -1; })());
	t('确定性：同种子两次 PRNG 序列一致', (() => { const r1 = mulberry32(42), r2 = mulberry32(42); return [0, 1, 2, 3, 4].every(() => r1() === r2()); })());
	t('边界：不同种子 ⇒ 不同序列（防"种子没接上"）', (() => { const r1 = mulberry32(1), r2 = mulberry32(2); return r1() !== r2(); })());
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过：同序列绿 / 掷骰-伤害-步数三类反例红 / 非 JSON 红 / 种子确定且可辨');
};

if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

const arg = (name, dflt) => {
	const p = process.argv.find((x) => x.startsWith(`--${name}=`));
	return p ? p.slice(name.length + 3) : dflt;
};
const UPDATE = process.argv.includes('--update');
const SEED = Number(arg('seed', 20260915));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 跑一个场景：**同种子、同播种、同策略**。返回该场景的步骤序列。
 *  `sc.inv` 明确列出该场景的道具（不靠上一局残留）——`月光花` 那一支走的是引擎里的“备药优先自动选牌”。 */
const runScenario = async ({ passage, policy, inv = ['好哨'], label = null, maxSteps = 8 }) => {
	const key = `${passage}／${label ?? policy}`;
	const { w, settle } = await boot({ random: mulberry32(SEED) });
	await settle();
	const pc = () => w.SugarCube.State.variables.pc;
	// 固定播种（与 `test/combat-adv.mjs` 同一套：盟约＋龙醒＋干净台账；道具由场景显式给）
	w.eval('(function(){const pc=SugarCube.State.variables.pc;pc.hp=40;pc.max_hp=40;pc.ev.fight=null;pc.inv={};'
		+ `for (const k of ${JSON.stringify(inv)}) pc.inv[k]=true;`
		+ 'pc.keeper={state:"ally"};pc.dragon={hp:Game.Dragon.hp,awake:true,defeats:0};pc.ev.failure_cause=true;})()');
	w.SugarCube.Engine.play(passage);
	await settle(); await sleep(200);
	// **掷骰序记录器**（票面判据 2 的要害）：包一层 `Game.Combat` 用的检定入口 ⇒ 每一步里发生的**每一次**检定
	// （玩家的与对手的）都按发生顺序记下来。为什么必须在 `Checks.resolve` 这一层：`fight.log.you` 不带骰面，
	// `$last_check` 只留**最后一次**——两者都抓不到"一次点击里的掷骰序"。
	w.eval('(function(){ if (!window.__rec) { const orig = Game.Checks.resolve.bind(Game.Checks); window.__checks = [];'
		+ ' Game.Checks.resolve = function (...a) { const r = orig(...a);'
		+ ' window.__checks.push({ site: r.site, roll: r.roll, total: r.total, success: r.success, nat: r.nat, adv: r.adv }); return r; };'
		+ ' window.__rec = true; } window.__checks = []; })()');
	const steps = [];
	const clickables = () => [...w.document.querySelectorAll(CLICKABLE_SEL)].filter((x) => !x.textContent.includes('设定集'));
	for (let step = 0; step < maxSteps; step++) {
		const f = pc()?.ev?.fight;
		if (!f || f.done) break;
		const offer = f.offer ?? [];
		const els = clickables();
		if (!offer.length || !els.length) break;
		const A = w.Game.Combat.actions ?? {};
		let pick = 0;
		if (policy === 'adv') {
			const i = offer.findIndex((k) => A[k]?.ok?.adv || A[k]?.crit?.adv);
			if (i >= 0) pick = i;
		}
		await settle();
		w.eval('window.__checks = []');
		els[pick].click();
		await settle(); await sleep(160);
		const checks = JSON.parse(w.eval('JSON.stringify(window.__checks ?? [])'));
		const g = pc()?.ev?.fight;
		const L = g?.log ?? {};
		const ck = L?.you ?? {};
		const last = checks[checks.length - 1] ?? {};
		steps.push({
			scenario: key, step, round: null, act: g?.last?.act ?? null,
			roll: ck.roll ?? last.roll ?? null, total: ck.total ?? last.total ?? null,
			success: ck.success ?? last.success ?? null, kind: ck.kind ?? null,
			dmg: ck.dmg ?? null, hurt: ck.hurt ?? null, adv: ck.adv ?? null, skipFoe: ck.skipFoe ?? null, hp: pc()?.hp ?? null,
			checks,
		});
		if (!g || g.done || (pc()?.hp ?? 0) <= 0) break;
	}
	return { w, settle, steps };
};

const SCENARIOS = [
	{ passage: '封印·并肩', policy: 'first', inv: ['好哨'] },
	{ passage: '封印·并肩', policy: 'adv', inv: ['好哨'] },
	// 覆盖面：引擎里有一条“备药优先”的**自动选牌**（手上有 `月光花`＋首轮＋未涂毒 ⇒ 换掉最后一张）
	// ⇒ 不给它一个场景，那段代码改坏了本门也看不见（`#441` 交叉验证抽到的就是这类“覆盖”洞）。
	{ passage: '封印·并肩', policy: 'first', inv: ['好哨', '月光花'], label: '备药优先支' },
];

const collect = async () => {
	const all = [];
	const perScenario = [];
	for (const sc of SCENARIOS) {
		const { steps } = await runScenario(sc);
		// **逐项反沉默**（`#441` 交叉验证的教训："总体非空"闸拦不住"少抽一项"）：
		// 每个场景自己必须采到 ≥1 步——否则某个场景静默 0 步（段落名改了/播种失效）时，
		// 基线里就没有它的覆盖面，而门照样绿。
		if (!steps.length) {
			console.error(`✗ 场景「${sc.passage}／${sc.label ?? sc.policy}」采到 **0 步**——该场景静默失效（段落名/播种/门控变了），基线与对照都缺它的覆盖面`);
			process.exit(1);
		}
		perScenario.push(`${sc.passage}／${sc.label ?? sc.policy}=${steps.length} 步`);
		all.push(...steps);
	}
	if (process.env.FIGHT_SEQ_VERBOSE) console.error(`   采到：${perScenario.join(' · ')}`);
	return all;
};

// ① 确定性自检：同参数连跑两遍必须逐字节相同（抓"序列里混进了非确定源"）
const once = await collect();
const twice = await collect();
if (canon(once) !== canon(twice)) {
	console.error('✗ 序列**不确定**：同种子同策略两次跑 Different ⇒ 序列里有非确定源（时间/Math.random/并发），本门不可用');
	process.exit(1);
}
if (!once.length) { console.error('✗ 没有采到任何一步（场景或播种失效）——本门会空判成绿，已按失败处理'); process.exit(1); }

const now = canon(once);
if (UPDATE) {
	writeFileSync(BASE, JSON.stringify(JSON.parse(now), null, '\t') + '\n');
	console.log(`✔ 已写入基线 ${BASE}（${once.length} 步 · seed=${SEED} · 场景 ${SCENARIOS.map((s) => `${s.passage}/${s.label ?? s.policy}`).join(' · ')}）`);
	process.exit(0);
}
if (!existsSync(BASE)) { console.error(`✗ 缺基线 ${BASE}（先跑 --update）`); process.exit(1); }
const base = canon(JSON.parse(readFileSync(BASE, 'utf8')));
const d = firstDiff(base, now);
if (d) {
	console.error(`✗ 战斗序列与基线**不一致**（#493 判据 2）：步 ${d.step} 的 ${d.field}`);
	console.error('  逐字节对照是"平衡没变"的最强证据；若这是**有意**的数值/行为调整 ⇒ 必须逐条归因（#493 允许的差异只有"0 差异"或"归因＋操作者确认"）');
	process.exit(1);
}
console.log(`✔ 战斗序列逐字节一致（${once.length} 步 · seed=${SEED} · ${SCENARIOS.map((s) => `${s.passage}/${s.label ?? s.policy}`).join(' · ')}）——掷骰序未变`);
process.exit(0);
