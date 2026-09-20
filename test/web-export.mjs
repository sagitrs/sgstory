// `#1034`（甲案 · 导出下载接线）：把"导出"从"零件都在、没人接"变成**页面上真能用** ✓。
//
// 四条判据（都能是假的 ✓ —— 与票面「能假」栏对齐）：
//   ① **入口真在页面上** ✓：`index.html` 有 `#exportBtn` ✓、`app.mjs` 真把它接上 ✓（结构断言 ⇒ 删按钮或删接线就红 ✓）；
//   ② **导出物清单与实现一致** ✓：从**内核编目**（`packageFiles` ✓）推期望集 ⇒ 与实际下载集**逐件**比 ✓（票面那条 ✓）；
//   ③ **空包／部分包 ⇒ 必须报错** ✓（且在页面上看得见 ✓）：缺清单／缺数据面 ⇒ **点名** ✗；
//   ④ **不落盘** ✗：`app.mjs`／`save.mjs` 源里不得出现 `node:fs` ✗（与 `#892` 同一条机械判据 ✓）。
//
// ⚠️ 不引 jsdom：本片要测的是"接线与成套"，用一个**假 doc** 就够 ✓（真 DOM 无增益 ✗）；下载口**注入** ⇒ 也能假 ✓。

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { starterPackage, packageFiles, manifestFor } from '../editor/lib/core/story.mjs';
import { compileInPage } from '../editor/web/compile.mjs';
import { exportPackageFor, assertExportComplete, requiredExportParts } from '../editor/web/save.mjs';
import { exportCurrent, newPackage, currentNewPackage } from '../editor/web/app.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const IFID = '11111111-2222-4333-8444-555555555555';

