// CI 测试跑器（#381）：把 `scripts/test-plan.mjs` 的计划按**有界并行**跑起来。
//
// 为什么需要：`npm test` 原来是 53 段串行的 `&&` 链——CI runner 有 4 核（仓库 public），
// 实际只用 1 核，光 `npm test` 就是 207s（环境准备只 17s）。段与段之间除了「build 必须先跑完」
// 之外没有依赖（各段写入路径互不相同，已核），所以并行是**无损**的加速。
//
// 语义要点（都是踩过的坑）：
// ① `phase:'build'` 的段**先跑且独占**——后面所有段都可能读 `dist/`；
// ② 失败**不吞**：该段 stdout/stderr 原样打出来（尾部），并汇总「哪几段红」；
// ③ 退出码：0 全绿 / 1 有失败 / 2 用法错或**选择为空**（#366 的教训：空选择不许当绿）；
// ④ `--jobs` 默认 `min(8, cpus)`（`#1105`）：实测段**84% 在等待**（`#1104`）→ 并发是瓶颈侧；
// 上限取 8 而非硬写大数 → **CI runner 核数未知**时自适应（`--jobs=`／`--serial` 仍可覆盖）。
//
// 用法：
// node scripts/run-tests.mjs # 并行（默认）
// node scripts/run-tests.mjs --serial # 串行，与旧链等价（排查/对照用）
// node scripts/run-tests.mjs --jobs=2 # 自定义并发
// node scripts/run-tests.mjs --only=scenarios --only=t-reread # 只跑匹配的段（可多次）
// node scripts/run-tests.mjs --engine-only # **只跑引擎门**（＋构建/构建期 lint/产物守卫）——#436-a
// node scripts/run-tests.mjs --story-only # 只跑故事门（排查"是不是本故事的判据在红"）
// node scripts/run-tests.mjs --tier=fast # **PR 档**（缺省）：不含标 `tier:'full'` 的周期性验证段——`#1070`
// node scripts/run-tests.mjs --tier=full # **全量档**：与 `#1070` 之前的 `npm test` 等价（152 段全跑）
// node scripts/run-tests.mjs --list # 只列计划
// node scripts/run-tests.mjs --selftest # 跑器自身的自证（不跑真计划）

import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';   // `#1072`：测量仪表的读数落盘（`build/`，gitignored）
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
import { SUSPENDED, suspendedProblems, testPlan, segmentLayer, validateLayers, tierOf, TIERS, DEFAULT_TIER, validateTiers, SUITES, suiteOf, validateSuites, inputsDeclaredStats, validateInputsRatchet, inputsMatch, validateInputsWildcardReasons } from './test-plan.mjs';
import { fsArgLiterals, inputsLowerProblems, interLayerProblems, inputsTruthProblems } from './lib/inputs-lower.mjs';   // `#1093` P2-b：①层（静态下界）
import { wiringProblems } from './lib/gate-wiring.mjs';
import { wiringCells, WIRING_CELLS_EXPECTED } from './lib/gate-wiring-cells.mjs';
import { gearDefsCriteriaProblems } from './lib/gear-defs-criteria.mjs';   // `#1115` 件②：Gear.defs 口径门
import { gearDefsCells, GEAR_DEFS_CELLS_EXPECTED } from './lib/gear-defs-cells.mjs';   // `#1100`：接线自证格（独立模块 宿主只加两行） // `#1100`：判据接线核对（门清单派生）
import { WRAPPED_READ_APIS, READ_API_BASELINE } from './lib/fs-hook-shim.mjs';
import * as shimNs from './lib/fs-hook-shim.mjs';   // `#1093` P2-d ⑤：判「清单 ≡ 实际包裹」需要**真导出面**
import * as FSN from 'node:fs';   // 同上：真 fs 面（用于判某导出是否真被包裹）
import { ensureParent } from './lib/ensure-parent.mjs';   // `#1093` P2-d：写前建父目录（共用助手 —— **调用点在少走路径上 → 漏接线 CI 抓不到** 见下方自证格） // `#1093` P2-c：㈠ 面完整性清单
import { untrackedScannedProblems, isUntrackedExemptLine } from './lib/untracked-guard.mjs';   // `#1093` P2-d ③：**未跟踪件是 `git grep` 的盲区** → 用本仓既有守卫
// `#607`：故事清单声明的门 flag（P0 为空集合 → 层判定与今天**逐字相同**；P1 起门搬家后仍判得出故事层）
import { declaredGatesAll } from './audit/discovery.mjs';
// 声明面在**顶层**取（不在 `selftest()` 里取）：`selftest()` 在文件中部就被调用，
// 若把 `const` 放在它之后，函数体引用它会踩 TDZ（跑一次 `--selftest` 就当场报）。
const declaredStoryFlags = [...new Set((await declaredGatesAll()).flatMap((m) => m.flags ?? []))];
// `#1072`：仓根（仪表落点与注入路径都用**绝对路径** → 段的工作目录/`shell:true` 不影响解析）
const ROOT = new URL('..', import.meta.url).pathname;
// `#1072`：仪表落点目录**可注入**（默认 `build/`），自证要能把「目录不存在」当**入参**喂进来验。
//注意：必须声明在**顶层最前**：自证块在文件中部就被调用，声明放后面会踩 TDZ（与 `declaredStoryFlags` 那条同形）。
const PROFILE_DIR = process.env.SAGITRS_PROFILE_DIR ?? 'build';
const PROFILE_OUT = join(PROFILE_DIR, 'segment-profile.jsonl');


const argv = process.argv.slice(2);
const has = (k) => argv.includes(`--${k}`);
const val = (k, d) => {
	const hit = argv.find((a) => a.startsWith(`--${k}=`));
	return hit ? hit.slice(k.length + 3) : d;
};

// ── 执行器（导出以便自证；纯执行，不含 CLI 语义）──────────────────────────
// `#1072`：**测量仪表**的注入点 —— 默认为 `null`（**不装仪器 → 零开销、零影响面**）。
// 为什么用模块级可变变量而不是改 `runSegment` 签名：`runSegment(seg)` 被自证格直接调用
// → 改签名会连带动自证（**没必要的面**）；模块级注入只影响"跑计划"这一条路。
let profileEnv = null;

export const runSegment = (seg) => new Promise((resolve) => {
	const t0 = Date.now();
	const child = spawn(seg.cmd, {
		shell: true, stdio: ['ignore', 'pipe', 'pipe'],
		...(profileEnv ? { env: { ...process.env, ...profileEnv(seg) } } : {}),
	});
	let out = '';
	child.stdout.on('data', (d) => { out += d; });
	child.stderr.on('data', (d) => { out += d; });
	child.on('close', (code) => resolve({ seg, code, ms: Date.now() - t0, out }));
});

// 计划校验：needs 必须指向存在的段、且不许成环（配错了要在**起跑前**就报，而不是跑到一半才怪）
export const validatePlan = (plan) => {
	const ids = new Set(plan.map((s) => s.id));
	const problems = [];
	for (const s of plan) for (const d of s.needs ?? []) if (!ids.has(d)) problems.push(`${s.id} 依赖了不存在的段 ${d}`);
	const mark = new Map();   // 0/undefined=未访, 1=在栈上, 2=已完成
	const visit = (id, path) => {
		const st = mark.get(id) ?? 0;
		if (st === 2) return;
		if (st === 1) { problems.push(`依赖成环：${[...path, id].join(' → ')}`); return; }
		mark.set(id, 1);
		const seg = plan.find((x) => x.id === id);
		for (const d of seg?.needs ?? []) visit(d, [...path, id]);
		mark.set(id, 2);
	};
	for (const s of plan) visit(s.id, []);
	return problems;
};

// 依赖感知的有界并行：先跑完所有 `phase:'build'` 的段（顺序、独占），再按 DAG 并发跑其余。
// 语义：① 段的 `needs` **全部成功**才起跑；② 前序红了/被跳过 → 本段标 `skipped`（不白跑、不假绿）；
// ③ 返回 { results, skipped, wallMs, aborted}。
export const runPlan = async (plan, { jobs = 1, onDone = () => {} } = {}) => {
	const problems = validatePlan(plan);
	if (problems.length) return { error: problems, results: [], skipped: [], wallMs: 0, aborted: false };
	const results = [], skipped = [], status = new Map(), running = new Map();
	const setup = plan.filter((s) => s.phase === 'build');
	const remaining = plan.filter((s) => s.phase !== 'build');
	for (const s of setup) {                               // ① setup 独占且有序
		const r = await runSegment(s);
		results.push(r); status.set(s.id, r.code === 0 ? 'ok' : 'fail'); onDone(r);
		if (r.code !== 0) return { results, skipped, wallMs: 0, aborted: true };
	}
	const t0 = Date.now();
	const dead = (s) => (s.needs ?? []).some((d) => status.get(d) === 'fail' || status.get(d) === 'skipped');
	const ready = (s) => (s.needs ?? []).every((d) => status.get(d) === 'ok');
	const byId = new Map(plan.map((s) => [s.id, s]));   // `#1130`：`exclusive` 判据要用
	// 注意循环条件要带上 `running.size`：段在**启动时**就从 remaining 移走，
	// 只看 remaining 会在「最后几段还在跑」时提前返回（自证当场抓到的 bug）。
	while (remaining.length || running.size) {
		let cascaded = true;
		while (cascaded) {                                     // ② 级联跳过
			cascaded = false;
			for (const s of remaining.filter(dead)) {
				remaining.splice(remaining.indexOf(s), 1);
				skipped.push(s); status.set(s.id, 'skipped');
				onDone({ seg: s, code: null, ms: 0, out: '', skipped: true });
				cascaded = true;
			}
		}
		while (running.size < jobs) {
			// `#1130`：**`exclusive` ＝ 不与任何段重叠**（两侧都拦：独占要**空场**才上；独占在跑 → 别人不上）
			const exclRunning = [...running.keys()].some((id) => byId.get(id)?.exclusive);
			if (exclRunning) break;
			const cands = remaining.filter((x) => ready(x) && !running.has(x.id));
			const s = cands.find((x) => x.exclusive && running.size === 0)
				?? cands.find((x) => !x.exclusive) ?? null;
			if (!s) break;
			remaining.splice(remaining.indexOf(s), 1);
			running.set(s.id, runSegment(s).then((r) => {
				running.delete(s.id);
				results.push(r); status.set(s.id, r.code === 0 ? 'ok' : 'fail');
				onDone(r);
			}));
		}
		if (running.size) await Promise.race(running.values());
		else {                                                 // 理论不可达（validatePlan 已排环）：兜底不空转
			for (const s of remaining.splice(0)) { skipped.push(s); status.set(s.id, 'skipped'); onDone({ seg: s, code: null, ms: 0, out: '', skipped: true }); }
		}
	}
	return { results, skipped, wallMs: Date.now() - t0, aborted: false };
};

