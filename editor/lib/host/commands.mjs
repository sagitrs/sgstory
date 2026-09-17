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
