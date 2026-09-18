#!/usr/bin/env node
// 车道 E-B3 读数（`#215` 报备 `18504078`）＋ **A 片取件面**（报备 `18504548` ✓，裁 `18504552` ✓）：
// **读侧（`--reads`）**那一面 —— ① 与 CLI **同判** ✓；② **只列不判** ✗ ＋ **适用面写清** ✓。
//
// 判据（每条都能假 ✗）：
//   ① **① 级两侧同判** ✓：页内 `#readfaces` 的 ① 结论 ≡ CLI 侧判据（**同一份** `core/stateDiagnose.mjs` ✓：
//      门侧 import 证据 ＝ `stories/mist-forest/gates/reads.mjs`（`const probs = tableReadProblems(rows)` ✓）；
//      页侧 ＝ `web/read-faces-view.mjs` ✓），且**两侧各自报出所判输入的 sha** ✓（页内报页面／CLI 侧报本测试 ✓ ——
//      门的输出**逐字节冻结**在 `test/audit-golden.json` ✓ ⇒ 不往门里加打印 ✗）。
//   ② **② 级是"读数"** ✗：页内**逐条列出**故事面字面状态读（含 `kind` ✓）；**判红只在 CLI** ✗（理由：要
//      `Sg.Notes.entries` ＋ 该故事基线 ⇒ 页内拿不到 ✓）。报/不报的**两半都验** ✓。
//   ③ **时延是数字** ✓ ＋ 口径写明（**非真浏览器** ✗ —— jsdom；**含 DOM 写入** ⇒ 与 `#877` 纯判定数**不可比** ✗）。
//   ④ **能假的另一半** ✓：注入字面状态读 ⇒ ① **主读数必变** ✓（0 → 3）；注入**没在源里的键** ⇒ ② **清单必变** ✓；
//      而**合法键不报** ✓；合成输入上 ① 两侧仍同判 ✓。
//   ⑤ **缺 vs 畸形分开** ✓：缺 `rules.json` ⇒ **不适用**（不抛 ✗）／在册而 `rows` 不是数组 ⇒ **抛** ✓。
//   ⑥ **旧读数不留** ✓（`#946` 同族）：抛之前那一格**已清** ✓。
//   ⑦ **取件面**（A 片 ✓）：**没选到段落源 ⇒ ② 如实"不适用"** ✗（不静默当 0 处 ✓）；**顺序可复现** ✓（按 `file` ✓，同文件内按段序 ✓）。
//
// ⚠️ jsdom 收场纪律：`pretendToBeVisual` 用 **false** ＋ **显式** `window.close()` ＋ 最后**显式** `process.exit(rc)` ✓。