// ── `#1072` 测量仪表：合并 ＋ 一致性检查（**纯函数** → 能被自证驱动）──────────────────
/** 把**子进程自报的**读数与**父进程实测的墙钟**合起来 → 逐段行 ＋ 问题清单。
 *
 *注意：**仪器本身可假**（票面验收）：子进程写进 jsonl 的东西**没有旁证** → 若仪器写错／有人手改，
 * 表会照抄。→ 这里做**交叉核对**（用父进程**独立量到**的墙钟当旁证）：
 * · `jsdomMs > wallMs` → 不可能（部件不能大于整体）→ **可疑**；
 * · `firstAtMs > wallMs` → 同上；
 * · `n === 0 && jsdomMs > 0` → 自相矛盾；
 * · 同一段**多条记录** → 正常（段派生了 node 孙进程）→ **合并求和**，不算问题。
 * @param {{walls: Map<string, number>, records: {id:string,n:number,jsdomMs:number,firstAtMs:number|null,uptimeAtLoadMs:number,pid:number}[]}} x
 */
export const mergeProfile = ({ walls, records = [] } = {}) => {
	const byId = new Map();
	for (const r of records) {
		const cur = byId.get(r.id) ?? { id: r.id, n: 0, jsdomMs: 0, loadMs: null, firstAtMs: null, uptimeAtLoadMs: null, procs: 0, hooks: null };
		cur.n += r.n ?? 0;
		cur.jsdomMs += r.jsdomMs ?? 0;
		// 模块装载**每进程只付一次** → 多进程时取**和**（每进程各付一遍 → 共享 harness 省的就是这些）
		if (r.loadMs !== null && r.loadMs !== undefined) cur.loadMs = (cur.loadMs ?? 0) + r.loadMs;
		if (cur.firstAtMs === null && r.firstAtMs !== null) cur.firstAtMs = r.firstAtMs;
		if (cur.uptimeAtLoadMs === null) cur.uptimeAtLoadMs = r.uptimeAtLoadMs ?? null;
		cur.hooks = r.hooks ?? cur.hooks;
		cur.procs++;
		byId.set(r.id, cur);
	}
	const rows = [], problems = [];
	for (const [id, wallMs] of walls) {
		const rec = byId.get(id);
		if (!rec) { rows.push({ id, wallMs, n: 0, jsdomMs: 0, loadMs: null, boot: false, firstAtMs: null, uptimeAtLoadMs: null, restMs: wallMs, procs: 0, suspect: false, hooks: null }); continue; }
		const suspect = [];
		//注意：交叉核对：用**父进程独立量到的**墙钟当旁证 → 子进程自报的东西不能"部件大于整体"
		const parts = (rec.loadMs ?? 0) + rec.jsdomMs + (rec.uptimeAtLoadMs ?? 0);
		if (rec.jsdomMs > wallMs) suspect.push(`jsdom 构造耗时 ${rec.jsdomMs.toFixed(1)}ms **大于**该段墙钟 ${wallMs}ms ⇒ 部件大于整体 ⇒ 不可能 ✗`);
		if ((rec.loadMs ?? 0) > wallMs) suspect.push(`jsdom 模块装载 ${rec.loadMs.toFixed(1)}ms **大于**该段墙钟 ${wallMs}ms ✗`);
		if (rec.firstAtMs !== null && rec.firstAtMs > wallMs) suspect.push(`首个构造时刻 ${rec.firstAtMs.toFixed(1)}ms **超过**该段墙钟 ${wallMs}ms ✗`);
		if (rec.n === 0 && rec.jsdomMs > 0) suspect.push(`构造 0 次却有耗时 ${rec.jsdomMs.toFixed(1)}ms ⇒ 自相矛盾 ✗`);
		if (parts > wallMs * 1.2 && wallMs > 300) suspect.push(`三段相加 ${parts.toFixed(0)}ms **明显超过**墙钟 ${wallMs}ms（>20%）⇒ 至少一段是假的 ✗`);
		if (suspect.length) for (const m of suspect) problems.push(`✗ [${id}] ${m}（**仪器读数不可信** ⇒ 别用它算收益 ✗）`);
		rows.push({
			id, wallMs, n: rec.n,
			jsdomMs: Number(rec.jsdomMs.toFixed(1)),
			loadMs: rec.loadMs === null ? null : Number(rec.loadMs.toFixed(1)),
			boot: rec.n > 0,
			firstAtMs: rec.firstAtMs, uptimeAtLoadMs: rec.uptimeAtLoadMs, hooks: rec.hooks,
			//注意：**推算栏**（不是实测）：墙钟 − jsdom 装载/构造 实测 − 装载耗时 → 含 node 启动／断言／退出清理
			restMs: Number(Math.max(0, wallMs - rec.jsdomMs - (rec.loadMs ?? 0) - (rec.uptimeAtLoadMs ?? 0)).toFixed(1)),
			procs: rec.procs, suspect: suspect.length > 0,
		});
	}
	return { rows, problems };
};

/** `#1072` 的**结论行**：回答票面验收那句「把 N 段合并到一次 jsdom 启动，能省多少秒」
 *
 *注意：口径**必须写清**（否则读的人会把"串行工作量"当成"墙钟"）：
 * · **每进程启动成本** ＝ `jsdom 模块装载` ＋ 该进程的**构造**耗时 → 这是**共享 harness 能省掉**的部分
 *（共享一个进程 → 装载只付一次、构造次数从 Σn 降到 n_shared）
 * · 省下的是**串行工作量**；**墙钟**收益还要看并发度与关键路径 → 两者**不等**。
 */
export const harnessEstimate = (rows = []) => {
	const withJsdom = rows.filter((r) => r.n > 0);
	const n = withJsdom.length;
	const loadTotal = withJsdom.reduce((a, r) => a + (r.loadMs ?? 0), 0);
	const consTotal = withJsdom.reduce((a, r) => a + r.jsdomMs, 0);
	const nProcs = withJsdom.reduce((a, r) => a + r.procs, 0);
	const constructions = withJsdom.reduce((a, r) => a + r.n, 0);
	const perProc = nProcs ? (loadTotal + consTotal) / nProcs : 0;
	return {
		n, constructions, nProcs, loadTotal, consTotal, perProc,
		totalMs: loadTotal + consTotal,
		// 共享一次 → 装载付 1 次 ＋ 构造按同一均值只付 1 次 → 省 = 总额 − 一次
		saveSerialMs: Math.max(0, (loadTotal + consTotal) - perProc),
	};
};

const sec = (ms) => `${(ms / 1000).toFixed(1)}s`;
const tail = (s, n = 28) => s.split('\n').slice(-n).join('\n');

// 失败**可诊断**：尾部 28 行**不够**——#448 的 CI 上 test-scenarios-mjs 红过一次，
// 但"哪条路线失败"的 明细在 28 行之前被截掉，只能看到汇总「1 条路线失败」，
// 于是无法判断是 flaky 还是真回归（本地复跑 3 次全绿也说明不了问题出在哪）。
// 所以除尾部外，另**从全量输出里抽出关键行**（/ 失败 / Error），去重后限量打印。
const DIGEST_RE = /(^|\s)(✗|×)|失败|Error|error:/;
export const failureDigest = (s, max = 12) => {
	const uniq = [...new Set(s.split('\n').map((l) => l.trim()).filter((l) => l && DIGEST_RE.test(l)))];
	return { total: uniq.length, lines: uniq.slice(0, max), truncated: Math.max(0, uniq.length - max) };
};

