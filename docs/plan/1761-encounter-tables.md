# B2 遭遇与掉落随机表，以及层梯度（#1761）

> 票号：#1761；伞票：#1728（一段的子伞 #1729）；契约出处：#1748 票面（领队裁定）。
> 判定面是**加权抽样语义**。权重分布与件数区间为 **house rule（非 SRD）**，因为 SRD 不规定层间的投放分布。
> 落地位置：`src/core/65-encounters.js`（原语）与 `src/dnd/dnd3/core/climb.js`（注册面接线）。

## 一、层、层梯度，以及「不入梯度」的机械含义

**层元数据**的契约形，由领队钉在 `#1748`：

```
{ id, type: 'climb' | 'hub' | 'exit', start?: true }
```

| 字段 | 语义 |
|---|---|
| `id` | 层标识，与遭遇表的键**同 id 配对**，以防出现两套命名 |
| `type` | `climb` 是段内攀爬层；`hub` 是大空洞整备区；`exit` 是顶层出口 |
| `start` | 该层是否为一段的起点，也就是 `RPG.startLayerId()` 的读取对象 |

**规范句（判定面）**：入梯度当且仅当 `type === 'climb'`。

`hub` 与 `exit` 都**不入梯度**。二者既不被 `RPG.gradientLayers()` 收录，也不参与遭遇或掉落的抽取。
因此「第 50 层不随梯度定标」是一个**结构性结论**，它由 `rollEncounter` 与 `rollLoot` 对非 `climb` 层返回空实现而来，
**不是**内容侧「记得别写条目」的自觉。内容侧即便误写了条目，抽取面也不会读到。

## 二、加权抽样的语义（规范句）

`RPG.pickWeighted(entries, { label })` 的语义如下。

1. **权重是相对值**，在同一次调用内归一，须**非负**；总权重须 **大于 0**。
2. **恰好消耗 1 次** `RPG.rng.unit()`，这是全仓唯一的随机入口，见 `#1710`；命中判据是累积权重越过 `u × 总权重`。
3. **权重为 0 的条目永不命中**，这一条用于「登记但不投放」的占位。
4. 空表、含非对象元素、权重非法、或全零权重，这几种情况都**抛错**（`err.code` 见第四节）；不静默返回 `undefined`。

**为什么把「恰好 1 次读数」写成规范句**：它使「注入定长序列，逐次可断言」成立，也使「多消耗一次」这类缺陷当场可见。
落地时以用例钉住，用例在 `tests/unit/core/encounters.test.js`。

## 三、条目契约与抽取

```
<层id>: {
  encounters: [ { ref: <角色注册id>, weight: N, elite?: bool } ],   // 加权抽 1..k 组
  loot:       [ { id: <道具注册id>,  weight: N, qty?: [min,max] } ]
}
```

| 规则 | 说明 |
|---|---|
| 引注册 id | 表内**不内嵌数值**。数值在定义面（`src/dnd/dnd3/monsters/**`、`items/**`），改数值不动本表 |
| `elite` | 精英标记，**由抽取原语原样带出**，本层不解释它的玩法含义 |
| `qty` | 件数闭区间 `[min,max]` 内的整数；**省略即 1 件**；一次区间取值**恰好再消耗 1 次** `RPG.rng.unit()` |
| `count` | 抽取笔数，取正整数；每次抽取**独立**，可以重复命中同一条目 |

**校验分两层，这是刻意分离的**：

- **注册时**由 `RPG.registerEncounterTable` 做，只校验**结构**，即形、权重类型与和、`qty` 形、`elite` 类型；结构不合法**即抛**。
  它**不**校验引用是否已注册，因为层表按数字前缀序常常先于怪物或道具定义加载，`climb.js` 就先于 `monsters/**`。
- **抽取时**由 `rollEncounter` 与 `rollLoot` 做，判引用是否在注册表；未知的 `ref` 或 `id` 会抛 `ENCOUNTER_UNKNOWN_REF`。
- **离线核对**由 `RPG.validateEncounterRefs(table)` 提供，供用例或门一次性核完整表。

## 四、错误码（`err.code`）

| code | 触发 |
|---|---|
| `ENCOUNTER_BAD_ID` | 注册表 id 非空字符串 |
| `ENCOUNTER_BAD_TABLE` | 表结构不合法，附 `problems` 数组 |
| `ENCOUNTER_EMPTY` | 抽样时候选为空 |
| `ENCOUNTER_BAD_ENTRY` | 候选含非对象元素 |
| `ENCOUNTER_BAD_WEIGHT` | 权重非非负数 |
| `ENCOUNTER_ZERO_WEIGHT` | 权重和为 0，抽不出来 |
| `ENCOUNTER_BAD_COUNT` | `count` 非正整数 |
| `ENCOUNTER_UNKNOWN_LAYER` | 层 id 未注册，这是数据错，**不**当作「无遭遇」 |
| `ENCOUNTER_UNKNOWN_REF` | 表内 `ref` 或 `id` 未注册 |

## 五、WorldMap 集成

`RPG.layerOfLocation(locationId)` 与 `WorldMap.prototype.layerOf/layerType` 的解析顺序是：先按**地点 id 精确命中**层 id，
因为攀爬层常以层 id 作地点 id；否则取**最长前缀**命中者，整备区的形如 `L10-camp`，因此命中层 `L10`。
两者都判不出时返回 `null`，无层语义的地图不受影响。

## 六、house rule 声明

**权重分布**（各层条目的权重取值）、**件数区间**（`qty`）、以及**层内 CR 带与价值带**（`SPAN1_SCALING`），
在本源书内**均无对应**，因此全部为 **house rule（非 SRD）**，由内容侧显式成文。
这一条承接 `#1729` 裁定②：段际缩放系数若未成文，即「未 pin 的隐藏判据」。
