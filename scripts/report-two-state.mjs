// 两态注入原型（`#629` · 伞 `#626`）—— **report-* 命名**：为的是进 F2 台账（'未接线（原型）＋理由'逐条可见）—— **证明"每个条件站点两态可构造"**，report/原型级，**不进门禁**。
//
// 为什么有它：门禁要从"抽样有没有崩"（游走器＝仪器）换成"**该是什么**"（规格）→ 规格的执行器需要能把
// 目标段的每个条件站点**两侧都真实渲染出来**。本脚本就是那个执行器的**最小原型**：状态注入 ＋ 驱动到段 ＋
// 渲染后取证据（可见选项／屏文本），并把两侧的**可机检期望**并排列出。
//
// 口径（与 `#628` 的报告互补，别混用）：
// · 证据一律来自**渲染后**（不是"我设了状态就算"）——与 `#491` 的真机口径一致；
// · 注入是**受控的最小集**：只改该站点决策相关的键（`inv`／`ev`／`keeper`），其余保持车卡后的自然态；
// · **不可构造也是结果**（票面要求）：某站点若必须靠"游玩中间态"才能构造 → 单独列清单＋原因；
// · 本脚本**不进门禁**：它是原型（`#629`），真门形态等伞 `#626` 的裁决（落点见 `#607`：`stories/<slug>/gates/**`）。
//
// 用法：
// npm run build # 前置：产物新鲜（`test/boot.mjs` 会断言）
// node scripts/report-two-state.mjs # 试点段＝`顶楼`（本次缺口服最集中）
// node scripts/report-two-state.mjs --passage=书房
// node scripts/report-two-state.mjs --selftest # 自证（纯函数；反例必须红）
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from './dist-paths.mjs';

// ── 纯函数：期望判定（可自证）────────────────────────────────────────
/** 一行证据 → 该站点在该极性下的**期望**是否成立。`expect` 形如 `{ kind:'text'|'choice'|'noChoice', value}`。 */
export const judgeExpectations = (evidence, expects = []) => {
	const problems = [];
	const text = String(evidence?.text ?? '');
	const choices = evidence?.choices ?? [];
	for (const e of expects) {
		if (e.kind === 'text' && !text.includes(e.value)) problems.push(`屏文本缺「${e.value}」`);
		if (e.kind === 'noText' && text.includes(e.value)) problems.push(`屏文本不该出现「${e.value}」`);
		if (e.kind === 'choice' && !choices.some((c) => c.includes(e.value))) problems.push(`选项里缺「${e.value}」（现有：${choices.join('｜') || '无'}）`);
		if (e.kind === 'noChoice' && choices.some((c) => c.includes(e.value))) problems.push(`选项里不该有「${e.value}」`);
		// `lands`：**行为面**证据——点下去落到哪一段（两侧链接标签常常一样，差别只在落点/副作用）
		if (e.kind === 'lands' && String(evidence?.landed ?? '') !== e.value) problems.push(`点击后应落到「${e.value}」，实得「${evidence?.landed ?? '（没点到链接）'}」`);
	}
	return problems;
};

/** 从"用例 × 站点"矩阵归纳：每个站点是否**两态都被观测到**（票面的核心判据）。 */
export const summarizePolarity = (cases = []) => {
	const perAtom = new Map();
	for (const c of cases) for (const s of c.sites ?? []) {
		if (!perAtom.has(s.atom)) perAtom.set(s.atom, { atom: s.atom, true: [], false: [] });
		perAtom.get(s.atom)[s.polarity === 'true' ? 'true' : 'false'].push(c.label);
	}
	return [...perAtom.values()].map((r) => ({ ...r, both: r.true.length > 0 && r.false.length > 0 }));
};

