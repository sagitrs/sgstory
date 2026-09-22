# `00-story.json` —— 故事清单（manifest）

> 实况样本：`stories/night-ferry/00-story.json`。生成器：`editor/lib/core/story.mjs` 的 `manifestFor()`／`starterPackage()`。
> 消费方：`build.mjs`（认故事 · 加载顺序 · 书架）· `scripts/module-order.mjs`（`files`／`gates`）· `test/store-keys.mjs`。

## 1. 字段表

| 字段 | 型 | 必填 | 缺省 | 含义 · 校验 |
|---|---|---|---|---|
| `slug` | `string` | ✅ | — | 故事目录名（＝ `stories/<slug>/`）。**必须与 `00-meta.twee` 的 `Sg.storyId.slug` 一致** ⇒ `test/store-keys.mjs` 判红 |
| `title` | `string` | ✅ | `'未命名故事'`（起手模板） | 标题（书架／页面标题） |
| `subtitle` | `string` | — | `''` | 副标题（书架显示） |
| `entry` | `string` | ✅ | `'开场'` | **起始段的段落名**。必须与 `00-meta.twee` 的 `StoryData.start` **一致**（不一致 ⇒ 启始段找不到） |
| `contractVersion` | `number` | ✅ | `CURRENT`（＝ 1） | 契约版本；判据是「**必须等于 `CURRENT`**」（读 `N-1` 的兼容层是 `G-1c`，未落地） |
| `audience` | `'content' \| 'internal'` | ✅ | `'content'` | **上架与否**：`content` ⇒ 进书架；`internal` ⇒ 仍构建、**不列书架**。⚠️ **字段总要写**（读侧不补默认）；**缺字段或取值非法 ⇒ 构建直接报错**（fail-loud，防内部件被静默上架） |
| `files` | `string[]` | ✅ | — | 包内**件名**列表（`stories/<slug>/…`）。⚠️ **只能列真的存在的件**：漏列 ⇒ `build.mjs` 拒「故事件不在清单里」；多列 ⇒ 拒「清单里的文件不存在」 |
| `gates` | `string[]` | **✅（缺键 ⇒ 发现器报错**，`scripts/audit/gates/discovery.mjs:58`；**空数组 `[]` 合法**＝显式声明"本故事无自己的门"——`night-ferry` 即 `gates: []` 但 `gates/` 目录非空，见 `audit-json.md` §2） | `[]` | 该故事自己的门（`stories/<slug>/gates/**`） |

## 2. `files` 的顺序语义

`files` **不只是清单，也是加载顺序**（`stories/<slug>/**` 的顺序由它给 ⇒ 新故事**不必改引擎的 `ORDER`**）。

- **入口件 `00-meta.twee` 永远排第一**（`manifestFor()` 强制）；
- 其余按**编译输出序**（＝ `twee` 键序）；
- ⚠️ 调用方应把**与 `writeStoryPackage` 同一个 `twee` 对象**传进 `manifestFor()` —— 一处真源、两处消费（否则清单与产物必然漂移）。

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

- **`slug` 是键命名空间**：`Sg.store` 用它做 `<slug>.` 前缀 ⇒ 各故事互不串档；改名 ⇒ 存档键一起变。
- **`entry` 两端一致**：改起始段要**同时**改清单的 `entry` 与 `00-meta.twee` 的 `StoryData.start`。
- `audience: 'internal'` 是**显式决定**，不是"没写完"的标记 —— 内部件仍会被构建与门扫到。
