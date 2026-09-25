// `#1350` 片 3 自证：`links[] → 规则行同形`（纯函数，零依赖 ⇒ 可在零故事态跑）。
import { linksToRows, mergeLinksIntoRules } from '../editor/lib/core/passages-links.mjs';

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
t('① 行数＝链接数（4）', rows.length === 4);
t('① `label`/`to` 编成 `text` 里的 `[[label|to]]`（维持现形态）',
	rows.some((r) => r.scope === '门厅' && r.text === '[[推门进去|里屋]]'));
t('① `cond` **原样**搬进行（`req` 不解、不改）',
	rows.some((r) => r.req && r.req.length === 1 && r.req[0] === 'inv:钥匙' && !('cond' in r)));
t('① `prio`／`prereq` 原样（顺序维）',
	rows.some((r) => r.id === '侧厅.右门' && r.prio === 2 && r.prereq?.[0] === '侧厅.左门'));
t('① `args` 透传（**片 4 消费**；本片不硬塞临时形状）', rows.some((r) => r.args?.提醒 === '别进屋'));
t('① `slot` 透传（片 4 落位用）', rows.some((r) => r.slot === '靴子口'));

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

if (bad) { console.error(`\n✗ 片3 自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ 片3 自证通过（links→rows 同形／缺件不造半截行／合成只追加）');
