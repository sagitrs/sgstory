// **矩阵门**（`#640` · 伞 `#626`）：**场景 × 道具/线索集合 → 期望** —— MVP（6 行起步）。
//
// 为什么要有它：门禁要从"抽样有没有崩"（游走器＝**仪器**）换成"**该是什么**"（**规格**）。
// 覆盖口径已由 `#628`（`npm run report:polarity`，report-only）盯住；本门负责**承诺**：
// 把一段场景在**特定道具/线索集合**下的行为**断言**下来（期望一律机检）。
//
// **三条判据（`#629` 实测的三条口径，本门强制执行）**：
//   ① **行键＝谓词上下文**：每行的期望声明在该行**完整谓词**下（不是"某个原子为真"）——`<<if A and B>>` 下只满足 A 时，
//      行为**不等于**"A 为真的期望"（实测：交付链接仍在、落点仍是本段）；
//   · 数据口径：`patches` 里 `null`＝**删键**（道具不在行囊里＝键不存在），与 `delta` 期望的 `null` 对称；
//   ② **期望用渲染后 + 行为面口径**：`缺''完整星图''` 在屏上是 `<em>` 斜体（`textContent` **不含引号**）；
//      真/假两支的**标签可能完全相同**（实测「把卷轴和星图交给他」两侧同字）⇒ 必须有 `lands`（点下去落到哪一段）与 `delta`（状态增量）；
//   ③ **极性覆盖 ratchet**：数据里的 `promised` 原子**只增不减**；每个 promised 原子都要有**真/假两侧**的行；承诺的原子若在内容里消失 ⇒ 红（承诺腐烂）。
//
// 落点纪律（`#602`/`#607`）：**判据数据住故事侧** `stories/<slug>/matrix.json`；**门形状住引擎侧**本文件（逐故事读数据）。
//
// 用法：
//   npm run build && node test/itemmatrix.mjs            # 全跑（每个有 matrix.json 的故事）
//   node test/itemmatrix.mjs --selftest                  # 自证（纯函数；反例必须红）
//   node test/itemmatrix.mjs --story=mist-forest         # 只跑一个故事
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, storySlugs } from '../scripts/dist-paths.mjs';
import { extractSites } from '../scripts/audit/lib/story-atoms.mjs';

// ── 纯函数：① 期望判定（渲染后 + 行为面）────────────────────────────────
export const judgeExpectations = (evidence, expects = []) => {
	const problems = [];
	const text = String(evidence?.text ?? '');
	const choices = evidence?.choices ?? [];
	const delta = evidence?.delta ?? {};
	for (const e of expects) {
		switch (e?.kind) {
			case 'text': if (!text.includes(e.value)) problems.push(`屏文本缺「${e.value}」`); break;
			case 'noText': if (text.includes(e.value)) problems.push(`屏文本不该出现「${e.value}」`); break;
			case 'choice': if (!choices.some((c) => c.includes(e.value))) problems.push(`选项里缺「${e.value}」（现有：${choices.join('｜') || '无'}）`); break;
			case 'noChoice': if (choices.some((c) => c.includes(e.value))) problems.push(`选项里不该有「${e.value}」`); break;
			case 'lands': if (String(evidence?.landed ?? '') !== e.value) problems.push(`点击后应落到「${e.value}」，实得「${evidence?.landed ?? '（没点到链接）'}」`); break;
			// `null` 期望＝「键不存在**或**为 null」——twee 的 `<<run delete ...>>` 是**删键**（实测：消耗后读到 undefined），
			// 用 JSON 写不出 undefined，故以 `null` 表达"消耗/清空"这一形态（`#640` 实测踩到）
			case 'delta': {
				const got = delta[e.path];
				const ok = e.value === null ? (got === undefined || got === null) : JSON.stringify(got) === JSON.stringify(e.value);
				if (!ok) problems.push(`状态「${e.path}」应为 ${JSON.stringify(e.value)}，实得 ${got === undefined ? 'undefined（键不存在）' : JSON.stringify(got)}`);
				break;
			}
			default: problems.push(`未知的期望类型「${String(e?.kind)}」`);
		}
	}
	return problems;
};

