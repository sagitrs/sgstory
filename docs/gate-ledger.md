# 门的行为化率台账（F2）

> **由 `scripts/report-gate-ledger.mjs` 生成**（`npm run report:gates:update`）——**不要手改**：`npm run report:gates:check` 会校验「文件与实况一致」，漂移即红（与 F6 同源纪律）。
>
> 判据（#247 F2）：常设机检分三种形态——
> **行为化**＝有**正例＋反例自证**（反例真会红）；**仅登记**＝只出报告、不做断言；**人工走查**＝需人判断。
> 纪律：**仅登记 / 未接线必须写明理由**（理由写在脚本的 `REASONS` 里，与代码同处一处评审）。
> 为什么要有这张表：本仓当日集齐四类「空判」——覆盖≠验收 / **反例空判** / **死开关**（#331）/ **原理不可达断言**（#338）。
> 台账的首要用途不是统计，而是**让「没有自证的门」在表上看得见**。
>
> **「自证」这一列量的是什么（口径 ＋ 量法 ＋ 已知边界 ✗）** —— 免得把 `✅` 读成“断言真会红” ✗：
> · 量的是「**信号出现在代码/字符串面**」✓：先用**全仓唯一遮蔽器**剥注释（`editor/lib/core/mask.mjs` ✓）⇒ **注释里写不算** ✗；
> · **字符串里的标签算** ✓（`t('🔴 反例：…')` ✓）⇒ 它 **≠** “断言真会红”✗ ⇒ 更强的证据要**探针**（票 `#908` ① ✓）；
> · **量法（可粘贴复跑 ✓）**：`node scripts/report-gate-ledger.mjs --selftest`（含 4 条 `hasSelfProof` 正反例 ✓）；
> · **缺自证的几行**（`—` ✓）：补一条**能假的负控制** ✓，或按 `#908` ① 登记探针 ✓ —— 名单见下方「工作清单」（**动态生成** ✗，不写死 ✓）。

**严格行为化率（有自证）：72/111 = 64.9%** ｜ **有断言但缺自证：38**（＝下方工作清单）｜ 仅登记：0
**探针（直接读数 ✓，不是"文件在不在"那种代理 ✗）：`✅` 28 项 ｜ `—` 未探 83 项（**上限 117** ✓ 超过即红 ✗；**调高它**是一次显式手改 ⇒ 靠评审拦 ✗，机器拦不住“手改上限”本身 ✓ —— 边界记在票 #908 内 ✗）｜ `✗` 不咬 0 项（**>0 即红** ✓）** —— 档位／清单：`node scripts/probe-gates.mjs --probe=fast` ✓（⑲：本轮覆盖到哪一档写在这行里 ✓）
**档位（tier，`#1070`）：PR 档（`--tier=fast`）只跑 `tier:'fast'` 的段；下列 **2 段**在 `full` 档（`npm run test:full`；nightly/main 由 `#1071` 接线）。**降频必须留痕** ✓（K5）——理由如下（单一权威＝`scripts/test-plan.mjs` 的 `FULL_REASONS` ✓）：**
| 段 | 实测成本 | 为什么不在 PR 档（理由 ＋ 代价） |
|---|---|---|
| `scripts-probe-gates-mjs-probe-fast` | 253.3s | **探针＝元判据**（量的是"门会不会红"✓）⇒ 属**周期性验证**，不是每次改动都要重跑 ✗。代价（实测）：**253.3s**（CI 日志 278.2s）＝ 全链串行 743s 的 **37%**（`#1070` 实测）✓。⚠️ **移出 PR 档 ⇒ PR 期不再验证"门会咬"** ✗ ⇒ **已接线**（`#1071`：`.github/workflows/full-tier.yml`，触发面 ＝ nightly ＋ `push: main` ＋ `workflow_dispatch` ✓；**失败即红** ✗不是 report-only ✓）；另：台账的探针列**依赖本段产出的** `build/probe-results.json`（gitignored）⇒ 本段不在 PR 档跑时，台账那一列由 `report-gate-ledger.mjs --allow-stale-probe` **显式降级**（打印"探针面跳过"，不静默 ✓）。 |
| `test-witness-trace-mjs` | 86.2s | **P4 见证件**（`#991` 的验收物：`walker --witness` 的轨迹够不够当见证 ✓）⇒ 属**发布／夜间**面 ✗；且**成本高**（实测 **86.2s**，CI 日志 91.1s ／ `cost` 字段旧值 **0.4** ＝ **228× 失真** ✗ —— 本次一并改正 ✓）。⚠️ **移出 PR 档 ⇒ PR 期不再验证"见证可复跑"** ⇒ **已接线**（同上 `full-tier.yml`；**失败即红** ✓）。 |

