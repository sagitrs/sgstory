// WebUI（`#761` P1 第五片）：**DOM 接线** —— 把页面上的那次编辑接到**同一份**纯逻辑上 ✓。
//
// 复核席给的三条"不许"（本件逐条遵守 ✓）：
//   ① **不自己算 diff** ✗ —— 显示什么**逐字**来自 `diffFields` ✓（DOM 层只搬运 ✓）；
//   ② **不引入新写路** ✗ —— 下载清单**只**从 `save.mjs` 来 ✓（⇒ 写仍唯一经 `writeStoryPackage` ✓）；
//   ③ **不新造 schema** ✗ —— 事件列表与字段**都从数据面来** ✓（`eventsOf` ✓）。
//
// 于是"页面上改的那次"与"测试里改的那次"**按构造是同一条路** ✓（没有第二份实现 ✓）。

import { eventsOf, editEvent, editEventField, fieldKindsOf, diffFields, editSummary } from './events.mjs';
import { vocabOf, vocabAxisForField } from '../lib/core/vocab.mjs';   // 车道 D 切片 1b：候选＝**词表镜像** ✓（映射声明在 core ✓ —— 本层不写死字段名 ✗）

/** **表单的字段区** ✓（P1 余项）：字段与类型**从 `fieldKindsOf` 来** ✗ —— DOM 层不写死任何 schema ✓。
 *  `list` 字段用**逐行文本框**（一列一项 ✓）＋ `text` 单行 ✓＋ `number` 数字框 ✓；`raw` 不渲染 ✗（不认识就不让改 ✓，并在提示里点名 ✓）。 */
export const buildEventForm = ({ doc, row, containerId = 'fields' } = {}) => {
	const box = doc.getElementById(containerId);
	if (!box) throw new Error(`表单容器 \`#${containerId}\` 不存在 ✗（表单不该静默只剩一半 ✓）`);
	box.innerHTML = '';
	const kinds = fieldKindsOf(row);
	for (const { name, kind } of kinds) {
		if (kind === 'raw') continue;
		const wrap = doc.createElement('label');
		wrap.textContent = `${name}（${kind}）`;
		const el = kind === 'list' ? doc.createElement('textarea') : doc.createElement('input');
		if (kind === 'number') el.type = 'number';
		el.id = `fld-${name}`;
		el.dataset.kind = kind;
		el.value = kind === 'list' ? (row[name] ?? []).join('\n') : String(row[name] ?? '');
		// 被**映射**的 `list` 字段 ⇒ 附 `<datalist>`（选项＝该轴词表 ✓，**逐值来自镜像** ✗ 不是另抄一份 ✓）；未映射 ⇒ 原样 ✗。
		const axis = kind === 'list' ? vocabAxisForField(name) : null;
		if (axis) {
			const dlId = `dl-${name}`;
			const dl = doc.createElement('datalist');
			dl.id = dlId;
			for (const v of vocabOf(axis)) { const opt = doc.createElement('option'); opt.value = v; dl.appendChild(opt); }
			box.appendChild(dl);
			el.setAttribute('list', dlId);
		}
		wrap.appendChild(el);
		box.appendChild(wrap);
	}
	return kinds.map((k) => k.name);
};

/** **从 DOM 自己读回** ✓（P1 余项的读数要求 ✓：提交的值必须是**表里实际填的** ✗，
 *  而不是某个测试变量的回放 ✓ —— 否则"映射"可能是**常数** ✓）。 */