// ── 自证（不跑真计划）────────────────────────────────────────────────────
const selftest = async ({ quiet = false } = {}) => {
	let bad = 0;
	const t = (msg, ok) => { if (!ok) bad++; if (!quiet || !ok) console.log(`${ok ? '✓' : '✗'} ${msg}`); };

	{
		const longOut = ['✓ a', ...Array.from({ length: 200 }, (_, i) => `普通行 ${i}`), '✗ 路线「某某」失败'].join('\n');
		t('失败摘要：能从**被尾部截掉**的位置抽出 ✗ 行（#448 的诊断缺口）', failureDigest(longOut).lines.some((l) => l.includes('✗ 路线')));
		t('失败摘要：全绿输出不产生摘要行', failureDigest('✓ a\n✓ b').total === 0);
	}
	const okSeg = { id: 'ok', cmd: 'node -e "console.log(1)"' };
	const badSeg = { id: 'bad', cmd: 'node -e "console.error(\'炸了\');process.exit(3)"' };
	const sleepMs = (ms) => `node -e "setTimeout(()=>{},${ms})"`;
	const a = { id: 'a', cmd: sleepMs(500) };
	const b = { id: 'b', cmd: sleepMs(500) };

	const one = await runPlan([okSeg], { jobs: 1 });
	t('单段成功 → code=0', one.results.length === 1 && one.results[0].code === 0);

	const two = await runPlan([okSeg, badSeg], { jobs: 2 });
	const badR = two.results.find((r) => r.seg.id === 'bad');
	t('失败段被识别（code=3）', badR?.code === 3);
	t('失败段的输出被捕获（不许吞）', /炸了/.test(badR?.out ?? ''));

	const t0 = Date.now();
	await runPlan([a, b], { jobs: 2 });
	const par = Date.now() - t0;
	const t1 = Date.now();
	await runPlan([a, b], { jobs: 1 });
	const ser = Date.now() - t1;
	t(`并行真的重叠（jobs=2 ${par}ms < 串行 ${ser}ms）`, par < ser * 0.8);

	const setupRed = await runPlan([{ id: 's', phase: 'build', cmd: 'node -e "process.exit(1)"' }, okSeg], { jobs: 2 });
	t('setup 红 → 立刻中止（不再跑后续段）', setupRed.aborted === true && setupRed.results.length === 1);

	// 依赖语义（#381：CI 曾因漏掉产物依赖红过一轮——`scenarios` 落盘 route-traces.json，`report-rhythm` 要读它）
	const dt = Date.now();
	const dep = await runPlan([{ id: 'dep-a', cmd: sleepMs(400) }, { id: 'dep-b', needs: ['dep-a'], cmd: 'node -e "console.log(1)"' }], { jobs: 2 });
	t('needs：后段等前段跑完才起跑（墙钟 ≥ 前段耗时）', Date.now() - dt >= 380);
	t('needs：前序绿 → 后段照跑', dep.results.length === 2 && dep.skipped.length === 0);
	const depFail = await runPlan([{ id: 'f', cmd: 'node -e "process.exit(2)"' }, { id: 'g', needs: ['f'], cmd: 'node -e "console.log(1)"' }], { jobs: 2 });
	t('前序红 → 后段标 skipped（不白跑、也不假绿）', depFail.skipped.map((x) => x.id).join() === 'g' && depFail.results.length === 1);
	const noDep = await runPlan([{ id: 'x', needs: ['不存在'], cmd: 'node -e "1"' }], { jobs: 1 });
	t('needs 指向不存在的段 → 起跑前报错', Array.isArray(noDep.error) && noDep.error.length === 1);
	const cyc = await runPlan([{ id: 'p', needs: ['q'], cmd: 'node -e "1"' }, { id: 'q', needs: ['p'], cmd: 'node -e "1"' }], { jobs: 1 });
	t('needs 成环 → 起跑前报错', Array.isArray(cyc.error) && /成环/.test(cyc.error.join('')));

	// #436-a：门的分层（--engine-only/--story-only 的口径）——层表必须与计划**恰好对齐**、
	// 引擎集合非空且两不交（空选择／歧义都会让"第二故事只跑引擎门"这条出口判据失真）
	{
		const plan = testPlan();
		const probs = validateLayers(plan, { declaredStoryFlags });
		t('计划分层表自洽（无未归层/无僵尸声明/无歧义）', probs.length === 0);
		const eng = plan.filter((s) => segmentLayer(s) === 'engine');
		const sto = plan.filter((s) => segmentLayer(s) === 'story');
		t('引擎门集合非空且与故事门不交（并集＝全计划）', eng.length > 0 && sto.length > 0 && eng.length + sto.length === plan.length);
		t('引擎门里含 build ＋ 5 道引擎门（--state/--literals/--sitedisc/--text/--consequences）',
			eng.some((s) => s.phase === 'build') && ['state', 'literals', 'sitedisc', 'text', 'consequences'].every((f) => eng.some((s) => s.cmd.includes(`--${f} --check`))));
	}

	// `#1070`：**档位（tier）面** —— 两格必须都能假（这里是运行器自己的自证；
	// 更硬的变体在探针/人工核里：构造一个只 full 的段 → fast 档不跑它、full 档必跑它）
	{
		const plan = testPlan();
		t('tier 结构自洽（档位合法 · fast∪full＝全集 · 每条 full 有理由）', validateTiers(plan).length === 0);
		const fast = plan.filter((s) => tierOf(s) === 'fast');
		const full = plan.filter((s) => tierOf(s) === 'full');
		t('两档并集＝全集（且缺省即 fast ⇒ 不静默漏跑）', fast.length + full.length === plan.length && fast.length > 0);
		t('磁盘上有 full 段 ⇒ fast 档**不等于**全集（否则减负是假的且看不出来）',
			full.length === 0 || fast.length < plan.length);
		// 能假那一半①：造一个只 full 的段 → **fast 档选择面不含它**
		const probePlan = [...plan, { id: 'zz-only-full', phase: 'test', cost: 0, tier: 'full', cmd: 'node -e "1"' }];
		t('🔴 能假：新增一个只 `full` 的段 ⇒ **fast 档选择面不含它**（full 档含它）',
			!probePlan.filter((s) => tierOf(s) === 'fast').some((s) => s.id === 'zz-only-full')
			&& probePlan.filter((s) => tierOf(s) === 'full').some((s) => s.id === 'zz-only-full'));
		// 能假那一半②：去掉一条 full 的理由 → **必须报**（降频不留痕＝红）
		// `#1261`：原先借用 plan 里那个唯一的 full 段（`test-witness-trace`，已随样本下架）当素材 ->
		// 改为**自造素材**（不依赖任何具体段；与同族其它能假格一致）。
		const noReason = [...plan, { id: 'zz-unreasoned-full', phase: 'test', cost: 0, tier: 'full', cmd: 'node -e "1"' }];
		t('🔴 能假：`full` 段没写理由 ⇒ 报（`FULL_REASONS` 缺条即红）', validateTiers(noReason).some((p) => /没写理由/.test(p)));
		// 能假那一半④：**fast 段不得 `needs` 一个 full-only 段**（`#1070` E4）—— 该形态 → **PR 档全停**
		t('🔴 能假：fast 段 `needs` 一个 full-only 段 ⇒ 报（否则 PR 档起跑即报“依赖了不存在的段”而全停）',
			validateTiers([{ id: 'zz-full', cmd: 'node -e "1"', tier: 'full' }, { id: 'zz-fast', cmd: 'node -e "1"', needs: ['zz-full'] }], { reasons: { 'zz-full': 'r' } }).some((p) => /full-only/.test(p)));
		// 正例（同族的另一半）：**fast → fast** 的依赖不得报 —— 否则上面那条只是“凡有 needs 就报”
		t('正例：fast 段 `needs` 一个 **fast** 段 ⇒ **不报**（那条只在“前置被移出 PR 档”时成立 ✓）',
			validateTiers([{ id: 'zz-a', cmd: 'node -e "1"' }, { id: 'zz-b', cmd: 'node -e "1"', needs: ['zz-a'] }]).length === 0);
	}
	//注意：**本块必须留在 `if (bad)` 之前** —— `#1123` 复核实测：格红却**不进退出码**（`bad++` 无人看 → 红格与
	// 报文「通过」同屏）→ 那等于「**红了也白红**」（比恒真格更隐蔽：它**打红字了**）
	// `#1093` P1：**完备且不重叠**（成对 —— 两条都要真咬）
	t('`validateSuites` 正例：真计划 ＋ 真表 ⇒ **0 问题** ✓', validateSuites().length === 0);
	t('🔴 `validateSuites` 反例①：**删一段**（计划里有、表里没有）⇒ 报「未归组」✓',
		validateSuites([{ id: 'x' }, { id: 'y' }], { members: { engine: ['x'] } }).some((p) => /未归组/.test(p) && p.includes('y')));
	t('🔴 `validateSuites` 反例②：**同段归两组**（跨组）⇒ 报「同时归两组」✓',
		validateSuites([{ id: 'x' }], { members: { engine: ['x'], editor: ['x'] } }).some((p) => /同时归两组/.test(p)));
	t('🔴 `validateSuites` 反例③：表里**多出**（不在计划里）⇒ 报「不在计划里」✓',
		validateSuites([{ id: 'x' }], { members: { engine: ['x'], editor: ['zombie'] } }).some((p) => /不在计划里/.test(p)));
	t('`suiteOf`：查得到组 ⇒ 返组名 ✓ ／ 查不到 ⇒ `null` ✗（不猜 ✓）', suiteOf('build-mjs') !== null && suiteOf('no-such-seg') === null);
	// `#1093` P2-a：`inputs` 声明面（安全默认 ＋ ratchet；成对）
	//注意：`#1123` 复核（第 4 轮）：原格断言「今日全表都未声明」（undeclared === total）
// → 那是把**今天的快照当不变量** → 第一个照设计「老段渐进声明」的人 → **整跑假红**
// → 改**结构不变量**（任何时间点都真）＋ 用**注入**保住能假
t('`inputsDeclaredStats`：**结构不变量** declared ＋ undeclared === total ✓（**不写死今日快照** ✗）',
	(() => { const x = inputsDeclaredStats(); return x.declared + x.undeclared.length === x.total; })());
t('🔴 `inputsDeclaredStats`：**声明了的段**计入 declared、不计入 undeclared（注入式 ⇒ 函数数错即红）',
	(() => { const x = inputsDeclaredStats([{ id: 'a', inputs: ['x'] }, { id: 'b' }]); return x.declared === 1 && x.undeclared.length === 1 && x.total === 2; })());
	t('`validateInputsRatchet` 正例：段数**未增** ⇒ 0 问题 ✓（老段可渐进 ✓）', validateInputsRatchet([{ id: 'a', inputs: ['x'] }, { id: 'b' }], { baseline: 1 }).problems.length === 0);
	t('🔴 `validateInputsRatchet` 反例：**未声明段数增加** ⇒ 报并**点名新增者** ✓', (() => { const r = validateInputsRatchet([{ id: 'old' }, { id: 'n1' }, { id: 'n2' }], { baseline: 1 }); return r.problems.length === 1 && /n1|n2/.test(r.problems[0]); })());
	//注意：`#1123` 复核：**原格是 `t('…安全默认…', true)` → 恒真断言**（**守着本片唯一能致假绿的方向**）
	// → 复核实测：将来若有人实现成「未声明 → 跳过」→ **那格照样绿** → 改为**注入式可假对**
	t('🔴 安全默认·①：**未声明 ⇒ 恒算命中**（任何改动面都命中 ⇒ **永不跳过** ✓）', inputsMatch({ declared: [], changed: ['docs/x.md'] }) === true);
	//注意：这里**必须**是 `if (bad)` **之后** —— 否则「格红」与「打通过」会同屏（`#1123` 复核抓到的缝）
	// `#1093` P2-b：①层（静态下界）—— 抽面／判据／层间自洽（成对；**格只断言跨时间的结构不变量**）
	t('🔴 `fsArgLiterals`：**锚 fs 实参位** ⇒ 抽到实参里的面 ✓，且**不抽**同文件里的裸字号串（自证夹具 ✗）',
		(() => {
			const src = ['import { readFileSync } from "node:fs";',
				'const a = readFileSync(join(ROOT, "src/x.twee"));',
				'const b = "stories/x/a.twee";'].join('\n');
			const lw = fsArgLiterals(src);
			return lw.includes('src/x.twee') && !lw.some((x) => x.startsWith('stories/'));
		})());
	t('`inputsLowerProblems`：**未声明 ⇒ 不管** ✗（安全默认 ✓）／声明够 ⇒ 0 ✓／🔴 漏面 ⇒ 报 ✓',
		(() => { const lw = ['src', 'stories']; return inputsLowerProblems({ declared: [], lower: lw }).length === 0
			&& inputsLowerProblems({ declared: ['src/**', 'stories'], lower: lw }).length === 0
			&& inputsLowerProblems({ declared: ['src/**'], lower: lw }).length === 1; })());
	// `#1093` P2-d：**`*` 家族**（全通配 → 与「未声明」同义）—— 三个消费者**必须同义**（跨函数对照才照得出）
	t('🔴 全通配·①层：`["*"]` ⇒ **恒命中**（静态面也算被覆盖 ✓）',
		inputsLowerProblems({ declared: ['*'], lower: ['src/anything.mjs'] }).length === 0);
	t('🔴 全通配·②层：`["*"]` ⇒ **恒命中**（修前**恰好反着** ✗：`base && …` 空 base 判否 ✗ ⇒ 三处不同义 ✓）',
		inputsTruthProblems({ declared: ['*'], truth: ['src/anything.mjs'] }).length === 0);
	t('🔴 全通配·选择面：`inputsMatch(["*"])` ⇒ **恒命中**（任意改动面 ⇒ **永不跳过** ✓）',
		inputsMatch({ declared: ['*'], changed: ['docs/whatever.md'] }) === true);
	t('🔴 成对（**窄声明必须仍能判否** ✗ —— 否则"恒命中"＝把门焊死 ✓）',
		inputsMatch({ declared: ['src/**'], changed: ['stories/x.twee'] }) === false
		&& inputsLowerProblems({ declared: ['src/**'], lower: ['stories/x.twee'] }).length === 1
		&& inputsTruthProblems({ declared: ['src/**'], truth: ['stories/x.twee'] }).length === 1);
	t('🔴 ④ 全通配须给**机器可读的理由 ＋ 票号**（缺任一项不生效 ✗）；今日那条真声明**已带** ✓',
		validateInputsWildcardReasons().length === 0
		&& validateInputsWildcardReasons([{ id: 'x', inputs: ['*'] }]).length === 1
		&& validateInputsWildcardReasons([{ id: 'x', inputs: ['*'] }], { reasons: { x: { reason: 'r', voucher: '#1' } } }).length === 0
		&& validateInputsWildcardReasons([{ id: 'x', inputs: ['*'] }], { reasons: { x: { reason: 'r' } } }).length === 1);
	t('🔴 `interLayerProblems`：**①（下界）⊆ ②（真值）** 成立 ⇒ 0 ✓；下界含真值没有的 ⇒ **必报** ✓',
		(() => { const okk = interLayerProblems({ lower: ['src'], truth: ['src/a.twee'] }); const bad2 = interLayerProblems({ lower: ['dist'], truth: ['src/a.twee'] }); return okk.length === 0 && bad2.length === 1; })());
	//注意：**格必须调用**（`() => …` 传函数 → **恒真** —— 实测实测踩过：写漏一对括号 → 该格永远不红 与恒真格同族）
	// `#1093` P2-c：②层（运行真值）的面级断言（**格放在检查之前**；只断言跨时间的结构不变量）
	t('🔴 ㈠ 面完整性 ratchet：shim 包裹的读 API 清单 **⊇ 基准清单** ✓（后人加新读 API 未包 ⇒ 当场红 ✓）',
		(() => READ_API_BASELINE.every((a) => WRAPPED_READ_APIS.includes(a)))());
	t('🔴 ㈡ 面完整性：`WRAPPED_READ_APIS` **≡ 实际被包裹的导出**（两向 ✗ —— 清单多写 ⇒ 谎报覆盖 ✓；少写 ⇒ 漏报 ✓）',
		(() => {
			const r = (a) => [...a].sort().join(',');
			const actual = Object.keys(shimNs).filter((k) => typeof shimNs[k] === 'function'
				&& typeof FSN[k] === 'function' && shimNs[k] !== FSN[k]);
			return r(actual) === r(WRAPPED_READ_APIS);
		})());
	t('⚠️ shim **导出它的清单**（不是"注释里说包全了"✗ ⇒ 把漏报从注释面移到判据面 ✓）',
		(() => Array.isArray(WRAPPED_READ_APIS) && WRAPPED_READ_APIS.length >= READ_API_BASELINE.length));
	// `#1093` P2-d ③：**没人绕过助手**（复核席要求 —— 同一教训今晚已在**三处**出现）
	// 判据：`scripts/**` 里**直接调 `mkdir` ＋ `Sync(`** 的文件 ⊆ {**助手自身**} ∪ **显式豁免**
	//注意：只数**真代码行**（跳过注释行 —— 否则注释里提一句就假红）
	t('🔴 ③ 没人绕过助手：直接调 `mkdir`＋`Sync(` 的文件 ⊆ {助手} ∪ 豁免（>0 即红 ✗）',
		(() => {
			const files = execFileSync('git', ['grep', '-l', 'mkdir' + 'Sync(', '--', 'scripts'], { encoding: 'utf8' }).split('\n').filter(Boolean);
			//注意：豁免必须**各配理由 ＋ 票号**（否则清单会长成**万能逃生门**）；下一条断言会机检它
			const EXEMPT = [
				['scripts/lib/ensure-parent.mjs', '助手自身 ⇒ 唯一允许直接调 mkdir 处', '#1093'],
				['scripts/dist-fresh.mjs', '建的是具体产物目录、非「写前建父目录」语义 ⇒ 不属该助手射程', '#1072'],
				['scripts/report-two-state.mjs', '同上：建具体目录、非父目录代理', '#1072'],
			];
			if (EXEMPT.some((e) => !e[1] || !/^#\d+$/.test(String(e[2] ?? '')))) return false;   // 理由／票号缺一 → 红
			const hasRealCall = (f) => readFileSync(f, 'utf8').split('\n').some((l) => { const t = l.trim(); return t.includes('mkdir' + 'Sync(') && !t.startsWith('//') && !t.startsWith('*'); });
			const real = files.filter(hasRealCall);
			const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'scripts'], { encoding: 'utf8' }).split('\n').filter(Boolean);
						const scanned = untracked.filter(hasRealCall);
						const exempted = scanned.filter((f) => readFileSync(f, 'utf8').split('\n').some(isUntrackedExemptLine));
						const guardOk = untrackedScannedProblems({ untracked, isScanned: hasRealCall, exempted }).problems.length === 0;   // 未跟踪 ＋ 被扫到 ＋ 无豁免 → 红
						return real.every((f) => EXEMPT.some((e) => e[0] === f)) && guardOk;
		})());
	// `#1093` P2-d ②：**「写了调用、忘了接线」**（＝`#1031`「入口未接线」族 —— 本仓该族已有格，这条路径漏了）
	//注意：四处调用点**全在少走路径**（②层需已声明段／仪表需 `--profile*`）→ 断了接线，**CI 与自证都绿**
	t('🔴 ② 共用助手**接线在位**（`ensureParent` 已 import 且是函数 ⇒ 否则四处调用点起跑即崩 ✗）',
		typeof ensureParent === 'function' && /from '\.\/lib\/ensure-parent\.mjs'/.test(readFileSync(fileURLToPath(import.meta.url), 'utf8')));
	// `#1100`：**接线自证格 ＋ 格数守卫** —— 返回值**必须用**（此前被丢弃 → `WIRING_CELLS_EXPECTED` 全仓无人使用）
	// 原理：防摘**不靠再守一层**，靠「**摘了会改变一个可观的数**」（掐掉一格 → 数变 → 红）
	const nCells = wiringCells(t);
	if (nCells !== WIRING_CELLS_EXPECTED) {
		bad++;
		console.error(`✗ 判据接线：**格数对不上** —— 实跑 ${nCells} vs 期望 ${WIRING_CELLS_EXPECTED} ✗（掐掉/漏写一格 ⇒ 数变 ⇒ 红 ✓）`);
	} else console.log(`  ○ 判据接线：本组格数 **${nCells} ≡ ${WIRING_CELLS_EXPECTED}** ✓`);
	const nGear = gearDefsCells(t);   // `#1115` 件②：口径门自证格（**返回值必须用**）
	if (nGear !== GEAR_DEFS_CELLS_EXPECTED) { bad++; console.error(`✗ \`Gear.defs\` 口径门：**格数对不上** —— 实跑 ${nGear} vs 期望 ${GEAR_DEFS_CELLS_EXPECTED} ✗`); } else console.log(`  ○ \`Gear.defs\` 口径门：本组格数 **${nGear} ≡ ${GEAR_DEFS_CELLS_EXPECTED}** ✓`);
	if (bad) {
 console.error(`\n✗ 跑器自证失败 ${bad} 项`); process.exit(1); }
	if (!quiet) console.log('\n✔ 跑器自证通过：成功/失败识别、失败输出不吞、并行真的重叠、setup 红即中止、needs 前置/级联跳过/配错报错');
	else console.log('✓ 跑器自证通过（成功/失败识别 · 输出不吞 · 并行真重叠 · setup 红即中止 · needs 语义）');
	// `#1123` 复核：**返回值必须反映 bad** —— 原来恒 `return true` ＋ 调用方无条件 `exit(0)`
	// → **凡落在最后一个 `if (bad)` 之后的格都不进退出码**（本函数内 `if (bad)` 有 **3 处**）
	// → 结论（复核改字）：**「格红 → 非零退出」是格级属性，不是入口级** → 以**返回值**兜底
	return bad === 0;
};

