// #28 表驱动审计：node scripts/audit.mjs —— 查 window.Game 三表产出伞 #21/#22 报表，
// 替代一次性 jsdom 探查脚本。改表即改报告，秒级重算（无需启动场景）。
// 用法：node scripts/audit.mjs [--canon] [--checks] [--economy] [--items] [--dragon] [--combat] [--social]（缺省全输出）
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createContext } from './audit/context.mjs';

// #316 拆分第 1 步：加载区（源文件发现 / vm 直载 [script] / 预设 / 段落索引 / CLI）已抽到
// scripts/audit/context.mjs——各门模块的共同依赖。此处仅做绑定，**不改任何加载语义**。
// #460／#441-E：`--story <slug>` 切**故事作用域**（默认＝故事 1）。加载面由 `createContext` 按
// 「引擎文件 ∪ 本故事清单」切好 ⇒ 故事门只判本故事（第二故事不再污染第一故事的指标，反之亦然）。
const storyArg = (() => { const i = process.argv.indexOf('--story'); return i >= 0 ? (process.argv[i + 1] ?? null) : null; })();
const ctx = createContext({ story: storyArg });
const { SRC_FILES, Game, presets, passageSrc, passageRaw, passageTags, arg, wantAll, storySlug } = ctx;

// ── ⓪ D1 真相可达性（#35）：命题 × 通路，锚点机检 ──
import { GATES } from './audit/registry.mjs';
import { makeShared } from './audit/lib/shared.mjs';
import { AUDIT_ENGINE } from './test-plan.mjs';
import { DEFAULT_SLUG as DEFAULT_STORY_SLUG } from './dist-paths.mjs';
Object.assign(ctx, makeShared(ctx));

// 修饰符：只影响退出码/严密档位/选择面，自身不选门
//   `--strict`＝把"报告制"判据转硬；`--story <slug>`＝切故事作用域（带值）；`--engine-only`＝只跑引擎门（#436-a）
const MODIFIERS = ['check', 'strict', 'story', 'engine-only'];
const known = new Set([...GATES.flatMap((g) => g.flags ?? []), ...MODIFIERS]);
const given = process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, ''));
const unknown = given.filter((f) => !known.has(f));
// `--engine-only`（`#436-a`）：只跑**引擎门**（`test-plan.mjs` 的 `AUDIT_ENGINE` 是层表单一权威）
// ——这是「第二故事能不能接」的出口判据（故事门会判红本故事以外的东西，见 `#460` spike）。
const selected = GATES
	.filter((g) => arg('engine-only') ? g.flags.some((f) => AUDIT_ENGINE.includes(f)) : (wantAll || g.flags.some((f) => arg(f))))
	;
// 注（`#460`／`#512`）：这里曾有一份 `STORY2_BLOCKED` 清单（第二故事跳过 `--state`／`--consequences`）——
// 2026-09-14 把引擎里的**故事 1 片段**（`hallResult` widget ＋ `fog_thin`）搬回 `stories/mist-forest/12-widgets.twee`
// 之后，两门对第二/第三故事**都是真绿**（9/9）⇒ 清单**已删**（这正是那份清单存在的意义：修好就删）。
if (arg('engine-only') && !selected.length) { console.error('✗ `--engine-only` 没有选中任何引擎门——检查 test-plan 的 AUDIT_ENGINE'); process.exit(2); }
// #572 自证：engine-only 选中数 == 实跑数（早退守卫曾令选≠跑）——末行汇总（见文尾）

// #366：以前「未知开关」或「只传 --check」会**一个门都不跑却退出 0**（假绿）。现在一律响亮报错。
if (unknown.length) {
	console.error(`✗ 未知开关：${unknown.map((f) => `--${f}`).join('、')}（可用：${[...known].sort().join(' ')}）`);
	process.exit(2);
}
if (!selected.length) {
	console.error('✗ 没有选中任何门——`--check` 是修饰符，需要同时给出至少一个门开关（或不带任何参数＝全跑）');
	process.exit(2);
}

// #572 自证：engine-only 时输出「选中 N 门 == 实跑 N 门」（早退守卫曾令选≠跑）
const ranCount = { n: 0 };
for (const g of selected) { g.run(ctx); ranCount.n++; }
if (arg('engine-only')) console.log(`  · --engine-only 自证：选中 ${selected.length} 门·实跑 ${ranCount.n} 门（${selected.map((g) => g.flags[0]).join(' ')}）——#572 守卫已修（选=跑）`);


console.log('\n（数据源：src/15-tables.twee —— 改表即改此报告；伞 #21/#22 审计请跑本脚本）');
