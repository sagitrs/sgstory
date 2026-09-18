#!/usr/bin/env node
// P2 第三片（`#761`）**接线**读数 ✓：**不落盘也能看见** ✗ —— 坏包 ⇒ 页面当场点名 ✓；好包 ⇒ 说没问题 ✓
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { loadPackage } from '../editor/web/loader.mjs';
import { showDiagnosis } from '../editor/web/app.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const io = () => ({ readText: (p) => readFileSync(`${ROOT}/${p}`, 'utf8') });
let bad = 0;
const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };
const dom = new JSDOM('<pre id="out"></pre><pre id="rulediag"></pre><pre id="readfaces"></pre><pre id="settle"></pre>');   // 车道 E-B2／B-3／D：`#rulediag`／`#readfaces`／`#settle` 是新增的那三格 ✓（`showDiagnosis` 现在四格都写 ✓）
const doc = dom.window.document;
const pkg = loadPackage({ slug: 'mist-forest', io: io() });

// 好包 ⇒ 页面说"没有发现问题" ✓（能假的另一半 ✓）
t('好包 ⇒ 页面写"没有发现问题" ✓ 且**含声明面与两个 sha** ✓', (() => {
	showDiagnosis({ doc, pkg, declared: ['data(包)', 'entries'], skipped: [{ face: 'sources', cliHas: true }] });
	const txt = doc.getElementById('out').textContent;
	return txt.includes('没有发现问题') && txt.includes('输入面（声明 ✓）') && txt.includes('packageSha') && txt.includes('injectedSha');
})());

// 坏包（只改内存 ⇒ **没落盘** ✗ 也能看见 ✓）
t('**坏包（未落盘）⇒ 页面当场点名 `{event, field}`** ✓', (() => {
	const broken = { ...pkg, data: { ...pkg.data, 'rules.json': { ...pkg.data['rules.json'], rows: pkg.data['rules.json'].rows.map((r, i) => (i === 0 ? { ...r, text: '' } : r)) } } };
	showDiagnosis({ doc, pkg: broken, declared: ['data(包)'], skipped: [] });
	const txt = doc.getElementById('out').textContent;
	return txt.includes('.text') && txt.includes(pkg.data['rules.json'].rows[0].id) && txt.includes('处错误');
})());

// 容器缺失 ⇒ 讲人话地抛 ✓（不许静默丢诊断 ✗）
t('容器缺失 ⇒ **讲人话地抛** ✓', (() => {
	let m = ''; try { showDiagnosis({ doc: new JSDOM('<div></div>').window.document, pkg }); } catch (e) { m = String(e.message); }
	return m.includes('不存在');
})());
if (bad) { console.error(`\n✗ web-diagnose-wire 未通过（${bad} 项）`); process.exit(1); }
console.log('\n✔ web-diagnose-wire 通过（好包无问题 ✓ · 未落盘的坏包当场点名 ✓ · 容器缺失则抛 ✓）');
