# 故事包文件参考（逐文件 · 手写向）

> **本目录回答**：**每一类文件里放什么，怎么写**。目标是让作者**不经过编辑器**也能写出一整个故事。
> 上游：`docs/engine/data-model.md`（数据是什么）· `docs/engine/authoring-model.md`（往哪儿写）· `docs/engine/reference-spec.md`（条件行规格）。
> **本文档只写"字段与校验"**；"为什么这样设计"在上游那三份。

## 一、一个故事包的全貌

```
stories/<slug>/
  00-story.json      ← 清单（manifest）           → 手册 §2
  data/
    tables.json      ← 声明面（容器**由故事声明**；`face-fixture` 全集 15）｜**必填** → 手册 §4
    contract.json    ← 接入契约（`face-fixture` **25** 个成员）｜**必填** → 手册 §7
    meta.json        ← 元信息源（入口件的源）｜**必填** → 手册 §3
    rules.json       ← 条件表（可缺）              → 手册 §5
    notes.json       ← 笔记表（可缺，EXTENSIONS）  → 手册 §6
    chargen.json     ← 车卡数据集（可缺）          → 手册 §10
  passages/          ← 散文（MD，一段一文件；**叙事段的源**） → 手册 §8
  audit.json         ← 故事自己的判据数据          → 手册 §9
  gates/             ← 故事自己的门与见证件        → 手册 §9
  00-meta.twee       ← **产物**（源 `data/meta.json`；入口件，列 `files` 首位）
  15-tables.twee     ← **产物**（源 `data/tables.json`）
  16-notes-*.twee    ← **产物**（源 `data/notes.json`；按故事可有可无）
  17-rules.twee      ← **产物**（源 `data/rules.json`）
  18-chargen.twee    ← **产物**（源 `data/chargen.json`）
  11-fixture-cards.twee ← **手写**（夹具专属，待 `#1177` 收编）
```

**源**：`00-story.json` · `data/*.json`（六件：`tables`／`contract`／`meta` **必填**，`rules`／`notes`／`chargen` 可缺）· `passages/*.md`（＋ `audit.json`／`gates/` 属判据面）；**故事目录里其余的 `.twee` 是产物**。
注意 **`00-meta.twee` 自 `#1132` B4 起是产物**（源 `data/meta.json`；此前它是唯一的手写 `.twee`），见 §3。
**这些 `.twee` 都在段落头之后那行带 `@generated` 标记**（即 K4 判据；手改会在下次编译被覆盖）；**例外是手写的 `11-fixture-cards.twee`**（夹具专属，待 `#1177` 收编）。
**`meta.json` 缺的后果**：构建红。清单 `files` 与 `ORDER` 都列了入口件 `00-meta.twee`，而生成链在缺 `meta.json` 时**不产**该件（实测：移走它再 `npm run build` → 退出码 1，报 `missing-file`）。

**散文层已落地**（来源：`#1114` 片 2b-2b／片 3 与 `#1175`）：三故事（`face-fixture`／`night-ferry`／`minimal-demo`）的叙事段**全部**在 `passages/*.md`；拼装由 `build.mjs` 走 `editor/lib/core/passages.mjs` 的单一分派点（`.twee` 与 `.md` 同源）。因此今天手写的"正文"写 `passages/*.md`，**不再写 `.twee`**；也**没有** `10-*.twee` 这种"拼装产物"（叙事段在装配期直接接入，不落中间件）。

## 二、逐文件手册

| # | 文件 | 内容 | 必填 |
|---|---|---|---|
| §2 | [`story-manifest.md`](story-manifest.md) | `00-story.json`：`slug`／`title`／`entry`／`files`／`audience`／`contractVersion`／`gates` | ✅ |
| §3 | [`meta-twee.md`](meta-twee.md) | `00-meta.twee`（**B4 起是产物**，源 `data/meta.json`）：IFID ＋ `StoryData.start` ＋ `StoryIdentity` | ✅ |
| §4 | [`tables.md`](tables.md) | `data/tables.json`：**容器由故事声明**（下列 15 个＝`face-fixture` 的全集；`night-ferry`／`minimal-demo` 各 12 个，**含手册旧版漏记的 `Shifts`**、无 `Codex`/`NPC`/`Star`/`Dragon`） | ✅（可空） |
| §5 | [`rules.md`](rules.md) | `data/rules.json`：条件行 `rows[]` | 可缺 |
| §6 | [`notes.md`](notes.md) | `data/notes.json`：笔记表（`blocks[]` ＋ `eraMap`） | 可缺 |
| §7 | [`contract.md`](contract.md) | `data/contract.json`：`members[]` ＋ `kind` 封闭集 | ✅ |
| §8 | [`prose.md`](prose.md) | `passages/*.md`：front-matter ＋ 内联白名单 | — |
| §9 | [`audit-json.md`](audit-json.md) | `audit.json` ＋ `gates/`（见证轨迹 · 等价基线） | 建议 |
| §10 | [`chargen.md`](chargen.md) | `data/chargen.json`：`rounds[]` ＋ `presets[]`（声明式 `patch`，动词三枚） | 可缺 |

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
data/chargen.json ──→ 18-chargen.twee（`#1132` B3）
data/meta.json   ──→ 00-meta.twee（`#1132` B4；**入口件也是产物**）
passages/*.md ─────────────────────────────────────────────────┼→ build.mjs → dist/stories/<slug>/index.html
00-story.json ──→ 加载顺序（module-order）／书架（audience）─────┘
```

- 数据面文件名**固定六个**：`tables.json` · `contract.json` · `meta.json`（**必填**）· `rules.json` · `notes.json` · `chargen.json`（**可缺**）。缺 `rules.json`／`notes.json` 时读作 `null`，**不是**静默空对象；缺 `meta.json` 则构建红（见上文）。
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
