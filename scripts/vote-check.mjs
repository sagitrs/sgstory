#!/usr/bin/env node
// 合入前的**机械核票**（§17 ㉙）—— 把"票齐"从**目视**变成**一条能粘的命令 ＋ 它打印出来的数**（㉚）。
//
// ## 为什么要它
// `#957` 那次：合入那一刻**只有一张票**，而**同一个命令块里就打印着票况** —— 不是信息缺失，
// 而是**判据之间标准不一**（CI／main／子 PR 当硬前置，票况却靠目视带过）。→ 本件把票况**做成判据**。
//
// ## 判据（三条，缺一不可）
// ① **`state == APPROVED`**（`COMMENTED`／`CHANGES_REQUESTED` 不算）；
// ② 该票**锚在当前 head**（`commit_id == headRefOid`）。
//注意：**本条只答"现在齐不齐"，不答"合入时齐不齐"**：**GitHub 会在 force-push 后把票锚重指到新 head**
//（实测：某票 `submitted_at` 早于 force-push 事件，而 `commit_id` 却是 push 后的头）→ ② **抓不到**"换内容却沿用旧票"；
// 那件事归 **㉗**（先做**带 pathspec 的 diff** 证明"验的就是被合的"）；本脚本**不假装**能判它。
// 另："别的 head → 要重投"那半句**在纯 rebase 下是错的补救**（纯 rebase 票沿用，见 `### 双席` #4）→ 故在输出里只作**提示**。
//（可选加强：把 `head_ref_force_pushed` 事件纳入 → 能判"换内容"→ 另开片，不在本件里夹带。）
// ③ **distinct 席数 ≥ want**（默认 2）—— **同一席投两次 ≠ 双席**（故按 `user.login` 去重）。
//
// ## 用法（可粘贴）
// node scripts/vote-check.mjs <PR> [--want=2] [--repo=<owner/name>] [--json]
// # 退 0 → 票齐，允许合入；退 1 → **停**（哪怕 CI／main／子 PR 全绿）
// node scripts/vote-check.mjs --selftest # 夹具自检（不起网络）
//
//注意：**前置**：需要 `gh` 已登录（`GH_TOKEN` 或 `gh auth`）；本脚本**只读**（不写仓、不改 PR）。

import { execFileSync } from 'node:child_process';

/** 从 reviews JSON 里数出**锚当前 head 的 APPROVED distinct 席**（纯函数 → 可单测）。 */
export const voteSummary = ({ reviews = [], head = '', want = 2 } = {}) => {
	const seats = [...new Set(reviews
		.filter((r) => r?.state === 'APPROVED' && r?.commit_id === head)
		.map((r) => r?.user?.login)
		.filter(Boolean))].sort();
	const otherHead = [...new Set(reviews
		.filter((r) => r?.state === 'APPROVED' && r?.commit_id && r.commit_id !== head)
		.map((r) => r?.user?.login)
		.filter(Boolean))].sort();
	return { head, want, seats, otherHead, ok: seats.length >= want };
};

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' });

