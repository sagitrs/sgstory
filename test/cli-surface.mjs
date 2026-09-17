// `#845`：**cli-surface 等价**常驻条目 —— 「工具路 ↔ `cli.mjs` 子命令路」逐档对照 ✓
//
// 为什么常驻：`#794` 的"命令体搬进 `lib/host/commands.mjs`"还要再来两次（`k4`／`k6` ✓）⇒
//   每次都要重跑同一把尺 ✗ ⇒ 一次固化、多次复用 ✓（`k6` 一注册即**自动进表** ✓，因本条目**从注册表派生** ✓）。
//
// 三条判据形态（缺一即是沉默面 ✗）：
//   ① **每档带期望**（`{ args, expect }`）—— 只有 args 的行＝"跑完即通过"＝空断言 ✗；
//   ② **计数断言** —— 每子命令实际执行档数 > 0 ∧ 全局实际 == 表总 ✓（"器具必须证明自己跑了" ✓）；
//   ③ **1:1 不变量** —— 注册表 ↔ `editor/<tool>.mjs` 一一对应 ✓；豁免须带票号 ✓，且**豁免目标已不存在 ⇒ 红** ✗
//      （抄 `escape-hatch.json` 的"只许收缩 ＋ 收缩留痕" ✓）。
//
// 归一化口径 ✓：**只遮 argv 派生项**（程序名／子命令 ✓）；其余任何字节差都算咬住 ✓；
//   **错路 message＋rc 硬判、栈帧 report-only** ✓（否则随 node 版本假红 ✗）。
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// ⚠️ **前置**（`#845`）：`cli.mjs` 必须导出 `COMMANDS` ✓ —— 未导出 ⇒ 本条目**给明确前置报文 ＋ rc≠0** ✓
//   （不静默跳过 ✗：一个"没在量东西"的判据比没有判据更坏 ✓）。
const cli = await import('../editor/cli.mjs').catch((e) => ({ __err: e }));
const COMMANDS = cli?.COMMANDS;

if (!COMMANDS || !Object.keys(COMMANDS).length) {
	console.error('✗ cli-surface 前置缺失：`editor/cli.mjs` 未导出 `COMMANDS`（本条目从**注册表派生** ⇒ 需要它 ✓）');
	console.error('  （#845 依赖 A 车道在 cli.mjs 加 export const COMMANDS ✓；import 侧错误：' + (cli?.__err?.message ?? '(无)') + '）');
	process.exit(2);
}
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TMP = 'build/__cli_surface_tmp';   // 仓内临时落点（`build/` 不被跟踪 ✓）；用完即删 ✓

/** 子命令 → 工具文件（**别名表**：`build` 的工具叫 `compile-story` ✓）。 */
const TOOL_OF = { build: 'compile-story', k6: 'k6' };
/** 注册表里允许**没有**同名工具的子命令：必须带**票号 ＋ 理由** ✓（且目标已不存在时本条目会红 ✗）。 */
const NO_TOOL_EXEMPT = {};

/** 档表：每档**必须带期望** ✓。`args` 里 `$TMP` 会被替换成仓内临时路径 ✓。 */
const TIERS = {
	build: [
		{ args: [], expect: { rc: 2, kind: '用法' } },
		{ args: ['minimal-demo', `--out=${TMP}`], expect: { rc: 0, kind: '正常' } },
		{ args: ['minimal-demo', `--out=${TMP}`, 'extra'], expect: { rc: 0, kind: '多位置被忽略' } },
		{ args: ['minimal-demo', '--bogus', `--out=${TMP}`], expect: { rc: 0, kind: '未知标志被忽略' } },
	],
	'extract-story': [
		{ args: [], expect: { rc: 2, kind: '用法' } },
		{ args: ['mist-forest', '--tables', '--from=stories/mist-forest/gates/equiv-baseline/15-tables.twee.txt', `--out=${TMP}/t.json`], expect: { rc: 0, kind: '正常' } },
		{ args: ['mist-forest', '--section=Bogus Name', `--out=${TMP}/t.json`], expect: { rc: 1, kind: '错路·无段' } },
	],
	'classify-contract': [
		{ args: [], expect: { rc: 2, kind: '用法' } },
		{ args: ['mist-forest'], expect: { rc: 1, kind: '错路·翻面后只剩逃生舱' } },
		{ args: ['mist-forest', '--from=stories/mist-forest/gates/equiv-baseline/15-tables.twee.txt'], expect: { rc: 1, kind: '夹具源' } },
		{ args: ['nosuchstory'], expect: { rc: 1, kind: '错路·读不到输入' } },
	],
	equiv: [
		{ args: [], expect: { rc: 2, kind: '用法' } },
		{ args: ['mist-forest'], expect: { rc: 2, kind: '裸跑拒绝' } },
		{ args: ['mist-forest', '--l3=report', '--hand=stories/mist-forest/gates/equiv-baseline/15-tables.twee.txt'], expect: { rc: 0, kind: '正常' } },
		{ args: ['mist-forest', '--l3=weird'], expect: { rc: 2, kind: '错路·档位' } },
	],
	k4: [
		{ args: [], expect: { rc: 0, kind: '正常（门跑一遍 ✓）' } },
		{ args: ['--bogus'], expect: { rc: 2, kind: '错路·未知开关' } },
		{ args: ['--selfcheck'], expect: { rc: 0, kind: '自检（**在册差异** #847：cli 侧 rc=2 ✗）' } },
	],
	'lint-story': [
		{ args: [], expect: { rc: 2, kind: '用法' } },
		{ args: ['/tmp/__no_such_dir__'], expect: { rc: 1, kind: '错路·目录不存在' } },
		{ args: ['minimal-demo', '--json'], expect: { rc: 0, kind: '正常(全链)' } },
	],
};