if (has('selftest')) { process.exit((await selftest()) ? 0 : 1); }   // `#1123`：**按返回值**退出（格红 → 非零）
// 跑器是「CI 绿不绿」的判定者，它自己坏了必须**当场**暴露——所以默认先自证（约 2s，`--no-selftest` 可关）。
if (!has('no-selftest')) { if (!(await selftest({ quiet: true }))) process.exit(1); }   // `#1123`：同上

// ── CLI ─────────────────────────────────────────────────────────────
const plan0 = testPlan();
// ── 层过滤（#436-a）：`--engine-only` 用于「第二故事能不能接」的出口判据（故事门会判红本故事以外的东西）
// 放在 `--list` **之前** → `--list --engine-only` 可以预览选择结果
const layerWant = has('engine-only') ? 'engine' : has('story-only') ? 'story' : null;
if (layerWant) {
	// 层表自检（新增门忘了归层 → 起跑前就报，别跑到一半才发现选择口径不完整）
	const layerProblems = validateLayers(plan0, { declaredStoryFlags });
	if (layerProblems.length) { console.error(`✗ 门的分层表有问题（--${layerWant}-only 依赖它）：\n  ${layerProblems.join('\n  ')}`); process.exit(2); }
}
const layerSel = layerWant ? plan0.filter((s) => segmentLayer(s, declaredStoryFlags) === layerWant) : null;

