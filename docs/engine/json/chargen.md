# `data/chargen.json` —— 车卡数据集（可缺）

> 实况样本：`stories/face-fixture/data/chargen.json`。生成物：`18-chargen.twee`（家族第 4 类）。 <!-- path-exempt: `face-fixture` 已随 `#1261` 大裁剪删除（历史叙述）；现成样本见 `test/fixtures/m3-chargen-fixture/` -->
> 来源：`#1132` 块二 B2（`chargen.json` ＋ 声明式施加器，2026-09-22）／B3 步③①（数据面接通，生成 `18-chargen.twee`）；
> 引擎侧消费：`Sg.Chargen`（`src/80-script.twee`）与 `<<pickPreset>>`／`<<applyQuickPreset>>` 两宏。

## 1. 顶层

```jsonc
{
  "section": "StoryChargen",  // 必填（直接决定产物段头 `:: StoryChargen [script]`，抄错则数据与实况不符）
  "rounds":  [ Round, … ],  // 三轮（职业／背景／种族）
  "presets": [ Preset, … ]  // 快速成型预设（整条 picks 序列）
}
```

## 2. `Round`

| 字段 | 型 | 含义 |
|---|---|---|
| `title` | `string` | 轮标题（如「职业」） |
| `intro` | `string` | 轮引导语 |
| `options` | `Option[]` | 本轮可选项 |

## 3. `Option`

| 字段 | 型 | 含义 |
|---|---|---|
| `name` | `string` | 选项名（如「铁卫」） |
| `desc` | `string` | 选项描述（卡面用） |
| `effect` | `string` | 效果摘要（卡面用，人读） |
| `patch` | `object` | **声明式增量**（见 §4）——不含函数 |

## 4. `patch`：声明式增量（**不是命令式 `apply(pc)`**）

`patch` 是本片的核心形状：**数据里不写函数**，由引擎侧施加器解释执行。动词只有三个（封闭集）：

| 动词 | 形 | 语义 |
|---|---|---|
| `set` | `{ set: 值}` | 替换（或整个对象赋值，如 `abilities.set = {…}`） |
| `add` | `{ add: 数}` | 数值增量 |
| `append` | `{ append: […]}` | 数组追加 |

键路径用点号（`abilities.str`／`flags.lore`）；键可以是契约里的状态键。示例：

```jsonc
{ "abilities": { "set": { "str": 16, "dex": 12, "con": 15, "int": 10, "wis": 12, "cha": 10 } },
  "skills": { "append": ["运动", "恐吓"] }, "gold": { "add": 10 }, "flags.lore": true }
```

注意 施加器**写前深拷贝**（`_clone`）：契约是"绝不改写调用方数据"，否则同一预设连用两次会数值翻倍
（`#1132` B2 修的数据污染缺陷，两格回归在 `test/chargen-equivalence.mjs` 与 `test/chargen-apply.mjs`）。

## 5. `Preset`

| 字段 | 型 | 含义 |
|---|---|---|
| `name` | `string` | 预设名（如「铁卫」） |
| `pcName` | `string` | 该预设的角色名（**由数据接管**，宏面三格之一） |
| `desc` / `summary` | `string` | 描述／摘要（卡面用） |
| `picks` | `number[]` | 每轮的选项下标序列（走真生命周期 `pick()`，含去重与 `round` 记账） |

## 6. 生成链与消费面

```
data/chargen.json ──compile-story──→ 18-chargen.twee（@generated，家族第 4 类）
                                        │
                                        ├→ 运行期：Game.Chargen（rounds／presets）
                                        └→ 故事侧经 Sg.story.chargen() 取；宏 <<pickPreset>>／<<applyQuickPreset>> 驱动
```

- 契约侧只登记 `hasChargen`（`kind: bool-exists`，判 `!!window.Game.Chargen`）——**"有没有车卡"与"车卡数据是什么"分开**：
  后者走 `Sg.story.chargen()`（未注册该面的故事由引擎侧返回空值，可见行为不变）。
- 生成物与其余四类同族（`gitignore`／`clean-net` 白名单／`dist-fresh` 源面排除／K4 标记与新鲜度／`#1185` 守卫）。
- **行为等价**：预设终态有冻结基线（`gates/chargen-lifecycle-baseline.json`，`#1132` B2 动手前用旧路冻的），
  `test/chargen-equivalence.mjs` 逐字段比对。
