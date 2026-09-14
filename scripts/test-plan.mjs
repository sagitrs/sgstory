// CI 测试计划（#381）：**单一权威**——`npm test`、并行跑器、F2 台账的「是否接线」判定全部读这里。
//
// 为什么要有这个文件：此前「跑哪些段」只存在于 package.json 的 test 脚本里（一长串 `&&`），
// 于是 ① 只能串行跑（CI 4 核也只用一个）② F2 台账靠**字符串匹配**那段脚本来判断门有没有接线。
// 计划与之解耦后：跑器可并行、台账仍能判定接线（见 report-gate-ledger.mjs——并且它会校验
// `npm test` 真的调用了跑器，防止「计划写了但没人跑」的幻影门）。
//
// 字段：
//   id    — 稳定标识（--only 用）
//   phase — `build` 先跑且**独占**（后面所有段都可能读 dist），其余段可并行
//   cost  — 本机实测秒数（2026-09-12，32 核；仅用于打印串行合计与并行预估，不参与判定）
//   needs — **前序段的产物依赖**（#381 补）：本段要读某段落盘的产物时写它的 id。
//           调度器保证「前序全部成功」才起跑；前序红了则本段**标 skipped**（不白跑、也不假绿）。
//   cmd   — 与旧链**逐字一致**，便于对照与回退（`npm run test:serial`）
//
// ⚠️ 产物依赖面（改测试的落盘/读取时同步这里；CI 曾因漏掉它而红过一轮）：
//   build/coverage-render.json · build/coverage-links.json        ← test/render-all.mjs
//   build/coverage-scenarios.json · coverage-links-scenarios.json · route-traces.json ← test/scenarios.mjs
//   ├─ test/coverage.mjs          读上述 4 个覆盖文件 → needs render-all + scenarios
//   └─ scripts/report-rhythm.mjs  读 route-traces.json（连 `--selftest` 也用它做正例）→ needs scenarios
export const SEGMENTS = [
	{ id: "build-mjs", phase: 'build', cost: 3, cmd: "node build.mjs" },
	{ id: "test-integrity-mjs", phase: 'test', cost: 0, cmd: "node test/integrity.mjs" },
	{ id: "scripts-audit-mjs-truth-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --truth --check" },
	{ id: "scripts-audit-mjs-canon-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --canon --check" },
	{ id: "scripts-audit-mjs-echoes-check", phase: 'test', cost: 0.1, cmd: "node scripts/audit.mjs --echoes --check" },
	{ id: "scripts-audit-mjs-consequences-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --consequences --check" },
	{ id: "scripts-audit-mjs-starbudget-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --starbudget --check" },
	{ id: "scripts-audit-mjs-a11y-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --a11y --check" },
	{ id: "scripts-audit-mjs-choices-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --choices --check" },
	{ id: "scripts-audit-mjs-interact-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --interact --check" },
	{ id: "scripts-audit-mjs-nosl-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --nosl --check" },
	{ id: "scripts-audit-mjs-gear-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --gear --check" },
	{ id: "scripts-audit-mjs-combat-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --combat --check" },
	{ id: "scripts-audit-mjs-sitedisc-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --sitedisc --check" },
	{ id: "scripts-audit-mjs-investment-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --investment --check" },
	{ id: "scripts-audit-mjs-social-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --social --check" },
	{ id: "scripts-audit-mjs-systems-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --systems --check" },
	{ id: "scripts-audit-mjs-text-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --text --check" },
	{ id: "scripts-audit-mjs-craft-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --craft --check" },
	{ id: "scripts-audit-mjs-dragon-check", phase: 'test', cost: 6.2, cmd: "node scripts/audit.mjs --dragon --check" },
	{ id: "scripts-audit-mjs-npc-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --npc --check" },
	{ id: "scripts-audit-mjs-state-check", phase: 'test', cost: 0.1, cmd: "node scripts/audit.mjs --state --check" },
	{ id: "scripts-audit-mjs-literals-check", phase: 'test', cost: 0, cmd: "node scripts/audit.mjs --literals --check" },
	{ id: "test-rules-mjs", phase: 'test', cost: 1.6, cmd: "node test/rules.mjs" },
	{ id: "test-properties-mjs", phase: 'test', cost: 5.6, cmd: "node test/properties.mjs" },
	{ id: "test-invariants-unit-mjs", phase: 'test', cost: 0, cmd: "node test/invariants.unit.mjs" },
	{ id: "test-render-all-mjs", phase: 'test', cost: 8.9, cmd: "node test/render-all.mjs" },
	{ id: "test-rules-claims-mjs-selftest", phase: 'test', cost: 15.6, cmd: "node test/rules-claims.mjs --selftest" },
	{ id: "test-rules-claims-mjs", phase: 'test', cost: 15.6, cmd: "node test/rules-claims.mjs" },
	{ id: "test-saveui-mjs", phase: 'test', cost: 10.2, cmd: "node test/saveui.mjs" },
	{ id: "test-saveload-inventory-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/saveload-inventory.mjs --selftest" },
	{ id: "test-saveload-inventory-mjs", phase: 'test', cost: 0, cmd: "node test/saveload-inventory.mjs" },
	{ id: "test-layering-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/layering.mjs --selftest" },
	{ id: "test-layering-mjs", phase: 'test', cost: 0, cmd: "node test/layering.mjs" },
	{ id: "test-saveload-mjs", phase: 'test', cost: 30.7, cmd: "node test/saveload.mjs" },
	{ id: "test-combat-adv-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/combat-adv.mjs --selftest" },
	{ id: "test-combat-adv-mjs", phase: 'test', cost: 15.6, cmd: "node test/combat-adv.mjs" },
	{ id: "test-g3-evidence-mjs", phase: 'test', cost: 15.7, cmd: "node test/g3-evidence.mjs" },
	{ id: "test-reread-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/reread.mjs --selftest" },
	{ id: "test-reread-mjs", phase: 'test', cost: 0, cmd: "node test/reread.mjs" },
	{ id: "test-smoke-mjs", phase: 'test', cost: 7.5, cmd: "node test/smoke.mjs" },
	// #484 回归：把产品的 rAF 人为推迟 800ms（模拟高负载尾部事件）⇒ smoke 仍须通过
	// （这就是"等产品自己的时钟（1 个 rAF tick）"这个修法的回归证据；不注入时是一次普通 smoke）
	{ id: "test-smoke-mjs-raf-delayed", phase: 'test', cost: 8, cmd: "SG_RAF_DELAY_MS=800 node test/smoke.mjs" },
	// #441 切片③④：多故事产物 + 书架页 + 故事页字体前缀（纯函数自证 + 真实产物检查）
	{ id: "test-multi-story-mjs", phase: 'test', cost: 0.1, cmd: "node test/multi-story.mjs" },
	// #458 前置：**六处同步**校验（源文件/ORDER/MODULES/故事清单/常量声明/聚合返回）＋单根假设清点
	{ id: "scripts-move-precheck-mjs", phase: 'test', cost: 0.2, cmd: "node scripts/move-precheck.mjs" },
	{ id: "scripts-move-precheck-mjs-selftest", phase: 'test', cost: 0.1, cmd: "node scripts/move-precheck.mjs --selftest" },
	// #436 收编（#493 的硬前置）：audit golden 基线。实测**全量仅 8.0s**（dragon 7.0s ＋ 其余每个 30–55ms）
	// ⇒ 不需要"便宜子集"，整段进链；自证单列（比对函数自身的 10 例）
	{ id: "test-audit-golden-mjs", phase: 'test', cost: 8, cmd: "node test/audit-golden.mjs" },
	{ id: "test-audit-golden-mjs-selftest", phase: 'test', cost: 0.1, cmd: "node test/audit-golden.mjs --selftest" },
	// #457：文案计数**规则**自证（R1–R5；数字是 #459 `Sg.story.copy()` 迁移的基线）
	{ id: "scripts-report-copy-text-mjs-selftest", phase: 'test', cost: 0.1, cmd: "node scripts/report-copy-text.mjs --selftest" },
	// 浏览器验收本体在 CI 的 soak job 跑（需 Chrome）；**守卫逻辑的自证不需要 Chrome**，故进主链
	{ id: "test-browser-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/browser.mjs --selftest" },
	{ id: "test-globals-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/globals.mjs --selftest" },
	{ id: "test-choice-keys-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/choice-keys.mjs --selftest" },
	// #407 D9①：选项前提可溯源（#404 的实例）——`--strict` 是红证入口
	{ id: "test-premise-source-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/premise-source.mjs --selftest" },
	// #407 D9④：场合面（NPC 登记簿须有 venue/role；当前登记模式报告）
	{ id: "test-npc-venue-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/npc-venue.mjs --selftest" },
	{ id: "test-npc-venue-mjs", phase: 'test', cost: 0, cmd: "node test/npc-venue.mjs" },
	{ id: "test-premise-source-mjs", phase: 'test', cost: 0, cmd: "node test/premise-source.mjs" },
	{ id: "test-choice-keys-mjs", phase: 'test', cost: 9, cmd: "node test/choice-keys.mjs" },
	{ id: "test-globals-mjs", phase: 'test', cost: 0, cmd: "node test/globals.mjs" },
	{ id: "test-scenarios-mjs", phase: 'test', cost: 23.6, cmd: "node test/scenarios.mjs" },
	{ id: "scripts-report-rhythm-mjs-selftest", phase: 'test', cost: 0.2, needs: ['test-scenarios-mjs'], cmd: "node scripts/report-rhythm.mjs --selftest" },
	{ id: "scripts-report-rhythm-mjs-check", phase: 'test', cost: 0, needs: ['test-scenarios-mjs'], cmd: "node scripts/report-rhythm.mjs --check" },
	{ id: "test-fatal-guard-mjs", phase: 'test', cost: 18.7, cmd: "node test/fatal-guard.mjs" },
	{ id: "test-onetime-pickups-mjs", phase: 'test', cost: 18.1, cmd: "node test/onetime-pickups.mjs" },
	{ id: "test-roll-binding-mjs", phase: 'test', cost: 0, cmd: "node test/roll-binding.mjs" },
	{ id: "test-codex-gating-mjs", phase: 'test', cost: 0, cmd: "node test/codex-gating.mjs" },
	// #462：存储缝（键构造单一落点 · 两作用域 · 幂等迁移）
	{ id: 'test-store-keys-mjs-selftest', phase: 'test', cost: 0, cmd: 'node test/store-keys.mjs --selftest' },
	{ id: 'test-store-keys-mjs', phase: 'test', cost: 0, cmd: 'node test/store-keys.mjs' },
	// #441-A：结算可脱离浏览器驱动（rng 可注入 · rollSite 纯 · present 不写状态）
	{ id: 'test-resolve-node-mjs-selftest', phase: 'test', cost: 0, cmd: 'node test/resolve-node.mjs --selftest' },
	{ id: 'test-resolve-node-mjs', phase: 'test', cost: 0, cmd: 'node test/resolve-node.mjs' },
	// #436 原范围 1：笔记模型门已从 `test/notes-model.mjs` **升级为 audit 门**（可单跑 `--notes`），
	// 一个段替代原来的 `-selftest` ＋ 主跑两段（自证在门内，与其它门一致）。
	{ id: 'scripts-audit-mjs-notes-check', phase: 'test', cost: 0, cmd: 'node scripts/audit.mjs --notes --check' },
	// #436 原范围 3：**玩家可见正文漂移**接进计划（`#422-D`／阶段 2 的判据是「漂移＝0」）。
	// 基线用 `origin/main`（CI 里可达：工作流有 `git fetch origin main --depth=1`；那个 92f3d04
	// 迁移基线在浅克隆里取不到——脚本现在会**明确报错**而不是把"读不到"当成"没变化"）。
	// 报告落 `build/`（gitignored）⇒ CI 不脏树；本地想看文档版就按 README 直接跑脚本（默认写 docs/）。
	{ id: 'scripts-ui-migration-diff-selftest', phase: 'test', cost: 0, cmd: 'node scripts/ui-migration-diff.mjs --selftest' },
	{ id: 'scripts-ui-migration-diff-check', phase: 'test', cost: 0.4, cmd: 'node scripts/ui-migration-diff.mjs --check --baseline=origin/main --out=build/ui-migration-diff.md' },
	// main 侧新增（#360 交涉筹码按类型分派，guest-1）：reb 冲突时按「计划＝单一权威」加在这里
	{ id: "test-social-lever-mjs", phase: 'test', cost: 0, cmd: "node test/social-lever.mjs" },
	{ id: "test-coverage-mjs", phase: 'test', cost: 0, needs: ['test-render-all-mjs', 'test-scenarios-mjs'], cmd: "node test/coverage.mjs" },
	{ id: "test-size-gate-mjs-selftest", phase: 'test', cost: 0, cmd: "node test/size-gate.mjs --selftest" },
	{ id: "test-size-gate-mjs", phase: 'test', cost: 0, cmd: "node test/size-gate.mjs" },
	{ id: "test-silent-gate-mjs", phase: 'test', cost: 0, cmd: "node test/silent-gate.mjs" },
	{ id: "scripts-report-ledger-freshness-mjs-selftest", phase: 'test', cost: 0, cmd: "node scripts/report-ledger-freshness.mjs --selftest" },
	{ id: "scripts-report-ledger-freshness-mjs-ledger-check", phase: 'test', cost: 0, cmd: "node scripts/report-ledger-freshness.mjs --ledger --check" },
	{ id: "scripts-report-gate-ledger-mjs-selftest", phase: 'test', cost: 0, cmd: "node scripts/report-gate-ledger.mjs --selftest" },
	{ id: "scripts-report-gate-ledger-mjs", phase: 'test', cost: 0, cmd: "node scripts/report-gate-ledger.mjs" },
	// #474 接线：`自证·` 必须「失败计入退出码」且「不崩」（静态扫描 scripts/ ＋ test/ 共 77 文件，0 致命）
	{ id: "scripts-report-selftest-validity-mjs", phase: 'test', cost: 0.2, cmd: "node scripts/report-selftest-validity.mjs" },
	// #459／#482：故事「新机制声明表」的形状门（六条可机检点 · 各带正反自证）
	{ id: "test-story-shape-mjs", phase: 'test', cost: 0.1, cmd: "node test/story-shape.mjs" },
	// #434 阶段 3：`Sg.notes.add()` 的行为门（幂等 · 双写 · 双读 · 多源 setPath 护栏）
	{ id: "test-notes-write-mjs", phase: 'test', cost: 0.2, cmd: "node test/notes-write.mjs" },
	// #486（S1）：槽位/耐久**机制**门（引擎门——判据来自声明表，不读故事散文）：
	// 两态语义 · 部位命中分布 · 损坏阈值 · 兼容降级 · 「声明面 ≤ 实现面」
	{ id: 'scripts-audit-mjs-slots-check', phase: 'test', cost: 0, cmd: 'node scripts/audit.mjs --slots --check' },
];

