# 文档索引（`docs/`）

> 入口页是仓库根的 `README.md`（"是什么 ＋ 一键跑起来"）；**本页回答"哪份是权威、写什么的时候读哪份"**。
> 存档口径：`docs/archive/` ＝ **已作废的设定稿**（禁止回流，对照表见 `docs/archive/README.md`）；`docs/reviews/` ＝ **走查/评审的流程记录**（非权威、可过期，见 `docs/reviews/README.md`）。

## 一、按任务读（推荐路径）

| 我要…… | 先读 | 再读 |
|---|---|---|
| 改引擎 / 机制 | `docs/dev-conventions.md` | `docs/repo-map.md` · `docs/engine-story-boundary.md` |
| 加 / 改门与测试 | `docs/quality-dimensions.md` | `docs/gate-ledger.md` · `docs/ui-coverage-gaps.md` |
| 要把手写 `<<if>>` 搬进条件表 | **`docs/rules-table-guide.md`**（决策树＋踩坑） | `docs/dev-conventions.md` §11–§12（形状正典） |
| 写 / 改剧情（现存故事，如 `night-ferry`） | `docs/engine-story-boundary.md`（接入契约） | `stories/night-ferry/`（含 `EDITOR-SESSION.md`）· `docs/twee-cheatsheet.md` |
| 做质量评审 | `docs/quality-dimensions.md`（§一 方法 · §四 作业模板） | `docs/reviews/`（走查/评审存档，非权威） |
| 接一个新故事 | `docs/engine-story-boundary.md` | `docs/story2-contracts.md` · `docs/repo-map.md`（§二 层归属） |
| **故事写到某处，引擎还没有这个能力** | **`docs/process/story-engine-loop.md`**（需求到能力的五步循环） | `.github/ISSUE_TEMPLATE/engine-capability.yml`（需求模板）· `#1306`（需求台账） |
| 想知道表能不能放点击态写 | `docs/archive/click-time-writes-design.md` | `docs/notes-model.md`（§已知边界） |
| **数据模型**（角色状态 `pc` ＋ 袋外变量／五类分区／结算三条通道） | **`docs/engine/data-model.md`** | `docs/engine/decisions.md`（已裁／待裁台账） |
| **手写一个故事包**（每类 JSON 放什么、字段逐个） | **`docs/engine/json/README.md`**（索引 · 最小集 · 编译链） | `json/` 下八份逐字段手册 · `docs/engine/authoring-model.md`（三层归位） |
| **写作形态**（MD 放什么／JSON 放什么／条件与计算写在哪） | **`docs/engine/authoring-model.md`** | `docs/engine/reference-spec.md`（判据 J1–J3 · 词汇面） |
| 查历史 / 作废稿（含已删故事 1 的设定·设计·实施三件套，`#1077`） | `docs/archive/README.md` | — |

## 二、权威表（谁说话算数）

| 面 | 唯一权威 | 形态 |
|---|---|---|
| 知识模型（笔记 / 世界态 / 运行时） | `docs/notes-model.md` | 手写 |
| 质量维度与每门判据 | `docs/quality-dimensions.md` | 手写 |
| 代码级约定（渲染路径 / 构建顺序 / 命名 / 条件表形状） | `docs/dev-conventions.md` | 手写 |
| 引擎与故事的边界、故事接入契约 | `docs/engine-story-boundary.md` · `docs/story2-contracts.md` | 手写 |
| 故事面范围（**必需／可选／不做**，编辑器暴露哪些面） | `docs/story-surface-scope.md` | 手写 |
| 模块顺序与层归属 | `scripts/module-order.mjs`（代码即权威） | 代码 |
| 目录 / 文件层说明 | `docs/repo-map.md` | 手写 |
| 门的登记与接线 | `docs/gate-ledger.md` | **生成物** |
| 节奏 / 相异度基线 | `docs/baselines.md` | **生成物** |
| UI 盘点 / 覆盖缺口 | `docs/ui-inventory.md` · `docs/ui-coverage-gaps.md` | 手写 ＋ 机检 |
| 玩家可见正文漂移 | `docs/ui-migration-diff.md` | **生成物** |

## 三、全量清单

