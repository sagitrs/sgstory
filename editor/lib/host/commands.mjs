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

const NODE_IO = { readText, writeText, mkdirp, exists };

/** 用法行由**调用方传入的程序名**派生 ✓ —— 于是两条入口的输出只差这一行（且这行是 `argv` 派生的 ✓，
 *  属"唯一允许的差异" ✓）。不读 `process.argv` ✓：那样会让同一个函数在不同入口下行为不同 ✗。 */
const usageOf = (prog, sub) => (sub ? `用法：${prog} ${sub} <slug> [--out=<dir>]` : `用法：${prog} <slug> [--out=<dir>]`);

/** `build <slug> [--out=<dir>]` —— 与 `node editor/compile-story.mjs` **同一具身体** ✓。返回退出码 ✓。 */
export const buildCommand = (argv = [], { prog = 'node editor/cli.mjs', sub = 'build' } = {}) => {
	const [slug, ...rest] = argv;
	// `sub` 让**同一个函数**既能被 `cli.mjs build` 调（用法行含子命令 ✓）也能被原工具调（用法行不含 ✓）——
	// 于是两条入口的输出**只差这一行**，且这行是**调用方传入的程序名/子命令**派生的 ✓（不读 `process.argv` ✗）。
	if (!slug) { console.error(usageOf(prog, sub)); return 2; }
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
	if (!slug) { console.error(usageOf(prog, sub) + ' [--section=StoryRules] [--key=rules] [--out=<file>] [--tables] [--from=<file>]'); return 2; }
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
		const walk = (v, p, put) => {
			if (typeof v === 'function') { fns.push(p); return; }
			if (Array.isArray(v)) { put(v.map((x, i) => { let keep; walk(x, `${p}[${i}]`, (y) => { keep = y; }); return keep; })); return; }
			if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) walk(x, `${p}.${k}`, (y) => { o[k] = y; }); put(o); return; }
			put(v);
		};
		for (const [k, v] of Object.entries(Game ?? {})) { if (['Era', 'Damage', 'Consequences'].includes(k)) continue; walk(v, `Game.${k}`, (y) => { containers[k] = y; }); }
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
