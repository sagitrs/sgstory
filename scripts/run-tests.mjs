// CI 测试跑器（#381）：把 `scripts/test-plan.mjs` 的计划按**有界并行**跑起来。
//
// 为什么需要：`npm test` 原来是 53 段串行的 `&&` 链——CI runner 有 4 核（仓库 public），
// 实际只用 1 核，光 `npm test` 就是 207s（环境准备只 17s）。段与段之间除了「build 必须先跑完」
// 之外没有依赖（各段写入路径互不相同，已核），所以并行是**无损**的加速。
//
// 语义要点（都是踩过的坑）：
//   ① `phase:'build'` 的段**先跑且独占**——后面所有段都可能读 `dist/`；
//   ② 失败**不吞**：该段 stdout/stderr 原样打出来（尾部），并汇总「哪几段红」；
//   ③ 退出码：0 全绿 / 1 有失败 / 2 用法错或**选择为空**（#366 的教训：空选择不许当绿）；
//   ④ `--jobs` 默认 `min(4, cpus)`：CI 4 核用满，本机也不会把 32 核全占（避免把 #304 类
//      负载敏感断言推到更不稳定的区间）。
//
// 用法：
//   node scripts/run-tests.mjs                 # 并行（默认）
//   node scripts/run-tests.mjs --serial        # 串行，与旧链等价（排查/对照用）
//   node scripts/run-tests.mjs --jobs=2        # 自定义并发
//   node scripts/run-tests.mjs --only=scenarios --only=t-reread   # 只跑匹配的段（可多次）
//   node scripts/run-tests.mjs --list          # 只列计划
//   node scripts/run-tests.mjs --selftest      # 跑器自身的自证（不跑真计划）

import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { testPlan } from './test-plan.mjs';

const argv = process.argv.slice(2);
const has = (k) => argv.includes(`--${k}`);
const val = (k, d) => {
	const hit = argv.find((a) => a.startsWith(`--${k}=`));
	return hit ? hit.slice(k.length + 3) : d;
};

// ── 执行器（导出以便自证；纯执行，不含 CLI 语义）──────────────────────────
export const runSegment = (seg) => new Promise((resolve) => {
	const t0 = Date.now();
	const child = spawn(seg.cmd, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
//       ③ 返回 { results, skipped, wallMs, aborted }。
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
			const s = remaining.find((x) => ready(x) && !running.has(x.id));
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

const sec = (ms) => `${(ms / 1000).toFixed(1)}s`;
const tail = (s, n = 28) => s.split('\n').slice(-n).join('\n');

// ── 自证（不跑真计划）────────────────────────────────────────────────────
const selftest = async ({ quiet = false } = {}) => {
	let bad = 0;
	const t = (msg, ok) => { if (!ok) bad++; if (!quiet || !ok) console.log(`${ok ? '✓' : '✗'} ${msg}`); };

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

	if (bad) { console.error(`\n✗ 跑器自证失败 ${bad} 项`); process.exit(1); }
	if (!quiet) console.log('\n✔ 跑器自证通过：成功/失败识别、失败输出不吞、并行真的重叠、setup 红即中止、needs 前置/级联跳过/配错报错');
	else console.log('✓ 跑器自证通过（成功/失败识别 · 输出不吞 · 并行真重叠 · setup 红即中止 · needs 语义）');
	return true;
};

if (has('selftest')) { await selftest(); process.exit(0); }
// 跑器是「CI 绿不绿」的判定者，它自己坏了必须**当场**暴露——所以默认先自证（约 2s，`--no-selftest` 可关）。
if (!has('no-selftest')) await selftest({ quiet: true });

// ── CLI ─────────────────────────────────────────────────────────────
const plan0 = testPlan();
if (has('list')) {
	console.log(`计划 ${plan0.length} 段（串行实测合计 ${sec(plan0.reduce((a, s) => a + s.cost, 0) * 1000)}）：`);
	for (const s of plan0) console.log(`  ${s.phase === 'build' ? '[build]' : '       '} ${s.id}${s.needs ? `  (needs: ${s.needs.join(', ')})` : ''}  ${s.cmd}`);
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
const plan = only.length ? withDeps(plan0.filter((s) => only.some((o) => s.id.includes(o) || s.cmd.includes(o)))) : plan0;

if (!plan.length) { console.error('✗ 没有匹配到任何段（--only 写错了？）——空选择不是绿'); process.exit(2); }
if (only.length && !plan.some((s) => s.phase === 'build') && plan0.some((s) => s.phase === 'build')) {
	console.log(`○ 提示：本次未选中 build 段，dist 可能不是最新的（--only 调试时常见）`);
}
// 计划自检（needs 配错/成环要在起跑前报，而不是跑到一半才发现）
const planProblems = validatePlan(plan);
if (planProblems.length) { console.error(`✗ 计划有问题：\n  ${planProblems.join('\n  ')}`); process.exit(2); }

const serial = has('serial');
const jobs = serial ? 1 : Math.max(1, Number(val('jobs', Math.min(4, cpus().length))));
const serialCost = plan.reduce((a, s) => a + s.cost, 0);

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
		if (r.code !== 0) console.log(`\n──── ${r.seg.id} 的输出（尾部 28 行）────\n${tail(r.out)}\n──── 输出结束 ────\n`);
	},
});

const failed = results.filter((r) => r.code !== 0);
console.log(`\n${aborted ? '⛔ setup 段失败，已中止' : '完成'}：${results.length - failed.length}/${plan.length} 通过${skipped.length ? ` · 跳过 ${skipped.length}` : ''} · 墙钟 ${sec(Date.now() - t0)}（并发段 ${sec(wallMs)} · 串行合计约 ${sec(serialCost * 1000)}）`);
if (failed.length) {
	console.error(`\n✗ ${failed.length} 段失败：${failed.map((r) => r.seg.id).join(', ')}`);
	process.exit(1);
}
console.log(`✔ 全部通过（${plan.length} 段）`);
