// 条件原子 × 极性：**覆盖缺口报告**（`#628`，伞 `#626`）—— **report-only，不进门禁**。
//
// 为什么要有它：游走器（`test/walker.mjs`）是**仪器**不是**判据**——它断言"抽样的 N 条路径上没崩、不变量没破"，
// 绿＝没抽到问题，不是"行为符合预期"。要把它从门禁链上摘下来（伞 `#626`），先得**看清缺口**：
// 内容里每一个"按线索/道具分叉"的站点，真/假两侧到底有没有被踩到。本脚本就是把这份缺口表**可重复地**跑出来，
// 供 `#629`（两态注入原型）与后续矩阵门（落点见 `#607`：`stories/<slug>/gates/**` ＋ `audit.json`）定行数。
//
// 口径（**必须照着读**，否则会误读报告）：
//   · **站点**＝注释遮蔽（`mask.mjs`）后 `<<if>>`/`<<elseif>>` 行里的**单个条件原子**
//     （`$pc.inv["X"]` / `$pc.keeper.X` / `Sg.notes.has('n_x')` / `$era`）；
//   · **极性**＝该段**被访问时**用 in-page 求值为**真/假**（不猜内部路径，与 `#491` 的真机口径一致）；
//   · **观测**＝固定种子、定档（`hi/lo/neutral`）的游走（`ch1`/`tower` 两种起手）；`--runs=` 可缩放、`--seeds=` 可换
//     ⇒ 换了就不是同一份报告（可重复性是"同参数同输出"）；
//   · **这是抽样观测**：`未观测 ≠ 断言不存在`。报告只说"这一侧此刻没有观测"，不作为"没门/有门"的判决；
//   · 台账登记：`report-gate-ledger.mjs` 的 `REASONS` 里写明「**未接线（report-only）＋理由**」。
//
// 用法：
//   node scripts/report-polarity-gap.mjs                      # 默认 12 局（18 站点档：2 seeds × 3 档 × 2 起手）
//   node scripts/report-polarity-gap.mjs --runs=18 --seeds=3  # 缩放
//   node scripts/report-polarity-gap.mjs --story=hollow-cave --out=build/x.md
//
// 前置：**先 `npm run build`**（`test/boot.mjs` 会断言产物新鲜度——基准旧了，结果是假红/假绿）。
//   node scripts/report-polarity-gap.mjs --selftest           # 自证（纯函数；反例必须红）
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, DEFAULT_SLUG } from './dist-paths.mjs';
import { pathToFileURL } from 'node:url';
import { extractSites, siteKey, isRuleSite, polarityBucket, tallyPolarity, renderReport } from './audit/lib/story-atoms.mjs';

