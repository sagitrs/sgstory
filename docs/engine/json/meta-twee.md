# `00-meta.twee` —— 入口件

> 实况样本：`stories/night-ferry/00-meta.twee`。生成器：`editor/lib/core/story.mjs` 的 `metaTwee()`。
>注意：它是**唯一不生成的手写 `.twee`**：其余 `.twee` 都是产物。

## 1. 三个段

```
:: StoryTitle
夜渡

:: StoryData
{
	"ifid": "4FDB2374-A7A6-4181-AFDD-C2E53D79AAE9",
	"format": "SugarCube",
	"format-version": "2.37.3",
	"start": "渡口",
	"zoom": 1
}

:: StoryIdentity [script]
window.Sg ??= {};
window.Sg.storyId = { slug: 'night-ferry' };
```

| 段 | 内容 | 校验 |
|---|---|---|
| `StoryTitle` | 故事标题（SugarCube 读） | — |
| `StoryData` | 编译器元数据 | `ifid` **必须 UUIDv4 形态且大写 hex**（小写 → `Story IFID is invalid!` → rc=1）· `start` **必须 ≡ 清单 `entry`** |
| `StoryIdentity` | `Sg.storyId = { slug}` | **必须与清单 `slug` 一致** → `test/store-keys.mjs` 判红 |

## 2. 字段表（`StoryData`）

| 键 | 型 | 必填 | 含义 |
|---|---|---|---|
| `ifid` | `string` | ✅ | 故事唯一标识（UUIDv4）。**新故事必须新生成** —— 照抄既有故事会撞 |
| `format` | `string` | ✅ | `"SugarCube"` |
| `format-version` | `string` | ✅ | 本仓：`"2.37.3"` |
| `start` | `string` | ✅ | 起始段落名，≡ 清单 `entry` |
| `zoom` | `number` | — | 缩放（本仓为 `1`） |

## 3. 手写注意

- **`ifid` 生成**：`node -e "console.log(crypto.randomUUID().toUpperCase())"`。
- **两处一致性是双向的**：`slug`（清单 ↔ `StoryIdentity`）· `start`（清单 `entry` ↔ `StoryData`）。任一处漂移即红。
- 入口件**必须排在 `files` 首位**（见 [`story-manifest.md`](story-manifest.md) §2）。