// ── 档位过滤（`#1070`）：`--tier=fast|full`；**缺省 `fast`**（新增段默认进 PR 档 → 不静默漏跑）
// 与 `--engine-only/--story-only` **正交**（取交集）—— 两者管的是不同维度（层 vs 频度）。
//注意：**起跑前先校验**（新增段标错 tier／full 段没写理由 → 当场报，别跑到一半才发现选择面不完整）。
const tierWant = (() => {
	const hit = argv.find((a) => a.startsWith('--tier='));
	if (!hit) return DEFAULT_TIER;                       // 缺省＝fast
	const v = hit.slice('--tier='.length);
	if (!TIERS.includes(v)) { console.error(`✗ --tier 只认 ${TIERS.join('｜')}（当前：${JSON.stringify(v)}）—— 缺省是 ${DEFAULT_TIER}`); process.exit(2); }
	return v;
})();
const tierProblems = validateTiers(plan0);
if (tierProblems.length) { console.error(`✗ 计划的 tier 面有问题（--tier 依赖它）：\n  ${tierProblems.join('\n  ')}`); process.exit(2); }
// `#1261` 甲：**临时下架**（对象在、样本暂缺）的段 —— 从选择面剔除并**单列**：
// 不计失败、不算未声明、也不算"本次不跑"（它有自己的列，且声明缺 why/until 即红）。
import('./test-plan.mjs');
const suspProblems = suspendedProblems(SUSPENDED);
if (suspProblems.length) { console.error('✗ 临时下架声明不合规（缺 why/until）：\n  ' + suspProblems.join('\n  ')); process.exit(1); }
const suspIds = new Set(Object.keys(SUSPENDED));
const suspended = plan0.filter((s) => suspIds.has(s.id));
const tierSel = (tierWant === 'full' ? plan0 : plan0.filter((s) => tierOf(s) === tierWant)).filter((s) => !suspIds.has(s.id));
const otherTier = plan0.filter((s) => !tierSel.includes(s) && !suspIds.has(s.id));
if (suspended.length) console.log(`○ 临时下架（${suspended.length} 段，不计失败）：` + suspended.map((s) => s.id + `（${SUSPENDED[s.id].until}）`).join(' ｜ '));
// ── `#1093` P1.1：`--suite=<名>`（**正交**维度 —— 与 `--tier`／`--only`／`--engine-only` **取交集**）
//注意：起跑前**先校验分组表**（完备且不重叠）：表漂了 → **当场报**，不许"跑了一半才发现选择面不完整"
const suiteWant = (() => {
	const hit = argv.find((a) => a.startsWith('--suite='));
	if (!hit) return null;
	const v = hit.slice('--suite='.length);
	if (!SUITES.includes(v)) { console.error(`✗ --suite 只认 ${SUITES.join('｜')}（当前：${JSON.stringify(v)}）`); process.exit(2); }
	return v;
})();
if (suiteWant) {
	const suiteProblems = validateSuites(plan0);
	if (suiteProblems.length) { console.error(`✗ 分组表有问题（--suite 依赖它）：\n  ${suiteProblems.join('\n  ')}`); process.exit(2); }
}
const suiteSel = suiteWant ? plan0.filter((s) => suiteOf(s) === suiteWant) : null;
// `#1093` P2-a：`inputs` 声明面 —— **安全默认（未声明＝全跑型 → 总是跑）＋ ratchet（未声明段数不得增加）**
//注意：**本片不含跳过** → 与今日**行为逐字相同**（CI 面不劣化）。计数**必须打印**（ratchet 类一律打印）。
{
	const { problems } = validateInputsRatchet(plan0);
	const { undeclared, declared, total } = inputsDeclaredStats(plan0);
	console.log(`○ \`inputs\` 声明：已声明 ${declared}/${total} 段 ｜ **未声明 ${undeclared.length}**（未声明 ⇒ 视为「**全跑型**」＝总是跑 ✓ —— **本片不含跳过** ✗）`);
	if (problems.length) { console.error(`✗ \`inputs\` ratchet 不过：\n  ${problems.join('\n  ')}`); process.exit(2); }
	const wc = validateInputsWildcardReasons(plan0);   // `#1093` P2-d ④：全通配声明须给机器可读理由 ＋ 票号（缺任一项不生效）
	// `#1100`：**判据「接线」核对** —— 两面 ＝ 门模块侧 ↔ registry 侧 → **两向相等 ＋ 打印两面与差集**
	//注意：边界：本判据**不是锁**（整体删掉 → 门内抓不到）；它给的是**可观测的数**（差集／锚处数）
	{
		const wr = wiringProblems();
		console.log(`  ${wr.face}`);
		if (wr.problems.length) { console.error(`✗ 判据接线核对不过（**接线缺失** ≠ 判据异常 ✗）：\n  ${wr.problems.join('\n  ')}`); process.exit(2); }
		const gd = gearDefsCriteriaProblems();   // `#1115` 件②：`Gear.defs` 口径门（**对称差** → 非空即红）
		if (gd.length) { console.error(`✗ \`Gear.defs\` 口径门不过：\n  ${gd.join('\n  ')}`); process.exit(2); }
	}
	if (wc.length) { console.error(`✗ \`inputs\` 全通配理由不过：\n  ${wc.join('\n  ')}`); process.exit(2); }

// `#1093` P2-b：**①层（静态下界）** —— 只对**已声明 `inputs`** 的段判（未声明 → 全跑型 → 不该管它）
//注意：抽面**必须锚 fs 实参位**（朴素抽「文件里出现过的路径串」会把**自证夹具**算成读取面 实测 9 vs 2）
//注意：**空键闸**：已声明段若**抽不到任何面** → ① 是**空转**（看着在判、其实没判）→ **报**
{
	let lowerBad = 0, lowerChecked = 0;
	for (const seg of plan0) {
		if (!Array.isArray(seg.inputs) || !seg.inputs.length) continue;
		const mm = /^node (\S+)/.exec(seg.cmd); if (!mm) continue;
		let text = ''; try { text = readFileSync(mm[1], 'utf8'); } catch { continue; }
		lowerChecked++;
		const lower = fsArgLiterals(text);
		const isWildcard = (seg.inputs ?? []).includes('*');   // `#1093` 裁定 ①：显式全跑型 → 诚实声明（须带理由注释）
		if (!lower.length && !isWildcard) { lowerBad++; console.error(`✗ [${seg.id}] ①层**抽不到任何面** ⇒ 空键 ⇒ 判据空转（声明的 inputs 无从校验 ✗；纯函数段请声明 ['*'] ＋ 理由 ✓）`); continue; }
		if (!lower.length && isWildcard) console.log(`      ○ [${seg.id}] inputs=['*'] 全跑型 ⇒ ①层不适用 ✓`);
		for (const x of inputsLowerProblems({ declared: seg.inputs, lower })) { lowerBad++; console.error(`✗ [${seg.id}] ${x}`); }
	}
	console.log(`○ ①层（静态下界）：检查 **${lowerChecked}** 个**已声明**段 ⇒ 违规 **${lowerBad}** 条（未声明段不参与 ✓）`);
	if (lowerBad) { console.error(`✗ ①层未过 ${lowerBad} 条 ⇒ 声明漏了它真读的面（或抽不到面 ✗）`); process.exit(2); }
}

// #1093 P2-c：**②层（运行真值）** —— **仅 full 档**跑（不占 PR 档 → CI 面不劣化 硬线）
//注意：机制＝**解析钩子重定向 `node:fs` → shim**（改模块对象拦不到 ESM 具名导入 → 会成"永真门"）
//注意：盲区（如实）：**非 node 子进程**的读看不见 → 该类段**只能保持未声明**（＝全跑型）
if (tierWant === 'full' && !has('no-inputs-runtime')) {
	const declared = plan0.filter((s) => Array.isArray(s.inputs) && s.inputs.length);
	if (!declared.length) console.log('○ ②层（运行真值）：**无已声明段** ⇒ 不跑 ✓（未声明＝全跑型 ✓）');
	else {
		const OUTJ = 'build/fs-hook.jsonl';
		let rtBad = 0;
		for (const seg of declared) {
			try { rmSync(OUTJ, { force: true }); } catch { /* 首次 */ }
			//注意：`#1127` 复核阻断②：**跑子进程前必须确保落点父目录存在** ——
			// 同文件 `:606` 早写着这条规矩（`#1072` 仪表族）→ 本处漏了（**干净 checkout ＋ 本块在 `build-mjs` 之前** → 无 `build/` → 空转）
			ensureParent(OUTJ);   // ← 走共用助手（复核席要求）
			const args = seg.cmd.replace(/^node\s+/, '').split(/\s+/);
			let rcode = 0;
			try {
				execFileSync('node', args, {
					env: { ...process.env, NODE_OPTIONS: '--import=' + pathToFileURL(join(ROOT, 'scripts/lib/fs-hook.mjs')).href, SAGITRS_FS_HOOK_OUT: join(ROOT, OUTJ), SAGITRS_FS_HOOK_ID: seg.id }, stdio: 'pipe',
				});
			} catch (e) { rcode = e.status ?? 1; }
			if (rcode !== 0) { rtBad++; console.error(`✗ [${seg.id}] ②层：段自身在钩子下 rc=${rcode}（段坏了 ⇒ 读数不成立 ✗ 照 #1123 的「读数必须真」 ✓）`); continue; }
			let truth = [];
			try {
				for (const ln of readFileSync(OUTJ, 'utf8').split('\n')) if (ln.trim()) truth = truth.concat(JSON.parse(ln).paths ?? []);
			} catch { console.error(`✗ [${seg.id}] ②层：**取不到读数** ⇒ 不许当"读到 0 条"✗（#557：读不到输入 ≠ 没命中 ✓）`); rtBad++; continue; }
			for (const x of inputsTruthProblems({ declared: seg.inputs, truth })) { rtBad++; console.error(`✗ [${seg.id}] ${x}`); }
			const low = fsArgLiterals(readFileSync(seg.cmd.replace(/^node\s+/, '').split(/\s+/)[0], 'utf8'));
			for (const x of interLayerProblems({ lower: low, truth })) { rtBad++; console.error(`✗ [${seg.id}] ${x}`); }
		}
		console.log(`○ ②层（运行真值）：检查 **${declared.length}** 个已声明段 ⇒ 违规 **${rtBad}** 条`);
		if (rtBad) { console.error(`✗ ②层未过 ${rtBad} 条`); process.exit(2); }
	}
}
}
if (has('list')) {
	// `#1093`：`--list` 也要反映 `--suite` 选面（否则列表与实跑不一致 → 误导）
	const shown = suiteSel ? (layerSel ? layerSel.filter((x) => suiteSel.includes(x)) : suiteSel) : (layerSel ?? plan0);
	console.log(`计划 ${shown.length} 段${layerWant ? `（--${layerWant}-only 从 ${plan0.length} 段里选出）` : ''}（串行实测合计 ${sec(shown.reduce((a, s) => a + s.cost, 0) * 1000)}）：`);
	// `#1070`：档位分布**写在这里**（审计一眼看出“哪些段不在 PR 档”）；
	//注意：`--list` **不按档过滤**（下面逐段打 `[tier]`）：过滤后的名单看不见“被排除了什么” → 不好审
	const nFast = plan0.filter((s) => tierOf(s) === 'fast').length;
	console.log(`档位：fast ${nFast} 段 ｜ full ${plan0.length} 段（**full ＝ 全集** ✓ —— 档位是**包含关系**（fast ⊂ full）而不是二分 ✗：跑全量用 \`npm run test:full\`；本列表**不过滤**，逐段标 \`[tier]\` ✓）`);
	for (const s of shown) console.log(`  ${s.phase === 'build' ? '[build]' : '       '} [${tierOf(s)}] ${s.id}${s.needs ? `  (needs: ${s.needs.join(', ')})` : ''}  ${s.cmd}`);
	process.exit(0);
}
const only = argv.filter((a) => a.startsWith('--only=')).map((a) => a.slice(7));
// `--only` 时**自动带上传递 dependency**：否则选中一个 `needs` 有前置的段会因「依赖不在选择内」
// 直接被 validatePlan 拦下（调试时很反直觉），或更糟——跳过前置去跑一个读不到产物的段。
const withDeps = (sel) => {
	const byId = new Map(plan0.map((s) => [s.id, s]));
	const out = new Map(sel.map((s) => [s.id, s]));
	for (const s of [...out.values()]) {
		for (const d of s.needs ?? []) if (byId.has(d) && !out.has(d)) out.set(d, byId.get(d));
	}
	const added = [...out.keys()].filter((id) => !sel.some((s) => s.id === id));
	if (added.length) console.log(`○ --only：自动带上前置段 ${added.join(', ')}`);
	return plan0.filter((s) => out.has(s.id));   // 保持计划顺序
};
if (layerSel) console.log(`○ --${layerWant}-only：选中 ${layerSel.length}/${plan0.length} 段（另一层 ${plan0.length - layerSel.length} 段不跑）`);
// `#1070`：档位选择面**必须打印**（不得静默少跑）—— 含“哪些段因为 full 档被跳过”的**逐条留痕**
if (otherTier.length) {
	console.log(`○ --tier=${tierWant}：选中 ${tierSel.length}/${plan0.length} 段${tierWant === 'full' ? '（**full ＝ 全集** ✓）' : ''}；**另有 ${otherTier.length} 段属 full 档本次不跑**（跑全量：\`npm run test:full\` ✓）：`);
	for (const s of otherTier) console.log(`      ○ [${tierOf(s)}] ${s.id}${s.cost ? `  ← ${s.cost}s` : ''}`);
}
// `--only=` 与档位／层过滤**取交集**（三个维度正交）
const onlySel = only.length ? plan0.filter((s) => only.some((o) => s.id.includes(o) || s.cmd.includes(o))) : null;
const baseSel0 = layerSel && onlySel ? layerSel.filter((s) => onlySel.includes(s)) : (layerSel ?? onlySel ?? plan0);
// `#1093`：`--suite` 与上面各维**取交集**（三个维度都正交）
const baseSel = suiteSel ? baseSel0.filter((s) => suiteSel.includes(s)) : baseSel0;
// `#1261` 甲：**临时下架**（对象在、样本暂缺）的段从最终选择面剔除 —— 已在上方单列打印。
const selRaw = tierWant === 'full' ? baseSel : baseSel.filter((s) => tierOf(s) === tierWant);
const sel = selRaw.filter((s) => !suspIds.has(s.id));
const plan = (onlySel || layerSel) ? withDeps(sel) : sel;
if (suiteSel) console.log(`○ --suite=${suiteWant}：选中 ${suiteSel.length}/${plan0.length} 段（**其余 ${plan0.length - suiteSel.length} 段本次不跑** —— 分组表见 \`scripts/test-plan.mjs\` 的 \`SUITE_MEMBERS\` ✓）`);

