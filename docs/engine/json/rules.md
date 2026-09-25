# `data/rules.json` —— 条件表

> 规格与判据：`docs/engine/reference-spec.md` §1；写法决策树：`docs/manual/05-rules.md`。
> 编译：→ `17-rules.twee`（产物，`@generated`）。引擎消费：`Sg.rules.table()` → `pick()`。

## 1. 顶层

```jsonc
{
  "section": "StoryRules",   // 必填
  "key": "rules",            // 必填（引擎按它取行数组）
  "rows": [ … ]              // 条件行
}
```

## 2. 行字段表

| 字段 | 型 | 必填 | 含义 |
|---|---|---|---|
| `id` | `string` | ✅ | 稳定 id（机检与 UI 的键；亦作 `prereq` 的**引用目标**） |
| `scope` | `string` | ✅ | 作用域＝**段落名**，或 `段落#位点`。注意：段落必须存在，否则该行**不归属**（`orphans` 的机检**未实现**——`--rules` 开关不存在，见 `reference-spec.md` §3.0；现状由编辑器 UI 报告） |
| `prio` | `number` | ✅（本项目纪律） | **显式优先级**（降序；同 `prio` 保持声明序）。注意：**不靠表序** |
| `req` | `Cond[]` | — | **全部**满足 |
| `any` | `Cond[]` | — | **至少一个**（空＝不要求） |
| `exclude` | `Cond[]` | — | **都不**满足 |
| `prereq` | `string[]` | — | 前置**行 id**（不是条件项 → 不走 `holdsCond`） |
| `text` | `string` | — | 选中时渲染的正文。注意：两个时机（`#624` 裁定，`docs/criterion-design.md:329-332`）：**渲染期**只许纯渲染（禁 `<<set>>`／`pc.ev.x =`／`Sg.notes.add()`）；**点击态**（`<<link>>` 体内）许词汇宏——把点击授予改成渲染后授予＝改变时机＝改变行为 |
| `yields` | `string[]` ／ `{id, path}[]` | — | 授予**笔记**（走 `Sg.notes.add`，幂等） |
| `gives` | `string[]` | — | 授予**道具**（`pc.inv[k] = true`，幂等） |
| `sets` | `string[]` | — | 置**状态键**。注意：**只置真**（布尔）；**有笔记的键不得走这里**（必须 `yields`） |

## 3. 条件项 `Cond` 的两种形态

```jsonc
// ① 字符串：真值
"n_flower_warned"        // 笔记（n_*）
"ev.hall_seen"           // 证据链（裸键＝ ev.）
"world.flower_taken"     // 世界旗标
"inv:月光花"              // 持有物（前缀 inv:）
"era:past"               // 时代（前缀 era:）—— 值：present／past
"gear:火把"               // 行囊/装备（前缀 gear:）
"pc.gold"                // 显式根（顶层字段，用于算子比较）

// ② 对象：算子 —— op ∈ ['gte','lte','oneOf']（引擎宣告面）
{"gte": ["star.spent", 3]}
{"oneOf": ["keeper.state", ["seal"]]}
{"gte": ["pc.gold", {"price": "torch_buy"}]}   // 取值项：当前价格（正数）
```

**取值项**（`terms`）目前只有 `{price: '<econ 事件 id>'}` → 该事件**当前要花多少钱**。
注意：**未宣告的前缀／算子／取值项 → 引擎抛错**（不是静默为假）。

## 4. 选择语义

```
filter(scope)  →  按 prio 降序（同 prio 稳定）  →  取第一条命中
```

**`<<rules "作用域">>`（单选，first-match wins）**：先渲染 `text` → **渲染成功后再落** `yields`／`gives`／`sets`。
**`<<rulelist "作用域">>`（菜单）**：渲染**全部命中**的行（按 `prio` → 表序）——用于"还能问哪几个话题"。

注意："渲染成功后才落"这条纪律的前提是**幂等**（写两次＝写一次）→ 所以三格全是"置真"。
**数值（伤害／金钱）不能进表**，只能写正文的具名动作宏 —— 原因见 `docs/engine/data-model.md` §5.1。

## 5. 最小样本（可跑）

```jsonc
{
  "section": "StoryRules", "key": "rules",
  "rows": [
    { "id": "渡口.问船夫", "scope": "渡口", "prio": 10,
      "req": ["n_asked_ferryman"], "text": "他把篙往水里一插：\"雾里别回头。\"",
      "yields": ["n_warned"] },
    { "id": "渡口.软限", "scope": "渡口", "prio": 3,
      "req": [{"gte": ["star.spent", 3]}], "text": "水面薄了一层。" }
  ]
}
```

## 6. 手写注意

- **`scope` 必须与真实段落名一致**（段落名 → 文件名靠清单的 `files` 兜底，不是同名假设）。
- **每行都要有可命中场景**：死行＝同 `scope` 内**严格更高** `prio` ＋ 四类包含（`req`⊆／`exclude`⊆／`any` 相交／`prereq`⊆）→ 低行永不被选中——判定在**编辑器 UI**（`ruleRows.mjs::deadRows`，**未进门**）；同 `prio` 只进 `ties()` 报告不红；任一侧含对象算子（`gte`/`oneOf`）保守跳过（真算法：`reference-spec.md` §3.2）。
- **同 `prio` 同 `scope` 的多行**靠声明序稳定 —— 但**不要**把它当优先级机制用（同 `prio` 只是进 `ties()` 报告，不红——真算法见 `reference-spec.md` §3.2）。
- **现状**：唯一内容故事 `night-ferry` 的 `rows` **为空**；真数据只在内部夹具（39 行）。→ 手写第一个真实条件行时，没有现成"内容级"范例可抄（只有夹具）。
