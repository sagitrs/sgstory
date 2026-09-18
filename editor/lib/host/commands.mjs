// `#794` 抽取的最后一个信封：**命令体**（一个命令一个函数：`解析 → 干活 → 打印`）。
//
// 为什么住 host ✓：命令体要读/写文件（宿主能力 ✓）；但它**调 core**（编译 `compileStory` ✓、
// 唯一写路 `writeStoryPackage` ✓）⇒ core 本身仍零宿主依赖 ✓（K6 ③ 在盯 ✓）。
//
// **两条入口共用同一具身体** ✓：`editor/cli.mjs <子命令>` 与 `node editor/<工具>.mjs …` 都调这里的同一个函数 ✓
// ⇒ 等价性**按构造成立** ✓（不是"两个实现碰巧一致" ✗ —— 那种迟早漂移 ✓）。
// 连**参数解析**也在这里 ✓（函数的入参就是原始 `argv` 尾巴 ✓）⇒ 入口层没有第二份解析 ✓
// （否则"未知标志/缺必填/多给位置参数"三档就会两边不一致 ✓ —— 那正是入口层分叉的藏身处 ✓）。
import { join, resolve, dirname, relative } from 'node:path';
import { readText, writeText, mkdirp, exists, ROOT, engineScripts } from './fs.mjs';
import { scriptBodies } from '../core/text.mjs';
import { compileStory } from '../core/emit.mjs';
import { packageFiles, writeStoryPackage, sectionFile } from '../core/story.mjs';
import { runStory, engineOf } from './sandbox.mjs';

import { readFileSync, existsSync, rmSync, readdirSync, statSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { gatesForStory } from '../../../scripts/audit/discovery.mjs';
import { hatchFiles } from './hatches.mjs';
import { hasGeneratedMarker } from '../core/text.mjs';
const NODE_IO = { readText, writeText, mkdirp, exists };
import { definitionsOf, duplicateExportProblems, secondCopyProblems, coreHostProblems, primitiveWriteProblems,
	coreHostGlobalProblems, deleteStoryProblems, shellWriteProblems, mjsFiles, CORE, HOSTS, EDITOR, REPO_ROOT as K6ROOT } from './k6criteria.mjs';


// `#794` 第 4 条（K4 命令体）：判据的**纯**部分住 core ✓（纯 ⇒ core、宿主能力 ⇒ host ✓）。
// ⚠️ **一处定义** ✓：分类器实例**不在本文件重装** ✗ —— `lib/host/classify.mjs` 已经装好（`makeClassify({ evalLiteral: literalValue })` ✓），
// 本命令走它导出的缝 `classifyContractText` ✓（那条缝多做 `locals` 上下文与 `const` 的 B→A 解析 ⇒ 该语义风险由**两时点差分**量掉 ✓）。
import { MARKER, markerProblems, freshnessProblems, escapeHatchProblems, refusedFaceProblems, contractSourceText, staleTrackedProblems } from '../core/k4criteria.mjs';
import { censusOfStory, censusSummarize, censusProblems } from '../core/hatchCensus.mjs';
import { classifyContractText } from './classify.mjs';
// `#794` 弧第 3 票（`equiv` 命令体）：用 vm／读文件／跑子进程 ⇒ **都在 host** ✓。
import vm from 'node:vm';
import { maskComments } from '../../../scripts/audit/lib/mask.mjs';
import { section, normalize } from '../core/text.mjs';
import { L3_MODES, probeArgs, snapshot, diffContract, bareHandRefusal } from '../core/probe.mjs';
import { runScript, evalSide, sandboxOf } from './probe.mjs';
import { runNode } from './proc.mjs';
const COMPILER = 'editor/compile-story.mjs';


/** 用法行由**调用方传入的程序名**派生 ✓ —— 于是两条入口的输出只差这一行（且这行是 `argv` 派生的 ✓，
 *  属"唯一允许的差异" ✓）。不读 `process.argv` ✓：那样会让同一个函数在不同入口下行为不同 ✗。 */
// ⚠️ **尾部由每个命令自带** ✓ —— 抽共享助手时最容易犯的错是"假设某个命令的签名" ✗：
//   我上一版把 `build` 的 `[--out=<dir>]` 写死在助手里 ⇒ 漏进了 `extract-story` 的用法行 ✗
//   （且与该行尾部的 `[--out=<file>]` 自相矛盾 ✓）。⇒ 助手只拼前缀 ✓，尾部的"有哪些旗标"归命令自己 ✓。
const usageOf = (prog, sub, tail) => `用法：${prog}${sub ? ` ${sub}` : ''} ${tail}`;

/** `build <slug> [--out=<dir>]` —— 与 `node editor/compile-story.mjs` **同一具身体** ✓。返回退出码 ✓。 */
export const buildCommand = (argv = [], { prog = 'node editor/cli.mjs', sub = 'build' } = {}) => {
	const [slug, ...rest] = argv;
	// `sub` 让**同一个函数**既能被 `cli.mjs build` 调（用法行含子命令 ✓）也能被原工具调（用法行不含 ✓）——
	// 于是两条入口的输出**只差这一行**，且这行是**调用方传入的程序名/子命令**派生的 ✓（不读 `process.argv` ✗）。
	if (!slug) { console.error(usageOf(prog, sub, '<slug> [--out=<dir>]')); return 2; }
	const outArg = rest.find((a) => a.startsWith('--out='));
	const OUT = outArg ? outArg.slice('--out='.length) : join(ROOT, 'build/generated', slug);
	const readIf = (f) => { try { return JSON.parse(readText(join(ROOT, 'stories', slug, 'data', f))); } catch { return null; } };
	const tables = readIf('tables.json');
	const contract = readIf('contract.json');
	const rules = readIf('rules.json');
	const notesFace = readIf('notes.json');   // 车道 B · notes 面（`#215` `18504282` ✓）：一个数据文件 → 多份产物 ✓
	if (!tables && !contract && !rules && !notesFace) { console.error(`✗ stories/${slug}/data/ 下没有任何产物源（tables/contract/rules/notes.json 都没有）`); return 1; }
	const files = compileStory({ tables, contract, rules, notesFace, slug });
	// ⚠️ 比**解析后**的路径（`--out=stories/<slug>` 是相对的 ✓ —— 直接拿字符串比会静默走错分支 ✗）。
	if (resolve(OUT) === join(ROOT, 'stories', slug)) {
		const wrote = writeStoryPackage({ slug, twee: files, io: NODE_IO });
		for (const p of wrote) {
			const text = files[p.split('/').pop()] ?? '';
			console.log(`✔ ${slug}：产物 → ${p.replace(ROOT, '')}（${text.length} 字节，${text.split('\n').length - 1} 行）`);
		}
	} else {
		mkdirp(OUT);
		for (const [name, text] of Object.entries(files)) {
			writeText(join(OUT, name), text);
			console.log(`✔ ${slug}：${Object.keys(files).length} 份产物 · ${name} ← data/（${text.length} 字节，${text.split('\n').length - 1} 行）`);
		}
	}
	return 0;
};

/** `extract-story <slug> [--section=…] [--key=…] [--tables] [--from=…] [--out=…]` ——
 *  与 `node editor/extract-story.mjs` **同一具身体** ✓（体从壳里逐字搬来，只改三件：
 *  `process.argv` ⇒ `argv` ✓、`process.exit(n)` ⇒ `return n` ✓、用法行由 `prog`／`sub` 派生 ✓）。 */
export const extractCommand = (argv = [], { prog = 'node editor/cli.mjs', sub = 'extract-story' } = {}) => {
	const [slug, ...rest] = argv;
	if (!slug) { console.error(usageOf(prog, sub, '<slug> [--section=StoryRules] [--key=rules] [--out=<file>] [--tables] [--from=<file>]')); return 2; }
	const argOf = (n, d) => { const h = rest.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
	const tablesMode = rest.includes('--tables');
	const section = argOf('section', tablesMode ? 'Game Tables' : 'StoryRules');
	const key = argOf('key', 'rules');
	const out = join(ROOT, argOf('out', tablesMode ? `stories/${slug}/data/tables.json` : `stories/${slug}/data/${key}.json`));
	const file = join(ROOT, argOf('from', `stories/${slug}/${sectionFile(section)}`));
	const scripts = engineScripts() + '\n' + scriptBodies(readText(file)).join('\n');
	const { Sg, diag } = runStory(scripts);
	if (tablesMode) {
		// `--tables`：导出故事声明的 `Game` 面（**引擎常量 Era/Damage 不算故事数据** ⇒ 剔除）。
		const { Game } = runStory(engineOf(slug, argOf('from', null)));
		const containers = {}; const fns = [];
		// 本函数与 `lib/core/probe.mjs` 的 `walk`（叶子/函数计数器）同义不同物
		// （这是带**路径**的树遍历变换器）=> 按「一名一物」改名（不豁免，免得门变松）。
		const walkGame = (v, p, put) => {
			if (typeof v === 'function') { fns.push(p); return; }
			if (Array.isArray(v)) { put(v.map((x, i) => { let keep; walkGame(x, `${p}[${i}]`, (y) => { keep = y; }); return keep; })); return; }
			if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) walkGame(x, `${p}.${k}`, (y) => { o[k] = y; }); put(o); return; }
			put(v);
		};
		for (const [k, v] of Object.entries(Game ?? {})) { if (['Era', 'Damage', 'Consequences'].includes(k)) continue; walkGame(v, `Game.${k}`, (y) => { containers[k] = y; }); }
		if (fns.length) { console.error(`✗ 故事数据面里出现**函数值**（${fns.length} 处）：${fns.slice(0, 6).join(' · ')}——数据面必须是数据（函数属契约/政策，另走 kind）`); return 1; }
		// **整块**带走 `Game.Consequences`（旧写法只带 `.engine` ⇒ `provenance`（4 条出处登记）**静默丢** ✗ ——
		// 这是行为门（容器深度相等）抓到的，字节面／契约面都看不见：类名＝「只搬一个桶，他桶就没了」）。
		// 新增桶 ⇒ **显式报错**（抽取器不认识就拒绝，不许静默丢 ✗）。
		const consAll = Game?.Consequences ?? null;
		if (consAll) {
			const unknown = Object.keys(consAll).filter((k) => !['provenance', 'engine'].includes(k));
			if (unknown.length) { console.error(`✗ Game.Consequences 里有抽取器**不认识**的桶：${unknown.join('、')} —— 要么加进来、要么显式说明为何不带（不许静默丢）`); return 1; }
		}
		const cons = consAll ? { provenance: consAll.provenance ?? {}, engine: consAll.engine ?? {} } : null;
		const payload = { section, containers, ...(cons ? { merges: [
			{ target: 'Game.Consequences.provenance', default: { provenance: {}, engine: {} }, value: cons.provenance },
			{ target: 'Game.Consequences.engine', default: { provenance: {}, engine: {} }, value: cons.engine },
		] } : {}) };
		const text = JSON.stringify(payload, null, '\t') + '\n';
		const pkgPath = join(ROOT, packageFiles(slug).dataFile('tables.json'));
		if (out === pkgPath) writeStoryPackage({ slug, data: { 'tables.json': text }, io: NODE_IO });
		else { mkdirp(dirname(out)); writeText(out, text); }
		const leaves = (v) => (v && typeof v === 'object' ? Object.values(v).reduce((n, x) => n + leaves(x), 0) : 1);
		console.log(`✔ ${slug}：导出故事数据面 → ${out.replace(ROOT, '')}（顶层 ${Object.keys(containers).length} 键 · 叶子 ${leaves(containers)}${cons ? ' · 含 Consequences 合并' : ''}）`);
		return 0;
	}
	const value = Sg?.story?.[key];
	if (typeof value !== 'function') { console.error(`✗ ${file} 里没有 Sg.story.${key}（拿不到数据）`); return 1; }
	const data = value();
	if (!Array.isArray(data) || !data.length) { console.error(`✗ Sg.story.${key}() 不是非空数组（拿不到数据＝不许当"空了"）`); return 1; }
	// ── **抽取器自己也要可复现**（审查要求）：产物是**入库的源文件** ⇒ 连抽两次必须逐字节相同。
	// 不稳定（键序/浮点/时间戳）的症状很烦人：工作区**每次都脏**，而没人知道为什么。
	const serialize = (rows) => JSON.stringify({ section, key, rows }, null, '\t') + '\n';
	const again = value();
	if (serialize(data) !== serialize(again)) {
		console.error(`✗ 抽取器**不稳定**：连抽两次序列化不同（${serialize(data).length}B vs ${serialize(again).length}B）——产物入库后会让工作区每次都脏`);
		return 1;
	}
	const pkgPath2 = join(ROOT, packageFiles(slug).dataFile(`${key}.json`));
	if (out === pkgPath2) writeStoryPackage({ slug, data: { [`${key}.json`]: serialize(data) }, io: NODE_IO });
	else { mkdirp(dirname(out)); writeText(out, serialize(data)); }
	console.log(`✔ ${slug}：抽出 ${data.length} 行（section=${section} key=${key}）→ ${out.replace(ROOT, '')}`);
	for (const d of diag.slice(0, 5)) console.log(`  · 沙箱输出：${d}`);
	return 0;
};

