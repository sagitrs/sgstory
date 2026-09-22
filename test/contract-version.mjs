#!/usr/bin/env node
// 车道 G 前半 · 切片 1b 读数（`#215` 报备 `18503024`，设计要点经 `18503032` 批准）：
// **`contractVersion` ＝ "允许的全集"（包络）** —— 只读 ＋ 不判红（除本件自己的断言）。
//
// 用法：`node test/contract-version.mjs`
//
// **口径**（见 `core/contractVersion.mjs` 件头三条声明）：
// ① **单向** ⊆ 包络：故事形状必须 ⊆ `DECLARED`；全集外出现 → 红 → **必须显式改号**；
// ② **反向不判**（全集里没人用的项 → 只报读数 → 归 **G-2**）；**不读 `N-1`**（归 **G-1c**）；
// ③ **不覆盖非数组的嵌套结构**（`containers` 那类 → 本件不假装覆盖 —— 下面有**自证**那条）。
//
// **量化依据**（要留档）：`contract.json::members` 并集 **28** 个字段，而**三故事共有只有 4 个**
//（`kind`／`name`／`path`／`value`）→ **24 个故事特有** → "方言"是**包络**，不是"同形要求"（本件会打印这三个数）。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dialectOf } from '../editor/lib/core/dialect.mjs';
import { readStoryPackage, manifestFor } from '../editor/lib/core/story.mjs';
import { CURRENT, DECLARED, EXTENSIONS, checkDialect, judgeExtensions, judgeContractVersion, unusedDeclared, formatContractVersion } from '../editor/lib/core/contractVersion.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const io = { readText: (p) => readFileSync(`${ROOT}/${p}`, 'utf8'), exists: (p) => existsSync(`${ROOT}/${p}`) };

