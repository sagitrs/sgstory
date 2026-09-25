# `passages/*.md` —— 散文（**已落地**：`#1350` 片 1–5 ✓）

>注意：**本节描述的目标形态已落地**（`#1350` 片 1–5 全落 ✓；裁定出处仍是 `#1036` 甲-1 与 `#1234` 冻结 ✓）。
> ★三支的**编译形态以** [`tables.md`](tables.md) §11.2 为唯一权威 ✓；现状与迁移面见本文 §5 ✓。
> 裁定出处：`#1036`（散文形态甲-1 ＋ 内联只许引用形状）· 判据：`test/prose-vocabulary.mjs`（`#1043`）。
>
> ★**更新（`#1234` 冻结，`5815699385`）**：散文＝**纯模板** ⇒ **零链接**（链接一律进 `data/passages.json` 的 `links[]`）；
> `{{}}` **只认本段 `params`** 声明的入参（未声明或未传 ⇒ **红**），世界态走**具名取值宏**（✗ 不进 `{{}}`）。
> ⇒ 本文 §2「内联引用形状」与 §4 属**上一版目标**；**现形态**以 [`docs/manual/12-data.md`](../../manual/12-data.md) 与 `#1234` 冻结为准 ✓。

## 1. 一段一文件 ＋ front-matter

```markdown
---
passage: 渡口
tags: [prose]
scope_of: []
---

船篙一点，水面的灯影碎成两半。{{撑船人}} 没答话，只把灯笼往船头一压。

[[上船|船头]]
[[回头|结局 抵岸]]
```

| front-matter 字段 | 型 | 必填 | 含义 |
|---|---|---|---|
| `passage` | `string` |  | 段落名（＝链接目标、`scope` 的值）。注意：与文件名**可以不同**（映射靠清单 `files`） |
| `tags` | `string[]` | — | 段落标签（`prose`／`script` 等；**非散文标签不判词汇门**） |
| `scope_of` | `string[]` | — | 可选：本段归属的条件行 id（供可达性视图） |

注意：**字段全集未定**（`decisions.md` 的 Q2）—— 上表是本文档给的最小集，不是裁定。

## 2. 内联扩展**只许两种引用形状**（永不出现表达式）

| 形态 | 写法 | 规则 |
|---|---|---|
| **链接／动作** | `[[标签\|目标]]` | 目标必须是**存在的段落**（`integrity` 悬空引用门判） |
| **取值** | `{{名字}}` | 名字**必须被声明** → 未声明即红 |

**为什么不用 MD 原生链接**：`[[…]]` 的目标是**段落（节点）引用**（`walker`／`integrity`／`event-graph` 把它读成**有向图的边**）；`[](…)` 是**资源地址**，会被渲染成 `href`，且常见实现会对非 ASCII 目标做 percent-encode → 生成**指向不存在段落的边而表面正常**。详见 `docs/engine/authoring-model.md` §1.1。

## 2.1 段落 `payload` 标注（**三个值**：`信息`／`张力`／`选择`）

- **怎么写**：`/% payload: 信息 %/`（也可组合：`/% payload: 张力|信息 %/`，分隔符 `|` 或全角 `｜`）；
- **真源（枚举在哪）**：**门的正则**＝ `scripts/audit/gates/text.mjs:31` 的 `/payload:\s*(信息|张力|选择)(?:[|｜](?:信息|张力|选择))*/` —— **这就是那三个值的权威**（不在别处的枚举表里，改值须同时改它）；
- **判据**：**内容段落**（非 `StoryInit`／`Story*`／带 `script`/`widget`/`stylesheet` 标签的段）**必须有** ≥1 个该标注，否则报"段落"X"缺 payload 标注"；
- **为什么**：载荷门（`#39`）用**载荷类型**读段落的功能（信息／张力／选择），没有标注的段落无法被读 → 报"缺"。
- **撞错的症状**：**写了一个不在三值里的词**（例：`payload: 结局`）→ 与**完全没写**是**同一个报错**（"缺 payload 标注"）→ 认不出是"写错词"还是"忘了写"。→ 写之前对照三值。

