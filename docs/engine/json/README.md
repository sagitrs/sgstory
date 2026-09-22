# 故事包文件参考（逐文件 · 手写向）

> **本目录回答**：**每一类文件里放什么，怎么写**。目标是让作者**不经过编辑器**也能写出一整个故事。
> 上游：`docs/engine/data-model.md`（数据是什么）· `docs/engine/authoring-model.md`（往哪儿写）· `docs/engine/reference-spec.md`（条件行规格）。
> **本文档只写"字段与校验"**；"为什么这样设计"在上游那三份。

## 一、一个故事包的全貌

```
stories/<slug>/
  00-story.json      ← 清单（manifest）           → 手册 §2
  00-meta.twee       ← 入口件（IFID／起始段）      → 手册 §3
  data/
    tables.json      ← 声明面（容器**由故事声明**；`face-fixture` 全集 15） → 手册 §4
    rules.json       ← 条件表（可缺）              → 手册 §5
    notes.json       ← 笔记表（可缺，EXTENSIONS）  → 手册 §6
    contract.json    ← 接入契约（23 个口子）       → 手册 §7
  passages/          ← 散文（MD，一段一文件）      → 手册 §8
  audit.json         ← 故事自己的判据数据          → 手册 §9
  gates/             ← 故事自己的门与见证件        → 手册 §9
  15-tables.twee     ← **产物**（生成，禁手改）
  17-rules.twee      ← **产物**（生成，禁手改）
  10-*.twee          ← **产物**（由 passages/ 拼装）
```

**四件源、其余是产物**：`00-story.json` · `00-meta.twee` · `data/*.json` · `passages/*.md`（＋ `audit.json`／`gates/` 属判据面）。
**`.twee` 一律是产物**（带 `@generated` 标记 → K4 判据；手改会在下次编译被覆盖）。

注意：**实测现状（不要按上面这张图照抄）**：`passages/*.md` 的**拼装尚未实现** —— 现有故事（含 `night-ferry`）的散文**仍是 `.twee`**。
即甲-1 的散文层**未落地**。→ 今天手写的"正文"仍写 `.twee`；`passages/*.md` 是**目标形态**（见 `decisions.md` Q1–Q2）。

## 二、逐文件手册

| # | 文件 | 内容 | 必填 |
|---|---|---|---|
| §2 | [`story-manifest.md`](story-manifest.md) | `00-story.json`：`slug`／`title`／`entry`／`files`／`audience`／`contractVersion`／`gates` | ✅ |
| §3 | [`meta-twee.md`](meta-twee.md) | `00-meta.twee`：IFID ＋ `StoryData.start` ＋ `StoryIdentity` | ✅ |
| §4 | [`tables.md`](tables.md) | `data/tables.json`：**容器由故事声明**（下列 15 个＝`face-fixture` 的全集；`night-ferry`／`minimal-demo` 各 12 个，**含手册旧版漏记的 `Shifts`**、无 `Codex`/`NPC`/`Star`/`Dragon`） | ✅（可空） |
| §5 | [`rules.md`](rules.md) | `data/rules.json`：条件行 `rows[]` | 可缺 |
| §6 | [`notes.md`](notes.md) | `data/notes.json`：笔记表（`blocks[]` ＋ `eraMap`） | 可缺 |
| §7 | [`contract.md`](contract.md) | `data/contract.json`：`members[]` ＋ `kind` 封闭集 | ✅ |
| §8 | [`prose.md`](prose.md) | `passages/*.md`：front-matter ＋ 内联白名单 | — |
| §9 | [`audit-json.md`](audit-json.md) | `audit.json` ＋ `gates/`（见证轨迹 · 等价基线） | 建议 |

## 三、最小可编译集（实测 `#884`／`#892`）

三件**空骨架**（各**必须带 `section`** —— 缺 `section` 编译器**干净拒绝**）＋ 入口件：

```jsonc
// data/tables.json     注意：是 containers（写 rows ⇒ undefined ⇒ 静默产出空赋值 ✗）
{ "section": "Game Tables", "containers": {} }
// data/contract.json
{ "section": "StoryBindings", "members": [] }
// data/rules.json
{ "section": "StoryRules", "key": "rules", "rows": [] }
```

注意：`00-meta.twee` **必须带新 IFID**（照抄既有故事会撞；`build.mjs` 的 extwee 只收**大写** hex，小写 → `Story IFID is invalid!` → rc=1）。

## 四、编译链（谁是源、谁消费）

```
data/tables.json ──┐
data/contract.json ┼→ editor/compile-story.mjs → 15-tables.twee ─┐
data/rules.json  ──┘        （@generated）                       │
data/notes.json  ──→ 16-notes-*.twee（**一个数据文件 → 多份产物**）
passages/*.md / 10-*.twee ──────────────────────────────────────┼→ build.mjs → dist/stories/<slug>/index.html
00-story.json ──→ 加载顺序（module-order）／书架（audience）─────┘
```

- 数据面文件名**固定四个**：`tables.json` · `contract.json` · `rules.json` · `notes.json`（后两者**可缺** → 读作 `null`，**不是**静默空对象）。
- `notes.json` 是**登记过的 EXTENSION**（`editor/lib/core/contractVersion.mjs` 的 `EXTENSIONS`）：ADD 新面要登记，**改既有面语义 → `CURRENT + 1`**。

## 五、校验链（每个文件被谁咬）

| 文件 | 主要闸门 |
|---|---|
| `00-story.json` | `build.mjs`（故事件不在清单里 → 拒；清单里的文件不存在 → 拒）· `test/store-keys.mjs`（`slug` 与 `00-meta.twee` 的 `Sg.storyId` 一致）· `audience` **fail-loud**（缺字段／取值非法 → 报错） |
| `00-meta.twee` | IFID 形态（UUIDv4，大写 hex）· `StoryData.start` ≡ 清单 `entry` |
| `data/*.json` | 编译器 `section` 必填 · `scripts/audit/lib/story-shape.mjs`（`mechanics` 形状六条）· `scripts/audit/gates/*.mjs`（各容器） |
| `data/rules.json` | **未实现**：`--rules` 开关不存在（实调 → 未知开关）；键形判据在 `test/cond-keyform.mjs`；死行判定在编辑器 UI（`ruleRows.mjs`）——详见 `reference-spec.md` §3.0 |
| 正文 | `test/prose-vocabulary.mjs`（禁逻辑宏 · 未宣告宏 → 红）· `scripts/md-format.mjs`（围栏／路径／表格） |
| `audit.json` | `scripts/audit/lib/story-audit.mjs`（`text` 对象必填） |

## 六、手写者的三条纪律

1. **不手改产物**：`15-/17-/16-*.twee` 带 `@generated` 标记，改了下一次编译就没了（K4 门会咬）。
2. **未声明即红是常态**：键前缀（`inv:`／`era:`／`gear:`）· 算子（`gte`／`lte`／`oneOf`）· 效果面（`yields`／`gives`／`sets`）· 宏名 —— 都要在**引擎宣告面**里；不在就是**永假／静默**，本仓一律判红。
3. **数值不进声明面**：条件行只有 `yields`（笔记）／`gives`（道具）／`sets`（**只置真**）三格。伤害／金钱／异常／耐久写在正文的**具名动作宏**里（`<<damage>>`／`<<econ>>` …）—— 原因见 `data-model.md` §5.1（幂等性）。
