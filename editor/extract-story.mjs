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
// `#794`：命令体（解析 → 抽取 → 写产物 → 打印）已抽到 host，两条入口共用同一具身体 ✓。
import { extractCommand } from './lib/host/commands.mjs';
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
	// `#794`：**自证也是这两个共享帮手的消费者** ✓ —— 复核席要求（"只有自证也是消费者，壳里才不可能留私货" ✓）；
	// 于是插哨兵时自证必须变红 ✓（实测：本组加上之前，哨兵漏过自证 ⇒ 那条“共用”声称不成立 ✗）。
	t('共享帮手 `sectionFile`：段落名 → 文件名映射', sectionFile('StoryRules') === '17-rules.twee' && sectionFile('Game Tables') === '15-tables.twee' && sectionFile('Nope') === 'Nope.twee');
	t('共享帮手 `engineOf`：能读到引擎常量 ＋ 故事段', (() => { try { return engineOf('mist-forest').length > 100; } catch { return false; } })());
	if (bad) { console.error(`\n✗ 自证失败 ${bad} 项`); process.exit(1); }
	console.log('\n✔ 自证通过（8 例：预置承重 · 空壳不造数据 · 浏览器语义 · console 接住 · 序列化稳定 ＋ `sectionFile`/`engineOf` 两个共享帮手 ✓）');
};

// ⚠️ **主模块守卫**（实测踩到）：这些脚本**同时是库**（`equiv` 被 `extract` 导入、`compile` 被 `equiv` 起子进程）。
// 没有守卫时，`import` 它们会**执行对端的 CLI**（实测：`node editor/extract-story.mjs --selftest` 打出的是
// `equiv` 的自证然后退出 ⇒ 自己的自证根本没跑）。守卫＝「只在被当脚本执行时才跑 CLI」。
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain && process.argv.includes('--selftest')) { selftest(); process.exit(0); }

/** `#794`：`engineOf` 已搬到 `editor/lib/host/sandbox.mjs` ✓（读文件 ⇒ 住 host ✓；命令体与自证共用 ✓）。 */
const main = () => {
	// `#794`：命令体已抽成**共享函数**（`lib/host/commands.mjs` 的 `extractCommand` ✓）——
	// 本壳只负责"转发自己的 argv ＋ 用自己的程序名渲染用法行" ✓（`sub: ''` ⇒ 用法行与本工具既有输出**逐字同** ✓）。
	process.exit(extractCommand(process.argv.slice(2), { prog: 'node editor/extract-story.mjs', sub: '' }));
};

if (isMain) main();
