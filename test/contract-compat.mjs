#!/usr/bin/env node
// 车道 G 前半 · 切片 1c 读数（`#215` 报备 `18503697` / 开工报备 `18503987`；形状经 `18503703` 批准）：
// **`N-1` 兼容层的 上限 ＋ 退出条件（反向哨兵）** —— 只读 ＋ 只判本件自己的断言。
//
// 用法：`node test/contract-compat.mjs`
//
// **适用范围**（㉑／㉕ —— 先说不算什么）：
// ① **不交**"读 `N-1` 的字段映射"（今天**没有任何 `N-1` 的包** → 写了就是编）；
// ② 三件哨兵里，**"仓外还有旧包吗"判不了** → 那一半靠 `ticket` 的人审锚；
//「**一个发布周期**」**也判不了** → 写进 `reason`／`ticket`，**不假装能判**；
// ③ 本件判的是"**仓内**已无旧消费者、而条目还在 → 该删"。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { readStoryPackage } from '../editor/lib/core/story.mjs';
import { CURRENT } from '../editor/lib/core/contractVersion.mjs';
import { COMPAT_LIMIT, compatVersionsFor, requireCompatVersion, judgeCompatEntries, predicateKindOf, retireWhenMet, retireProblems, formatCompat } from '../editor/lib/core/contractCompat.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const io = { readText: (p) => readFileSync(`${ROOT}/${p}`, 'utf8'), exists: (p) => existsSync(`${ROOT}/${p}`) };

