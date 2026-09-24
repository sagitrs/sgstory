#!/usr/bin/env node
// 车道 G 前半 · 切片 1a 读数（`#215` 报备 `18502752`）：**方言指纹** —— 只读，不判红。
//
// 用法：`node test/dialect.mjs`（读数 ＋ 合成用例）
//
// **适用范围**（㉑：不许把"形状"报成"语义"）：本件只量 `data/**` 的**形状**
//（`{文件 → 顶层键集合}` ∪ `{文件 → item 字段集合}`） —— **不含值域／语义／行为**；
// **不是版本号**（算号归 G-1b）；**不是校验器**（只有真畸形才报）。
//
// 口径（发起者 2026-09-18 15:05 裁定）：**缺 → 合法**（不报）；**畸形 → 必须报**。

import { readFileSync } from 'node:fs';
import { dialectOf, formatDialect, dialectShapeOf, dialectKeyOf } from '../editor/lib/core/dialect.mjs';
import { readStoryPackage, DATA_FILES } from '../editor/lib/core/story.mjs';
import { storySlugs, STORIES_DIR } from '../scripts/dist-paths.mjs';   // `#1267` 尾件②：枚举走生效根

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const io = { readText: (p) => readFileSync(`${ROOT}/${p}`, 'utf8') };

