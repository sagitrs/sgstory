// `#1275`：**来源面**端到端格 —— 「谁在什么时候写结果表」这一面（＋「渲染面」独立看护）。
//
// 为什么必须端到端：`chk:<站点>.success` 的**取值面**是 `State.variables.checks`，写入属 **present 层**
// （`<<check>>`／`<<save>>`／`<<checkres>>`），**`resolve()` 是纯函数、不写** ⇒ 族配平（命名面）＋ 怎么读（读取面）
// 都齐了**仍可能"没人写"** ⇒ **"两侧都齐"不等于"闭环"**（复核时点读写入点发现新格式路径没写 ✗）。
//
// ★ 一切经**一条命令** `test/fixtures/m3-chk-e2e/run.sh`（清生成物 ⇒ build ⇒ 跑用例）：**✗ 本格不自己写
//   "清⇒build"序列** —— 那个顺序曾把三个人咬到（产物被 .gitignore 忽略 ⇒ "件在即复用" ⇒ 两态读同一结论 ✗）。
//   **结构 > 记忆** ⇒ 顺序由 runner 承担，本格只负责**读数**。
//
// 输入＝引擎侧夹具（Operator：引擎侧能力要有自己的测试用例看护；用户写的故事不是测试用例）⇒ 零故事态可跑。
//
// 三格：
//   ① 正向：检定发生后 `State.variables.checks[<站点>]` **在场**且 `success` 是真布尔
//   ② 能假·**写入面**（`--selfcheck`）：临时去掉 `checkres` 的写入两行 ⇒ 经 runner ⇒ **收不到结果**（两态可分）
//   ③ 能假·**渲染面**（`--selfcheck-render`）：**写入保留**，只让条件行**不命中** ⇒ 键仍在、但那行**不渲染**
//      ⇒ 与 ② 合起来证明「**写入**」与「**渲染**」各有看护（呈现面读数分不出这两者）
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FX = join(ROOT, 'test/fixtures/m3-chk-e2e');
const STORIES = join(FX, 'stories');
const RUNNER = join(FX, 'run.sh');
const CORE = join(ROOT, 'src/10-core.twee');
const RULES = join(STORIES, 'north-room/data/rules.json');
const BAK = (p) => p + '.bak-chksource';
const SITE = '里屋·察觉';                                   // 夹具规则行 `req: ["chk:里屋·察觉.success"]`

const SELF = process.argv.includes('--selfcheck');
const READ_ONLY = process.argv.includes('--read-only');   // `#1275`：**只读模式**（父进程用子进程调用它）
const SELF_RENDER = process.argv.includes('--selfcheck-render');

let bad = 0;
const t = (label, ok, extra = '') => {
	if (ok) console.log(`  ✓ ${label}`);
	else { bad += 1; console.error(`  ✗ ${label}${extra ? ' — ' + extra : ''}`); }
};

