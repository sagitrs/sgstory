#!/usr/bin/env node
// 车道 E-B2 读数（`#215` 报备 `18502613`）：**规则行**那一面 —— 页内与 CLI **同判** ＋ **适用面写清**。
//
// 判据（每条都能假）：
// ① **两侧同判**：页内 `#rulediag` 的结论 ≡ CLI 侧判据的结论（**同一份** `core/ruleRows.mjs`：
// 门侧 import 证据 ＝ `stories/mist-forest/gates/rules.mjs`；页侧 ＝ `web/rule-rows-view.mjs`），
// 且**两侧各自报出所判输入的 sha** —— 页内报在页面上、CLI 侧报在本测试的输出里。
//注意：为什么 CLI 侧的 sha 由本测试报、而不是由门打印：门的输出**逐字节冻结**在 `test/audit-golden.json`
// → 往门里加打印＝改冻结产物（那是另一件事，不在本片）。
// ② **适用面**：页内**跑哪四步／不跑哪五步 ＋ 理由**都写在**读数里**（不只写在票面 照 ㉑／㉕）。
// ③ **时延是数字** ＋ 口径写明（**非真浏览器** —— jsdom 而非真引擎/渲染器；与 `#877` 的纯判定数**不可比**）。
// ④ **能假的另一半**：合成一条死规则 → 页内那格**必须变**（不是常数）；真数据＝0 条 → 合成＝1 条。
// ⑤ **缺 vs 畸形分开**：缺 `rules.json` → **不适用**（不抛）／在册而 `rows` 不是数组 → **抛**。
// ⑥ **旧读数不留**（`#946` 同族）：抛之前那一格**已清** —— 否则读的人会把上次的当这次。
//
//注意：jsdom 收场纪律（本仓踩过）：`pretendToBeVisual` 用 **false** ＋ **显式** `window.close()` ＋ 最后**显式** `process.exit(rc)`。

