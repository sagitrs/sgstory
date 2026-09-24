# 故事包文件参考（逐文件 · 手写向）

> **本目录回答**：**每一类文件里放什么，怎么写**。目标是让作者**不经过编辑器**也能写出一整个故事。
> 上游：`docs/engine/data-model.md`（数据是什么）· `docs/engine/authoring-model.md`（往哪儿写）· `docs/engine/reference-spec.md`（条件行规格）。
> **本文档只写"字段与校验"**；"为什么这样设计"在上游那三份。

## 一、一个故事包的全貌（★这一节**只是你要写的那些件**）

> **口径（`#1322`，2026-09-24 裁定）**：**「包」＝ 作者维护的输入**。
> **生成物**（`00-meta.twee`／`15-tables.twee`／`16-notes-*.twee`／`17-rules.twee`／`18-chargen.twee`）
> **不在这一节里** —— 它们是**编译链的中间件**，不是你要维护的东西 ⇒ 见下面「一·补 故事文件编译链」。

```
stories/<slug>/
  00-story.json      ← 清单（manifest）           → 手册 §2
  data/
    tables.json      ← 声明面（容器**由故事声明**）｜**必填** → 手册 §4
    contract.json    ← 接入契约｜**必填** → 手册 §7
    meta.json        ← 元信息源（入口件的源）｜**必填** → 手册 §3
    rules.json       ← 条件表（可缺）              → 手册 §5
    notes.json       ← 笔记表（可缺，EXTENSIONS）  → 手册 §6
    chargen.json     ← 车卡数据集（可缺）          → 手册 §10
  passages/          ← 散文（MD，一段一文件；**叙事段的源**） → 手册 §8
  audit.json         ← 故事自己的判据数据（可选） → 手册 §9
  gates/             ← 故事自己的门与见证件（可选） → 手册 §9
```

**源**：`00-story.json` · `data/*.json`（六件：`tables`／`contract`／`meta` **必填**，`rules`／`notes`／`chargen` 可缺）· `passages/*.md`（＋可选 `audit.json`／`gates/`）。
**`meta.json` 缺的后果**：构建红 —— 清单 `files` 与 `ORDER` 都列了入口件 `00-meta.twee`，而生成链在缺 `meta.json` 时**不产出**它 ⇒ 这也是为什么清单里**必须列生成物**（见「一·补」第 3 条）。
**散文层已落地**（来源：`#1114` 片 2b-2b／片 3 与 `#1175`）：叙事段不再经过手写 `.twee`。

### 一·补、故事文件**编译链**（生成物：不是你要维护的）

```
  你的输入                     引擎产物（中间件，带 `@generated`）        发布产物
  ─────────                   ───────────────────────────────        ─────────
  data/meta.json       ──▶    00-meta.twee       （入口件）        ┐
  data/tables.json     ──▶    15-tables.twee                       │
  data/notes.json      ──▶    16-notes-*.twee    （可无）          ├─▶ build.mjs
  data/rules.json      ──▶    17-rules.twee                        │      ──▶ 单文件 HTML（+ dist/）
  data/chargen.json    ──▶    18-chargen.twee    （可无）          │
  passages/*.md        ──▶    （装配期直接接入，不落中间件）      ┘
```

四条要记住的事实：

1. **`@generated` 标记**：生成物在段落头之后那一行带它（即 K4 判据）⇒ **手改会在下次编译被覆盖** ✗。
   （`00-meta.twee` 自 `#1132` B4 起也是产物，源 `data/meta.json`；此前它是唯一的手写 `.twee`。夹具专属的 `11-*.twee` 之类仍是手写，待 `#1177` 收编。）
2. **不要手改生成物**：改它们＝**改错了层** —— 要改的是它们的**源**（`data/*.json`／`passages/*.md`），然后重编。
3. **清单 `files` 为什么要列生成物**：那是**编译契约**的要求（入口件必须在清单里，`ORDER` 与模块序靠它）——
   **不是"你要手写它们"**。⇒ 在清单里看到 `.twee` 不要慌：那是**声明**，不是**任务**。
4. **生成物不入仓**（`.gitignore`，名单来源＝引擎的生成物家族谓词）⇒ 于是 **本地看得到它们、`git status` 却看不到**。
   ⇒ 复算前**先清**（否则 build「按件在」**复用旧产物** ⇒ 会得到**假读数**）；
   夹具 `test/fixtures/m3-chk-e2e/run.sh` 就是为这件事写的（**清三层** ⇒ build ⇒ 跑用例）。

## 二、逐文件手册

