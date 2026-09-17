// `#794` 抽取的最后一个信封：**命令体**（一个命令一个函数：`解析 → 干活 → 打印`）。
//
// 为什么住 host ✓：命令体要读/写文件（宿主能力 ✓）；但它**调 core**（编译 `compileStory` ✓、
// 唯一写路 `writeStoryPackage` ✓）⇒ core 本身仍零宿主依赖 ✓（K6 ③ 在盯 ✓）。
//
// **两条入口共用同一具身体** ✓：`editor/cli.mjs <子命令>` 与 `node editor/<工具>.mjs …` 都调这里的同一个函数 ✓
// ⇒ 等价性**按构造成立** ✓（不是"两个实现碰巧一致" ✗ —— 那种迟早漂移 ✓）。
// 连**参数解析**也在这里 ✓（函数的入参就是原始 `argv` 尾巴 ✓）⇒ 入口层没有第二份解析 ✓
// （否则"未知标志/缺必填/多给位置参数"三档就会两边不一致 ✓ —— 那正是入口层分叉的藏身处 ✓）。
import { join, resolve } from 'node:path';
import { readText, writeText, mkdirp, exists, ROOT } from './fs.mjs';
import { compileStory } from '../core/emit.mjs';
import { writeStoryPackage } from '../core/story.mjs';

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
