// 车道 G 前半 · 切片 1a（`#215` 报备 `18502752`）：**方言指纹** ✓ —— 只读 ✓，**不写号** ✗。
//
// ⚠️ **适用范围（⑲／㉑：先说清"这个指纹是什么，不是什么"）** ✗：
//   ① 它量的是 **`data/**` 的"形状"** ✓ —— `{文件 → 顶层键集合}` ∪ `{文件 → item 字段集合}`（排序后 ✓）；
//      **不含值域、不含语义、不含行为** ✗（`kind` 有哪几种取值／某个字段的取值合不合法 ⇒ **都不是本件** ✗）。
//   ② 它**不是版本号** ✗ —— 本件**只算事实** ✓；"这个形状算第几代"归下一个切片（G-1b 的 `contractVersion` ✓）。
//   ③ 它**不是校验器** ✗ —— 不判红、不改数据 ✓（真畸形才报，见下方口径 ✓）。
//
// **缺 vs 畸形的口径** ✓（发起者 2026-09-18 15:05 的裁定 ✓，与 `core/diagnose.mjs` 同族 ✓）：
//   · **缺 ⇒ 合法状态** ✗（`rules.json` 只有 `mist-forest` 有 ✓ —— `hollow-cave`／`minimal-demo` **本来就没有** ✓）
//     ⇒ 不登记进指纹面、**不报** ✓（报"缺"会把合法状态说成错误 ✗）。
//   · **畸形 ⇒ 必须报** ✓（文件在、但不是普通对象；或某个"像条目表"的键装的东西不是对象 ✓）。
//   ⚠️ **本件做不到的一件事（如实写明 ✗）**：上游 `core/story.mjs` 的 `readStoryPackage` 把"**文件不在**"与
//     "**在但 JSON 坏**"**都**记成 `null` ✓ ⇒ 在 `null` 这一层**两者不可分** ✗ ⇒ 本件**不假装能分** ✓
//     （能分的是"存在且可解析 ⇒ 但形状不对"那一路 ✓ —— 那正是本件要报的畸形 ✓）。
//
// **承重口 vs 辅助读数** ✓（照 `core/fingerprint.mjs` 自己的"声明二" ✓ —— 承重与辅助不许混同 ✗）：
//   · **承重口 ＝ `dialectShapeOf()` 的串逐字节相等** ✓；
//   · **辅助读数 ＝ `dialectKeyOf()`**（32 位内容指纹，**弱在"假等"方向** ✗）。
//
// 复用 ✓：文件名单**取自** `core/story.mjs` 的 `DATA_FILES` ✓；指纹函数**取自** `core/fingerprint.mjs` ✓
//   （全仓唯一那把尺 ✓ —— 本件不另写第二份 ✗）。
// **浏览器安全** ✓：零宿主 import ✓（`core/**` 老规矩 ✓）。

import { DATA_FILES } from './story.mjs';
import { fingerprintOf } from './fingerprint.mjs';

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** 取一个文件的"形状" ✓；**缺（非对象）⇒ `null`** ✗（合法状态由调用点决定怎么记 ✓）。 */
const shapeOf = (obj) => {
	if (!isPlainObject(obj)) return null;
	const topKeys = Object.keys(obj).sort();
	const items = {};
	for (const k of topKeys) {
		const v = obj[k];
		if (!Array.isArray(v)) continue;
		const fields = new Set();
		for (const it of v) if (isPlainObject(it)) for (const f of Object.keys(it)) fields.add(f);
		items[k] = [...fields].sort();
	}
	return { topKeys, items };
};

/** **方言指纹** ✓：`{文件 → 顶层键集合}` ∪ `{文件 → item 字段集合}`（**逐项排序** ✗ ⇒ 与键序无关 ✓）。
 *
 *  `pkg` ＝ `loadPackage()` 的产物或任何带 `data` 的对象 ✓（`data['<文件名>']` 为 `undefined`／`null` ⇒ **视为缺** ✓）。
 *  返回 `{ files, problems, counts }` —— **不抛** ✗（"这个包有什么形状"是读数，不是判定 ✓）。
 */
export const dialectOf = ({ data = {} } = {}, { files = DATA_FILES } = {}) => {
	const out = {};
	const problems = [];
	for (const name of files) {
		const raw = data[name];
		if (raw === undefined || raw === null) continue;   // 缺 ⇒ 合法 ✓，登记面外 ✗、不报 ✓
		const shape = shapeOf(raw);
		if (!shape) { problems.push({ file: name, detail: `${name} 在，但不是普通对象 ✗（畸形的另一半 ✓）` }); continue; }
		for (const k of shape.topKeys) {
			const v = raw[k];
			if (!Array.isArray(v) || !v.length) continue;
			// 装了东西、但**一个对象都没有** ⇒ 形状可疑 ⇒ 报 ✓（装的是空数组 / 纯标量 ⇒ 不报：那是"合法空表" ✓）
			if (!v.some(isPlainObject)) problems.push({ file: name, detail: `${name}.${k} 装了 ${v.length} 项，但**没有一项是对象** ✗（"像条目表"却装不成条目 ✓）` });
		}
		out[name] = shape;
	}
	const present = Object.keys(out);
	return {
		files: out,
		problems,
		counts: {
			present: present.length,
			absent: files.length - present.length,
			topKeys: present.reduce((n, f) => n + out[f].topKeys.length, 0),
			itemLists: present.reduce((n, f) => n + Object.keys(out[f].items).length, 0),
			itemFields: present.reduce((n, f) => n + Object.values(out[f].items).reduce((m, a) => m + a.length, 0), 0),
			problems: problems.length,
		},
	};
};

/** **承重口** ✓：稳定形状串 —— "前后两版是不是同一方言"**以它逐字节相等为准** ✗（G-1b／G-1c 的落点 ✓）。
 *
 *  ⚠️ **它只对形状敏感** ✗：值的改动（新增一行规则、改一个 `default`）**不动形状串** ✓ —— 这是**故意的** ✓
 *  （协议号跟**契约**走，不跟**内容**走 ✓：后者由数据面内容哈希负责 ✓ ⇒ 两件事不许混成一个号 ✗）。
 */
export const dialectShapeOf = (d) => JSON.stringify(d?.files ?? {});

/** **辅助读数** ✓：形状串的**内容指纹**（**复用** `core/fingerprint.mjs` ✓ —— 不另造第二份哈希 ✗）。
 *  ⚠️ 只用它做"人看的短号"与"变了没"的快速判 ✓；**不要**拿它当"同一方言"的**唯一**证据 ✗
 *  （`fingerprint.mjs` 声明二：32 位 FNV **弱在"假等"方向** ✗ ⇒ 承重仍是形状串逐字节 ✓）。 */
export const dialectKeyOf = (d) => fingerprintOf(d?.files ?? {});

/** 读数行 ✓（**逐文件逐条**列 ✗ —— 不是只报个数 ✓）。 */
export const formatDialect = (d) => {
	const L = [];
	L.push(`方言：在册 ${d.counts.present} 件 · 缺 ${d.counts.absent} 件（**缺＝合法** ✗）· 顶层键 ${d.counts.topKeys} · 条目表 ${d.counts.itemLists} · 条目字段 ${d.counts.itemFields}`);
	for (const f of Object.keys(d.files).sort()) {
		const s = d.files[f];
		L.push(`  · ${f}：顶层 [${s.topKeys.join(', ')}]`);
		for (const k of Object.keys(s.items).sort()) L.push(`      ${k}[] 字段 [${s.items[k].join(', ')}]`);
	}
	for (const p of d.problems) L.push(`  ✗ ${p.detail}`);
	return L;
};