// ── 自证（纯函数；反例必须红）────────────────────────────────────────
export const selftest = () => {
	let bad = 0;
	const t = (label, ok) => { if (ok) console.log(`      ✓ 自证·${label}`); else { bad++; console.error(`      ✗ 自证·${label}`); } };
	const ev = { text: "缺''完整星图''。 把卷轴和星图交给他", choices: ['把卷轴和星图交给他', '下楼，打开地下那道门'], landed: '交付' };
	t('正例：期望命中 ⇒ 0 问题', judgeExpectations(ev, [{ kind: 'text', value: '缺' }, { kind: 'choice', value: '交给他' }]).length === 0);
	t('反例：屏文本缺该串 ⇒ 报', judgeExpectations(ev, [{ kind: 'text', value: '不缺任何东西' }]).length === 1);
	t('反例：`noText` 命中 ⇒ 报（不该出现的出现了）', judgeExpectations(ev, [{ kind: 'noText', value: '缺' }]).length === 1);
	t('反例：`choice` 缺 ⇒ 报（含现有选项，便于排查）', judgeExpectations(ev, [{ kind: 'choice', value: '抢他的杖' }])[0].includes('抢他的杖'));
	t('反例：`noChoice` 命中 ⇒ 报', judgeExpectations(ev, [{ kind: 'noChoice', value: '交给他' }]).length === 1);
	t('行为面：`lands` 命中 ⇒ 0 问题', judgeExpectations(ev, [{ kind: 'lands', value: '交付' }]).length === 0);
	t('行为面反例：落点不对 ⇒ 报（**两支持支标签相同、只有落点不同**时，就靠它分辨）', judgeExpectations(ev, [{ kind: 'lands', value: '顶楼' }]).length === 1);
	const cases = [
		{ label: 'A', sites: [{ atom: 'inv:X', polarity: 'true' }] },
		{ label: 'B', sites: [{ atom: 'inv:X', polarity: 'false' }] },
		{ label: 'C', sites: [{ atom: 'inv:Y', polarity: 'true' }] },
	];
	const sum = summarizePolarity(cases);
	t('归纳：两态都有的站点 ⇒ `both=true`', sum.find((r) => r.atom === 'inv:X').both === true);
	t('归纳：只有一态的站点 ⇒ `both=false`（**没构造出来就该红**）', sum.find((r) => r.atom === 'inv:Y').both === false);
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项——原型判据没有咬合力（#629）`); process.exit(1); }
	console.log('\n✔ 自证通过：期望五类（text/noText/choice/noChoice/正例）＋ 两态归纳（单态必须为 false）');
};

