// #316 拆分的护城河：**25 个开关的输出必须与拆分前逐字节一致**（只搬家、不改行为）。
//
// 用法：
//   node test/audit-golden.mjs            # 与基线比对（不符则 exit 1）
//   node test/audit-golden.mjs --update   # 写入/更新基线 test/audit-golden.json
//   node test/audit-golden.mjs --selftest # 自证：比对函数必须咬得住（不跑 audit）
//
// 两条例外（都显式标注，不静默放宽）：
//   ① `--dragon`：封印战蒙特卡洛是 20000 局 + Math.random()，**输出天然不确定**（#331 已登记）。
//      本门对它走「**结构比对**」——把百分数归一为 `N%`，其余逐字节比对；这样
//      「✓/✗ 判定符号、行数、结论文本」的漂移仍会被抓住，而数值抖动不会把重构验证变成 flaky。
//      是否给 MC 加固定种子（让门完全确定性）属**行为变更**，留待单独裁决。
//   ② 收尾行（数据源提示）含路径文本，不参与归一化，作为普通内容比对。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const GOLDEN = 'test/audit-golden.json';
const FLAGS = [
	'truth', 'investment', 'echoes', 'choices', 'sel', 'nosl', 'gear', 'interact', 'social', 'combat',
	'a11y', 'starbudget', 'consequences', 'sitedisc', 'systems', 'text', 'npc', 'dragon', 'checks',
	'economy', 'items', 'tokens', 'canon', 'craft',
];

// 归一化：只对不确定输出的开关生效（其余逐字节）
export const normalize = (flag, text) => (flag === 'dragon' ? text.replace(/[\d.]+%/g, 'N%') : text);

// flag 传 null ＝ 「无参数全跑」（wantAll 只在没有任何 `--` 参数时为真）
export const runFlag = (flag) => {
	const args = flag === null ? ['scripts/audit.mjs'] : ['scripts/audit.mjs', `--${flag}`];
	try {
		const out = execFileSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
		return { code: 0, out };
	} catch (e) {
		return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
	}
};

// 非「门」的 CLI 修饰符：只影响退出码/输出方式，不需要 golden 保护
export const FLAG_MODIFIERS = ['check'];

// 源码里实际声明的开关（防新增漏保护 / 清单过期）
const argFlagsFromSource = () => {
	const src = readFileSync('scripts/audit.mjs', 'utf8');
	return [...new Set([...src.matchAll(/arg\('([a-z0-9-]+)'\)/g)].map((m) => m[1]))]
		.filter((f) => !FLAG_MODIFIERS.includes(f))
		.sort();
};

const capture = () => {
	const snapshot = {};
	for (const f of FLAGS) {
		const { code, out } = runFlag(f);
		snapshot[f] = { code, out: normalize(f, out) };
	}
	return snapshot;
};

// ── 比对（纯函数，供自证）──────────────────────────────────────────────
export const diffSnapshot = (baseline, current) => {
	const problems = [];
	for (const f of Object.keys(baseline)) {
		if (!(f in current)) { problems.push({ flag: f, kind: 'missing', detail: '当前快照缺少该开关' }); continue; }
		if (baseline[f].code !== current[f].code) problems.push({ flag: f, kind: 'exit-code', detail: `退出码 ${current[f].code} ≠ 基线 ${baseline[f].code}` });
		if (baseline[f].out !== current[f].out) {
			const a = baseline[f].out.split('\n');
			const b = current[f].out.split('\n');
			const firstDiff = a.findIndex((line, i) => line !== (b[i] ?? '__missing__'));
			problems.push({
				flag: f, kind: 'output',
				detail: `第 ${firstDiff + 1} 行起不同:\n      基线: ${(a[firstDiff] ?? '').slice(0, 120)}\n      现在: ${(b[firstDiff] ?? '').slice(0, 120)}`,
			});
		}
	}
	return problems;
};

// ── 通用断言（#331 假绿家族的机械防线；guest-1 建议的一般化）──────────────
//  FOOTER：脚本收尾行——任何**只有收尾行**的单跑输出都等于「这个开关没真执行」（--sel 曾是此形）。
export const FOOTER = '（数据源：src/15-tables.twee';
export const contentLines = (text) => text.split('\n').filter((l) => l.trim() && !l.includes(FOOTER));