if (!plan.length) { console.error(`✗ 没有匹配到任何段（${layerWant ? `--${layerWant}-only` : '--only'} 写错了？／tier=${tierWant} 下无段？）——空选择不是绿`); process.exit(2); }
if ((only.length || layerWant) && !plan.some((s) => s.phase === 'build') && plan0.some((s) => s.phase === 'build')) {
	console.log(`○ 提示：本次未选中 build 段，dist 可能不是最新的（--only 调试时常见）`);
}
// 计划自检（needs 配错/成环要在起跑前报，而不是跑到一半才发现）
const planProblems = validatePlan(plan);
if (planProblems.length) { console.error(`✗ 计划有问题：\n  ${planProblems.join('\n  ')}`); process.exit(2); }

const serial = has('serial');
// `#1105`：**并发度自适应** —— 原默认 `min(4, cpus)` 太小：实测段**84% 在等待**（`#1104`：三段
// 墙钟 79.1s｜CPU 13.7s｜等待 82.6%）→ CPU 远未饱和 → 并发才是瓶颈侧。
//注意：上限取 **8**（**不硬写 16** —— CI runner 核数未知 → 用 `min(8, cpus)` 自适应）；
// `--jobs=` / `--serial` 仍可覆盖（调试与对照不变）。
const jobs = serial ? 1 : Math.max(1, Number(val('jobs', Math.min(8, cpus().length))));
// ── `#1072` 测量仪表的**自证**（票面验收：①仪器可假 → 表里能看出来 ②仪器不得改变被测行为）──────
// 为什么必须自证：这两条**都不会在 CI 里自然发生** → CI 绿**不能**证明它们成立。
if (has('profile-selftest')) {
	let bad = 0, n = 0;
	const t = (label, ok, extra = '') => { n++; if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} 仪表自证·${label}${extra ? `  ${extra}` : ''}`); };
	const { spawnSync } = await import('node:child_process');
	ensureParent(join(PROFILE_DIR, '_.keep'));   // ← 同修（本自证要能在"目录不存在"时跑通）
	const TMP = join(PROFILE_DIR, 'profile-selftest.jsonl');
	const USES = join(PROFILE_DIR, '._profile_selftest_uses_jsdom.mjs');
	const PLAIN = join(PROFILE_DIR, '._profile_selftest_plain.mjs');
	writeFileSync(USES, "import { JSDOM } from 'jsdom';\nconst d = new JSDOM('<div id=a>x</div>');\nconsole.log('OUT', d.window.document.getElementById('a').textContent, d instanceof JSDOM);\n");
	writeFileSync(PLAIN, "const s = [1,2,3].reduce((a,b)=>a+b,0);\nconsole.log('OUT', s);\n");
	const run = (file, env) => spawnSync('node', ['--import', './scripts/lib/instrument-jsdom.mjs', file], { encoding: 'utf8', env: { ...process.env, ...env }, shell: false });
	const runOff = (file) => spawnSync('node', [file], { encoding: 'utf8' });

	// ① **不改被测行为**：同一段，开／关仪器 → stdout 必须**逐字节相同**、rc 相同（票面硬约束）
	{
		const off = runOff(USES), on = run(USES, { SAGITRS_PROFILE_OUT: TMP, SAGITRS_PROFILE_ID: 'x' });
		t('🔴 **不改被测行为**（用 jsdom 的段）：开／关仪器 ⇒ stdout **逐字节相同** ＋ rc 相同',
			off.stdout === on.stdout && off.status === on.status, `(rc ${off.status}/${on.status})`);
		const pOff = runOff(PLAIN), pOn = run(PLAIN, { SAGITRS_PROFILE_OUT: TMP, SAGITRS_PROFILE_ID: 'p' });
		t('🔴 **不改被测行为**（**不用 jsdom** 的段）：stdout 逐字节相同 ＋ rc 相同 ✓（惰性装载 ✓）',
			pOff.stdout === pOn.stdout && pOff.status === pOn.status);
	}
	// ② **仪器真的在量**（不是"装上了但恒为 0"）
	{
		const recs = readFileSync(TMP, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
		const jsr = recs.find((r) => r.id === 'x'), pl = recs.find((r) => r.id === 'p');
		t('🔴 用 jsdom 的段 ⇒ 记到 `n≥1`、`构造耗时>0`、`装载耗时>0`、`首个构造@>0`',
			!!jsr && jsr.n >= 1 && jsr.jsdomMs > 0 && jsr.loadMs > 0 && jsr.firstAtMs > 0,
			jsr ? `(n=${jsr.n} 装载=${jsr.loadMs}ms 构造=${jsr.jsdomMs}ms)` : '');
		t('**不用** jsdom 的段 ⇒ `n=0` 且**装载/构造都是 null/0**（惰性 ⇒ 不碰 ✓）',
			!!pl && pl.n === 0 && pl.jsdomMs === 0 && pl.loadMs === null);
	}
	// ③ **仪器本身可假 → 表里能看出来**（票面验收）—— 交叉核对：拿**父进程独立量到的墙钟**当旁证
	{
		const clean = mergeProfile({ walls: new Map([['a', 5000]]), records: [{ id: 'a', n: 2, jsdomMs: 100, loadMs: 200, firstAtMs: 300, uptimeAtLoadMs: 20, procs: 1 }] });
		t('干净读数 ⇒ **无问题** ✓', clean.problems.length === 0);
		const fakeBig = mergeProfile({ walls: new Map([['a', 5000]]), records: [{ id: 'a', n: 2, jsdomMs: 99999, loadMs: 0, firstAtMs: 10, uptimeAtLoadMs: 20, procs: 1 }] });
		t('🔴 **伪造"构造耗时大于整段墙钟"** ⇒ 必报（部件大于整体 ⇒ 不可能 ✓）', fakeBig.problems.length >= 1);
		const fakeLoad = mergeProfile({ walls: new Map([['a', 5000]]), records: [{ id: 'a', n: 1, jsdomMs: 10, loadMs: 99999, firstAtMs: 10, uptimeAtLoadMs: 20, procs: 1 }] });
		t('🔴 **伪造"装载耗时大于整段墙钟"** ⇒ 必报 ✓', fakeLoad.problems.length >= 1);
		const fakeZero = mergeProfile({ walls: new Map([['a', 5000]]), records: [{ id: 'a', n: 0, jsdomMs: 42, loadMs: 0, firstAtMs: null, uptimeAtLoadMs: 20, procs: 1 }] });
		t('🔴 **伪造"构造 0 次却有耗时"** ⇒ 必报（自相矛盾 ✓）', fakeZero.problems.length >= 1);
		const fakeSum = mergeProfile({ walls: new Map([['a', 1000]]), records: [{ id: 'a', n: 1, jsdomMs: 900, loadMs: 900, firstAtMs: 10, uptimeAtLoadMs: 20, procs: 1 }] });
		t('🔴 **三段相加明显超过墙钟**（各段单独都不越界 ⇒ 只有总账能抓 ✓）⇒ 必报', fakeSum.problems.length >= 1);
		t('**没有读数**的段 ⇒ 不算问题（合法：该段不用 jsdom ✓）', mergeProfile({ walls: new Map([['b', 100]]), records: [] }).problems.length === 0);
		// 结论行：共享省多少（(Σ − 一次) → 正）
		const est = harnessEstimate([{ n: 1, loadMs: 200, jsdomMs: 50, procs: 1, wallMs: 5000 }, { n: 1, loadMs: 200, jsdomMs: 50, procs: 1, wallMs: 5000 }]);
		t('`harnessEstimate`：2 段各付一次 ⇒ **省 = (Σ − 一次) > 0**', est.n === 2 && est.saveSerialMs > 0, `(省 ${est.saveSerialMs.toFixed(0)}ms)`);
	}
	// ⑬ **落点目录不存在时不许崩**（`#1103` 复核抓到的真缺陷：`ENOENT … build/…`）
	//注意：验法**不改现实**（不去删真 `build/`）→ 把"目录不存在"当**入参**喂给它：
	// `SAGITRS_PROFILE_DIR=<一个不存在的临时目录>` → 交给**真实进程**跑一遍 → 必须 rc=0 且**自己建出目录**
	{
		const FRESH = join(PROFILE_DIR, '._profile_selftest_fresh_dir', 'deeper');
		try { rmSync(join(PROFILE_DIR, '._profile_selftest_fresh_dir'), { recursive: true, force: true }); } catch { /* 首次 */ }
		const r = spawnSync('node', [fileURLToPath(new URL('./run-tests.mjs', import.meta.url)),
			'--only=scripts-probe-gates-mjs-selfcheck', '--jobs=1', '--profile'],
			{ encoding: 'utf8', env: { ...process.env, SAGITRS_PROFILE_DIR: FRESH } });
		t('🔴 **落点目录不存在** ⇒ **不许崩**（真进程跑 `--only=… --profile`）⇒ rc=0 且**自己建出目录** ✓',
			r.status === 0 && existsSync(join(FRESH, 'segment-profile.md')),
			`(rc ${r.status}${r.status === 0 ? '' : ` · ${(r.stderr ?? '').split('\n').filter(Boolean).slice(-1)[0] ?? ''}`})`);
		t('🔴 上条的**能假**：把 `mkdirSync` 摘掉后同一条会 `ENOENT` 崩（本格的存在理由 ✓）',
			/ENOENT/.test(r.stderr ?? '') === false && r.status === 0);
		try { rmSync(join(PROFILE_DIR, '._profile_selftest_fresh_dir'), { recursive: true, force: true }); } catch { /* 清场 */ }
	}
	t('**基线零问题**：真跑一遍合并 ⇒ 0（仪器不制造假问题 ✓）', mergeProfile({ walls: new Map([['z', 400]]), records: [{ id: 'z', n: 1, jsdomMs: 40, loadMs: 250, firstAtMs: 250, uptimeAtLoadMs: 20, procs: 1 }] }).problems.length === 0);
	try { rmSync(TMP, { force: true }); rmSync(USES, { force: true }); rmSync(PLAIN, { force: true }); } catch { /* 清场尽力而为 */ }
	console.log(bad ? `\n✗ 仪表自证失败 ${bad} 项` : `\n✔ 仪表自证通过（${n - bad}/${n}）`);
	process.exit(bad ? 1 : 0);
}

