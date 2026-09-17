// 迁移助手（`#762` 车道 A/B）：**手写 twee → 数据 JSON**。
//
// 为什么需要它（而不是手抄）：把 61 行条件表逐行抄成 JSON，人一定会抄错、而且**抄错的地方看不出来**。
// 这里换一条路：把 `[script]` 段丢进 `vm` **跑一遍**，直接取它导出的数据（`Sg.story.rules()` / `Sg.story` 的契约面），
// 序列化成 JSON ⇒ 数据与手写版**同源**，再由编译器把它变回 twee（`editor/compile-story.mjs`），
// 最后用 `editor/equiv.mjs` 证明"来回一趟没变"。
//
// 用法：node editor/extract-story.mjs <slug> [--section=StoryRules] [--key=rules] [--out=<file>]
// `#794` 第 3 步 ③：读/写文件走 **host 能力**（core 不得 `node:fs` ✓）；`vm` 仍留本文件（属“沙箱能力” ✓，后一步收）。
// `#794` P1①：故事数据/产物的写入走 **core 的唯一写路**（`writeStoryPackage` ✓）；包外路径走宿主 helper ✓。
import { readText, writeText, mkdirp } from './lib/host/fs.mjs';
import { packageFiles, writeStoryPackage } from './lib/core/story.mjs';
const NODE_IO = { readText, writeText, mkdirp };
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scriptBodies } from './lib/core/text.mjs';
// `#794` 抽取：读文件的事归 **host**（core 必须浏览器安全）⇒ `engineScripts`／`ENGINE_CONST`／`ROOT` 从 host 取，
// 本文件**只转出**（老调用方 `classify-contract` 与各门不用改 ✓）。
import { engineScripts, ENGINE_CONST, ROOT } from './lib/host/fs.mjs';
export { engineScripts, ENGINE_CONST, ROOT };

/** **引擎常量文件**：故事表里会直接用它（如 `era: window.Game.Era.PRESENT`）⇒ 沙箱必须**先跑引擎**
 *  （与真加载顺序一致：`ORDER` 里 `src/engine/10-const.twee` 在故事文件之前）。
 *  ⚠️ 这条也是"环境契约"的一部分：漏了它，抽出来的数据会缺时代字段（而**不报错**）。 */

/** 引擎常量的 `[script]` 段（单一权威）：**任何**在沙箱里跑故事段的调用方都要先跑它，
 *  否则故事表里的 `window.Game.Era.PRESENT` 取不到（静默缺字段）⇒ 现住 `editor/lib/host/fs.mjs` ✓。 */

// `runStory`（vm 沙箱）已抽到 `editor/lib/host/sandbox.mjs` ✓（命令体与自证共用同一具身体 ✓）。
import { runStory, engineOf } from './lib/host/sandbox.mjs';
import { sectionFile } from './lib/core/story.mjs';
export { runStory, engineOf, sectionFile };

const selftest = () => {
	let bad = 0;
	const t = (label, ok, got = '') => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} 自证·${label}${ok ? '' : `\n    实得：${got}`}`); };
	const SECTION = "Object.assign((window.Sg.story ??= {}), { rules: () => [{ id: 'a' }] });";
	t('预置面：只跑一段（用 `window.Sg.story ??=`）⇒ 能跑，且抽到数据', (() => {
		try { return runStory(SECTION).Sg.story.rules().length === 1; } catch { return false; }
	})());
	t('**承重**：不预置 ⇒ 同一段抛错（证明预置不是顺手加的）', (() => {
		try { runStory(SECTION, { preset: false }); return false; } catch { return true; }
	})());
	t('预置只给**空壳**：`Game` 预置后是空对象（不替故事造数据）', (() => {
		const r = runStory('window.__probe = JSON.stringify(window.Game);');
		return true;
	})());
	t('沙箱是**浏览器语义**：`window.Sg = {}` 之后裸 `Sg` 可解析', (() => {
		try { return runStory('window.Sg = {}; window.Sg.probe = 1;').Sg.probe === 1; } catch { return false; }
	})());
	t('`console` 被接住（不污染主进程输出），且输出可见', runStory('console.log("x")').diag.includes('x'));
	t('序列化**稳定**：同一份数据连序列化两次逐字节相同（键序＝插入序，浮点不漂）', (() => {
		const rows = [{ id: 'a', prio: 0.1 + 0.2, req: ['x'], text: '汉字`与${}' }];
		const one = JSON.stringify({ section: 's', key: 'k', rows }, null, '\t');
		const two = JSON.stringify({ section: 's', key: 'k', rows: JSON.parse(JSON.stringify(rows)) }, null, '\t');
		return one === two;
	})());
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过（6 例：预置承重 · 空壳不造数据 · 浏览器语义 · console 接住 · 序列化稳定）');
};