| 文件 | 行数 | 类别 | 说明 |
|---|---|---|---|
| `docs/dev-conventions.md` | 738 | 权威 |
| `docs/dev-conventions-cases.md` | — | 案例集 | §17 证伪清单的案例与沿革（`#1080` 外移；**非必读面**，按条号检索） | 14 条代码级约定，每条都配"会咬人的门" |
| `docs/baselines.md` | 429 | **生成物** | `npm run report:rhythm`； 待收：一份文件里 7 个 h1（`#606`）；**随样本漂移（含故事 1 读数，`#1077` 降级标注）** |
| `docs/story2-contracts.md` | 274 | 权威 | 故事 2/3 的接入契约清单 |
| `docs/quality-dimensions.md` | 273 | 权威 | 维度总表 ＋ 候选池 ＋ 给测试的作业模板 |
| `docs/notes-model.md` | 217 | 权威 | 三类划分 ＋ 判定口诀 ＋ 迁移五步 |
| `docs/notes-model-batches.md` | 215 | 记录 | 笔记模型分批迁移的过程记录 |
| `docs/ui-inventory.md` | 201 | 盘点 | 段落与交互元素清单；**生成物 · 随样本漂移（含故事 1 读数，`#1077` 降级标注）** |
| `docs/engine-story-boundary.md` | 130 | 权威 | 两层边界与接入契约 |
| `docs/story-surface-scope.md` | 97 | 口径 | 必需／可选／不做三栏 ＋ 判定三问 ＋ 与同类格式对照 |
| `docs/gate-ledger.md` | 92 | **生成物** | `npm run report:gates:update`（**不要手改**） |
| `docs/rules-table-guide.md` | 118 | 手册 | 表语法实战："这个能不能进表"决策树 ＋ 踩坑清单（`#624` 沉淀） |
| `docs/repo-map.md` | 84 | 地图 | 目录结构 ＋ 层归属 ＋ 权威落点速查 |
| `docs/ui-coverage-gaps.md` | 75 | 口径 | 覆盖与未覆盖的判定口径 |
| `docs/archive/click-time-writes-design.md` | 96 | 设计稿·待评审 | 点击态写侧能否进表（`#624` 普查后的形状；含片一/片二与未决项） |
| `docs/editor-flip-playbook.md` | 97 | 手册（`#787`） | **翻面七步**：冻基线 → 门重指向 → 产物 → 双向反例 → 重签 → 合入；含六个已踩的坑与三条纪律 |
| `docs/superpowers/specs/editor-pivot.md` | 146 | **设计稿**（伞 `#761`） | 编辑器转向：故事数据化 → 编译 → 校验 → 发布（schema v0 · 编译器边界 · 等价判据三级 · 分期与不变量 K1–K5） |
| `docs/benchmark-ledger.md` | 55 | 台账 | 待收：目前**没有其它文档引用它**（`#606`） |
| `docs/reviews/visual-review-2026-09-10.md` | 47 | 存档 | 2026-09-10 视觉走查 |
| `docs/twee-cheatsheet.md` | 41 | 速查 | 本仓在用的 Twee 语法 ＋ 自定义词汇宏 |
| `docs/reviews/text-review-2026-09-10.md` | 41 | 存档 | 文本走查（另一份 `…after-rebase…` 是重基后的复跑） |
| `docs/reviews/quality-selfaudit-ch123.md` | 38 | 存档 | 1–3 章八维自检（流程记录，非设定稿） |
| `docs/game-mechanics.md` | 31 | 速查 | 数值系统 ＋ 演示机制（故事 1 机制面） |
| `docs/reviews/rebase-review-2026-09-10.md` | 31 | 存档 | 重基复核记录 |
| `docs/reviews/text-review-after-rebase-2026-09-10.md` | 29 | 存档 | 重基后的文本复跑 |
| `docs/reviews/design-review.md` | 28 | 存档 | D6 可用性走查（呈现层改动时复审） |
| `docs/credits.md` | 20 | 参考 | 参考资源 ＋ 第三方鸣谢 |
| `docs/ui-migration-diff.md` | 16 | **生成物** | `node scripts/ui-migration-diff.mjs` |
| `docs/engine/README.md` | 42 | **设计稿·待评审** | `docs/engine` 索引：本期（论证层）读序 ＋ 与既有权威的关系 |
| `docs/engine/data-model.md` | 146 | **设计稿·待评审** | 数据模型：角色状态 `pc` ＋ 袋外变量 · 五类分区 · 结算三条通道（含为何声明面只有三格且必须幂等） |
| `docs/engine/decisions.md` | 52 | 台账 | 裁定状态栏：已裁（9 条）／本稿主张（待裁 5 条）／待定（7 条） |
| `docs/engine/authoring-model.md` | 122 | **设计稿·待评审** | 写作模型：MD／JSON／条件与计算三层归位（`#1085` 格式层） |
| `docs/engine/reference-spec.md` | 124 | **设计稿·待评审** | 条件行参考形状 · 词汇面 · 判据 J1–J3（J3 未实现如实标注） |
| `docs/engine/json/` 下 9 份 | — | **手册** | 故事包逐文件手写手册（`#1085`；索引见 `docs/engine/json/README.md`） |
| `docs/archive/` | 13 份 | 作废 | 禁止回流；对照表见 `docs/archive/README.md`（含故事 1 三件套：设定书／设计蓝本／实施图，`#1077`） |
| `docs/reviews/` | 7 份 | 存档 | 走查/评审流程记录（非权威）；见 `docs/reviews/README.md` |

## 四、口径与惯例

- **生成物不要手改**：`docs/baselines.md`（`report:rhythm`）· `docs/gate-ledger.md`（`report:gates:update`）· `docs/ui-migration-diff.md`。
- **状态标记必须是真的**：文档里 `#NNN`／PR 号旁边的 ✅／⏳ 要与 GitHub 真实状态同类 —— `npm run report:freshness`（`docs/dev-conventions.md` F6 节）。
- **文档格式有门**：`node scripts/md-format.mjs` —— ① 每个 `*.md` 的围栏必须成对、标题不许落在代码块里（`#603`；`README.md` 曾因一个多余的围栏让四个标题被吞）；② **反引号里的仓内路径必须存在**（`#606` 片一；`src/*.twee` 搬家后曾有 11 处引用未更新，已修）；③ **入口页体量 ratchet**：`README.md` ≤ 120 行（防它再长回 godfile）；④ **残留冲突标记必红**（`#1084`）：行首带尾随内容的 `<<<<<<< `/`>>>>>>> ` → 红并点名（解 rebase/merge 冲突没删净——实测游离 `>>>>>>>` 进过 commit 而三门全绿）；裸 `=======` 是合法 Markdown（setext／分隔线）不单独判，只在被夹住时附报。
- **要引用已消失的历史路径**：同行写 `<!-- path-exempt: 理由 -->`（门会**留痕打印**豁免，便于收编 —— 别用它掩盖真错误）。
- **动文档要不要跑全链**：只改文档的 PR 不跑 soak（`docs/dev-conventions.md` §10）。
- **本页与两个存档目录的分工**：本页管"现役文档 ＋ 两张清单"；`docs/archive/README.md` 管"作废稿与其替代关系"；`docs/reviews/README.md` 管"流程记录（走查/评审）"。
