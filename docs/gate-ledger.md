# 门的行为化率台账（F2）

> **由 `scripts/report-gate-ledger.mjs` 生成**（`npm run report:gates:update`）——**不要手改**：`npm run report:gates:check` 会校验「文件与实况一致」，漂移即红（与 F6 同源纪律）。
>
> 判据（#247 F2）：常设机检分三种形态——
> **行为化**＝有**正例＋反例自证**（反例真会红）；**仅登记**＝只出报告、不做断言；**人工走查**＝需人判断。
> 纪律：**仅登记 / 未接线必须写明理由**（理由写在脚本的 `REASONS` 里，与代码同处一处评审）。
> 为什么要有这张表：本仓当日集齐四类「空判」——覆盖≠验收 / **反例空判** / **死开关**（#331）/ **原理不可达断言**（#338）。
> 台账的首要用途不是统计，而是**让「没有自证的门」在表上看得见**。

**严格行为化率（有自证）：20/53 = 37.7%** ｜ **有断言但缺自证：18**（＝下方工作清单）｜ 仅登记：4

| 门 | 类型 | 形态 | 自证 | 接线（npm test） | 理由（仅登记/未接线必填） |
|---|---|---|---|---|---|
| `audit:a11y` | audit 开关 | 行为化（缺自证） | — | ✅ |  |
| `audit:canon` | audit 开关 | 行为化（缺自证） | — | ✅ | 禁词/回流扫描（断言存在，但**没有自证**——已列入 F2 工作清单；§10 已裁剪项不得回流） |
| `audit:checks` | audit 开关 | 仅登记 | — | — | 检定位点总表（覆盖性由 --sitedisc/--interact 族门承担） |
| `audit:choices` | audit 开关 | 行为化（缺自证） | — | ✅ |  |
| `audit:combat` | audit 开关 | 行为化（缺自证） | — | ✅ |  |
| `audit:consequences` | audit 开关 | 行为化（缺自证） | — | ✅ |  |
| `audit:craft` | audit 开关 | 行为化（缺自证） | — | ✅ |  |
| `audit:dragon` | audit 开关 | 行为化（缺自证） | — | ✅ |  |
| `audit:echoes` | audit 开关 | 行为化（缺自证） | — | ✅ |  |
| `audit:economy` | audit 开关 | 仅登记 | — | — | 收支时间线是人读报表（数值本身由 --checks/--gear 门覆盖） |
| `audit:gear` | audit 开关 | 行为化（缺自证） | — | ✅ |  |
| `audit:interact` | audit 开关 | 行为化（缺自证） | — | ✅ |  |
| `audit:investment` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:items` | audit 开关 | 仅登记 | — | — | 龙战伤害矩阵是人读对照表（战斗数值由 --dragon 分布门覆盖） |
| `audit:literals` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:nosl` | audit 开关 | 行为化（缺自证） | — | ✅ |  |
| `audit:npc` | audit 开关 | 行为化（缺自证） | — | ✅ |  |
| `audit:sel` | audit 开关 | 行为化（缺自证） | — | — | 接线说明：--sel 只是 --nosl＋--gear 的便捷别名，链上跑的是更具体的两个 flag，故没有单独的 --sel --check（**形态是有判定的门**，此前台账误标「仅登记」，已由形态对账改正） |
| `audit:sitedisc` | audit 开关 | 行为化（缺自证） | — | ✅ |  |
| `audit:social` | audit 开关 | 行为化（缺自证） | — | ✅ |  |
| `audit:starbudget` | audit 开关 | 行为化（缺自证） | — | ✅ |  |
| `audit:state` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `audit:systems` | audit 开关 | 行为化（缺自证） | — | ✅ | 机制×锚句门（**有判定**：机制必须有可感知锚句）——此前台账误标「仅登记」，由形态对账查出并改正；自证待补 |
| `audit:text` | audit 开关 | 行为化（缺自证） | — | ✅ | 文本载荷门（**有判定**：载荷阈值）——此前台账误标「仅登记」，由形态对账查出并改正；自证待补（密度 ratchet 在 --craft，本门是自己的载荷线） |
| `audit:tokens` | audit 开关 | 仅登记 | — | — | 与 --items 同族：词法/道具矩阵报表 |
| `audit:truth` | audit 开关 | 行为化 | ✅ | ✅ |  |
| `scripts/report-gate-ledger.mjs` | 报告脚本 | 行为化 | ✅ | ✅ | 本文件自身的自检（台账不腐），已入 npm test |
| `scripts/report-ledger-freshness.mjs` | 报告脚本 | 行为化 | ✅ | ✅ | **离线段已入 npm test**（`--ledger --check`：#297 对标台账行级新鲜度——行数栅栏/复核日期在期/触发条件非空/落点引用的门旗标与文件真实存在，7 例自证）；**网络段仍需 token**（#NNN 标记与 GitHub 真实状态一致），不塞主链路，由 `npm run report:freshness:check` 人工/定时跑 |
| `scripts/report-rhythm.mjs` | 报告脚本 | 行为化 | ✅ | ✅ | R1/R1b/R2/正例 四例自证，已入 npm test |
| `test/audit-golden.mjs` | 测试脚本 | 行为化 | ✅ | — | 按需跑（npm run audit:golden）：拆/改 audit 时用；全量跑 24 个开关较慢 |
| `test/browser.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | 需真实 Chrome（npm run browser / soak）；CI 由 soak job 跑 |
| `test/combat-adv.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/coverage.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/fatal-guard.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/g3-evidence.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/integrity.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/invariants.unit.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/layering.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | 自证 5 例 |
| `test/onetime-pickups.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/properties.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/render-all.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/reread.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/rules-claims.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/rules.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/saveload-inventory.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | 自证 6 例（含 widget 间接改状态） |
| `test/saveload.mjs` | 测试脚本 | 行为化 | ✅ | ✅ | **自证按需跑**：`node test/saveload.mjs --selftest`（故障注入＝落档后人为扰动，断言比较器判红）；不塞主链的理由＝自证需完整导航（成本≈主跑 30s，收益不值） |
| `test/saveui.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/scenarios.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/silent-gate.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/size-gate.mjs` | 测试脚本 | 行为化 | ✅ | ✅ |  |
| `test/smoke.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/social-lever.mjs` | 测试脚本 | 行为化 | — | ✅ |  |
| `test/walker.mjs` | 测试脚本 | 行为化 | — | — | 随机游走 soak（npm run soak）：耗时长、种子流非确定，不进 npm test |

## F2 工作清单：有断言但**缺自证**（18 项）

> 这些门**在跑、也在断言**，但从没被证明「反例会红」——本仓当日四类空判（覆盖≠验收／反例空判／死开关 #331／原理不可达 #338）都出自这一类。
> 补法：给该门加一个**合成反例**用例（正例＋反例），并在本脚本的 `REASONS` 里改标 `行为化`。

- `audit:a11y`（audit 开关）
- `audit:canon`（audit 开关）
- `audit:choices`（audit 开关）
- `audit:combat`（audit 开关）
- `audit:consequences`（audit 开关）
- `audit:craft`（audit 开关）
- `audit:dragon`（audit 开关）
- `audit:echoes`（audit 开关）
- `audit:gear`（audit 开关）
- `audit:interact`（audit 开关）
- `audit:nosl`（audit 开关）
- `audit:npc`（audit 开关）
- `audit:sel`（audit 开关）
- `audit:sitedisc`（audit 开关）
- `audit:social`（audit 开关）
- `audit:starbudget`（audit 开关）
- `audit:systems`（audit 开关）
- `audit:text`（audit 开关）
