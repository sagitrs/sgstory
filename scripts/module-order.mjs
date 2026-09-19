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
	'src/engine/30-persist/05-store.twee',     // 存储缝（#441-B/#462）：localStorage 键构造的唯一落点（引擎/故事两作用域）
	'src/engine/10-const.twee',   // 引擎常量（#660 片二）：Game.Era / Game.Damage —— **必须排在 10-core 之前**
	'src/10-core.twee',      // Game.Rules / Game.Pc / Sg.UI ＋ 宏（依赖 10-const 的常量）
	'src/engine/50-present/11-scene.twee',     // 场景 widget（actOut / sceneFeedback）
	// 手写逃生舱文件（`#787` 翻面）：契约里两个**非 A 桶**成员（`socialHooks`／`overBudget`）——
	// **不带** `@generated`（它不是产物），与生成物**同形**地 `Object.assign` 到 `Sg.story`。
	// 笔记模型（伞 #422）的增量文件：只往 Game.Notes.entries 追加条目。
	// 每批一个文件（#428 机制）⇒ 多席并行落表零冲突；新增文件必须在此登记（build 会拒绝未登记的文件）。
	// ── 第二个故事（#460）：**按与 mist-forest 同构的相对位置交错登记** ──
	// 为什么要交错而不是追加在末尾：`15-tables` 建的空容器是引擎侧 `21-resolve` **加载期**就要 assign 的对象
	//（`Object.assign(window.Game.Checks, …)`）⇒ 必须排在它前面。多故事并存下 ORDER 的"全局交错"语义
	// 值得另票收紧（per-story ORDER），本票先按既有形状办。
	'stories/minimal-demo/00-meta.twee',      // StoryTitle / StoryData / StoryIdentity（无依赖）
	'stories/night-ferry/00-meta.twee',       // 第四个故事（夜渡）的 StoryTitle / StoryData / StoryIdentity
	'stories/minimal-demo/15-tables.twee',    // 最小声明面：引擎加载期要用的空容器
	// ⚠️ `night-ferry`（`#998` 实测 ✗）：**漏登记 ⇒ 它落到末尾 ⇒ 顶层浅合并 `window.Game = Object.assign(…)` 会把
	//   引擎加载期 assign 进 `Game.Combat` 的方法**一起替换掉** ✗ ⇒ `Game.Combat.slotAbsorb` 消失 ⇒ `slots` 门抛异常 ✓
	//   ⇒ 这条**不是可选** ✓：**每个故事的 `15-tables.twee` 都必须排在 `21-resolve` 之前** ✓（:43 那句的原意 ✓）。
	'stories/night-ferry/15-tables.twee',     // 第四个故事的声明面：引擎加载期要用的空容器（**必须排在 21-resolve 前** ✓）
	// ── 面夹具（`face-fixture`，`#1004` B2b）：**测试夹具（非内容故事）** ──
	//   它的 `15-tables.twee` 同样**必须排在 `21-resolve` 前** ✗（同 `night-ferry` 的 `#998` 实测：否则顶层浅合并
	//   会把引擎 assign 进 `Game.*` 的方法一起替换掉 ⇒ 门抛异常）。
	'stories/face-fixture/00-meta.twee',      // 夹具元数据（StoryTitle / StoryData / StoryIdentity）
	'stories/face-fixture/15-tables.twee',    // 夹具的声明面：引擎加载期要用的容器（**必须排在 21-resolve 前** ✓）
	'src/engine/40-sim/21-resolve.twee',    // 结算（sim，伞 #441 的 40-sim 落点）：位点判定的「算」＋ rng 注入（#441-A）
	'stories/face-fixture/10-fixture.twee',   // 夹具段落：车卡链 ＋ 每种面各一段（段名沿用旧故事＝消费者钉死了它 ✓）
	'stories/face-fixture/12-hooks.twee',     // 夹具的手写逃生舱（`overBudget` 等非 A 桶契约成员 ✓）
	'stories/face-fixture/17-rules.twee',     // 夹具条件表（生成物）：`rows` 非空 ⇒ 条件表面
	'stories/face-fixture/16-notes-ch1.twee', // 夹具 notes 面（生成物）：`Game.Notes.entries` 增量
	'stories/night-ferry/10-ferry.twee',     // 第四个故事段落：渡口 → 河心 → 对岸（两条路线各 6 步、两个结局）
	'stories/night-ferry/17-rules.twee',     // 条件表（生成物）：行数组，选择器在引擎侧
	'src/80-script.twee',    // 存档 API / Sg.notes / Sg.Ending ＋ 渲染后处理（**引擎层**，`#574` 修正 layer）
	'src/engine/50-present/12-shortfight.twee',   // 短战斗 widget（#608：从故事侧上移）
	'src/engine/50-present/90-style.twee',     // 纯 CSS
	'stories/minimal-demo/10-demo.twee',      // 段落 ＋ StoryBindings（只依赖引擎）
	// ── 第三个故事（#490 S5「无名洞窟」雏形）：同样按相对位置交错登记 ──
	// ── 第二个故事（#460 最小示例）：证明引擎与故事已解耦 ──
	// 它不共享 mist-forest 的任何文件（那是另一个故事的资产）；引擎文件对所有故事共享 ⇒ 由 `scopedFiles()` 自动带上。
];

