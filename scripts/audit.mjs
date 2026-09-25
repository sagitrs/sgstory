// #28 表驱动审计：node scripts/audit.mjs —— 查 window.Game 三表产出伞 #21/#22 报表，
// 替代一次性 jsdom 探查脚本。改表即改报告，秒级重算（无需启动场景）。
// 用法：node scripts/audit.mjs [--canon] [--checks] [--economy] [--items] [--dragon] [--combat] [--social]（缺省全输出）
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createContext } from './audit/context.mjs';

// #316 拆分第 1 步：加载区（源文件发现 / vm 直载 [script] / 预设 / 段落索引 / CLI）已抽到
// scripts/audit/context.mjs——各门模块的共同依赖。此处仅做绑定，**不改任何加载语义**。
// #460／#441-E：`--story <slug>` 切**故事作用域**（默认＝故事 1）。加载面由 `createContext` 按
//「引擎文件 ∪ 本故事清单」切好 → 故事门只判本故事（第二故事不再污染第一故事的指标，反之亦然）。
const storyArg = (() => { const i = process.argv.indexOf('--story'); return i >= 0 ? (process.argv[i + 1] ?? null) : null; })();
const ctx = createContext({ story: storyArg });
const { SRC_FILES, Game, presets, passageSrc, passageRaw, passageTags, arg, wantAll, storySlug } = ctx;

// ── ⓪ D1 真相可达性（#35）：命题 × 通路，锚点机检 ──
// `#607` P0：门的**发现与归属**收到 `audit/discovery.mjs`（引擎门 ∪ 待迁移 ∪ 本故事已声明；按 `GATE_ORDER` 排）。
// 选择面从此不依赖 registry 的数组顺序，而依赖**归属**与**顺序表**——搬家只改住址、不改输出次序（golden 零漂移可比对）。
import { gatesForStory, engineGates, allKnownFlags, validateDiscovery, checkFlagOwnership } from './audit/discovery.mjs';
import { makeShared, runSelectedGates } from './audit/lib/shared.mjs';
import { DEFAULT_SLUG as DEFAULT_STORY_SLUG } from './dist-paths.mjs';
Object.assign(ctx, makeShared(ctx));

// 修饰符：只影响退出码/严密档位/选择面，自身不选门
// `--strict`＝把"报告制"判据转硬；`--story <slug>`＝切故事作用域（带值）；`--engine-only`＝只跑引擎门（#436-a）
const MODIFIERS = ['check', 'strict', 'story', 'engine-only'];
// `#607` P0：发现面的自检（清单缺 `gates` 键／越界／文件存在但未声明／跨故事重名／顺序表未登记…）——
// **每次调用都跑**：这些是"结构缺失"，必须响亮报错而不是静默少跑几道门。
const discoveryProblems = await validateDiscovery();
if (discoveryProblems.length) {
	console.error('✗ 门发现面自检未通过（`#607`；见 docs/criterion-design.md §八 8.15）：');
	for (const p of discoveryProblems) console.error(`   · ${p}`);
	process.exit(1);
}
const known = new Set([...(await allKnownFlags()), ...MODIFIERS]);
const given = process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, ''));
const unknown = given.filter((f) => !known.has(f));
// `--engine-only`（`#436-a`）：只跑**引擎门**（`test-plan.mjs` 的 `AUDIT_ENGINE` 是层表单一权威）
// ——这是「第二故事能不能接」的出口判据（故事门会判红本故事以外的东西，见 `#460` spike）。
// `--engine-only`：只跑**引擎门**（`test-plan.mjs` 的 `AUDIT_ENGINE` 是层表单一权威；由 discovery 过滤）
//；否则＝**当前故事作用域**的门（引擎 ∪ 待迁移 ∪ 本故事已声明）里被点名的那些。
const selected = arg('engine-only')
	? await engineGates()
	: (await gatesForStory(storySlug)).filter((g) => wantAll || g.flags.some((f) => arg(f)));
// 注（`#460`／`#512`）：这里曾有一份 `STORY2_BLOCKED` 清单（第二故事跳过 `--state`／`--consequences`）——
// 2026-09-14 把引擎里的**故事 1 片段**（`hallResult` widget ＋ `fog_thin`）搬回 `stories/mist-forest/12-widgets.twee`
// 之后，两门对第二/第三故事**都是真绿**（9/9）→ 清单**已删**（这正是那份清单存在的意义：修好就删）。
if (arg('engine-only') && !selected.length) { console.error('✗ `--engine-only` 没有选中任何引擎门——检查 test-plan 的 AUDIT_ENGINE'); process.exit(2); }
// `#572`：**选中 → 真跑**。每道门自己还有一道 `wantAll || arg('<自己的flag>')` 守卫，而 `createContext` 里
// `wantAll =!argv.some((a) => a.startsWith('--'))` → 只给 `--engine-only --check` 时 `wantAll` 是 false、
// 各门又没拿到自己的 flag → **被选中的门逐道早退**（只剩下不带守卫的 `state`／`literals` 真跑）。
// 选择已经由上面的 `selected` 决定 → 这里把 `wantAll` 打开：**“选中”与“执行”由同一处说了算**，
// 不再要求调用方把门开关再重复一遍。
if (arg('engine-only')) ctx.wantAll = true;

// #366：以前「未知开关」或「只传 --check」会**一个门都不跑却退出 0**（假绿）。现在一律响亮报错。
// `#607` P0：**点名了别的故事的门** → 明确报错（而不是沉默地"没选中任何门"，更不是照跑别人的判据）。
// 只对**已搬进故事侧**的门生效（未迁移的门仍按今天口径）；`--engine-only` 模式下 flag 不是选择器 → 跳过。
if (!arg('engine-only')) {
	const ownerProblems = await checkFlagOwnership({ flags: given, slug: storySlug });
	if (ownerProblems.length) {
		console.error('✗ 门归属：');
		for (const p of ownerProblems) console.error(`   · ${p}`);
		process.exit(2);
	}
}
if (unknown.length) {
	console.error(`✗ 未知开关：${unknown.map((f) => `--${f}`).join('、')}（可用：${[...known].sort().join(' ')}）`);
	process.exit(2);
}
if (!selected.length) {
	console.error('✗ 没有选中任何门——`--check` 是修饰符，需要同时给出至少一个门开关（或不带任何参数＝全跑）');
	process.exit(2);
}

// `#572`：**“选中 → 真跑”的通用守卫**（实现在 `lib/shared.mjs`，纯逻辑、可自证）。
// 为什么放在这里而不是给某段计划加断言：这是**所有**开关调用（含 33 个 golden 开关）的必经之处
// → 谁再让某道门“被选中却一行不输出”，当场就红，而不是等下一次人发现。
// 注：门内失败会 `process.exit(1)` → 红时**后面的门不再跑**（fail-fast）；那句 `✔ 选中 N 门`
// 只在全绿时打印（也就不会在“只跑了一半”时报满数）。
const { silent, selected: selN, ran } = runSelectedGates(selected, ctx);
if (silent.length) {
	console.error(`✗ 选中的门没有产出任何输出（**选中 ≠ 跑过**，假绿）：${silent.join('、')}`);
	console.error("  修：门的 `run()` 开头那道 `if (!wantAll && !arg('<flag>')) return;` 要与选择器同源（#572）。");
	process.exit(1);
}
console.log(`\n✔ 选中 ${selN} 门 · 实跑 ${ran} 门`);

console.log('\n（数据源：stories/<slug>/data/tables.json —— 改表即改此报告；伞 #21/#22 审计请跑本脚本）');

