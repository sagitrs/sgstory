import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/** 仓库根（`scripts/` 的上一级）——`allSourceFiles()` 用（#458 切片B）。 */
const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');

// ── 模块图（#319）：**显式**声明加载顺序与跨文件依赖——不再靠 `readdirSync().sort()` 的文件名前缀隐含。
//
// 为什么需要它：文件名决定加载顺序时，新文件若命名成 `12-*.twee` 却依赖 `15-tables.twee` 的
// `Game.*`，会**静默**先加载；构建不报错，运行期才炸，且症状出现在别处（典型的「看起来像别的问题」）。
//
// 事实模型（读码得出，可复核）：
//   · **加载期代码**＝`[script]` 段落体（SugarCube 启动时 wikify 执行）＋其中的顶层语句/IIFE；
//   · **延迟代码**＝`[widget]` 段落体、剧情段落体、函数/方法体 —— 它们**首次被调用**时才求值，
//     所以「前向引用」在延迟代码里是合法的（`10-core.twee` 的函数体用 `Game.*`，
//     而 `Game` 要到 `15-tables.twee` 才定义——这在运行期没问题）。
//   ⚠️ 因此本模块**不**做「文本里出现即算引用」的推断式 lint：那种推断会产出假阳性
//      （实测：初版扫描报 5 处「前向引用」，全部是函数体内的延迟引用）。
//      改为「声明依赖边 + 校验顺序与定义」——可复核、零假阳性。
//
// 依赖边只写**加载期**真实需要，宁少勿多；声明与实际不符时，`defines` 清单会把它抓出来。

export const ORDER = [
	'stories/mist-forest/00-meta.twee',      // StoryTitle / StoryData（无依赖）
	'src/engine/30-persist/05-store.twee',     // 存储缝（#441-B/#462）：localStorage 键构造的唯一落点（引擎/故事两作用域）
	'src/engine/10-const.twee',   // 引擎常量（#660 片二）：Game.Era / Game.Damage —— **必须排在 10-core 之前**
	'src/10-core.twee',      // Game.Rules / Game.Pc / Sg.UI ＋ 宏（依赖 10-const 的常量）
	'src/engine/50-present/11-scene.twee',     // 场景 widget（actOut / sceneFeedback）
	'stories/mist-forest/12-widgets.twee',    // 故事 1 的 widget（#460：从引擎 10-core 搬回：hallResult / flip）
	'stories/mist-forest/15-tables.twee',    // Game.*（加载期需要 Rules / Pc）
	// 笔记模型（伞 #422）的增量文件：只往 Game.Notes.entries 追加条目。
	// 每批一个文件（#428 机制）⇒ 多席并行落表零冲突；新增文件必须在此登记（build 会拒绝未登记的文件）。
	'stories/mist-forest/16-notes-ch1.twee',      // 笔记增量文件（#442 B0）：一章补漏
	'stories/mist-forest/16-notes-ch2.twee',      // 笔记增量文件（#429 B1）：二章
	'stories/mist-forest/16-notes-ch3.twee',      // 笔记增量文件（#430 B2）：三章
	'stories/mist-forest/16-notes-cross.twee',
	'stories/mist-forest/17-rules.twee',    // 条件表（#435 阶段 4）：只往 Sg.story.rules() 追加行    // 笔记增量文件（#431 B3）：跨章/展示层
	// ── 第二个故事（#460）：**按与 mist-forest 同构的相对位置交错登记** ──
	// 为什么要交错而不是追加在末尾：`15-tables` 建的空容器是引擎侧 `21-resolve` **加载期**就要 assign 的对象
	//（`Object.assign(window.Game.Checks, …)`）⇒ 必须排在它前面。多故事并存下 ORDER 的"全局交错"语义
	// 值得另票收紧（per-story ORDER），本票先按既有形状办。
	'stories/minimal-demo/00-meta.twee',      // StoryTitle / StoryData / StoryIdentity（无依赖）
	'stories/hollow-cave/00-meta.twee',       // StoryTitle / StoryData / StoryIdentity
	'stories/hollow-cave/15-tables.twee',     // 声明面（S1–S4 的表）＋ StoryBindings：**引擎加载期**要用（必须排在 21-resolve 前）
	'stories/minimal-demo/15-tables.twee',    // 最小声明面：引擎加载期要用的空容器
	'stories/mist-forest/20-chargen.twee',   // Game.Chargen（rounds/presets/API；加载期需要 Rules）
	'src/engine/40-sim/21-resolve.twee',    // 结算（sim，伞 #441 的 40-sim 落点）：位点判定的「算」＋ rng 注入（#441-A）
	'stories/mist-forest/30-ch1.twee',
	'stories/mist-forest/40-ch2.twee',
	'stories/mist-forest/50-ch3.twee',
	'stories/mist-forest/60-endings.twee',
	'stories/mist-forest/70-codex.twee',
	'stories/mist-forest/72-codex-ui.twee',   // `Sg.Codex`（`#574`：从 80-script 搬回故事侧——它读 `Game.Codex`）
	'src/80-script.twee',    // 存档 API / Sg.notes / Sg.Ending ＋ 渲染后处理（**引擎层**，`#574` 修正 layer）
	'src/engine/50-present/12-shortfight.twee',   // 短战斗 widget（#608：从故事侧上移）
	'src/engine/50-present/90-style.twee',     // 纯 CSS
	'stories/minimal-demo/10-demo.twee',      // 段落 ＋ StoryBindings（只依赖引擎）
	// ── 第三个故事（#490 S5「无名洞窟」雏形）：同样按相对位置交错登记 ──
	'stories/hollow-cave/10-cave.twee',       // 段落：醒来 → 五步三选一 → 地下村落
	// ── 第二个故事（#460 最小示例）：证明引擎与故事已解耦 ──
	// 它不共享 mist-forest 的任何文件（那是另一个故事的资产）；引擎文件对所有故事共享 ⇒ 由 `scopedFiles()` 自动带上。
];