## 3. 允许与禁止（判据由 `test/prose-vocabulary.mjs` 强制）

| 类别 | 内容 | 结果 |
|---|---|---|
|  **允许** | 散文文本 · `[[…]]` · `{{…}}` · **具名动作宏**（引擎宣告面 33 个） | 通过 |
| ⛔ **禁止** | 原始计算内建（**真源＝`test/prose-vocabulary.mjs:35` 的 `FORBIDDEN_BUILTINS`，共 8 项含 `elseif`／`=`——此处只举例 `<<= …>>`／`<<set>>`，不复述全集**） | **判红** |
|注意：**不判** | 注释跨度 `/% … %/` · `[script]`／`[widget]`／`[stylesheet]` 段 | 跳过 |

**具名动作宏**（实测 33 个 ＝ `<<widget>>` 23 ＋ `Macro.add` 10）：
`give` `note` `notepath` `setflag` `take` `econ` `damage` `sitecheck` `check` `checkres` `ending` `rules` `rulelist` `firstTime` `snapshot` `actOut` `inventory` `sceneFeedback` `shortFight` `fight*`（`fightact`/`fightbegin`/`fightlog`/`fightpanel`）`foeIntent` `foeRound` `socpanel` `socresolve` `eraPresent` `save` `hpbar` `dragonbar` `lastcheck` `lastCheckFor` …

→ **要新增词汇 → 在引擎宣告**（`<<widget>>`／`Macro.add`），不是为了过门而改门。

## 4. 三条替换规则（`#1036` 甲）

| 现在写 | 改成 |
|---|---|
| `<<goto>>`／`<<back>>` | 即链接：`[[返回\|…]]`（`back` 是唯一放行的内置） |
| `<<set>>`／`<<if>>`／`<<else>>`／`<<for>>` | **出正文** → 进 `data/*.json` 的规则／契约面 |
| `<<= $pc.classLabel?? ''>>` | `{{classLabel}}`（**取一个已声明的值**） |
| `<<= window.Sg.Codex?.render?.()?? '…'>>` | **块级结构**（挂整块组件 → 放两段散文之间，**不进句子**） |

## 5. 现状（**手写者今天该怎么做**）

| 事 | 现状 |
|---|---|
| `passages/*.md` 拼装 | **已实现**（`editor/lib/core/passages.mjs`；`build.mjs` 单一分派点，`.twee` 与 `.md` 同源） |
| 散文实际所在 | `stories/<slug>/passages/*.md`（**手写，是源**，不是产物）——`night-ferry` 的 11 段在 `passages/01-渡口.md` … `11-结局 沉船.md` |
| `{{名字}}` 取值 | **已实现**（`passages.mjs` 的取值展开，名取自 `core/vocab.mjs` 的 `valueTerms`；不在声明面则报错） |
| 禁计算门 | **已生效** |
| `10-*.twee` 是"产物"吗 | **这个文件不存在了**：叙事段在装配期直接接入，不落中间件；故事目录里带 `@generated` 的产物是 `00-meta.twee` 与 `15`／`16`／`17`／`18-*.twee` |

→ **今天手写故事**：正文写 `passages/*.md`（遵守 §3 的允许与禁止）；`10-*.twee` 已不再出现（来源：`#1114` 片 2b-2b 与片 3、`#1175`）。

## 6. 格式纪律（`scripts/md-format.mjs` 判）

- 围栏（```）必须**成对**；标题不许落在代码块里；
- **反引号里的仓内路径必须存在**（`src/` `stories/` `docs/` `scripts/` `test/` `vendor/` 开头）；引用历史路径要同行写 `<!-- path-exempt: 理由 -->`；
- 表块被**空行打断后又续 `|`** → 判红（GFM 表格在第一个空行处结束）。
