#!/usr/bin/env node
// 车道 D 切片 3 读数（`#215` 报备 `18502113`）：**键级图**的显示层 ✓ —— 页面那格与 `graphOf()` **同源** ✓。
//
// 判据（能假 ✗）：
//   ① 渲染出的**事件数／「无人授予」项数**与 `graphOf()` **逐条相等** ✓（不是常数 ✓）；
//   ② 缺数据（没 `rules.json`／`contract.json`）⇒ **讲人话地抛** ✗（**不许画空图** ✓ —— 空图会被读成"没有依赖"✗）；
//   ③ 容器缺失 ⇒ **讲人话地抛** ✗；
//   ④ **刀** ✗：删掉一个授予 ⇒ 页面那格的"无人授予"项数**必须变** ✓；
//   ⑤ 末行**自带适用范围**声明 ✓（㉑／㉕：把"部分"写进读数 ✓）。
//
// ⚠️ jsdom 收场纪律（本仓踩过 ✗）：`pretendToBeVisual` 用 **false** ＋ **显式** `window.close()` ＋ 最后**显式** `process.exit(rc)` ✓。

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { loadPackage } from '../editor/web/loader.mjs';
import { renderEventGraph } from '../editor/web/event-graph-view.mjs';
import { graphOf } from '../editor/lib/core/eventGraph.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const nodeIo = () => ({ readText: (p) => readFileSync(`${ROOT}/${p}`, 'utf8') });
const slug = 'mist-forest';
const dom = new JSDOM('<!doctype html><body><pre id="graph"></pre></body>', { pretendToBeVisual: false });
let rc = 0;
try {
	let bad = 0;
	const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };
	const doc = dom.window.document;
	const pkg = loadPackage({ slug, io: nodeIo() });

	// ① 与判定同源 ✓
	const text = () => doc.getElementById('graph').textContent;
	const g = renderEventGraph({ doc, pkg });
	const expect = graphOf({ rows: pkg.data['rules.json'].rows, members: pkg.data['contract.json'].members });
	t('① 返回的就是 `graphOf()` 的输出 ✓（**显示与判定同源** ✗ —— 页面没自己算一份 ✓）', JSON.stringify(g.counts) === JSON.stringify(expect.counts));
	t('① 文本里的事件数与项数**与它一致** ✓', text().includes(`事件 ${g.counts.events} ⇒ 有需求 ${g.counts.withNeeds}`) && text().includes(`「**事件声明面里**无人授予」 ${g.counts.ungrantedItems} 项`));
	t('① 真数据非空 ✓（否则这条读数是空的 ✗）', g.counts.events > 0 && g.counts.ungrantedItems > 0);

	// ⑤ 适用范围在读数里 ✓
	t('⑤ 末行**自带适用范围**声明 ✓（"键级图 ✗／不含位置边 ✗／不含散文写点 ✗" ✓）', /本图是\*\*键级\*\*图/.test(text()) && /不含位置边/.test(text()));

	// ④ 刀 ✗：删一个授予 ⇒ 项数必须变 ✓
	{
		const rows2 = pkg.data['rules.json'].rows.map((r) => (r.yields ? { ...r, yields: [] } : r));
		const g2 = renderEventGraph({ doc, pkg: { data: { ...pkg.data, 'rules.json': { rows: rows2 } } } });
		t('④ **刀** ✗：删掉一个授予 ⇒ 页面那格的项数**变了** ✓（不是常数 ✓）', g2.counts.ungrantedItems > g.counts.ungrantedItems);
	}

	// ② 缺数据 ⇒ 抛（两半 ✓）
	t('② 缺 `rules.json` ⇒ **讲人话地抛** ✗（不许画空图 ✓）', (() => { try { renderEventGraph({ doc, pkg: { data: { 'contract.json': { members: [] } } } }); return false; } catch (e) { return /rules\.json/.test(String(e.message)); } })());
	t('② 缺 `contract.json` ⇒ 同样抛 ✓（能假的另一半 ✓）', (() => { try { renderEventGraph({ doc, pkg: { data: { 'rules.json': { rows: [] } } } }); return false; } catch (e) { return /contract\.json/.test(String(e.message)); } })());

	// ③ 容器缺失 ⇒ 抛 ✓
	t('③ 容器缺失 ⇒ **讲人话地抛** ✗（图不该静默不显示 ✓）', (() => {
		try { renderEventGraph({ doc: new JSDOM('<div></div>').window.document, pkg }); return false; }
		catch (e) { return /#graph/.test(String(e.message)); }
	})());

	if (bad) { console.error(`\n✗ web-event-graph 未通过（${bad} 项）`); rc = 1; }
	else console.log('\n✔ web-event-graph 通过：**键级图**（不含位置边 ✗／不含散文写点 ✗）—— 显示与判定同源 ＋ 缺口两半 ＋ 容器缺失 ＋ 刀 ✓');
} catch (e) {
	console.error('✗ web-event-graph 异常：', String(e?.message ?? e).slice(0, 200));
	rc = 1;
} finally {
	try { dom.window.close(); } catch { /* 已关 */ }
}
process.exit(rc);