// 每个模块：加载期依赖 + 必须定义的符号（用于抓「改了名/挪了位置」）
export const MODULES = {
	'stories/mist-forest/00-meta.twee': { deps: [], defines: [], layer: 'story', note: '故事元数据（StoryTitle / StoryData）' },
	'stories/mist-forest/12-widgets.twee': { deps: ['src/10-core.twee'], defines: ['widget:hallResult', 'widget:flip'], layer: 'story', note: '故事 1 的 widget（#460：从引擎 10-core 搬回——引擎不该知道哨子/时代翻转是什么）' },
	// ── 第二个故事（#460）：layer 'story'，只依赖引擎 ──
	'stories/minimal-demo/00-meta.twee': { deps: [], defines: [], layer: 'story', note: '第二个故事的元数据（StoryTitle / StoryData / StoryIdentity）' },
	'stories/minimal-demo/15-tables.twee': { deps: ['src/10-core.twee'], defines: [], layer: 'story', note: '第二个故事的最小声明面：引擎**加载期**要用的空容器（#460 实测的接入契约）' },
	'stories/hollow-cave/00-meta.twee': { deps: [], defines: [], layer: 'story', note: '第三个故事（无名洞窟）的元数据' },
	'stories/hollow-cave/15-tables.twee': { deps: ['src/10-core.twee'], defines: [], layer: 'story', note: '无名洞窟的声明面：S1–S4 声明表（mechanics）＋ StoryBindings（引擎接入契约）' },
	'stories/hollow-cave/10-cave.twee': { deps: ['stories/hollow-cave/15-tables.twee'], defines: [], layer: 'story', note: '无名洞窟段落：五步三选一主线' },
	'stories/minimal-demo/10-demo.twee': { deps: ['stories/minimal-demo/15-tables.twee'], defines: [], layer: 'story', note: '最小示例段落 ＋ StoryBindings（引擎接入契约的空表）' },
	'src/engine/30-persist/05-store.twee': { deps: [], defines: ['Sg.store'], layer: 'engine', note: '存储缝（#441-B/#462）：localStorage 键构造的唯一落点' },
	'src/engine/10-const.twee': { deps: [], defines: ['Game.Era', 'Game.Damage'], layer: 'engine', note: '引擎常量（#660 片二）：时代枚举与伤害档梯的**唯一落点**' },
	'src/10-core.twee': { deps: ['src/engine/10-const.twee'], defines: ['Game.Rules', 'Game.Pc', 'Sg.UI'], layer: 'engine', note: '规则内核与界面基座（常量见 10-const）' },
	'src/engine/50-present/11-scene.twee': { deps: ['src/10-core.twee'], defines: ['widget:actOut', 'widget:sceneFeedback'], layer: 'engine', note: '场景迁移配方（结果留屏）' },
	'stories/mist-forest/15-tables.twee': { deps: ['src/10-core.twee'], defines: ['Game'], layer: 'story', note: '声明式数据表' },
	'stories/mist-forest/16-notes-ch1.twee': { deps: ['stories/mist-forest/15-tables.twee'], defines: [], layer: 'story', note: '笔记模型增量文件（#442 B0）：只往 Game.Notes.entries 追加条目' },
	'stories/mist-forest/16-notes-ch2.twee': { deps: ['stories/mist-forest/15-tables.twee'], defines: [], layer: 'story', note: '笔记模型增量文件（#429 B1）：只往 Game.Notes.entries 追加条目' },
	'stories/mist-forest/16-notes-ch3.twee': { deps: ['stories/mist-forest/15-tables.twee'], defines: [], layer: 'story', note: '笔记模型增量文件（#430 B2）：只往 Game.Notes.entries 追加条目' },
	'stories/mist-forest/16-notes-cross.twee': { deps: ['stories/mist-forest/15-tables.twee'], defines: [], layer: 'story', note: '笔记模型增量文件（#431 B3）：只往 Game.Notes.entries 追加条目' },
	'stories/mist-forest/17-rules.twee': { deps: ['stories/mist-forest/15-tables.twee'], defines: [], layer: 'story', note: '条件表（#435 阶段 4）：行数组，选择器在引擎侧' },
	'stories/mist-forest/20-chargen.twee': { deps: ['src/10-core.twee', 'stories/mist-forest/15-tables.twee'], defines: ['Game.Chargen'], layer: 'story', note: '车卡（#320 阶段 3 收进 Game 命名空间）' },
	'src/engine/40-sim/21-resolve.twee': { deps: ['src/10-core.twee', 'stories/mist-forest/15-tables.twee'], defines: [], layer: 'engine', note: '结算（sim，伞 #441 的 40-sim 落点）：位点判定的「算」＋ rng 注入（#441-A）' },
	'stories/mist-forest/30-ch1.twee': { deps: ['src/10-core.twee', 'src/engine/50-present/11-scene.twee', 'stories/mist-forest/15-tables.twee', 'stories/mist-forest/20-chargen.twee'], defines: [], layer: 'story', note: '第一章（剧情段）' },
	'stories/mist-forest/40-ch2.twee': { deps: ['src/10-core.twee', 'src/engine/50-present/11-scene.twee', 'stories/mist-forest/15-tables.twee'], defines: [], layer: 'story', note: '第二章（剧情段）' },
	'stories/mist-forest/50-ch3.twee': { deps: ['src/10-core.twee', 'src/engine/50-present/11-scene.twee', 'stories/mist-forest/15-tables.twee'], defines: [], layer: 'story', note: '第三章（剧情段）' },
	'stories/mist-forest/60-endings.twee': { deps: ['src/10-core.twee', 'src/engine/50-present/11-scene.twee', 'stories/mist-forest/15-tables.twee'], defines: [], layer: 'story', note: '结局页' },
	'stories/mist-forest/70-codex.twee': { deps: ['src/10-core.twee', 'stories/mist-forest/15-tables.twee'], defines: [], layer: 'story', note: '设定集' },
	'src/80-script.twee': { deps: ['src/10-core.twee'], defines: ['Sg.save', 'Sg.notes', 'Sg.Ending'], layer: 'engine', note: "引擎运行时胶水（`#574` 修正 layer）：存档 API（`Sg.save`）· `Sg.notes`（数据经 `Sg.story.notes()`）· 结局收尾 · 结果留屏/空白归一/键盘路径/`data-choice` 派生——对**每个故事**成立 ⇒ 必须随引擎进每个故事的作用域" },
	'stories/mist-forest/72-codex-ui.twee': { deps: ['src/10-core.twee'], defines: ['Sg.Codex'], layer: 'story', note: '道具图鉴界面（`#574`：从 80-script 搬回故事 1——它直接读 `Game.Codex.items`，是故事面）' },
	'src/engine/50-present/90-style.twee': { deps: ['src/10-core.twee'], defines: [], layer: 'engine', note: '样式' },
	'src/engine/50-present/12-shortfight.twee': { deps: ['src/10-core.twee'], defines: ['widget:shortFight'], layer: 'engine', note: '短战斗 widget（#608：S3 机制上移；相位→分支只看 `waveRecord().phase`，奖励/失败笔记走声明面）' },};

