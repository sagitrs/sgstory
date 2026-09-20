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
import { renderReadFaces } from './read-faces-view.mjs';   // 车道 E-B3（`#215` 报备 `18504078`）：**读侧**（`--reads`）显示层 ✓（判据在 `core/stateDiagnose.mjs` ✓ —— 页内只跑 ① 条件表行级 ✗）
import { renderSettle } from './settle-view.mjs';
import { compileInPage } from './compile.mjs';        // `#1034`：导出要**生成物** ⇒ 页内编译（与 CLI 同一内核 ✓）
import { exportPackageFor } from './save.mjs';           // `#1034`：导出＝唯一写路 ＋ 成套断言 ＋ 下载清单 ✓
import { manifestFor } from '../lib/core/story.mjs';     // `#1034`：清单形状的唯一权威 ✓（页内不手拼 ✗）        // 车道 D·`#215` 报备 `18504699`：**落点文案**（`--settle`）显示层 ✓（判据在 `core/settleRows.mjs` ✓ —— 与 CLI 同一份 ✓）

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
			currentLoaded = { slug, title: pkg.meta?.title ?? '未命名故事', entry: pkg.meta?.entry ?? '开场', data: pkg.data, twee: (() => { const m = metaTextOf(files); return m ? { '00-meta.twee': m } : {}; })() };   // `#1034`：导出要用
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
	$('exportBtn')?.addEventListener('click', () => exportCurrent({ doc: document }));   // `#1034`：导出入口 ✓
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

// `#1034`（甲案 · 导出下载）：**入口接线** —— 把"内存里的包"经唯一写路导成**浏览器下载** ✓。
//  ① 目标包：**起手（内存）优先** ✓，否则用**载入的包** ✓；两个都没有 ⇒ 响亮报错（不静默兜默认 ✗）。
//  ② 生成物由 `compileInPage` 出 ✓（与命令体同一内核 ✓）；入口件 `00-meta.twee` 来自**包本身** ✓（生成物里没有它 ✗）。
//  ③ 清单由 `manifestFor` 出 ✓（形状的唯一权威 ✓）；④ 写＝`savePackage` ⇒ `exportPackageFor` ✓（唯一写路 ✗ 不另写 ✗）。
let currentLoaded = null;
/** 当前**载入的**包（供导出；起手包在 `currentNew` ✓）。 */
export const currentLoadedPackage = () => currentLoaded;

/** 从用户选的文件里取入口件原文 ✓（同步口径与 `loader.filesToIo` 同 ✓；取不到 ⇒ null ⇒ 由成套断言点名 ✗）。 */
const metaTextOf = (files = []) => {
	for (const f of files) {
		const n = String(f?.webkitRelativePath ?? f?.name ?? '');
		if (!n.endsWith('00-meta.twee')) continue;
		try { const t = typeof f.text === 'function' ? f.text() : String(f?.text ?? ''); return typeof t === 'string' ? t : null; } catch { return null; }
	}
	return null;
};

/** 浏览器默认下载口（**可注入** ⇒ 测试能假 ✓）：每件文本 ⇒ 一个 `<a download>` ✓。 */
export const downloadAll = (items = [], doc = globalThis.document) => {
	for (const it of items) {
		const a = doc.createElement('a');
		const blob = new globalThis.Blob([it.text], { type: 'text/plain;charset=utf-8' });
		a.href = globalThis.URL.createObjectURL(blob);
		a.download = it.name;
		a.click();
		globalThis.URL.revokeObjectURL(a.href);
	}
	return items.length;
};

/** `#1034` 入口：导出当前包 ⇒ 交浏览器下载 ✓。`download` 可注入（测试用假口 ✓）。
 *  失败一律**点名报出**（空包／缺件／编不出东西 ⇒ 进 `#err` ✓ —— 不许静默当成功 ✗）。 */
export const exportCurrent = ({ doc = globalThis.document, download = null } = {}) => {
	const pkg = currentNew ?? currentLoaded;
	if (!pkg) { fail('还没可导出的包 ✗：先「起手（新建）」或用文件选择器载入一个包', doc); return null; }
	try {
		const compiled = compileInPage({ slug: pkg.slug, data: pkg.data });
		const twee = { ...(pkg.twee ?? {}), ...compiled.files };     // 入口件（包）＋ 生成物（页内编译）✓
		const manifest = manifestFor({ slug: pkg.slug, title: pkg.title ?? '未命名故事', entry: pkg.entry ?? '开场', twee });
		const out = exportPackageFor({ slug: pkg.slug, data: pkg.data, twee, manifest });
		const n = (download ?? ((items) => downloadAll(items, doc)))(out.items);
		fail('', doc);
		render([...out.lines, `   ⇒ 已交浏览器下载：${n} 件 ✓（用户故事不进 git ✓ 请自行保存）`].join('\n'), doc);
		return out;
	} catch (e) {
		fail(String(e?.message ?? e), doc);   // 原样报出（含内核／成套断言的报文 ✓）
		return null;
	}
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
	renderReadFaces({ doc, pkg });   // 车道 E-B3：**读侧那一路** ✓（同上各占一格 ✗；页内只跑 ① 条件表行级 ＋ 适用面写进读数 ✓）
	renderSettle({ doc, pkg });      // 车道 D：**落点文案那一路** ✓（同上各占一格 ✗；与 CLI 同一份判据 ＋ 适用面写进读数 ✓）
	return n;
};
