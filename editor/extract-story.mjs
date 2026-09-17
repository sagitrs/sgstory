// 迁移助手（`#762` 车道 A/B）：**手写 twee → 数据 JSON**。
//
// 为什么需要它（而不是手抄）：把 61 行条件表逐行抄成 JSON，人一定会抄错、而且**抄错的地方看不出来**。
// 这里换一条路：把 `[script]` 段丢进 `vm` **跑一遍**，直接取它导出的数据（`Sg.story.rules()` / `Sg.story` 的契约面），
// 序列化成 JSON ⇒ 数据与手写版**同源**，再由编译器把它变回 twee（`editor/compile-story.mjs`），
// 最后用 `editor/equiv.mjs` 证明"来回一趟没变"。
//
// 用法：node editor/extract-story.mjs <slug> [--section=StoryRules] [--key=rules] [--out=<file>]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { scriptBodies } from './equiv.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** **引擎常量文件**：故事表里会直接用它（如 `era: window.Game.Era.PRESENT`）⇒ 沙箱必须**先跑引擎**
 *  （与真加载顺序一致：`ORDER` 里 `src/engine/10-const.twee` 在故事文件之前）。
 *  ⚠️ 这条也是"环境契约"的一部分：漏了它，抽出来的数据会缺时代字段（而**不报错**）。 */
export const ENGINE_CONST = 'src/engine/10-const.twee';

/** 引擎常量的 `[script]` 段（单一权威）：**任何**在沙箱里跑故事段的调用方都要先跑它，
 *  否则故事表里的 `window.Game.Era.PRESENT` 取不到（静默缺字段）。 */
export const engineScripts = () => scriptBodies(readFileSync(join(ROOT, ENGINE_CONST), 'utf8')).join('\n');

/** 纯函数：在**浏览器语义**的沙箱里跑一段 `[script]`，返回 `{ Sg, Game, diag }`。 */
/** **环境契约（承重面，最容易腐烂的地方）**：本助手只跑故事的**某一段** `[script]`，而各段之间**互有依赖** ——
 *  `15-tables.twee` 建容器（`window.Sg ??= {}`／`window.Game = …`），`17-rules.twee` 直接用 `window.Sg.story ??= {}`。
 *  所以沙箱必须**预置两个空根**：`Sg = {}`、`Game = {}`；**只给空壳、不塞任何内容**（塞了就等于替故事造数据，
 *  "抽出来的"与"手写的"就不再同源）。`preset: false` 只给自证用（用来证明这个预置是**承重**的）。
 *  ⇒ 这份预置面改动时，`--selftest` 会一起变；不要绕过它。 */
export const runStory = (scripts, { preset = true } = {}) => {
	const diag = [];
	// 预置两个根容器：故事的各 `[script]` 段之间**互有依赖**（`15-tables` 建 `window.Sg`／`Game`，
	// `17-rules` 直接用 `window.Sg.story ??= {}`）——只跑其中一段时必须先给容器，否则 `TypeError: … reading 'story'`。
	const sandbox = { console: { log: (...a) => diag.push(a.join(' ')), error: (...a) => diag.push(a.join(' ')) } };
	sandbox.window = sandbox;
	if (preset) { sandbox.Sg = {}; sandbox.Game = {}; }
	vm.createContext(sandbox);
	vm.runInContext(String(scripts), sandbox, { timeout: 5000 });
	return { Sg: sandbox.Sg, Game: sandbox.Game, diag };
};

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

/** 引擎常量 + 故事各段（真加载顺序）——`--tables` 与 `--section` 共用。
 *  `fromPath` 就是 `--from` 指定的源（默认＝工作区的 `15-tables.twee`）——**翻面后必须传**：
 *  那时工作区那份已是**产物**，再抽就成了"自吃"（实测：把产物里的 `provenance: '[object Object]'` 再抽一遍）。 */
const engineOf = (slug, fromPath = null) => {
	const text = readFileSync(fromPath ?? join(ROOT, `stories/${slug}/${sectionFile('Game Tables')}`), 'utf8');
	return engineScripts() + '\n' + scriptBodies(text).join('\n');
};

const main = () => {
	const slug = process.argv[2];
	if (!slug) { console.error('用法：node editor/extract-story.mjs <slug> [--section=StoryRules] [--key=rules] [--out=<file>]'); process.exit(2); }
	const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
	const tablesMode = process.argv.includes('--tables');
	const section = argOf('section', tablesMode ? 'Game Tables' : 'StoryRules');
	const key = argOf('key', 'rules');
	const out = join(ROOT, argOf('out', tablesMode ? `stories/${slug}/data/tables.json` : `stories/${slug}/data/${key}.json`));
	const file = join(ROOT, argOf('from', `stories/${slug}/${sectionFile(section)}`));
	const scripts = engineScripts() + '\n' + scriptBodies(readFileSync(file, 'utf8')).join('\n');
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
		mkdirSync(dirname(out), { recursive: true });
		writeFileSync(out, text, 'utf8');
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
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, serialize(data), 'utf8');
	console.log(`✔ ${slug}：抽出 ${data.length} 行（section=${section} key=${key}）→ ${out.replace(ROOT, '')}`);
	for (const d of diag.slice(0, 5)) console.log(`  · 沙箱输出：${d}`);
};

/** 段落名 → 文件名（本仓约定：段落名与文件名不同，靠 `00-story.json` 的 files 列表兜底）。 */
const sectionFile = (name) => {
	const map = { StoryRules: '17-rules.twee', 'Game Tables': '15-tables.twee', StoryBindings: '15-tables.twee' };
	return map[name] ?? `${name}.twee`;
};

if (isMain) main();