export const classifyCommand = (argv = [], { prog = 'node editor/classify-contract.mjs', sub = '' } = {}) => {
	const argOf = (name, dflt) => { const h = argv.find((a) => a.startsWith(`--${name}=`)); return h ? h.slice(name.length + 3) : dflt; };
	const slug = argv[0];
	if (!slug) { console.error(usageOf(prog, sub, '<slug> [--json]')); return 2; }
	const file = join(ROOT, argOf('from', `stories/${slug}/15-tables.twee`));
	// `#794`：**输入缺失 ⇒ 单独一条** ✗ —— 实测：不存在的路径原先被报成"里面**找不到 Sg.story 成员**" ✓，
	// 方向对（不静默 ✓）但**归因错** ✗（读的人会去查契约 ✗，而真因是**文件不在** ✓）⇒ 与 `extract-story` 同口径 ✓。
	if (!existsSync(file)) { console.error(`✗ 读不到输入：${file}（文件不存在）—— "读不到输入"不许当"没有故事逻辑"`); return 1; }
	// 契约源＝**手写的**数据面文件（`15-tables.twee`）＋ 登记过的手写逃生舱文件。
	// ⚠️ 已翻面的故事里 `15-tables.twee` 是**产物**（带生成标记）⇒ **不能**分类它：发射后的代码形状会得到
	// "假欠账"（实测：`template` 那种被判 B）⇒ 那种情况下只剩逃生舱文件是手写源（与 K4 同一口径）。
	const fileText = existsSync(file) ? readFileSync(file, 'utf8') : '';   // 数据面文件的**原文** ✓
	// ⚠️ **重新钉住**（实测回归 ✗）：下面 `resolveLocalConst(fileText, …)` 用它 ✓ —— 我在搬 core 时
	//   把这行切掉了 ✗ ⇒ 那条路径一旦走到就是 `ReferenceError` ✓；而**没有任何测试走那条路径** ✗
	//   （只有"手写契约里出现 `() => 局部常量`"才触发 ✓，三个故事都翻面后就没有活样本了 ✓）
	//   ⇒ 所以它是**静默回归** ✓：靠人量出来 ✓，靠 CI 量不出来 ✗。
	const tableSrc = existsSync(file) && !hasGeneratedMarker(fileText) ? fileText : '';
	if (!tableSrc) console.log(`  · ${slug}：\`15-tables.twee\` 已是**产物**（带生成标记）⇒ 契约面已由 \`data/\` 承载；本次只判**手写逃生舱文件** ✓`);
	const hatchFilesOf = hatchFiles(slug);
	const hatchTexts = hatchFilesOf.map((f) => readFileSync(f, 'utf8'));
	// `#794`：分类体已抽成**可单测的缝** ✓ `classifyContractText({ fileText, hatchTexts })`（见文件中部 ✓）。
	const { sites, stray, members, rows, hatchMembers } = classifyContractText({ fileText, siteText: tableSrc, hatchTexts });
	if (!members.length) { console.error(`✗ ${file} 里找不到 Sg.story 成员（读不到输入不许当"没有故事逻辑"）`); return 1; }
	if (stray.length) { console.error(`✗ ${file} 里还有**未被识别的** Sg.story 写法（${stray.join(' · ')}）—— 多站点合并只认 Object.assign 形态，其余必须点名而不是静默漏掉`); return 1; }
	console.log(`（站点 ${sites.length} 处：${sites.map((s2) => s2.members.length + ' 名成员').join(' ＋ ')}${hatchTexts.length ? ` · 含手写逃生舱文件 ${hatchFiles(slug).map((f) => f.split('/').pop()).join('、')}` : ''}）`);
	// **局部常量 ⇒ 成员名**（`#787`）：`mechanics: () => MECH` 这类成员把局部常量放进了契约 ⇒ 其它成员引用它时才可表达。
	// （此段已归入上面那条**可单测的缝** `classifyContractText` ✓ —— 见文件中部 ✓）
	const bucket = (b) => rows.filter((r) => r.bucket === b);
	console.log(`══ 契约分类（${slug}）：${rows.length} 个成员 ══`);
	for (const r of rows) {
		const mark = { A: '✓', B: '~', D: '↓', C: '✗' }[r.bucket];
		const tail = r.bucket === 'A' ? r.kind
			: r.bucket === 'B' ? `需要扩展 ${r.kind}（${r.why}）`
			: r.bucket === 'D' ? `可下沉：${r.sink}`
			: `逃生舱候选：${r.why}`;
		console.log(`  ${mark} ${r.name.padEnd(18)} ${tail}`);
		if (r.bucket !== 'A') console.log(`      源码：${r.src.replace(/\s+/g, ' ').slice(0, 150)}`);
	}
	console.log(`\n  汇总：可直接表达 ${bucket('A').length} · 需声明式扩展 ${bucket('B').length} · 可下沉引擎 ${bucket('D').length} · **真逃生舱候选 ${bucket('C').length}**`);
	if (bucket('B').length || bucket('D').length) console.log(`  （B＝待补的声明式 kind；D＝待下沉的引擎能力 ⇒ 都**不是**逃生舱）`);
	if (argv.includes('--json')) console.log('\n' + JSON.stringify({ slug, members: rows }, null, '\t'));
	// `--propose[=<path>]`：把**全部可数据化的成员**写成故事包的 `data/contract.json`（生成物 ⇒ 单一真源）。
	// 只要还有非 A 成员就 **fail-loud**（点名）—— 提案必须完整，不许悄悄少写一半（那会让产物静默缺成员）。
	const proposeArg = argv.find((a) => a === '--propose' || a.startsWith('--propose='));
	if (proposeArg && !tableSrc) { console.error(`✗ ${slug} 的 \`15-tables.twee\` 已是**产物** ⇒ 没有什么可提案的（数据面已由 \`data/contract.json\` 承载）`); return 1; }
	if (proposeArg) {
		const aRows = rows.filter((r) => !hatchMembers.has(r.name));   // 逃生舱成员不进提案（它们住手写件）
		const bad = aRows.filter((r) => r.bucket !== 'A');
		if (bad.length) {
			console.error(`✗ 无法提案：${bad.length} 个成员不是 A 桶、且**没住进**登记过的手写逃生舱文件 ⇒ ${bad.map((r) => `${r.name}(${r.bucket})`).join(' · ')}`);
			console.error('  生成物只装得下 A 桶 ⇒ 非 A 成员必须移到手写件并在 `editor/escape-hatch.json` 的 `hatchFiles` 登记（否则翻面就是**静默丢成员**）。');
			return 1;
		}
		const out = proposeArg.includes('=') ? proposeArg.split('=')[1] : null;      // 显式路径 ⇒ 包外/自定义（不属"故事文件" ✓）
		const payload = {
			section: 'StoryBindings',
			note: '分类器自动提案（`--propose`）：本文件是**生成物**，请勿手改；要改成员形状改故事源或 classifier 的 kind 集合。',
			members: aRows.map((r) => ({ name: r.name, kind: r.kind, ...(r.spec ?? {}) })),
		};
		if (out) {
			mkdirp(dirname(out));
			writeText(out, JSON.stringify(payload, null, '\t') + '\n');
			console.log(`✔ 提案已写出：${out}（成员 ${aRows.length} 个 ⇒ 全部 A 桶）`);
		} else {
			const [wrote] = writeStoryPackage({ slug, data: { 'contract.json': payload }, io: NODE_IO });
			console.log(`✔ 提案已写出：${wrote}（成员 ${aRows.length} 个 ⇒ 全部 A 桶）`);
		}
		return 0;
	}
	// 非 A 的全部**点名**（不是静默跳过）：B 是"schema 该补"，C 是"要么下沉引擎、要么进逃生舱清单"
	return bucket('C').length ? 1 : 0;
};