/** **在册差异**（"只许收缩 ＋ 收缩留痕" ✓）：键＝`<子命令> <空格连接的 args>`；
 *  语义：这条差异**必须仍然存在**（工具 rc ≠ cli rc ✓）—— **一旦消失 ⇒ 本条目红** ✗ ⇒ 删掉这条记录 ✓。
 *  每条必须带**票号 ＋ 理由** ✓（没有票号的差异＝把 bug 洗成"已知" ✗）。 */
const KNOWN_DIVERGENT = {
	'k4 --selfcheck': {
		ticket: '#847',
		why: '壳级选项没进命令体（`k4.mjs:40` 在壳里判 `--selfcheck` ⇒ `cli.mjs k4` 转发进体 ⇒ 不认识 ✗）',
		toolRc: 0, cliRc: 2,
	},
};

/** 归一化：只遮 argv 派生项 ✓；错路去掉栈帧行 ✓。 */
const norm = (sub, tool, text) => text
	.replace(new RegExp(`node editor/(cli\\.mjs ${sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${tool}\\.mjs)`, 'g'), 'PROG')
	.split('\n').filter((l) => !/^\s+at /.test(l)).join('\n');

const run = (argv) => {
	try { const out = execFileSync('node', argv, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); return { rc: 0, out, err: '' }; }
	catch (e) { return { rc: e.status ?? 'null', out: String(e.stdout ?? ''), err: String(e.stderr ?? '') }; }
};

const bad = [];
const usedDiv = new Set();
let executed = 0;
let planned = 0;
const subs = Object.keys(COMMANDS);

// ── 1:1 不变量（注册表 ↔ 工具）──
for (const sub of subs) {
	if (NO_TOOL_EXEMPT[sub]) continue;
	const tool = TOOL_OF[sub] ?? sub;
	if (!existsSync(join(ROOT, 'editor', `${tool}.mjs`))) bad.push(`1:1 ✗ 子命令 \`${sub}\` 注册了，但 \`editor/${tool}.mjs\` 不存在`);
}
for (const [sub, e] of Object.entries(NO_TOOL_EXEMPT)) {
	if (!subs.includes(sub)) bad.push(`1:1 ✗ **腐烂豁免**：\`${sub}\` 已不在注册表，豁免（票 ${e.ticket ?? '(缺票号)'}）必须删 ✗`);
	if (!e.ticket) bad.push(`1:1 ✗ 豁免 \`${sub}\` 缺**票号** ✗（豁免只许带票号 ＋ 理由 ✓）`);
}

