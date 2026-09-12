// #28 表驱动审计：node scripts/audit.mjs —— 查 window.Game 三表产出伞 #21/#22 报表，
// 替代一次性 jsdom 探查脚本。改表即改报告，秒级重算（无需启动场景）。
// 用法：node scripts/audit.mjs [--canon] [--checks] [--economy] [--items] [--dragon] [--combat] [--social]（缺省全输出）
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createContext } from './audit/context.mjs';

// #316 拆分第 1 步：加载区（源文件发现 / vm 直载 [script] / 预设 / 段落索引 / CLI）已抽到
// scripts/audit/context.mjs——各门模块的共同依赖。此处仅做绑定，**不改任何加载语义**。
const ctx = createContext();
const { SRC_FILES, Rules, Pc, Chargen, ChargenPresets, Game, presets, passageSrc, passageRaw, passageTags, arg, wantAll } = ctx;

// ── ⓪ D1 真相可达性（#35）：命题 × 通路，锚点机检 ──
import { GATES } from './audit/registry.mjs';
import { makeShared } from './audit/lib/shared.mjs';
Object.assign(ctx, makeShared(ctx));

for (const g of GATES) {
	if (wantAll || g.flags.some((f) => arg(f))) g.run(ctx);
}


console.log('\n（数据源：src/15-tables.twee —— 改表即改此报告；伞 #21/#22 审计请跑本脚本）');