const main = (argv = process.argv.slice(2)) => {
	if (argv.includes('--selftest')) return selftest();
	const num = argv.find((a) => /^\d+$/.test(a));
	if (!num) { console.error('用法：node scripts/vote-check.mjs <PR> [--want=2] [--repo=<owner/name>] [--json]'); return 2; }
	const wantArg = argv.find((a) => a.startsWith('--want='));
	const want = wantArg ? Number(wantArg.slice(7)) : 2;
	const repoArg = argv.find((a) => a.startsWith('--repo='));
	const repo = repoArg ? repoArg.slice(7) : 'sagitrs/sgstory';
	if (!Number.isInteger(want) || want < 1) { console.error(`✗ --want 只接受正整数（实得 ${wantArg}）✗`); return 2; }
	const head = run('gh', ['pr', 'view', num, '--repo', repo, '--json', 'headRefOid', '-q', '.headRefOid']).trim();
	const reviews = JSON.parse(run('gh', ['api', `repos/${repo}/pulls/${num}/reviews`, '--paginate']));
	const s = voteSummary({ reviews, head, want });
	if (argv.includes('--json')) console.log(JSON.stringify(s, null, '\t'));
	else {
		console.log(`PR#${num}（${repo}）head=${head.slice(0, 7)} ⇒ **锚当前 head 的批准票数 = ${s.seats.length}（distinct 席 ≥ ${want} 才算齐）**`);
		for (const n of s.seats) console.log(`  ✓ ${n}`);
		if (s.otherHead.length) console.log(`  ⚠️ 锚的是**别的 head**（不计入 ✓）：${s.otherHead.join('、')} —— 非纯 rebase 后要重投 ✓（㉗）`);
		console.log(s.ok ? '  ✅ 票齐 ⇒ 允许合入 ✓' : '  ⛔ 票不齐 ⇒ **停** ✗（哪怕 CI／main／子 PR 全绿 ✓）');
	}
	return s.ok ? 0 : 1;
};

/** 夹具自检（**能假**：三条判据各有一正一反）。 */
const selftest = () => {
	let bad = 0;
	const t = (label, ok) => { if (ok) console.log(`  ✓ 自证·${label}`); else { bad += 1; console.error(`  ✗ 自证·${label}`); } };
	const H = 'a'.repeat(40);
	const r = (login, state, commit_id = H) => ({ state, commit_id, user: { login } });
	t('正例：两席同锚 ⇒ 通过（ok=true ✓）', voteSummary({ reviews: [r('seat-d', 'APPROVED'), r('seat-t', 'APPROVED')], head: H, want: 2 }).ok === true);
	t('🔴 反例：**只有一席** ⇒ 拒（`#957` 那次就是这个）', voteSummary({ reviews: [r('seat-d', 'APPROVED')], head: H, want: 2 }).ok === false);
	t('🔴 反例：**同一席投两次** ⇒ 仍只有 1 席（distinct ✗）', voteSummary({ reviews: [r('seat-d', 'APPROVED'), r('seat-d', 'APPROVED')], head: H, want: 2 }).seats.length === 1);
	t('🔴 反例：票**锚在旧 head** ⇒ 不计入 ✓（并把它列到"别的 head"里 ✓）', (() => { const s = voteSummary({ reviews: [r('seat-d', 'APPROVED'), r('seat-t', 'APPROVED', 'b'.repeat(40))], head: H, want: 2 }); return s.ok === false && s.seats.length === 1 && s.otherHead.length === 1; })());
	t('反例：`CHANGES_REQUESTED`／`COMMENTED` 不算票 ✗', voteSummary({ reviews: [r('seat-d', 'APPROVED'), r('seat-t', 'CHANGES_REQUESTED'), r('seat-x', 'COMMENTED')], head: H, want: 2 }).seats.length === 1);
	t('边界：`want=1` ⇒ 一席即过 ✓（Trivial 面用得上 ✓）', voteSummary({ reviews: [r('seat-d', 'APPROVED')], head: H, want: 1 }).ok === true);
	t('边界：无票 ⇒ 0 席且 ok=false ✓', (() => { const s = voteSummary({ reviews: [], head: H }); return s.seats.length === 0 && s.ok === false; })());
	//注意：失败**必须计入退出码**（`scripts/report-selftest-validity.mjs` 的 §9 第 1/2 条：**打印了 `自证·` ≠ 自证有效**）——
	// 故这里**显式** `process.exit`（照本仓 `test/*.mjs` 的写法），而不是只 `return` 一个数。
	if (bad) { console.error(`\n✗ 核票脚本自检未过（${bad} 项）`); process.exit(1); }
	console.log('\n✔ vote-check 自检通过（三条判据各带正反例 ✓）');
	process.exit(0);
};

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) process.exit(main());