const serialCost = plan.reduce((a, s) => a + s.cost, 0);

// `#1072`：`--profile` → 给每段装测量仪表（**报告型，不入任何门禁** —— 票面要求）。
//注意：落点 `build/` 是 gitignored；**跑前清掉旧 jsonl**（否则上次的读数混进来 → 假新鲜）。
//注意：**`#1103` 复核抓到的真缺陷**（一行级，已修）：早先**直接写** `build/…` 而**不确保目录存在**
// → 在**新 worktree／新 clone／`git clean -xfd` 后**（`build/` 被 gitignore → 不带）、
// 或**任何没选中 `build-mjs` 的 `--only=` 用法**（`build/` 由该段创建）→ **当场 `ENOENT` 崩**
// —— 而 `--only=` 是**文档化用法**（跑器头注／票面都写）→ 不是"环境问题"。
// → 修法照**仓内既有惯例**（`scripts/probe-gates.mjs:295`／`report-polarity-gap.mjs:136` 同形）：
// **写之前 `mkdirSync(dirname(path), { recursive: true})`** —— 不新造形态。
// → 目录本身**可注入**（`SAGITRS_PROFILE_DIR`）：让自证能把"目录不存在"当**入参**喂进来验
//（㊱：攻击面落在**判据**上，**不是**去删真 `build/` 改现实）。
if (has('profile')) {
	ensureParent(PROFILE_OUT);   // ← 同上 // ← 缺陷修在此（子进程 append 也要它先存在）
	try { rmSync(PROFILE_OUT, { force: true }); } catch { /* 没有更好 → 首次跑 */ }
	profileEnv = (seg) => ({
		NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(join(ROOT, 'scripts/lib/instrument-jsdom.mjs')).href}`.trim(),
		SAGITRS_PROFILE_OUT: join(ROOT, PROFILE_OUT),
		SAGITRS_PROFILE_ID: seg.id,
	});
	console.log(`○ --profile：已装测量仪表（落点 \`${PROFILE_OUT}\`，gitignored ✓）——**报告型，不入任何门禁** ✓`);
}

