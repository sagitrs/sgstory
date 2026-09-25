// `#1350` 片 3 自证：`links[] → 规则行同形`（纯函数，零依赖 ⇒ 可在零故事态跑）。

import { linksToRows, mergeLinksIntoRules, unmappedLinkFields, unreachablePassages } from '../editor/lib/core/passages-links.mjs';


let bad = 0;
const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad++; console.error(`  ✗ ${label}`); } };

// ① 正例：`label`→`text` 的 `[[label|to]]`；`cond` **原样**搬；`prio`／`prereq`／`args` 透传
const data = {
	门厅: { links: [
		{ label: '推门进去', to: '里屋', cond: { req: ['inv:钥匙'] }, args: { 提醒: '别进屋' } },
		{ label: '翻一翻靴子', to: '靴子', slot: '靴子口' },
	] },
	侧厅: { links: [
		{ id: '侧厅.左门', label: '推左门', to: '里屋', prio: 3 },
		{ id: '侧厅.右门', label: '推右门', to: '靴子', prio: 2, prereq: ['侧厅.左门'] },
	] },
};
const rows = linksToRows({ data });
// `#1350` 片 5 裁定：**带 `slot` 的链接不进规则行**（内联 ⊕ 段尾 ＝ 互斥的落位 ✓）
//  ⇒ 本样本 4 条链接里 1 条带 `slot`（`翻一翻靴子`）⇒ 入表 **3** 条 ✓
t('① 行数＝**不带 `slot`** 的链接数（3）', rows.length === 3);
t('① **不带 `args`** 的行：`label`/`to` 编成 `[[label|to]]`（维持现形态、逐字节不变）',
	rows.some((r) => r.id === '侧厅.左门' && r.text === '[[推左门|里屋]]'));
// ★ `#1350` 尾件 ⑥（实测缺陷：段尾块链接**收不到 args** —— `<<rulelist>>` 只 `wiki(row.text)`，
//   而 `[[label|to]]` 由 SugarCube 自产 ⇒ 链接上**没有** `data-sg-args` ⇒ 目标段 `<<printparam>>` 报"本次未传" ✗）
//   ⇒ 修的形态：**带 `args` 的行**在**编译期**就编成 `linkHtml(...)` 的 HTML（复用唯一权威 ⇒ ✗ 不在引擎里再造一份）
//     而**不带 `args` 的行一字不动** ⇒ 片 5 的两条验收（渲染文本同／外属性集合同）仍成立 ✓
t('① **带 `args`** 的行：`text` ＝ HTML（含 `data-sg-args`），✗ 不再是 `[[label|to]]`',
	rows.some((r) => r.scope === '门厅' && r.text.includes('data-sg-args') && !r.text.includes('[[')));
t('① 该 HTML **与 SugarCube 自产同形**（`class="link-internal"` ＋ `data-passage` ＋ `role="link"` ＋ `tabindex="0"`）',
	rows.some((r) => {
		const x = r.text;
		return x.includes('data-sg-args') && x.includes('class="link-internal"') && x.includes('data-passage="里屋"')
			&& x.includes('role="link"') && x.includes('tabindex="0"');
	}));
t('① `cond` **原样**搬进行（`req` 不解、不改）',
	rows.some((r) => r.req && r.req.length === 1 && r.req[0] === 'inv:钥匙' && !('cond' in r)));
t('① `prio`／`prereq` 原样（顺序维）',
	rows.some((r) => r.id === '侧厅.右门' && r.prio === 2 && r.prereq?.[0] === '侧厅.左门'));
t('① `args` 透传（**片 4 消费**；本片不硬塞临时形状）', rows.some((r) => r.args?.提醒 === '别进屋'));
t('① **带 `slot` 的链接不入表**（否则＝两处渲染 ✗）', !rows.some((r) => r.slot === '靴子口'));

// ★ `#1406` ①②（**引擎能力半**）：`links[]` 的**行效果**（`gives`/`sets`/`yields`）映射 ＋ **白名单外字段点名**
{
	const d2 = { 靴子: { links: [
		{ id: '靴子.收钥匙', label: '把钥匙收进口袋', to: '门厅', prio: 1, gives: ['黄铜钥匙'] },
		{ id: '靴子.许诺', label: '许个愿', to: '门厅', sets: ['许过愿'] },
		{ id: '靴子.记下', label: '记一笔', to: '门厅', yields: ['n_boot'] },
	] } };
	const r2 = linksToRows({ data: d2 });
	t('效果① `gives` **映射进规则行**（与规则行同语义、同求值处 ⇒ ✗ 不新造第二套施加器）',
		r2.some((r) => r.id === '靴子.收钥匙' && Array.isArray(r.gives) && r.gives[0] === '黄铜钥匙'));
	t('效果② `sets` 映射（状态键面 ✓）', r2.some((r) => r.id === '靴子.许诺' && r.sets?.[0] === '许过愿'));
	t('效果③ `yields` 映射（笔记面 ✓）', r2.some((r) => r.id === '靴子.记下' && r.yields?.[0] === 'n_boot'));
	t('效果④ 三个效果字段**逐字对应**（✗ 不改写、✗ 不合并不换名）',
		JSON.stringify(r2.find((r) => r.id === '靴子.收钥匙')?.gives) === JSON.stringify(['黄铜钥匙'])
		&& JSON.stringify(r2.find((r) => r.id === '靴子.许诺')?.sets) === JSON.stringify(['许过愿']));
	// ★ 泛化判据：白名单外字段（含**拼错**的形态）⇒ **点名**（✗ 不许静默丢弃）
	t('泛化① ★白名单外字段 ⇒ **点名**（实测病灶：`gives` 曾被静默丢弃且 problems=0 ✗）',
		(() => { const q = unmappedLinkFields({ links: [{ label: 'x', to: 'y', givse: ['钥匙'] }] });
			return q.length === 1 && /givse/.test(q[0]); })());
	t('泛化② **拼错**的形态也点名（`givse` vs `gives` ⇒ 提示相近的正确字段名）',
		(() => { const q = unmappedLinkFields({ links: [{ label: 'x', to: 'y', givse: [] }] });
			return q.length === 1 && /gives/.test(q[0]); })());
	t('泛化③ 白名单内字段 ⇒ **不报**（✗ 不误伤）',
		unmappedLinkFields({ links: [{ label: 'x', to: 'y', gives: [], sets: [], yields: [], cond: {}, prio: 1, prereq: [], args: {}, slot: 's', id: 'a' }] }).length === 0);
	t('泛化④ `links` 非数组 ⇒ 不报、不抛（纯函数稳）', unmappedLinkFields({ links: null }).length === 0);
}