let bad = 0, n = 0;
const t = (label, ok) => { n++; if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${label}`); };

// ── 假 doc（只实现本片真用到的面 ✓：取元素 ＋ 写文本 ✓）─────────────────────
const fakeDoc = (vals = {}) => {
	const els = new Map();
	const mk = (id) => { const el = { id, value: vals[id] ?? '', textContent: '' }; els.set(id, el); return el; };
	for (const id of ['newslug', 'newtitle', 'err', 'out', 'slug', 'wanted']) mk(id);
	return { els, doc: { getElementById: (id) => els.get(id) ?? null } };
};

// ── ① 入口真在页面上（结构）────────────────────────────────────────────
const html = readFileSync(join(ROOT, 'editor/web/index.html'), 'utf8');
const appSrc = readFileSync(join(ROOT, 'editor/web/app.mjs'), 'utf8');
t('#1034-① `index.html` 里**有**导出入口 `#exportBtn`', /id="exportBtn"/.test(html));
t('#1034-① `app.mjs` **真把** `#exportBtn` 接上（不是只放了按钮 ✗）', /getElementById\(.exportBtn.\)|\$\('exportBtn'\)\?\.addEventListener/.test(appSrc));

// ── ② 导出物清单与实现一致（逐件比 ✓）─────────────────────────────────
const slug = 'export-probe';
const st = starterPackage({ slug, title: '导出探针', entry: '开场', ifid: IFID });
const compiled = compileInPage({ slug, data: st.data });
const twee = { ...st.twee, ...compiled.files };
const manifest = manifestFor({ slug, title: '导出探针', entry: '开场', twee });
const out = exportPackageFor({ slug, data: st.data, twee, manifest });

const f = packageFiles(slug);
const want = [f.manifest, f.tweeFile('00-meta.twee'), ...compiled.names.map((x) => f.tweeFile(x)), ...Object.keys(st.data).map((x) => f.dataFile(x))].sort();
t('#1034-② 下载件集与**内核编目 ⊎ 生成物 ⊎ 数据面**逐件一致', [...out.written].sort().join('\n') === want.join('\n'));
t('#1034-② 清单解析回来 slug/文件表都在（不是"写了个空壳" ✓）', (() => { const m = JSON.parse(out.files[f.manifest]); return m.slug === slug && m.files.includes(`stories/${slug}/00-meta.twee`); })());
t('#1034-② 生成物**不是空**（空读数不许当通过 ✓）', compiled.names.length > 0 && Object.keys(st.data).length >= 3);
t('#1034-② 下载清单件名只取末段（浏览器下载不需要路径 ✓）', out.items.every((x) => !String(x.name).includes('/')) && out.items.length === out.written.length);

// ── ③ 空包／部分包 ⇒ 必须报错（且点名）──────────────────────────────────
const throws = (fn) => { try { fn(); return null; } catch (e) { return String(e?.message ?? e); } };
const m1 = throws(() => exportPackageFor({ slug, data: st.data, twee, manifest: null }));
t('#1034-③ 缺**清单** ⇒ 抛错且点名 `00-story.json`', Boolean(m1) && m1.includes('00-story.json'));
const noContract = { ...st.data }; delete noContract['contract.json'];
const m2 = throws(() => exportPackageFor({ slug, data: noContract, twee, manifest }));
t('#1034-③ 缺**数据面** `contract.json` ⇒ 抛错且点名', Boolean(m2) && m2.includes('contract.json'));
const m3 = throws(() => exportPackageFor({ slug, data: {}, twee: {}, manifest: null }));
t('#1034-③ **空包** ⇒ 抛错（"没写出东西"不许当通过 ✓）', Boolean(m3));
t('#1034-③ 成套判据的期望集与内核编目同源（5 件：清单＋入口＋3 数据）', requiredExportParts(slug).length === 5 && requiredExportParts(slug).every((x) => x.startsWith(`stories/${slug}/`)));
t('#1034-③ 直接调 `assertExportComplete`：齐全 ⇒ 原样返回 ✓', assertExportComplete({ slug, written: requiredExportParts(slug) }).length === 5);

// ── ④ 页面路：点导出 ⇒ 交下载口（注入假口 ⇒ 可假 ✓）＋ 不落盘 ✗ ──────
// ⚠️ 顺序有意义 ✓：**负控先跑** —— `currentNew` 是模块级态 ⇒ 若先建包，"没有包"这一态就再也测不到 ✗。
const empty = fakeDoc({});
const res2 = exportCurrent({ doc: empty.doc, download: () => 0 });
t('#1034-④ 负控：**没有包**时点导出 ⇒ 返回 null ＋ 页面上点名报错（不许静默 ✗）', res2 === null && empty.els.get('err').textContent.includes('还没可导出的包'));

const { els, doc } = fakeDoc({ newslug: slug, newtitle: '导出探针' });
newPackage({ doc, ifidOf: () => IFID });
t('#1034-④ 先有内存包（导出才有对象 ✓）', currentNewPackage()?.slug === slug);
const got = [];
const res = exportCurrent({ doc, download: (items) => { got.push(...items); return items.length; } });
t('#1034-④ 点导出 ⇒ 下载口**收到**与写路同数同名的件', res !== null && got.length === res.written.length && got.map((x) => x.name).sort().join() === res.items.map((x) => x.name).sort().join());
t('#1034-④ 页面显示"已交浏览器下载"（反沉默：不许点完没声 ✓）', els.get('out').textContent.includes('已交浏览器下载') && els.get('err').textContent === '');
// 结构判据：页面路**不碰 fs** ✗（与 `#892` 同款 ✓）
t('#1034-④ `app.mjs`／`save.mjs` 源里**没有** `node:fs`（静态优先 ⇒ 不落盘 ✓）', !/node:fs/.test(appSrc) && !/node:fs/.test(readFileSync(join(ROOT, 'editor/web/save.mjs'), 'utf8')));

console.log(`\n${bad ? '✗' : '✔'} web-export：${n - bad}/${n} 通过`);
process.exit(bad ? 1 : 0);
