# `data/contract.json` —— 接入契约（`Sg.story.*`）

> 边界与三条缺省纪律：`docs/engine-story-boundary.md` §1（**权威**）。本文件只写**文件形状与 `kind` 全集**。
> 编译：→ `15-tables.twee` 的 `StoryBindings` 段（产物）。分类实现：`editor/lib/core/classify.mjs`。

## 1. 顶层

```jsonc
{
  "section": "StoryBindings",   // 必填
  "note": "…",                  // 可选
  "members": [ Member, … ]      // 契约成员
}
```

## 2. `Member` 字段

| 字段 | 型 | 必填 | 含义 |
|---|---|---|---|
| `name` | `string` | ✅ | 成员名（故事侧 `Sg.story.<name>`） |
| `kind` | `string` | ✅ | **封闭集**，见 §3 |
| `docs` | `string` | — | 说明（供人读；不进门） |
| 其余 | 依 `kind` | — | 见 §3（如 `path`／`value`／`from`／`key`／`default`…） |

## 3. `kind` 封闭集（**权威＝`editor/lib/core/emit.mjs:82` 的 `KINDS`**，共 **12**；复算：`node -e "import('./editor/lib/core/emit.mjs').then(m=>console.log(Object.keys(m.KINDS)))"`；`classify.mjs` 是消费方，自身也如此声明）

| `kind` | 额外字段 | 含义 |
|---|---|---|
| `empty-object` | — | 空对象（`{}`）—— "有这张表，但是空的" |
| `empty-array` | — | 空数组（`[]`） |
| `null` | — | 明确无此面（**调用方必须跳过，不许当空表**） |
| `const` | `value` | 常量（数字/布尔/字符串） |
| `game-ref` | `path` | 指向引擎全局（如 `Game.Economy.events`） |
| `identity-string` | — | 恒等字符串（`(x) => String(x)`） |
| `lookup` | `from`, `key` | 查表：`{from, key, default?, optional?, required?, error?}` |
| `lookup-field` | `from`/`via`, `key`, `field`, `fallback?`, `required?` | 取字段 ＋ 兜底 |
| `bool-exists` | `path` | `!!window.X` |
| `state-ref` | `path`, `default?` | `pc?.<path>?? default` |
| `forward` | — | 转发到引擎侧实现（`face-fixture` 的 `battleDamage` 在用） |
| `template` | — | 模板发射（**编译器有、故事未用**） |

**逃生舱 `kind: 'js'` 的实测清单为空**：`hollow-cave` 的 15 个契约成员全部可用上表表达（该故事已按 `#1004` 删除，作为历史读数保留）。

## 4. 三条缺省纪律（**三类不许混**）

`docs/engine-story-boundary.md` §1 定：

| 语义 | 缺省行为 |
|---|---|
| **结构缺失** | **报错**（未注册却来取数据必须炸，不许静默 `0`／空） |
| **可选缺省** | 明确的 `null`／`[]`（"没有捷径"是合法状态） |
| **文案缺失** | **兜底**（那是 `copy()` 的事，不是这里的） |

→ **三类不许合成一个 `?? {}`**。

## 5. 实况样本（**节选**——完整成员以真件为准）

>注意：下列为**节选示例**，不是可照抄的最小集：真实故事 `night-ferry`／`minimal-demo` 的完整契约各 **14** 个成员（复算：`python3 -c "import json;print(len(json.load(open('stories/minimal-demo/data/contract.json'))['members']))"`），缺 `notes`／`pcDefaults`／`checkSite` 等会撞 `Sg.story.*` 的「结构缺失 → 报错」纪律。写新故事 → 完整摘录一份现有故事的 `contract.json` 起步，别按本节选拼。

```jsonc
{ "name": "rules",      "kind": "empty-array",  "docs": "条件表：空表（合法）" }
{ "name": "mechanics",  "kind": "null",         "docs": "新机制声明表：未启用 ⇒ null（调用方必须跳过）" }
{ "name": "poisonReduce","kind": "const", "value": 0 }
{ "name": "econEvents", "kind": "game-ref", "path": "Game.Economy.events" }
{ "name": "hasChargen", "kind": "const", "value": false, "docs": "没有车卡（实测 `minimal-demo` 形态；`bool-exists` 判的是 `!!window.X`——别混）" }
```

`face-fixture`（**25** 个成员）实测分布：`game-ref` 8 · `const` 6 · `lookup` 5 · `bool-exists` 1 · `state-ref` 1 · `forward` 1 · `empty-array` 1 · `null` 1 · `lookup-field` 1（来源：`#1188` 第一片删两名零读取成员后的树面，2026-09-22）。

**`const` 族（6 名）**：`pcDefaults`（对象）· `prepick`（数组）· **`starBudget`（6）** · **`flipItem`（`'时光护符'`）** · **`flipStarCost`（1）** · **`flipReturnFlag`（`'fog_thin'`）**。后四名是 `#1132` 块二新定的参数口子（星力预算与时代翻转的道具／代价／旗标；来源：`#1132` B3 步②，2026-09-22），此前文档零提及。

## 6. 手写注意

- **新故事照最小合法集写**（本故事不新增面 → 不新增登记）；有面才登记。
- **`null` 与 `empty-*` 语义不同**：`null` ＝"这一面不存在，调用方跳过"；`empty-*` ＝"这一面存在且为空" —— 混用会让调用方的分支写错。
- 契约的**成员集合**就是 `{{名字}}`（正文取值）的**候选声明面**（见 `decisions.md` 的 **P2**，**待裁**）。
