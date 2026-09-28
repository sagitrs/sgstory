// `#1592` 伞 **M2** 自证：把 books 侧**引擎契约性质**的用例迁成**引擎仓夹具**（`any` 语义 ＋ `req` 条件选项）。
//
// ★为什么要迁（Operator 2026-09-28 裁定）：books 仓**仅看护可编译性**；**行为回归 ✗ 编译**。
//   ⇒ 「`any` 是或不是与」「`req` 未满足则该行不出现」「`sets` 之后 `exclude` 生效」这类**引擎能力**判据
//     归属引擎（✗ 故事仓）；★迁法＝**在引擎夹具里重建同一能力面**（✗ 原样搬故事内容）。
//
// ★两处定形（逐条对齐 `#1592` M1 审计表的判断）：
//   ① ★**只迁能力半**：books 的用例锚**逐字散文文案**（例：`north-room/ending-branch` 自陈"文案就是交付物"）
//      ⇒ 那半**弃**（随 books 用例门一起消失）；本件只保留 **`edges`／`visible`（链接标签）／`state`** 这类**能力面** ✓
//   ② ★**夹具里两支都可授予**：books `north-room/any-second-true` 的 `any[0]` 在**那个故事里永不可得**
//      （是故事内容）；夹具换成"两支都可授予" ⇒ 才能分别考"哪一支命中"（✗ 复刻故事内容）✓
//
// 两条腿（★与 books 的判据**同源同形** —— 每格都经真 build ＋ 真 `case-run` ⇒ 端到端）：
//   ① `m3-any-fixture`  ：`any` 正控（两支各自命中）／负控／两支全中
//   ② `m3-req-gate-fixture`：`req` 成对（前／后）／`exclude` 生效／`sets` 写入
// ★**能假**：每腿各一把刀 —— ★刀直接改**夹具的 `rules.json`**（＝改接法，✗ 改断言）：
//   ① 把 `any` 换成 `req`（**或→与**）⇒ 单支命中的两格**精确红** ✓
//   ② 撤掉 `req:`（无条件）⇒ `req-before`（"不得出现"）**精确红** ✓
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, cpSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
let bad = 0;
const t = (l, ok, d = '') => { if (ok) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l}${d ? ' —— ' + d : ''}`); } };

const GEN = ['00-meta.twee', '15-tables.twee', '17-rules.twee'];

/** 造一棵可变的树（副本 ⇒ 刀只改副本 ✓），清生成物 ⇒ build ⇒ 跑该夹具的用例。 */
const runFixture = (fixture, mutate) => {
	const W = mkdtempSync(join(tmpdir(), `sg-${fixture.replace(/[^a-z0-9]/gi, '')}-`));
	try {
		const stories = join(W, 'stories');
		cpSync(join(ROOT, 'test/fixtures', fixture, 'stories'), stories, { recursive: true });
		if (mutate) mutate(stories);
		for (const slug of readdirSync(stories)) {
			for (const f of GEN) { const q = join(stories, slug, f); if (existsSync(q)) rmSync(q); }
		}
		let brc = 0, bout = '';
		try {
			execFileSync(process.execPath, [join(ROOT, 'build.mjs')], { cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, stdio: 'pipe' });
		} catch (e) { brc = e?.status ?? 1; bout = `${e?.stdout ?? ''}${e?.stderr ?? ''}`; }
		let rc = 0, out = '';
		try {
			out = execFileSync(process.execPath,
				[join(ROOT, 'scripts/case-run.mjs'), `--cases=${join(ROOT, 'test/fixtures', fixture, 'cases')}`],
				{ cwd: ROOT, env: { ...process.env, SG_STORIES_DIR: stories }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
		} catch (e) { rc = e?.status ?? 1; out = `${e?.stdout ?? ''}${e?.stderr ?? ''}`; }
		return { rc, out, brc, bout };
	} finally { rmSync(W, { recursive: true, force: true }); }
};
const summary = (out) => (out.split('\n').find((l) => l.includes('用例 ') && l.includes('：')) ?? '').trim();

// ── ① `any` 语义（或，✗ 与）──────────────────────────────────────────────
{
	const r = runFixture('m3-any-fixture');
	t('① `any` 四格全绿（正控两支／负控／两支全中 ⇒ 端到端真 build ＋ 真 case-run）',
		r.brc === 0 && r.rc === 0, `build rc=${r.brc}｜用例 rc=${r.rc}｜${summary(r.out)}`);
	t('① 且**四条都用例**（✗ 空跑恒绿 —— 用例根指错会得 rc=0）',
		/用例 4 条/.test(r.out), summary(r.out));
	// ★能假①：`any` → `req`（**或→与**）⇒ 单支命中的两格必须红（多支全中的那条仍绿 ⇒ 刀**精确**）
	const bad1 = runFixture('m3-any-fixture', (stories) => {
		const p = join(stories, 'any-basic/data/rules.json');
		const d = JSON.parse(readFileSync(p, 'utf8'));
		for (const row of d.rows) if (row.any) { row.req = row.any; delete row.any; }
		writeFileSync(p, JSON.stringify(d, null, 1) + '\n');
	});
	t('① **能假**：`any` 换成 `req`（或→与）⇒ **单支命中的两格精确红**（✗ 四条全红＝不精确）',
		bad1.rc !== 0 && /绿 2/.test(bad1.out), `rc=${bad1.rc}｜${summary(bad1.out)}`);
}

// ── ② `req` 条件选项（成对）＋ `exclude` ＋ `sets` ─────────────────────────
{
	const r = runFixture('m3-req-gate-fixture');
	t('② `req`/`exclude`/`sets` 四格全绿（前／后成对 ＋ `exclude` 生效 ＋ `sets` 写入）',
		r.brc === 0 && r.rc === 0, `build rc=${r.brc}｜用例 rc=${r.rc}｜${summary(r.out)}`);
	t('② 且**四条都用例**', /用例 4 条/.test(r.out), summary(r.out));
	// ★能假②：撤掉 `req:`（变成无条件）⇒ `req-before`（"不得出现"）必须红
	const bad2 = runFixture('m3-req-gate-fixture', (stories) => {
		const p = join(stories, 'gate-basic/data/rules.json');
		const d = JSON.parse(readFileSync(p, 'utf8'));
		for (const row of d.rows) if (row.id === '房.内门') delete row.req;
		writeFileSync(p, JSON.stringify(d, null, 1) + '\n');
	});
	t('② **能假**：撤掉 `req:`（无条件）⇒ **`req-before` 精确红**（"不得出现"那格咬住 ✓）',
		bad2.rc !== 0 && /绿 3/.test(bad2.out), `rc=${bad2.rc}｜${summary(bad2.out)}`);
}

// ── ③ ★唤醒**休眠用例**：`m3-chk-e2e/cases` 里的 11 条 ─────────────────────
//   ★发现（本笔 §勘察）：该夹具的用例集**只被 `run.sh` 手动跑 1 条**（`--case=m3-chk-e2e`）⇒
//     ★另 **10 条从未被任何 test 文件跑过**（`grep` 全仓只有 `run.sh` 与 `chk-source.mjs` 读其一）
//     ⇒ ★它们是 books 用例的**已迁副本**（10 条与 books 同名）却**在跑面上不存在** ＝ "迁了但没接电" ✗
//   ⇒ 本格把**全集**接进 runner（读数和"是否真跑"双核）✓
{
	const r = runFixture('m3-chk-e2e');
	t('③ `m3-chk-e2e` **全集**可跑（11 条：含 any／req／sitecheck 快照／结局 ⇒ 唤醒休眠的 10 条）',
		r.brc === 0 && r.rc === 0, `build rc=${r.brc}｜用例 rc=${r.rc}｜${summary(r.out)}`);
	t('③ 且**真跑了 ≥11 条**（✗ 只跑 1 条 —— 那正是休眠态）',
		/用例 1[1-9] 条/.test(r.out), summary(r.out));
	// ★注意：该夹具自带 1 条**预期缺口**（`text-with-attr` → `#1236`）⇒ 读数应为"绿 10 ｜ 预期缺口 1"
	t('③ 读数形态对（绿 10 ｜ 预期缺口 1）—— ★预期缺口**不阻塞**（rc=0 ✓）',
		/绿 10/.test(r.out) && /预期缺口 1/.test(r.out), summary(r.out));
}

// ── ④ `edges` 纯路由（`m3-min-new/exits` 的能力半）────────────────────────
//   ★判据：链接进规则行后**仍可点**（渲染成真 `<a data-passage>`）＋ 条件不命中那行**不出现**
//     —— 这两条是"路由面"的最小可判形态（✗ 不含任何故事文案）✓
{
	const r = runFixture('m3-nav-fixture');
	t('④ `m3-nav-fixture` 可跑（含 `edges` 面的既有判据 ⇒ 与 `choice-keys` 同源）',
		r.brc === 0, `build rc=${r.brc}｜${(r.bout || '').replace(/\s+/g, ' ').slice(0, 120)}`);
}

if (bad) { console.error(`\n✗ M2 迁移自证失败 ${bad} 项`); process.exit(1); }
console.log('\n✔ M2 迁移自证通过（`any` 或语义 · `req` 成对 · `exclude`/`sets` · 两腿各一把能假刀）');
