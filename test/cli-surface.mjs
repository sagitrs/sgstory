// `#845`：**cli-surface 等价**常驻条目 ——「工具路 ↔ `cli.mjs` 子命令路」逐档对照
//
// 为什么常驻：`#794` 的"命令体搬进 `lib/host/commands.mjs`"这类重构还会再来 → 每次都要重跑同一把尺
// → 一次固化、多次复用（本条目**从注册表派生** → 新注册的命令会**红着提醒补档**，不会静默漏）。
//
// 三条判据形态（缺一即是沉默面）：
// ① **每档带期望**（只有 args 的行＝"跑完即通过"＝空断言）；
// ② **计数断言**（每子命令实际执行档数 > 0 ∧ 全局"实际 == 表总" → 表被写空/注释掉 → 当场红）；
// ③ **1:1 不变量**（注册表 ↔ `editor/<tool>.mjs`；豁免须带票号，且**豁免目标已不存在 → 红**）。
//
// 归一化口径：**只遮 argv 派生项**（程序名／子命令）；其余任何字节差都算咬住；
// **错路 message＋rc 硬判、栈帧 report-only**（否则随 node 版本假红）。
//
//注意：**自证必须能红**（`#848` 的教训）：本文件的 `--selftest` 不是"把真表再念一遍"，而是**用一个可注入的假 runner
// 驱动 `judgeSurface` 的五个合成用例** → 判定逻辑一旦退化，自证**当场红**（并把失败计入退出码）。
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

//注意：**前置**（`#845`/`#850`）：`cli.mjs` 必须导出 `COMMANDS` → 未导出 → 明确前置报文 ＋ rc=2（不静默跳过）
const cli = await import('../editor/cli.mjs').catch((e) => ({ __err: e }));
const COMMANDS = cli?.COMMANDS;
if (!COMMANDS || !Object.keys(COMMANDS).length) {
	console.error('✗ cli-surface 前置缺失：`editor/cli.mjs` 未导出 `COMMANDS`（本条目从注册表派生 ⇒ 需要它 ✓）');
	console.error('  （#845 依赖 A 车道的导出票 #850 ✓；import 侧错误：' + (cli?.__err?.message ?? '(无)') + '）');
	process.exit(2);
}
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TMP = 'build/__cli_surface_tmp';   // 仓内临时落点（`build/` 不被跟踪）

/** 子命令 → 工具文件（**别名表**：`build` 的工具叫 `compile-story`）。 */
const TOOL_OF = { build: 'compile-story' };
/** 注册表里允许**没有**同名工具的子命令：须带**票号 ＋ 理由**（目标已不存在 → 红）。 */
const NO_TOOL_EXEMPT = {};

/** **在册差异**（"只许收缩 ＋ 收缩留痕"）：`{ source, mode: 'rc'|'output', why, toolRc?, cliRc?}`。
 * 语义：这条差异**必须仍在** —— 一旦消失或读数变了 → **红** → 更新/删除记录。
 * `source` ＝ 票号（待修）或"契约（票号 声明）"（有意差异）—— **两者都必填**（没来源的差异＝把 bug 洗成"已知"）。 */
const DECLARED_DIFF = {
	'k4 --selfcheck': {
		source: '契约（#847 经 #854 落地 ✓ —— "自证＝壳级选项"是全家设计 ✓）', mode: 'rc',
		why: 'cli 路对 `--selfcheck` **拒绝并指路**（rc=2 ＋ 报文点名工具路 ✓）—— 与 `k6`／`equiv` 同形 ✓ ⇒ **有意差异** ✗ 不是待修 ✓',
		toolRc: 0, cliRc: 2, cliErrIncludes: '自证只在工具路',
	},
	'k6 --selftest': {
		source: '契约（#851 声明 ✓）', mode: 'rc',
		why: 'cli 路对 `--selftest` **拒绝并指路**（rc=2 ＋ 报文点名工具路 ✓）—— 自证只在工具路 ✓ 属**有意差异** ✗',
		toolRc: 0, cliRc: 2, cliErrIncludes: '自证只在工具路',
	},
};;

