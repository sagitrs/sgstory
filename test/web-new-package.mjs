// `#892`（P4-1）：页内**新建**的读数 —— "起手包只落**内存**"这句话要能被量。
//
// 三条判据（都能是假的 —— 与 `#892` 票面的 ④ 对齐）：
// ① **入口真在页面上** ＋ 点出来的包是**四件**（`00-meta.twee` ＋ `data/{tables,contract,rules}.json`）；
// ② **没落盘**：整条页面路**不碰 fs**（本件用 jsdom → 本来也没有 fs → 额外作**结构性断言**：
// `editor/web/app.mjs` 与 `save.mjs` 的源里不得出现 `node:fs` —— 这条能假：加一句 import 就会红）；
// ③ **可继续编辑**：把**既有**表单句柄接上去 → 断言它拿到的 `data` 与 `starterPackage()` 的**逐字节同**
//（→ 没有第二份起手逻辑）。
//
//注意：jsdom 收场纪律（本仓踩过）：`pretendToBeVisual: false` ＋ 显式 `window.close()` ＋ 显式 `process.exit`。

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const ROOT = new URL('..', import.meta.url);
const HTML = readFileSync(new URL('../editor/web/index.html', import.meta.url), 'utf8');
const APP_SRC = readFileSync(new URL('../editor/web/app.mjs', import.meta.url), 'utf8');
const SAVE_SRC = readFileSync(new URL('../editor/web/save.mjs', import.meta.url), 'utf8');

let bad = 0;
const t = (label, ok, extra = '') => { if (ok) console.log(`      ✓ ${label}`); else { bad++; console.error(`      ✗ ${label}${extra ? '：' + extra : ''}`); } };

const dom = new JSDOM(HTML, { pretendToBeVisual: false });
const { window } = dom;
const { newPackage, currentNewPackage } = await import('../editor/web/app.mjs');
const { starterPackage, IFID_RE } = await import('../editor/lib/core/story.mjs');

t('① 页面上真的有「新建」入口（`#newBtn` ＋ 两个输入 ✓）',
	!!window.document.getElementById('newBtn') && !!window.document.getElementById('newslug') && !!window.document.getElementById('newtitle'));