// ① 每个开关单跑必须有**实质输出**（防 --sel 类死开关：只打收尾行 + rc=0）
// ② 每个开关的单跑输出必须能在「无参数全跑」里找到（防只在一条路径上生效）
// ③ 源码里出现的 \`arg('x')\` 必须都在受保护清单里（防新增开关漏保护），反之亦然（防清单过期）
export const generalChecks = (flags, snapshot, allRun, argFlags) => {
	const problems = [];
	for (const f of flags) {
		const lines = contentLines(snapshot[f].out);
		if (lines.length === 0) problems.push({ kind: 'empty-flag', flag: f, detail: '单跑无实质输出（只剩收尾行）——正是「死开关／假绿」形态（参见 #331）' });
		if (allRun) {
			const norm = (t) => t.replace(/[\d.]+%/g, 'N%');   // 两侧都归一百分数：本检查看「内容在不在」，不看数值
			const hay = new Set(norm(allRun).split('\n').map((l) => l.trim()));
			const missing = lines.map((l) => norm(l).trim()).filter((l) => !hay.has(l));
			if (missing.length > 3) problems.push({ kind: 'not-in-full-run', flag: f, detail: `有 ${missing.length} 行在「无参数全跑」里找不到（可能只在单跑路径生效或缺覆盖）：例 ${missing[0].slice(0, 60)}` });
		}
	}
	const unlisted = argFlags.filter((f) => !flags.includes(f));
	if (unlisted.length) problems.push({ kind: 'unprotected-flag', flag: '(清单)', detail: `源码里的开关未纳入 golden 保护：${unlisted.join(', ')}` });
	const stale = flags.filter((f) => !argFlags.includes(f));
	if (stale.length) problems.push({ kind: 'stale-flag', flag: '(清单)', detail: `golden 清单里的开关在源码里已不存在：${stale.join(', ')}` });
	return problems;
};

const selftest = () => {
	const base = { a: { code: 0, out: 'x\ny\nz\n' }, dragon: { code: 0, out: '存活 N%\n' } };
	const cases = [
		['一致 → 不得报错', base, { ...base }, 0],
		['输出多一行 → 必须报错', base, { a: { code: 0, out: 'x\ny\nz\nw\n' }, dragon: base.dragon }, 1],
		['输出少一行 → 必须报错', base, { a: { code: 0, out: 'x\ny\n' }, dragon: base.dragon }, 1],
		['退出码变化 → 必须报错', base, { a: { code: 1, out: base.a.out }, dragon: base.dragon }, 1],
		['缺开关 → 必须报错', base, { a: base.a }, 1],
		['--dragon 数值抖动（归一化后）→ 不得报错', base, { a: base.a, dragon: { code: 0, out: '存活 N%\n' } }, 0],
	];
	let bad = 0;
	for (const [name, b, c, want] of cases) {
		const got = diffSnapshot(b, c).length;
		const ok = got === want;
		if (!ok) bad++;
		console.log(`${ok ? '✓' : '✗'} ${name}（命中 ${got}，期望 ${want}）`);
	}
	const gc = [
		['死开关（只有收尾行）→ 必须报', generalChecks(['sel'], { sel: { code: 0, out: `\n${FOOTER} …）\n` } }, null, ['sel']).some((p) => p.kind === 'empty-flag')],
		['单跑未纳入保护清单 → 必须报', generalChecks(['a'], { a: { code: 0, out: 'x\n' } }, null, ['a', 'b']).some((p) => p.kind === 'unprotected-flag')],
		['清单有源码里已不存在的开关 → 必须报', generalChecks(['a', 'ghost'], { a: { code: 0, out: 'x\n' }, ghost: { code: 0, out: 'y\n' } }, null, ['a']).some((p) => p.kind === 'stale-flag')],
		['单跑内容不在全跑输出里 → 必须报', generalChecks(['a'], { a: { code: 0, out: 'l1\nl2\nl3\nl4\nl5\n' } }, 'l1\n', ['a']).some((p) => p.kind === 'not-in-full-run')],
	];
	for (const [name, ok] of gc) { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${name}`); }
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项——golden 比对没有咬合力`); process.exit(1); }
	console.log('\n✔ 自证通过：一致绿 / 多行红 / 少行红 / 退出码变红 / 缺开关红 / dragon 数值抖动绿 / 死开关红 / 漏保护红 / 清单过期红 / 单跑脱离全跑红');
};

const argv = process.argv.slice(2);
if (argv.includes('--selftest')) { selftest(); process.exit(0); }

if (argv.includes('--update')) {
	const snapshot = capture();
	writeFileSync(GOLDEN, JSON.stringify(snapshot, null, '\t') + '\n');
	console.log(`✔ 基线已写入 ${GOLDEN}（${FLAGS.length} 个开关；dragon 走结构比对）`);
	for (const f of FLAGS) console.log(`    ${f}: ${snapshot[f].out.split('\n').length} 行 · 退出码 ${snapshot[f].code}`);
	process.exit(0);
}

if (!existsSync(GOLDEN)) { console.error(`✗ 找不到 ${GOLDEN}——先跑 --update 建基线`); process.exit(1); }
const baseline = JSON.parse(readFileSync(GOLDEN, 'utf8'));
const current = capture();
const problems = diffSnapshot(baseline, current)
	.concat(generalChecks(FLAGS, current, runFlag(null).out, argFlagsFromSource()));

console.log(`══ audit golden 比对 ══  ${FLAGS.length} 个开关（dragon 走结构比对：百分数归一为 N%）`);
if (!problems.length) {
	console.log('✔ 全部开关输出与基线逐字节一致（重构未改变行为）');
	process.exit(0);
}
console.error(`\n✗ ${problems.length} 个开关与基线不符：`);
for (const p of problems) console.error(`   [${p.kind}] --${p.flag}：${p.detail}`);
console.error('\n  说明：本门是「只搬家不改行为」的护城河。若**有意**改行为，请在 PR 里说明理由并 --update 基线。');
process.exit(1);