import { readFileSync } from 'node:fs';
import { DEFAULT_SLUG } from '../scripts/dist-paths.mjs';   // `#1004` B2b：故事名走单一权威（旧故事已删）
import { JSDOM } from 'jsdom';
import { loadPackage } from '../editor/web/loader.mjs';
import { renderRuleRows, ruleRowFacts } from '../editor/web/rule-rows-view.mjs';
import { createContext } from '../scripts/audit/context.mjs';
import { fingerprintOf } from '../editor/lib/core/fingerprint.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const nodeIo = () => ({ readText: (p) => readFileSync(`${ROOT}/${p}`, 'utf8') });
// `#1004` B2b：旧故事已删 → 换到**默认故事**（＝面夹具 `face-fixture`，它把仍有真消费者的接入面都接上了）。
const slug = DEFAULT_SLUG;
const dom = new JSDOM('<!doctype html><body><pre id="out"></pre><pre id="rulediag"></pre></body>', { pretendToBeVisual: false });
let rc = 0;
try {
	let bad = 0;
	const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };
	const doc = dom.window.document;
	const pkg = loadPackage({ slug, io: nodeIo() });
	const text = () => doc.getElementById('rulediag').textContent;

	// ── ① 两侧同判（页内 ≡ CLI）───────────────────────────────────────────────
	const t0 = process.hrtime.bigint();
	const page = renderRuleRows({ doc, pkg });
	const pageMs = Number(process.hrtime.bigint() - t0) / 1e6;

	// CLI 侧：**门读的那份输入**（`ctx.window.Sg.story.rules()` —— 门 `run()` 里就是这么取的）
	const ctx = createContext({ story: slug });
	const cliRows = ctx.window?.Sg?.story?.rules?.() ?? [];
	const cliSha = fingerprintOf(cliRows);
	const cliFacts = ruleRowFacts({ rows: cliRows });

	console.log(`  · 页内（\`#rulediag\`）输入指纹 = ${page.rowsSha}（${page.rows.length} 行）`);
	console.log(`  · CLI 侧（\`Sg.story.rules()\`）输入指纹 = ${cliSha}（${cliRows.length} 行）`);
	t('① **两侧所判输入是同一份** ✓（sha 逐字节相等 ⇒ 页内判的不是"另一个包" ✓）', page.rowsSha === cliSha);
	t('① 页内**在读数里报出**所判输入的 sha ✓（不是只在本测试里算 ✓）', text().includes(page.rowsSha) && text().includes(`输入 rows ${page.rows.length} 行`));
	t('① **结论逐项相等** ✓（死规则／`prereq` 形状／并列 prio／算子行点名 四项 ✓）', JSON.stringify(page.facts) === JSON.stringify(cliFacts));
	t('① 真数据非空 ✓（否则这条读数是空的 ✗）', page.rows.length > 0);

	// ── ② 适用面在**读数里**（跑哪四步／不跑哪五步 ＋ 理由）────────────────────
	t('② 读数写明**页内跑的四步** ✓', /已上移 core 的四步/.test(text()) && /死规则/.test(text()) && /prereq/.test(text()) && /并列 prio/.test(text()) && /保守跳过/.test(text()));
	t('② 读数写明**不跑的五步 ＋ 归 CLI** ✓', /页内\*\*不跑\*\*/.test(text()) && /`text` 写侧/.test(text()) && /`scope` 机检/.test(text()) && /声明面/.test(text()) && /`yields` 路径/.test(text()) && /段落存在性/.test(text()) && /本件不适用 ✓（这一步在 CLI ✓）/.test(text()));
	t('② **"0 条 ≠ 没问题"写在读数里** ✓（㉑：不许把"部分"报成"全部"✓）', /上面四步/.test(text()) && /\*\*不等于\*\*这张表没问题/.test(text()) && /audit\.mjs --rules --check/.test(text()));

	// ── ④ 能假的另一半（刀）：合成死规则 → 页内那格必须变 ────────────────────
	{
		const synth = [
			{ id: 'A', scope: 'S', prio: 10, req: ['x'], text: 'a' },
			{ id: 'B', scope: 'S', prio: 20, req: [], text: 'b' },      // B 更宽 → A 死
			{ id: 'C', scope: 'S', prio: 20, req: [{ gte: ['y', 1] }], text: 'c' },   // 含算子 → 点名
		];
		const p2 = { data: { ...pkg.data, 'rules.json': { ...pkg.data['rules.json'], rows: synth } } };
		const r2 = renderRuleRows({ doc, pkg: p2 });
		t('④ **刀** ✗：合成一条死规则 ⇒ 页内那格**主读数从 0 变 1** ✓（不是常数 ✓）', r2.facts.dead.length === 1 && page.facts.dead.length === 0);
		t('④ 死规则**点名双方** ✓（`A` 被 `B` 覆盖 ✓）', r2.facts.dead[0].id === 'A' && r2.facts.dead[0].killedBy === 'B' && text().includes('「A」') && text().includes('「B」'));
		t('④ **两侧同判**在合成输入上也成立 ✓（CLI 侧同函数 ⇒ 同结论 ✓）', JSON.stringify(r2.facts) === JSON.stringify(ruleRowFacts({ rows: synth })));
		t('④ 含算子的行**点名而非静默** ✓（`C` ✓）', r2.facts.ops.includes('C') && text().includes('C'));
	}

	// ── ⑤ 缺 vs 畸形（两半都验）─────────────────────────────────────────────
	t('⑤ **缺** `rules.json` ⇒ **不适用**且**不抛** ✗（`hollow-cave`／`minimal-demo` 本来就没有 ✓）', (() => {
		const r3 = renderRuleRows({ doc, pkg: { data: { 'tables.json': {} } } });
		return r3.applicable === false && /本件不适用/.test(text()) && /不是/.test(text()) && !/死规则：0 条/.test(text());
	})());
	t('⑤ **畸形**（在册而 `rows` 不是数组）⇒ **讲人话地抛** ✓（缺≠畸形 ✓）', (() => {
		try { renderRuleRows({ doc, pkg: { data: { ...pkg.data, 'rules.json': { rows: 3 } } } }); return false; }
		catch (e) { return /rows/.test(String(e.message)) && /畸形|不是数组/.test(String(e.message)); }
	})());
	t('⑥ **旧读数不留** ✓：抛之前那一格**已被清** ✓（不含上一次的计数 ✓）', /未载入/.test(text()) && !/死规则：/.test(text()));

	// ── 容器缺失 → 抛（view 层约定）────────────────────────────────────────
	t('容器缺失 ⇒ **讲人话地抛** ✗（读数不该静默不显示 ✓）', (() => {
		try { renderRuleRows({ doc: new JSDOM('<div></div>').window.document, pkg }); return false; }
		catch (e) { return /#rulediag/.test(String(e.message)); }
	})());

	// ── ③ 时延是数字 ＋ 口径写明 ─────────────────────────────────────────────
	console.log(`  · 页内判定时延（node v${process.versions.node} ＋ jsdom，**非真浏览器** ✗）：${pageMs.toFixed(2)} ms`);
	console.log(`    ⚠️ 口径：这条**含 DOM 写入** ✓ ⇒ 与 \`#877\` 的**纯判定**数**不可比** ✗（那边不碰 DOM ✓）。`);
	t('③ 时延是数字 ✓（不是"很快"这种话 ✓）', Number.isFinite(pageMs) && pageMs >= 0);

	if (bad) { console.error(`\n✗ web-rule-rows 未通过（${bad} 项）`); rc = 1; }
	else console.log('\n✔ web-rule-rows 通过：**规则行**（页内跑已上移 core 的四步 ✗／`text` 写侧·`scope` 机检·声明面·`yields`·段落存在性只在 CLI ✗）—— 两侧同判 ＋ sha 双报 ＋ 适用面 ＋ 刀 ＋ 缺/畸形 ＋ 旧读数不留 ✓');
} catch (e) {
	console.error('✗ web-rule-rows 异常：', String(e?.message ?? e).slice(0, 200));
	rc = 1;
} finally {
	try { dom.window.close(); } catch { /* 已关 */ }
}
process.exit(rc);