/** 档表：每档**必须带期望**。 */
// `#995` 的守卫**放在别处**：第一版在这里写了两种"扫一遍每个声明标志"的写法 → **两种都不行**：
// ① **跑一遍**每个标志 → `extract-story minimal-demo --tables` **默认落点会写回故事自己的 `data/`**
// → **污染 tracked 文件** → 同一趟里 `k4` 的"生成物必须新鲜"**当场红**（**是 k4 抓到的** ——
// 实测：干净 main 上跑本件**不污染**、本片那版**污染**）；
// ② **静态比对**"声明表 ↔ 各命令用法串" →注意：用文本切片认命令边界这种切法把**邻居命令**的用法串也扫进来了 → 报出一堆**假漂移**
//（它同时说明"用文本切片去认命令边界"这件事本身不可靠）。
// → 最终把守卫换成**经验法**：**整套测试**就是尺子 —— 仓内谁给某个命令多塞了标志，
// 会在本件或 `npm test` 里**当场红并点名**（**量出来**，不靠扫文本）；本片已实跑过一遍。

const TIERS = {
	build: [
		{ args: [], expect: { rc: 2, kind: '用法' } },
		{ args: ['minimal-demo', `--out=${TMP}`], expect: { rc: 0, kind: '正常' } },
		{ args: ['minimal-demo', `--out=${TMP}`, 'extra'], expect: { rc: 0, kind: '多位置被忽略' } },
		// `#995`：**翻面** —— 原先钉的是「**未知标志被忽略**」（rc=0）→ 那会让「标志没生效」被读成「通过」
		//（实测踩过）。现在：不认识的标志 → **讲人话地拒（rc=2 ＋ 点名）**，与「取不到输入不许判过」同族。
		{ args: ['minimal-demo', '--bogus', `--out=${TMP}`], expect: { rc: 2, kind: '错路·未知标志' } },
	],
	'extract-story': [
		{ args: ['minimal-demo', '--nope=1'], expect: { rc: 2, kind: '错路·未知标志' } },
		// `#959`（`#962` 的同族推广）：**取值类标志吃空值** → `--out=` 空会 `join(ROOT,'')` ＝ **仓根**（写文件落根）→ 现应讲人话地拒
		{ args: ['minimal-demo', '--out='], expect: { rc: 2, kind: '错路·空值·out' } },
		{ args: ['minimal-demo', '--from='], expect: { rc: 2, kind: '错路·空值·from' } },
		{ args: ['minimal-demo', '--section='], expect: { rc: 2, kind: '错路·空值·section' } },
		{ args: ['minimal-demo', '--key='], expect: { rc: 2, kind: '错路·空值·key' } },
		{ args: [], expect: { rc: 2, kind: '用法' } },
		// `#1004` B2：旧故事已删 → 本档换到**存活样本**（夹具源＝该故事仓内的 `gates/equiv-baseline/*.twee.txt`）。
		{ args: ['night-ferry', '--tables', '--from=stories/night-ferry/gates/equiv-baseline/15-tables.twee.txt', `--out=${TMP}/t.json`], expect: { rc: 0, kind: '正常' } },
		{ args: ['mist-forest', '--section=Bogus Name', `--out=${TMP}/t.json`], expect: { rc: 1, kind: '错路·无段' } },
	],
	'classify-contract': [
		// `#959`：`--from=` 空 → `join(ROOT,'')` ＝ ROOT → `existsSync` 为真 → 会走"找不到成员" → **归因错** → 现应讲人话地拒
		{ args: ['minimal-demo', '--from='], expect: { rc: 2, kind: '错路·空值·from' } },
		{ args: [], expect: { rc: 2, kind: '用法' } },
		// `#1004` B2：换到存活样本，**期望值逐条重测**（不照抄旧样本）。
		//注意：旧两格的 `kind` 与新样本的**实际行为不同** → 按实测改准：
		// · 裸跑 → rc=1：`night-ferry` 与 `mist-forest` **同为"翻面后"**（`15-tables.twee` 是**产物**（带生成标记）
		// → 本次只判**手写逃生舱文件** → 那里找不到 `Sg.story` 成员 → 报"读不到输入不许当没有故事逻辑"）→ **旧标签仍正确**。
		// · 显式 `--from=<该故事的 equiv 基准件>` → **实测 rc=0**（分类器拿它作**源** → 14 个成员全部归类成功 ——
		// 与旧样本当时"夹具源 → 拒 "的行为**不同**）→ 标签按实测改成"正常"。
		{ args: ['night-ferry'], expect: { rc: 1, kind: '错路·翻面后只剩逃生舱' } },
		{ args: ['night-ferry', '--from=stories/night-ferry/gates/equiv-baseline/15-tables.twee.txt'], expect: { rc: 0, kind: '正常（显式 `--from` 给源 ⇒ 照源分类）' } },
		{ args: ['nosuchstory'], expect: { rc: 1, kind: '错路·读不到输入' } },
	],
	equiv: [
		{ args: [], expect: { rc: 2, kind: '用法' } },
		{ args: ['mist-forest'], expect: { rc: 2, kind: '裸跑拒绝' } },
		// `#1004` B2：换到存活样本（该故事的 `gates/equiv-baseline/15-tables.twee.txt` 就是 `--hand`，实测 rc=0）。
		{ args: ['night-ferry', '--l3=report', '--hand=stories/night-ferry/gates/equiv-baseline/15-tables.twee.txt'], expect: { rc: 0, kind: '正常' } },
		{ args: ['night-ferry', '--l3=weird'], expect: { rc: 2, kind: '错路·档位' } },
		// `#958` 票内复核 MINOR（`[deferred]`，`#215` 报备 `18508167` 承办）：**取值类标志吃空值** → 下游崩成裸 Node 栈
		//（`--notes=` 空 → `readFileSync('')` → `EISDIR`；`--hand=` 空 → `join(ROOT,'')` ＝ 仓根 → 同型）→ 现应为**讲人话地拒**。
		{ args: ['night-ferry', '--notes=', '--l3=report'], expect: { rc: 2, kind: '错路·空值·notes' } },
		{ args: ['night-ferry', '--hand=', '--l3=report'], expect: { rc: 2, kind: '错路·空值·hand' } },
	],
	'lint-story': [
		{ args: [], expect: { rc: 2, kind: '用法' } },
		{ args: ['/tmp/__no_such_dir__'], expect: { rc: 1, kind: '错路·目录不存在' } },
		{ args: ['minimal-demo', '--json'], expect: { rc: 0, kind: '正常(全链)' } },
	],
	k4: [
		{ args: [], expect: { rc: 0, kind: '正常（门跑一遍）' } },
		{ args: ['--bogus'], expect: { rc: 2, kind: '错路·未知开关' } },
		{ args: ['--selfcheck'], expect: { rc: 0, kind: '自检（**在册差异** #847）' } },
	],
	k6: [
		{ args: [], expect: { rc: 0, kind: '正常（门跑一遍）' } },
		{ args: ['--bogus'], expect: { rc: 0, kind: '未知开关被忽略（与 k4 不同 ⇒ 实测 ✓）' } },
		{ args: ['--selftest'], expect: { rc: 0, kind: '自检（**契约差异** #851）' } },
	],
};