// ── 门的**两层化**（#436-a）：引擎门 / 故事门 ──────────────────────────────
// 判据不是"哪个文件"，而是「**判据从哪来**」：
//   · **引擎门**：判据与故事内容无关（拿清单/声明式表当输入）⇒ 换故事只换输入 ⇒ 第二故事能直接跑；
//   · **故事门**：判据来自**本故事的散文与内容**（锚句/段落名/路线/NPC 动机）⇒ 第二故事会被判红。
// 为什么需要它：`#441-F`（第 1/4 步出口＝第二故事能接）的出口判据就是「**只跑引擎门**」；
//   若把 24 道门全跑，第二故事一定会被本故事的判据判红。
//
// 口径（可机检，且**反沉默**）：
//   ① `AUDIT_ENGINE ∪ AUDIT_STORY` 必须**恰好等于**计划里出现的所有 `--<flag> --check` 段（多一个、
//      少一个都红）——新增门忘了归层会被 `validateLayers()` 当场抓住；
//   ② 同一个 flag 不许同时出现在两层（歧义即红）；
//   ③ 未分类的**非门段**一律按 `story` 处理（**保守**：绝不误入引擎门集合 ⇒ `--engine-only` 只多不少地安全）；
//      要把它划进引擎门，就显式加进 `ENGINE_EXTRA`（一行）。
// 注：`a11y` 也是引擎门，但**尚未接线**（F2 台账：未接线 7 道）⇒ 接线时加进本表（否则 `validateLayers()` 的僵尸声明会报红——这正是想要的行为）
export const AUDIT_ENGINE = ['consequences', 'literals', 'state', 'sitedisc', 'text', 'slots'];   // #486：slots 是引擎门（输入＝声明表）
export const AUDIT_STORY = ['truth', 'canon', 'echoes', 'starbudget', 'choices', 'combat', 'craft', 'dragon', 'notes',
	'gear', 'interact', 'investment', 'nosl', 'npc', 'social', 'systems'];
