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
// 第二故事（`#460` 接入自检）此刻**跑不动**的引擎门 —— 已知阻塞，**清单带理由**：
//   都是同一个根因：**引擎里还有故事 1 的专属片段**（`src/10-core.twee` 的 `hallResult` widget 写
//   `whistle_taken`／`fog_fin` 等故事 1 的键）⇒ 任何第二故事在这两道上都是**假红**（判的不是它自己）。
//   ⇒ 收敛在 `#512`（引擎/故事边界）；**改好后请删本清单**（否则第二故事会带着一个已消失的"豁免"跑）。
//   ⚠️ 只对**非默认故事**生效（默认故事的判据逐字不变）。
const STORY2_BLOCKED = {
	consequences: '#512：引擎 10-core 的 hallResult widget 仍写故事 1 的键（whistle_taken）⇒ 第二故事的"桶分级"判的不是它自己',
	state: '#512：同上（引擎保留键/故事 1 的键未由第二故事登记；等引擎侧改成 `??=` 自建容器 ＋ 专属片段搬回故事）',
};
const blocked = (wantAll === false || arg('engine-only')) && storySlug !== DEFAULT_STORY_SLUG ? STORY2_BLOCKED : {};
const selected = GATES
	.filter((g) => arg('engine-only') ? g.flags.some((f) => AUDIT_ENGINE.includes(f)) : (wantAll || g.flags.some((f) => arg(f))))
	.filter((g) => !g.flags.some((f) => f in blocked));
for (const [f, why] of Object.entries(blocked)) if (GATES.some((g) => g.flags.includes(f))) console.log(`· 已知阻塞（跳过 --${f}）：${why}`);
if (arg('engine-only') && !selected.length) { console.error('✗ `--engine-only` 没有选中任何引擎门——检查 test-plan 的 AUDIT_ENGINE'); process.exit(2); }

// #366：以前「未知开关」或「只传 --check」会**一个门都不跑却退出 0**（假绿）。现在一律响亮报错。
if (unknown.length) {
	console.error(`✗ 未知开关：${unknown.map((f) => `--${f}`).join('、')}（可用：${[...known].sort().join(' ')}）`);
	process.exit(2);
}
if (!selected.length) {
	console.error('✗ 没有选中任何门——`--check` 是修饰符，需要同时给出至少一个门开关（或不带任何参数＝全跑）');
	process.exit(2);
}

for (const g of selected) g.run(ctx);


console.log('\n（数据源：src/15-tables.twee —— 改表即改此报告；伞 #21/#22 审计请跑本脚本）');