console.log(`══ CI 测试跑器 ══  ${plan.length} 段 · ${serial ? '串行' : `并发 ${jobs}`} · 串行实测合计约 ${sec(serialCost * 1000)}`);
const done = [];
const t0 = Date.now();
const { results, skipped, wallMs, aborted } = await runPlan(plan, {
	jobs,
	onDone: (r) => {
		done.push(r);
		if (r.skipped) { console.log(`○ ${'—'.padStart(7)}  ${r.seg.id}  → 跳过（前序段未成功）`); return; }
		const tag = r.code === 0 ? '✓' : '✗';
		console.log(`${tag} ${sec(r.ms).padStart(7)}  ${r.seg.id}${r.code === 0 ? '' : `  → 退出码 ${r.code}`}`);
		if (r.code !== 0) {
			const d = failureDigest(r.out);
			if (d.total) console.log(`\n──── ${r.seg.id} 的关键行（全量输出里的 ✗/失败 行，共 ${d.total} 条${d.truncated ? `，只显示前 ${d.lines.length}` : ''}）────\n${d.lines.join('\n')}`);
			console.log(`\n──── ${r.seg.id} 的输出（尾部 28 行）────\n${tail(r.out)}\n──── 输出结束 ────\n`);
		}
	},
});

const failed = results.filter((r) => r.code !== 0);
console.log(`\n${aborted ? '⛔ setup 段失败，已中止' : '完成'}：${results.length - failed.length}/${plan.length} 通过${skipped.length ? ` · 跳过 ${skipped.length}` : ''} · 墙钟 ${sec(Date.now() - t0)}（并发段 ${sec(wallMs)} · 串行合计约 ${sec(serialCost * 1000)}）`);
// `#1072`：写逐段表（**无论成败都写** —— 失败段的读数同样有价值）
if (has('profile')) {
	const walls = new Map(results.filter((r) => !r.skipped).map((r) => [r.seg.id, r.ms]));
	const records = [];
	try {
		for (const l of readFileSync(PROFILE_OUT, 'utf8').split('\n')) if (l.trim()) { try { records.push(JSON.parse(l)); } catch { /* 半行（并发追加被打断）→ 跳过 */ } }
	} catch { /* 一条都没有 → 全部段都不用 jsdom → 合法 */ }
	const { rows, problems } = mergeProfile({ walls, records });
	const est = harnessEstimate(rows);
	const withJsdom = rows.filter((r) => r.n > 0).sort((a, b) => b.jsdomMs - a.jsdomMs);
	const tierById = new Map(plan.map((s) => [s.id, tierOf(s)]));
	const md = [
		'# 逐段读数（`#1072` 测量仪表）', '',
		`> 生成：\`node scripts/run-tests.mjs --tier=${tierWant} --profile\` ✓ ｜ 段数 ${rows.length} ｜ 用 jsdom 的段 ${est.n} ｜ 构造总次数 ${est.constructions} ｜ 进程数 ${est.nProcs}`,
		'> ⚠️ **报告型，不入任何门禁** ✗；\`build/\` 全系 gitignored ✓', '',
		'## 结论（票面验收那句）', '',
		`**把 ${est.n} 段（共 ${est.nProcs} 个进程）合并到一次 jsdom 启动 ⇒ 串行工作量省约 ${sec(est.saveSerialMs)}**`,
		'',
		`- **每进程 jsdom 启动成本**（＝共享 harness 能省掉的）＝ 模块装载 ${sec(est.loadTotal)} ＋ 构造 ${sec(est.consTotal)} ＝ **${sec(est.totalMs)}**（均摊 ${est.perProc.toFixed(0)}ms/进程）`,
		'- ⚠️ 这是**串行工作量**口径 ✗：墙钟收益还取决于并发度与关键路径 ⇒ **不能直接读成墙钟** ✓',
		'- ⚠️ `装载`／`构造` 两栏是**实测**；`其余` 是**推算**（墙钟 − 各实测项）⇒ 别混读 ✓', '',
		'## 逐段', '',
		'| 段 | tier | 墙钟 | 用 jsdom | 构造次数 | **装载（实测）** | **构造（实测）** | 其余（**推算**） | 首个构造@ | 进程 | 钩子 |',
		'|---|---|---|---|---|---|---|---|---|---|---|',
		...rows.map((r) => `| \`${r.id}\` | ${tierById.get(r.id) ?? '?'} | ${sec(r.wallMs)} | ${r.boot ? '✅' : '—'} | ${r.n} | ${r.loadMs === null ? '—' : `${r.loadMs.toFixed(0)}ms`} | ${r.boot ? `**${r.jsdomMs.toFixed(0)}ms**` : '—'} | ${r.restMs.toFixed(0)}ms | ${r.firstAtMs === null ? '—' : `${r.firstAtMs.toFixed(0)}ms`} | ${r.procs} | ${r.hooks ?? '—'} |`),
		'', '## 用 jsdom 的段（按 装载＋构造 降序）', '',
		...withJsdom.map((r) => `- \`${r.id}\`：装载 ${r.loadMs === null ? '—' : `${r.loadMs.toFixed(0)}ms`} ＋ 构造 ${r.n} 次 ${r.jsdomMs.toFixed(0)}ms（墙钟 ${sec(r.wallMs)} · tier ${tierById.get(r.id) ?? '?'}）`),
	].join('\n') + '\n';
	ensureParent(join(PROFILE_DIR, '_.keep'));   // ← 同修（`--only=` 时 `build/` 可能不存在）
	writeFileSync(join(PROFILE_DIR, 'segment-profile.json'), JSON.stringify({ est, rows }, null, '\t') + '\n');
	writeFileSync(join(PROFILE_DIR, 'segment-profile.md'), md);
	console.log(`\n○ 逐段表 ⇒ \`${PROFILE_DIR}/segment-profile.md\` ＋ \`${PROFILE_DIR}/segment-profile.json\`（**报告型** ✓）`);
	console.log(`○ 结论：**${est.n} 段**用 jsdom ⇒ 合并到一次启动，**串行工作量**省约 **${sec(est.saveSerialMs)}**（(N−1)×均值）`);
	if (problems.length) { console.error(`\n${problems.join('\n')}`); console.error(`✗ 仪器一致性检查 ${problems.length} 条未过（**读数不可信** ⇒ 别用它算收益 ✗）`); }
}

if (failed.length) {
	console.error(`\n✗ ${failed.length} 段失败：${failed.map((r) => r.seg.id).join(', ')}`);
	process.exit(1);
}
console.log(`✔ 全部通过（${plan.length} 段）`);
