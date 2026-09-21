# `docs/engine` —— 写作与引擎的设计面（设计文档目录）

> **本目录是什么**：写作形态（Markdown／JSON 各放什么）与**引擎边界的成文设计**。
> **不是**：设定书（→ `docs/archive/lore-canon.md`，故事 1 遗产已入档，见 `#1077`）、代码级约定（→ `docs/dev-conventions.md`）、门的登记（→ `docs/gate-ledger.md`）。
> **状态**：设计稿（**待评审**）。**凡形状与行为断言，一律附可复算命令**（`grep`／`sed` 行号 或 `git show`）；未落地的算**主张**，在 [`decisions.md`](decisions.md) 单列。

## 为什么有这一层

`docs/superpowers/specs/editor-pivot.md`（伞 `#761`）给的是**技术形状**（schema v0 · 编译器边界 · 等价判据 · 分期 P0–P4），它的 §2.1 把散文格式写作 **Twee**。
其后 `#1036` 连续裁定了三件**改变那一层形状**的事：散文改 **Markdown ＋ front-matter**（甲-1）、产物**不入仓**（丙→乙）、正文内联**只许引用形状**（甲）。

⇒ 两者之间缺一层：**"MD 里放什么／JSON 里放什么／条件与计算写在哪里"没有成文设计**。
缺这一层的直接后果是**边界靠具体宏名清单隐式划定**（「`set` 禁、`setflag` 允」），而那份清单只活在票面评论的字缝里 —— 于是同一条边界每撞一次补一次。

本目录补的就是这一层。

## 读什么

### 论证层（先读）

| 文件 | 回答的问题 | 性质 |
|---|---|---|
| [`data-model.md`](data-model.md) | **被写的那个东西是什么**：角色状态 `pc` ＋ 袋外变量 · 五类分区 · 结算的三条通道与操作性质 | 设计（**根**） |
| [`decisions.md`](decisions.md) | 哪些是**已裁**（附出处）、哪些是**本稿主张**（待裁）、哪些**待定** | 台账 |

### 格式层（`#1085`，已到）

| 文件 | 回答的问题 | 性质 |
|---|---|---|
| [`authoring-model.md`](authoring-model.md) | **MD 放什么 · JSON 放什么 · 条件与计算写在哪**（三层归位 ＋ 具名动作 vs 计算的分界） | 设计 |
| [`reference-spec.md`](reference-spec.md) | 条件行参考形状 · 词汇面（33）· 判据 J1–J3（**J3 未实现**，§3.0 如实） | 参考 |
| [`json/README.md`](json/README.md) | 故事包逐文件手册**索引**（全貌 · 最小可编译集 · 编译链 · 校验链） | 手册 |
| [`json/`{`tables`,`rules`,`contract`,`prose`,`notes`,`story-manifest`,`meta-twee`,`audit-json`}`.md`] | 逐文件手写手册（字段级） | 手册 |

**读序**：先 `data-model.md`（数据是什么）→ `decisions.md`（哪些还没定）→ 再按需进格式层（写故事 ⇒ `json/README.md` 起点；看判据 ⇒ `reference-spec.md`）。
直接看写作约定而跳过数据模型，会得到一份"格式指南"而不是设计 —— 本文档集的第一个版本就是这样漏掉了数据层。

> 格式层由后继票 `#1085` 落地（修 Admin 评审 B1＋M1/M4–M11；拆自原 `#1061`），依赖本篇的 §5.1 幂等性论证与 §四 口径冲突。

## 与既有权威的关系（不复制，只指路）

| 面 | 唯一权威 | 本目录的角色 |
|---|---|---|
| 引擎／故事分工与接入契约 | `docs/engine-story-boundary.md` | 引用；**不重述** |
| 知识模型（笔记／世界态／运行时） | `docs/notes-model.md` | 引用；取值命名空间与它对齐 |
| 故事面范围（必需／可选／不做） | `docs/story-surface-scope.md` | 引用 |
| 条件表语法实战 | `docs/rules-table-guide.md` | 引用 |
| 编辑器转向的技术形状与分期 | `docs/superpowers/specs/editor-pivot.md` | **被本目录细化**（散文层由 Twee 改 MD 之后的那一段） |
| 产物入仓与锁 | `#1042` | 引用 |