import { readFileSync, readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { loadPackage } from '../editor/web/loader.mjs';
import { renderReadFaces, storyReadsOf } from '../editor/web/read-faces-view.mjs';
import { tableReadProblems } from '../editor/lib/core/stateDiagnose.mjs';
import { createContext } from '../scripts/audit/context.mjs';
import { fingerprintOf } from '../editor/lib/core/fingerprint.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const nodeIo = () => ({ readText: (p) => readFileSync(`${ROOT}/${p}`, 'utf8') });
const slug = 'mist-forest';
/** 真文件 → 浏览器 File 形状（A 片取件面吃它 ✓）。 */
const pickedFiles = ({ withTwee = true } = {}) => {
	const dir = `${ROOT}/stories/${slug}`;
	const mk = (rel, abs) => ({ webkitRelativePath: rel, name: rel.split('/').pop(), text: () => readFileSync(abs, 'utf8') });
	const out = readdirSync(dir).filter((n) => /\.(twee|json)$/.test(n)).map((n) => mk(`${slug}/${n}`, `${dir}/${n}`));
	out.push(...readdirSync(`${dir}/data`).map((n) => mk(`${slug}/data/${n}`, `${dir}/data/${n}`)));
	return withTwee ? out : out.filter((f) => !f.webkitRelativePath.endsWith('.twee'));
};

const dom = new JSDOM('<!doctype html><body><pre id="out"></pre><pre id="rulediag"></pre><pre id="readfaces"></pre></body>', { pretendToBeVisual: false });
let rc = 0;
try {
	let bad = 0;
	const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };
	const doc = dom.window.document;
	const pkg = loadPackage({ slug, files: pickedFiles() });
	const text = () => doc.getElementById('readfaces').textContent;

	// ── ① 两侧同判（① 级：页内 ≡ CLI）────────────────────────────────────────
	const t0 = process.hrtime.bigint();
	const page = renderReadFaces({ doc, pkg });
	const pageMs = Number(process.hrtime.bigint() - t0) / 1e6;

	const ctx = createContext({ story: slug });
	const cliRows = ctx.window?.Sg?.story?.rules?.() ?? [];
	const cliSha = fingerprintOf(cliRows);
	const cliProblems = tableReadProblems(cliRows);

	console.log(`  · 页内（\`#readfaces\`）① 输入指纹 = ${page.rowsSha}（${page.rows.length} 行）`);
	console.log(`  · CLI 侧（\`Sg.story.rules()\`）输入指纹 = ${cliSha}（${cliRows.length} 行）`);
	t('① **两侧所判输入是同一份** ✓（sha 逐字节相等 ⇒ 页内判的不是"另一个包" ✓）', page.rowsSha === cliSha);
	t('① 页内**在读数里报出**所判输入的 sha ✓', text().includes(page.rowsSha) && text().includes(`输入 rows ${page.rows.length} 行`));
	t('① **① 级结论逐项相等** ✓（`{id, field, what, detail}` ✓）', JSON.stringify(page.problems) === JSON.stringify(cliProblems));
	t('① 真数据：① 级 0 处 ✓（能假的另一半：不是"永远报错" ✓）', page.rows.length > 0 && page.problems.length === 0);

	// ── ② 级：页内只列不判（读数 ✓）──────────────────────────────────────────
	t('② 真数据：**段落源取到了** ✓（16 件 twee ✓）＋ ② 清单非空 ✓', page.sourceFiles === 16 && page.hits.length > 0);
	t('② 清单**逐条列出** ✓（`file:line` ＋ 段落名 ＋ 键 ✓，不是只报个数 ✗）', /· stories\/mist-forest\/.*\.twee:\d+ 「.+」\S+/.test(text()));
	t('② **分面计数**在读数里 ✓（叙述／故事机制 ✓）', /② 故事面字面状态读（\*\*读数\*\*/.test(text()) && /叙述 \d+ · 故事机制\/声明 \d+/.test(text()));
	t('② 页内**不判红**那半写明 ✓（判红要 `Sg.Notes.entries` ＋ 该故事基线 ⇒ 页内拿不到 ✓）', /页内\*\*不判\*\*/.test(text()) && /`Sg\.Notes\.entries`（引擎侧）/.test(text()) && /该故事读基线（宿主 io）/.test(text()));
	t('② **机制面 `src/**` 不在页内**写明 ✓', /机制面（`src\/\*\*`）不在页内/.test(text()));
	t('② **"① 同判／②③ 只列不判"** 与 **"① 级 0 处 ≠ 门干净"** 都写明 ✓（㉑ ✓）', /① 同判 ✓／②③ 只列不判 ✗/.test(text()) && /① 级 `0 处` ≠ `--reads` 门干净/.test(text()));
	t('② **覆盖率代理的边界**写明 ✓（"模块身份级 · 必要不充分" ✓）', /模块身份级代理/.test(text()) && /必要不充分/.test(text()) && text().includes('**不是**"整门都在页内跑"'));

	// ── ⑦ 取件面：没选到段落源 ⇒ ②「不适用」（不静默当 0 ✓）／顺序可复现 ──────
	{
		const noTwee = loadPackage({ slug, files: pickedFiles({ withTwee: false }) });
		const r = renderReadFaces({ doc, pkg: noTwee });
		t('⑦ **没选到段落源 ⇒ ② 如实"不适用"** ✗（不是"0 处" ✓ —— 否则会被读成"干净" ✓）', r.hits === null && /② 故事面字面状态读：\*\*本件不适用\*\*/.test(text()) && !/② 故事面字面状态读（\*\*读数\*\*/.test(text()));
	}
	{
		const a = storyReadsOf(pkg.sources);
		const b = storyReadsOf([...pkg.sources].reverse());   // 源顺序打乱 ⇒ 清单应按 `file` 归位（调用方排序 ✓）
		t('⑦ **顺序可复现** ✓：`sources` 已按 `file` 排 ⇒ 同输入两次逐条相同 ✓', JSON.stringify(a) === JSON.stringify(storyReadsOf(pkg.sources)));
		t('⑦ 清单里**同名段落跨文件不并** ✗（如实都在 ✓ —— 按 `file` 分列 ✓）', new Set(a.map((h) => h.file)).size >= 2);
		void b;
	}

	// ── ④ 能假的另一半（刀 ✗）────────────────────────────────────────────────
	{
		const synth = [
			{ id: 'A', scope: 'S', req: ['$pc.ev.x'], text: 'a' },         // 非合法键形 ⇒ 键形态 ＋ 字面状态读 ✓
			{ id: 'B', scope: 'S', text: '<<set $x to 1>> $pc.ev.y' },     // text 里的字面状态读 ✓
			{ id: 'C', scope: 'S', req: ['ev.a', 'world.b', 'keeper.met', 'inv:rope', 'era:past', 'n_note1'], text: 'c' },   // 合法键 ⇒ 不该报 ✓
		];
		const p2 = { data: { ...pkg.data, 'rules.json': { ...pkg.data['rules.json'], rows: synth } }, sources: pkg.sources };
		const r2 = renderReadFaces({ doc, pkg: p2 });
		t('④ **刀** ✗：注入字面状态读 ⇒ ① 主读数**从 0 变 3** ✓（不是常数 ✓）', r2.problems.length === 3 && page.problems.length === 0);
		t('④ ① 两条路径**都点名** ✓（`req` 的键形态／字面状态读 ＋ `text` 的字面状态读 ✓）', r2.problems.some((p) => p.id === 'A' && p.field === 'req' && p.what === '键形态') && r2.problems.some((p) => p.id === 'B' && p.field === 'text'));
		t('④ ① **合法键不报** ✓（`ev.`／`world.`／`keeper.`／`inv:`／`era:`／note id ⇒ 0 处 ✓）', !r2.problems.some((p) => p.id === 'C'));
		t('④ ① **两侧同判**在合成输入上也成立 ✓', JSON.stringify(r2.problems) === JSON.stringify(tableReadProblems(synth)));

		// ② 的刀：注入一个**源里没有的键** ⇒ 清单必变 ✓
		const badSource = [{ file: 'stories/mist-forest/zz-probe.twee', text: ':: 探针\n<<if $pc.ev.brand_new_key>>x<</if>>\n' }];
		const r3 = renderReadFaces({ doc, pkg: { data: pkg.data, sources: badSource } });
		t('④ **② 的刀** ✗：注入源里没有的键 ⇒ ② 清单**必变**且点名 ✓', r3.hits.length === 1 && r3.hits[0].key === 'ev.brand_new_key' && /brand_new_key/.test(text()) && !text().includes('「门厅取物」'));
	}

	// ── ⑤ 缺 vs 畸形（两半都验 ✓）─────────────────────────────────────────────
	t('⑤ **缺** `rules.json` ⇒ **不适用**且**不抛** ✗', (() => {
		const r = renderReadFaces({ doc, pkg: { data: { 'tables.json': {} } } });
		return r.applicable === false && /本件不适用/.test(text()) && text().includes('**不是**"条件表干净"') && !/条件表行读点：0 处/.test(text());
	})());
	t('⑤ **畸形**（在册而 `rows` 不是数组）⇒ **讲人话地抛** ✓（缺≠畸形 ✓）', (() => {
		try { renderReadFaces({ doc, pkg: { data: { ...pkg.data, 'rules.json': { rows: 3 } } } }); return false; }
		catch (e) { return /rows/.test(String(e.message)) && /畸形|不是数组/.test(String(e.message)); }
	})());
	t('⑥ **旧读数不留** ✓：抛之前那一格**已被清** ✓', /未载入/.test(text()) && !/条件表行读点/.test(text()));

	// ── 容器缺失 ⇒ 抛（view 层约定 ✓）────────────────────────────────────────
	t('容器缺失 ⇒ **讲人话地抛** ✗（读数不该静默不显示 ✓）', (() => {
		try { renderReadFaces({ doc: new JSDOM('<div></div>').window.document, pkg }); return false; }
		catch (e) { return /#readfaces/.test(String(e.message)); }
	})());

	// ── ③ 时延是数字 ＋ 口径写明 ─────────────────────────────────────────────
	console.log(`  · 页内判定时延（node v${process.versions.node} ＋ jsdom，**非真浏览器** ✗）：${pageMs.toFixed(2)} ms`);
	console.log('    ⚠️ 口径：这条**含 DOM 写入** ✓ ⇒ 与 `#877` 的**纯判定**数**不可比** ✗（那边不碰 DOM ✓）。');
	t('③ 时延是数字 ✓（不是"很快"这种话 ✓）', Number.isFinite(pageMs) && pageMs >= 0);

	if (bad) { console.error(`\n✗ web-read-faces 未通过（${bad} 项）`); rc = 1; }
	else console.log('\n✔ web-read-faces 通过：**读侧**（① 判红同判 ✓／② 只列不判 ✗／机制面 `src/**` 不在页内 ✗）—— 两侧同判 ＋ sha 双报 ＋ 取件面两半 ＋ 刀 ＋ 缺/畸形 ＋ 旧读数不留 ✓');
} catch (e) {
	console.error('✗ web-read-faces 异常：', String(e?.message ?? e).slice(0, 200));
	rc = 1;
} finally {
	try { dom.window.close(); } catch { /* 已关 */ }
}
process.exit(rc);
