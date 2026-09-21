# `data/notes.json` —— 笔记表

> 模型与口诀：`docs/notes-model.md`（**唯一权威**）。本文件只写**文件形状与字段**。
> ⚠️ 它是一个登记过的 **EXTENSION**（`editor/lib/core/contractVersion.mjs` 的 `EXTENSIONS`）：ADD 新面可 `CURRENT` 不变，但**必须在 `EXTENSIONS` 显式登记**。
> 特点：**一个数据文件 → 多份产物**（`blocks[]` 每块产出一份 `16-notes-*.twee`）。

## 1. 顶层

| 字段 | 型 | 必填 | 含义 |
|---|---|---|---|
| `note` | `string` | — | 作者自述 |
| `eraMap` | `{ present: string, past: string }` | ✅（用了 `era` 时） | 把 `era` 的**声明式枚举**（`"present"`／`"past"`）展开成引擎引用（`window.Game.Era.PRESENT`）。⚠️ **值不在表里 ⇒ 编译期抛**（不许静默产出 `undefined`） |
| `blocks` | `Array<{ file, section, entries }>` | ✅ | 一块 → 一份产物 |

## 2. `blocks[]`

| 字段 | 型 | 必填 | 含义 |
|---|---|---|---|
| `file` | `string` | ✅ | 产物名（如 `16-notes-ch1.twee`）。**缺 ⇒ 编译器抛错**（块名是必填，不许产出无名产物） |
| `section` | `string` | ✅ | 该块的段落名（`:: <section> [script]`） |
| `entries` | `{ [笔记 id]: Entry }` | ✅ | 该块的笔记条目 |

## 3. `Entry` 字段表

| 字段 | 型 | 必填 | 含义 |
|---|---|---|---|
| `title` | `string` | ✅ | 笔记标题（笔记页显示） |
| `src` | `string` | ✅ | **来源**（玩家视角的"从哪知道的"，如 `酒馆`） |
| `body` | `string` | ✅ | 正文 |
| `tags` | `string[]` | — | 分类标签（笔记页分组） |
| `era` | `'present' \| 'past'` | — | **时代归属**（用于权威性判定）；值经 `eraMap` 展开 |
| `flagPath` | `string` \| `string[]` | ✅ | 该笔记**读哪个旗标**（阶段 1 零行为变化）。**数组＝多源 OR**（同一知识的几条获取路径取 `any`） |
| `derived` | `bool` | — | **推定知识**：知识由世界态蕴含（如"下过地下即见过它"）⇒ 必须标记，让"笔记＝知识"与"笔记读世界态"两种语义在表上分得开 |
| `prereq` | `string[]` | — | 顺序敏感：必须先拿到这些笔记（**纯集合模型会丢掉叙事顺序**） |

## 4. 实况样本

```jsonc
{
  "note": "…",
  "eraMap": { "present": "window.Game.Era.PRESENT", "past": "window.Game.Era.PAST" },
  "blocks": [
    { "file": "16-notes-ch1.twee", "section": "Game Notes 夹具补漏",
      "entries": {
        "n_tav_tips": {
          "title": "柜台那两句提醒",
          "src": "酒馆",
          "tags": ["夹具"],
          "body": "老板娘说过两件事：别在雾里睡觉；听见有人叫你名字，别应。",
          "era": "present",
          "flagPath": "ev.tav_tips"
        }
      }
    }
  ]
}
```

## 5. 手写注意

- **`flagPath` 是"读"，不是"写"**：阶段 1 它读现有旗标（零行为变化）；写法仍走 `<<note "n_x">>` 或规则行 `yields`。
- **多源必须显式**：`flagPath` 是数组 ⇒ 该笔记有 ≥2 条获取路径 ⇒ 授予时要用 `<<notepath "id" "path">>`（**路径限定**），不能用单源的 `<<note>>`。
- **`Notes.entries` 在 `tables.json` 里也可以是数据源**（`face-fixture` 用它给空表）—— 两处都指同一容器，别重复声明同一 id。
- 调用入口（薄封装，唯一）：`Sg.notes.has(id)` / `add(id)` / `all()` / `missing(req[])`。
