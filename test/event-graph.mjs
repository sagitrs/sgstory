#!/usr/bin/env node
// 车道 D · 切片 2 读数（`#215` 报备 `18501384`）：**事件依赖的「键级图」** ✓ —— 只读 ✓，不判红 ✗。
//
// 用法：`node test/event-graph.mjs`（读数 ✓）／`--selftest`（合成用例 ✓）
//
// **适用范围** ✗（㉑：不许把"部分"报成"全图"✓）：本件只做**键级**结构 ✓ ——
//   不含**位置边**（schema 无 `next`／`goto` ✓）；授予面只含**事件声明**（`VOCAB.effects` 那几面 ✓），
//   **不含散文/段落里的写点**（属 `--state` 门 ✓）⇒ 因此本件的说法固定为「**事件声明面里**无人授予」✗，不说"不可达" ✗。

import { readFileSync } from 'node:fs';
import { graphOf, formatGraph, keysNeededBy, keysGrantedBy, COND_FIELDS } from '../editor/lib/core/eventGraph.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const readJson = (p) => JSON.parse(readFileSync(`${ROOT}/${p}`, 'utf8'));
const slug = 'mist-forest';
const rows = readJson(`stories/${slug}/data/rules.json`).rows;
const members = readJson(`stories/${slug}/data/contract.json`).members;

let rc = 0;
try {
	let bad = 0;
	const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };

	// ── 合成用例（能假的两半 ✓：正例 ＋ 反例 ✓）────────────────────────────────
	t('`keysNeededBy`：四个条件面都算 ✓（`req`／`any`／`exclude`／`prereq` ✓，`prio` 不算 ✗）',
		JSON.stringify(keysNeededBy({ req: ['a'], any: ['b'], exclude: ['c'], prereq: ['d'], prio: 3 })) === JSON.stringify(['a', 'b', 'c', 'd']));
	t('`keysNeededBy`：**对象算子形**也取到键 ✓（`{ gte: ["star.spent", 3] }` ⇒ `star.spent` ✓）',
		JSON.stringify(keysNeededBy({ req: [{ gte: ['star.spent', 3] }] })) === JSON.stringify(['star.spent']));
	t('`keysGrantedBy`：**按 `VOCAB.effects` 那几面**取 ✓（`gives` 也在内 ✓ —— 面名不写死 ✗）',
		JSON.stringify(keysGrantedBy({ yields: ['a'], gives: ['b'], sets: ['c'], other: ['nope'] })) === JSON.stringify(['a', 'b', 'c']));
	t('`keysGrantedBy` 反例 ✓：面名之外的字段**不取** ✗（`other` 不进 ✓）', !keysGrantedBy({ other: ['nope'] }).includes('nope'));
	{
		const g = graphOf({ rows: [{ id: 'e1', req: ['k1', 'k2'] }, { id: 'e2', yields: ['k1'] }], members: [{ path: 'k2' }, { path: 'k3', default: 0 }] });
		t('合成：`needs` 与 `grantedBy` 两张表**逐条对得上** ✓', JSON.stringify(g.needs) === JSON.stringify({ e1: ['k1', 'k2'] }) && JSON.stringify(g.grantedBy) === JSON.stringify({ k1: ['e2'] }));
		t('合成：`k1` 有授予 ⇒ **不进** `ungranted` ✓（`k2` 无授予 ＋ 落在 `contract.members` 面上且无 default ⇒ 进 ✓）',
			g.ungranted.length === 1 && g.ungranted[0].key === 'k2' && g.ungranted[0].inContractPaths === true && g.ungranted[0].hasDefault === false);
		// 刀：把一个授予删掉 ⇒ 那一项**必须**从"有授予"翻到"无授予" ✗（证明这列不是常数 ✓）
		const g2 = graphOf({ rows: [{ id: 'e1', req: ['k1', 'k2'] }, { id: 'e2' }], members: [{ path: 'k2' }, { path: 'k3', default: 0 }] });
		t('**刀**（合成）✗：删掉 `e2` 的授予 ⇒ `ungranted` 从 1 项变 **2** 项 ✓（不是常数 ✓）', g2.ungranted.length === 2);
	}

	// ── 真数据读数（`mist-forest` ✓）────────────────────────────────────────
	const g = graphOf({ rows, members });
	console.log(`\n── 真数据（${slug}）✓ ──`);
	for (const line of formatGraph(g)) console.log(`  ${line}`);
	t('真数据：事件数 ＝ 行数 ✓', g.counts.events === rows.length && rows.length > 0);
	t('真数据：**有需求的**事件数 > 0 ✓（否则这张图是空的 ✗）', g.counts.withNeeds > 0);
	t('真数据：每条 `needs` 都**真在某个条件字段里** ✓（抽回去能对上 ⇒ 不是编的 ✗）', Object.entries(g.needs).every(([id, ks]) => {
		const row = rows.find((r) => r.id === id);
		return ks.every((k) => COND_FIELDS.some((f) => (Array.isArray(row[f]) ? row[f] : [row[f]]).some((v) => JSON.stringify(v ?? '').includes(k))));
	}));
	t('真数据：**弱提示字段**名为 `inContractPaths` ✓（不许叫 `registered` ✗ —— 那会被读成"未登记"这个本件拿不到的判定 ✓）',
		g.ungranted.every((u) => 'inContractPaths' in u) && !('registered' in (g.ungranted[0] ?? {})));
	t('真数据：`grantedBy` 里的每个授予事件**确实**有那个字段 ✓（反查一致 ✓）', Object.entries(g.grantedBy).every(([k, ids]) => ids.every((id) => keysGrantedBy(rows.find((r) => r.id === id)).includes(k))));

	if (process.argv.includes('--selftest')) { console.log('\n（--selftest：只跑上面的合成与真数据读数 ✓）'); }
	if (bad) { console.error(`\n✗ event-graph 未通过（${bad} 项）`); rc = 1; }
	else console.log('\n✔ event-graph 通过：**键级图**（不含位置边 ✗／不含散文写点 ✗）—— 两张表逐条对账 ＋ 刀 ＋ 真数据 ✓');
} catch (e) {
	console.error('✗ event-graph 异常：', String(e?.message ?? e).slice(0, 200));
	rc = 1;
}
process.exit(rc);
