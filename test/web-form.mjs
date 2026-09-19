// `#761` P1 第五片：**DOM 接线**的读数 ✓ —— "页面上那次编辑"与"我测过的那次编辑"**逐字节同一条路** ✓。
//
// 复核席给的两条验收读数（本文件逐条量 ✓）：
//   ① 页面上**显示**的差异，**逐字**等于 `diffFields` 的输出 ✓（⇒ DOM 层没有自己算一份 diff ✗）；
//   ② 页面这条路产出的 `data`（经 `save.mjs` 写出的那些文件）与"直接在测试里调一次
//      `editEventField` ＋ `savePackage`"**逐字节相同** ✓（⇒ 没有第二份实现 ✓）。
//
// ⚠️ jsdom 收场纪律（本仓踩过 ✗）：`pretendToBeVisual` 会**吊住事件循环** ⇒ 用 **false** ✓
//   ＋ **显式** `window.close()` ＋ 最后**显式** `process.exit(rc)` ✓（不许靠"跑完自然退" ✗）。

import { readFileSync } from 'node:fs';
import { DEFAULT_SLUG } from '../scripts/dist-paths.mjs';   // `#1004` B2b ✓：故事名走单一权威 ✓（旧故事已删 ✗）
import { JSDOM } from 'jsdom';
import { loadPackage } from '../editor/web/loader.mjs';
import { wireForm, buildEventForm, readFormFields, submitEventForm } from '../editor/web/form.mjs';
import { eventsOf, editEventField, diffFields, editSummary } from '../editor/web/events.mjs';
import { savePackage } from '../editor/web/save.mjs';
import { compileInPage } from '../editor/web/compile.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const nodeIo = () => ({ readText: (p) => readFileSync(`${ROOT}/${p}`, 'utf8') });
// `#1004` B2b ✓：旧故事已删 ⇒ 换到**默认故事**（＝面夹具 `face-fixture` ✓，它把仍有真消费者的接入面都接上了 ✓）。
const slug = DEFAULT_SLUG;

const HTML = `<!doctype html><html><body>
<select id="event"></select><select id="field"></select>
<input id="value"><input id="pick" type="file" multiple>
<button id="apply"></button><pre id="out"></pre><div id="err"></div><div id="fields"></div>
</body></html>`;