// 每个模块：加载期依赖 + 必须定义的符号（用于抓「改了名/挪了位置」）
export const MODULES = {
	// ── 第二个故事（#460）：layer 'story'，只依赖引擎 ──
	'stories/minimal-demo/00-meta.twee': { deps: [], defines: [], layer: 'story', note: '第二个故事的元数据（StoryTitle / StoryData / StoryIdentity）' },
	'stories/minimal-demo/15-tables.twee': { deps: ['src/10-core.twee'], defines: [], layer: 'story', note: '第二个故事的最小声明面：引擎**加载期**要用的空容器（#460 实测的接入契约）' },
	'stories/minimal-demo/10-demo.twee': { deps: ['stories/minimal-demo/15-tables.twee'], defines: [], layer: 'story', note: '最小示例段落 ＋ StoryBindings（引擎接入契约的空表）' },
	// ── 第四个故事（`night-ferry` · 夜渡，P4 `#991` 用编辑器做出 ✓）──
	'stories/night-ferry/00-meta.twee': { deps: [], defines: [], layer: 'story', note: '第四个故事的元数据（StoryTitle / StoryData / StoryIdentity）' },
	'stories/night-ferry/15-tables.twee': { deps: ['src/10-core.twee'], defines: [], layer: 'story', note: '第四个故事的声明面：引擎**加载期**要用的空容器（`#998` 实测：必须排在 `21-resolve` 前 ✗ —— 否则顶层浅合并会把引擎 assign 的方法替换掉 ✓）' },
	// ⚠️ `#1004` B2：**引擎件**的依赖条目不许随故事删 ✗（它只是 `deps` 里引用过故事表 ✓ ⇒ 改 deps，**不删条目** ✗）——
	//   否则 ORDER 里还有它、依赖表里没有 ⇒ `move-precheck` 的 `[missing-modules]` 当场红 ✓（实测：B2a 一版就踩了这个 ✓）。
	'src/engine/40-sim/21-resolve.twee': { deps: ['src/10-core.twee'], defines: [], layer: 'engine', note: '结算（sim，伞 #441 的 40-sim 落点）：位点判定的「算」＋ rng 注入（#441-A）' },
	'stories/night-ferry/10-ferry.twee': { deps: ['stories/night-ferry/15-tables.twee'], defines: [], layer: 'story', note: '夜渡段落：渡口 → 河心 → 对岸，两条路线各 6 步、两个「结局…」段落' },
	'stories/night-ferry/17-rules.twee': { deps: ['stories/night-ferry/15-tables.twee'], defines: [], layer: 'story', note: '条件表（生成物）：行数组，选择器在引擎侧' },
	// ── 面夹具（`face-fixture`，`#1004` B2b）：**测试夹具（非内容故事）** ✓ ──
	//   它把接入契约的每种面声明一次，供测试当输入（段名沿用旧故事只因消费者钉死了它们 ✓；正文全部新写 ✗）。
	'stories/face-fixture/00-meta.twee': { deps: [], defines: [], layer: 'story', note: '夹具的元数据（StoryTitle / StoryData / StoryIdentity）' },
	'stories/face-fixture/15-tables.twee': { deps: ['src/10-core.twee'], defines: [], layer: 'story', note: '夹具的声明面：引擎**加载期**要用的容器（同 `#998`：必须排在 `21-resolve` 前 ✗）' },
	'stories/face-fixture/10-fixture.twee': { deps: ['stories/face-fixture/15-tables.twee'], defines: ['Game.Chargen'], layer: 'story', note: '夹具段落：车卡链（`rules.mjs` 钉死 3 轮 × 3 选项 ＋ 3 预设）＋ 每种面各一段' },
	'stories/face-fixture/12-hooks.twee': { deps: ['stories/face-fixture/15-tables.twee'], defines: [], layer: 'story', note: '夹具的手写逃生舱：`Sg.story.overBudget`（非 A 桶契约成员，照 `mist-forest/16-hooks.twee` 先例）' },
	'stories/face-fixture/17-rules.twee': { deps: ['stories/face-fixture/15-tables.twee'], defines: [], layer: 'story', note: '夹具条件表（生成物）：`rows` 非空（两存活样本都给不了这一格 ✓）' },
	'stories/face-fixture/16-notes-ch1.twee': { deps: ['stories/face-fixture/15-tables.twee'], defines: [], layer: 'story', note: '夹具 notes 面（生成物）：`Game.Notes.entries` 增量（4 条）' },
	'src/engine/30-persist/05-store.twee': { deps: [], defines: ['Sg.store'], layer: 'engine', note: '存储缝（#441-B/#462）：localStorage 键构造的唯一落点' },
	'src/engine/10-const.twee': { deps: [], defines: ['Game.Era', 'Game.Damage'], layer: 'engine', note: '引擎常量（#660 片二）：时代枚举与伤害档梯的**唯一落点**' },
	'src/10-core.twee': { deps: ['src/engine/10-const.twee'], defines: ['Game.Rules', 'Game.Pc', 'Sg.UI'], layer: 'engine', note: '规则内核与界面基座（常量见 10-const）' },
	'src/engine/50-present/11-scene.twee': { deps: ['src/10-core.twee'], defines: ['widget:actOut', 'widget:sceneFeedback'], layer: 'engine', note: '场景迁移配方（结果留屏）' },
	'src/80-script.twee': { deps: ['src/10-core.twee'], defines: ['Sg.save', 'Sg.notes', 'Sg.Ending'], layer: 'engine', note: "引擎运行时胶水（`#574` 修正 layer）：存档 API（`Sg.save`）· `Sg.notes`（数据经 `Sg.story.notes()`）· 结局收尾 · 结果留屏/空白归一/键盘路径/`data-choice` 派生——对**每个故事**成立 ⇒ 必须随引擎进每个故事的作用域" },
	'src/engine/50-present/90-style.twee': { deps: ['src/10-core.twee'], defines: [], layer: 'engine', note: '样式' },
	'src/engine/50-present/12-shortfight.twee': { deps: ['src/10-core.twee'], defines: ['widget:shortFight'], layer: 'engine', note: '短战斗 widget（#608：S3 机制上移；相位→分支只看 `waveRecord().phase`，奖励/失败笔记走声明面）' },};