export const equivCommand = (argv = [], { prog = 'node editor/equiv.mjs', sub = '' } = {}) => {
	const slug = argv[0];   // `#794` 弧第 3 票：入参是**子命令之后**的 argv（不再读环境 ✗）
	if (!slug) { console.error('用法：node editor/equiv.mjs <slug> [--rules] [--l3=hard|report] [--hand=…] [--gen=…]'); return 2; }
	const argOf = (name, dflt) => { const h = argv.find((a) => a.startsWith(`--${name}=`)); return h ? h.slice(name.length + 3) : dflt; };
	const rulesMode = argv.includes('--rules');
	// 车道 B · notes 面（`#215` 报备 `18504282` ✓）：**第四个面** ✓（与 `--rules` 同款：只换默认产物名与 L1 取数口 ✓）。
	// ⚠️ 发起者补（`#215` 报备 `18505730` ✓）：本面是**一个数据文件 → 多份产物** ✗ ⇒ 默认产物名可能**不是** `ch1` ✓
	//   ⇒ 加**可选指定** `--notes=<产物文件>` ✓（**默认值一字不改** ✗）；判定用**前缀**（`--notes=…` 也要认 ✗）。
	//   “若要一条命令覆盖该面全部块” 属**另一片** ✗（`--hand` 要从单文件变成块⇒基线映射 ⇒ 不是最小改动 ✓）。
	const notesTarget = argOf('notes', null);
	// `#958` 票内复核 MINOR（`[deferred]`，本片承办 ✓）：取值类标志**吃空值** ⇒ 下游会崩成**裸 Node 栈** ✗
	//   （`--notes=` 空 ⇒ `''` ⇒ `readFileSync('')` ⇒ `EISDIR` ✓；`--hand=` 空 ⇒ `join(ROOT,'')` ＝ 仓根 ⇒ **同型** ✓）。
	//   ⇒ 照**同一条 `--l3=` 的现成形状**讲人话地拒 ✗（`console.error` ＋ `return 2`，不新造机制 ✓）。
	//   ⚠️ 跨命令那一族（`--out=`／`--from=`／`--section=`／`--key=` 的空值 ✓）**不夹带** ✗ ⇒ 另开票 ✓。
	if (notesTarget === '') { console.error('✗ --notes= 只接受产物文件名（实得 （空））—— 例：`--notes=16-notes-ch2.twee`；不给该标志 ⇒ 默认 `16-notes-ch1.twee`'); return 2; }
	const notesMode = argv.includes('--notes') || notesTarget !== null;
	const l3Mode = argOf('l3', 'hard');
	if (!L3_MODES.includes(l3Mode)) { console.error(`✗ --l3 只接受 ${L3_MODES.join('|')}（实得 ${l3Mode}）`); return 2; }
	const handGiven = argv.some((a) => a.startsWith('--hand='));
	const handValue = argOf('hand', '');
	if (handGiven && handValue === '') { console.error('✗ --hand= 只接受基线文件路径（实得 （空））—— 例：`--hand=stories/<slug>/gates/equiv-baseline/<file>.txt`'); return 2; }
	// ⚠️ **一处定义** ✗：产物名只在这里算一次 ✓ —— 它**同时**驱动 `--hand` 的默认路径与下面取产物那一步 ✓
	//  （两处各写一份 ternary ⇒ “比的是 ch2、指路指 ch1”的**错位** ✓；复核席 `18505646` 点名过这处 ✗）。
	const defaultTwee = notesMode ? (notesTarget ?? '16-notes-ch1.twee') : rulesMode ? '17-rules.twee' : '15-tables.twee';
	const handPath = join(ROOT, argOf('hand', `stories/${slug}/${defaultTwee}`));
	// `#794` 观察项：**裸跑（未显式给 `--hand`）＋ 默认目标是产物 ⇒ 当场拒绝并指路** ✓（见 `bareHandRefusal` ✓）。
	// ⚠️ 放在**昂贵比较之前** ✓（复核口径 ✓）：下面要连编译两次 ＋ 逐字节比 ⇒ 跑完再报等于让人白等 ✓。
	const defaultExists = existsSync(handPath);
	const refusal = bareHandRefusal({ handGiven, defaultExists, defaultText: defaultExists ? readFileSync(handPath, 'utf8') : '' });
	if (refusal) {
		const base = `stories/${slug}/gates/equiv-baseline/${defaultTwee}.txt`;
		const rel = `stories/${slug}/${defaultTwee}`;
		if (refusal === 'product') {
			const hint = existsSync(join(ROOT, base))
				? `\n   ⇒ 建议：\`--hand=${base}\`（冻结基线 ✓）`
				: `\n   该模式暂无冻结基线（\`${base}\` 不存在）⇒ 需**先落基线**（带票号/理由 ✓）或显式给 \`--hand=<手写契约路径>\``;
			console.error(`✗ 未显式给 --hand，而默认目标 \`${rel}\` 是**产物**（带生成标记）：\n`
				+ `  产物只含 A 桶成员，而本工具要比的是**整份契约**（生成侧还会并入登记过的手写逃生舱文件）\n`
				+ `  ⇒ 两侧**结构不同**、必然不等 —— 这是**跑法**问题，不是数据问题。${hint}`);
		} else {
			console.error(`✗ 未显式给 --hand，而默认目标 \`${rel}\` **根本不存在**：\n`
				+ `  该模式在本故事里没有可判的源 ⇒ 既不点名不存在的路径、也不静默晚失败 ✗\n`
				+ `  ⇒ 需**先落基线**（\`${base}\`，带票号/理由 ✓）或显式给 \`--hand=<手写契约路径>\``);
		}
		return 2;
	}
	const hand = readFileSync(handPath, 'utf8');

	// ── 自跑编译器两次 ⇒ 幂等 ＋ 拿到产物（不判陈旧件） ──
	const genDir = join(ROOT, 'build/generated', slug);
	const idemDir = join(ROOT, 'build/generated', `.idem-${slug}`);
	runNode([COMPILER, slug, `--out=${genDir}`], { cwd: ROOT });
	runNode([COMPILER, slug, `--out=${idemDir}`], { cwd: ROOT });
	const names = [...new Set([...readdirSync(genDir), ...readdirSync(idemDir)])].sort();
	const idemOk = names.length > 0 && names.every((n) => readFileSync(join(genDir, n)).equals(readFileSync(join(idemDir, n))));
	const gen0 = readFileSync(join(genDir, defaultTwee), 'utf8');   // ← **复用上面那一处定义** ✗（不再各写一份 ternary ✓）
	// **产物侧 ＝ 生成物 ＋ 登记过的手写逃生舱文件**（`#787` 翻面形状）：非 A 桶成员装不进生成物 ⇒ 它们住手写件，
	// 而行为门要比的是**整份契约**；手写侧（冻结基线）本来就含它们 ⇒ 只比生成物会得到"少了成员"的**假差** ✗。
	// 单一真源＝`editor/escape-hatch.json` 的 `hatchFiles` ✓ —— 读它**共用** `lib/host/hatches.mjs` 的实现 ✓
	//（本文件原来有一份**内联复制** ✗，已收掉 ✓ —— 避免两个消费者各写一份 ✓）。
	const gen = [gen0, ...hatchFiles(slug).map((f) => readFileSync(f, 'utf8'))].join('\n');

	const results = [[idemOk, `幂等：连编译两次产物逐字节相同（${names.length} 份：${names.join('、')}）`]];
	const l3Line = (nh, ng, what) => {
		const same = nh === ng;
		const at = [...nh].findIndex((c, i) => c !== ng[i]);
		return [same || l3Mode === 'report',
			`L3 形式等价（--l3=${l3Mode}）：${what}（手写 ${nh.length}B / 生成 ${ng.length}B）${same ? '' : `\n    首个差异 @${at}\n    手写 …${nh.slice(Math.max(0, at - 40), at + 60)}\n    生成 …${ng.slice(Math.max(0, at - 40), at + 60)}`}`];
	};

	if (rulesMode) {
		// ── 条件表：L1 = 两版各自求值后**行数组深度相等**（＝列级一致：少抽一个字段也会不等） ──
		const rowsOf = (text) => { const box = sandboxOf(); vm.runInContext(scriptBodies(text).join('\n'), box, { timeout: 5000 }); return box.Sg.story.rules(); };
		const hr = rowsOf(hand), gr = rowsOf(gen);
		/** 字段直方图：把"抽了哪些列"显式打出来（`#557` 那条老账：总体非空拦不住少抽一项）。 */
		const hist = (rows) => {
			const h = {};
			for (const r of rows) for (const k of Object.keys(r)) h[k] = (h[k] ?? 0) + 1;
			return Object.fromEntries(Object.entries(h).sort(([a], [b]) => (a < b ? -1 : 1)));
		};
		const hh = hist(hr), gh = hist(gr);
		results.push([JSON.stringify(hr) === JSON.stringify(gr),
			`L1 条件表**深度相等**（手写 ${hr.length} 行 / 生成 ${gr.length} 行）${JSON.stringify(hr) === JSON.stringify(gr) ? '' : '\n    两版不同（见下条字段直方图与 L3 定位）'}`]);
		results.push([JSON.stringify(hh) === JSON.stringify(gh),
			`L1 字段直方图一致（每列出现多少次）：${Object.entries(hh).map(([k, v]) => `${k} ${v}`).join(' · ')}`]);
		results.push(l3Line(normalize(section(hand, 'StoryRules') ?? ''), normalize(section(gen, 'StoryRules') ?? ''), '剥注释/空白/冗余尾逗号后逐字节相同'));
		results.push([hr.length > 0 && Object.keys(hh).length > 0, `判到的面不为空：条件表 ${hr.length} 行 · ${Object.keys(hh).length} 列`]);
	} else if (notesMode) {
		// ── notes 面（车道 B · `#215` `18504282` ✓）：L1 ＝ 两版各自求值后 `Game.Notes.entries` **深度相等** ──
		//   ⚠️ 沙箱必须**先跑引擎常量** ✗ —— `era: window.Game.Era.PRESENT` 是引擎政策 ✓（
		//   `sandboxOf()` 就是干这个的 ✓；少了它就**两侧都缺字段** ⇒ 会得到一个“差不多”的假绿 ✗）。
		const entriesOf = (text) => { const box = sandboxOf(); vm.runInContext(scriptBodies(text).join('\n'), box, { timeout: 5000 }); return box.Game?.Notes?.entries ?? null; };
		const sectionName = (text) => (String(text).match(/^::\s*([^\n]*?)\s*(?:\[[^\]]*\])?\s*$/m)?.[1] ?? '').trim();
		const he = entriesOf(hand), ge = entriesOf(gen);
		/** 字段直方图（照 `--rules` 那路同款 ✓）：把“**抽了哪些字段**”显式打出来 ✗ ——
		 *  `#557` 那条老账：**总体非空拦不住少抽一项** ✓。 */
		const hist = (entries) => {
			const h = {};
			for (const e of Object.values(entries ?? {})) for (const k of Object.keys(e ?? {})) h[k] = (h[k] ?? 0) + 1;
			return Object.fromEntries(Object.entries(h).sort(([a], [b]) => (a < b ? -1 : 1)));
		};
		const hh = hist(he), gh = hist(ge);
		const hn = Object.keys(he ?? {}).length, gn = Object.keys(ge ?? {}).length;
		results.push([he !== null && ge !== null, `两侧都取到 notes 面（手写 ${hn} 条 / 生成 ${gn} 条）—— 取不到 ⇒ 下面几条都是**假绿** ✗`]);
		results.push([JSON.stringify(he) === JSON.stringify(ge), `L1 notes **深度相等**（手写 ${hn} 条 / 生成 ${gn} 条）${JSON.stringify(he) === JSON.stringify(ge) ? '' : '\n    两版不同（见下条字段直方图与 L3 定位）'}`]);
		results.push([JSON.stringify(hh) === JSON.stringify(gh), `L1 字段直方图一致（每个字段出现多少次）：${Object.entries(hh).map(([k, v]) => `${k} ${v}`).join(' · ')}`]);
		const secName = sectionName(hand);
		results.push([secName !== '' && secName === sectionName(gen), `段名两侧相同：${JSON.stringify(secName)}（段名不同 ⇒ L3 比的是两个不同的段 ✗，与㉗同族 ✓）`]);
		results.push(l3Line(normalize(section(hand, secName) ?? ''), normalize(section(gen, secName) ?? ''), '剥注释/空白/冗余尾逗号后逐字节相同'));
		results.push([hn > 0 && Object.keys(hh).length > 0, `判到的面不为空：笔记 ${hn} 条 · ${Object.keys(hh).length} 个字段`]);
	} else {
		// ── 表 ＋ 契约（P0 原口径） ──
		const H = evalSide(scriptBodies(hand).join('\n'), '手写侧（基线）');
		const G = evalSide(scriptBodies(gen).join('\n'), '生成侧（产物）');
		if (!H.win || !G.win) {
			results.push([false, `两侧求值（判据的红要讲人话 ✓）：${[H.err, G.err].filter(Boolean).join('；')}`]);
		}
		const hWin = H.win, gWin = G.win;
		const hs = hWin ? snapshot(hWin) : null, gs = gWin ? snapshot(gWin) : null;
		// 段数只**报告**（生成物的段划分与手写不要求同形：`Cave Declarations` 那类"局部常量段"会并进契约的 `const`）；
		// 真正要判的是**契约成员的键集合**（下面那条）＋ 行为。
		console.log(`  · 段数（只报告）：手写 ${scriptBodies(hand).length} 段 / 生成 ${scriptBodies(gen).length} 段`);
		if (hs && gs) {
			const hk = Object.keys(hs.contract).sort(), gk = Object.keys(gs.contract).sort();
			const onlyHand = hk.filter((k) => !gk.includes(k)), onlyGen = gk.filter((k) => !hk.includes(k));
			results.push([onlyHand.length === 0 && onlyGen.length === 0,
				`L1 契约**键集合**一致（手写 ${hk.length} / 生成 ${gk.length}）${onlyHand.length ? `\n    仅手写有：${onlyHand.join('、')}` : ''}${onlyGen.length ? `\n    仅生成有：${onlyGen.join('、')}` : ''}`]);
			results.push([hs.game === gs.game, `L1 数据容器深度相等（含 State/Notes/Consequences；**对象键序不计**，数组序仍判）${hs.game === gs.game ? '' : `\n    手写 ${String(hs.game).slice(0, 220)}\n    生成 ${String(gs.game).slice(0, 220)}`}`]);
			// 判**行为**，不判**顺序**：成员在源里的先后不是语义（曾因"生成物把某成员排到末尾"而假红 ✗）
			const cd = diffContract(hs.contract, gs.contract);
			results.push([Object.keys(hs.contract).length > 0 && cd.n === 0,
				`L1 契约**多实参**行为相等（${Object.keys(hs.contract).length} 个成员 × ${probeArgs(hs.ids).length} 组实参）${cd.n ? `\n    ${cd.text}` : ''}`]);
			results.push(l3Line(scriptBodies(hand).map(normalize).join('|'), scriptBodies(gen).map(normalize).join('|'), '词法遮蔽注释 ＋ 去空白/冗余尾逗号后逐字节相同'));
			results.push([hs.walk.functions === 0 && gs.walk.functions === 0, `数据面是数据：容器内函数值 0 个（手写 ${hs.walk.functions} / 生成 ${gs.walk.functions}）`]);
			const surface = { '容器键数': Object.keys(JSON.parse(hs.game === 'null' ? '{}' : hs.game)).length, '数据叶子数': hs.walk.leaves, '契约成员数': Object.keys(hs.contract).length, '探针调用次数': hs.probes, '归一字节数': scriptBodies(hand).map(normalize).join('|').length };
			const empty = Object.entries(surface).filter(([, v]) => !v).map(([k]) => k);
			results.push([empty.length === 0, `判到的面不为空：${Object.entries(surface).map(([k, v]) => `${k} ${v}`).join(' · ')}${empty.length ? `　✗ 为 0 的：${empty.join('、')}` : ''}`]);
		}
	}

	let bad = 0;
	for (const [ok, msg] of results) { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) bad++; }
	console.log(bad ? `\n✗ 等价判据未通过（${bad} 项）` : `\n✔ ${slug}${rulesMode ? '（条件表）' : ''}：手写版 ↔ 数据版 等价（幂等 ＋ L1 ＋ L3(--l3=${l3Mode}) ＋ 面非空）`);
	return bad ? 1 : 0;
};