let rc = 0;
try {
	let bad = 0;
	const t = (label, ok) => { if (ok) console.log(`  ✓ ${label}`); else { bad += 1; console.error(`  ✗ ${label}`); } };
	const thrown = (fn) => { try { fn(); return null; } catch (e) { return String(e?.message ?? e); } };

	// ── 哨兵 ①：上限（正反两半）────────────────────────────────────────
	t(`① 正：上限 ＝ **${COMPAT_LIMIT} 代** ✓ ⇒ \`compatVersionsFor(3)\` ＝ \`[2]\` ✗（不返回更旧的 ✓）`, JSON.stringify(compatVersionsFor(3)) === JSON.stringify([2]));
	t('① 正：`compatVersionsFor(2)` ⇒ `[1]` ✓／`compatVersionsFor(1)` ⇒ `[]` ✓（没有更旧的可读 ✓）',
		JSON.stringify(compatVersionsFor(2)) === JSON.stringify([1]) && JSON.stringify(compatVersionsFor(1)) === JSON.stringify([]));
	t('① 正：`requireCompatVersion(2, 3)` ⇒ 放行 ✓', requireCompatVersion(2, 3) === 2);
	{
		const msg = thrown(() => requireCompatVersion(1, 3));
		t('① **反（能假的另一半）**：要读 `current-2` ⇒ **讲人话地抛** ✗ 且报文**点名「只保 1 代」** ✓', msg !== null && /只保 1 代/.test(msg));
	}
	t('① 反：`current` 非正整数 ⇒ 抛 ✓', thrown(() => compatVersionsFor(0)) !== null);

	// ── 哨兵 ②：条目必填（正反两半）────────────────────────────────────
	const good = { from: 1, reason: '演示：仓外旧包', ticket: '#0', retireWhen: { storiesAtLeast: 2 } };
	t('② 正：三条齐全 ⇒ **0 问题** ✓', judgeCompatEntries([good]).length === 0);
	for (const k of ['reason', 'ticket', 'retireWhen']) {
		const e = { ...good }; delete e[k];
		t(`② **反（能假的另一半）**：去掉 \`${k}\` ⇒ **点名** ✗`, judgeCompatEntries([e]).some((p) => p.kind === 'required' && p.field === k));
	}
	t('② 反：`retireWhen` 用**本件不认识的谓词** ⇒ 点名 ✗（认得少但认得准 ✓）',
		judgeCompatEntries([{ ...good, retireWhen: { whatever: 1 } }]).some((p) => p.kind === 'predicate'));
	t('② 反：`from` 非正整数 ⇒ 点名 ✗（旧方言号必须显式 ✓）', judgeCompatEntries([{ ...good, from: 0 }]).some((p) => p.kind === 'from'));
	t('② 反：`entries` 不是数组 ⇒ 点名 ✗', judgeCompatEntries('nope').some((p) => p.kind === 'shape'));

	// ── 哨兵 ③：反向哨兵（正反两半）────────────────────────────────────
	t('③ `retireWhenMet`：三故事**都 ≥ 2** ⇒ true ✓／有一个是 1 ⇒ false ✓（**不静默算过** ✗）',
		retireWhenMet({ storiesAtLeast: 2 }, [2, 2, 2]) === true && retireWhenMet({ storiesAtLeast: 2 }, [2, 1, 2]) === false);
	t('③ `retireWhenMet` 边界：故事号**读不出**（非整数）／列表为空 ⇒ **一律算未达** ✓（不静默算过 ✗）',
		retireWhenMet({ storiesAtLeast: 2 }, [null, 2]) === false && retireWhenMet({ storiesAtLeast: 2 }, []) === false);
	{
		const entries = [{ ...good, from: 0, retireWhen: { storiesAtLeast: 1 } }];
		const probs = retireProblems({ entries, storyVersions: [1, 1, 1], current: CURRENT });
		t('③ **正**：退出条件**已成立**（三故事都在 1 ✓）而条目还在 ⇒ **「该删了」** ✗（＝"登记腐烂 ⇒ 红"同构 ✓）',
			probs.some((p) => p.kind === 'retired') && /该删了/.test(probs.find((p) => p.kind === 'retired').detail));
	}
	t('③ **另一半（能假的另一半）**：同一条改成 `storiesAtLeast: 2`（尚未成立）⇒ **不报** ✓（**该留就留** ✗ —— 否则哨兵是个常数 ✓）',
		retireProblems({ entries: [{ ...good, from: 0, retireWhen: { storiesAtLeast: 2 } }], storyVersions: [1, 1, 1], current: CURRENT }).filter((p) => p.kind === 'retired').length === 0);
	t('③ 反（越出上限）：`from` 不在允许集内 ⇒ **点名** ✗（当前 1 ⇒ 可读（无）✓）',
		retireProblems({ entries: [{ ...good, from: 5 }], storyVersions: [1], current: CURRENT }).some((p) => p.kind === 'out-of-range'));
	t('③ **空表 ⇒ 0 条** ✓（合法半边 ✓ —— 否则是假红 ✓）', retireProblems({ entries: [], storyVersions: [1, 1, 1], current: CURRENT }).length === 0);

	// ── `{ external: …}` 谓词（经 `18504264` 裁「并进本片」）＋ `#952` MINOR 的报文闭环 ──
	{
		const ext = { ...good, ticket: '#9', retireWhen: { external: '仓外还有旧包（浏览器里存的）' } };
		t('`external` 正：带 `ticket` ⇒ **条目形式合法** ✓（0 问题 ✓）', judgeCompatEntries([ext]).length === 0);
		t('`external` 正：**恒不自动退场** ✓（`retireWhenMet` ⇒ false ⇒ **不会被打红** ✗ —— 仓外不可机检 ✓）',
			retireWhenMet(ext.retireWhen, [1, 1, 1]) === false && retireProblems({ entries: [ext], storyVersions: [1, 1, 1], current: CURRENT }).filter((p) => p.kind === 'retired').length === 0);
		const noTicket = [{ ...ext }]; delete noTicket[0].ticket;
		t('`external` **能假的另一半** ✓：去掉 `ticket` ⇒ **必红** ✗（机器只拦“**没票号的仓外理由**” ✓）；补回 ⇒ 绿 ✓',
			judgeCompatEntries(noTicket).some((p) => p.kind === 'required' && p.field === 'ticket') && judgeCompatEntries([ext]).length === 0);
		t('`predicateKindOf` 两类认得准 ✓：`storiesAtLeast` ⇒ 可机检／`external` ⇒ 不可机检；其余 ⇒ **null**（不猜 ✓）',
			predicateKindOf({ storiesAtLeast: 2 }) === 'storiesAtLeast' && predicateKindOf({ external: 'x' }) === 'external' && predicateKindOf({ whatever: 1 }) === null);
	}
	// `#952` 票内的复核 MINOR：报文里的可读集必须**算出来**，不得写死「（无）」 —— 本断言把它钉住
	{
		const p = retireProblems({ entries: [{ ...good, from: 1, retireWhen: { storiesAtLeast: 99 } }], storyVersions: [3], current: 3 }).find((x) => x.kind === 'out-of-range');
		t('`#952` MINOR 闭环 ✓：`current ＝ 3` 时报文写 **「可读 2」** ✗（不得写死「（无）」—— 那一支只为将来那个态存在 ✓）', Boolean(p) && /可读 2/.test(p.detail) && !/可读（无）/.test(p.detail));
	}

	// ── 真数据：登记表 ＋ 三故事的真号（发现式取故事 —— 不写死名单）──
	const registry = JSON.parse(readFileSync(`${ROOT}/editor/contract-compat.json`, 'utf8'));
	// `#1261` 零故事模式：`stories/` 目录可能不存在（demo 已下架、故事随 `#1163` 在 books 仓落地）
	// → 无样本时取空表并**明说**（不把 ENOENT 当异常抛出）。
	const __storiesDir = `${ROOT}/stories`;
	const slugs = (existsSync(__storiesDir) ? readdirSync(__storiesDir, { withFileTypes: true }) : [])
		.filter((d) => d.isDirectory()).map((d) => d.name)
		.filter((n) => existsSync(`${ROOT}/stories/${n}/00-story.json`)).sort();
	if (!slugs.length) console.log('  #1261 零故事模式：无故事样本 ⇒ 真数据段按空集核（样本随 #1163 回填）');
	const versions = slugs.map((s) => readStoryPackage({ slug: s, io }).meta?.contractVersion);
	console.log(`\n── 真数据 ✓ ──`);
	for (const line of formatCompat({ entries: registry.entries, current: CURRENT })) console.log(`  ${line}`);
	console.log(`  三故事的真号：${slugs.map((s, i) => `${s}=${versions[i]}`).join(' · ')} ✓`);

	t('真数据：登记表**今天为空** ✓ 且**零问题** ✓（空表合法 —— 经 `18503703` 明批 ✓）',
		Array.isArray(registry.entries) && registry.entries.length === 0 && judgeCompatEntries(registry.entries).length === 0 && retireProblems({ entries: registry.entries, storyVersions: versions, current: CURRENT }).length === 0);
	t('真数据：上限那半**如实反映现状** ✓ —— `compatVersionsFor(CURRENT)` ＝ `[]`（**今天没有更旧的方言可读** ✓）',
		JSON.stringify(compatVersionsFor(CURRENT)) === JSON.stringify([]));
	t('真数据：三故事都**读得出号** ✓（哨兵不会因"读不出"而假绿 ✓）', versions.every((v) => Number.isInteger(v)));
	t('登记表**自带为什么为空**的理由 ✓（空表不是没解释 ✗ —— 与 `escape-hatch.json` 的 `why_empty` 同款 ✓）',
		typeof registry.why_empty === 'string' && registry.why_empty.length > 20 && typeof registry['retireWhen_谓词'] === 'string');

	if (bad) { console.error(`\n✗ contract-compat 未通过（${bad} 项）`); rc = 1; }
	else console.log('\n✔ contract-compat 通过：**兼容层三件哨兵** ✓ —— 上限（只保 1 代 ✗）＋ 条目必填（reason/ticket/retireWhen ✓）＋ 反向哨兵（无旧消费者而条目还在 ⇒ 该删 ✗）；**今天空表 ＋ 规则先行** ✓，且**不假装能判仓外与发布周期** ✗');
} catch (e) {
	console.error('✗ contract-compat 异常：', String(e?.message ?? e).slice(0, 200));
	rc = 1;
}
process.exit(rc);