// ② 反例（能假的另一半）：缺 `label` 或 `to` ⇒ **不产行**（✗ 静默造半截行）
const half = linksToRows({ data: { A: { links: [{ label: '只有标签' }, { to: '只有目标' }, { label: 'x', to: 'y' }] } } });
t('② 缺 `label`／`to` ⇒ 不产行（只留完整那条）', half.length === 1 && half[0].text === '[[x|y]]');
t('② 非对象/空 links ⇒ 0 行、不抛', linksToRows({ data: { A: {}, B: { links: null } } }).length === 0);

// ③ 合成：**不改既有 rows**，只追加（旧形态逐字不变 ✓）
const rules = { section: 'StoryRules', key: 'rules', rows: [{ scope: '门厅', text: '[[旧链接|旧目标]]' }] };
const merged = mergeLinksIntoRules({ rules, data: { 侧厅: { links: [{ label: '推左门', to: '里屋' }] } } });
t('③ 合成＝既有行原样保留 ＋ 新行追加（旧形态不变）',
	merged.rows.length === 2 && merged.rows[0].text === '[[旧链接|旧目标]]' && merged.rows[1].text === '[[推左门|里屋]]');
t('③ 段落数据为空 ⇒ **原样返回**（✗ 不造壳）', mergeLinksIntoRules({ rules, data: {} }) === rules);
t('③ 既有 rules 为 null 而段落数据有 ⇒ 造最小合法壳（section/key/rows）',
	mergeLinksIntoRules({ rules: null, data: { A: { links: [{ label: 'x', to: 'y' }] } } })?.section === 'StoryRules');

// ★ `#1401`（可达性，**引擎侧纯函数机制** —— 照 Operator 纪律：机制留引擎／✗ 不判故事策略）
{
	// ★ 关键（作者实测）：**出边分散在两处** —— `passages.json` 的 `links[].to` ＋ 规则行的 `[[label|to]]`。
	//   ⇒ 只算一处 ⇒ **不是漏报就是误报**：她实测"只算 `passages.json` 时**误报**「废哨站」"
	//     （因为指向它的边在 `data/rules.json` 的行里）✓
	const base = {
		入口: { links: [{ label: '去甲', to: '甲' }] },
		甲: { links: [] },
		乙: { links: [] },
	};
	const rules = { rows: [{ scope: '入口', text: '[[走乙|乙]]' }] };
	const r1 = unreachablePassages({ data: base, entry: '入口', rules });
	t('可达① 两处出边**都算**：甲（links 指向）与乙（规则行指向）**都可达** ⇒ 只报真死段 ✓',
		r1.length === 0, JSON.stringify(r1));
	const r2 = unreachablePassages({ data: { ...base, 丙: { links: [] } }, entry: '入口', rules });
	t('可达② ★真死段 ⇒ 点名（`丙`：无入边且非 entry）', r2.length === 1 && r2[0].includes('丙'), JSON.stringify(r2));
	t('可达③ ★**只算 links 会误报**（乙的入边在规则行里）—— 本格量"两处都看"的必需性',
		unreachablePassages({ data: base, entry: '入口', rules: { rows: [] } }).some((x) => x.includes('乙')));
	t('可达④ entry 自身**不算**死段 ✓', !unreachablePassages({ data: { 入口: { links: [] } }, entry: '入口' }).length);
	t('可达⑤ 传递可达（入口→甲→丁 ⇒ 丁可达）✓',
		unreachablePassages({ data: { 入口: { links: [{ label: 'a', to: '甲' }] }, 甲: { links: [{ label: 'b', to: '丁' }] }, 丁: { links: [] } }, entry: '入口' }).length === 0);
	t('可达⑥ 规则行的 `to` 也参与**传递**（规则行→段→links→…）✓',
		unreachablePassages({ data: { 入口: { links: [] }, 乙: { links: [{ label: 'c', to: '丙' }] }, 丙: { links: [] } },
			entry: '入口', rules: { rows: [{ scope: '入口', text: '[[去乙|乙]]' }] } }).length === 0);
	t('可达⑦ 自环／回边不误报（甲→甲）✓', unreachablePassages({ data: { 入口: { links: [{ label: 'x', to: '甲' }] }, 甲: { links: [{ label: 'y', to: '甲' }] } }, entry: '入口' }).length === 0);
	t('可达⑧ 空数据／无 entry ⇒ 返回空、不抛（纯函数稳）✓',
		unreachablePassages({ data: {}, entry: null }).length === 0 && unreachablePassages({}).length === 0);
}

if (bad) { console.error(`\n✗ 片3 自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 片3 自证通过（links→rows 同形／缺件不造半截行／合成只追加）');