// ── 判定（纯函数，供 test/layering.mjs 与自证共用）──────────────────────
// sources: { 文件名: 源码字符串 }
export const checkModuleGraph = (sources, { order = ORDER, modules = MODULES } = {}) => {
	const failures = [];
	const names = Object.keys(sources);

	// ① 顺序表必须与实际文件一一对应（防「新增文件忘了登记」与「登记了不存在的文件」）
	const missingInOrder = names.filter((n) => !order.includes(n));
	for (const n of missingInOrder) failures.push({ code: 'unlisted-file', msg: `src/${n} 未在 scripts/module-order.mjs 的 ORDER 里登记（加载顺序不允许隐含）` });
	const missingOnDisk = order.filter((n) => !names.includes(n));
	for (const n of missingOnDisk) failures.push({ code: 'missing-file', msg: `ORDER 里的 src/${n} 不存在（改了名或删了文件）` });

	// ② 依赖边必须指向**更早**的模块（这是本 lint 的核心）
	const idx = new Map(order.map((n, i) => [n, i]));
	for (const [name, mod] of Object.entries(modules)) {
		if (!names.includes(name)) continue;
		for (const dep of mod.deps ?? []) {
			if (!names.includes(dep)) { failures.push({ code: 'unknown-dep', msg: `src/${name} 声明依赖 src/${dep}，但该文件不存在` }); continue; }
			if ((idx.get(dep) ?? -1) >= (idx.get(name) ?? -1)) {
				failures.push({ code: 'forward-dep', msg: `src/${name} 依赖 src/${dep}，但后者的加载顺序不更早——加载期会拿到未定义的符号` });
			}
		}
	}

	// ③ 声明的定义必须真的在该文件里出现（抓「改名/挪走/删掉」）
	const actualDefines = (src) => {
		const out = new Set();
		// #320：支持**点号路径**（`window.Game.Chargen = …` → `Game.Chargen`），否则命名空间化的定义无法声明
		for (const m of src.matchAll(/window\.((?:\w+\.)*\w+)\s*=(?!=)/g)) out.add(m[1]);
		for (const m of src.matchAll(/<<widget "([^"]+)"/g)) out.add(`widget:${m[1]}`);
		return out;
	};
	for (const [name, mod] of Object.entries(modules)) {
		if (!names.includes(name)) continue;
		const have = actualDefines(sources[name]);
		for (const d of mod.defines ?? []) {
			if (!have.has(d)) failures.push({ code: 'missing-define', msg: `src/${name} 声明定义 ${d}，但正文里找不到（改名/挪走/删除？请同步 scripts/module-order.mjs）` });
		}
	}
	return failures;
};