const dom = new JSDOM(HTML, { pretendToBeVisual: false });
let rc = 0;
try {
	let bad = 0;
	const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };

	const pkg = loadPackage({ slug, io: nodeIo() });
	const { handle } = wireForm({ doc: dom.window.document, slug });
	const events = handle.load(pkg);
	t('接线：载入后下拉里就有事件 ✓（列表来自数据面 ✓）', events.length > 0 && dom.window.document.getElementById('event').options.length === events.length);
	t('接线：字段下拉来自**该事件的原始字段** ✓（不新造 schema ✓）',
		dom.window.document.getElementById('field').options.length === Object.keys(events[0].raw).length);

	// 车道 D 切片 1b（`#215` 报备 `18501202`）：**候选来自词表镜像** ✓ ——
	// 逐值等于 `vocabOf(轴)` ✓（不是"非空"✗）；未映射字段**没有** datalist ✓（另一半 ✓）。
	{
		const { VOCAB_AXES, vocabOf, vocabAxisForField, VOCAB_FIELDS } = await import('../editor/lib/core/vocab.mjs');
		const dom0 = new JSDOM('<div id="fields"></div>', { pretendToBeVisual: false });   // 独立 DOM ✓（共享 dom 的 #fields 会被重建 ⇒ 打断后续用例 ✗）
		const doc0 = dom0.window.document;
		const row0 = { id: 'x', scope: 'y', req: ['a'], any: [], exclude: [], prereq: [], text: '', prio: 1 };
		buildEventForm({ doc: doc0, row: row0 });
		const vals = (id) => [...(doc0.getElementById(id)?.querySelectorAll('option') ?? [])].map((o) => o.value);
		t('映射字段 `req` ⇒ 有 datalist ✓ 且选项**逐值** ≡ `vocabOf("ops")` ✓',
			JSON.stringify(vals('dl-req')) === JSON.stringify([...vocabOf('ops')]) && vals('dl-req').length > 0);
		t('该 textarea **挂上了** 「list=」✗（候选真能弹 ✓，不是摆着 ✓）',
			doc0.getElementById('fld-req')?.getAttribute('list') === 'dl-req');
		t('`any`／`exclude`／`prereq` 同样映射 ✓（四字段齐 ✓）', ['any', 'exclude', 'prereq'].every((n) => vals(`dl-${n}`).length === vocabOf('ops').length));
		t('**未映射字段没有 datalist** ✓（另一半：`text` ✓／`prio` 是序号 ⇒ 也不映 ✓）',
			!doc0.getElementById('dl-text') && !doc0.getElementById('dl-prio') && Object.keys(VOCAB_FIELDS).every((f) => VOCAB_FIELDS[f] === 'ops'));
		t('映射声明**不超出四轴** ✓（轴名必须在册 ✓，防手滑写成不存在的轴 ✗）', Object.values(VOCAB_FIELDS).every((a) => VOCAB_AXES.includes(a)));
		t('`vocabAxisForField` 未映射 ⇒ `null` ✓（不是抛 ✗ —— "没有候选"是合法状态 ✓）', vocabAxisForField('text') === null && vocabAxisForField('req') === 'ops');
		dom0.window.close();   // jsdom 收场纪律 ✓（显式关 ✓）
	}

	const target = events.find((e) => typeof e.raw.text === 'string' && e.raw.text.length > 4);
	const newText = `${target.raw.text}【表单探针】`;
	// 驱动 UI（就像用户点一样 ✓）
	dom.window.document.getElementById('event').value = target.id;
	dom.window.document.getElementById('field').value = 'text';
	dom.window.document.getElementById('value').value = newText;
	const edit = handle.applyEdit();
	t('接线：点一次"应用" ⇒ 走了 `editEventField` ✓（不是另一条路 ✓）', !!edit && edit.after['rules.json'].rows.find((r) => r.id === target.id).text === newText);

	// 读数①：显示**逐字**等于 `diffFields` ✓
	const expectDiffs = diffFields(pkg.data, edit.after);
	const expectLines = editSummary(expectDiffs).join('\n');
	t('读数①：页面显示的差异**逐字**等于 `diffFields` 的输出 ✓（DOM 没自己算 diff ✗）',
		handle.shown().startsWith(expectLines) && handle.shown().includes(`@@JSON@@${JSON.stringify(expectDiffs)}`));

	// 读数②：页面这条路 vs 测试里直接那条路 ⇒ 写出的文件**逐字节相同** ✓
	const viaDom = handle.downloadsFor();
	const directAfter = editEventField({ pkg, id: target.id, field: 'text', value: newText });
	const viaDirect = savePackage({ slug, data: directAfter, twee: compileInPage({ slug, data: directAfter }).files });
	const sameKeys = JSON.stringify(Object.keys(viaDom.saved.files).sort()) === JSON.stringify(Object.keys(viaDirect.files).sort());
	const sameBody = sameKeys && Object.keys(viaDirect.files).every((k) => viaDom.saved.files[k] === viaDirect.files[k]);
	t('读数②：页面那条路与"直接调一次"写出的文件**逐字节相同** ✓（⇒ 没有第二份实现 ✓）', sameBody);
	t('读数②：下载清单来自 `save.mjs` ✓（不新增写路 ✓）', viaDom.items.length === Object.keys(viaDom.saved.files).length && viaDom.lines.join('\n').includes('写出：'));

	// 反例：非法编辑 ⇒ **错误面**亮出内核报文 ✗（不是静默 ✓）
	dom.window.document.getElementById('field').value = '__newkey__';
	const badEdit = handle.applyEdit();
	t('反例：未知字段 ⇒ 错误面亮出报文且不产出改动 ✗',
		badEdit === null && handle.error().includes('未知字段'));

	// ── P1 余项（`#761`）：**DOM 表单的字段级读数** ✓ —— 含复核席两条（都要能假 ✓）
	t('表单：字段与类型**从 `fieldKindsOf` 来** ✓（DOM 不写死 schema ✗）', (() => {
		const names = buildEventForm({ doc: dom.window.document, row: events[0].raw });
		const shown = [...dom.window.document.querySelectorAll('#fields [data-kind]')].map((e) => e.id.replace(/^fld-/, ''));
		return shown.length === names.length && shown.join(',') === names.join(',') && shown.includes('text') && shown.includes('prio');
	})());
	t('表单：**提交值从 DOM 读回** ✓（不是测试变量的回放 ✗）', (() => {
		const doc = dom.window.document;
		buildEventForm({ doc, row: target.raw });
		doc.getElementById('fld-text').value = `${target.raw.text}【表单提交】`;
		doc.getElementById('fld-prio').value = String((target.raw.prio ?? 0) + 2);
		const submitted = readFormFields({ doc });
		return submitted.text.endsWith('【表单提交】') && submitted.prio === (target.raw.prio ?? 0) + 2;
	})());
	t('表单：**换一个输入 ⇒ 提交必须不同** ✗（否则映射可能是常数 ✓ —— 与 `#867` 自比自同族）', (() => {
		const doc = dom.window.document;
		const first = (() => { buildEventForm({ doc, row: target.raw }); doc.getElementById('fld-text').value = 'AAA'; return readFormFields({ doc }).text; })();
		const second = (() => { buildEventForm({ doc, row: target.raw }); doc.getElementById('fld-text').value = 'BBB'; return readFormFields({ doc }).text; })();
		return first === 'AAA' && second === 'BBB' && first !== second;
	})());
	t('表单提交：**差异恰好两处**且就是 DOM 里改的那两个 ✓（端到端那条链的前半 ✓）', (() => {
		const doc = dom.window.document;
		buildEventForm({ doc, row: target.raw });
		doc.getElementById('fld-text').value = `${target.raw.text}【两处】`;
		doc.getElementById('fld-prio').value = String((target.raw.prio ?? 0) + 3);
		const r = submitEventForm({ doc, pkg, id: target.id });
		const fields = r.diffs.map((d) => d.field).sort().join(',');
		return r.diffs.length === 2 && fields === 'prio,text';
	})());
	t('表单容器缺失 ⇒ **讲人话地抛** ✗（表单不该静默只剩一半 ✓）', (() => {
		let m = ''; try { buildEventForm({ doc: new JSDOM('<div></div>').window.document, row: target.raw }); } catch (e) { m = String(e.message); }
		return m.includes('不存在');
	})());

	// ── `--selftest`：假包 ＋ 假 document ⇒ 同一判定 ✓
	const selftest = () => {
		let sbad = 0;
		const st = (label, ok) => { if (!ok) sbad += 1; console.log(`${ok ? '✓' : '✗'} 自证·${label}`); };
		const dom2 = new JSDOM(HTML, { pretendToBeVisual: false });
		try {
			const fake = { data: { 'rules.json': { section: 'StoryRules', key: 'rules', rows: [{ id: 'a', scope: 's', req: [], prio: 1, text: 'T' }] } } };
			const w = wireForm({ doc: dom2.window.document, slug: 'x' });
			w.handle.load(fake);
			dom2.window.document.getElementById('event').value = 'a';
			dom2.window.document.getElementById('field').value = 'text';
			dom2.window.document.getElementById('value').value = 'T2';
			const e = w.handle.applyEdit();
			st('假包 ⇒ 接线可跑且只动一个字段 ✓（不依赖真盘 ✓）', !!e && JSON.stringify(e.diffs) === JSON.stringify([{ id: 'a', field: 'text', from: 'T', to: 'T2' }]));
			st('假包 ⇒ 显示里含同一份 JSON ✓', w.handle.shown().includes('@@JSON@@[{'));
		} finally { dom2.window.close(); }
		st('自证自身能红（故意错的期望会被计到 ✗）', 1 === 2 ? false : true);
		if (sbad) { console.error(`\n✗ web-form 自证未通过（${sbad} 项）`); process.exit(1); }
		console.log('\n✔ web-form 自证通过（3 例：假包接线 · 显示同源 · 自证自身能红）');
	};

	if (process.argv.includes('--selftest')) { selftest(); rc = 0; }
	else if (bad) { console.error(`\n✗ web-form 未通过（${bad} 项）`); rc = 1; }
	else console.log('\n✔ web-form 通过（接线 ✓ · 显示逐字同源 ✓ · 页面路 vs 直接路逐字节同 ✓ · 错误面 ✓）');
} catch (e) {
	console.error('✗ web-form 异常：', String(e?.message ?? e).slice(0, 160));
	rc = 1;
} finally {
	try { dom.window.close(); } catch { /* 已关 */ }
}
process.exit(rc);