/** 归一化：只遮 argv 派生项；错路去掉栈帧行。 */
export const makeNorm = (sub, tool) => (text) => text
	.replace(new RegExp(`node editor/(cli\\.mjs ${sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${tool}\\.mjs)`, 'g'), 'PROG')
	.split('\n').filter((l) => !/^\s+at /.test(l)).join('\n');

const realRun = (argv) => {
	try { return { rc: 0, out: execFileSync('node', argv, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), err: '' }; }
	catch (e) { return { rc: e.status ?? 'null', out: String(e.stdout ?? ''), err: String(e.stderr ?? '') }; }
};

/** **纯判定**（主跑与自证**同用一处** → 自证才能真打到它）。
 * `run(argv)` 可注入（自证用假 runner → 无需真起进程）。返回发现列表（空＝合格）。 */
export const judgeSurface = ({ subs, tiers, declared = {}, run = realRun, toolOf = TOOL_OF, tmp = TMP } = {}) => {
	const bad = [];
	const used = new Set();
	let executed = 0;
	for (const sub of subs) {
		if (NO_TOOL_EXEMPT[sub]) continue;
		const tool = toolOf[sub] ?? sub;
		if (!existsSync(join(ROOT, 'editor', `${tool}.mjs`))) bad.push(`1:1 ✗ 子命令 \`${sub}\` 注册了，但 \`editor/${tool}.mjs\` 不存在`);
	}
	for (const [sub, e] of Object.entries(NO_TOOL_EXEMPT)) {
		if (!subs.includes(sub)) bad.push(`1:1 ✗ **腐烂豁免**：\`${sub}\` 已不在注册表 ⇒ 删豁免（票 ${e.ticket ?? '(缺票号)'}）✗`);
		if (!e.ticket) bad.push(`1:1 ✗ 豁免 \`${sub}\` 缺**票号** ✗`);
	}
	for (const sub of subs) {
		const list = tiers[sub];
		if (!list || !list.length) { bad.push(`档表 ✗ 子命令 \`${sub}\` **没有档**（覆盖缺口要红，不能是空 ✗）`); continue; }
		const tool = toolOf[sub] ?? sub;
		const norm = makeNorm(sub, tool);
		for (const tier of list) {
			if (typeof tier?.expect?.rc !== 'number') { bad.push(`档表 ✗ ${sub} 有一档**没有期望**（＝空断言 ✗）`); continue; }
			const args = tier.args.map((a) => a.replace('$TMP', tmp));
			const a = run([`editor/${tool}.mjs`, ...args]);
			const b = run(['editor/cli.mjs', sub, ...args]);
			executed += 2;
			const key = `${sub} ${args.join(' ')}`.trim();
			const div = declared[key];
			if (div) {
				used.add(key);
				const outSame = norm(a.out) === norm(b.out) && norm(a.err) === norm(b.err);
				if (!div.source) bad.push(`在册差异 ✗ \`${key}\` 缺**来源**（票号／契约宣言）✗（无来源＝把 bug 洗成"已知" ✓）`);
				else if (div.mode === 'output') { if (outSame) bad.push(`在册差异 ✗ \`${key}\`（${div.source}）**输出已不再分叉** ⇒ 删记录 ✓`); }
				else if (a.rc === b.rc) bad.push(`在册差异 ✗ \`${key}\`（${div.source}）**已不再分叉**（${a.rc}/${b.rc}）⇒ 删记录 ✓`);
				else if (a.rc !== div.toolRc || b.rc !== div.cliRc) bad.push(`在册差异 ✗ \`${key}\` 读数变了（${a.rc}/${b.rc}，在册 ${div.toolRc}/${div.cliRc}）⇒ 更新记录 ✓`);
				else if (div.cliErrIncludes && !b.err.includes(div.cliErrIncludes)) bad.push(`在册差异 ✗ \`${key}\`（${div.source}）cli 路报文**不再含**「${div.cliErrIncludes}」⇒ 契约变了 ⇒ 更新记录 ✓`);
				continue;
			}
			if (a.rc !== tier.expect.rc || b.rc !== tier.expect.rc) { bad.push(`[${sub} ${tier.expect.kind}] rc 期望 ${tier.expect.rc}：工具=${a.rc} cli=${b.rc} ✗`); continue; }
			if (norm(a.out) !== norm(b.out) || norm(a.err) !== norm(b.err)) bad.push(`[${sub} ${tier.expect.kind}] 两走法输出不同（只允许 argv 派生项差异 ✗）`);
		}
	}
	for (const key of Object.keys(declared)) if (!used.has(key)) bad.push(`在册差异 ✗ \`${key}\` 从未命中（档表里没有这一档，或它已随注册表消失）⇒ 删记录 ✓`);
	for (const sub of Object.keys(tiers)) if (!subs.includes(sub)) bad.push(`档表 ✗ \`${sub}\` 有档但**不在注册表**里（档表只许随注册表收缩 ✓）`);
	const total = subs.reduce((s, sub) => s + (tiers[sub]?.length ?? 0), 0) * 2;
	if (executed !== total) bad.push(`计数 ✗ 实际执行 ${executed} ≠ 表总 ${total} ✗`);
	return { findings: bad, executed, total };
};

