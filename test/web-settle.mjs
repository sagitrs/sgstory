#!/usr/bin/env node
// 车道 D · `--settle` 页内接线读数（`#215` 报备 `18504699` ✓）：
// **落点文案（`--settle`）**那一面 —— 页内与 CLI **同判** ✓（同一份 `core/settleRows.mjs`）＋ **适用面写清** ✓。
//
// 判据（每条都能假 ✗）：
//   ① **两侧同判** ✓：页内 `#settle` 的结论 ≡ CLI 侧判据（**同一份** `editor/lib/core/settleRows.mjs` ✓：
//      门侧 import 证据 ＝ `stories/hollow-cave/gates/settle.mjs`（`const problems = settleProblems(src, p)` ✓）；
//      页侧 ＝ `editor/web/settle-view.mjs` ✓），且**两侧各自报出所判输入的 sha** ✓（页内报 `pkg.passages` ✓、
//      CLI 侧报本测试自己那份 `ctx.passageSrc` ✓ —— 门的输出**逐字节冻结**在 `test/audit-golden.json` ✓ ⇒ 不往门里加打印 ✗）。
//   ② **能假的一半** ✓：往合成包里**注入**一条「有副作用 ＋ 会离开 ＋ **没有**落点文案」的 `<<link>>` ⇒ 页内结论**必变** ✓（0 → 1）。
//   ③ **缺 vs 畸形分开** ✓：**没选到段落源**（只喂数据面 ✓）⇒ **不适用** ✗（**不抛** ✗、**不静默当 0 处** ✗）／
//      在册而 `passages` **不是数组** ⇒ **抛** ✓。
//   ④ **旧读数不留** ✓（`#946` 同族）：③ 那次抛之前那一格**已清** ✓（不留上一轮的行 ✗）。
//   ⑤ **时延是数字** ✓ ＋ 口径写明（**非真浏览器** ✗ —— jsdom；**含 DOM 写入** ⇒ 与 `#877` 纯判定数**不可比** ✗）。
//   ⑥ **适用面写清** ✓（㉑／㉕ ✓）：读数里必须写明「**同判据、同口径，但判的面可能不同**」✗（页内判**选中的文件** ✓、
//      CLI 判**清单声明的文件** ✓）＋「**机制面 `src/**` 不在页内**」✗ ＋「**注释已挖空**」✓。
//
// ⚠️ jsdom 收场纪律：`pretendToBeVisual` 用 **false** ＋ **显式** `window.close()` ＋ 最后**显式** `process.exit(rc)` ✓。

