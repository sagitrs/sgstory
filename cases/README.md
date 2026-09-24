# `cases/`（引擎仓自己的用例面）

**用途**：`scripts/case-run.mjs` 的**默认**用例根（`--cases=` 可显式指别处，如 books 仓的 `cases/`）。

**形状**：`cases/<slug>/<case-id>.json`
```json
{ "id": "…", "story": "<slug>", "why": "…", "ticket": "#N（可选）",
  "drive": { "clicks": ["链接标签"], "state": {}, "seed": 0.5 },
  "expect": { "visible": [], "absent": [], "state": {}, "edges": [] } }
```

**三态与退出码**（判据在 `scripts/case-run.mjs` 的 `classifyCase()`，纯函数 ⇒ 可自证）：
| 态 | 条件 | rc |
|---|---|---|
| 绿 | `expect` 全满足 | 0 |
| 红-有归因 | 有不满足 ＋ `ticket` 且**票未关** | **0**（单列「○ 预期缺口 #N」） |
| 红-无归因 | 有不满足 ＋ 无 `ticket` | **≠0** |
| 红-陈旧归因 | `ticket` **已关**却仍红 | **≠0**（提示复查并补 `closed_by`） |

**★ 归因票状态依赖 `GH_TOKEN`**：无 token 时"票已关"会被降级成"未关" ⇒ **rc=0（真问题被吞）**
⇒ **CI 跑本工具必须带 token**；无 token 时工具会打**醒目告警 ＋ 汇总里单列"未核实 N 条"**（降级不许无声）。

**净树**：本工具只读（jsdom 在内存里跑）⇒ 跑仓外故事**不往引擎仓写任何东西**。
本目录为**空**（零用例）时，工具 rc=0 并明说"未跑"；**根不存在**才出声（rc=1）。
