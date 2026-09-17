# 门的行为化率台账（F2）

> **由 `scripts/report-gate-ledger.mjs` 生成**（`npm run report:gates:update`）——**不要手改**：`npm run report:gates:check` 会校验「文件与实况一致」，漂移即红（与 F6 同源纪律）。
>
> 判据（#247 F2）：常设机检分三种形态——
> **行为化**＝有**正例＋反例自证**（反例真会红）；**仅登记**＝只出报告、不做断言；**人工走查**＝需人判断。
> 纪律：**仅登记 / 未接线必须写明理由**（理由写在脚本的 `REASONS` 里，与代码同处一处评审）。
> 为什么要有这张表：本仓当日集齐四类「空判」——覆盖≠验收 / **反例空判** / **死开关**（#331）/ **原理不可达断言**（#338）。
> 台账的首要用途不是统计，而是**让「没有自证的门」在表上看得见**。

**严格行为化率（有自证）：90/104 = 86.5%** ｜ **有断言但缺自证：0**（＝下方工作清单）｜ 仅登记：0

| 门 | 类型 | 形态 | 自证 | 接线（npm test） | 理由（仅登记/未接线必填） |
|---|---|---|---|---|---|
| `audit:a11y` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:canon` | audit 开关 | 行为化 | ✅ | ✅ | 禁词/回流扫描：表格解析/§10 行覆盖/守林人代词/§9 双读（含 `allow` 白名单与 `/% %/` 剥注释）/§3.9 传说投放，**自证 6 例**（#342 第 8 波） |
| `audit:cave` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:checks` | audit 开关 | 行为化 | ✅ | — | 检定矩阵：天然位点概率（1/20，劣势平方）＋优势标记阈值＋**单调性不变量**（优势 ≥ 普通），自证 5 例（含浮点边界陷阱留注） |
| `audit:choices` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:combat` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:combat-dist` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:consequences` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:craft` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:dragon` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:echoes` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:economy` | audit 开关 | 行为化 | ✅ | — | 收支时间线：**报表算术即判据**（`delta:null` 不计入／按**章序**累计／序走最低），自证 3 例（#342 第 8 波；此前标「仅登记」，由形态对账查出并改正） |
| `audit:engine-story-free` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:gear` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:interact` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:investment` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:items` | audit 开关 | 行为化 | ✅ | — | 龙战伤害矩阵：**两条不变量**（减伤件更多 ⇒ 伤害不增；败次 0→2 ⇒ 伤害不减）＋自证 3 例（合成 I，不依赖真表） |
| `audit:literals` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:nosl` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:notes` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:npc` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:reads` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:roads` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:rules` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:sel` | audit 开关 | 行为化 | ✅ | — | 接线说明：--sel 只是 --nosl＋--gear 的便捷别名，链上跑的是更具体的两个 flag，故没有单独的 --sel --check（**形态是有判定的门**，此前台账误标「仅登记」，已由形态对账改正） |
| `audit:settle` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:sitedisc` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:slots` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:social` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:starbudget` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:state` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:status` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:systems` | audit 开关 | 行为化 | ✅ | ✅ | 机制×锚句门（**有判定**：机制必须有可感知锚句）——此前台账误标「仅登记」，由形态对账查出并改正；自证待补 |
| `audit:text` | audit 开关 | 行为化 | ✅ | ✅ | 文本载荷门（**有判定**：载荷阈值）——此前台账误标「仅登记」，由形态对账查出并改正；自证待补（密度 ratchet 在 --craft，本门是自己的载荷线） |
| `audit:tokens` | audit 开关 | 行为化 | ✅ | — | 与 --items 同族：伤害矩阵不变量 ＋ 自证（同一次改动） |
| `audit:truth` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:waves` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `scripts/report-cave-playability.mjs` | 报告脚本 | 行为化 | ✅ | — | **未接线（report-only）**：洞窟**玩法巡检**仪器（伞 `#687`）——沿真实「三选一」路线跑 N 局，逐局报「未捕获错误 / 点了没反应 / 静默产出 / 走不到终点」。它**刻意不是门**：它是抽样观测（未观测 ≠ 不存在），定成门就等于拿运气冒充「行为符合预期」（`#626` 口径）；且它读产物、起 JSDOM×N × 60 击，不适合进 PR 门。谁来跑：`node scripts/report-cave-playability.mjs [--runs=N]`（前置 `npm run build`）；何时跑：改洞窟交互/结算后、以及每次玩法缺陷收口前后（它就是 `#687` 三条 P0/P1 的发现工具）。门化的那一半已单独开票：`#693`（主交互路径门：点得动・不抛错・能走到终点）——本仪器在门落地后仍留作探路器。 |
| `scripts/report-copy-text.mjs` | 报告脚本 | 行为化 | ✅ | ✅ |  |
| `scripts/report-gate-ledger.mjs` | 报告脚本 | 行为化 | ✅ | ✅ | 本文件自身的自检（台账不腐），已入 npm test |
| `scripts/report-ledger-freshness.mjs` | 报告脚本 | 行为化 | ✅ | ✅ | **离线段已入 npm test**（`--ledger --check`：#297 对标台账行级新鲜度——行数栅栏/复核日期在期/触发条件非空/落点引用的门旗标与文件真实存在，7 例自证）；**网络段仍需 token**（#NNN 标记与 GitHub 真实状态一致），不塞主链路，由 `npm run report:freshness:check` 人工/定时跑 |
| `scripts/report-polarity-gap.mjs` | 报告脚本 | 行为化 | ✅ | — | **未接线（report-only）**：条件原子 × 极性的**覆盖缺口报告**（伞 `#626`／本票 `#628`）。它**刻意不是门**——观测是抽样的（未观测 ≠ 断言不存在），设成门就等于用抽样运气冒充「行为符合预期」（正是伞票要改掉的形态）。谁来跑：`npm run report:polarity`（前置 `npm run build`）；何时跑：裁决撤 soak 之前先看缺口、以及矩阵门（依赖 `#629`）落码前定行数。自证 8 例（注释遮蔽／`elseif`／widget 标记／`era` 两态／三档计数正反例／渲染点名），`--selftest` 能红。 |
| `scripts/report-rhythm.mjs` | 报告脚本 | 行为化 | ✅ | ✅ | R1/R1b/R2/正例 四例自证，已入 npm test |
| `scripts/report-selftest-validity.mjs` | 报告脚本 | 行为化 | ✅ | ✅ | **已入 npm test**（#474 接线）：静态扫描 `自证·` 是否「失败计入退出码」＋ 自增量是否「不崩」（TDZ/未声明）。接线前修掉剥离器**配对错位**（四条正则顺序剥 ⇒ 跨行贪婪吞代码 ⇒ `counters` 空 ⇒ 假阳性；**顺序治不了** ⇒ 改单扫描器按 JS 词法一次遮蔽注释/字符串/模板/正则，未闭合保守剥＋报诊断）。自证 18 例（V1×8＋V2×10），探针：删某门 `process.exit(1)` ⇒ 必报、退 1 |
| `scripts/report-two-state.mjs` | 报告脚本 | 行为化 | ✅ | — | **未接线（原型）**：两态**注入**原型（伞 `#626`／本票 `#629`）——证明目标段的每个条件站点**真/假两侧都能由真实渲染观测到**（状态注入 ＋ `Engine.play` 直达；真机口径同 `#491`）。它刻意不是门：门形态等伞票裁决（落点见 `#607`）。谁来跑：`npm run report:two-state`（前置 `npm run build`）；何时跑：矩阵门（依赖本票结论）落码前验证执行器可行性。自证 9 例（期望五类 text/noText/choice/noChoice/lands 各带反例 ＋ 两态归纳单态必 false），`--selftest` 能红。 |
| `test/attribution-gate.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/audit-gates-run.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/audit-golden.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | **已入 npm test**（#436 收编）：实测全量 **8.0s**（dragon 7.0s ＋ 其余每个 30–55ms ⇒ 无需子集；此前"24 个开关较慢"的估计不成立）。收编时逐条归因既有漂移（18 个开关：10 纯自证插入／3 含新不变量行／3 数值替换／1 `state`（#483）） |
| `test/browser.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | 需真实 Chrome（npm run browser / soak）；CI 由 soak job 跑 |
| `test/cave-drops.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/cave-longfight.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/cave-merchant.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/cave-roads.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/cave-route.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/choice-keys.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/codex-gating.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/codex-sink.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/combat-adv.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/core-story.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/coverage.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/econ-price.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/fatal-guard.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/fight-compat.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/fight-fields.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/fight-history.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/fight-seq.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/foe-5e.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/g3-evidence.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/gate-discovery.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/globals.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/import-side-effects.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/integrity.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/invariants.unit.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/itemmatrix.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/layering.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | 自证 16 例（模块依赖 / 点号 defines / 层间方向 / engine rank 派生与四条禁止边） |
| `test/lint-story.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/multi-story.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/notes-write.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/npc-venue.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/onetime-pickups.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/pc-defaults.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/premise-source.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/properties.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/render-all.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/reread.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/resolve-node.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/roll-binding.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/rules-claims.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/rules.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/saveload-inventory.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | 自证 6 例（含 widget 间接改状态） |
| `test/saveload.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | **自证按需跑**：`node test/saveload.mjs --selftest`（故障注入＝落档后人为扰动，断言比较器判红）；不塞主链的理由＝自证需完整导航（成本≈主跑 30s，收益不值） |
| `test/saveui.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/scenarios.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/shortfight-phases.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/silent-gate.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/siteinfo-sink.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/size-gate.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/smoke.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/social-lever.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/social-sink.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/store-keys.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/story-runtime.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/story-shape.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/walker.mjs` | 测试脚本 | 行为化 | — | — | 随机游走 soak（npm run soak）：耗时长、种子流非确定，不进 npm test |