// ── 判定（纯函数，供 test/layering.mjs 与自证共用）──────────────────────
// sources: { 文件名: 源码字符串 }
// ── `#893` 第三步：**两层登记**（引擎件 ⊂ `ORDER`／故事件 ⊂ **它自己的清单**）──────────────
// 背景 ✓：`#893` 前两步让 `build.mjs` 的守卫分了两层 ✓；而 `test/layering.mjs` 与 `scripts/move-precheck.mjs`
//   仍按**一层**要求"所有源文件 ⊂ `ORDER`" ✗ ⇒ 一个**数据面完整的新故事**在场时，它们各红 3／6 项 ✗
//   （实测：`[unlisted-file] ×3` ＋ `[missing-modules] ×3` ✓ —— 而 `build.mjs` 已 rc=0 ✓）。
// 做法 ✓：**换登记处，不撤守卫** ✗ —— 引擎件的登记处仍是 `ORDER`／`MODULES` ✓（它们的先后是**全局**的 ✓）；
//   故事件的登记处是**它自己的清单** ✓（`stories/<slug>/00-story.json` 的 `files` ✓ —— 本来就是**有序**的 ✓）。
//   ⇒ 新件仍须**显式登记** ✓（不是"靠文件名前缀自动获得顺序"✗ —— 那条守卫的理由仍在 ✓）。
// 单一权威 ✓：`checkRegistration()` 被 `build.mjs`／`test/layering.mjs`／`scripts/move-precheck.mjs` **共用** ✓
//   （三处各写一份 ⇒ 必然漂移 ✗ —— 本仓已实测过这一族 ✓）。