// 非门段里**与故事内容无关**的那些（构建 / 构建期 lint / 产物守卫）：显式登记，不放宽默认
export const ENGINE_EXTRA = ['build-mjs',
	'test-layering-mjs-selftest', 'test-layering-mjs', 'test-globals-mjs', 'test-silent-gate-mjs',
	'test-size-gate-mjs-selftest', 'test-size-gate-mjs'];

// 段 → 层。`--<flag> --check` 形式的段从 flag 表推；其余：在 `ENGINE_EXTRA` 里 ⇒ engine，否则 story。
export const segmentLayer = (seg) => {
	const m = auditFlag(seg);
	if (m) return AUDIT_ENGINE.includes(m) ? 'engine' : 'story';
	if (m && (AUDIT_ENGINE.includes(m[1]) || AUDIT_STORY.includes(m[1]))) return AUDIT_ENGINE.includes(m[1]) ? 'engine' : 'story';
	return ENGINE_EXTRA.includes(seg.id) ? 'engine' : 'story';
};

// 只认 **`scripts/audit.mjs` 的门段**的 flag —— 别把 `report-ledger-freshness --ledger --check`
// 这类同名形态误当门（本 PR 的校验第一次跑就抓到过这个假阳性）
export const auditFlag = (seg) => {
	const cmd = seg.cmd ?? '';
	if (!/scripts\/audit\.mjs\b/.test(cmd)) return null;
	const m = /--([a-z-]+)\s+--check\b/.exec(cmd);
	return m ? m[1] : null;
};