export const readModules = () => {
	// #458 切片C：走**单一权威**（路径为键，与 MODULES／ORDER 一致）——此前只枚举 `src/*.twee` 且按 basename 键，
	// 搬家后 ⇒ 键与 MODULES 对不上 ⇒ rank 报告里"引擎文件 0 个"（假绿 ✗）。
	const out = {};
	for (const f of allSourceFiles()) out[f] = readFileSync(join(ROOT, f), 'utf8');
	return out;
};

// ── #441 第 2 步：**层间方向**（引擎 → 故事 单向）────────────────────────────
// 判据：`layer: 'engine'` 的文件里**不得出现故事层定义的符号**（反向允许）。
// 「故事符号」用**声明**给出（而不是扫源码推断）——本仓的既有做法：声明 + 对账，宁漏不假。
export const STORY_SYMBOLS = [
	// #459 细化（2026-09-13）：**判据的粒度＝所有权** —— 引擎不许摸的是**故事数据**，不是"叫 Game.X 的东西"。
	// 起因：`10-core` 里的 `Game.Checks.resolve(...)`／`Game.Economy.apply(...)`／`Game.Combat.resolvePlayer(...)`
	// 全是**引擎机制**（`21-resolve.twee`，sim 侧），却因与故事数据同名空间而被误判 ⇒ 作业单失真（5 处"命中"里只有 1 处是真的）。
	// ⇒ 现在按**数据路径**列（`Game.Checks.sites` 是故事数据；`Game.Checks.resolve` 是引擎机制）。
	// ⚠️ 残留的过渡味道（记在案，不假装没有）：机制与数据**共用同一个命名空间**（引擎把 `resolve` 挂在故事提供的 `Game.Checks` 上）。
	//    第 3/4 步（#458/#459）应该把它们分开（机制住在引擎命名空间、数据由故事提供）。
	'Game.Checks.sites',
	// #459（实测漏检）：情报捷径的两张数据表 —— sim 原来在读（`knowledge`／`knowledgeWhy`），门却不会咬 ✗
	'Game.Checks.knowledge', 'Game.Checks.knowledgeWhy',
	'Game.Economy.events',
	'Game.Items.defs', 'Game.Items.effects',
	'Game.Gear.defs',
	'Game.Combat.actions', 'Game.Combat.pools',
	'Game.Social.asks', 'Game.Social.approaches',
	'Game.NPC.entries',
	'Game.Truth.claims',
	'Game.Echoes.list', 'Game.Echoes.revisit',
	'Game.Choices.sites',
	'Game.Systems', 'Game.Star', 'Game.Dragon', 'Game.Consequences', 'Game.Investment',
	'Game.Notes.entries', 'Game.Chargen',
];;
// 归一化：把"逃逸写法"折成点号路径，再做子串匹配。
// 起因（实测并复现）：裸子串匹配会**漏检** `Game?.Dragon` / `Game["Notes"]` / `Game . NPC`，
// 现网 `10-core.twee:218` 的 `window.Game?.Dragon?.hp` 就是这样漏掉的 ⇒ 第 4 步的"`--strict` 转绿"会**假绿**。
// 处理的逃逸：可选链 `?.`、方括号字符串/模板访问 `["x"]`/['x']/`x`、点号两侧空白（含换行）。
// **已知不覆盖**（写清楚，别假装判据是全的）：解构/别名（`const {Dragon} = Game`、`const G = Game; G.Dragon`）、
// 动态键（`Game[k]`）、字符串拼接出的表名。这些要么靠人工走查，要么等第 4 步换更强的判据（不再按名字匹配）。
/** 剥注释后再匹配——判据不该把**注释里的提及**当引用（Twee 块注释／HTML 注释／JS 行注释与块注释）。
 *  起因（#459）：`10-core.twee:315` 是一行块注释里提了一句 `Game.Checks.sites`，却被判成"引擎读故事数据"（假阳性）。
 */