/** 故事清单（`stories/<slug>/00-story.json`）——**单一权威** ✓（故事件的**登记处** ✓；只扫一层目录 ✓）。 */
export const storyManifests = (dir = join(ROOT, 'stories')) => {
	const out = [];
	if (!existsSync(dir)) return out;
	for (const slug of readdirSync(dir)) {
		const p = join(dir, slug, '00-story.json');
		if (!existsSync(p)) continue;
		const j = JSON.parse(readFileSync(p, 'utf8'));
		out.push({ slug, files: j.files ?? [], gates: j.gates ?? [], path: p });
	}
	return out;
};

/** 一条源文件的层 ✓：**引擎件**（`src/**` ✓，或 `MODULES` 里显式声明 `layer: 'engine'` ✓）／**故事件**（其余 ✓）。
 *  ⚠️ 必须用**路径**兜底（不是"只在 `MODULES` 里查"✗）：引擎件若漏登记 `MODULES`，只查后者会把它**当成故事件** ✗
 *  ⇒ 报成"无人认领"（把真因藏起来 ✗ —— 实测过的误导形）。 */
export const layerOf = (f, modules = MODULES) => modules[f]?.layer ?? (String(f).startsWith('src/') ? 'engine' : 'story');

/** `#899` ①：故事清单**必须由调用方注入** ✗ —— 见 `checkRegistration()` 的 `manifests` 入参。 */
export const requireManifests = (manifests, who = 'checkRegistration') => {
	if (manifests === undefined) {
		throw new Error(`${who}：缺 \`manifests\`（故事件的**登记处** ⇒ 必须由调用方注入 ✓）—— **合成输入的调用方不得让默认值去读盘** ✗`
			+ `（实测：夹具故事在场时曾误报 27／28 条 \`missing-manifest-file\` ✗）。真实调用请传 \`storyManifests()\` ✓。`);
	}
	// `#930`（`#899` ① 复核留）：**形状**也要挡 ✗ —— 只挡 `undefined` 的话，喂 `{}`／字符串会**漏到下游 `flatMap`** ✗
	//   ⇒ 报的是 `flatMap is not a function` 那类 ⇒ **报文不点名** ✗，而这条守卫的**用途就是"点名报错"** ✓（`#899` ① 的正形 ✓）。
	if (!Array.isArray(manifests)) {
		const got = manifests === null ? 'null' : typeof manifests === 'object' ? '对象（非数组）' : typeof manifests;
		throw new Error(`${who}：\`manifests\` **必须是数组**（收到 ${got} ✗）—— 故事件的**登记处**形状必须显式 ✓；`
			+ `真实调用请传 \`storyManifests()\` ✓（它返回数组 ✓）。`);
	}
	return manifests;
};

/** `#893` 的**两层登记判据**（纯函数 ✓，三处共用 ✓）：返回 `[{ code, msg }]`（空＝过 ✓）。
 *  ① `unlisted-file`  —— **引擎件**必须 ⊂ `ORDER` ✓（引擎件的加载顺序不允许隐含 ✓）
 *  ①b `missing-modules`（仅 `requireModules` 时 ✓）—— **引擎件**必须 ⊂ `MODULES` ✓（`LAYER_OF`／`engineFiles()` 都从它派生 ✓）
 *  ② `unclaimed-file`  —— **故事件**必须被**某故事清单**认领 ✓（换登记处 ✓，不是撤守卫 ✗）
 *  ③ `missing-file`    —— `ORDER` 里的文件必须真实存在 ✓（改名/删除会被抓 ✓）
 *  ③b `orphan-in-order`—— `ORDER` 里的**非引擎**件仍须被某故事认领 ✓（孤儿 ⇒ 建树时没人读它 ✗）
 *  ④ `missing-manifest-file` —— **清单列出的文件**必须存在 ✓（改名/删除会被抓 ✓）
 *  ⚠️ 边界（写清 ✓）：`ORDER` 对**故事件**是**可选**的 ✓ —— 既有故事件在里面 ⇒ 由 `ORDER` 排序 ✓；
 *     新故事件不在 ⇒ 由**清单序**排序 ✓（见 `storyOrder()` ✓）。引擎件**不得**只靠清单 ✗。 */