// ── 自证（纯函数；反例必须红）────────────────────────────────────────
export const selftest = () => {
	let bad = 0;
	const t = (label, ok) => { if (ok) console.log(`      ✓ 自证·${label}`); else { bad++; console.error(`      ✗ 自证·${label}`); } };
	const src = [
		':: 段一 [widget]',
		'// 历史：<<if $pc.inv["注释里的道具"]>> —— 注释不是站点',
		'<<if $pc.inv["A"] and Sg.notes.has(\'n_x\')>>',
		'<<elseif $pc.keeper.met or $era is "past">>',
		':: 段二',
		'/% <<if $pc.inv["块注释里的道具"]>> %/',
		'<<if $pc.inv["B"]>>',
	].join('\n');
	const sites = extractSites({ 'a.twee': src });
	const atoms = sites.map((s) => s.atom).sort();
	t('抽取：注释（行/块）里的原子**不算**站点', !atoms.includes('inv:注释里的道具') && !atoms.includes('inv:块注释里的道具'));
	t('抽取：`if`/`elseif` 行内的原子都算，`and/or` 多原子各算一个', ['inv:A', 'inv:B', 'era', 'keeper:met', 'note:n_x'].every((a) => atoms.includes(a)) && atoms.length === 5);
	t('抽取：widget 段被标记（规则段要单独看）', sites.some((s) => isRuleSite(s)) && sites.every((s) => (s.passage === '段一') === isRuleSite(s)));
	t('极性：`era` 两态名映射为两侧计数', polarityBucket('era', 'past') === 'f' && polarityBucket('era', 'present') === 't' && polarityBucket('inv:A', false) === 'f');

	const keys = sites.map(siteKey);
	const two = new Map([[keys[0], { t: 3, f: 1 }]]);
	const oneSided = new Map([[keys[0], { t: 3, f: 0 }]]);
	t('计数正例：两态 ⇒ 归入「两态都到过」', tallyPolarity(sites, two).both.length === 1 && tallyPolarity(sites, two).one.length === 0);
	t('计数反例：只到一态 ⇒ 必须归入「只到过一态」', tallyPolarity(sites, oneSided).one.length === 1 && tallyPolarity(sites, oneSided).none.length === sites.length - 1);
	t('计数反例：零观测 ⇒ 全部归入「完全没观测到」', tallyPolarity(sites, new Map()).none.length === sites.length);
	const md = renderReport({ sites, obs: oneSided, runs: 1, visitedPassages: new Set(['段一']) });
	t('渲染：三块报告都在，且单态站点被点名', /## 总览/.test(md) && /## 按原子/.test(md) && /## 单态/.test(md) && md.includes('| 段一 |') && md.includes('`inv:A`'));
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项——报告口径没有咬合力（#628）`); process.exit(1); }
	console.log('\n✔ 自证通过：注释遮蔽 / elseif / widget 标记 / era 两态 / 三档计数 / 渲染点名，反例都红');
};

// ── IO：观测（固定种子游走）＋ 产物读取 ─────────────────────────────────
const makeRng = (seed) => { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s >>>= 0; s ^= s << 5; s >>>= 0; return s / 0xffffffff; }; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const observe = async ({ sites, seeds = 2, stubs = ['hi', 'lo', 'neutral'], modes = ['ch1', 'tower'], steps = 45 } = {}) => {
	const { boot, LINKS } = await import('../test/boot.mjs');
	const byPassage = new Map();
	for (const s of sites) { if (!byPassage.has(s.passage)) byPassage.set(s.passage, []); byPassage.get(s.passage).push(s); }
	const evalAtom = (w, atom) => {
		if (atom === 'era') return String(w.SugarCube.State.variables.era ?? '');
		if (atom.startsWith('inv:')) return !!w.eval(`(function(){const v=SugarCube.State.variables;return v.pc&&v.pc.inv&&v.pc.inv[${JSON.stringify(atom.slice(4))}];})()`);
		if (atom.startsWith('keeper:')) return !!w.eval(`(function(){const v=SugarCube.State.variables;return v.pc&&v.pc.keeper&&v.pc.keeper[${JSON.stringify(atom.slice(7))}];})()`);
		if (atom.startsWith('note:')) return !!w.eval(`Sg.notes.has(${JSON.stringify(atom.slice(5))})`);
		return null;
	};
	const obs = new Map(), visitedPassages = new Set();
	let runs = 0, failedRuns = 0;
	for (const mode of modes) for (const stub of stubs) for (let idx = 1; idx <= seeds; idx++) {
		let close = null;
		try {
			const b = await boot({ random: stub === 'hi' ? () => 0.99 : stub === 'lo' ? () => 0.01 : () => 0.5 });
			const w = b.w; close = b.close;
			const rng = makeRng(idx * 7919 + (stub === 'lo' ? 13 : stub === 'neutral' ? 29 : 0) + (mode === 'tower' ? 101 : 0) * 0);
			const clickables = () => [...w.document.querySelectorAll(`${LINKS}, #passages .choice-card a`)];
			const byLabel = (t) => clickables().find((x) => x.textContent.trim() === t);
			for (const label of ['踏上旅途', '快速成型', '出发，前往歪脖子鸭酒馆']) { const a = byLabel(label); if (!a) throw new Error('引导失败'); a.click(); await sleep(150); }
			if (mode === 'tower') { w.eval('(function(){const v=SugarCube.State.variables;v.pc.inv["时光护符"]=true;})()'); w.SugarCube.Engine.play('塔门'); await sleep(150); }
			for (let step = 0; step < steps; step++) {
				const p = w.SugarCube.State.passage ?? '?';
				visitedPassages.add(p);
				for (const s of byPassage.get(p) ?? []) {
					const v = evalAtom(w, s.atom);
					const bucket = polarityBucket(s.atom, v);
					if (!bucket) continue;
					const k = siteKey(s); if (!obs.has(k)) obs.set(k, { t: 0, f: 0 });
					obs.get(k)[bucket]++;
				}
				if (String(p).startsWith('结局')) break;
				const c = clickables();
				if (!c.length) break;
				c[Math.floor(rng() * c.length)].click();
				await sleep(45);
			}
			runs++;
		} catch { failedRuns++; } finally { try { close?.(); } catch { /* 关窗失败不影响观测 */ } }
	}
	return { obs, visitedPassages, runs, failedRuns };
};

const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback);

