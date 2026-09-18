#!/usr/bin/env node
// 车道 E-B3 读数（`#215` 报备 `18504078`）：**读侧（`--reads`）**那一面 —— 页内与 CLI **同判** ✓ ＋ **适用面写清** ✓。
//
// 判据（每条都能假 ✗）：
//   ① **两侧同判** ✓：页内 `#readfaces` 的结论 ≡ CLI 侧判据的结论（**同一份** `core/stateDiagnose.mjs` ✓：
//      门侧 import 证据 ＝ `stories/mist-forest/gates/reads.mjs`（`const probs = tableReadProblems(rows)`）；
//      页侧 ＝ `web/read-faces-view.mjs` ✓），且**两侧各自报出所判输入的 sha** ✓ —— 页内报在页面上 ✓、
//      CLI 侧报在本测试输出里 ✓（门的输出**逐字节冻结**在 `test/audit-golden.json` ✓ ⇒ 不往门里加打印 ✗）。
//   ② **适用面** ✓：`--reads` 门分三级，页内**只跑 ① 条件表行**（硬判 ✓）；**②③ 不跑 ＋ 理由**写在读数里 ✓
//      （㉑／㉕：读数只说它**真正比过的东西** ✗）；且明写"**① 级 0 处 ≠ 门干净**" ✗ ＋ "覆盖率那条
//      `已接线` 是**模块身份级代理**（必要不充分 ✓）" ✗。
//   ③ **时延是数字** ✓ ＋ 口径写明（**非真浏览器** ✗ —— jsdom 而非真渲染器 ✓；**含 DOM 写入** ⇒ 与 `#877` 纯判定数**不可比** ✗）。
//   ④ **能假的另一半** ✓：注入一个字面状态读 ⇒ 页内那格**必须变** ✓（不是常数 ✓）；**合法键 ⇒ 0 处** ✓；合成输入上**两侧仍同判** ✓。
//   ⑤ **缺 vs 畸形分开** ✓：缺 `rules.json` ⇒ **不适用**（不抛 ✗）／在册而 `rows` 不是数组 ⇒ **抛** ✓。
//   ⑥ **旧读数不留** ✓（`#946` 同族）：抛之前那一格**已清** ✓。
//
// ⚠️ jsdom 收场纪律：`pretendToBeVisual` 用 **false** ＋ **显式** `window.close()` ＋ 最后**显式** `process.exit(rc)` ✓。

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { loadPackage } from '../editor/web/loader.mjs';
import { renderReadFaces } from '../editor/web/read-faces-view.mjs';
import { tableReadProblems } from '../editor/lib/core/stateDiagnose.mjs';
import { createContext } from '../scripts/audit/context.mjs';
import { fingerprintOf } from '../editor/lib/core/fingerprint.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const nodeIo = () => ({ readText: (p) => readFileSync(`${ROOT}/${p}`, 'utf8') });
const slug = 'mist-forest';
const dom = new JSDOM('<!doctype html><body><pre id="out"></pre><pre id="rulediag"></pre><pre id="readfaces"></pre></body>', { pretendToBeVisual: false });
let rc = 0;
try {
	let bad = 0;
	const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };
	const doc = dom.window.document;
	const pkg = loadPackage({ slug, io: nodeIo() });
	const text = () => doc.getElementById('readfaces').textContent;

	// ── ① 两侧同判（页内 ≡ CLI）───────────────────────────────────────────────
	const t0 = process.hrtime.bigint();
	const page = renderReadFaces({ doc, pkg });
	const pageMs = Number(process.hrtime.bigint() - t0) / 1e6;

	// CLI 侧：**门读的那份输入**（`ctx.window.Sg.story.rules()` ✓ —— 门 `run()` 里就是这么取的 ✓）
	const ctx = createContext({ story: slug });
	const cliRows = ctx.window?.Sg?.story?.rules?.() ?? [];
	const cliSha = fingerprintOf(cliRows);
	const cliProblems = tableReadProblems(cliRows);

	console.log(`  · 页内（\`#readfaces\`）输入指纹 = ${page.rowsSha}（${page.rows.length} 行）`);
	console.log(`  · CLI 侧（\`Sg.story.rules()\`）输入指纹 = ${cliSha}（${cliRows.length} 行）`);
	t('① **两侧所判输入是同一份** ✓（sha 逐字节相等 ⇒ 页内判的不是"另一个包" ✓）', page.rowsSha === cliSha);
	t('① 页内**在读数里报出**所判输入的 sha ✓（不是只在本测试里算 ✓）', text().includes(page.rowsSha) && text().includes(`输入 rows ${page.rows.length} 行`));
	t('① **结论逐项相等** ✓（① 级逐条：`{id, field, what, detail}` ✓）', JSON.stringify(page.problems) === JSON.stringify(cliProblems));
	t('① 真数据非空 ✓ ＋ ① 级 0 处 ✓（能假的另一半：不是"永远报错" ✓）', page.rows.length > 0 && page.problems.length === 0);

	// ── ② 适用面在**读数里**（跑哪一级／不跑哪两级 ＋ 理由）────────────────────
	t('② 读数写明**页内跑的是 ① 级（硬判）** ✓', /① 条件表行那一级（硬判）/.test(text()) && /① 条件表行读点：0 处/.test(text()));
	t('② 读数写明**②③ 不跑 ＋ 归 CLI** ✓', /页内\*\*不跑\*\*/.test(text()) && /② 故事面知识键直读/.test(text()) && /③ 非知识键直读按面汇总/.test(text()) && /本件不适用 ✓（这一步在 CLI ✓）/.test(text()));
	t('② **不跑的理由只有一条**（输入拿不到 ✓）写进读数 ✓', /理由\*\*只有一条\*\*/.test(text()) && /页内都拿不到/.test(text()));
	t('② **"① 级 0 处 ≠ 门干净"写在读数里** ✓（㉑ ✓）', /① 级 `0 处` ≠ `--reads` 门干净/.test(text()) && /audit\.mjs --reads --check/.test(text()));
	t('② **覆盖率代理的边界写在读数里** ✓（"模块身份级 · 必要不充分" ✓）', /模块身份级代理/.test(text()) && /必要不充分/.test(text()) && text().includes('**不是**"整门都在页内跑"'));

	// ── ④ 能假的另一半（刀 ✗）：注入字面状态读 ⇒ 页内那格必须变 ────────────────
	{
		const synth = [
			{ id: 'A', scope: 'S', req: ['$pc.ev.x'], text: 'a' },         // 既非合法键形 ⇒ 又是字面状态读 ✓
			{ id: 'B', scope: 'S', text: '<<set $x to 1>> $pc.ev.y' },     // text 里的字面状态读 ✓
			{ id: 'C', scope: 'S', req: ['ev.a', 'world.b', 'keeper.met', 'inv:rope', 'era:past', 'n_note1'], text: 'c' },   // 合法键 ⇒ 不该报 ✓
		];
		const p2 = { data: { ...pkg.data, 'rules.json': { ...pkg.data['rules.json'], rows: synth } } };
		const r2 = renderReadFaces({ doc, pkg: p2 });
		t('④ **刀** ✗：注入字面状态读 ⇒ 页内那格**主读数从 0 变 3** ✓（不是常数 ✓）', r2.problems.length === 3 && page.problems.length === 0);
		t('④ 两条路径**都点名** ✓（`req` 的键形态／字面状态读 ＋ `text` 的字面状态读 ✓）', r2.problems.some((p) => p.id === 'A' && p.field === 'req' && p.what === '键形态') && r2.problems.some((p) => p.id === 'A' && p.what === '字面状态读') && r2.problems.some((p) => p.id === 'B' && p.field === 'text'));
		t('④ **合法键不报** ✓（`ev.`／`world.`／第三命名空间 `keeper.`／前缀键 `inv:`／`era:`／note id ⇒ 0 处 ✓）', !r2.problems.some((p) => p.id === 'C'));
		t('④ **两侧同判**在合成输入上也成立 ✓（CLI 侧同函数 ⇒ 同结论 ✓）', JSON.stringify(r2.problems) === JSON.stringify(tableReadProblems(synth)));

	}

	// ── ⑤ 缺 vs 畸形（两半都验 ✓）─────────────────────────────────────────────
	t('⑤ **缺** `rules.json` ⇒ **不适用**且**不抛** ✗（`hollow-cave`／`minimal-demo` 本来就没有 ✓）', (() => {
		const r3 = renderReadFaces({ doc, pkg: { data: { 'tables.json': {} } } });
		return r3.applicable === false && /本件不适用/.test(text()) && text().includes('**不是**"条件表干净"') && !/条件表行读点：0 处/.test(text());
	})());
	t('⑤ **畸形**（在册而 `rows` 不是数组）⇒ **讲人话地抛** ✓（缺≠畸形 ✓）', (() => {
		try { renderReadFaces({ doc, pkg: { data: { ...pkg.data, 'rules.json': { rows: 3 } } } }); return false; }
		catch (e) { return /rows/.test(String(e.message)) && /畸形|不是数组/.test(String(e.message)); }
	})());
	t('⑥ **旧读数不留** ✓：抛之前那一格**已被清** ✓（不含上一次的计数 ✓）', /未载入/.test(text()) && !/条件表行读点/.test(text()));

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
	else console.log('\n✔ web-read-faces 通过：**读侧**（页内跑 ① 条件表行级 ✗／② 故事面知识键·③ 非知识键汇总只在 CLI ✗）—— 两侧同判 ＋ sha 双报 ＋ 适用面 ＋ 刀 ＋ 缺/畸形 ＋ 旧读数不留 ✓');
} catch (e) {
	console.error('✗ web-read-faces 异常：', String(e?.message ?? e).slice(0, 200));
	rc = 1;
} finally {
	try { dom.window.close(); } catch { /* 已关 */ }
}
process.exit(rc);