// 被 import 时不许执行 CLI（同 `report-polarity-gap.mjs` 的坑）
const IS_MAIN = process.argv[1] && (await import('node:url')).pathToFileURL(process.argv[1]).href === import.meta.url;
if (IS_MAIN) {
const argv = process.argv.slice(2);
const has = (k) => argv.includes(`--${k}`);
if (has('selftest')) { selftest(); process.exit(0); }
const val = (k, d) => { const i = argv.findIndex((a) => a.startsWith(`--${k}=`)); return i >= 0 ? argv[i].slice(k.length + 3) : d; };

const PASSAGE = val('passage', '顶楼');
const OUT = val('out', 'build/two-state.md');

// ── 试点：`顶楼` 的两个交付站点 ＋ 它们的组合用例 ────────────────────────
// 站点来自 `#628` 的缺口报告：`inv:传送术卷轴`（4 站点·0 双态）· `inv:完整星图`（9 站点·0 双态）。
// 段内结构（`stories/mist-forest/40-ch2.twee`）：`<<if 卷轴 and 星图>>` → 交付链接；否则缺件提示。
const PILOT = {
	顶楼: {
		// **发现 1（本原型的负面结果，值钱）**：单个原子的两态期望**不成立**——段内是 `<<if 卷轴 and 星图>>`，
		// 只持有其中一件时"交付链接"仍在，但**落点仍是本段**（它只是把缺件旗标置真再重渲染）。
		// → 期望必须按**合取上下文**（这一行的完整谓词组合）声明，不能按单个原子声明。
		// **发现 2**：期望要用**渲染后**口径写——`缺''完整星图''` 在屏上是 `<em>` 斜体，`textContent` 里**没有引号**。
		// 站点（供"极性覆盖"归纳用；两态期望写在**用例**上）。
		sites: [
			{ atom: 'inv:传送术卷轴' },
			{ atom: 'inv:完整星图' },
		],
		cases: [
			{ label: '空手（两件都缺，缺件提示）',
				patches: { 'pc.keeper.key': true, 'pc.ev.delivery_short': true, 'pc.inv.传送术卷轴': false, 'pc.inv.完整星图': false },
				sites: [{ atom: 'inv:传送术卷轴', polarity: 'false' }, { atom: 'inv:完整星图', polarity: 'false' }],
				expects: [{ kind: 'text', value: '缺传送术卷轴' }, { kind: 'text', value: '缺完整星图' }, { kind: 'lands', value: '顶楼' }] },
			{ label: '只有卷轴（缺星图）',
				patches: { 'pc.keeper.key': true, 'pc.ev.delivery_short': true, 'pc.inv.传送术卷轴': true, 'pc.inv.完整星图': false },
				sites: [{ atom: 'inv:传送术卷轴', polarity: 'true' }, { atom: 'inv:完整星图', polarity: 'false' }],
				expects: [{ kind: 'text', value: '缺完整星图' }, { kind: 'noText', value: '缺传送术卷轴' }, { kind: 'lands', value: '顶楼' }] },
			{ label: '只有星图（缺卷轴）',
				patches: { 'pc.keeper.key': true, 'pc.ev.delivery_short': true, 'pc.inv.传送术卷轴': false, 'pc.inv.完整星图': true },
				sites: [{ atom: 'inv:传送术卷轴', polarity: 'false' }, { atom: 'inv:完整星图', polarity: 'true' }],
				expects: [{ kind: 'text', value: '缺传送术卷轴' }, { kind: 'noText', value: '缺完整星图' }, { kind: 'lands', value: '顶楼' }] },
			{ label: '两件齐（交付真支）',
				patches: { 'pc.keeper.key': true, 'pc.ev.delivery_short': true, 'pc.inv.传送术卷轴': true, 'pc.inv.完整星图': true },
				sites: [{ atom: 'inv:传送术卷轴', polarity: 'true' }, { atom: 'inv:完整星图', polarity: 'true' }],
				expects: [{ kind: 'noText', value: '缺' }, { kind: 'lands', value: '交付' }] },
		],
	},
};

const { boot, LINKS } = await import('../test/boot.mjs');

const inject = (w, patches) => w.eval(`(function(){const v=SugarCube.State.variables;const P=${JSON.stringify(patches)};
	for (const k of Object.keys(P)) { const parts=k.split('.'); let o=v; for (let i=0;i<parts.length-1;i++){ if(!o[parts[i]]||typeof o[parts[i]]!=='object') o[parts[i]]={}; o=o[parts[i]]; } o[parts[parts.length-1]]=P[k]; } return 1;})()`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const render = async (w, passage) => { w.SugarCube.Engine.play(passage); await sleep(220); };
const snap = (w) => {
	const text = (w.document.querySelector('#passages')?.textContent ?? '').replace(/\s+/g, ' ').trim();
	const choices = [...w.document.querySelectorAll(`${LINKS}, #passages .choice-card a`)].map((a) => (a.textContent ?? '').trim());
	return { passage: w.SugarCube.State.passage, text, choices };
};

const pilot = PILOT[PASSAGE];
if (!pilot) { console.error(`✗ 没有「${PASSAGE}」的试点定义（可用：${Object.keys(PILOT).join('、')}）`); process.exit(2); }

console.log(`══ 两态注入原型（#629 · 伞 #626）══  段＝「${PASSAGE}」· 用例 ${pilot.cases.length} · 站点 ${pilot.sites.length}`);
const { w, close } = await boot({ random: () => 0.5 });
const results = [];
try {
	// 车卡（与游走器/真机门同一引导路径）
	const byLabel = (t) => [...w.document.querySelectorAll(`${LINKS}, #passages .choice-card a`)].find((x) => (x.textContent ?? '').trim() === t);
	for (const label of ['踏上旅途', '快速成型', '出发，前往歪脖子鸭酒馆']) { const a = byLabel(label); if (!a) throw new Error(`引导失败：找不到「${label}」`); a.click(); await new Promise((r) => setTimeout(r, 200)); }
	for (const c of pilot.cases) {
		inject(w, c.patches);
		await render(w, PASSAGE);
		const ev = snap(w);
		// 行为面：点「把卷轴和星图交给他」看**落到哪一段**（两侧标签相同 → 只有落点/副作用能分辨）
		const link = [...w.document.querySelectorAll(LINKS)].find((a) => (a.textContent ?? '').includes('把卷轴和星图交给他'));
		if (link) { link.click(); await sleep(220); ev.landed = String(w.SugarCube.State.passage ?? ''); }
		const expects = [...(c.expects ?? []), ...c.sites.flatMap((s) => pilot.sites.find((x) => x.atom === s.atom)?.expects?.[s.polarity] ?? [])];
		const problems = judgeExpectations(ev, expects);
		results.push({ ...c, evidence: ev, problems });
		console.log(`   · ${c.label}：选项 ${ev.choices.length} 个｜落点「${ev.landed ?? '—'}」｜${problems.length ? `✗ ${problems.join('；')}` : '✓ 期望成立'}`);
	}
} finally { try { close?.(); } catch { /* 关窗失败不影响结论 */ } }

const sum = summarizePolarity(results);
for (const r of sum) console.log(`   → 站点 ${r.atom}：真侧 ${r.true.length} 例 / 假侧 ${r.false.length} 例 ⇒ ${r.both ? '**两态可构造** ✓' : '**未构造出** ✗'}`);

const lines = [];
lines.push(`# 两态注入原型：段「${PASSAGE}」（\`#629\`·伞 \`#626\`，report/原型级）\n`);
lines.push('> 证据一律来自**渲染后**（不猜内部路径）；注入是**受控最小集**。\n');
lines.push('| 用例 | 注入（决策相关键） | 观测到的选项 | 期望判定 |');
lines.push('|---|---|---|---|');
for (const r of results) lines.push(`| ${r.label} | \`${JSON.stringify(r.patches)}\` | ${r.evidence.choices.join('／') || '—'} | ${r.problems.length ? `✗ ${r.problems.join('；')}` : '✓'} |`);
lines.push('\n## 原型发现（**负面结果也算产出**，票面要求）\n');
lines.push('- **单个原子的两态期望不成立**：段内是 `<<if 卷轴 and 星图>>`，只持一件时交付链接仍在、**落点仍是本段** ⇒ 矩阵的行必须按**合取上下文**（该行完整谓词）声明；');
lines.push('  · 推论：矩阵的**行键＝谓词上下文**，而"极性覆盖"仍按**单个原子**统计——两个口径都要，缺一不可；');
lines.push("- **期望必须用渲染后口径**：`缺''完整星图''` 在屏上是 `<em>` 斜体，`textContent` **不含引号** ⇒ 用源码字面量写期望会恒红；");
lines.push('- **同一标签两种行为**：真/假两侧的「把卷轴和星图交给他」**标签完全相同**，差别只在落点（真支→`交付`，假支→本段＋置缺件旗标）⇒ 判据必须看**行为面**（落点/副作用），不能看"选项在不在"。\n');
lines.push('\n## 构造成本（票面要求：直接对应未来矩阵门的行数与代价）\n');
const keys = [...new Set(results.flatMap((r) => Object.keys(r.patches)))].sort();
lines.push('| 项 | 值 |');
lines.push('|---|---|');
lines.push(`| 每个用例的**注入键**（并集） | ${keys.map((k) => `\`${k}\``).join(' · ')} |`);
lines.push('| 是否需要**前置路线**（先走到该段） | **不需要**——直接 `Engine.play(段)` ＋ 注入即可，前提只是"车卡后的自然态" |');
lines.push(`| 每行代价 | ${results.length} 用例 = ${results.length} 次渲染 ＋ ${results.filter((r) => r.evidence.landed).length} 次点击（毫秒级） |`);
lines.push(`| 副作用 | 注入只改决策相关键；点击会改状态 ⇒ 每用例**重新注入**（本脚本已如此） |`);
lines.push('\n## 站点两态归纳\n');
lines.push('| 站点 | 真侧用例 | 假侧用例 | 结论 |');
lines.push('|---|---|---|---|');
for (const r of sum) lines.push(`| \`${r.atom}\` | ${r.true.join('／') || '—'} | ${r.false.join('／') || '—'} | ${r.both ? '**两态可构造**' : '**未构造出**（需补用例或记录原因）'} |`);
mkdirSync(dirname(join(ROOT, OUT)), { recursive: true });
writeFileSync(join(ROOT, OUT), lines.join('\n') + '\n');
const bad = sum.filter((r) => !r.both).length + results.filter((r) => r.problems.length).length;
console.log(`   报告：${OUT}`);
if (bad) { console.error(`\n✗ 原型未达标：${bad} 项（站点两态未构造出 or 期望不符）—— 这正是票面要求**留痕**的负面结果`); process.exit(1); }
console.log('\n✔ 原型达标：试点段每个站点的**真/假两侧都由真实渲染观测到**（⇒ 未来矩阵门的执行器内核可行）');
}