| 门 | 类型 | 形态 | 自证 | **探针** | 接线（npm test） | 理由（仅登记/未接线必填） |
|---|---|---|---|---|---|
| `audit:a11y` | audit 开关 | 行为化 | ✅ | — | ✅ |  |
| `audit:consequences` | audit 开关 | 行为化 | ✅ | — | ✅ |  |
| `audit:engine-story-free` | audit 开关 | 行为化 | ✅ | — | ✅ |  |
| `audit:literals` | audit 开关 | 行为化 | ✅ | — | ✅ |  |
| `audit:roads` | audit 开关 | 行为化 | ✅ | — | ✅ |  |
| `audit:sitedisc` | audit 开关 | 行为化 | ✅ | — | ✅ |  |
| `audit:slots` | audit 开关 | 行为化 | ✅ | — | ✅ |  |
| `audit:state` | audit 开关 | 行为化 | ✅ | — | ✅ |  |
| `audit:status` | audit 开关 | 行为化 | ✅ | — | ✅ |  |
| `audit:text` | audit 开关 | 行为化 | ✅ | — | ✅ | 文本载荷门（**有判定**：载荷阈值）——此前台账误标「仅登记」，由形态对账查出并改正；自证待补（密度 ratchet 在 --craft，本门是自己的载荷线） |
| `audit:waves` | audit 开关 | 行为化 | ✅ | — | ✅ |  |
| `scripts/report-copy-text.mjs` | 报告脚本 | 行为化 | ✅ | — | ✅ |  |
| `scripts/report-gate-ledger.mjs` | 报告脚本 | 行为化 | ✅ | ✅ | ✅ | 本文件自身的自检（台账不腐），已入 npm test |
| `scripts/report-ledger-freshness.mjs` | 报告脚本 | 行为化 | ✅ | — | ✅ | **离线段已入 npm test**（`--ledger --check`：#297 对标台账行级新鲜度——行数栅栏/复核日期在期/触发条件非空/落点引用的门旗标与文件真实存在，7 例自证）；**网络段仍需 token**（#NNN 标记与 GitHub 真实状态一致），不塞主链路，由 `npm run report:freshness:check` 人工/定时跑 |
| `scripts/report-page-coverage.mjs` | 报告脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `scripts/report-polarity-gap.mjs` | 报告脚本 | 行为化 | ✅ | — | — | **未接线（report-only）**：条件原子 × 极性的**覆盖缺口报告**（伞 `#626`／本票 `#628`）。它**刻意不是门**——观测是抽样的（未观测 ≠ 断言不存在），设成门就等于用抽样运气冒充「行为符合预期」（正是伞票要改掉的形态）。谁来跑：`npm run report:polarity`（前置 `npm run build`）；何时跑：裁决撤 soak 之前先看缺口、以及矩阵门（依赖 `#629`）落码前定行数。自证 8 例（注释遮蔽／`elseif`／widget 标记／`era` 两态／三档计数正反例／渲染点名），`--selftest` 能红。 |
| `scripts/report-rhythm.mjs` | 报告脚本 | 行为化 | ✅ | — | ✅ | R1/R1b/R2/正例 四例自证，已入 npm test |
| `scripts/report-selftest-validity.mjs` | 报告脚本 | 行为化 | ✅ | — | ✅ | **已入 npm test**（#474 接线）：静态扫描 `自证·` 是否「失败计入退出码」＋ 自增量是否「不崩」（TDZ/未声明）。接线前修掉剥离器**配对错位**（四条正则顺序剥 ⇒ 跨行贪婪吞代码 ⇒ `counters` 空 ⇒ 假阳性；**顺序治不了** ⇒ 改单扫描器按 JS 词法一次遮蔽注释/字符串/模板/正则，未闭合保守剥＋报诊断）。自证 18 例（V1×8＋V2×10），探针：删某门 `process.exit(1)` ⇒ 必报、退 1 |
| `scripts/report-two-state.mjs` | 报告脚本 | 行为化 | ✅ | — | — | **未接线（原型）**：两态**注入**原型（伞 `#626`／本票 `#629`）——证明目标段的每个条件站点**真/假两侧都能由真实渲染观测到**（状态注入 ＋ `Engine.play` 直达；真机口径同 `#491`）。它刻意不是门：门形态等伞票裁决（落点见 `#607`）。谁来跑：`npm run report:two-state`（前置 `npm run build`）；何时跑：矩阵门（依赖本票结论）落码前验证执行器可行性。自证 9 例（期望五类 text/noText/choice/noChoice/lands 各带反例 ＋ 两态归纳单态必 false），`--selftest` 能红。 |
| `test/attribution-gate.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/audit-gates-run.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/audit-golden.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ | **已入 npm test**（#436 收编）：实测全量 **8.0s**（dragon 7.0s ＋ 其余每个 30–55ms ⇒ 无需子集；此前"24 个开关较慢"的估计不成立）。收编时逐条归因既有漂移（18 个开关：10 纯自证插入／3 含新不变量行／3 数值替换／1 `state`（#483）） |
| `test/audit-scope-header.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/browser.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ | 需真实 Chrome（npm run browser / soak）；CI 由 soak job 跑 |
| `test/chargen-apply.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/chargen-equivalence.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/chargen-macros.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/choice-keys.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/ci-triggers.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | ✅ |  |
| `test/cli-surface.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/combat-adv.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/comment-face-split.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | ✅ |  |
| `test/comment-mask.mjs` | 测试脚本 | 行为化（缺自证） | — | ✅ | ✅ |  |
| `test/cond-keyform.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | ✅ |  |
| `test/contract-compat.mjs` | 测试脚本 | 行为化（缺自证） | — | ✅ | ✅ |  |
| `test/contract-version.mjs` | 测试脚本 | 行为化（缺自证） | — | ✅ | ✅ |  |
| `test/core-story.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/coverage.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/dialect.mjs` | 测试脚本 | 行为化（缺自证） | — | ✅ | ✅ |  |
| `test/docs-read-path.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | ✅ |  |
| `test/equiv-scratch.mjs` | 测试脚本 | 行为化（缺自证） | — | ✅ | ✅ |  |
| `test/event-graph.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | ✅ |  |
| `test/fatal-guard.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/fight-seq.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/focus-after-nav.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | ✅ |  |
| `test/g3-evidence.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/gate-discovery.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/gen-segment-syntax.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/generated-family.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/globals.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/import-side-effects.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/integrity.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/invariants.unit.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/k4-args.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/k4-references.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | ✅ |  |
| `test/layering.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ | 自证 **33** 条断言（**量法**：`node test/layering.mjs --selftest` 输出里 `✓`/`✗` 行计数）；覆盖面＝模块依赖（`cases` 11 项，含 `#893` 两层登记的三条正反例）/ 点号 defines / 层间方向 / engine rank 派生与四条禁止边 |
| `test/lint-scratch.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | ✅ |  |
| `test/lint-story.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/md-visible-faces.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/meta-source.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/multi-story.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | ✅ |  |
| `test/new-story-fixture.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/npc-venue.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/onetime-pickups.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/passages-assemble.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/pc-defaults.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/plan-needs.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | ✅ |  |
| `test/premise-source.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/properties.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/prose-vocabulary.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | ✅ |  |
| `test/readkey-family.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/render-all.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/repo-shape.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | ✅ |  |
| `test/reread.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/roll-binding.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/rules-claims.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/rules.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/saveload-inventory.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ | 自证 6 例（含 widget 间接改状态） |
| `test/saveload.mjs` | 测试脚本 | 行为化 | — | — | ✅ | **自证按需跑**：`node test/saveload.mjs --selftest`（故障注入＝落档后人为扰动，断言比较器判红）；不塞主链的理由＝自证需完整导航（成本≈主跑 30s，收益不值） |
| `test/saveui.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/scenarios.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/serve-editor.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | ✅ |  |
| `test/silent-gate.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/siteinfo-sink.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/size-gate.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/smoke.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/social-lever.mjs` | 测试脚本 | 行为化（缺自证） | — | ✅ | ✅ |  |
| `test/social-sink.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/state-diagnose.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | ✅ |  |
| `test/store-keys.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/story-ci.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | ✅ | **自证的归位（`#1056`）**：本件的 `--selftest` **不是入口** ✗ —— 它是**真断言的载荷**（`cli(['--selftest'])` 测壳的旗标面 ✓）⇒ 裸调与 `--selftest` 输出逐字节相同 ✓。⇒ **不接也不删**（`#1031` 口径 ✓）：硬接无意义旗标 ＝ 为凑绿而接线 ✗、删字符串 ＝ 拆真断言 ✗。真断言面由**裸调段**（`test-story-ci-mjs`）执行 ✓ —— `test-plan` 里那个 `-selftest` id 跑的就是裸调 ✓。 |
| `test/story-codeface.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/story-runtime.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/story-shape.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/untracked-guard.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | ✅ |  |
| `test/walker.mjs` | 测试脚本 | 行为化（缺自证） | — | — | — | 随机游走 soak（npm run soak）：耗时长、种子流非确定，不进 npm test |
| `test/web-compile.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/web-diagnose-view.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/web-diagnose-wire.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/web-diagnose.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/web-event-graph.mjs` | 测试脚本 | 行为化（缺自证） | — | ✅ | ✅ |  |
| `test/web-events.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/web-export.mjs` | 测试脚本 | 行为化（缺自证） | — | ✅ | ✅ |  |
| `test/web-form.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/web-loader.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/web-new-package.mjs` | 测试脚本 | 行为化（缺自证） | — | — | ✅ |  |
| `test/web-preview.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/web-read-faces.mjs` | 测试脚本 | 行为化（缺自证） | — | ✅ | ✅ |  |
| `test/web-rule-rows.mjs` | 测试脚本 | 行为化（缺自证） | — | ✅ | ✅ |  |
| `test/web-save.mjs` | 测试脚本 | 行为化 | ✅ | — | ✅ |  |
| `test/witness-trace.mjs` | 测试脚本 | 行为化（缺自证） | — | ✅ | ✅ |  |

## F2 工作清单：有断言但**缺自证**（38 项）

> 这些门**在跑、也在断言**，但从没被证明「反例会红」——本仓当日四类空判（覆盖≠验收／反例空判／死开关 #331／原理不可达 #338）都出自这一类。
> 补法：给该门加一个**合成反例**用例（正例＋反例），并在本脚本的 `REASONS` 里改标 `行为化`。

- `scripts/report-page-coverage.mjs`（报告脚本）
- `test/audit-scope-header.mjs`（测试脚本）
- `test/chargen-apply.mjs`（测试脚本）
- `test/chargen-equivalence.mjs`（测试脚本）
- `test/chargen-macros.mjs`（测试脚本）
- `test/comment-mask.mjs`（测试脚本）
- `test/contract-compat.mjs`（测试脚本）
- `test/contract-version.mjs`（测试脚本）
- `test/coverage.mjs`（测试脚本）
- `test/dialect.mjs`（测试脚本）
- `test/equiv-scratch.mjs`（测试脚本）
- `test/fatal-guard.mjs`（测试脚本）
- `test/g3-evidence.mjs`（测试脚本）
- `test/gen-segment-syntax.mjs`（测试脚本）
- `test/generated-family.mjs`（测试脚本）
- `test/md-visible-faces.mjs`（测试脚本）
- `test/meta-source.mjs`（测试脚本）
- `test/new-story-fixture.mjs`（测试脚本）
- `test/onetime-pickups.mjs`（测试脚本）
- `test/pc-defaults.mjs`（测试脚本）
- `test/properties.mjs`（测试脚本）
- `test/readkey-family.mjs`（测试脚本）
- `test/render-all.mjs`（测试脚本）
- `test/roll-binding.mjs`（测试脚本）
- `test/saveui.mjs`（测试脚本）
- `test/silent-gate.mjs`（测试脚本）
- `test/smoke.mjs`（测试脚本）
- `test/social-lever.mjs`（测试脚本）
- `test/walker.mjs`（测试脚本）
- `test/web-diagnose-view.mjs`（测试脚本）
- `test/web-diagnose-wire.mjs`（测试脚本）
- `test/web-diagnose.mjs`（测试脚本）
- `test/web-event-graph.mjs`（测试脚本）
- `test/web-export.mjs`（测试脚本）
- `test/web-new-package.mjs`（测试脚本）
- `test/web-read-faces.mjs`（测试脚本）
- `test/web-rule-rows.mjs`（测试脚本）
- `test/witness-trace.mjs`（测试脚本）
