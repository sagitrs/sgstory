// K4 门（`#762` 车道 C）：**生成物标记 · 产物新鲜度 · 逃生舱可枚举**
//
// 为什么需要它（设计稿 §3 的 K4 判据）：D2 把 twee 定为**产物**（源是 `stories/<slug>/data/`），
// "产物"这个身份必须**机械可判**，否则它只是注释里的一句话：
// ① **标记**：每个生成物首部必须有 `@generated`（谁生成、源在哪）；
// ② **新鲜度**：拿 `data/` 重编一次，产物必须**逐字节相同**（＝"带标记的文档只是投影"这条主张的实证）；
// 手改产物 = 下次编译被覆盖 → 这条会红；
// ③ **逃生舱可枚举**：契约分类器（`editor/classify-contract.mjs`）判为 **C 桶**（含任意逻辑）的成员，
// 必须在 `editor/escape-hatch.json` 里**逐条登记**（理由 ＋ 票号）；**清单外出现即红**、
// **清单里腐烂（已不是 C 桶）也红** → 例外是"可枚举的"，不是"随手加的"。
//
// 口径（避免假红／假绿）：
// · 本门**自己跑编译器**（不读工作区里可能陈旧的 `build/generated/`）→ 判的永远是"现在能不能重编出来"；
// · 只对**有 `data/` 的故事**判（没有 data 的故事＝还没数据化 → ①/② 跳过，不假装判过）；
// · 分类器把"形状能看懂、但现有 kind 缺字段"判成 **B**（需声明式扩展）→ **不是**逃生舱；
// 只有"含任意逻辑、要么下沉引擎要么登记"的才是 **C**。
//
// 用法：node editor/k4.mjs [--selfcheck]（用 `--selfcheck` 而不是 `--selftest`：见下方守卫说明）
//
// `#794` 第 4 条（本文件）：**命令体已抽到 `editor/lib/host/commands.mjs` 的 `k4Command`**
// → 本壳只做三件：**转出**判据（纯函数住在 `lib/core/k4criteria.mjs`）· 跑自证 · 转发 argv。
// → 与 `cli.mjs k4` **共用同一具身体**（不是两份实现）—— 等价性按构造成立。
import { fileURLToPath } from 'node:url';
import { MARKER, markerProblems, freshnessProblems, escapeHatchProblems, refusedFaceProblems, handwrittenClosureProblems, contractSourceText, staleTrackedProblems, undoneProblems } from './lib/core/k4criteria.mjs';
import { censusProblems, censusOfStory, censusSummarize } from './lib/core/hatchCensus.mjs';
import { hasGeneratedMarker } from './lib/core/text.mjs';
import { k4Command } from './lib/host/commands.mjs';
import { exitWithRc } from './lib/host/proc.mjs';
export { MARKER, hasGeneratedMarker, markerProblems, freshnessProblems, escapeHatchProblems, refusedFaceProblems, handwrittenClosureProblems, contractSourceText, staleTrackedProblems, censusProblems, censusOfStory, censusSummarize };