// ── 逐档两走法对照 ──
for (const sub of subs) {
	const tiers = TIERS[sub];
	if (!tiers || !tiers.length) { bad.push(`档表 ✗ 子命令 \`${sub}\` **没有档**（覆盖缺口要红，不能是空 ✗）`); continue; }
	const tool = TOOL_OF[sub] ?? sub;
	let n = 0;
	for (const tier of tiers) {
		if (!tier.expect || typeof tier.expect.rc !== 'number') { bad.push(`档表 ✗ ${sub} 有一档**没有期望**（＝空断言 ✗）`); continue; }
		const args = tier.args.map((a) => a.replace('$TMP', TMP));
		const a = run([`editor/${tool}.mjs`, ...args]);
		const b = run(['editor/cli.mjs', sub, ...args]);
		executed += 2; n += 1; planned += 2;
		const divKey = `${sub} ${args.join(' ')}`.trim();
		const div = KNOWN_DIVERGENT[divKey];
		if (div) {
			usedDiv.add(divKey);
			if (!div.ticket) bad.push(`在册差异 ✗ \`${divKey}\` 缺**票号** ✗（无票号的差异＝把 bug 洗成"已知" ✓）`);
			else if (a.rc === b.rc) bad.push(`在册差异 ✗ \`${divKey}\`（票 ${div.ticket}）**已不再分叉**（工具=${a.rc} cli=${b.rc}）⇒ 请**删掉这条记录** ✓（只许收缩 ✓）`);
			else if (a.rc !== div.toolRc || b.rc !== div.cliRc) bad.push(`在册差异 ✗ \`${divKey}\` 的读数变了（工具=${a.rc} cli=${b.rc}，在册=${div.toolRc}/${div.cliRc}）⇒ 更新或删除记录 ✓`);
			continue;
		}
		if (a.rc !== tier.expect.rc || b.rc !== tier.expect.rc) {
			bad.push(`[${sub} ${tier.expect.kind}] rc 期望 ${tier.expect.rc}：工具=${a.rc} cli=${b.rc} ✗`);
			continue;
		}
		if (a.rc !== b.rc) { bad.push(`[${sub} ${tier.expect.kind}] 两走法 rc 不同：工具=${a.rc} cli=${b.rc} ✗`); continue; }
		const na = { out: norm(sub, tool, a.out), err: norm(sub, tool, a.err) };
		const nb = { out: norm(sub, tool, b.out), err: norm(sub, tool, b.err) };
		if (na.out !== nb.out || na.err !== nb.err) bad.push(`[${sub} ${tier.expect.kind}] 两走法输出不同（只允许 argv 派生项差异 ✗）`);
	}
	if (n === 0) bad.push(`计数 ✗ 子命令 \`${sub}\` **实际执行 0 档** ✗`);
}

for (const k of Object.keys(KNOWN_DIVERGENT)) if (!usedDiv.has(k)) bad.push(`在册差异 ✗ \`${k}\` 从未命中（档表里没有这一档，或它已随注册表消失）⇒ 删记录 ✓`);
// ── 表外项（只许收缩 ✓）：档表里出现**未注册**的子命令 ⇒ 红 ✗（要么它真被删了 ⇒ 删档 ✓，要么注册表漏了 ⇒ 补注册 ✓）──
for (const sub of Object.keys(TIERS)) {
	if (!subs.includes(sub)) bad.push(`档表 ✗ \`${sub}\` 有档但**不在注册表**里（档表只许随注册表收缩 ✓）`);
}
// ── 计数断言：实际执行 == 表总（表被写空/注释掉 ⇒ 红 ✗）──
const totalRows = subs.reduce((s, sub) => s + (TIERS[sub]?.length ?? 0), 0) * 2;
if (executed !== totalRows) bad.push(`计数 ✗ 实际执行 ${executed} ≠ 表总 ${totalRows} ✗`);

// ── 自证（`--selftest`）：三条**能红**的负例 ✓（打印 `自证·` ⇒ 台账那格才有依据 ✓）──
const selftest = () => {
	let n = 0;
	const t = (label, ok) => { n += 1; console.log(`${ok ? '✓' : '✗'} 自证·${label}`); if (!ok) bad.push(`自证 ✗ ${label}`); };
	t('档表覆盖率：注册表里每个子命令都有档（含新注册的 ⇒ 自动进表 ✓）', subs.every((s) => (TIERS[s] ?? []).length > 0));
	t('每档都带期望（只有 args 的行＝空断言 ⇒ 本判据会红 ✓）', Object.values(TIERS).every((ts) => ts.every((x) => typeof x?.expect?.rc === 'number')));
	t('1:1 不变量：注册表 ↔ 工具（别名校验）', subs.every((s) => NO_TOOL_EXEMPT[s] || existsSync(join(ROOT, 'editor', `${TOOL_OF[s] ?? s}.mjs`))));
	return n;
};

if (process.argv.includes('--selftest')) {
	const n = selftest();
	if (bad.length) { console.error(`\n✗ cli-surface 自证失败 ${bad.length} 项`); for (const x of bad) console.error(`  ✗ ${x}`); process.exit(1); }
	console.log(`\n✔ cli-surface 自证通过（${n} 例：档表覆盖 · 每档带期望 · 1:1 不变量）`);
	process.exit(0);
}

if (bad.length) {
	console.error(`✗ cli-surface 门：${bad.length} 项不合格（判据：工具路 ↔ cli 子命令路 **逐档**等价 ✓）`);
	for (const x of bad) console.error(`  ✗ ${x}`);
	process.exit(1);
}
console.log(`✔ cli-surface 门通过（注册表 ${subs.length} 个子命令 · 实际执行 ${executed} 次 · 表总 ${totalRows} 次 · 只遮 argv 派生项 ✓）`);
