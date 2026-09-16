// 洞窟玩法巡检（**report-only 仪器**，`#493`… 之外的「可玩性」排查）—— 沿真实「三选一」路线跑 N 局，报告：
//   · **未捕获错误**（含段落/动作上下文）：SugarCube 错误弹窗、`uncaught` 列表；
//   · **点了没反应**：点击后段落与屏文都没变（排除"同段重渲染但有文本变化"的正例）；
//   · **走不到头**：预算内没到终点段落（死路/卡死）；
//   · **静默产出**：`<<give>>`／奖励落账后，那一屏没有任何文字提到获得物（"打开宝箱没提示获得了什么"）。
//
// 口径（这是**仪器**不是判据 —— 与 `#626` 的极性报告同一档）：
//   · 抽样观测：`--runs=` 可缩放；**未观测 ≠ 不存在**；
//   · 固定种子 ⇒ 同参数同输出（可复算是"同参数同输出"，不是"每次跑一样"）；
//   · 每个观测到的问题都要**沉淀成票或门**（仪器不进门禁）。
//
// 用法：node scripts/report-cave-playability.mjs [--runs=6] [--clicks=60] [--seed=1] [--out=build/cave-playability.md]
// 前置：**先 `npm run build`**（读产物）。
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const arg = (name, dflt) => {
	const p = process.argv.find((x) => x.startsWith(`--${name}=`));
	return p ? p.slice(name.length + 3) : dflt;
};
const RUNS = Number(arg('runs', 6));
const CLICKS = Number(arg('clicks', 60));
const SEED0 = Number(arg('seed', 1));
const OUT = arg('out', 'build/cave-playability.md');
const STORY = arg('story', 'hollow-cave');
const ENDINGS = ['地下村落'];   // 终点（含子串即算走到头）

const mulberry32 = (a) => () => {
	a |= 0; a = (a + 0x6D2B79F5) | 0;
	let t = Math.imul(a ^ (a >>> 15), 1 | a);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** 抽 **DOM 错误**（SugarCube 把宏错误渲染成红框，**不进 `uncaught`**；只数 `uncaught` 会漏报整条红框
 *  —— `#710` 实测）。纯函数（吃元素文本数组）⇒ 可自证。 */
export const collectDomErrors = (texts = []) => {
	const out = [];
	for (const t of texts) {
		const s0 = String(t ?? '').replace(/\s+/g, ' ').trim();
		if (s0) out.push(s0.slice(0, 200));
	}
	return [...new Set(out)];
};
/** 从页面里取错误框文本（选择器：`#passages .error` ／ `.error-view` ／ `#error`）。 */
export const domErrorTexts = (doc) => [...(doc?.querySelectorAll?.('#passages .error, .error-view, #error') ?? [])].map((e) => e.textContent ?? '');

const selftest = () => {
	let bad = 0;
	const t = (m, c) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${m}`); };
	t('正例：抽到一条红框文本（去空白）', collectDomErrors(['  <<set>>：本故事没有第 6 段路  ']).length === 1);
	t('🔴 反例：多条相同 ⇒ 去重成一条', collectDomErrors(['e', ' e ']).length === 1);
	t('边界：空/空白 ⇒ 0 条（不空判成"有错"）', collectDomErrors(['', '   ', null]).length === 0);
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过：红框文本抽取 / 去重 / 空白不空判');
};
if (process.argv.includes('--selftest')) { selftest(); process.exit(0); }

// `test/boot.mjs` **惰性导入**：它一 import 就会断言 dist 新鲜度（`--selftest` 是纯函数自证，不该依赖产物）。
const { boot, CLICKABLE_SEL } = await import('../test/boot.mjs');

const findings = { errors: [], domErrors: [], stuck: [], unreached: [], silentLoot: [], notes: [] };

for (let run = 0; run < RUNS; run++) {
	const seed = SEED0 + run * 977;
	const rnd = mulberry32(seed);
	const { w, uncaught, settle, close } = await boot({ story: STORY, random: rnd });
	await settle();
	const seenPassages = [];
	let budget = CLICKS;
	let lastErrCount = 0;
	const seenDom = new Set();
	while (budget-- > 0) {
		const pouch = clean(w.document.querySelector('#passages')?.textContent ?? '');
		const passage = w.SugarCube.State.passage;
		seenPassages.push(passage);
		if (ENDINGS.some((e) => passage.includes(e) || pouch.includes(e))) break;
		const els = [...w.document.querySelectorAll(CLICKABLE_SEL)].filter((x) => !x.textContent.includes('设定集'));
		if (!els.length) { findings.stuck.push({ run, seed, at: passage, why: '没有可点元素（死路）' }); break; }
		const pick = Math.floor(rnd() * els.length) % els.length;
		const el = els[pick];
		const label = clean(el.textContent).slice(0, 26);
		const before = pouch, beforeP = passage;
		const invBefore = JSON.stringify(Object.keys(w.SugarCube.State.variables.pc?.inv ?? {}).sort());
		el.click(); await settle(); await sleep(180);
		const after = clean(w.document.querySelector('#passages')?.textContent ?? '');
		// ① 本节新增的未捕获错误
		if (uncaught.length > lastErrCount) {
			for (const e of uncaught.slice(lastErrCount)) findings.errors.push({ run, seed, at: passage, action: label, err: clean(e).slice(0, 220) });
			lastErrCount = uncaught.length;
		}
		// ①b **DOM 红框**（`#710` 的教训：宏错误不进 `uncaught`，只数 uncaught 会漏报）
		for (const t of collectDomErrors(domErrorTexts(w.document))) {
			if (!seenDom.has(t)) { seenDom.add(t); findings.domErrors.push({ run, seed, at: passage, action: label, err: t }); }
		}

		// ② 点了没反应（段落没变且屏文没变）
		if (after === before && w.SugarCube.State.passage === beforeP && !after.includes('失败') && !after.includes('成功')) {
			findings.stuck.push({ run, seed, at: passage, why: `点了「${label}」后段落与屏文都没变` });
		}
		// ③ **静默产出**：这一击让 `pc.inv` 多了东西，但这一屏**没任何文字提到**新增物名
		const invAfter = Object.keys(w.SugarCube.State.variables.pc?.inv ?? {}).sort();
		const beforeSet = new Set(JSON.parse(invBefore));
		const gained = invAfter.filter((k) => !beforeSet.has(k));
		if (gained.length) {
			const named = gained.filter((k) => after.includes(k));
			if (!named.length) findings.silentLoot.push({ run, seed, at: passage, action: label, gained });
		}
	}
	const reached = seenPassages.some((p) => ENDINGS.some((e) => p.includes(e)));
	if (!reached) findings.unreached.push({ run, seed, last: seenPassages[seenPassages.length - 1], clicks: CLICKS - budget, path: seenPassages.join(' → ').slice(0, 300) });
	await close();
}