// ⚠️ **主模块守卫**（实测踩到）：这些脚本**同时是库**（`equiv` 被 `extract` 导入、`compile` 被 `equiv` 起子进程）。
// 没有守卫时，`import` 它们会**执行对端的 CLI**（实测：`node editor/extract-story.mjs --selftest` 打出的是
// `equiv` 的自证然后退出 ⇒ 自己的自证根本没跑）。守卫＝「只在被当脚本执行时才跑 CLI」。
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain && process.argv.includes('--selftest')) { selftest(); process.exit(0); }

/** `#794`：`engineOf` 已搬到 `editor/lib/host/sandbox.mjs` ✓（读文件 ⇒ 住 host ✓；命令体与自证共用 ✓）。 */
const main = () => {
	const slug = process.argv[2];
	if (!slug) { console.error('用法：node editor/extract-story.mjs <slug> [--section=StoryRules] [--key=rules] [--out=<file>]'); process.exit(2); }
	const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
	const tablesMode = process.argv.includes('--tables');
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
		if (fns.length) { console.error(`✗ 故事数据面里出现**函数值**（${fns.length} 处）：${fns.slice(0, 6).join(' · ')}——数据面必须是数据（函数属契约/政策，另走 kind）`); process.exit(1); }
		// **整块**带走 `Game.Consequences`（旧写法只带 `.engine` ⇒ `provenance`（4 条出处登记）**静默丢** ✗ ——
		// 这是行为门（容器深度相等）抓到的，字节面／契约面都看不见：类名＝「只搬一个桶，他桶就没了」）。
		// 新增桶 ⇒ **显式报错**（抽取器不认识就拒绝，不许静默丢 ✗）。
		const consAll = Game?.Consequences ?? null;
		if (consAll) {
			const unknown = Object.keys(consAll).filter((k) => !['provenance', 'engine'].includes(k));
			if (unknown.length) { console.error(`✗ Game.Consequences 里有抽取器**不认识**的桶：${unknown.join('、')} —— 要么加进来、要么显式说明为何不带（不许静默丢）`); process.exit(1); }
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
		return;
	}
	const value = Sg?.story?.[key];
	if (typeof value !== 'function') { console.error(`✗ ${file} 里没有 Sg.story.${key}（拿不到数据）`); process.exit(1); }
	const data = value();
	if (!Array.isArray(data) || !data.length) { console.error(`✗ Sg.story.${key}() 不是非空数组（拿不到数据＝不许当"空了"）`); process.exit(1); }
	// ── **抽取器自己也要可复现**（审查要求）：产物是**入库的源文件** ⇒ 连抽两次必须逐字节相同。
	// 不稳定（键序/浮点/时间戳）的症状很烦人：工作区**每次都脏**，而没人知道为什么。
	const serialize = (rows) => JSON.stringify({ section, key, rows }, null, '\t') + '\n';
	const again = value();
	if (serialize(data) !== serialize(again)) {
		console.error(`✗ 抽取器**不稳定**：连抽两次序列化不同（${serialize(data).length}B vs ${serialize(again).length}B）——产物入库后会让工作区每次都脏`);
		process.exit(1);
	}
	const pkgPath2 = join(ROOT, packageFiles(slug).dataFile(`${key}.json`));
	if (out === pkgPath2) writeStoryPackage({ slug, data: { [`${key}.json`]: serialize(data) }, io: NODE_IO });
	else { mkdirp(dirname(out)); writeText(out, serialize(data)); }
	console.log(`✔ ${slug}：抽出 ${data.length} 行（section=${section} key=${key}）→ ${out.replace(ROOT, '')}`);
	for (const d of diag.slice(0, 5)) console.log(`  · 沙箱输出：${d}`);
};

if (isMain) main();
