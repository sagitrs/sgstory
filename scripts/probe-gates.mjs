#!/usr/bin/env node
/** 探针运行器（`#908` ① ✓）—— **最小变异 ＋ 必须红**，两半都要 ✓。
 *
 * 用法（**可粘贴复跑** ✓，⑱/⑲）：
 * ```
 * node scripts/probe-gates.mjs --list              # 清单（谁被探过 ✓ 档位 ✓）
 * node scripts/probe-gates.mjs --selfcheck         # 只验**运行器自己**能假 ✓（纯函数 ＋ 注入 0 处必须报 ✓）
 * node scripts/probe-gates.mjs --probe=fast        # 跑 fast 档 ✓（结果写 build/probe-results.json ✓ —— 落点**自己建** ✓ 无前置 ✓）
 * node scripts/probe-gates.mjs --probe=full        # 跑全部 ✓（慢 ✓）
 * node scripts/probe-gates.mjs --check             # 结构校验 ✓（不跑探针 ✗：清单 ↔ 台账行对得上吗 ✓）
 * ```
 *
 * ## 一条探针的四步（每步都可能**红在别的地方**，所以分开报 ✓）
 * 1. **前置**（`pre` ✓）：任一失败 ⇒ 报「**缺前置**」✗（**不报"探针不咬"** ✓ —— 那是两件事 ✓）；
 * 2. **正**：`cmd` 变异前必须 **rc=0** ✓（否则报「变异前就红」✗）；
 * 3. **下刀**：`find` 在 `mutation.file` 里必须**恰好命中 1 处** ✓（0 处 ⇒ 红 ✓ 并打印「注入确认 0 处」✗；>1 ⇒ 红 ✓ 要求写更唯一的锚 ✓）；
 * 4. **反**：`cmd` 必须 **rc=1** ✓ 且输出命中 `expect.stdout` ✓（不命中 ⇒ 报「红了但不是它」✗ —— 报红而没点名，等于没指名 ✓）。
 * 变异**必还原**（`finally` ＋ 还原后再核一次 ✓）。
 *
 * ## 读数落到哪
 * `build/probe-results.json`（**不入仓** ✗，与其它 build 产物同 ✓）：每条记 `{ id, ok, target, targetSha, mode }` ✓
 * —— `targetSha` 让台账能判**新鲜度** ✓（被测件改了 ⇒ 台账不再显示 `✅` ✗ ⇒ 不会拿旧读数充数 ✓）。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { PROBES } from './probes.mjs';

const RECORD = 'build/probe-results.json';
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

// ── 纯函数（能被 `--selfcheck` 驱动 ⇒ 判据本身有能假的另一半 ✓）──────────
/** 数命中（**先数再下刀** ✓ —— 文件/行号不是锚 ✗，打歪的刀就是这么来的 ✓）。 */
export const countHits = (src, find) => {
	if (!find) return 0;
	let n = 0;
	for (let i = src.indexOf(find); i !== -1; i = src.indexOf(find, i + find.length)) n++;
	return n;
};
/** 应用最小变异：**只在恰好 1 处时**才动 ✗，否则原样返回 ＋ 报数 ✓。 */
export const applyMutation = (src, find, replace) => {
	const count = countHits(src, find);
	if (count !== 1) return { out: src, count, applied: false };
	return { out: src.replace(find, replace), count, applied: true };
};
/** 三态判定（纯 ✓）：`ok` / `reason` 二选一 ✓ —— 每条 reason 都对应**一种"红在别处"** ✓。 */
export const verdictOf = ({ preOk = true, baseRc, mutatedRc, hitCount, stdout = '', expect = {} }) => {
	if (!preOk) return { ok: false, reason: '缺前置（未跑到探针 ✗ —— 与"探针不咬"是两件事 ✓）' };
	if (hitCount === 0) return { ok: false, reason: '注入确认 0 处 ⇒ 刀没下到真语句（读数不成立 ✗）' };
	if (hitCount > 1) return { ok: false, reason: `注入确认 ${hitCount} 处 ⇒ 锚不唯一（要求恰好 1 ✓）` };
	if (baseRc !== 0) return { ok: false, reason: `变异前就红（rc=${baseRc}）⇒ 这次"红"不是变异造成的 ✗` };
	const wantRc = expect.rc ?? 1;
	if (mutatedRc !== wantRc) return { ok: false, reason: `变异后 rc=${mutatedRc} ≠ 期望 ${wantRc} ⇒ **探针不咬** ✗` };
	if (expect.stdout && !expect.stdout.test(stdout)) return { ok: false, reason: `红了但报文没点名 ${expect.stdout} ⇒ 红了不是它 ✗` };
	return { ok: true, reason: '咬住 ✓（变异前绿 ⇒ 变异后红 ⇒ 点名该判据 ✓）' };
};