| # | 文件 | 内容 | 必填 |
|---|---|---|---|
| §2 | [`story-manifest.md`](story-manifest.md) | `00-story.json`：`slug`／`title`／`entry`／`files`／`audience`／`contractVersion`／`gates` |  |
| §3 | [`meta-twee.md`](meta-twee.md) | `00-meta.twee`（**B4 起是产物**，源 `data/meta.json`）：IFID ＋ `StoryData.start` ＋ `StoryIdentity` |  |
| §4 | [`tables.md`](tables.md) | `data/tables.json`：**容器由故事声明**（下列 15 个＝`face-fixture` 的全集；`night-ferry`／`minimal-demo` 各 12 个，**含手册旧版漏记的 `Shifts`**、无 `Codex`/`NPC`/`Star`/`Dragon`） | （可空） |
| §5 | [`rules.md`](rules.md) | `data/rules.json`：条件行 `rows[]` | 可缺 |
| §6 | [`notes.md`](notes.md) | `data/notes.json`：笔记表（`blocks[]` ＋ `eraMap`） | 可缺 |
| §7 | [`contract.md`](contract.md) | `data/contract.json`：`members[]` ＋ `kind` 封闭集 |  |
| §8 | [`prose.md`](prose.md) | `passages/*.md`：front-matter ＋ 内联白名单 | — |
| §9 | [`audit-json.md`](audit-json.md) | `audit.json` ＋ `gates/`（见证轨迹 · 等价基线） | 建议 |
| §10 | [`chargen.md`](chargen.md) | `data/chargen.json`：`rounds[]` ＋ `presets[]`（声明式 `patch`，动词三枚） | 可缺 |

## 三、最小可编译集（实测 `#884`／`#892`）

三件**空骨架**（各**必须带 `section`** —— 缺 `section` 编译器**干净拒绝**）＋ 入口件：