export const readFormFields = ({ doc, containerId = 'fields', kinds } = {}) => {
	const box = doc.getElementById(containerId);
	if (!box) throw new Error(`表单容器 \`#${containerId}\` 不存在 ✗`);
	const out = {};
	for (const el of [...box.querySelectorAll('[data-kind]')]) {
		const name = el.id.replace(/^fld-/, '');
		const kind = el.dataset.kind;
		if (kind === 'list') out[name] = String(el.value ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
		else if (kind === 'number') out[name] = Number(el.value);
		else out[name] = String(el.value ?? '');
	}
	if (kinds && kinds.length !== Object.keys(out).length) throw new Error(`表单字段数与字段表不一致 ✗（表 ${kinds.length} / 读回 ${Object.keys(out).length}）`);
	return out;
};

/** 表单提交 ✓（**唯一编辑路** ✓：读回 ⇒ `editEvent` ✓ —— DOM 层不自己算差异 ✓）。 */
export const submitEventForm = ({ doc, pkg, id, containerId = 'fields' } = {}) => {
	const row = (pkg?.data?.['rules.json']?.rows ?? []).find((r) => r.id === id);
	if (!row) throw new Error(`事件不存在 ✗：${id}`);
	const fields = readFormFields({ doc, containerId, kinds: fieldKindsOf(row).map((k) => k.name) });
	const after = editEvent({ pkg, id, fields });
	return { fields, after, diffs: diffFields(pkg.data, after) };
};

import { compileInPage } from './compile.mjs';
import { savePackage, asDownloads, saveSummary } from './save.mjs';
import { loadPackage } from './loader.mjs';

/** 把表单接上 ✓。返回**可控句柄** ✓（测试驱动它，不必戳 DOM 细节 ✓）。
 *  `doc` ＝ 一个 `document`（浏览器里是 `window.document` ✓，测试里是 jsdom 的 ✓）⇒ 本件**不碰**全局 ✓。 */
export const wireForm = ({ doc, slug, io } = {}) => {
	const $ = (id) => doc.getElementById(id);
	const out = $('out');
	const err = $('err');
	let pkg = null;
	let lastEdit = null;

	const show = (text) => { if (out) out.textContent = text; };
	const fail = (msg) => { if (err) err.textContent = String(msg ?? ''); };
	const clear = () => { fail(''); lastEdit = null; };

	/** 载入（与 `app.mjs` 同一条读路 ✓）。 */
	const load = (loaded) => {
		pkg = loaded;
		clear();
		const events = eventsOf(pkg);
		const sel = $('event');
		if (sel) {
			sel.innerHTML = '';
			for (const e of events) {
				const o = doc.createElement('option');
				o.value = e.id;
				o.textContent = `${e.id}（${e.scope ?? '—'}）`;
				sel.appendChild(o);
			}
		}
		const fields = Object.keys(events[0]?.raw ?? {});
		const f = $('field');
		if (f) {
			f.innerHTML = '';
			for (const name of fields) {
				const o = doc.createElement('option');
				o.value = name;
				o.textContent = name;
				f.appendChild(o);
			}
		}
		show(events.length ? `已载入 ${events.length} 个事件 ✓（选一个、改一个字段）` : '（这个包里没有事件行 ✗）');
		return events;
	};

	/** ⚠️ **全部**编辑动作都走这一处 ✓（DOM 只是它的输入与输出 ✓）。 */
	const applyEdit = () => {
		clear();
		if (!pkg) { fail('还没载入故事包 ✗'); return null; }
		const id = $('event')?.value ?? '';
		const field = $('field')?.value ?? '';
		const value = $('value')?.value ?? '';
		try {
			const after = editEventField({ pkg, id, field, value });
			const diffs = diffFields(pkg.data, after);
			lastEdit = { before: pkg.data, after, diffs, id, field, value };
			// ① 显示**逐字**来自 `diffFields` ✓（DOM 层不加工 ✓；附一行 JSON 供测试读同一份 ✓）
			show(`${editSummary(diffs).join('\n')}\n@@JSON@@${JSON.stringify(diffs)}`);
			return lastEdit;
		} catch (e) {
			fail(e?.message ?? e);
			return null;
		}
	};

	/** 写盘 ＋ 下载清单 ✓（**唯一写路** ✓ —— 本件不碰 fs，也不另写一份 ✓）。 */
	const downloadsFor = () => {
		if (!lastEdit) return null;
		const saved = savePackage({ slug, data: lastEdit.after, twee: compileInPage({ slug, data: lastEdit.after }).files });
		return { saved, items: asDownloads(saved), lines: saveSummary(saved) };
	};

	const onPick = () => {
		const list = [...($('pick')?.files ?? [])];
		try { load(loadPackage({ slug, files: list, io })); } catch (e) { fail(e?.message ?? e); }
	};
	$('pick')?.addEventListener('change', onPick);
	$('apply')?.addEventListener('click', applyEdit);

	return { handle: { load, applyEdit, downloadsFor, shown: () => out?.textContent ?? '', error: () => err?.textContent ?? '', edit: () => lastEdit } };
};