/** 一切产物操作都交给 runner（它每次都清）。 */
const runRunner = () => {
	// ★ `#1275`：**连引擎中间件一起清** —— runner 只清"夹具侧"（`stories/*.twee`／夹具 `dist`），
	// 而**引擎源码**（如 `src/10-core.twee`）的变更要靠清 `ROOT/build` 才会被重编；
	// 不清 ⇒ 产物里仍是**旧引擎** ⇒ 负态会读到"补丁没生效"的假读数（实测踩过 ✗）。
	rmSync(join(ROOT, 'build'), { recursive: true, force: true });
	const r = spawnSync('bash', [RUNNER], { cwd: ROOT, encoding: 'utf8', timeout: 600000 });
	return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

/** 直读数据面：驱动夹具用例后看 `State.variables.checks`。 */
const readSource = async () => {
	process.env.SG_STORIES_DIR = STORIES;                       // ★ 必须在 import 之前设（dist-paths 读 env）
	const { boot } = await import('../test/boot.mjs');
	const { makeSession } = await import('../test/harness.mjs');
	const c = JSON.parse(readFileSync(join(FX, 'cases/north-room/m3-chk-e2e.json'), 'utf8'));
	const { w, settle, sleep } = await boot({ story: c.story, random: c.drive?.seed ?? 0.5 });
	const s = makeSession(w, { settle, sleep });
	for (const click of c.drive?.clicks ?? []) await s.clickByLabel(click);
	const sv = w.SugarCube?.State?.variables ?? {};
	const got = sv.checks?.[SITE];
	const body = w.document?.body?.innerHTML ?? '';
	try { w.close(); } catch { /* 已关 */ }
	return { checks: sv.checks, got, rendered: body.includes('桌上那点光') };
};

if (!existsSync(RUNNER)) {
	console.error(`  ○ 未判：runner 缺席（${RUNNER}）⇒ 本格未判（对象不在 ⇒ 出声，✗ 不假装跑过）`);
	process.exit(0);
}

// ── 只读模式（给父进程用子进程调用）────────────────────
// ★ 为什么必须**另起进程**：实测"**同进程二次 `boot()` 会命中进程内缓存**" ⇒ 第二次读数会悄悄变成第一次的
//   ⇒ 负态会读到"键仍在"的假读数 ✗（裁决 `#1275`：两态可分 ⇒ **两态必须来自两个进程**）。
if (READ_ONLY) {
	if (!existsSync(RUNNER)) { console.log(JSON.stringify({ atSite: 'no-runner' })); process.exit(0); }
	const r = await readSource();
	console.log(JSON.stringify({ atSite: r.got ?? null, keys: r.checks ? Object.keys(r.checks) : null,
		rendered: r.rendered === true }));
	process.exit(0);
}

// ── ① 正向 ─────────────────────────────────────────────
const base = runRunner();
t('① runner 通过（清⇒build⇒跑用例 ⇒ rc=0）', base.status === 0, `status=${base.status}`);
const pos = await readSource();
t('① `State.variables.checks` 是在场对象', !!pos.checks && typeof pos.checks === 'object');
t(`① 站点键在（\`${SITE}\`）`, !!pos.got, `keys=${JSON.stringify(Object.keys(pos.checks ?? {}))}`);
t('① 写入的值带真布尔 `success`', typeof pos.got?.success === 'boolean', JSON.stringify(pos.got ?? null));
t('① 那一行**渲染了**（呈现面；与上面数据面是两条腿）', pos.rendered === true);

// ── ② 能假·写入面 ────────────────────────────────────────
if (SELF) {
	console.log('  ── 能假·写入面：临时去掉 `checkres` 的写入行（前两处 `check`／`save` 保留）──');
	copyFileSync(CORE, BAK(CORE));
	let neg = null, negRun = null;
	try {
		const src = readFileSync(CORE, 'utf8');
		const line = '\t\tif (res && res.site) { const c = (State.variables.checks = State.variables.checks || {}); c[res.site] = res; }\n';
		const esc = new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
		const idxs = [...src.matchAll(esc)].map((m) => m.index);
		if (idxs.length !== 3) throw new Error(`写入行应为 3 处（check／save／checkres），实得 ${idxs.length}`);
		writeFileSync(CORE, src.slice(0, idxs[2]) + src.slice(idxs[2] + line.length));
		negRun = runRunner();
		// ★ **前置断言**（我第一版漏了它 ⇒ 拿到"补丁没进产物"的假读数 ✗）：
		//   产物里那条写入行必须从 3 处降到 2 处 ⇒ 才算"负态真的生效"；否则读数无效（不许当证据）。
		const page = join(FX, 'dist/stories/north-room/index.html');
		const writeCount = existsSync(page) ? (readFileSync(page, 'utf8').match(/c\[res\.site\] = res/g) ?? []).length : -1;
		t('② 前置：负态产物里写入行由 3 降到 2（证明补丁真进了构建）', writeCount === 2, `实得 ${writeCount}`);
		// 负态读数走**子进程**（见上面只读模式的注释）
		const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--read-only'],
			{ cwd: ROOT, encoding: 'utf8', timeout: 300000, env: { ...process.env, SG_STORIES_DIR: STORIES } });
		try { neg = JSON.parse(String(child.stdout ?? '').trim().split('\n').pop()); }
		catch { neg = { atSite: 'parse-failed:' + String(child.stdout ?? '').slice(0, 80) }; }
	} finally {
		copyFileSync(BAK(CORE), CORE);                          // ★ 还原走 `cp bak`（✗ 不用 git checkout）
		rmSync(BAK(CORE), { force: true });
		runRunner();                                            // 把产物恢复成"含修"态
	}
	t('② 能假：去掉写入行 ⇒ 同一站点**收不到结果**（两态可分；子进程读）', !neg?.atSite, `neg=${JSON.stringify(neg)}`);
	console.log(`      （负态 runner rc=${negRun?.status} —— 条件行 fail-loud 也会让用例红，两者都属"两态可分"）`);
}

// ── ③ 能假·渲染面 ────────────────────────────────────────
if (SELF_RENDER) {
	console.log('  ── 能假·渲染面：**写入保留**，只让条件行不命中（`req` 指到一个不存在的站点）──');
	copyFileSync(RULES, BAK(RULES));
	let neg = null, negRun = null;
	try {
		const d = JSON.parse(readFileSync(RULES, 'utf8'));
		const s = JSON.stringify(d).replace(/chk:里屋·察觉\.success/g, 'chk:不存在的站点.success');
		writeFileSync(RULES, s);
		negRun = runRunner();
		neg = await readSource();
	} finally {
		copyFileSync(BAK(RULES), RULES);
		rmSync(BAK(RULES), { force: true });
		runRunner();
	}
	t('③ 能假·渲染面：条件行不命中 ⇒ 那行**不渲染**（呈现面能咬）', neg?.rendered === false || negRun?.status !== 0,
		`rendered=${neg?.rendered} runnerRc=${negRun?.status}`);
	t('③ 且此时**写入仍在**（键在场 ⇒ 与 ② 分得开：写入与渲染各有看护）', !!neg?.checks?.[SITE] || !!neg?.got,
		`keys=${JSON.stringify(Object.keys(neg?.checks ?? {}))}`);
}

if (bad) { console.error(`✗ chk-source：${bad} 格红`); process.exit(1); }
console.log(`✓ chk-source：通过${SELF || SELF_RENDER ? '（含能假格）' : ''}`);