// ── 自检（运行器自己也得能假 ✓）──────────────────────────────────────
const selfcheck = () => {
	let bad = 0;
	const h = (label, ok) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${label}`); };
	h('`countHits`：命中 0 处 ⇒ 0 ✓', countHits('abc', 'zzz') === 0);
	h('`countHits`：命中 2 处 ⇒ 2 ✓', countHits('aXaX', 'X') === 2);
	h('`applyMutation`：**0 处不许动** ✗（原样返回 ✓）', applyMutation('abc', 'zzz', 'Q').applied === false);
	h('`applyMutation`：2 处不许动 ✗（锚不唯一 ✓）', applyMutation('aXaX', 'X', 'Q').applied === false);
	h('`applyMutation`：1 处 ⇒ 换掉 ✓', applyMutation('aXb', 'X', 'Q').out === 'aQb');
	h('`verdictOf`：**注入 0 处 ⇒ 必须红** ✗（"打歪的刀"那一族 ✓）', verdictOf({ baseRc: 0, mutatedRc: 1, hitCount: 0 }).ok === false);
	h('`verdictOf`：**变异前就红 ⇒ 不成立** ✗', verdictOf({ baseRc: 1, mutatedRc: 1, hitCount: 1 }).ok === false);
	h('`verdictOf`：**不咬（变异后仍绿）⇒ 红** ✗', verdictOf({ baseRc: 0, mutatedRc: 0, hitCount: 1 }).ok === false);
	h('`verdictOf`：**红了但没点名 ⇒ 红** ✗', verdictOf({ baseRc: 0, mutatedRc: 1, hitCount: 1, stdout: '别的错', expect: { rc: 1, stdout: /目标判据/ } }).ok === false);
	h('`verdictOf`：缺前置 ⇒ 报**缺前置**（不报"不咬" ✓）', /缺前置/.test(verdictOf({ preOk: false, baseRc: 0, mutatedRc: 1, hitCount: 1 }).reason));
	h('`verdictOf`：正＋反都成立 ⇒ ok ✓', verdictOf({ baseRc: 0, mutatedRc: 1, hitCount: 1, stdout: '目标判据 红', expect: { rc: 1, stdout: /目标判据/ } }).ok === true);
	if (bad) { console.error(`\n✗ 探针运行器自检 ${bad} 条未过`); process.exit(1); }
	console.log('\n✔ 探针运行器自检通过（11 条 ✓：三态判定 ＋ 注入计数 ＋ 缺前置分家 ✓）');
};

// ── 跑一条探针 ───────────────────────────────────────────────────────
const run = (cmd) => {
	try { return { rc: 0, out: execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
	catch (e) { return { rc: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }; }
};

const probeOne = (p) => {
	const pre = [];
	for (const c of p.pre ?? []) { const r = run(c); if (r.rc !== 0) pre.push(`${c} ⇒ rc=${r.rc}`); }
	const target = p.mutation?.file ?? '';
	if (!target || !existsSync(target)) return { id: p.id, ok: false, reason: `探针件缺失/被测件不存在（${target || '未写 file'} ✗）—— 标了 ✅ 却没有探针 ⇒ 红 ✓`, injected: 0, pre };
	const original = readFileSync(target, 'utf8');
	const base = pre.length ? { rc: 1, out: '' } : run(p.cmd);
	const { out, count, applied } = applyMutation(original, p.mutation.find, p.mutation.replace);
	if (!applied) return { id: p.id, ok: false, reason: verdictOf({ preOk: pre.length === 0, baseRc: base.rc, mutatedRc: -1, hitCount: count }).reason, injected: count, pre };
	let mutated = { rc: -1, out: '' };
	try {
		writeFileSync(target, out);
		mutated = run(p.cmd);
	} finally {
		writeFileSync(target, original);
	}
	const restored = readFileSync(target, 'utf8') === original;
	const v = verdictOf({ preOk: pre.length === 0, baseRc: base.rc, mutatedRc: mutated.rc, hitCount: count, stdout: mutated.out, expect: p.expect });
	return { id: p.id, ok: v.ok && restored, reason: restored ? v.reason : '还原失败 ✗（被测件没回到原样 ⇒ 必须红 ✓）', injected: count, pre, target, targetSha: sha(original), mode: p.tier };
};

// ── 结构校验（不跑探针 ✓）────────────────────────────────────────────
const rowsOf = () => {
	// 台账的行 id 从生成器里取 ✓（同一把尺子 ✓）；拿不到就**说明**并跳过这半 ✗（不假装过了 ✓）
	try {
		const out = execFileSync('node', ['-e', "import('./scripts/report-gate-ledger.mjs').then(m=>console.log(JSON.stringify(m.rowIds??[])))"], { encoding: 'utf8' });
		return JSON.parse(out.trim() || '[]');
	} catch { return null; }
};

const checkStructure = () => {
	let bad = 0;
	const ids = rowsOf();
	if (ids === null) { console.log('⚠ 台账行 id 取不到（生成器未导出 `rowIds` ✗）⇒ 只做清单自校验 ✓'); }
	else {
		for (const p of PROBES) if (!ids.includes(p.id)) { bad++; console.error(`✗ 探针 \`${p.id}\` 对不上台账行 ✗（点了名却没人 ⇒ 红 ✓）`); }
	}
	const dup = PROBES.map((p) => p.id).filter((v, i, a) => a.indexOf(v) !== i);
	if (dup.length) { bad++; console.error(`✗ 同一行挂了多条探针：${dup.join(', ')} ✗`); }
	if (bad) { console.error(`\n✗ 探针结构校验 ${bad} 条未过`); process.exit(1); }
	console.log(`✔ 探针结构校验通过（${PROBES.length} 条 ✓：清单 ↔ 台账行对得上 ✓ 无重复 ✓）`);
};

