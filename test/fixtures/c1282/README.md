# `#1282` 夹具：**真格式**笔记声明（供 `story-runtime` 的「笔记可用」判据三维验证）

**用法**（经 `SG_STORIES_DIR` 喂入 ⇒ **不碰引擎仓 `stories/**`**）：
```bash
SG_STORIES_DIR=test/fixtures/c1282/stories node build.mjs          # 先建产物（生成物不入仓，见下）
SG_STORIES_DIR=test/fixtures/c1282/stories node test/story-runtime.mjs
```

**为什么要有它**：books 的 `north-room` 是 `kind:'empty-object'`（显式零条）且**没有授予**任何笔记
⇒ "笔记可用"那格**空过** ⇒ 绿只证明"没崩"，不证明"判据在判"。本夹具给的是**真格式的有笔记故事**：
- `data/notes.json` 按真格式（块 `entries` 键集）；
- `contract.json` 的 `members` 用**真形态** `{ name:'notes', kind:'game-ref', path:'Game.Notes.entries' }`
  （✗ 不是 `entries` 字段 —— 该字段在真格式里不存在：抽查 30 份历史 contract.json ⇒ 0 例）；
- `data/rules.json` 的 `rows[].yields` 是**授予路径**（新格式下笔记授予的唯一合法路径）。

**三维（改 `rules.json` 的 `yields` 即可复跑）**：
| 变体 | 期望 |
|---|---|
| `yields: ['n_x']`（与 `data/notes.json` 声明一致） | **0 报、rc=0**（不误报） |
| `yields: ['n_other_undeclared']`（未登记） | **1 报并点名该 id**（会咬） |
| 删掉 `contract.members` 里的 `notes` 成员 | **明说"本项未判"、不计红**、rc=0 且不崩 |
| `kind:'null'` | 同上一行（未判）—— 按本轮词汇 `null` ＝ 面不存在 |

⚠️ **生成物不入仓**（`00-meta.twee`／`15-tables.twee`／`16-notes.twee`／`17-rules.twee` 已在 `.gitignore`
家族里；改任何 `data/*.json` 后**先清生成物再 build** —— 本线既有教训）。