export const stripCommentsForLint = (src) => String(src)
	.replace(/\/%[\s\S]*?%\//g, ' ')
	.replace(/<!--[\s\S]*?-->/g, ' ')
	.replace(/\/\*[\s\S]*?\*\//g, ' ')
	.replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

export const normalizeSymbolRefs = (src) => {
	const text = String(src);
	// #459（实测）：**别名会让裸子串匹配变瞎** —— `const T = window.Game` 之后 `T.Checks.sites`
	// 明摆着是故事数据，门却**命中 0** ✗ ⇒「引擎层未引用任何故事符号」这句话对用别名的文件**没有证据力**。
	// 做法：先把“指向 `window.Game`／`Game` 的**简单别名**”展开（仅此一类；解构/多级别名不展开 = 已知边界）。
	const aliases = new Set();
	for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:window\.)?Game\b/g)) aliases.add(m[1]);
	let out = text;
	for (const a of aliases) out = out.replace(new RegExp('(?<![\\w$."' + String.fromCharCode(96) + '])' + a + '\\s*\\.\\s*', 'g'), 'Game.');
	return out
		.replace(/\?\s*\./g, '.')
		.replace(/\[\s*(['"`])([A-Za-z_$][\w$]*)\1\s*\]/g, '.$2')
		.replace(/\s*\.\s*/g, '.');
};

// 纯函数：返回引擎文件里的越界引用（供 test/layering.mjs 与自证共用）
export const checkLayerDirection = (sources, { layers = LAYER_OF, symbols = STORY_SYMBOLS } = {}) => {
	const out = [];
	for (const [name, src] of Object.entries(sources)) {
		if (layers[name] !== 'engine') continue;
		const norm = normalizeSymbolRefs(stripCommentsForLint(src));   // #459：剥注释后再匹配（注释里的提及不算引用）
		const hits = symbols.filter((sym) => norm.includes(sym));
		if (hits.length) out.push({ file: name, symbols: hits });
	}
	return out;
};
export const LAYER_OF = Object.fromEntries(Object.entries(MODULES).map(([k, v]) => [k, v.layer ?? 'story']));

// ── #441 第 3 步前置：engine 内部 **rank** ＋ 四条「禁止边」（登记模式）────────────
// 依据：现状测量（engine 侧 1634 行塞在 3 文件 5 种职责里）＋ 复核后的口径。
// **rank 的真正来源是目录名**（搬家后）：`src/engine/40-sim/**.twee` ⇒ rank 4。
// 搬家前文件还平铺在 `src/*.twee`，`rankOfPath()` 返回 null ⇒ 此时只能**登记**：
// 用「签名散布」量出**每个文件目前跨了几种职责**（＝要拆成几个文件）＋ 量出四条禁止边的违反。
// 这套产出**就是第 3 步的作业单**；搬家后 `rankOfPath()` 生效，同一处判据转严格。
export const RANKS = [
	{ rank: 0, name: 'boot', dir: '00-boot', note: '启动与接线；**唯一**知道"故事在哪"的地方（读故事清单 / Config.saves.id / Config.history）' },
	{ rank: 1, name: 'kernel', dir: '10-kernel', note: '纯计算：零依赖，node 可直测（不得摸 State/DOM/localStorage/Config）' },
	{ rank: 2, name: 'state', dir: '20-state', note: '状态与契约：读写 pc/State，不碰 DOM' },
	{ rank: 3, name: 'persist', dir: '30-persist', note: '跨存档持久化：localStorage / Save 钩子，不摸 DOM' },
	{ rank: 4, name: 'sim', dir: '40-sim', note: '结算：掷骰 → 写 State（把"算"从 widget 里剥出来的部分）' },
	{ rank: 5, name: 'present', dir: '50-present', note: '呈现：DOM/jQuery/CSS，**只读 State、不写**（#315 渲染路径契约）' },
];

/** 目录名 ⇒ rank（搬家后生效；今天一律 null ⇒ 登记模式）。 */
export const rankOfPath = (p) => {
	// 目录名是 `NN-name`（`00-boot`/`10-kernel`/…/`50-present`）⇒ rank＝**十位**那个数字。
	// （第一版写成 `Number(m[1])` 返回 40 ⇒ 自证当场抓住；未知前缀返回 null = "未分层"，会在作业单里露出来。）
	const m = /(?:^|\/)engine\/(\d\d)-/.exec(String(p));
	if (!m) return null;
	const n = Number(m[1][0]);
	return RANKS.some((r) => r.rank === n) ? n : null;
};

/** 每个 rank 的**签名**（登记模式用它量"这个文件目前跨了几种职责"）。 */
export const RANK_SIGNATURES = {
	0: ['StoryInit', 'Config.history', 'Config.saves', '00-story.json'],
	1: ['Game.Rules', 'renderCheck'],
	2: ['Game.Pc', 'State.variables', 'setflag', 'snapshot', 'damage', 'give', 'firstTime'],
	3: ['localStorage', 'Save.onSave', 'Save.onLoad', 'Sg.save'],
	4: ['fightbegin', 'fightact', 'socresolve', 'sitecheck', 'econ'],
	5: ['jQuery', 'document.', 'Sg.UI', 'StoryCaption', ':passagerender', ':passageend', 'actOut', 'sceneFeedback'],
};

/** 纯样式文件：不参与签名匹配（CSS 里的类名 `.damage-x` 会被误当代码 ⇒ 假阳性）。
 *  搬家后全在 `50-present/style.twee`，本表随之删除。 */
export const STYLE_FILES = ['src/engine/50-present/90-style.twee'];

/** 四条禁止边（每条对应本仓已有纪律；都能机检）。 */
export const RANK_BANS = [
	{ rank: 1, name: 'kernel 零依赖', patterns: [/\bState\./, /\bjQuery\b/, /\bdocument\./, /\blocalStorage\b/, /\bConfig\./], why: '纯函数可 node 直测' },
	{ rank: 5, name: 'present 不写状态', patterns: [/<<set\s+\$/, /\bState\.variables\.\w+\s*=/, /<<run\s+.*State\.variables\.\w+\s*=/], why: '#315 渲染路径契约' },
	{ rank: 3, name: 'persist 无 DOM', patterns: [/\bjQuery\b/, /\bdocument\./, /\$\s*\(/], why: '存档逻辑可在 node 测' },
	{ rank: 0, name: '只有 boot 碰故事身份', patterns: [/00-story\.json/, /Config\.saves\.id/, /Config\.history/], why: '「引擎不知道故事名」——第 4 步第二故事接入的判据', onlyIn: 0 },
];

/** 纯函数：登记模式报告 —— ①每个文件跨了哪些 rank（＝要拆几份）②四条禁止边的违反。 */
export const checkEngineRanks = (sources, { rankOf = rankOfPath, signatures = RANK_SIGNATURES, bans = RANK_BANS, engineFiles, styleFiles = STYLE_FILES } = {}) => {
	const spread = [];
	const banHits = [];
	for (const [file, src] of Object.entries(sources)) {
		if (engineFiles && !engineFiles.includes(file)) continue;
		const s = String(src);
		const isStyle = styleFiles.some((n) => file.endsWith(n));
		const ranks = isStyle ? [] : Object.keys(signatures).map(Number).filter((r) => signatures[r].some((mark) => s.includes(mark)));
		const fromPath = rankOf(file);
		spread.push({ file, ranks, fromPath, kind: isStyle ? 'style' : 'code' });
		for (const ban of bans) {
			if (ban.onlyIn != null) {
				// 「只有 rank N 可碰」：其他 rank 的文件里出现即违反（今天用文件是否属于该 rank 判断；未分层时跳过）
				if (fromPath == null || fromPath === ban.onlyIn) continue;
			} else if (fromPath != null && fromPath !== ban.rank) continue;
			for (const p of ban.patterns) {
				const m = p.exec(s);
				if (m) { banHits.push({ file, ban: ban.name, rank: ban.rank, sample: m[0] }); break; }
			}
		}
	}
	return { spread, banHits };
};

// ── #441-C：门不再写死"常量段在哪个文件" ────────────────────────────────────
// 背景：`literals.mjs` 原先写死 `base === 'stories/mist-forest/15-tables.twee'`。按 #441-D 搬家后常量段会移到
// `src/engine/**`，那两条判据会**静默失效**（判据永远绿、无人机察觉）——本仓最贵的一类假绿。
// 做法：承载文件改为**声明**（单一权威），并且做**反向断言**：
//   「任何文件里出现常量定义（`const Era = {`）却没被声明」⇒ 报 `stale-declaration`。
// ⇒ 搬家**只会变红一次**（提示你更新声明），**不会**静默变绿。
export const CONST_SECTION = {
	// 允许出现"数据字段里的 era 字面量"与"`const Era = {…}` 定义"的文件（用**路径后缀**匹配，兼容搬家后的新路径）
	// `#562`：**引擎侧默认常量**（`10-core` 的 `Game.Era ??= {…}`／`Game.Damage ??= {…}`）也是常量载体
	// ——否则 `--literals` 会把那两行判成"裸时代字面量"（引擎给默认值 ⇒ 必须一起声明，这是"搬家要同步声明"的同一条纪律）
	files: ['stories/mist-forest/15-tables.twee', 'src/engine/10-const.twee'],
	eraDecl: /const Era = \{|Game\.Era \?\?= \{|Game\.Era = \{/,   // 常量定义行的特征（`#660` 片二：单源用普通赋值）
	eraDataField: /(flagEra|era:)/,         // 故事表数据字段的特征
	// 裸伤害数字：**不再按文件名限定章节**。原先只在 `30/40/50/60-ch*.twee` 里判 ⇒ 章节一旦改名
	// （搬家时很可能发生）判据就静默失效。现在改成"**所有文件都判**"，例外只在声明的文件中排除。
	damageMacro: /<<damage\s+(-?\d+)\s*>>/,
	damageExemptFiles: [],
	// ⏳ 裸伤害数字登记：**已清零**（`#461` 抽「算」时同批修完：`1/2` → `Game.Damage.graze/hurt`，
	//   `5` → 具名 `Game.Damage.shove`）。此后本键缺席即「无例外」；新出现的裸伤害数字一律直接判红。
};

// ── 源文件发现的**单一权威**（#458 切片B）────────────────────────────────────
// 背景：`readdirSync('src')` 这类"单根枚举"散落在 ≈10 个文件里（build/audit context/coverage/globals/
// silent-gate/store-keys/dist-fresh…）⇒ 搬家（故事文件要住到 `stories/<slug>/**`）会牵动每一处 ✗。
// 做法：把发现收到这里。**今天 `SOURCE_ROOTS` 只有 `src`** ⇒ 返回值与既有写法**逐字符相同**（零行为变化 ✓）；
// 搬家时只改本数组（并让 `ORDER`/`MODULES` 的键改成路径）✓。
// #458 切片C：`src` 覆盖 `src/*.twee`（两个尚未拆分的混合体）**与** `src/engine/**`；`stories` 覆盖故事包。
export const SOURCE_ROOTS = ['src', 'stories'];
export const allSourceFiles = (roots = SOURCE_ROOTS) => {
	const out = [];
	const walk = (rel) => {
		const abs = join(ROOT, rel);
		if (!existsSync(abs)) return;
		for (const e of readdirSync(abs, { withFileTypes: true })) {
			const r = `${rel}/${e.name}`;
			if (e.isDirectory()) { if (!/^(node_modules|\.)/.test(e.name)) walk(r); continue; }
			if (e.name.endsWith('.twee')) out.push(r);
		}
	};
	for (const r of roots) walk(r);
	return out.sort();
};
/** 按**加载顺序**（`ORDER`）排一组源文件；`ORDER` 未登记的排在最后（保持其相对顺序，稳定排序）。
 *  为什么要它（#458 切片C 的实测教训）：`allSourceFiles()` 是**词典序**，而加载顺序由目录/文件名共同决定。
 *  搬家前「词典序 ≈ 加载顺序」只是**巧合**（`00-meta`→`05-store`→`10-core`→…）；搬家后故事文件住进
 *  `stories/**`（排在 `src/**` 之后）⇒ 若照词典序执行，`21-resolve` 会在故事表建 `Game.Checks` 之前跑
 *  ⇒ `Object.assign(window.Game.Checks, …)` 直接 `TypeError`（audit 上下文实测）。
 *  ⇒ **加载顺序的唯一权威是 `ORDER`**，任何「按源清单逐文件执行」的调用点都必须过这里。 */
export const orderFiles = (files, order = ORDER) => [...files].sort((a, b) => {
	const ia = order.indexOf(a), ib = order.indexOf(b);
	return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib);
});
/** 按 basename 或路径后缀解析源文件（供只认文件名的调用点用，如 `resolve-node.mjs`）。 */
/** 引擎文件（`MODULES.layer === 'engine'`）——**故事作用域**的一半。 */
export const engineFiles = (order = ORDER, modules = MODULES) => order.filter((f) => (modules[f]?.layer ?? 'story') === 'engine');

/** **故事作用域**（`#460` / `#441-E`）：一个故事的**分析宇宙** ＝ 引擎文件 ∪ 该故事清单声明的文件，顺序由 `ORDER` 决定。
 *
 *  为什么必须是**一处权威**：构建（`build.mjs`）与门（`scripts/audit`）若各算一次，第二个故事一进来就会
 *  出现"产物是 A、而门在判 A＋B"的错位。spike（`feat/460-minimal-demo`）实测的根因就是：
 *  故事门的分析宇宙＝**全部源文件**，于是第二个故事**既污染**第一个故事的指标（同名段落/载荷统计/最薄榜），
 *  **又被**第一个故事的判据要求（段落登记/覆盖宇宙/密度基线）。⇒ 宇宙按故事切，两边共用本函数。
 */
export const scopedFiles = (story, { order = ORDER, modules = MODULES } = {}) => {
	const eng = engineFiles(order, modules);
	return order.filter((f) => eng.includes(f) || (story?.files ?? []).includes(f));
};

export const sourcePath = (name, roots = SOURCE_ROOTS) => allSourceFiles(roots).find((f) => f === name || f.endsWith(`/${name}`)) ?? name;