/** **故事声明面必须排在消费它的引擎件之前** ✗（`#1002` —— `#998` 实测出来的洞 ✓）。
 *
 *  为什么单列一族 ✗：`checkRegistration()` 只管到"引擎件 ⊂ ORDER" ✓ 与"故事件被清单认领" ✓，
 *  ⚠️ **不要求**故事件**进 ORDER** ✗（`#893` 起故事件改由**自己的清单**登记 ✓）——
 *  ⇒ 于是"某个故事的 `15-tables.twee` 漏进 ORDER / 排到了 `21-resolve` 之后"**没人管** ✗。
 *
 *  代价（`#998` 实测 ✓）：`21-resolve` 加载期做 `Object.assign((window.Game.X ??= {}), {…方法…})` ✓，
 *  故事表做 `window.Game = Object.assign(window.Game ?? {}, { X: {…} })` ✗（**顶层浅合并 ＝ 替换** ✗）
 *  ⇒ **谁后跑谁赢** ✓：故事表若排在引擎之后 ⇒ 引擎挂在 `Game.Combat` 上的方法**被抹掉** ✗
 *  ⇒ 门里 `Game.Combat.slotAbsorb(...)` 抛 TypeError ⇒ **门崩** ✗（后面的故事面**全没跑** ✗）。
 *
 *  ⚠️ 判据只钉**两格** ✓（不扩大）：① 该件**在 ORDER 里** ✓；② 它**排在消费侧之前** ✓。
 *  ③ 名字口径 ✓：故事侧固定 `15-tables.twee` ✓（模块序的表里就是这么排的 ✓）；
 *  ④ 只在**清单真的列了**它时才判 ✓（没这个面 ⇒ 不管 ✓ —— 本仓口径：手写面各有归属 ✓）。
 */
export const storyTablesOrderProblems = ({ order = ORDER, manifests = [], consumer = 'src/engine/40-sim/21-resolve.twee' } = {}) => {
	const out = [];
	const at = order.indexOf(consumer);
	for (const m of requireManifests(manifests)) {
		for (const f of m.files ?? []) {
			if (!/\/15-tables\.twee$/.test(f)) continue;
			const i = order.indexOf(f);
			if (i < 0) out.push({ code: 'tables-not-in-order', msg: `${m.slug} 的 ${f} **不在 ORDER 里** ✗ ⇒ 它会排在 ${consumer} **之后** ⇒ 故事表**盖掉**引擎挂的方法（\`#998\` 实测：门崩 ✓）` });
			else if (at >= 0 && i > at) out.push({ code: 'tables-after-consumer', msg: `${m.slug} 的 ${f} 排在 ${consumer} **之后** ✗（ORDER 下标 ${i} > ${at}）⇒ 同上：加载期 assign 的目标被换掉 ✗` });
		}
	}
	return out;
};

export const checkRegistration = ({ sources, order = ORDER, modules = MODULES, manifests, requireModules = false } = {}) => {
	const out = [];
	const names = Object.keys(sources);
	const claimed = new Set(requireManifests(manifests).flatMap((m) => m.files));   // `#899` ①：**显式必需** ✓（不给默认 ⇒ 不读盘 ✗）
	const isEngine = (f) => layerOf(f, modules) === 'engine';
	for (const f of names) {
		if (isEngine(f)) {
			if (!order.includes(f)) out.push({ code: 'unlisted-file', msg: `${f} 是**引擎件**却未在 ORDER 里登记（引擎件的加载顺序不允许隐含）` });
			if (requireModules && !(f in modules)) out.push({ code: 'missing-modules', msg: `${f} 是**引擎件**却未进 MODULES（LAYER_OF／engineFiles() 从它派生）` });
			continue;
		}
		if (!claimed.has(f)) out.push({ code: 'unclaimed-file', msg: `${f} 既非引擎件（src/**）、也不属于任何故事清单的 files` });
	}
	for (const m of manifests) for (const f of m.files) {
		if (!names.includes(f)) out.push({ code: 'missing-manifest-file', msg: `故事清单 ${m.slug} 列出的 ${f} 不存在（改了名或删了文件）` });
	}
	for (const f of order) {
		if (!names.includes(f)) { out.push({ code: 'missing-file', msg: `ORDER 里的 ${f} 不存在（改了名或删了文件）` }); continue; }
		if (!isEngine(f) && !claimed.has(f)) out.push({ code: 'orphan-in-order', msg: `${f} 在 ORDER 里，但既非引擎件、也不属于任何故事清单` });
	}
	return out;
};

