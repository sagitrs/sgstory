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
import { DEFAULT_SLUG } from '../scripts/dist-paths.mjs';   // `#1004` B2b ✓：故事名走单一权威 ✓（旧故事已删 ✗）
import { JSDOM } from 'jsdom';
import { loadPackage } from '../editor/web/loader.mjs';
import { renderEventGraph, clearEventGraph } from '../editor/web/event-graph-view.mjs';
import { graphOf } from '../editor/lib/core/eventGraph.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const nodeIo = () => ({ readText: (p) => readFileSync(`${ROOT}/${p}`, 'utf8') });
// `#1004` B2b ✓：旧故事已删 ⇒ 换到**默认故事**（＝面夹具 `face-fixture` ✓，它把仍有真消费者的接入面都接上了 ✓）。
const slug = DEFAULT_SLUG;
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

	// ④ 刀 ✗：**加一条无人授予的需求** ⇒ 项数必须变 ✓
	// ⚠️ `#1004` B2b ✓：原写法是"把每行的 `yields` 抹掉" ✗ —— 而**面夹具**声明的规则行里
	//   **没有 `yields`** ✓ ⇒ 那一刀**砍空了** ✗（`map` 没改动任何一行 ⇒ 项数当然不变 ✓ ⇒ 假红 ✓）。
	//   ⇒ 按"**刀要砍在样本真有的东西上**"改 ✓：给首行**加一个谁都不授予的 `req`** ✓
	//   ⇒ `ungrantedItems` **必增 1** ✓（与样本内容无关 ✓，只要有 `rows` 就成立 ✓）。
	{
		const rows0 = pkg.data['rules.json'].rows;
		const rows2 = rows0.map((r, i) => (i === 0 ? { ...r, req: [...(r.req ?? []), '__t3_probe_ungranted__'] } : r));
		const g2 = renderEventGraph({ doc, pkg: { data: { ...pkg.data, 'rules.json': { rows: rows2 } } } });
		t('④ **刀** ✗：加一条无人授予的需求 ⇒ 页面那格的项数**变了** ✓（不是常数 ✓）', g2.counts.ungrantedItems > g.counts.ungrantedItems);
	}

	// ② 缺数据 ⇒ 抛（两半 ✓）
	t('② 缺 `rules.json` ⇒ **讲人话地抛** ✗（不许画空图 ✓）', (() => { try { renderEventGraph({ doc, pkg: { data: { 'contract.json': { members: [] } } } }); return false; } catch (e) { return /rules\.json/.test(String(e.message)); } })());
	t('② 缺 `contract.json` ⇒ 同样抛 ✓（能假的另一半 ✓）', (() => { try { renderEventGraph({ doc, pkg: { data: { 'rules.json': { rows: [] } } } }); return false; } catch (e) { return /contract\.json/.test(String(e.message)); } })());

	// `#946`：**旧图不许留** ✗ —— ① 入口先清 ⇒ 守卫抛了也不留旧图 ✓；② `clearEventGraph` 可单独清 ✓
	t('`#946` ①：先渲染好图，再用**缺数据**触发抛出 ⇒ 那一格**已被清** ✓（不含上一个包的计数 ✓）', (() => {
		renderEventGraph({ doc, pkg });   // 先摆一张**好图** ✓（前面 ② 的用例抛过 ⇒ 容器已被清 ✓）
		const before = text();
		try { renderEventGraph({ doc, pkg: { data: {} } }); } catch { /* 预期抛 ✓ */ }
		const after = text();
		return before.startsWith('事件 ') && !after.startsWith('事件 ') && /未载入/.test(after);
	})());
	t('`#946` ②：`clearEventGraph` 单独可用 ✓（页面的"载入失败"那一路就是调它 ✓）', (() => {
		clearEventGraph({ doc });
		return /未载入/.test(text()) && !text().startsWith('事件 ');
	})());
	t('`#946` ③ 能假的另一半 ✓：**重新载入好包 ⇒ 图必须回来** ✓（不是"清完就再也不显示"✗）', (() => {
		const g3 = renderEventGraph({ doc, pkg });
		return g3.counts.events > 0 && text().includes(`事件 ${g3.counts.events} ⇒`);
	})());

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
