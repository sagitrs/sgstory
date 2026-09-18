// `#761` P1 第一片：**DOM 胶水** ✓ —— 只做"取输入 ⇒ 调内核 ⇒ 显示"三件事 ✓。
// 判定与执行分离 ✓：真正的加载判定在 `./loader.mjs`（纯 ✓，已有单测 ✓）；本件**不含**任何判定逻辑 ✓，
// 所以它坏的结果只会是"显示不出来"，而不会产出**被判成结论的错数** ✓。
//
// ⚠️ **不许在这里长逻辑** ✗：凡是"什么算合法包／缺文件怎么办"这类问题，答案一律在内核（`lib/core/**` ✓）
// 或 `loader.mjs` ✓ —— 否则 WebUI 就成了第二个内核（正是 K6 那条机械门要防的 ✓）。

import { loadPackage, summaryLines, wantedPaths } from './loader.mjs';
import { diagnoseStory } from '../lib/core/diagnose.mjs';
import { diagnoseLines, renderDiagnosis } from './diagnose-view.mjs';
import { fingerprintOf } from '../lib/core/fingerprint.mjs';
import { starterPackage } from '../lib/core/story.mjs';
import { renderEventGraph, clearEventGraph } from './event-graph-view.mjs';   // 车道 D 切片 3（`#215` `18502113`）：键级图显示层 ✓
import { renderRuleRows } from './rule-rows-view.mjs';   // 车道 E-B2（`#215` 报备 `18502613`）：**规则行**显示层 ✓（判据在 `core/ruleRows.mjs` ✓ —— 页内不重写 ✗）

const $ = (id, doc = globalThis.document) => doc?.getElementById?.(id);

const render = (text, doc = globalThis.document) => { const el = $('out', doc); if (el) el.textContent = text; };
const fail = (msg, doc = globalThis.document) => { const el = $('err', doc); if (el) el.textContent = msg; };

const boot = () => {
	const slug = $('slug').value.trim() || 'minimal-demo';
	$('wanted').textContent = wantedPaths(slug).join('、');
	$('pick').addEventListener('change', () => {
		fail('');
		const files = [...($('pick').files ?? [])];
		if (!files.length) { render('（没选到文件）'); return; }
		try {
			const pkg = loadPackage({ slug, files });
			render(summaryLines(pkg).join('\n'));
			renderEventGraph({ doc, pkg });   // 键级图 ✓（判定在 core ✓；缺容器/缺数据 ⇒ 抛 ✗）
		} catch (e) {
			// 加载失败 ⇒ **原样报出** ✓（含内核的报文 ✓）—— 不许吞成"（空）" ✗
			render('（加载失败）');
			fail(String(e?.message ?? e));
			clearEventGraph({ doc });   // `#946`：失败时**清掉旧图** ✗（否则并排显示**上一个包**的图 ✓）
		}
	});
	$('slug').addEventListener('change', boot);
	$('newBtn')?.addEventListener('click', () => newPackage({ doc: document }));
};

// `#892`（P4-1）：页内**新建** ✓ —— 起手包**只落内存** ✓（不落盘 ✗）。
// 判定/模板一律在 core（`starterPackage()` ✓ ＋ `manifestFor()` ✓）；本件只做"取输入 ⇒ 调内核 ⇒ 显示" ✓（不长逻辑 ✗）。
// ⚠️ **IFID 在调用点生成** ✓（core 不碰随机源 ✗）：浏览器里用 `crypto.randomUUID()` ✓、测试注入夹具 ✓。
let currentNew = null;
/** 当前**内存里的**起手包（供继续编辑／后续保存片消费 ✓）。 */
export const currentNewPackage = () => currentNew;

/** 起手包（**内存** ✓）：读页面两个输入 ⇒ `starterPackage()`（core ✓）⇒ 显示四件 ⇨ 可继续编辑 ✓。
 *  出参 ＝ 内存里的包（`{slug, title, entry, ifid, data, twee}` ✓）；缺 slug ⇒ 只报错、不返回包 ✗（不静默兜默认 ✗）。 */
export const newPackage = ({ doc = globalThis.document, ifidOf = null, form = null } = {}) => {
	const slug = String(doc?.getElementById('newslug')?.value ?? '').trim();
	const title = String(doc?.getElementById('newtitle')?.value ?? '').trim() || '未命名故事';
	if (!slug) { fail('新建：请先填 slug（故事目录名 ✓ —— 清单的 slug 与 `Sg.storyId` 都由它来 ✓）', doc); return null; }
	const ifid = ifidOf ? ifidOf() : (globalThis.crypto?.randomUUID?.() ?? null);
	let st;
	try { st = starterPackage({ slug, title, ifid }); } catch (e) { fail(String(e?.message ?? e), doc); return null; }
	currentNew = { slug, title, entry: '开场', ifid, data: st.data, twee: st.twee };
	fail('', doc);
	render([
		`起手包（**内存** ✓ —— 还没落盘 ✗）：${slug}`,
		...['00-meta.twee', ...Object.keys(st.data).map((n) => `data/${n}`)].map((n) => `  · ${n}`),
		`IFID：${ifid}`,
		`数据面指纹：${fingerprintOf(st.data)}`,
		'⇒ 可继续编辑 ✓（表单已接到**同一份**纯逻辑上 ✓）；保存（写盘）是下一片的事 ✗',
	].join('\n'), doc);
	if (form?.handle?.load) form.handle.load({ slug, data: st.data });      // 「可继续编辑」✓（不另写一份编辑逻辑 ✗）
	return currentNew;
};

if (typeof document !== 'undefined') boot();

// P2 第三片（`#761`）：**编辑即诊断** ✓ —— 载入包后立刻把诊断写到页面上（**不落盘也能看见** ✗ ✓）。
//  判定**复用** `lib/core/diagnose.mjs` ✓（页内不重写 ✗）；本函数只做"算事实 ⇒ 交给显示层" ✓。
export const showDiagnosis = ({ doc, pkg, declared = ['data(包)'], skipped = [] } = {}) => {
	const findings = diagnoseStory({ data: pkg.data });
	const packageSha = fingerprintOf(pkg.data);
	const injectedSha = fingerprintOf({ ...pkg.data, __declared: declared.join('+') });
	const n = renderDiagnosis({ doc, containerId: 'out', lines: diagnoseLines({ findings, declared, skipped, packageSha, injectedSha }) });
	renderRuleRows({ doc, pkg });   // 车道 E-B2：**规则行那一路** ✓（与 `#out` 的故事面／`#graph` 的键级图**各占一格** ✗，不重叠 ✓）
	return n;
};