// ── 主 ───────────────────────────────────────────────────────────────
const arg = process.argv.slice(2);
if (arg.includes('--selfcheck')) { selfcheck(); process.exit(0); }
if (arg.includes('--list')) {
	console.log(`探针清单（${PROBES.length} 条 ✓）—— 用法：node scripts/probe-gates.mjs --probe=fast`);
	for (const p of PROBES) console.log(`  · [${p.tier}] ${p.id}  ←  变异 ${p.mutation.file}`);
	process.exit(0);
}
if (arg.includes('--check')) { checkStructure(); process.exit(0); }
const mode = (arg.find((a) => a.startsWith('--probe=')) ?? '--probe=fast').split('=')[1];
const selected = mode === 'full' ? PROBES : PROBES.filter((p) => p.tier === 'fast');
console.log(`══ 探针（档位 ${mode} ✓ 选中 ${selected.length}/${PROBES.length} 条 ✓）══`);
const results = selected.map(probeOne);
let bad = 0;
for (const r of results) {
	if (!r.ok) bad++;
	console.log(`${r.ok ? '✅' : '✗'} ${r.id}  [注入确认 ${r.injected ?? 0} 处 ✗]  ${r.reason}${r.pre?.length ? ` ｜ 前置失败: ${r.pre.join('; ')}` : ''}`);
}
// 复核留（**MAJOR** ✗，实测 ✓）：干净树**没有 build/**（它在 .gitignore 里 ✓，唯一创建者是 `build.mjs` ✓）
//   ⇒ 直接写记录 ⇒ ENOENT ⇒ rc=1 ✗ —— 而 CI 因 `test-plan.mjs` 的 `needs:['build-mjs']` **不受影响** ✗
//   ⇒ 只在「单跑／新树」暴露 ✓（票面又把它列为**可复跑读数** ✗ ⇒ 照抄必崩 ✓）。正形 ✓：落点**自己建** ✓，不许以 ENOENT 的形式出现 ✗。
mkdirSync(dirname(RECORD), { recursive: true });
writeFileSync(RECORD, JSON.stringify({ mode, probes: results }, null, '\t') + '\n');
const uncovered = PROBES.filter((p) => !selected.includes(p)).map((p) => p.id);
console.log(`\n读数 ⇒ ${RECORD}（**不入仓** ✗）｜ 本轮未探: ${uncovered.length} 条${uncovered.length ? '＝' + uncovered.join(', ') : ''}`);
if (bad) { console.error(`\n✗ 探针 ${bad} 条未咬住（不看"跑了多少"，只看"咬没咬" ✓）`); process.exit(1); }
console.log(`\n✔ 探针 ${results.length} 条全部咬住（正：变异前绿 ✓ 反：变异后红且点名 ✓）`);