// ── 纯函数：② 极性覆盖 ratchet ＋ ③ 承诺腐烂 ────────────────────────────
/** `knownAtoms`＝内容里静态抽取到的原子集合（来自 `#628` 的同一个抽取器）。 */
export const checkPromised = ({ promised = [], rows = [], knownAtoms = new Set() } = {}) => {
	const problems = [];
	const per = new Map(promised.map((a) => [a, { true: 0, false: 0 }]));
	for (const r of rows) for (const c of r.covers ?? []) {
		if (!per.has(c.atom)) { problems.push(`行「${r.id}」覆盖了未承诺的原子「${c.atom}」——请把它写进 \`promised\`（承诺只增不减）`); continue; }
		if (c.polarity !== 'true' && c.polarity !== 'false') { problems.push(`行「${r.id}」的极性「${String(c.polarity)}」不合法（只许 true/false）`); continue; }
		per.get(c.atom)[c.polarity]++;
	}
	for (const [atom, n] of per) {
		if (!knownAtoms.has(atom)) { problems.push(`承诺腐烂：原子「${atom}」在内容里已抽不到（改名/删了？）——承诺表只增不减，请先修数据或内容`); continue; }
		if (!n.true) problems.push(`极性缺口：「${atom}」缺**真**侧的行`);
		if (!n.false) problems.push(`极性缺口：「${atom}」缺**假**侧的行`);
	}
	return problems;
};

/** 数据文件形状（fail-loud：结构缺失必须报错）。 */
export const judgeMatrixShape = (data, { slug = '?' } = {}) => {
	const problems = [];
	if (!data || typeof data !== 'object' || Array.isArray(data)) return [`故事「${slug}」的 matrix.json 不是对象`];
	if (!Array.isArray(data.promised) || !data.promised.length) problems.push(`故事「${slug}」的 \`promised\` 必须是非空数组（承诺覆盖的原子）`);
	if (!Array.isArray(data.rows) || !data.rows.length) problems.push(`故事「${slug}」的 \`rows\` 必须是非空数组`);
	for (const r of data.rows ?? []) {
		if (!r.id || !r.passage || !r.patches || !Array.isArray(r.expects) || !r.expects.length) problems.push(`行「${r.id ?? '?'}」缺字段（需要 id/passage/patches/expects）`);
		if (!Array.isArray(r.covers) || !r.covers.length) problems.push(`行「${r.id ?? '?'}」缺 \`covers\`（这行覆盖了哪个原子的哪一侧）`);
		if (r.click && !r.click.label) problems.push(`行「${r.id ?? '?'}」的 \`click\` 缺 \`label\``);
	}
	return problems;
};