import { readFileSync, readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { loadPackage } from '../editor/web/loader.mjs';
import { renderSettle, settleFaceOf } from '../editor/web/settle-view.mjs';
import { settleProblems } from '../editor/lib/core/settleRows.mjs';
import { createContext } from '../scripts/audit/context.mjs';
import { fingerprintOf } from '../editor/lib/core/fingerprint.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const slug = 'hollow-cave';
/** 真文件 → 浏览器 File 形状（A 片取件面吃它 ✓；路径**规范成包内形** ✓）。 */
const pickedFiles = ({ withTwee = true } = {}) => {
	const dir = `${ROOT}/stories/${slug}`;
	const mk = (rel, abs) => ({ webkitRelativePath: `stories/${rel}`, name: rel.split('/').pop(), text: () => readFileSync(abs, 'utf8') });
	const out = readdirSync(dir).filter((n) => /\.(twee|json)$/.test(n)).map((n) => mk(`${slug}/${n}`, `${dir}/${n}`));
	out.push(...readdirSync(`${dir}/data`).map((n) => mk(`${slug}/data/${n}`, `${dir}/data/${n}`)));
	return withTwee ? out : out.filter((f) => !f.webkitRelativePath.endsWith('.twee'));
};

const dom = new JSDOM('<!doctype html><body><pre id="out"></pre><pre id="readfaces"></pre><pre id="settle"></pre></body>', { pretendToBeVisual: false });
const { window } = dom;
const doc = window.document;
let rc = 0;
try {
	let bad = 0;
	const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };
	const el = doc.getElementById('settle');

	// ── ① 两侧同判 ＋ sha 双报 ✓ ────────────────────────────────────────────────
	const pkg = loadPackage({ slug, files: pickedFiles() });
	const ctx = createContext({ argv: ['--story', slug], story: slug });
	const cliProbs = [];
	for (const [name, src] of [...(ctx.passageSrc ?? new Map()).entries()]) for (const p of settleProblems(src, name)) cliProbs.push(p);
	cliProbs.sort((a, b) => (a.site < b.site ? -1 : a.site > b.site ? 1 : 0));
	const t0 = performance.now();
	const res = renderSettle({ doc, pkg });
	const ms = performance.now() - t0;
	const pageProbs = res.problems ?? [];
	const sig = (ps) => JSON.stringify(ps.map((p) => [p.site, p.snippet]));
	t('① 两侧同判：页内结论 ≡ CLI 侧结论（同一份 core/settleRows）', sig(pageProbs) === sig(cliProbs));
	t(`① 两侧各自报出所判输入的 sha ✓（页内 ${res.inputSha?.slice(0, 8)}／CLI ${fingerprintOf([...ctx.passageSrc.keys()]).slice(0, 8)}）`, Boolean(res.inputSha) && ctx.passageSrc.size > 0);
	t('① 页内判的面：段落源齐（passages 非空 ⇒ applicable）', res.applicable === true && res.passages.length > 0);
	t(`① 两侧都为空集也算同判（判到 0 处 ≠ 没判 ✓：本次 ${pageProbs.length} 处 · 判了 ${res.files.length} 件 ${res.passages.length} 段）`, sig(pageProbs) === sig(cliProbs));
	// ⚠️ **空集上的"同判"不算证据** ✗（`#557` 口径：等价不能建立在空集上 ✓）⇒ 再拿**同一份合成本输入**喂两侧 ✓：结论须**非空且逐条相同** ✓。
	{
		const synText = ':: P1\n<<link "徒手撬">><<damage 3>><<caveNext>><</link>>\n:: P2\n<<link "撬一下">><<damage 2>><<set $pc.ev.settle to "撬不动。">><</link>>';
		const synMap = new Map([['P1', '<<link "徒手撬">><<damage 3>><<caveNext>><</link>>'], ['P2', '<<link "撬一下">><<damage 2>><<set $pc.ev.settle to "撬不动。">><</link>>']]);
		const cliSyn = [...synMap.entries()].flatMap(([n, s]) => settleProblems(s, n));
		const pageSyn = settleFaceOf([{ name: 'P1', file: `stories/${slug}/99-syn.twee`, text: synMap.get('P1') }, { name: 'P2', file: `stories/${slug}/99-syn.twee`, text: synMap.get('P2') }]).problems;
		t(`① **非空**上的同判（不靠空集充数 ✓）：两侧各 ${pageSyn.length} 处且逐条相同`, pageSyn.length === 1 && sig(pageSyn) === sig(cliSyn));
		void synText;
	}

	// ── ② 能假的一半：注入一条坏分支 ⇒ 结论必变 ✓ ────────────────────────────────
	const badSynthetic = { passages: [{ name: '机制·测试', file: `stories/${slug}/99-x.twee`, text: '<<link "徒手撬">><<damage 3>><<caveNext>><</link>>' }] };
	const injected = renderSettle({ doc, pkg: badSynthetic });
	t('② 注入「有副作用＋会离开＋无落点文案」⇒ 页内结论必变（0 → 1）', injected.problems.length === 1 && injected.problems[0].site === '机制·测试');
	t('② 注入的那格**写进了 DOM**（显示与判定同源 ✓）', el.textContent.includes('机制·测试'));
	const goodSynthetic = { passages: [{ name: '机制·测试', file: `stories/${slug}/99-x.twee`, text: '<<link "撬一下">><<damage 2>><<set $pc.ev.settle to "撬不动，手背破了。">><</link>>' }] };
	t('② 反例的一半：补上落点文案 ⇒ 不报（同一份判据 ✓）', renderSettle({ doc, pkg: goodSynthetic }).problems.length === 0);

	// ── ③ 缺 vs 畸形 ✓ ＋ ④ 旧读数不留 ✓ ──────────────────────────────────────
	const noSrc = renderSettle({ doc, pkg: loadPackage({ slug, files: pickedFiles({ withTwee: false }) }) });
	t('③ 没选到段落源 ⇒ **不适用**（不抛 ✗、不静默当 0 处 ✗）', noSrc.applicable === false && el.textContent.includes('本件不适用') && !el.textContent.includes('没落点文案的分支：0 处'));
	t('③ DOM 里明写「不是"落点文案都齐"」（不假装 ✓）', el.textContent.includes('不是') && el.textContent.includes('落点文案都齐'));
	renderSettle({ doc, pkg: badSynthetic });   // 先写上一次读数 ✓（制造"旧读数"）
	let threw = false;
	try { renderSettle({ doc, pkg: { passages: 'nope' } }); } catch { threw = true; }
	t('③ 在册而 `passages` 不是数组 ⇒ **抛**（畸形必须报 ✗）', threw);
	t('④ 抛之前那一格**已清**（不留上一轮的「机制·测试」✗，`#946` 同族）', !el.textContent.includes('机制·测试'));

	// ── ⑤ 时延是数字 ＋ 口径 ✓ ─────────────────────────────────────────────────
	t(`⑤ 时延是数字 ✓：${ms.toFixed(2)}ms（口径：jsdom **非真浏览器** ✗；**含 DOM 写入** ⇒ 与 \`#877\` 纯判定数**不可比** ✗）`, Number.isFinite(ms) && ms >= 0);

	// ── ⑥ 适用面写清 ✓（㉑／㉕）─────────────────────────────────────────────────
	const realText = (renderSettle({ doc, pkg }), el.textContent);
	t('⑥ 读数写明「同判据、同口径，**但判的面可能不同**」✗（页内＝选中的文件 ✓／CLI＝清单声明的文件 ✓）', realText.includes('面可能不同'));
	t('⑥ 读数写明「**机制面 `src/**` 不在页内**」✗', realText.includes('src/**') && realText.includes('不在页内'));
	t('⑥ 读数写明「**注释已挖空**」✓（与 `passageSrc` 同口径 ✗）', realText.includes('注释已挖空'));
	t('⑥ 读数写明覆盖率那条是**模块身份级代理** ✗（必要不充分 ✓）', realText.includes('模块身份级代理'));

	if (bad) { rc = 1; console.error(`\n✗ 落点文案读数未通过（${bad} 项）`); } else { console.log('\n✔ web-settle 通过：**落点文案**（页内与 CLI **同判** ✓／适用面 ＋ 面可能不同 ＋ 机制面 ＋ 注释口径写进读数 ✓）'); }
} finally {
	try { window.close(); } catch {}
}
process.exit(rc);
