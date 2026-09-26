# `#1510` 夹具：**笔记授予真的发生**（供 `test/note-grant.mjs` 断**运行时面**）

## 一句话

本夹具是一个**真格式的有笔记故事**：`data/notes.json` 声明 `n_x`，**授予经 `#1282` 的唯一合法路径**
（`links[].yields`）**真的落到 `pc.ev.notes.n_x === true`**。

★ 本夹具的判据本体**不在** `story-runtime`（那是**声明面** × **「用」面**的对照，运行时授予没发生它照样绿
—— 实测见 `#1510` 评论 `5848074957`），而在 **`test/note-grant.mjs`**：它 boot 后读
**运行时真值** `pc.ev.notes.n_x`（✗ 不读声明面 ⇒ 两面是**两个对象**）。

## 用法

```bash
SG_STORIES_DIR=test/fixtures/c1282/stories node build.mjs          # 先建产物（生成物不入仓，见下）
SG_STORIES_DIR=test/fixtures/c1282/stories node test/story-runtime.mjs   # 声明面判据（判据③）
node test/note-grant.mjs                                          # ★运行时面判据（本夹具的靶）
```

## 授予链（**两件**：声明 ＋ 赋予；触发由编译器注入，✗ 不手写宏）

| 环 | 位置 | 作用 |
|---|---|---|
| ① 声明 | `data/notes.json` 的块 `entries` 键集 = `{n_x}` | 登记面（`story-runtime` 判据③ 拿它对「用」面） |
| ② 赋予 | `data/passages.json` 的 `开场.links[]` 里那条 `yields: ["n_x"]` | 授予随**链接**走（编译期编进 `data-sg-effects`） |
| ③ 触发 | **编译器**：段有 `links[]` ⇒ 注入段尾块（`<<rules "开场">>` 形态） | 渲染入口，把 ② 那条链接**渲染出来** |

★ **② 落不落，取决于它有没有被渲染出来并被读者点**。授予的施加器**只有一个**
（`Sg.rules.applyYields`，由点击处理器调），✗ 不开第二条写路；也**不需要**在正文里手写 `<<rules>>`
—— 段尾块由编译器注入（`editor/lib/core/passages.mjs`；`#1509` 的对象正是**手写**那一形）。

★ **时序**：效果在**点击那一刻**施加（`#1408`／`#1468`）—— 进段**未点之前** `pc.ev.notes` 必须是
`undefined`（渲染期不落效果），点了才是 `{n_x: true}`。两态都在 `test/note-grant.mjs` 里判。

## 与 `#1507` 的关系（已退役的写法）

本夹具原先在 `01-开场.md` 里写 `<<setflag "n_x">>`。`#1507` 三重实证判定它是**死件＋双重违规**：
① 删掉它、清产物重建，判据照旧绿 ⇒ 对判据**零影响**；②「用」面只认 `yields:` 数据形 ⇒ setflag 根本不匹配；
③ `<<setflag>>` 裸键写 `pc.world.n_x`（✗ 不是 `pc.ev.notes`）⇒ **从未授予笔记**，且违反引擎自述口径
（`src/engine/40-sim/22-rules.twee`：「有笔记的键不得走这里」）。⇒ 本票删该行、改走上面的合法链。

## 三维（`story-runtime` 判据③ 的声明面 × 「用」面）

| 变体（改 `data/passages.json` 的 `yields`） | 期望 |
|---|---|
| `["n_x"]`（与 `notes.json` 声明一致） | **0 报、rc=0**（不误报） |
| `["n_other_undeclared"]`（未登记） | **1 报并点名该 id**（会咬） |
| 删掉 `contract.members` 里的 `notes` 成员 | **明说"本项未判"、不计红**、rc=0 且不崩 |
| `kind:'null'` | 同上一行（未判）—— 按本轮词汇 `null` ＝ 面不存在 |

★ 注意：上表**只动声明面**；`test/note-grant.mjs` 的**红态**只动**授予链**那一环（删 `passages.json` 里那条
`yields`），✗ 不动 `notes.json` —— 否则那是「判据③ 的红」，混了对象。

## 为什么要有它（`#1282` 起因，`#1510` 收口）

books 的 `north-room` 是 `kind:'empty-object'`（显式零条）且**没有授予**任何笔记 ⇒ "笔记可用"那格**空过**
⇒ 绿只证明"没崩"，不证明"判据在判"。本夹具给的是**两面都真**的样本：

- **声明面**真：`contract.json` 的 `members` 用**真形态** `{ name:'notes', kind:'game-ref', path:'Game.Notes.entries' }`
  （✗ 不是 `entries` 字段 —— 该字段在真格式里不存在：抽查 30 份历史 contract.json ⇒ 0 例）；
- **运行时面**真：`pc.ev.notes.n_x === true`（经上面两环链 ＋ 编译器注入的渲染口落下）。

⚠️ **生成物不入仓**（`00-meta.twee`／`15-tables.twee`／`16-notes.twee`／`17-rules.twee` 已在 `.gitignore`
家族里；改任何 `data/*.json` 后**先清生成物再 build** —— 本线既有教训）。