// ── CLI ─────────────────────────────────────────────────────────────
const IS_MAIN = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;   // 被 import 时**不许执行 CLI**（实测踩过）
if (IS_MAIN) {
const argv = process.argv.slice(2);
const has = (k) => argv.includes(`--${k}`);
if (has('selftest')) { selftest(); process.exit(0); }
const val = (k, d) => { const i = argv.findIndex((a) => a.startsWith(`--${k}=`)); return i >= 0 ? argv[i].slice(k.length + 3) : d; };
const OUT = val('out', 'build/polarity-gap.md');
const SEEDS = Number(val('seeds', 2)), MODES = val('modes', 'ch1,tower').split(','), STUBS = val('stubs', 'hi,lo,neutral').split(',');

const slug = val('story', DEFAULT_SLUG);   // 默认＝默认故事（`--story=` 可切；本报告的口径以默认故事为主）
const sources = Object.fromEntries(readdirSync(join(ROOT, 'stories', slug)).filter((f) => f.endsWith('.twee')).sort().map((f) => [`stories/${slug}/${f}`, readFileSync(join(ROOT, 'stories', slug, f), 'utf8')]));
const sites = extractSites(sources);
console.log(`══ 条件原子 × 极性缺口报告（#628 · 伞 #626）══  故事「${slug}」· 站点 ${new Set(sites.map(siteKey)).size} · 原子 ${new Set(sites.map((s) => s.atom)).size}`);
const { obs, visitedPassages, runs, failedRuns } = await observe({ sites, seeds: SEEDS, stubs: STUBS, modes: MODES });
const traces = readJson(join(ROOT, 'build/route-traces.json'), { routes: {} });
const scVisited = new Set(); for (const r of Object.values(traces.routes)) for (const p of r.passages ?? []) scVisited.add(p);
const scCells = new Set(readJson(join(ROOT, 'build/coverage-scenarios.json'), { cells: [] }).cells);
const walkerCells = new Set(readJson(join(ROOT, 'build/coverage-walker.json'), { cells: [] }).cells);
// 门的承诺面（`#640` 的 `matrix.json`）：报告与门是两个口径，这里把「哪些原子已被承诺」标出来
const matrixPath = join(ROOT, 'stories', slug, 'matrix.json');
const promised = existsSync(matrixPath) ? (JSON.parse(readFileSync(matrixPath, 'utf8')).promised ?? []) : [];
const md = renderReport({ sites, obs, runs, failedRuns, visitedPassages, scVisited, scCells, walkerCells, promised });
mkdirSync(dirname(join(ROOT, OUT)), { recursive: true });
writeFileSync(join(ROOT, OUT), md);
const { both, one, none, uniq } = tallyPolarity(sites, obs);
console.log(`   站点 ${uniq.length} ⇒ 两态 ${both.length} · 单态 ${one.length} · 未观测 ${none.length}（观测 ${runs} 局，失败 ${failedRuns}）`);
console.log(`   报告：${OUT}（口径：抽样观测，未观测 ≠ 断言不存在）`);
}