let rc = 0;
try {
	let bad = 0;
	const t = (label, ok) => { if (ok) console.log(`   ${label}`); else { bad += 1; console.error(`   ${label}`); } };

	// ── 合成用例（能假的两半：正例 ＋ 反例）────────────────────────────────
	const full = { data: { 'contract.json': { section: 's', members: [{ name: 'a', kind: 'k' }, { name: 'b', kind: 'k', path: 'p' }] } } };
	//注意：**显式给 `files`**：默认面是 `DATA_FILES`（会随新面增长）→ 用默认面写死数字会让本件变脆
	//（车道 B 加 `notes.json` 那回实测：`absent` 2 → 3 → 断言红。**断言绑在"面"上，不绑在"面有几个"上**）。
	const F3 = { files: ['tables.json', 'contract.json', 'rules.json'] };
	const d1 = dialectOf(full, F3);
	t('合成：顶层键与 item 字段**逐条对账** （`members[]`  并集 `[kind,name,path]` ）',
		JSON.stringify(d1.files['contract.json'].topKeys) === JSON.stringify(['members', 'section'])
		&& JSON.stringify(d1.files['contract.json'].items.members) === JSON.stringify(['kind', 'name', 'path']));

	t('合成：**缺  合法** （`tables.json`／`rules.json` 为 `null`／`undefined`  不在册、**不报** ）',
		d1.counts.present === 1 && d1.counts.absent === 2 && d1.problems.length === 0 && !('rules.json' in d1.files));

	t('合成：**合法空表**  不报 （`{ rows: [] }` 是"合法的空"，不是畸形 ）',
		dialectOf({ data: { 'rules.json': { section: 's', rows: [] } } }).problems.length === 0);

	// 畸形两半（发起者要求"缺与畸形分开" → 这是"畸形"那一半）
	t('合成：**畸形①**：在册但**不是普通对象**（`rules.json: []`） **必须报** （"缺"合法、"畸形"报  —— 两者分开 ）',
		dialectOf({ data: { 'rules.json': [] } }).problems.some((p) => /不是普通对象/.test(p.detail)));
	t('合成：**畸形②**：装了 3 项但**没有一项是对象**  **必须报** （"像条目表"却装不成条目 ）',
		dialectOf({ data: { 'rules.json': { rows: [1, 2, 3] } } }).problems.some((p) => /没有一项是对象/.test(p.detail)));

	// 刀：形状变了 → **承重口**（形状串）必变 ＋ **辅助读数**必变（证明它**量的是形状**，不是常数）
	{
		const before = dialectShapeOf(dialectOf(full));
		const mutated = { data: { 'contract.json': { section: 's', members: [{ name: 'a', kind: 'k', extra: 1 }] } } };
		t('**刀** ：往 `members[]` 塞一个字段  **形状串必变** （承重口  —— 不是常数 ）', dialectShapeOf(dialectOf(mutated)) !== before);
		t('**刀** （辅助）：同一变异  `dialectKeyOf` 也必变 ', dialectKeyOf(dialectOf(mutated)) !== dialectKeyOf(dialectOf(full)));
	}
	// 另一半：**只改值** → 形状串**不动**（号跟契约走、不跟内容走 —— 这条正是 G-1b/G-1c 的分界线）
	{
		const before = dialectShapeOf(dialectOf(full));
		const valueOnly = { data: { 'contract.json': { section: 's', members: [{ name: 'zzz', kind: 'k2', path: 'q' }] } } };
		t('**另一半** ：**只改值不改形状**  形状串**不动** （否则协议号会被内容拖着走 ）', dialectShapeOf(dialectOf(valueOnly)) === before);
		t('**另一半** （辅助）：同一变异  `dialectKeyOf` 也**不动** ', dialectKeyOf(dialectOf(valueOnly)) === dialectKeyOf(dialectOf(full)));
	}

	// ── 真数据读数（**仓内现存故事**；数字与形状都取自真文件）────────────────
	// `#1004` B2：旧故事已删 → 本表换成新样本的**实测值**（照旧“写死数字” ——
	// 这张表的价值就在“形状一变就红”，拿计算值去填就把它变成同义反复了）。
	const want = {
				// `#1216` B 半：去声明的成员里有带 `value` 的 const 族 条目字段**并集不再含 `value`**，
		// 故 8→**7**（同源见 `contract-version` 的共有字段 5→4）。按**实测**重钉（本件既有先例）。
		'minimal-demo': { present: 2, absent: 2, topKeys: 7, itemLists: 2, itemFields: 7 },
		// `#1138`：`contract.json` 新增一个成员（`codexItems`，带 `path`），故条目字段由 8 变为 13。
		// 变化原因明确（加了一个契约成员），不是形状走偏；其余四项（顶层键、在册数、条目表）均未变。
				'night-ferry': { present: 3, absent: 1, topKeys: 10, itemLists: 3, itemFields: 12 },
	};
	// `#1267` 尾件②：**枚举面走生效根**（`storySlugs()`），期望表只对**存在**的样本生效。
	// 样本缺席（例如 books 尚未提供该故事）→ 明说并跳过，而不是静默判红／判绿。
	const have = new Set(storySlugs());
	const judged = Object.keys(want).filter((s) => have.has(s));
	const absent = Object.keys(want).filter((s) => !have.has(s));
	if (absent.length) console.log(`  · 样本缺席（生效根下没有）⇒ 本件未判：${absent.join("、")}`);
	const fps = new Set();
	for (const slug of judged) {
		const d = dialectOf(readStoryPackage({ slug, io }));
		console.log(`\n── 真数据（${slug}） ──`);
		for (const line of formatDialect(d)) console.log(`  ${line}`);
		const w = want[slug];
		t(`真数据（${slug}）：在册 ${w.present}／缺 ${w.absent} · 顶层键 ${w.topKeys} · 条目表 ${w.itemLists} · 条目字段 ${w.itemFields} `,
			d.counts.present === w.present && d.counts.absent === w.absent && d.counts.topKeys === w.topKeys
			&& d.counts.itemLists === w.itemLists && d.counts.itemFields === w.itemFields);
		t(`真数据（${slug}）：**零畸形** （真数据里没有"在册但形状不对"的件 ）`, d.problems.length === 0);
		fps.add(dialectShapeOf(d));
	}
	t(`故事**两两不同** （${fps.size} 种形状串 —— 相同就说明这把尺子没分辨力 ；用**承重口**而不是 32 位指纹 ）`,
		fps.size === judged.length);
	// `#1267` 尾件②：仅当该样本在生效根下存在时才判（缺席 → 本件未判）。
	if (have.has('minimal-demo')) t('`rules.json` **缺席仍合法** ：`minimal-demo` 缺它  不在册且**不报** ',
		(h => h.counts.absent === 2 && h.problems.length === 0 && !('rules.json' in h.files))(dialectOf(readStoryPackage({ slug: 'minimal-demo', io }))));
	if (have.has('night-ferry')) t('`rules.json` **在册但空表** 也合法 ：`night-ferry` 有它、`rows` 为 `[]`  在册且**不报** （空≠畸形，两者分开 ）',
		(h => 'rules.json' in h.files && h.problems.length === 0)(dialectOf(readStoryPackage({ slug: 'night-ferry', io }))));

	t('口径面：本件不碰值域／语义 （`DATA_FILES` 取自 `core/story.mjs`  单一权威 ）',
		JSON.stringify(DATA_FILES) === JSON.stringify(['tables.json', 'contract.json', 'rules.json', 'notes.json']));

	if (bad) { console.error(`\n dialect 未通过（${bad} 项）`); rc = 1; }
	else console.log('\n✔ dialect 通过：**方言指纹**（形状面  —— 不含值域／语义／行为 ）—— 两张表逐条对账 ＋ 缺/畸形分开 ＋ 刀 ＋ 值变不动 ＋ 现存故事读数 ');
} catch (e) {
	console.error(' dialect 异常：', String(e?.message ?? e).slice(0, 200));
	rc = 1;
}
process.exit(rc);