// ── 自证（纯函数；反例必须红）────────────────────────────────────────────
export const selftest = () => {
	let bad = 0;
	const t = (label, ok) => { if (ok) console.log(`      ✓ 自证·${label}`); else { bad++; console.error(`      ✗ 自证·${label}`); } };
	const ev = { text: "缺''完整星图''。 把卷轴和星图交给他", choices: ['把卷轴和星图交给他', '下楼，打开地下那道门'], landed: '交付', delta: { 'pc.world.flower_fed': true } };
	t('正例：五类期望都命中 ⇒ 0 问题', judgeExpectations(ev, [
		{ kind: 'text', value: '缺' }, { kind: 'noText', value: '不缺任何东西' }, { kind: 'choice', value: '交给他' },
		{ kind: 'noChoice', value: '抢他的杖' }, { kind: 'lands', value: '交付' }, { kind: 'delta', path: 'pc.world.flower_fed', value: true },
	]).length === 0);
	t('反例：屏文本缺该串 ⇒ 报', judgeExpectations(ev, [{ kind: 'text', value: '没有这句' }]).length === 1);
	t('反例：`noText` 命中 ⇒ 报', judgeExpectations(ev, [{ kind: 'noText', value: '缺' }]).length === 1);
	t('反例：`choice` 缺 ⇒ 报', judgeExpectations(ev, [{ kind: 'choice', value: '抢他的杖' }])[0].includes('抢他的杖'));
	t('反例：`lands` 落点不对 ⇒ 报（**两侧标签相同时只有它能分辨**）', judgeExpectations(ev, [{ kind: 'lands', value: '顶楼' }]).length === 1);
	t('反例：`delta` 不符 ⇒ 报', judgeExpectations(ev, [{ kind: 'delta', path: 'pc.world.flower_fed', value: false }]).length === 1);
	t('`delta` 的 `null` 语义：键不存在 ⇒ 命中（**消耗**＝`delete` 的形态）', judgeExpectations({ text: '', choices: [], delta: { 'pc.inv.X': undefined } }, [{ kind: 'delta', path: 'pc.inv.X', value: null }]).length === 0);
	t('`delta` 的 `null` 语义反例：键还在（值 true）⇒ 必须报', judgeExpectations({ text: '', choices: [], delta: { 'pc.inv.X': true } }, [{ kind: 'delta', path: 'pc.inv.X', value: null }]).length === 1);
	t('反例：未知期望类型 ⇒ 报（不许静默跳过）', judgeExpectations(ev, [{ kind: 'magic' }]).some((p) => p.includes('未知')));
	const known = new Set(['inv:A', 'inv:B']);
	t('ratchet 正例：两侧齐全 ⇒ 0 问题', checkPromised({ promised: ['inv:A'], knownAtoms: known, rows: [{ id: 'r1', covers: [{ atom: 'inv:A', polarity: 'true' }] }, { id: 'r2', covers: [{ atom: 'inv:A', polarity: 'false' }] }] }).length === 0);
	t('ratchet 反例：缺一侧 ⇒ 报', checkPromised({ promised: ['inv:A'], knownAtoms: known, rows: [{ id: 'r1', covers: [{ atom: 'inv:A', polarity: 'true' }] }] }).some((p) => p.includes('缺**假**侧')));
	t('ratchet 反例：覆盖未承诺的原子 ⇒ 报（承诺只增不减）', checkPromised({ promised: ['inv:A'], knownAtoms: known, rows: [{ id: 'r1', covers: [{ atom: 'inv:B', polarity: 'true' }] }] }).some((p) => p.includes('未承诺')));
	t('ratchet 反例：极性非法 ⇒ 报', checkPromised({ promised: ['inv:A'], knownAtoms: known, rows: [{ id: 'r1', covers: [{ atom: 'inv:A', polarity: 'maybe' }] }] }).some((p) => p.includes('不合法')));
	t('承诺腐烂：内容里已抽不到该原子 ⇒ 报', checkPromised({ promised: ['inv:A'], knownAtoms: new Set(), rows: [{ id: 'r1', covers: [{ atom: 'inv:A', polarity: 'true' }, { atom: 'inv:A', polarity: 'false' }] }] }).some((p) => p.includes('承诺腐烂')));
	t('形状：缺 `promised`/`rows`/行字段 ⇒ 逐条报', judgeMatrixShape({ slug: 's', rows: [{ id: 'r' }] }).length >= 3);
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项——矩阵门判据没有咬合力（#640）`); process.exit(1); }
	console.log('\n✔ 自证通过：期望六类（text/noText/choice/noChoice/lands/delta，含未知类型必报）＋ ratchet（两侧/未承诺/非法极性/承诺腐烂）＋ 形状');
};

// ── IO：驱动（真机口径，同 `#629` 原型）＋ 逐故事跑数据 ─────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const matrixOf = (slug) => join(ROOT, 'stories', slug, 'matrix.json');
const argv = process.argv.slice(2);
const has = (k) => argv.includes(`--${k}`);
if (has('selftest')) { selftest(); process.exit(0); }
const val = (k, d) => { const i = argv.findIndex((a) => a.startsWith(`--${k}=`)); return i >= 0 ? argv[i].slice(k.length + 3) : d; };
const ONLY = val('story', null);

const { readdirSync } = await import('node:fs');
const { boot, LINKS } = await import('./boot.mjs');
const atomSetFor = (slug) => {
	const dir = join(ROOT, 'stories', slug);
	const sources = Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.twee')).map((f) => [`stories/${slug}/${f}`, readFileSync(join(dir, f), 'utf8')]));
	return new Set(extractSites(sources).map((s) => s.atom));
};
const inject = (w, patches) => w.eval(`(function(){const v=SugarCube.State.variables;const P=${JSON.stringify(patches)};
	for (const k of Object.keys(P)) { const parts=k.split('.'); let o=v; for (let i=0;i<parts.length-1;i++){ if(!o[parts[i]]||typeof o[parts[i]]!=='object') o[parts[i]]={}; o=o[parts[i]]; } const last=parts[parts.length-1]; if (P[k]===null) delete o[last]; else o[last]=P[k]; } return 1;})()`);