// 计划校验（跑器起跑前调用；返回问题清单，空＝通过）
export const validateLayers = (plan = SEGMENTS) => {
	const problems = [];
	const dup = AUDIT_ENGINE.filter((f) => AUDIT_STORY.includes(f));
	if (dup.length) problems.push(`层表歧义：${dup.join('、')} 同时在 engine 与 story`);
	// 计划里真实的 audit 段 ⇒ 必须**恰好**被两层覆盖
	const planFlags = new Set();
	for (const s of plan) { const f = auditFlag(s); if (f) planFlags.add(f); }
	const declared = new Set([...AUDIT_ENGINE, ...AUDIT_STORY]);
	for (const f of planFlags) if (!declared.has(f)) problems.push(`未归层：计划里的 \`--${f} --check\` 段没有任何层（新增门请加进 AUDIT_ENGINE／AUDIT_STORY）`);
	for (const f of declared) if (!planFlags.has(f)) problems.push(`僵尸层声明：\`${f}\` 在层表里，但计划里没有对应段（删段时请同步层表）`);
	for (const id of ENGINE_EXTRA) if (!plan.some((s) => s.id === id)) problems.push(`僵尸 ENGINE_EXTRA 条目：${id} 不在计划里`);
	return problems;
};

export const testPlan = () => SEGMENTS;
// **旧格式**：把计划拼回 `&&` 串（对照/调试用）
export const planChain = () => SEGMENTS.map((s) => s.cmd).join(' && ');