export class LintRefuse extends Error {}

/** `lint-story <slug|目录路径> [--json] [--dist=<file>]` ⇒ rc（**async**：`gatesForStory` 本质 async ✓ ——
 *  它经 `declaredGates` **逐个 `await import()`** 载门模块，ESM 无法同步化 ✓ ⇒ 入口统一 await ✓）。
 *  与 `node editor/lint-story.mjs` **同一具身体** ✓。 */
export const lintCommand = async (argv = [], { prog = 'node editor/cli.mjs', sub = 'lint-story' } = {}) => {
	const arg = argv[0];
	if (!arg) { console.error(usageOf(prog, sub, `<slug|目录路径> [--json] [--dist=<file>]`)); return 2; }
	// 命令体局部状态（`#794`：原 6 个**模块级**可变状态收成局部 ⇒ 可重入、并按构造消掉"模块级闭包"隐患 ✓）
	const JSON_OUT = argv.includes('--json');
	const DIST = (argv.find((a) => a.startsWith('--dist=')) ?? '').slice('--dist='.length) || join(ROOT, 'dist', 'index.html');
	const findings = [];
	let step = 'shape';
	let slug = '';
	let dir = '';
	const say = (m) => { if (!JSON_OUT) console.log(m); };
	const emitJson = (code) => { if (JSON_OUT) process.stdout.write(JSON.stringify({ slug, dir, ok: code === 0, findings }, null, 1) + '\n'); };
	const ok = (m) => { findings.push({ step, ok: true, detail: m }); say(`  ✔ ${m}`); };
	/** **非局部终止符**：`fail` 的契约是「不再往下走」✓ ⇒ 用哨兵异常按构造保真 ✓（逐点 `return` 会沿不同嵌套深度回传、易漏 ✗）。 */
	const fail = (m) => { findings.push({ step, ok: false, detail: m }); if (!JSON_OUT) console.error(`  ✗ ${m}`); throw new LintRefuse(); };
	const sh = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
	try {
		// `<slug>`＝stories/<slug>；含路径分隔符或已存在的目录 ⇒ 当**目录**（临时探针/仓外包亦可用；CLI 契约向后兼容）
		const asPath = arg.includes('/') || existsSync(arg);
		dir = asPath ? arg : join(ROOT, 'stories', arg);
		slug = asPath ? arg.replace(/\/+$/, '').split('/').pop() : arg;
		say(`lint-story：${slug}${asPath ? `（路径 ${dir}）` : ''}`);
		if (!existsSync(dir)) fail(`故事目录不存在：${dir}`);
		let manifest = null;
		try { manifest = JSON.parse(readFileSync(join(dir, '00-story.json'), 'utf8')); }
		catch (e) { fail(`00-story.json 不可解析：${e.message}`); }
		if (!Array.isArray(manifest?.files) || !manifest.files.length) fail('00-story.json 缺 files（非空数组）');
		const dataTables = join(dir, 'data', 'tables.json');
		const dataContract = join(dir, 'data', 'contract.json');
		if (!existsSync(dataTables) || !existsSync(dataContract)) fail('未数据化（缺 data/tables.json 或 data/contract.json）——lint 的对象是数据包；先走 #762 的数据化往返');
		try { JSON.parse(readFileSync(dataTables, 'utf8')); JSON.parse(readFileSync(dataContract, 'utf8')); }
		catch (e) { fail(`data/*.json 不可解析：${e.message}`); }
		ok(`包形状（files×${manifest.files.length} · tables/contract 可解析）`);

		// ── ② 编译＋幂等 ──
		step = 'compile';
		const gen = join(ROOT, 'build', 'generated', slug);
		rmSync(gen, { recursive: true, force: true });
		let r1 = sh('node', ['editor/compile-story.mjs', slug]);
		if (r1.status !== 0) fail(`编译失败（第一次）：\n${(r1.stderr || r1.stdout || '').slice(0, 800)}`);
		const snap = join(ROOT, 'build', 'generated', `${slug}.lint-snap`);
		rmSync(snap, { recursive: true, force: true });
		sh('cp', ['-r', gen, snap]);
		const r2 = sh('node', ['editor/compile-story.mjs', slug]);
		if (r2.status !== 0) fail(`编译失败（第二次）：\n${(r2.stderr || r2.stdout || '').slice(0, 800)}`);
		const diff = sh('diff', ['-r', snap, gen]);
		if (diff.status !== 0) fail(`编译不幂等（两次产物有差）：\n${(diff.stdout || '').slice(0, 400)}`);
		rmSync(snap, { recursive: true, force: true });
		ok('编译 ＋ 幂等（两次产物逐字节相同）');

		// ── ③ 等价（L1/L3）——**必须显式给冻结基线** ──
		// 裸调 `equiv <slug>` 在已翻面的故事上比的不是等价 ✗（默认 `--hand`＝产物 ⇒ 量到"产物 vs 当场重编产物" ✓
		// ＝K4-④ 新鲜度面 ✓）⇒ 有基线就显式给 ✓；L3 用 report 档 ✓（默认 hard ⇒ 翻面故事因注释/空白差异假红 ✗）。
		step = 'equiv';
		let equivDegraded = false;
		const baseline = join(dir, 'gates', 'equiv-baseline', '15-tables.twee.txt');
		if (existsSync(baseline)) {
			const req = sh('node', ['editor/equiv.mjs', slug, `--hand=${relative(ROOT, baseline)}`, '--l3=report']);
			if (req.status !== 0) fail(`等价判据未过（L1 权威 ＋ L3 report）：\n${(req.stdout || req.stderr || '').slice(0, 800)}`);
			ok('等价（L1 结构/多实参行为 vs **冻结基线** ＋ L3 剥注释形式·report 档）');
		} else {
			const detail = `降级：无冻结基线（gates/equiv-baseline/15-tables.twee.txt 不存在）⇒ 本步**未查等价** ✗（新鲜度面由 K4 门另行把守，不在本工具步骤内）`;
			equivDegraded = true;
			say(`  · ${slug}：${detail} —— 这是**状态**，不是"没问题" ✓`);
			findings.push({ step, ok: true, detail });
		}

		// ── ④ 门：本故事自己的门，经 audit 原路径（同结论保证＝同一调用面，零重实现）──
		const gates = await gatesForStory(slug);
		const flags = [...new Set(gates.flatMap((g) => g.flags ?? []))];
		if (!flags.length) fail('本故事没有可跑的门（gatesForStory 为空）——门是 lint 的一部分，缺门＝红');
		step = 'precondition';
		const DIST_GATES = ['a11y'];
		if (flags.some((f) => DIST_GATES.includes(f)) && !existsSync(DIST)) {
			fail(`前置缺失：${DIST} 不存在 ⇒ 先跑 \`node build.mjs\`（故事门里的 a11y 等需要构建产物；这是环境态，不是判据不通过）`);
		}
		step = 'gates';
		const ra = sh('node', ['scripts/audit.mjs', '--story', slug, '--check', ...flags.map((f) => `--${f}`)]);
		if (ra.status !== 0) fail(`故事门有红（${flags.length} 面）：\n${(ra.stdout || ra.stderr || '').slice(0, 1200)}`);
		ok(`故事门 ×${flags.length} 面全绿（audit 原路径）`);

		// ── ⑤ 形状门 ──
		step = 'story-shape';
		const rs = sh('node', ['test/story-shape.mjs']);
		if (rs.status !== 0) fail(`story-shape 门红：\n${(rs.stdout || rs.stderr || '').slice(0, 600)}`);
		ok('story-shape 门');

		say(`\n✔ lint-story：${slug} 通过（包形状 · 编译幂等 · ${equivDegraded ? '等价**降级**（无冻结基线 ⇒ 未查，见上 ✓）' : '等价'} · 门 ×${flags.length} · 形状）`);
		emitJson(0);
		return 0;
	} catch (e) {
		// 只吞自己的 `LintRefuse` ✓ —— 真崩溃（TypeError/ReferenceError）**原样抛** ✗（不许洗成"clean rc=1 ＋ JSON"）
		if (!(e instanceof LintRefuse)) throw e;
		emitJson(1);
		return 1;
	}
};
/**
 * `#794` 第 4 条：**K4 门的命令体**（从 `editor/k4.mjs` 的 `main` 平移 ✓ 逐字保留输出文案）。
 * 两条入口共用它：`node editor/k4.mjs`（壳转发 ✓）与 `node editor/cli.mjs k4` ✓。
 * 平移期的三处形状变更（都属"语义转换"，复核席按该类核 ✓）：
 *   ① `process.exit(n)` ⇒ `return n;` ✓（命令体返回退出码，由调用方决定怎么退 ✓）；
 *   ② 分类器懒接线 ⇒ **静态装配** ✓（见文件头注释：降级分支已不可达 ⇒ 删除 ✓）；
 *   ③ `process.argv` ⇒ **形参 `argv`** ✓（整体替换，不混用 `argv[2]` 那种写法 —— 实测混用会把 slug 取成 `--hand=` 的值 ✗）。
 */
