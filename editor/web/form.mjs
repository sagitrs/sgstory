// WebUI（`#761` P1 第五片）：**DOM 接线** —— 把页面上的那次编辑接到**同一份**纯逻辑上 ✓。
//
// 复核席给的三条"不许"（本件逐条遵守 ✓）：
//   ① **不自己算 diff** ✗ —— 显示什么**逐字**来自 `diffFields` ✓（DOM 层只搬运 ✓）；
//   ② **不引入新写路** ✗ —— 下载清单**只**从 `save.mjs` 来 ✓（⇒ 写仍唯一经 `writeStoryPackage` ✓）；
//   ③ **不新造 schema** ✗ —— 事件列表与字段**都从数据面来** ✓（`eventsOf` ✓）。
//
// 于是"页面上改的那次"与"测试里改的那次"**按构造是同一条路** ✓（没有第二份实现 ✓）。

import { eventsOf, editEventField, diffFields, editSummary } from './events.mjs';
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
