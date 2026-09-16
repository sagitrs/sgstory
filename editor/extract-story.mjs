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

const main = () => {
	const slug = process.argv[2];
	if (!slug) { console.error('用法：node editor/extract-story.mjs <slug> [--section=StoryRules] [--key=rules] [--out=<file>]'); process.exit(2); }
	const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
	const section = argOf('section', 'StoryRules');
	const key = argOf('key', 'rules');
	const out = join(ROOT, argOf('out', `stories/${slug}/data/${key}.json`));
	const file = join(ROOT, `stories/${slug}/${sectionFile(section)}`);
	const scripts = scriptBodies(readFileSync(file, 'utf8')).join('\n');
	const { Sg, diag } = runStory(scripts);
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