export const k4Command = (argv = [], { prog = 'node editor/cli.mjs', sub = 'k4' } = {}) => {
	// ⚠️ `--selfcheck` 是**壳级**选项（自证住在壳里 ✓，六个工具同一口径 ✓）⇒ cli 路到达命令体时
	//   要**指路**（与 `k6` 的 `--selftest` 处置同形 ✓）：`#847` 量到的"两走法不等价"是**全家一致的设计** ✗
	//   （extract-story／compile-story／equiv／lint-story／k6 的 cli 路都不提供自证 ✓）⇒ 这里把它做成**显式、可读**，
	//   而不是让它落进下面那条通用"别传参数"的报文里 ✗。
	if (argv.includes('--selfcheck')) {
		console.error('✗ `--selfcheck` 不是本命令的参数（自证只在工具路：`node editor/k4.mjs --selfcheck` ✓）');
		return 2;
	}
	// ⚠️ **本命令不收参数**（门判整个仓 ✓）⇒ 多给了就点名叫停 ✗ —— **不许静默忽略** ✓。
	//   旧行为是"静默忽略多余参数"（`node editor/k4.mjs minimal-demo` ⇒ 照样跑整门、rc=0 ✗）
	//   ⇒ 那是"传了却没生效"的典型：调用方以为在限定范围、实际判了全部 ✓。
	//   ⚠️ **它属行为变化**（不是纯搬运 ✓ ⇒ 单独一刀 ✓）：影响面＝**只影响手工调用** ✓
	//   （仓内 `scripts/test-plan.mjs` 两条都裸调 ✓、`docs/editor-flip-playbook.md` 也裸调 ✓）
	//   ⇒ **`npm test` 原本看不见它** ✗ ⇒ 本票自带 `test/k4-args.mjs`（让这次变化**自己露面** ✓）。
	//   拒绝落在**共享命令体**里 ⇒ 两条入口行为一致 ✓（`--selfcheck` 属**壳侧**旗标 ⇒ 那条既有不对称不涉 ✓）。
	if (argv.length) { console.error(usageOf(prog, sub, '（无参数）')); return 2; }
	let bad = 0;
	const ok = (label, cond, extra = '') => {
		if (cond) console.log(`  ✓ ${label}`);
		else { bad++; console.error(`  ✗ ${label}${extra ? '：' + extra : ''}`); }
	};

	console.log('══ K4 门（`#762` 车道 C）—— 生成物标记 · 新鲜度 · 逃生舱可枚举 ══');
	const storiesDir = join(ROOT, 'stories');
	// 判**所有故事目录**（不是只有 `data/` 的）：③ 逃生舱判据不依赖 `data/` —— 上一版按 `data/` 取故事，
	// 结果洞窟（缺 `contract.json`）**整段被跳过** ⇒ 它的 C 桶（`eventPool`）根本没人查 ✗。
	// 这正是 `#777` 修的那族错（"读不到输入却当成没有"）——我自己的门也犯了一次。
	const slugs = readdirSync(storiesDir).filter((s) => statSync(join(storiesDir, s)).isDirectory() && !s.startsWith('.'));
	ok('取到故事目录', slugs.length > 0, slugs.join('、'));
	ok('其中至少一个已数据化（有 `data/` 才算，未数据化的 ①/② 不假装判过）', slugs.some((s) => existsSync(join(storiesDir, s, 'data'))), slugs.filter((s) => existsSync(join(storiesDir, s, 'data'))).join('、'));
	if (!slugs.length) { console.error('  ✗ 没有可判的故事 —— 不静默判过'); return 1; }

	const registryPath = join(ROOT, 'editor', 'escape-hatch.json');
	ok('逃生舱登记表存在（`editor/escape-hatch.json`）', existsSync(registryPath), registryPath);
	const registry = existsSync(registryPath) ? JSON.parse(readFileSync(registryPath, 'utf8')) : { hatches: [] };

	for (const slug of slugs) {
		const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
		const dataDir = join(storiesDir, slug, 'data');
		const tablesPath = join(dataDir, 'tables.json');
		const contractPath = join(dataDir, 'contract.json');
		const dataReady = existsSync(tablesPath) && existsSync(contractPath);
		if (!dataReady) console.log(`  · ${slug}：data/ 不全（缺 tables/contract）⇒ 只有 ①/② 跳过；**③ 逃生舱判据照跑**（它不依赖 data/）`);

		// ①＋② 标记与新鲜度：**自己跑编译器**两次（不读工作区里可能陈旧的 `build/generated/`）
		//    ⚠️ 走 CLI 而不是 API：编译器的内部形状会变（`#769` 把 `compile` 改成 `compileStory` 并且改成**写文件**），
		//    而 CLI（`<slug> --out=<dir>`）是它对外的稳定面 ⇒ 门对内部重构免疫。
		const runCompile = () => {
			const dir = mkdtempSync(join(tmpdir(), 'k4-'));
			execFileSync('node', [join(ROOT, 'editor', 'compile-story.mjs'), slug, `--out=${dir}`], { cwd: ROOT, stdio: 'pipe' });
			const out = {};
			for (const f of readdirSync(dir)) out[f] = readFileSync(join(dir, f), 'utf8');
			rmSync(dir, { recursive: true, force: true });
			return out;
		};
		let fresh = {};
		if (dataReady) {
			const a = runCompile(), b = runCompile();
			fresh = a;
			for (const p of markerProblems(Object.entries(a).map(([path, text]) => ({ path: `${slug}/${path}`, text })))) { console.error(`  ✗ ${p.path}：${p.why}`); bad++; }
			for (const p of freshnessProblems(a, b)) { console.error(`  ✗ ${slug} ${p.path}：${p.why}`); bad++; }
		}

		// ④ **生成物不许独改**（K4-④）：迁移期的"两处真相"守卫 —— 带 `@generated` 的 tracked twee 必须等于当场重编的字节。
		//    只对**带标记**的文件生效（天然棘轮）；未翻面时**留痕打印**（"尚未翻面"是状态，不是"没问题"）。
		const trackedFiles = execFileSync('git', ['ls-files', `stories/${slug}`], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
			.map((rel) => [rel, readFileSync(join(ROOT, rel), 'utf8')]);
		const { marks, problems: staleProblems } = staleTrackedProblems(trackedFiles, fresh);
		if (!marks) console.log(`  · ${slug}：**尚未翻面**（0 个带 \`@generated\` 的 tracked twee）⇒ K4-④ 本次无可判对象（这是**状态**，不是"没问题"）`);
		else console.log(`  · ${slug}：K4-④ 已翻面文件 ${marks} 个 ⇒ 与当场重编产物逐字节比对`);
		for (const prob of staleProblems) { console.error(`  ✗ ${prob.path}：${prob.why}`); bad++; }

		// ③ 逃生舱：分类器（**真源**：逐成员分类 —— `classify()` 吃的是**单个成员的源码**）vs 登记表
		//    ⚠️ 判的是**手写契约源**（见 `contractSourceText`）：已数据化故事的 twee 是**产物**，
		//    分类产物会得到**假欠账**（实测：发射后的 `template` 被判 B，而它在数据侧是已支持的 kind）。
		const storyDir = join(storiesDir, slug);
		const { text: srcText, handCount, markedTwee } = contractSourceText(readdirSync(storyDir).filter((f) => statSync(join(storyDir, f)).isFile()).map((f) => [f, readFileSync(join(storyDir, f), 'utf8')]));
		// `#794`：分类走 **host 的缝** `classifyContractText` ✓（`lib/host/classify.mjs` 的单一装配点 ✓）。
		// ⚠️ 两个文本**不能混**（抽缝时踩过 ✗）：`siteText`＝扫站点用、`fileText`＝求值原文用；
		//    K4 这份 `srcText` 是**手写源**（已排除产物 ✓）⇒ 两者同源即正确 ✓。
		const classified = classifyContractText({ fileText: srcText, siteText: srcText }).rows.map((m) => ({ name: m.name, src: m.src, bucket: m.bucket }));
		// 契约已全部由 `data/` 产出（手写侧只剩非契约文件）⇒ 逃生舱由编译器 kind 白名单把关
		const noHandContract = classified.length === 0;
		// ⚠️ **空判不许空过**（`#761` 车道 A 实测）：契约全由 `data/` 产出时，上面的分类**没有手写输入** ⇒
		//    它打出的 `A0/B0/C0/D0` 是「**没判**」而不是「判过」✗（旧文案写「C 桶结构性为 0」＝把"读不到输入"说成了结论 ✗）。
		//    ⇒ 这一面改由**普查表**承担（`editor/escape-hatch-census.json`：翻面前手写契约的**逐成员去向** ✓）：
		//    逐条交代「去了数据面／下沉引擎（锚点要在树里真读到 ✓）／必须留逃生舱」⇒ **能假** ✓。
		if (noHandContract && markedTwee > 0) console.log(`  · ${slug}：契约**已全部由 data/ 产出**（带标记 twee ${markedTwee} 个，手写侧剩 ${handCount} 个非契约文件）⇒ 分类器**无手写输入**（这一面改由普查表判 ✓，下一行）`);
		{
			const censusPath = join(ROOT, 'editor/escape-hatch-census.json');
			const census = existsSync(censusPath) ? JSON.parse(readFileSync(censusPath, 'utf8')) : null;
			const storyCensus = censusOfStory(census, slug);
			if (!storyCensus) console.log(`  · ${slug}：**未普查**（\`editor/escape-hatch-census.json\` 里没有本故事的条目）⇒ 「必须逃生舱」清单本次无可判对象（这是**状态**，不是"没问题"）`);
			else {
				const contractPath = join(ROOT, `stories/${slug}/data/contract.json`);
				const dataMembers = existsSync(contractPath) ? (JSON.parse(readFileSync(contractPath, 'utf8')).members ?? []).map((m) => m.name) : [];
				const engineSymbols = {};
				let anchorCount = 0;
				for (const sink of storyCensus.engineSinks ?? []) for (const a of sink.anchors ?? []) {
					anchorCount++;
					const f = join(ROOT, a.file);
					if (existsSync(f) && readFileSync(f, 'utf8').includes(a.symbol)) engineSymbols[a.symbol] = a.file;
				}
				for (const p of censusProblems({ census, slug, dataMembers, engineSymbols, registry })) { console.error(`  ✗ ${slug}【普查·${p.code}】${p.why}`); bad++; }
				const sum = censusSummarize(storyCensus);
				console.log(`  · ${slug}：**普查** ${sum.members} 名成员（A${sum.counts.A ?? 0}/B${sum.counts.B ?? 0}/C${sum.counts.C ?? 0}/D${sum.counts.D ?? 0}）· 数据面 ${dataMembers.length} 名 · 下沉 ${sum.sinks} 条（锚点读到 ${Object.keys(engineSymbols).length}/${anchorCount}）⇒ **「必须逃生舱」 ${sum.hatches} 条**`);
			}

		// ③b **不数据化的面**（`refusedFaces`）—— 与 ③ **同构**（清单只许收缩 ✓ ＋ 条目必带理由票号 ✓），
		//    但**登记对象是"文件/面"** ✗、且**不能**走 `hatches`／`hatchFiles`（前者按契约成员名 ✓，后者会进等价门产物侧 ✓）。
		{
			const facesRegistryPath = join(ROOT, 'editor', 'escape-hatch.json');
			const facesRegistry = existsSync(facesRegistryPath) ? JSON.parse(readFileSync(facesRegistryPath, 'utf8')) : {};
			// ⚠️ **按故事过滤** ✗（照 `escapeHatchProblems()` 对 `hatches` 的同款口径 ✓）：登记表是**跨故事**的 ✓，
			//    不过滤 ⇒ 会拿「别的故事的面」当本故事的读数 ⇒ 行文名不副实 ✗；
			//    **总数**各故事求和即得 ⇒ 「可计数」不受影响 ✓。
			const allFaces = facesRegistry.refusedFaces ?? [];
			const faces = allFaces.filter((f) => typeof f?.file === 'string' && f.file.startsWith(`stories/${slug}/`));
			console.log(`  · ${slug}：**不数据化的面（\`refusedFaces\`）${faces.length} 项**（**全表合计 ${allFaces.length}** ✓） ✓（登记 ≠ 不迁：每条写明**退路 ＋ 重开条件** ✓）`);
			for (const f of faces) console.log(`      · ${String(f.file)} ⇒ ${String(f.ticket)}`);
			// ⚠️ `markerOf` 由**宿主注入** ✓（core 的 `refusedFaceProblems` 是纯函数、不碰 fs ✓）
			const markerOf = (rel) => { try { return hasGeneratedMarker(readFileSync(join(ROOT, rel), 'utf8')); } catch { return false; } };
			for (const prob of refusedFaceProblems(faces, { markerOf })) { console.error(`  ✗ ${prob.why}`); bad++; }
		}
		}
		// **取不到输入就不许判过**（`#777` 那族错：分类器曾只扫首个 `Sg.story` 块 ⇒ 少 8 名成员却“静默地没问题”）。
		// 手写源非空却一个成员都找不到 ⇒ 只能是我读错了位置（或契约换了写法）⇒ 判红，不静默。
		if (noHandContract && markedTwee === 0) { console.error(`  ✗ ${slug}：手写契约源非空（${handCount} 文件）却分类出 **0 名成员**、且没有任何带标记的产物 ⇒ 判据失效（不是通过）`); bad++; continue; }
		for (const p of escapeHatchProblems(classified, registry, slug)) { console.error(`  ✗ ${slug}【${p.member}】${p.why}`); bad++; }
		const buckets = classified.reduce((acc, m) => { acc[m.bucket] = (acc[m.bucket] ?? 0) + 1; return acc; }, {});
		console.log(`  · ${slug}：契约源 ${srcText.length}B（手写 twee ${handCount}／带标记 twee ${markedTwee}）· ${dataReady ? '标记 ✓ · 幂等 ✓ · ' : '①/② 跳过（无 data/）· '}分类 A${buckets.A ?? 0}/B${buckets.B ?? 0}/C${buckets.C ?? 0}/D${buckets.D ?? 0}`);
		// **欠账实测打印**（不写进数据文件、不手写数字 ⇒ 不会腐烂）：B ＝ 待补声明式 kind，D ＝ 待下沉引擎能力。
		// 为什么要打出来：`escape-hatch.json` 只登记 **C**（真逃生舱）；B/D 是"排期欠账"而不是"表达不了"，
		// 但**不写出来就会被读成"清单空 ⇒ 没欠账"**（这两类只是不进棘轮，不是不存在）。
		const names = (b) => classified.filter((m) => m.bucket === b).map((m) => m.name).join('、') || '（无）';
		console.log(`      欠账（B 待补 kind）：${names('B')}`);
		console.log(`      欠账（D 待下沉引擎）：${names('D')}`);
	}
	if (bad) {
		console.error(`\n✗ K4 门未通过（${bad} 项）—— 产物必须有标记、必须新鲜、逃生舱必须可枚举。`);
		return 1;
	}
	console.log('\n✔ K4 门通过（标记 · 幂等/新鲜度 · 逃生舱登记双向一致 · 生成物不许独改）');
	return 0;
};

export const k6Command = (argv = [], { prog = 'node editor/k6.mjs', sub = '' } = {}) => {
	// `#843` 复核实测 ✗：`cli.mjs k6 --selftest` 曾**静默忽略**该参数、照跑整门（rc=0）✗ ——
	// 而 `equiv`／`k4` 都**拒绝**（rc=2 ✓）⇒ `k6` 是唯一例外 ✗。自证只在**工具路**（壳里 ✓）⇒
	// 该旗标到达命令体＝走的 cli 路 ⇒ **拒绝 ＋ 指路** ✓（与 `equiv` 的处置同形 ✓）。
	if (argv.includes('--selftest')) {
		console.error('✗ `--selftest` 不是本命令的参数（自证只在工具路：`node editor/k6.mjs --selftest` ✓）');
		return 2;
	}
	let bad = 0;
	// `#794`：这两件原来是**模块级**（门与自证共用 ✓）⇒ 搬到命令体后必须自带一份 ✓
	// （跨模块无法共用 ✓；语义逐字照抄自证那两行 ✓）。
	const ok = (label, cond, extra = '') => { if (cond) console.log(`  ✓ ${label}${extra ? ' · ' + extra : ''}`); else { bad++; console.error(`  ✗ ${label}`); } };   // `#794`：原为模块级（与自证共用 ✓）⇒ 搬成**命令体局部**（跨模块无法共用 ✓）
	console.log('══ K6 门（`#794` 单一内核）—— 能力只许一处定义 · 壳里不许有内核逻辑 · 单一写路 ══');

	const files = mjsFiles(EDITOR).map((p) => [p.slice(K6ROOT.length + 1), readFileSync(p, 'utf8')]);
	ok('取到 `editor/**` 的模块', files.length > 0, `${files.length} 个`);

	const defs = definitionsOf(files);
	const dups = duplicateExportProblems(defs);
	if (dups.length) for (const d of dups.slice(0, 8)) console.error(`  ✗ 导出能力「${d.name}」被**多处定义**（两份内核 ✗）：${d.paths.join(' · ')}`);
	ok('① 导出能力只许一处定义', dups.length === 0, `重复 ${dups.length} 项`);

	const coreStarted = existsSync(CORE);
	// ③ **内核不许碰宿主**（`#794` 第 3 步）：`lib/core/**` 里出现 `node:*`／裸宿主模块名 ⇒ 红 ✓
	//（“浏览器安全”只有机检得住 ✓；今天 `core` 是干净的 ⇒ 它是**纯红**判据、不需登记表 ✓）。
	if (coreStarted) {
		const coreOnly = mjsFiles(CORE).map((p) => [p.slice(K6ROOT.length + 1), readFileSync(p, 'utf8')]);
		const hostHits = coreHostProblems(coreOnly);
		for (const h of hostHits.slice(0, 8)) console.error(`  ✗ 内核文件「${h.path}:${h.line}」引了宿主能力「${h.token}」⇒ 破坏了浏览器安全 ✗（应经 **注入的宿主能力** 取 ✓）`);
		ok('③ 内核不碰宿主（`lib/core/**` 无 `node:*`／裸宿主模块）', hostHits.length === 0, `core ${coreOnly.length} 个文件 · 命中 ${hostHits.length}`);
		// ③b（`#794`）：**浏览器侧那一半** —— 宿主全局（含 `globalThis.<名>` 形 ✗）；通用全局与 `console` **不进表** ✗
		const globalHits = coreHostGlobalProblems(coreOnly);
		for (const h of globalHits.slice(0, 8)) console.error(`  ✗ 内核文件「${h.path}:${h.line}」用到宿主全局「${h.token}」⇒ **两宿主都能跑**是 core 的硬约束 ✗（该能力应由**宿主注入** ✓，如 evalLiteral／io ✓）`);
		ok('③b 内核不碰宿主全局（浏览器侧；`globalThis.<名>` 也挡 ✓；通用全局与 console 不进表 ✓）', globalHits.length === 0, `core ${coreOnly.length} 个文件 · 命中 ${globalHits.length}`);
	} else console.log('  · `editor/lib/core` **尚未出现** ⇒ 判据③ 暂无对象（留痕 ✓，抽取落地后自动生效 ✓）');
	// ①b：`lib/core` 出现后 —— core 导出的能力**不许在 core 之外再被定义**（含非导出副本 ✗，抄的人往往不导出 ✓）
	if (coreStarted) {
		const coreFiles = mjsFiles(CORE).map((p) => p.slice(K6ROOT.length + 1));
		const coreExports = [...defs.exported.keys()].filter((n) => (defs.exported.get(n) ?? []).some((p) => coreFiles.includes(p)));
		const second = secondCopyProblems(defs, coreExports, 'editor/lib/core');
		for (const s of second.slice(0, 8)) console.error(`  ✗ 内核能力「${s.name}」在 core 之外**被再定义**（第二份内核 ✗）：${s.paths.join(' · ')}`);
		ok('①b core 能力不许在 core 之外再定义', second.length === 0, `core 导出 ${coreExports.length} 个 · 副本 ${second.length}`);
	} else console.log('  · `editor/lib/core` **尚未出现** ⇒ 判据①b 暂无对象（留痕 ✓，抽取落地后自动生效 ✓）');
	// L1（`#794`）：扫面从"cli ＋ host"扩到**全部 `editor/**`** ✓（旧口径的覆盖小于它的声称 ✗）。
	const editors = files;   // 判据① 已经读过全部 editor/**/*.mjs ✓（同一次读取，不重扫 ✓）
	const primWrites = primitiveWriteProblems(editors);
	if (primWrites.length) for (const w of primWrites.slice(0, 8)) console.error(`  ✗ 「${w.path}:${w.line}」出现原语写「${w.token}(…）」⇒ 原语写只许出现在 lib/host/** ✓（换 import 来源或抽到 host ✓）`);
	ok('② 原语写只许出现在 `lib/host/**`（L1；扫**全部** `editor/**` ✓ 不依赖路径长什么样 ✓）', primWrites.length === 0, `扫描 ${editors.length} 个文件 · 违规 ${primWrites.length}`);
	const delHits = deleteStoryProblems(editors);
	for (const h of delHits.slice(0, 8)) console.error(`  ✗ 「${h.path}:${h.line}」用「${h.token}(…）」删 stories/** ⇒ 故事面删除应经 host 的能力 ✓（边界：运行期拼路径的删除**不在覆盖内** ✗）`);
	ok('②b 删除原语不许落到 `stories/**`（L1′；与 L1 分开 ✓；边界：运行期拼路径不覆盖 ✓）', delHits.length === 0, `扫描 ${editors.length} 个文件 · 违规 ${delHits.length}`);
	if (!coreStarted) console.log('  · `editor/lib/core` **尚未出现** ⇒ 内核抽取未开始：本门此刻只跑判据①（②暂无对象）——**这行就是留痕** ✓，抽取落地后自动生效 ✓');

	if (bad) { console.error(`\n✗ K6 门未通过（${bad} 项）—— 防双内核：能力单一定义 · 壳薄 · 单一写路。`); return 1; }
	console.log('\n✔ K6 门通过（单一内核 · 壳薄 · 单一写路）');
	return 0;   // `#794`：**命令体必须返回 rc**（原来这部分靠"跑完即 0" 的默认 ✓；搬进命令体后
	             // 不复存在 ⇒ 返回 `undefined` ✗ ⇒ 被入口的 rc 断言当场点名 ✓ —— 断言是装备 ✓）
};