const uniq = (arr, key) => { const m = new Map(); for (const x of arr) { const k = key(x); if (!m.has(k)) m.set(k, { ...x, n: 0 }); m.get(k).n++; } return [...m.values()]; };
const L = [];
L.push(`# 洞窟玩法巡检报告（report-only 仪器）`);
L.push('');
L.push(`参数：story=${STORY} · runs=${RUNS} · clicks/局=${CLICKS} · seed0=${SEED0}`);
L.push('');
L.push(`| 维度 | 命中 | 说明 |`);
L.push(`|---|---|---|`);
L.push(`| 未捕获错误 | **${findings.errors.length}** | 去重后 ${uniq(findings.errors, (x) => x.err.slice(0, 60)).length} 类 |`);
L.push(`| 点了没反应 | **${findings.stuck.length}** | 排除"同段重渲染但文本变了"的正例 |`);
L.push(`| **DOM 红框**（宏错误） | **${findings.domErrors.length}** | \`#passages .error\` 等（不进 uncaught；见 #710 的教训） |`);
L.push(`| 静默产出（道具进包但屏上没提） | **${findings.silentLoot.length}** | 差分 \`pc.inv\` ＋ 屏文不含新增物名 |`);
L.push('');
if (findings.errors.length) {
	L.push(`## 未捕获错误（去重）`); L.push('');
	for (const e of uniq(findings.errors, (x) => x.err.slice(0, 60))) L.push(`- ×${e.n} 段落「${e.at}」点「${e.action}」⇒ \`${e.err}\``);
	L.push('');
}
if (findings.domErrors.length) {
L.push(`| **DOM 红框**（宏错误） | **${findings.domErrors.length}** | \`#passages .error\` 等（不进 uncaught；见 #710 的教训） |`);
	for (const e of findings.domErrors) L.push(`- run ${e.run} 段落「${e.at}」点「${e.action}」⇒ \`${e.err}\``);
	L.push('');
}
if (findings.stuck.length) {
	L.push(`## 点了没反应`); L.push('');
	for (const s of uniq(findings.stuck, (x) => `${x.at}|${x.why}`)) L.push(`- ×${s.n} 段落「${s.at}」：${s.why}`);
	L.push('');
}
if (findings.silentLoot.length) {
	L.push(`## 静默产出（拿到了，但屏上一个字没提）`); L.push('');
	for (const s of uniq(findings.silentLoot, (x) => `${x.at}|${x.gained.join(',')}`)) L.push(`- ×${s.n} 段落「${s.at}」点「${s.action}」⇒ 进了包：\`${s.gained.join('`、`')}\`（屏文未提及）`);
	L.push('');
}
if (findings.unreached.length) {
	L.push(`## 走不到终点`); L.push('');
	for (const u of findings.unreached) L.push(`- run ${u.run}（seed ${u.seed}，点了 ${u.clicks} 次）：停在「${u.last}」——路径 ${u.path}`);
	L.push('');
}
L.push('> **仪器不是判据**（`#626` 口径）：本报告只报"这一轮抽样观测到了什么"；每个观测到的问题请**沉淀成票或门**。');
const md = L.join('\n') + '\n';
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, md);
console.log(md);
console.log(`✔ 报告已写入 ${OUT}`);
process.exit(0);
