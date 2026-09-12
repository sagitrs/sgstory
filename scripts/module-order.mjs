import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
	'00-meta.twee',      // StoryTitle / StoryData（无依赖）
	'10-core.twee',      // Game.Rules / Game.Pc / Sg.UI ＋ 宏（无依赖）
	'11-scene.twee',     // 场景 widget（actOut / sceneFeedback）
	'15-tables.twee',    // Game.*（加载期需要 Rules / Pc）
	'20-chargen.twee',   // Game.Chargen（rounds/presets/API；加载期需要 Rules）
	'30-ch1.twee',
	'40-ch2.twee',
	'50-ch3.twee',
	'60-endings.twee',
	'70-codex.twee',
	'80-script.twee',    // 存档 API / Sg.Codex / Sg.Ending（需要前面全部）
	'90-style.twee',     // 纯 CSS
];

// 每个模块：加载期依赖 + 必须定义的符号（用于抓「改了名/挪了位置」）
export const MODULES = {
	'00-meta.twee': { deps: [], defines: [], note: '故事元数据（StoryTitle / StoryData）' },
	'10-core.twee': { deps: [], defines: ['Game.Rules', 'Game.Pc', 'Sg.UI'], note: '规则内核与界面基座' },
	'11-scene.twee': { deps: ['10-core.twee'], defines: ['widget:actOut', 'widget:sceneFeedback'], note: '场景迁移配方（结果留屏）' },
	'15-tables.twee': { deps: ['10-core.twee'], defines: ['Game'], note: '声明式数据表' },
	'20-chargen.twee': { deps: ['10-core.twee', '15-tables.twee'], defines: ['Game.Chargen'], note: '车卡（#320 阶段 3 收进 Game 命名空间）' },
	'30-ch1.twee': { deps: ['10-core.twee', '11-scene.twee', '15-tables.twee', '20-chargen.twee'], defines: [], note: '第一章（剧情段）' },
	'40-ch2.twee': { deps: ['10-core.twee', '11-scene.twee', '15-tables.twee'], defines: [], note: '第二章（剧情段）' },
	'50-ch3.twee': { deps: ['10-core.twee', '11-scene.twee', '15-tables.twee'], defines: [], note: '第三章（剧情段）' },
	'60-endings.twee': { deps: ['10-core.twee', '11-scene.twee', '15-tables.twee'], defines: [], note: '结局页' },
	'70-codex.twee': { deps: ['10-core.twee', '15-tables.twee'], defines: [], note: '设定集' },
	'80-script.twee': { deps: ['10-core.twee', '11-scene.twee', '15-tables.twee', '20-chargen.twee', '70-codex.twee'], defines: ['Sg.Codex', 'Sg.Ending'], note: '存档 API 与运行时胶水' },
	'90-style.twee': { deps: ['10-core.twee'], defines: [], note: '样式' },
};

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

export const readModules = (dir = new URL('../src', import.meta.url)) => {
	const out = {};
	for (const f of readdirSync(fileURLToPath(dir)).filter((f) => f.endsWith('.twee')).sort()) {
		out[f] = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
	}
	return out;
};