```jsonc
// data/tables.json     注意：是 containers（写 rows → undefined → 静默产出空赋值 ✗）
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

## 七、作者面自检清单（**写故事时会出声的检查** · 逐条带判据）

> **怎么用**：写一个故事时**按本表自检**，比"撞错再回查"省一轮。
> **口径**：每条＝**一句可判定的话** ＋ **判据（源码 `件:行`）** ＋ **为什么** ＋ **作者怎么写才不撞**。
> **本笔覆盖**：下列 **11 条**（能核到源码的）；**未列**的检查面（如 `slots`／`status`／`waves`／`roads`／`sitedisc`／`consequences` 等**依赖战斗/位点数据齐全**的门）**本笔不铺** —— 它们要故事先有对应数据面，作者的撞法与其形状强相关，宜随那些面单独成文。

### 1. 清单（`00-story.json`）

| # | 可判定的话 | 判据 | 为什么 | 怎么写才不撞 |
|---|---|---|---|---|
| 1.1 | `files` **只列"包内件"**（`stories/<slug>/…`）；列不存在的件 → 拒 | `scripts/module-order.mjs:220-222`（`missing-manifest-file`） | 清单是**所有权声明**，不是"目录快照" | 列**磁盘上真在**的件；**生成物也要列**（见 1.2） |
| 1.2 | **生成物必须列进 `files`**（尽管它们不入仓） | 同上 ＋ `scripts/module-order.mjs:214-218`（`unclaimed-file`：非引擎件须被某故事清单认领）＋ 源发现面收 `*.twee`（`:497`） | 生成物**会进源集**；源集里的非引擎件**必须有人认领** → 不入仓 ≠ 不进清单 | 把 `00-meta.twee`／`15-tables.twee`／`17-rules.twee`／`18-chargen.twee` 写进 `files`（名单权威＝`editor/lib/core/generated-family.mjs` 的 `isGeneratedFamily()`） |
| 1.3 | **`data/*.json` 不进 `files`**（由 `data/` 面自动发现） | 源发现面 `allSourceFiles()` 默认**不收** `data/*.json`（`scripts/module-order.mjs:488`，`withStoryData` 默认 `false`；判定 `isStoryDataJson` `:487`） | 数据面是**整面声明**；逐件列会让"清单 vs 目录"两份真源并存 | **别列**。当前撞上去的报文**与事实不符**（会说"不存在"）—— 正修：`#1271` |
| 1.4 | 清单**缺 `gates` 键** → 发现器报错（**空数组 `[]` 合法**） | `scripts/audit/discovery.mjs:58` | 门归属**必须显式**：不声明 ≠ 没有门 | 显式写 `"gates": []` 或列出该故事自己的门 |
| 1.5 | `audience` **必须显式**（`content`／`internal`） | `scripts/dist-paths.mjs` 的 `audienceOf()`（取值非法即抛） | 免得内部件被**静默上架** | 显式声明 |

### 2. 数据面（`data/*.json`）

| # | 可判定的话 | 判据 | 为什么 | 怎么写才不撞 |
|---|---|---|---|---|
| 2.1 | **`audit.json` 必写（空表也要显式写）** | `scripts/audit/lib/story-audit.mjs:40`（缺件**抛错点名**）；字段型错逐项点名 `:25-32` | `#602`：不给空表 ＝ **借用别的故事的判据** | 写 `{"text":{"topicWords":[],"styleBlacklist":[]},"readBaseline":{}}`（**空数组合法**） |
| 2.2 | 条件行 `req`／`any`／`exclude` 的**键形必须已宣告**（前缀 `inv:`／`era:`／`gear:`，算子 `gte`/`lte`/`oneOf`） | `test/cond-keyform.mjs`（键形判据）＋ `docs/engine/authoring-model.md` §3.1（`Sg.rules.*` 是真源） | **未宣告 → 抛错**（不是静默为假）：引擎不认的前缀/算子会让条件**永假** → 行**静默死掉** | 只用真源里列出的前缀与算子（`docs/engine/json/rules.md`） |
| 2.3 | **数值不进声明面**：条件行只有 `yields`（笔记）／`gives`（道具）／`sets`（只置真） | `docs/engine/json/README.md` §六-3 ＋ `scripts/audit/gates/literals.mjs:80,94`（`bare-era`／`bare-damage`：裸常量/裸伤害数字） | 伤害/金钱是**计算**，住引擎能力库；写进数据面就是"故事夹带计算" | 常量走 `CONST_SECTION` 声明；伤害写 ``<<damage `Game.Damage.x`>>`` |
| 2.4 | 生成物里的**源标记**必须指向**本故事 `data/`** | `scripts/audit/gates/literals.mjs:55`（`@generated` 的 `源"…"不在本故事 data/ 下` → 红） | 生成物必须**由本故事的源**产出（防"从别处拷来的产物"） | 别手改产物（`docs/engine/json/README.md` §六-1） |

### 3. 散文（`passages/*.md`）

| # | 可判定的话 | 判据 | 为什么 | 怎么写才不撞 |
|---|---|---|---|---|
| 3.1 | 每个**内容段落**必须有 `payload:` 标注，且值 ∈ `信息`／`张力`／`选择`（可组合） | `scripts/audit/gates/text.mjs:31`（正则**就是**那三个值的权威） | 载荷门用**载荷类型**读段落功能；无标注读不了 | `/% payload: 信息 %/`／`/% payload: 张力|信息 %/`；**别写别的词**（写错词与忘写照**同一个错**） |
| 3.2 | 正文**禁原始计算**（`<<set>>`／`<<if>>`／`<<for>>`／`<<run>>`／`<<= … >>` 等）；**具名动作**宏允许 | `test/prose-vocabulary.mjs` 的 `FORBIDDEN_BUILTINS` | 散文只**引用**、不**计算**（结构出正文） | 用 33 个宣告面宏（`<<give>>`／`<<setflag>>`／`<<goto>>` 等）；取值用 `{{名字}}`（**本段入参**；引擎/世界态取值面另见 `#1236`） |
| 3.3 | 内联只许**两种引用形状**：`[[标签|目标]]`、`{{名字}}` | `docs/engine/authoring-model.md` §1（`#1036` 裁定） | MD 原生链接是**资源地址**、语义不等价 | 链接一律 `[[…]]` |

### 4. 状态面（`pc.ev`／`pc.world`）

| # | 可判定的话 | 判据 | 为什么 | 怎么写才不撞 |
|---|---|---|---|---|
| 4.1 | 写进 `pc.ev`／`pc.world` 的键**必须落在 `Game.State.domains` 的某个域里** | `scripts/audit/gates/state.mjs:1`（域表归属） | 域表是**键的归属登记**；不在域表＝没人管 | 在 `data/tables.json` 的 `State.domains` 里登记键 |
| 4.2 | **只有写**（写了没人读）→ 红；**只有读**（读了没人写）→ 红 | `scripts/audit/gates/state.mjs:9,10` | 无消费者的状态＝白写；死分支＝幽灵条件 | 每个键**读写成对**；条件行的键算**读**、`sets` 算**写** |

> **本笔未覆盖**（如实列，不铺）：`slots`／`status`／`waves`／`roads`（战斗/路径数据面）｜`sitedisc`（位点失败纪律）｜`consequences`（选择后果桶）｜`a11y`（产物可访问性）｜`engine-story-free`（引擎侧，非作者面）—— 这些要么需故事先备对应数据面，要么判的是产物/引擎面。

### 附：本笔核出的**缺陷候选**（一行清单，报协调层）

- **1.3 的报文与事实不符**：清单列 `data/*.json`（文件真在）→ 报 `missing-manifest-file`"不存在（改了名或删了文件）"→ **判据用错面**。**已开票 `#1271`**（本清单与它同源）。
- （其余各条**未见**"报文与事实不符"或"应当可选却报错"；`1.4` 的"缺键即报"与 `2.1` 的"缺件即抛"**都是有意的显式化要求**，不是缺陷。）