const snap = (w, row) => {
	const text = (w.document.querySelector('#passages')?.textContent ?? '').replace(/\s+/g, ' ').trim();
	const choices = [...w.document.querySelectorAll(`${LINKS}, #passages .choice-card a`)].map((a) => (a.textContent ?? '').trim());
	const delta = {};
	for (const e of row.expects ?? []) if (e.kind === 'delta') delta[e.path] = w.eval(`(function(){const v=SugarCube.State.variables;return v.${e.path};})()`);
	return { text, choices, delta };
};

console.log('══ 矩阵门（场景 × 道具/线索集合 → 期望）══  `#640` · 伞 `#626`');
const slugs = (ONLY ? [ONLY] : storySlugs()).filter((s) => existsSync(matrixOf(s)));
const skipped = (ONLY ? [ONLY] : storySlugs()).filter((s) => !existsSync(matrixOf(s)));
let bad = 0, rowsRun = 0;
for (const slug of slugs) {
	const data = readJson(matrixOf(slug));
	const shape = judgeMatrixShape(data, { slug });
	if (shape.length) { bad += shape.length; for (const p of shape) console.error(`  ✗ ${p}`); continue; }
	const coverage = checkPromised({ promised: data.promised, rows: data.rows, knownAtoms: atomSetFor(slug) });
	if (coverage.length) { bad += coverage.length; for (const p of coverage) console.error(`  ✗ 故事「${slug}」${p}`); }
	console.log(`  · 故事「${slug}」：行 ${data.rows.length} · 承诺原子 ${data.promised.length}（覆盖检查${coverage.length ? ' **未过**' : '通过'}）`);
	const { w, close } = await boot({ story: slug, random: () => 0.5 });
	try {
		for (const row of data.rows) {
			inject(w, row.patches);
			w.SugarCube.Engine.play(row.passage);
			await sleep(220);
			const ev = snap(w, row);
			if (row.click?.label) {
				const link = [...w.document.querySelectorAll(`${LINKS}, #passages .choice-card a`)].find((a) => (a.textContent ?? '').includes(row.click.label));
				if (!link) { bad++; console.error(`  ✗ ${row.id}：找不到要点的链接「${row.click.label}」（现有：${ev.choices.join('｜') || '无'}）`); continue; }
				link.click(); await sleep(220);
				ev.landed = String(w.SugarCube.State.passage ?? '');
				// 落点判定要在点击后重取 delta（点击可能改状态）
				for (const e of row.expects ?? []) if (e.kind === 'delta') ev.delta[e.path] = w.eval(`(function(){const v=SugarCube.State.variables;return v.${e.path};})()`);
			}
			const problems = judgeExpectations(ev, row.expects);
			rowsRun++;
			if (problems.length) { bad += problems.length; console.error(`  ✗ ${row.id}：${problems.join('；')}`); }
			else console.log(`      ✓ ${row.id}（落点「${ev.landed ?? '—'}」）`);
		}
	} finally { try { close?.(); } catch { /* 关窗失败不影响结论 */ } }
}
if (skipped.length) console.log(`  · 没有 \`matrix.json\` 的故事（跳过，**显式**）：${skipped.join('、')}`);
if (bad) { console.error(`\n✗ 矩阵门未通过（${bad} 项 · 跑 ${rowsRun} 行）—— 行键＝谓词上下文 · 期望＝渲染后+行为面 · 承诺只增不减（#640）`); process.exit(1); }
console.log(`\n✔ 矩阵门通过（故事 ${slugs.length} 个 · 行 ${rowsRun} · 承诺原子 ${slugs.reduce((a, s) => a + readJson(matrixOf(s)).promised.length, 0)}：两侧覆盖齐 · 期望逐条成立）`);