//注意：**主模块守卫**（实测踩到）：本文件**同时是库**（判据函数被测试／下游当纯函数 import）。
// 没有守卫时，`import` 它会**跑完整门**（0.22s ＋ 1592B 输出），且门红时 `process.exit(1)` 会**劫持导入方**。
// 守卫＝「只在被当脚本执行时才跑 CLI」；`isMain` 的声明必须在 **imports 之后、逻辑之前** ——
// 放后面会 TDZ（`Cannot access 'isMain' before initialization`，实测踩过）。
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
//注意：**自证旗标用 `--selfcheck` 而不是 `--selftest`**：这是**防御性**设计，不是绕路 ——
// 起因是一次真事故（`#794`）：当时存在"`<某门> --selftest` 被 import 的模块劫持"这个缺口
//（被测模块的 `--selftest` 派发当时**没有 isMain 守卫** → import 它会跑自己的自证并 `process.exit`）。
// **该缺口后来已修**：`compile-story.mjs` 在 `#769`、`classify-contract.mjs` 在 `#772` 里也守住了。
// → 本门**仍保留独立旗标**：多一层防御不吃亏，且将来任一门再犯这族错时，本门不会被带塌。
if (isMain && process.argv.includes('--selfcheck')) {
	let bad = 0;
	const cases = [
		['正例①：生成物带标记 ⇒ 不报', markerProblems([{ path: 'a', text: `:: X [script]\n// ${MARKER} by y（源：z）` }]).length === 0],
		['🔴 反例①：生成物没标记 ⇒ 报', markerProblems([{ path: 'a', text: ':: X [script]' }]).length === 1],
		['正例②：两次编译逐字节相同 ⇒ 不报', freshnessProblems({ a: 'x' }, { a: 'x' }).length === 0],
		['🔴 反例②：两次不同 ⇒ 报（不幂等 ⇒ 手改会被覆盖/工作区常脏）', freshnessProblems({ a: 'x' }, { a: 'y' }).length === 1],
		['正例③：C 桶已登记且带理由票号 ⇒ 不报', escapeHatchProblems([{ name: 'lootText', bucket: 'C' }], { hatches: [{ member: 'lootText', reason: 'r', ticket: '#736' }] }).length === 0],
		['🔴 反例③：C 桶没登记 ⇒ 报（清单外出现）', escapeHatchProblems([{ name: 'x', bucket: 'C' }], { hatches: [] }).length === 1],
		['🔴 反例③：登记腐烂（已不是 C 桶）⇒ 报（清单要收缩）', escapeHatchProblems([{ name: 'x', bucket: 'A' }], { hatches: [{ member: 'x', reason: 'r', ticket: '#1' }] }).length === 1],
		['🔴 反例③：登记缺理由/票号 ⇒ 报', escapeHatchProblems([{ name: 'x', bucket: 'C' }], { hatches: [{ member: 'x' }] }).length === 1],
		['边界③：B 桶（需声明式扩展）**不算**逃生舱 ⇒ 不报', escapeHatchProblems([{ name: 'x', bucket: 'B' }], { hatches: [] }).length === 0],
		['边界③：登记表按**故事**过滤（别的故事的登记不算腐烂）', escapeHatchProblems([{ name: 'x', bucket: 'A' }], { hatches: [{ member: 'x', slug: 'other', reason: 'r', ticket: '#1' }] }, 'mine').length === 0],
		// `#1016`：declare-but-undone（措辞判据；「指向现存」在既有 referenceIntegrity——b9406d4 不重测）。
		['正例#1016：完成态措辞 ⇒ 不报', undoneProblems({ hatches: [{ member: 'x', slug: 'face-fixture', reason: 'r', ticket: '#1' }] }).length === 0],
		['🔴 反例#1016：reason 含「应当撤回」（**含粗体打断**）⇒ 报（活靶真形态：应当**撤回**）', undoneProblems({ hatches: [{ member: 'x', reason: '那条应当**撤回**（已报）', ticket: '#1' }] }).length === 1],
		['🔴 反例#1016：空格绕过形态「应 当 撤 回」⇒ 报（归一化剥空白 ✓）', undoneProblems({ hatches: [{ member: 'x', reason: '那条应 当 撤 回', ticket: '#1' }] }).length === 1],
		['🔴 反例#1016：「待撤销」⇒ 报（撤销族 ✓）', undoneProblems({ hatches: [{ member: 'x', reason: '该条待撤销', ticket: '#1' }] }).length === 1],
		['🔴 反例#1016（D1）：曾标记待删除**含完成标记**（已于 #1004 处理完毕）⇒ **不报**（留痕优先 ✓）', undoneProblems({ hatches: [{ member: 'x', reason: '历史：曾标记待删除，已于 #1004 处理完毕', ticket: '#1' }] }).length === 0],
		['🔴 反例#1016（D1）：「不再使用『应当撤回』这种措辞」⇒ **不报**（完成标记 ✓）', undoneProblems({ hatches: [{ member: 'x', reason: '不再使用「应当撤回」这种措辞 ✓', ticket: '#1' }] }).length === 0],
		['🔴 反例#1016（D1）：「那是应当撤回的历史记录」⇒ **不报**（历史记录标记 ✓）', undoneProblems({ hatches: [{ member: 'x', reason: '见 #1016（那是应当撤回的历史记录）', ticket: '#1' }] }).length === 0],
		['🔴 反例#1016（D3）：零宽字符绕过「应\u200B当\u200B撤\u200B回」⇒ 报（归一化剥零宽 ✓）', undoneProblems({ hatches: [{ member: 'x', reason: '应\u200B当\u200B撤\u200B回', ticket: '#1' }] }).length === 1],
		['🔴 反例#1016（D3）：同义词「须撤回」⇒ 报（表内 ✓）', undoneProblems({ hatches: [{ member: 'x', reason: '该条须撤回', ticket: '#1' }] }).length === 1],
		['边界#1016（D2·如实）：「同形」**不在措辞表** ⇒ 不咬——边界由判据注释「抓不到什么」承担（非空转 ✓）', true],
		['边界#1016：一条 reason 命中多短语 ⇒ 只报 1 项（1 违规 1 项 ✓）', undoneProblems({ hatches: [{ member: 'x', reason: '应当撤回且待删除', ticket: '#1' }] }).length === 1],
		['边界③前置：手写契约源**排除产物**（带 `@generated` 的 twee 不算源）', contractSourceText([['a.twee', ':: X\n// @generated by y'], ['b.twee', ':: Y'], ['c.json', '{}']]).handCount === 1],
		['🔴 反例③前置：**行内**提到 `@generated`（不在行首）⇒ **仍算手写源**（锚定：锚定错了会把逃生舱文件整个排除 ⇒ 门假红）', contractSourceText([['a.twee', ':: X [script]\n// 本文件不带 @generated ⇒ 它是手写件\nObject.assign({}, {})']]).handCount === 1],
		['边界③前置：全是产物 ⇒ 手写源为空（C 桶结构性为 0，不静默）', contractSourceText([['a.twee', '// @generated']]).handCount === 0],
		['边界③前置：非 `.twee` 文件不计入手写源', contractSourceText([['d.md', 'hello']]).handCount === 0],
		['正例④：带标记的 tracked 文件与产物**逐字节相同** ⇒ 不报', staleTrackedProblems([['stories/s/15-tables.twee', 'x\n// @generated by c']], { '15-tables.twee': 'x\n// @generated by c' }).problems.length === 0],
		['🔴 反例④：带标记但**与重编产物不一致** ⇒ 报（两处真相）', staleTrackedProblems([['stories/s/15-tables.twee', 'x\n// @generated']], { '15-tables.twee': 'y\n// @generated' }).problems.length === 1],
		['🔴 反例④：带标记却**没有同名产物** ⇒ 报（来源已断）', staleTrackedProblems([['stories/s/15-tables.twee', '// @generated']], { '其它.twee': 'x' }).problems.length === 1],
		['边界④：**不带标记**的手写文件 ⇒ 不报（天然棘轮：手写故事零影响）', staleTrackedProblems([['stories/s/15-tables.twee', '手写']], { '15-tables.twee': '别的' }).problems.length === 0],
		['边界④：非 `.twee`（如产物 `audit.json`）⇒ 不报（本判据只管编译器产出的 twee）', staleTrackedProblems([['stories/s/audit.json', '// @generated']], {}).problems.length === 0],
		// `#842`：**模板串里的"行首 //"不算标记** —— 经由**判据**断言（不直接引谓词 → 与本仓两处实现的名字解耦，也更贴"理由"）
		['🔴 反例·**模板串里**的一行以 `// @generated` 开头 ⇒ **不算**标记（旧版把它当产物 ⇒ 报"来源已断" ✗）', staleTrackedProblems([['stories/s/15-tables.twee', 'const t = `\n// @generated\n`;']], {}).problems.length === 0],
		['正例·同一文件里**另有真标记** ⇒ 仍算（遮模板串不吃掉真注释 ✓）', (() => { const r = staleTrackedProblems([['stories/s/15-tables.twee', 'const t = `\n// @generated\n`;\n// @generated by x']], { '15-tables.twee': 'const t = `\n// @generated\n`;\n// @generated by x' }); return r.marks === 1 && r.problems.length === 0; })()],
		['边界·**未闭合模板串**（语法错误文件 ✓）⇒ 那段里的行首标记**仍会算** ✗ —— 钉住现状（谁改进遮蔽器 ⇒ 这条会红 ⇒ **显式**决定 ✓）', hasGeneratedMarker('const t = `\n// @generated\n（少收尾反引号）') === true],
		// `#761` 车道 A：**「必须逃生舱」普查面**（空判不许空过）—— 逐条交代 → 能假
		['正例·普查：成员**各有交代**（数据面 ＋ 下沉且锚点在场 ✓）＋ C 桶候选由下沉消化 ⇒ 不报', censusProblems({ census: { stories: { s: { members: [{ name: 'a', bucket: 'A' }, { name: 'b', bucket: 'C' }], engineSinks: [{ member: 'b', ticket: '#7', anchors: [{ file: 'src/e.twee', symbol: 'sink' }] }] } } }, slug: 's', dataMembers: ['a'], engineSymbols: { sink: 'src/e.twee' } }).length === 0],
		['🔴 反例·普查：成员**既不在数据面、也没下沉交代** ⇒ 报（漏搬/丢成员不是"没问题" ✗）', censusProblems({ census: { stories: { s: { members: [{ name: 'a', bucket: 'A' }, { name: 'lost', bucket: 'A' }] } } }, slug: 's', dataMembers: ['a'] }).length === 1],
		['🔴 反例·普查：**记了下沉但锚点不在树里** ⇒ 报（表比事实漂亮 ✗）', censusProblems({ census: { stories: { s: { members: [{ name: 'b', bucket: 'C' }], engineSinks: [{ member: 'b', ticket: '#7', anchors: [{ file: 'src/e.twee', symbol: 'sink' }] }] } } }, slug: 's', engineSymbols: {} }).length === 1],
		['🔴 反例·普查：**真逃生舱（C）没登记也没下沉** ⇒ 报（必须可枚举 ✗）', censusProblems({ census: { stories: { s: { members: [{ name: 'h', bucket: 'C' }] } } }, slug: 's', registry: { hatches: [] } }).length === 1],
		['🔴 反例·普查：**登记腐烂**（登记的不是 C 桶）⇒ 报（清单只许收缩 ✓）', censusProblems({ census: { stories: { s: { members: [{ name: 'x', bucket: 'A' }] } } }, slug: 's', dataMembers: ['x'], registry: { hatches: [{ member: 'x', reason: 'r', ticket: '#1' }] } }).length === 1],
		['边界·普查：**表空** ⇒ 报（空判空过不许当通过 ✗）', censusProblems({ census: { stories: { s: { members: [] } } }, slug: 's' }).length === 1],
		['正例④：不数据化的面四条字段齐 ⇒ 不报', refusedFaceProblems([{ file: 'a.twee', why: 'w', ticket: '#1', paths: 'p' }]).length === 0],
		['🔴 反例④：缺 paths（退路）⇒ 报（不迁也要可追 ✓）', refusedFaceProblems([{ file: 'a.twee', why: 'w', ticket: '#1' }]).length === 1],
		['🔴 反例④：缺 ticket ⇒ 报', refusedFaceProblems([{ file: 'a.twee', why: 'w', paths: 'p' }]).length === 1],
		['🔴 反例④：**登记腐烂**（该件已带 `@generated` ⇒ 其实已数据化）⇒ 报（清单只许收缩 ✓）', refusedFaceProblems([{ file: 'a.twee', why: 'w', ticket: '#1', paths: 'p' }], { markerOf: (f) => f === 'a.twee' }).length === 1],
		['边界④：`markerOf` 说没有标记 ⇒ 不报（腐烂判据**只**看真实标记 ✓）', refusedFaceProblems([{ file: 'a.twee', why: 'w', ticket: '#1', paths: 'p' }], { markerOf: () => false }).length === 0],
		['边界④：空表 ⇒ 不报（"一个都不留"是合法状态 ✓）', refusedFaceProblems([]).length === 0],
		// `#987` 手写面闭合（`手写面 − 三类豁免 ＝ ∅`）：口径＝`hasGeneratedMarker`、豁免**分三类**（⛔ 不合并）
		['正例⑤：手写面都有归属（三类任一种）⇒ 不报', handwrittenClosureProblems({ handwritten: ['a.twee', 'b.twee', 'c.twee'], refused: ['a.twee'], prose: ['b.twee'], hatches: ['c.twee'] }).length === 0],
		['🔴 反例⑤：手写面**没有归属** ⇒ 报（"该登记却没登"不许靠人算 ✗）', handwrittenClosureProblems({ handwritten: ['a.twee'] }).length === 1],
		['🔴 反例⑤：`proseFaces` **登记腐烂**（已带 `@generated` ⇒ 其实已数据化）⇒ 报（白名单只许收缩 ✓）', handwrittenClosureProblems({ handwritten: [], prose: ['a.twee'], markerOf: () => true }).length === 1],
		['🔴 反例⑤：`proseFaces` 里的件**不在手写面**（路径写错／已不在）⇒ 报（防呆 ✓）', handwrittenClosureProblems({ handwritten: [], prose: ['a.twee'], markerOf: () => false }).length === 1],
		['边界⑤：空 ⇒ 不报（⛔ 不写成"数量相等"：并行跑器下临时件会让计数等值随机红 ✗）', handwrittenClosureProblems({}).length === 0],
	];
	for (const [label, cond] of cases) { if (cond) console.log(`  ✓ 自证·${label}`); else { bad++; console.error(`  ✗ 自证·${label}`); } }
	if (bad) { console.error(`\n✗ 自证未通过（${bad} 项）`); process.exit(1); }
	//注意：**条数由 `cases` 算出来** —— 别手写总数（实测：改前手写 `26` 而**实际 28** → 手写数会漂）。
	// 分段名保留作**描述**，但不再挂小计数字（小计也得手算 → 同一个坑）。
	console.log(`\n✔ 自证通过（${cases.length} 条：标记 ＋ 新鲜度 ＋ 逃生舱双向 ＋ 手写源口径 ＋ 生成物不许独改 ＋ \`@generated\` 谓词边界 ＋ 模板串口径 ＋ 逃生舱普查 ＋ 不数据化的面 ＋ **手写面闭合**）`);
	process.exit(0);
}

/** `#794`：命令体已抽成**共享函数**（`lib/host/commands.mjs` 的 `k4Command`）——
 * 本壳只负责"转发自己的 argv ＋ 用自己的程序名渲染用法行"。 */
const main = () => {
	// 入口统一走 `exitWithRc`（house style：rc 非 number 当场抛 → 命令体返回值的错误当场可见）
	exitWithRc(k4Command(process.argv.slice(2), { prog: 'node editor/k4.mjs', sub: '' }));
};

if (isMain) main();