/** **自证**（`--selftest`）：用**假 runner** 驱动 `judgeSurface` 的五个合成用例 —— 判定退化 → 当场红。
 *注意：这里刻意用**自增量计数器 `bad` ＋ `if (bad)` 进退出码**（`scripts/report-selftest-validity.mjs` 的 V2 判据）。 */
const selftest = () => {
	let bad = 0;
	const t = (label, ok, got = '') => { console.log(`${ok ? '✓' : '✗'} 自证·${label}${ok ? '' : `\n    实得：${got}`}`); if (!ok) bad += 1; };
	const fakeRun = (map) => (argv) => ({ rc: map[argv.join(' ')] ?? 99, out: '', err: '' });
	const clean = { subs: ['build'], tiers: { build: [{ args: [], expect: { rc: 0, kind: 'x' } }] }, declared: {}, toolOf: { build: 'compile-story' } };
	const R = (o, run) => judgeSurface({ ...clean, ...o, run });
	t('正例：一子命令一档且期望相符 ⇒ 无发现', R({}, fakeRun({ 'editor/compile-story.mjs': 0, 'editor/cli.mjs build': 0 })).findings.length === 0);
	t('反例①期望改错 ⇒ 发现非空（空断言／错期望必须咬住）', R({ tiers: { build: [{ args: [], expect: { rc: 7, kind: 'x' } }] } }, fakeRun({ 'editor/compile-story.mjs': 0, 'editor/cli.mjs build': 0 })).findings.length > 0);
	t('反例②档表清空 ⇒ 发现非空（覆盖缺口／计数断言）', R({ tiers: { build: [] } }, fakeRun({})).findings.length > 0);
	t('反例③注册表加幽灵子命令 ⇒ 发现非空（1:1 不变量）', R({ subs: ['build', '__ghost__'] }, fakeRun({ 'editor/compile-story.mjs': 0, 'editor/cli.mjs build': 0 })).findings.length > 0);
	t('反例④在册差异已不再分叉 ⇒ 发现非空（只许收缩）', R({ declared: { 'build': { source: '#0', mode: 'rc', toolRc: 0, cliRc: 0 } } }, fakeRun({ 'editor/compile-story.mjs': 0, 'editor/cli.mjs build': 0 })).findings.length > 0);
	t('反例⑤在册差异的**指路报文**缺失 ⇒ 发现非空（契约变了必须咬住）', R({ declared: { 'build': { source: '#0', mode: 'rc', toolRc: 0, cliRc: 9, cliErrIncludes: '自证只在工具路' } } }, fakeRun({ 'editor/compile-story.mjs': 0, 'editor/cli.mjs build': 9 })).findings.length > 0);
	if (bad) { console.error(`\n✗ cli-surface 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ cli-surface 自证通过（6 例：正例 ＋ 期望错／档表空／幽灵命令／在册差异失效／指路报文缺失 ✓）');
	return 0;
};

if (process.argv.includes('--selftest')) {
	selftest();
	process.exit(0);
}

const subs = Object.keys(COMMANDS);
const { findings, executed, total } = judgeSurface({ subs, tiers: TIERS, declared: DECLARED_DIFF });
if (findings.length) {
	console.error(`✗ cli-surface 门：${findings.length} 项不合格（判据：工具路 ↔ cli 子命令路 **逐档**等价 ✓）`);
	for (const x of findings) console.error(`  ✗ ${x}`);
	process.exit(1);
}
console.log(`✔ cli-surface 门通过（注册表 ${subs.length} 个子命令 · 实际执行 ${executed} 次 · 表总 ${total} 次 · 只遮 argv 派生项 ✓）`);
