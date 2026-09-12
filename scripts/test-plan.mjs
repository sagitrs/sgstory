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
	{ id: 'test-notes-model-mjs-selftest', phase: 'test', cost: 0, cmd: 'node test/notes-model.mjs --selftest' },
	{ id: 'test-notes-model-mjs', phase: 'test', cost: 0, cmd: 'node test/notes-model.mjs' },
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
];

export const testPlan = () => SEGMENTS;
// **旧格式**：把计划拼回 `&&` 串（对照/调试用）
export const planChain = () => SEGMENTS.map((s) => s.cmd).join(' && ');