let rc = 0;
try {
	let bad = 0;
	const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };
	const has = (list, pred) => list.some(pred);

	// ── 合成：越界四类 ＋ 合法半边 ────────────────────────────────────────
	const over = checkDialect({ files: {
		'nope.json': { topKeys: ['section'], items: {} },
		'contract.json': { topKeys: ['members', 'section', 'brandNewTop'], items: { members: ['kind', 'brandNewField'], brandNewList: ['x'] } },
	} });
	t('合成：**全集外的字段** ⇒ 必报且点名 ✓', has(over, (p) => p.kind === 'field' && p.name === 'brandNewField' && p.list === 'members'));
	t('合成：**全集外的顶层键** ⇒ 必报 ✓', has(over, (p) => p.kind === 'topKey' && p.name === 'brandNewTop'));
	t('合成：**全集外的条目表** ⇒ 必报 ✓', has(over, (p) => p.kind === 'itemList' && p.name === 'brandNewList'));
	t('合成：**整件未声明** ⇒ 必报 ✓', has(over, (p) => p.kind === 'file' && p.name === 'nope.json'));
	t('合成：报告是**逐条**的 ✗（不合并成一句 ⇒ 4 类各 1 条 ✓）', over.length === 4);

	t('合成：**缺 ⇒ 不报** ✓（只报"全集外" ✗ —— 半个数据面照样合规 ✓）',
		checkDialect({ files: { 'contract.json': { topKeys: ['section'], items: {} } } }).length === 0);
	t('合成：**空包 ⇒ 不报** ✓', checkDialect({}).length === 0 && checkDialect({ files: {} }).length === 0);

	// ── 合成：号的判定 ────────────────────────────────────────────────────
	t('合成：**同号 ⇒ 零问题** ✓', judgeContractVersion({ slug: 'a', manifest: { contractVersion: CURRENT } }).length === 0);
	t('合成：**缺号 ⇒ 点名** ✓', has(judgeContractVersion({ slug: 'a', manifest: {} }), (p) => p.kind === 'missing'));
	t('合成：**号不是正整数 ⇒ 点名** ✓', has(judgeContractVersion({ slug: 'a', manifest: { contractVersion: '1' } }), (p) => p.kind === 'shape'));
	t('合成：**号比 `current` 旧 ⇒ 点名** ✓（本片只认同号 ✗ —— 读 `N-1` 归 G-1c ✓）',
		has(judgeContractVersion({ slug: 'a', manifest: { contractVersion: CURRENT } }, { current: CURRENT + 1 }), (p) => p.kind === 'stale'));
	t('合成：**号 < 1 或非整数 ⇒ 归 `shape`** ✓（先于 `stale` 判 ✓ —— 否则 `CURRENT−1` 在 1 时会绕着形状跑 ✗）',
		has(judgeContractVersion({ slug: 'a', manifest: { contractVersion: CURRENT - 1 } }), (p) => p.kind === 'shape'));
	t('合成：**号比 `current` 新（改了号却没改全集）⇒ 必红** ✓（㉗：这一刀打的是"全集与号是否同批改"那个面 ✓）',
		has(judgeContractVersion({ slug: 'a', manifest: { contractVersion: CURRENT + 1 } }), (p) => p.kind === 'stale'));

	// ── (β) 增面登记（经 `18504264` 裁定）：未登记 → 红；登记（含形状）→ 绿 ──
	{
		const withFace = { files: { 'newface.json': { topKeys: ['entries', 'section'], items: {} } } };
		t('**(β) ① 未登记的增面 ⇒ 必红且点名** ✗（牙：枚举里没名就拦 ✓ —— 增面≠放宽 ✓）',
			has(checkDialect(withFace), (p) => p.kind === 'file' && p.name === 'newface.json'));
		const E = [{ file: 'newface.json', topKeys: ['entries', 'section'], items: {}, reason: '合成面', ticket: '#1' }];
		t('**(β) ① 另一半** ✓：**登记后 ⇒ 绿**（同一条两个方向 ✓）', checkDialect(withFace, { extensions: E }).length === 0);
		t('**(β) ③ 登记面里再出没登记的顶层键 ⇒ 仍红** ✗（⇒ “登记一个面”不会被读成“这个面里什么都行” ✓）',
			has(checkDialect({ files: { 'newface.json': { topKeys: ['entries', 'section', 'sneaky'], items: {} } } }, { extensions: E }), (p) => p.kind === 'topKey' && p.name === 'sneaky'));
		t('**(β) ② 登记条目必填** ✓：`file`／`topKeys`／`items`／`reason`／`ticket` 缺一 ⇒ 各点名 ✗',
			['file', 'topKeys', 'items', 'reason', 'ticket'].every((k) => { const x = [{ ...E[0] }]; delete x[0][k]; return judgeExtensions(x).some((p) => (p.field ?? p.kind) === k || (k === 'file' && p.kind === 'file') || (k === 'topKeys' && p.kind === 'shape') || (k === 'items' && p.kind === 'shape')); }));
		t('**(β) 真数据：登记表合规** ✓（条目三条必填齐 ⇒ 0 问题 ✓；本片后 `EXTENSIONS` 非空 —— 车道 B 的 `notes.json` 已登记 ✓）',
			Array.isArray(EXTENSIONS) && EXTENSIONS.length >= 1 && judgeExtensions().length === 0);
		// ⛔ **退役 ＋ 声明**（`#1004` B2）：这一对的**真数据**半边
		// 原判据：`stories/mist-forest` 的 `data/notes.json` 是**已登记的增面**在真数据上的实例（"登记 → 不算增面"／"清表 → 当场红"两格都靠它）。
		// ⛔ 两存活样本**都没有 `notes.json`**（`dialect` 实测：两者都在册数里没它）→ 这两格**无对象**。
		// 同一对判据的**合成**半边仍在（上面 `withFace` ＋ `E` 那三格）→「登记 → 绿／未登记 → 红／登记面里再出未登记键 → 仍红」的**函数级**证据没丢；
		// 丢的是"这张表配**真包**也对"（真包侧的证据得等下一个带 NOTES 面的样本回来）。
		//注意：**声明**：**登记面（`EXTENSIONS`）与真数据的交叉核对自此无对象** —— 日后有故事带增面 → 照这里恢复。
	}

	// ── 覆盖边界自证：**不假装覆盖非数组的嵌套结构** ────────────────────
	t('**覆盖边界自证** ✓：`containers` 里塞一个新字段 ⇒ **本件不报** ✗（那是深嵌套对象 ✓，本件包络只量"数组条目的字段" ⇒ **如实不覆盖** ✓，不假装 ✓）',
		checkDialect({ files: { 'tables.json': { topKeys: ['containers', 'section'], items: {} } } }).length === 0);

	// ── 新故事也声明号（`manifestFor` 带上）────────────────────────────
	t('`manifestFor()` 产出的清单**自带 `contractVersion`** ✓（⇒ 页面新建的故事与既有故事同形 ✓）',
		manifestFor({ slug: 'x', twee: { '00-meta.twee': '' }, ifid: 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d' }).contractVersion === CURRENT);
	t('`manifestFor()` 产出的清单**自带 `audience`**（`#1035`）', manifestFor({ slug: 'x', twee: { '00-meta.twee': '' }, ifid: 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d' }).audience === 'content');

	// ── 真数据：**发现式**（不写死名单）──────────────────────────────────
	const slugs = readdirSync(`${ROOT}/stories`, { withFileTypes: true })
		.filter((d) => d.isDirectory()).map((d) => d.name)
		.filter((n) => existsSync(`${ROOT}/stories/${n}/00-story.json`)).sort();
	t(`发现式取故事 ✓：${slugs.join('、')}（${slugs.length} 个 ⇒ 新故事自动进本门 ✓）`, slugs.length >= 2);   // `#1004` B2：旧故事已删 → 基数下界从 3 跟到 **2**（本格证的是"发现式"，不是基数）

	const dialects = [];
	for (const slug of slugs) {
		const pkg = readStoryPackage({ slug, io });
		const d = dialectOf(pkg);
		dialects.push(d);
		const vProblems = judgeContractVersion({ slug, manifest: pkg.meta });
		const oProblems = checkDialect(d);
		t(`真数据（${slug}）：**号合规** ✓（contractVersion ＝ ${pkg.meta?.contractVersion} ⇔ CURRENT ＝ ${CURRENT} ✓）`, vProblems.length === 0);
		t(`真数据（${slug}）：**零越界** ✓（形状 ⊆ 全集 ✓ —— 合法半边，否则是假红 ✓）`, oProblems.length === 0);
	}

	// ── 量化依据（并集／共有／特有 —— 打印 ＋ 断言"并集 ⊆ 全集"）────────
	const union = new Set();
	const per = {};
	for (const [i, d] of dialects.entries()) {
		const fields = d.files['contract.json']?.items?.members ?? [];
		per[slugs[i]] = new Set(fields);
		fields.forEach((x) => union.add(x));
	}
	const all = [...union].sort();
	const common = all.filter((x) => slugs.every((s) => per[s].has(x)));
	console.log(`\n── 量化依据（contract.json::members ✓）──`);
	console.log(`  并集 ${all.length} · 现存故事共有 ${common.length}（${common.join('、')}）· 故事特有 ${all.length - common.length}`);
	t(`**并集 ⊆ 全集** ✓（${all.length} 个字段逐条落在 \`DECLARED\` 内 ✓）`, all.every((f) => DECLARED['contract.json'].items.members.includes(f)));
	//注意：`#1004` B2b：`face-fixture`（面夹具）进了本件的**发现式**名单（它现在是 `DEFAULT_SLUG`）
	// → 它的 `contract.json::members` 让并集 5 → **17**、共有 5 → **4**（`docs` 不再是共有 ——
	// 夹具声明的是**接入面的满配**，不是"照着旧故事的成员表抄"）→ 数字按**实测**重钉。
	// `#1186`：新增契约成员 `pcShape`（形状面）后，共有字段由 4 变 **5**（`docs` 也成了三故事共有）→ 按实测重钉。
	t('**现有字段逐字可核** ✓（`docs`／`kind`／`name`／`path`／`value` —— 量化依据落在读数里 ✓ 不只写在票面 ✓）',
		JSON.stringify(common) === JSON.stringify(['docs', 'kind', 'name', 'path', 'value']));

	// ── 反向：**只报不判**（归 G-2）────────────────────────────────────
	const unused = unusedDeclared(dialects);
	console.log(`  全集里**没有任何故事用到**的项：${unused.length} 项（**只报不判** ✗ —— 反向归 G-2 ✓）`);
	t('反向那半**本件不判红** ✓（`unusedDeclared` 只产出读数 ⇒ 它非空也不影响本门 rc ✓）', Array.isArray(unused));

	// ── **"改了号却不改故事"必须被抓**（真数据上的反向自证）────────────
	t('**真数据反向自证** ✓：把 `current` 抬到 `CURRENT+1` ⇒ **现存故事全部**报 `stale` ✗（"只改号不改两边"必被门抓 ✓）',
		slugs.every((s) => has(judgeContractVersion({ slug: s, manifest: readStoryPackage({ slug: s, io }).meta }, { current: CURRENT + 1 }), (p) => p.kind === 'stale')));

	console.log(`\n── 全局面（读数 ✓）──`);
	for (const line of formatContractVersion()) console.log(`  ${line}`);

	if (bad) { console.error(`\n✗ contract-version 未通过（${bad} 项）`); rc = 1; }
	else console.log('\n✔ contract-version 通过：**包络（允许的全集）** ✓ —— 单向 ⊆ ＋ 缺不报 ＋ 号三项 ＋ 覆盖边界自证 ＋ 新故事带号 ＋ 反向只报不判 ✓');
} catch (e) {
	console.error('✗ contract-version 异常：', String(e?.message ?? e).slice(0, 200));
	rc = 1;
}
process.exit(rc);