export const checkModuleGraph = (sources, { order = ORDER, modules = MODULES, manifests } = {}) => {
	const failures = [];
	const names = Object.keys(sources);

	// ① `#893` 第三步：**两层登记**（走单一权威 ✓ —— 与 `build.mjs`／`move-precheck.mjs` 同一把尺 ✓）
	failures.push(...checkRegistration({ sources, order, modules, manifests }));

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
	files: ['stories/night-ferry/15-tables.twee', 'src/engine/10-const.twee'],   // `#1004` B2：旧故事已删 ⇒ 夹具换到剩下的故事 ✓
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

/** **一个故事的加载顺序** ✓（`#893`）：**`ORDER` 里有的 ⇒ 按 `ORDER`** ✓（唯一权威 ✓）；
 *  **`ORDER` 里没有的**（＝新故事自己的件 ✓）⇒ **按它清单的序** ✓（**稳定排序** ✓，两边都不丢 ✓）。
 *
 *  ⚠️ 两个被读数推翻的版本 ✓（都留在这里，因为"为什么不是那样"才是关键 ✓）：
 *   ① `[...引擎件, ...故事件]` ✗ ⇒ **顺序变了** ✗：清单**本身是交错的** ✓（`stories/<slug>/00-meta.twee` 后紧跟 `src/engine/…` ✓）；
 *   ② **完全按清单序** ✗ ⇒ 实测**至少一个故事的清单序不等于 `ORDER` 序** ✗（清单的 `files` 只是**成员表** ✓
 *      —— `scripts/audit/context.mjs` 明写"加载顺序的**唯一权威**是 `ORDER`（不是词典序）" ✓）
 *      ⇒ 那会**改既有故事的产物** ✗。
 *      ⚠️ **读数更正** ✓（`#895` 复核发现非阻塞项 ✓）：这里原来写的是"**三个**故事的清单序都不等于 `ORDER` 序" ✗ ——
 *      **与实测不符** ✓：量法＝逐故事比较 `manifest.files` 与 `ORDER` 过滤后的子序列 ⇒ **`hollow-cave` 相等** ✓、
 *      **`mist-forest` 相等** ✓、**`minimal-demo` 不等** ✗ ⇒ **一个反例就够** ✓（结论不变 ✓，数目已更正 ✓）。
 *  ⇒ 所以本函数**只接管 `ORDER` 管不到的那部分** ✓：既有故事 ⇒ `ORDER` 说了算 ✓（**逐字节不变** ✓）；
 *     新故事 ⇒ 清单说了算 ✓ ⇒ **只落数据、不必改代码** ✓（P4 判据成立 ✓）。
 *
 *  ⚠️ 为什么不是"放宽 `ORDER` 守卫" ✗：`test/layering.mjs` 明写"新增文件不得靠文件名前缀**自动**获得顺序" ✓
 *  —— 那条守卫**有理由** ✓ ⇒ 这里**换登记处** ✓：新件仍须**显式登记** ✓，登记在**它自己的清单**里 ✓。 */
export const storyOrder = (story, { order = ORDER, modules = MODULES } = {}) => {
	const eng = engineFiles(order, modules);
	const mine = [...(story?.files ?? [])];
	for (const f of eng) if (!mine.includes(f)) mine.push(f);
	const pos = new Map(mine.map((f, i) => [f, i]));
	const rank = (f) => { const i = order.indexOf(f); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
	return [...mine].sort((a, b) => (rank(a) - rank(b)) || (pos.get(a) - pos.get(b)));   // 稳定（同 rank 时按清单序 ✓）
};


/** **故事作用域**（`#460` / `#441-E`）：一个故事的**分析宇宙** ＝ 引擎文件 ∪ 该故事清单声明的文件 ✓。
 *
 *  为什么必须是**一处权威**：构建（`build.mjs`）与门（`scripts/audit`）若各算一次，第二个故事一进
 *  出现"产物是 A、而门在判 A＋B"的错位。spike（`feat/460-minimal-demo`）实测的根因就是：
 *  故事门的分析宇宙＝**全部源文件**，于是第二个故事**既污染**第一个故事的指标（同名段落/载
 *  又被**第一个故事的判据要求（段落登记/覆盖宇宙/密度基线）。⇒ 宇宙按故事切。
 *
 *  ⚠️ `#893` ✓：故事自己的件**按清单顺序** ✓（不再用 `ORDER` 过滤 ✗ —— 否则新建故事不碰代码就排不进顺序 ✗）。
 */
export const scopedFiles = (story, { order = ORDER, modules = MODULES } = {}) => storyOrder(story, { order, modules });


export const sourcePath = (name, roots = SOURCE_ROOTS) => allSourceFiles(roots).find((f) => f === name || f.endsWith(`/${name}`)) ?? name;