// 注入夹具 IFID（core 不碰随机源 → 本地可复算）
const pkg = newPackage({ doc: window.document, ifidOf: () => 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d' });
t('① 点一下 ⇒ 内存里的**四件**（00-meta ＋ 三件 data ✓）',
	!!pkg && Object.keys(pkg.data).length === 3 && Object.keys(pkg.twee).join() === '00-meta.twee'
	&& ['tables.json', 'contract.json', 'rules.json'].every((n) => n in pkg.data),
	JSON.stringify(pkg && { data: Object.keys(pkg.data), twee: Object.keys(pkg.twee) }));
t('① 页面**显示**了"内存／还没落盘"（可见证据 ✓）', /内存|还没落盘/.test(window.document.getElementById('out').textContent));
t('① 夹具 IFID（**小写**输入）真的以**大写**进了产物 ✓（复核 MAJOR：小写 ⇒ extwee 拒 ⇒ rc=1 ✗）', /A1B2C3D4-5E6F-4A7B-8C9D-0E1F2A3B4C5D/.test(pkg.twee['00-meta.twee']));
t('① 产物里的 IFID 满足 **extwee 自己的那条正则**（同源核对：读 node_modules ✓ ⇒ 若 extwee 换标准即红 ✗）', (() => {
	const src = readFileSync(new URL('../node_modules/extwee/src/Twine2HTML/compile.js', import.meta.url), 'utf8');
	const m = /if \(story\.IFID\.match\(\/(.+?)\/\)/.exec(src);
	if (!m) return false;                                   // 找不到 extwee 的判据 → 宁可红（不静默跳过）
	const extwee = new RegExp(m[1]);
	const got = /"ifid": "([^"]+)"/.exec(pkg.twee['00-meta.twee'])?.[1] ?? '';
	return extwee.test(got) && extwee.source === IFID_RE.source;   // 双侧：**我们的**产物被 extwee 收 ＋ 两条正则同源
})());
t('① 非法 IFID（`nope`）⇒ 页面**报错**且不返回包（fail-loud ✓，不把失败推到 build 远处 ✗）', (() => {
	const r = newPackage({ doc: window.document, ifidOf: () => 'nope' });
	return r === null && /IFID/.test(window.document.getElementById('err').textContent);
})());
t('① 缺 slug ⇒ 返回 null ＋ 页面上有话（不静默兜默认 ✗）', (() => {
	const revert = window.document.getElementById('newslug').value;      //注意：用完**还原**（本件自己踩过：不还原 → 后面几条全 null）
	window.document.getElementById('newslug').value = '';
	const r = newPackage({ doc: window.document, ifidOf: () => 'X' });
	const spoke = /\S/.test(window.document.getElementById('err').textContent);
	window.document.getElementById('newslug').value = revert;
	return r === null && spoke;
})());
t('① 两条不同 IFID ⇒ `00-meta.twee` 逐字不同（照抄会撞 ✗）', (() => {
	const a = newPackage({ doc: window.document, ifidOf: () => 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d' });
	const b = newPackage({ doc: window.document, ifidOf: () => 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5e' });
	return a.twee['00-meta.twee'] !== b.twee['00-meta.twee'];
})());

t('② 页面路**不碰 fs** ✗（结构性断言：两件源里没有 `node:fs`）',
	!/node:fs|require\('fs'\)/.test(APP_SRC) && !/node:fs|require\('fs'\)/.test(SAVE_SRC));

const seen = [];
const fakeForm = { handle: { load: (p) => seen.push(p) } };
const pkg2 = newPackage({ doc: window.document, ifidOf: () => 'b2c3d4e5-6f7a-4b8c-9d0e-1f2a3b4c5d6e', form: fakeForm });
const st = starterPackage({ slug: pkg2.slug, title: pkg2.title, ifid: pkg2.ifid });
t('③ 「可继续编辑」✓：既有表单句柄被接到**同一份** data 上（逐字节同 ⇒ 没有第二份起手逻辑 ✗）',
	seen.length === 1 && JSON.stringify(seen[0]) === JSON.stringify({ slug: pkg2.slug, data: st.data }));
t('③ 内存里那枚包与返回值同一枚（供后续片消费 ✓）', currentNewPackage() === pkg2);

// ④ `save.mjs` 的**清单口**（`#892` 判据②在**页面保存路**上的落点）：传 → 写清单；不传 → **一件不多一件不少**
{
	const { savePackage } = await import('../editor/web/save.mjs');
	const { manifestFor } = await import('../editor/lib/core/story.mjs');
	const twee = { '00-meta.twee': pkg2.twee['00-meta.twee'] };
	const withM = savePackage({ slug: pkg2.slug, twee, manifest: manifestFor({ slug: pkg2.slug, title: pkg2.title, twee }) });
	const withoutM = savePackage({ slug: pkg2.slug, twee });
	t('④ `savePackage` 传 `manifest` ⇒ 写出 `stories/<slug>/00-story.json` ✓（且内容 = 那份清单 ✓）',
		withM.written.includes(`stories/${pkg2.slug}/00-story.json`) && JSON.parse(withM.files[`stories/${pkg2.slug}/00-story.json`]).slug === pkg2.slug);
	t('④ 不传 `manifest` ⇒ 写出的件**一件不多一件不少**（纯加法 ✓）',
		JSON.stringify(withoutM.written) === JSON.stringify(withM.written.filter((p) => !p.endsWith('00-story.json'))));
}

window.close();
console.log(bad ? `\n✗ web 新建包：${bad} 条未过` : '\n✔ web 新建包读数通过（入口 ✓ / 四件 ✓ / 不碰 fs ✓ / 可接既有表单 ✓）');
process.exit(bad ? 1 : 0);
