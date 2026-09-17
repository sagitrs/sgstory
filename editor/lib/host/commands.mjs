// `#794` 抽取的最后一个信封：**命令体**（一个命令一个函数：`解析 → 干活 → 打印`）。
//
// 为什么住 host ✓：命令体要读/写文件（宿主能力 ✓）；但它**调 core**（编译 `compileStory` ✓、
// 唯一写路 `writeStoryPackage` ✓）⇒ core 本身仍零宿主依赖 ✓（K6 ③ 在盯 ✓）。
//
// **两条入口共用同一具身体** ✓：`editor/cli.mjs <子命令>` 与 `node editor/<工具>.mjs …` 都调这里的同一个函数 ✓
// ⇒ 等价性**按构造成立** ✓（不是"两个实现碰巧一致" ✗ —— 那种迟早漂移 ✓）。
// 连**参数解析**也在这里 ✓（函数的入参就是原始 `argv` 尾巴 ✓）⇒ 入口层没有第二份解析 ✓
// （否则"未知标志/缺必填/多给位置参数"三档就会两边不一致 ✓ —— 那正是入口层分叉的藏身处 ✓）。
import { join, resolve, dirname } from 'node:path';
import { readText, writeText, mkdirp, exists, ROOT, engineScripts } from './fs.mjs';
import { scriptBodies } from '../core/text.mjs';
import { compileStory } from '../core/emit.mjs';
import { packageFiles, writeStoryPackage, sectionFile } from '../core/story.mjs';
import { runStory, engineOf } from './sandbox.mjs';

import { readFileSync, existsSync } from 'node:fs';
import { hatchFiles } from './hatches.mjs';
import { hasGeneratedMarker } from '../core/text.mjs';
import { classifyContractText } from './classify.mjs';
const NODE_IO = { readText, writeText, mkdirp, exists };
// `#794` 弧第 3 票（`equiv` 命令体）：用 vm／读文件／跑子进程 ⇒ **都在 host** ✓。
import vm from 'node:vm';
import { readdirSync } from 'node:fs';
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
	if (!tables && !contract && !rules) { console.error(`✗ stories/${slug}/data/ 下没有任何产物源（tables/contract/rules.json 都没有）`); return 1; }
	const files = compileStory({ tables, contract, rules, slug });
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
	const l3Mode = argOf('l3', 'hard');
	if (!L3_MODES.includes(l3Mode)) { console.error(`✗ --l3 只接受 ${L3_MODES.join('|')}（实得 ${l3Mode}）`); return 2; }
	const handGiven = argv.some((a) => a.startsWith('--hand='));
	const defaultTwee = rulesMode ? '17-rules.twee' : '15-tables.twee';
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
	const gen0 = readFileSync(join(genDir, rulesMode ? '17-rules.twee' : '15-tables.twee'), 'utf8');
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
