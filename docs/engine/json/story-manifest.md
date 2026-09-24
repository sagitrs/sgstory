# `00-story.json` —— 故事清单（manifest）

> 实况样本：任一故事的 `00-story.json`（原举例 `night-ferry` 已随 `#1261` 下架）。生成器：`editor/lib/core/story.mjs` 的 `manifestFor()`／`starterPackage()`。
> 消费方：`build.mjs`（认故事 · 加载顺序 · 书架）· `scripts/module-order.mjs`（`files`／`gates`）· `test/store-keys.mjs`。

## 1. 字段表

| 字段 | 型 | 必填 | 缺省 | 含义 · 校验 |
|---|---|---|---|---|
| `slug` | `string` |  | — | 故事目录名（＝ `stories/<slug>/`）。**必须与 `00-meta.twee` 的 `Sg.storyId.slug` 一致** → `test/store-keys.mjs` 判红 |
| `title` | `string` |  | `'未命名故事'`（起手模板） | 标题（书架／页面标题） |
| `subtitle` | `string` | — | `''` | 副标题（书架显示） |
| `entry` | `string` |  | `'开场'` | **起始段的段落名**。必须与 `00-meta.twee` 的 `StoryData.start` **一致**（不一致 → 启始段找不到） |
| `contractVersion` | `number` |  | `CURRENT`（＝ 1） | 契约版本；判据是"**必须等于 `CURRENT`**"（读 `N-1` 的兼容层是 `G-1c`，未落地） |
| `audience` | `'content' \| 'internal'` |  | `'content'` | **上架与否**：`content` → 进书架；`internal` → 仍构建、**不列书架**。注意：**字段总要写**（读侧不补默认）；**缺字段或取值非法 → 构建直接报错**（fail-loud，防内部件被静默上架） |
| `files` | `string[]` |  | — | 包内**件名**列表（`stories/<slug>/…`）。注意：**只能列真的存在的件**：漏列 → `build.mjs` 拒"故事件不在清单里"；多列 → 拒"清单里的文件不存在" |
| `gates` | `string[]` | **（缺键 → 发现器报错**，`scripts/audit/discovery.mjs:58`；**空数组 `[]` 合法**＝显式声明"本故事无自己的门"——`night-ferry` 即 `gates: []` 但 `gates/` 目录非空，见 `audit-json.md` §2） | `[]` | 该故事自己的门（`stories/<slug>/gates/**`） |

## 2. `files` 的顺序语义

`files` **不只是清单，也是加载顺序**（`stories/<slug>/**` 的顺序由它给 → 新故事**不必改引擎的 `ORDER`**）。

- **入口件 `00-meta.twee` 永远排第一**（`manifestFor()` 强制）；注意 它自 `#1132` B4 起是**产物**（源 `data/meta.json`），但**位置语义不变**（仍列 `files` 首位）；
- 其余按**编译输出序**（＝ `twee` 键序）；
-注意：调用方应把**与 `writeStoryPackage` 同一个 `twee` 对象**传进 `manifestFor()` —— 一处真源、两处消费（否则清单与产物必然漂移）。


### 2.1 两条易撞的契约事实（新作者必读；均由实写样本撞出来，`#1267`）

**(1) `data/*.json` 不进 `files`（它们由 `data/` 面自动发现）。**

- **判据**：源发现面 `allSourceFiles()`（`scripts/module-order.mjs`）**默认不收** `stories/<slug>/data/*.json`（`withStoryData` 默认 `false`；判定函数 `isStoryDataJson`）。数据面由**编译器按目录读**，不由清单驱动。
- **为什么**：数据面是**整面声明**（一个故事的 `data/` 全在），逐件列进 `files` 会让"清单"与"目录"两份真源并存 → 只可能漂移。
- **撞错的症状（当前为缺陷，正修 `#1271`）**：报 `missing-manifest-file`——"…不存在（改了名或删了文件）"，**而文件其实就在那儿**。
  → **报文与事实不符**：`checkRegistration()` 用 `names`（＝**源集**）判"存在"，而源集按设计不含 data json → **不是"缺件"，是"不该列"**。
- **按裁定（`#1271`）两条报文应分工**：
  - 列了**自动发现面**的件（在磁盘上**存在**）→ "**不应列入清单**：数据面由 `data/` 面自动发现"；
  - 磁盘上**不存在**且不属任何自动发现面 → "**缺件（改名或删除）**"（**这条守卫保留**，不许为改文案而放松）。

**(2) 生成物（`00-meta.twee`／`15-tables.twee`／`17-rules.twee`／`18-chargen.twee`）必须列进 `files`，尽管它们不入仓。**

- **判据**：源发现面**收 `*.twee`**（`allSourceFiles()` 里的 `e.name.endsWith('.twee')`）→ 生成物**会进源集**；源集里的**非引擎件**必须被**某故事清单认领**，否则报 `unclaimed-file`（"既非引擎件、也不属于任何故事清单的 files"）。
- **为什么**：`files` 声明的是**整故事面的所有权**（谁拥有在源集里出现的这些件），不是"仓库里现在有哪些文件"→ **不入仓 ≠ 不进清单**。
- **生成物名单的单一权威**：`editor/lib/core/generated-family.mjs` 的 `isGeneratedFamily()`（`stories/<slug>/1[5678]-*.twee` ＋ `00-meta.twee`）。

## 3. 实况样本

```jsonc
{
  "slug": "night-ferry",
  "title": "夜渡",
  "subtitle": "第四个故事（P4 · 用编辑器做出）",
  "entry": "渡口",
  "contractVersion": 1,
  "audience": "content",
  "files": [
    "stories/night-ferry/00-meta.twee",
    "stories/night-ferry/passages/01-渡口.md",
    "stories/night-ferry/15-tables.twee",
    "stories/night-ferry/17-rules.twee"
  ],
  "gates": []
}
```

## 4. 手写注意

- **`slug` 是键命名空间**：`Sg.store` 用它做 `<slug>.` 前缀 → 各故事互不串档；改名 → 存档键一起变。
- **`entry` 两端一致**：改起始段要**同时**改清单的 `entry` 与 `00-meta.twee` 的 `StoryData.start`。
- `audience: 'internal'` 是**显式决定**，不是"没写完"的标记 —— 内部件仍会被构建与门扫到。
