# #1806 笔 1 支援：**存档可快照面清单**（全仓盘点）

> **本件用途**：#1806「JSON 存档契约」格式设计的**工料单** —— 列清「哪些状态面必须进快照、
> 各自落在哪、读写点在哪、是否已具备纯数据形态、有哪些依赖/陷阱」。
> **纪律**：每条给**可复现读数**（`git grep` 命令或 `文件:行`），✗ 凭印象；域内**现状 vs 应然**分列。
> **锚**：`origin/main@6cbf3b07`（本件所有行号/命中数皆在本 commit 实取）。
> **作者**：`sagitrs-writer`（支援席）；**票**：`sgstory#1806` 笔 1。

---

## 〇、速览：七域 × 现状判定

| # | 域 | 落点 | 纯数据？ | 判定 |
|---|---|---|---|---|
| 1 | **背包（inventory）** | `State.variables.inventory`（快照数组） | ✅ | **已就绪**（唯一读入口 `inv()`） |
| 2 | **玩家（player）** | `State.variables.player`（纯对象） | ✅ | **已就绪**（玩家经访问器桥接，A 面） |
| 3 | **地图位置（mapCurrent）** | `State.variables.mapCurrent`（纯字符串 id） | ✅ | **已就绪**（`#1760` 落；只搬 id，**未搬图结构**） |
| 4 | **存量（stocks）** | **落在角色 `stats.<stockId>`**（直读，✗ 缓存） | ✅（随 `player.stats` 进档） | **已就绪**但**非独立域**（与 stats 同生共死） |
| 5 | **通知（notices）** | `State.variables.rpgNotices`（有界数组）＋ `rpgNoticeFilter` | ✅ | **已就绪**（`#1802` B4） |
| 6 | **效果（effects / effectTurns）** | `State.variables.player.effects` / `.effectTurns`（桥接） | ✅ | **已就绪**（桥接到 player，A 面） |
| 7 | **场景 id（sceneId）** | `State.variables.sceneId`（字符串） | ✅ | **已就绪**（写点单点） |
| 8 | **建筑/农田（span1Farms / span1Harvests）** | `State.variables.span1*`（数值） | ✅ | **已就绪**但**裸键**（见 §三注 3） |
| 9 | **旗标（flags）** | —— | —— | **不存在**（`flags\|setFlag\|getFlag` **0 命中**）⇒ 格式设计时**可预留键位**，勿“以为已有” |
| 10 | **NPC/怪物（actors）** | **无现役落点**（仅 `README.md:114` 示例 `$actors`） | ✅（`toJSON` 具备） | **应然面**：现役无 NPC 进档 ⇒ 见 §二「堆上面」 |

**总判**：**1–8 已有落点且皆纯数据** ⇒ **笔 1 的 payload 七域实测「已有六域半」**；
**真缺口在「堆上面」（§二）**：`locations/exits`（图结构）、`hp`（属 Role 实例）等 —— 它们是**读档错位**的来源。

---

## 一、逐域详表（读写点 · 消费者 · 陷阱）

### 1. 背包 `State.variables.inventory`
| 项 | 读数 |
|---|---|
| 唯一读入口 | `src/core/30-inventory.js:8-10`（`inv()`：缺则初始化 `[]`） |
| 写点 | `RPG.give`（`:14`）／`useItem`（`:97`）／`loot`（`push`）／`take` |
| 形态 | `[{id, charges, equipped}, …]` **纯快照**（`10-item.js:62` 的 `toJSON`） |
| 还原 | `RPG.reviveItem(snapshot)`（`10-item.js:91`，按 `id` 从**注册定义**重建） |
| 消费者 | `RPG.has/equippedIn/slotEquip/inventoryLabel`；**两包 `player.items` 桥接同一数组**（`30-inventory.js:216`） |
| ⚠ 陷阱 | ★`useItem` 的检索面**固定在玩家背包**（`30-inventory.js:234`）⇒ 同伴/敌人的用道具面另立 |

### 2. 玩家 `State.variables.player`
| 项 | 读数 |
|---|---|
| 形态 | `DEFAULTS` 纯对象（`dnd3/player.js:20-27`：`name/hp/maxHp/stats`；5E/d20m 同构） |
| 桥接 | `Object.defineProperties(…, {name,hp,maxHp,stats,items,effects})`（`dnd3/player.js:53-63`） |
| 三包同形 | `dnd3/player.js`、`dnd-5e/player.js`、`d20m/player.js`（**同 id `player` ⇒ 跨包遮蔽 `#1743`**） |
| ⚠ 陷阱 | **三包同名 `player`** ⇒ 后注册者覆盖；存档只存**一份** `$player` ⇒ 切换包时**语义可能变**（迁移链须记 `pack`） |

### 3. 地图位置 `mapCurrent`
| 项 | 读数 |
|---|---|
| 键名规则 | `world`（或缺省）⇒ `mapCurrent`；具名地图 ⇒ `mapCurrent_<id>`（`60-map.js:66-68`） |
| 写点 | **单点**：`moveTo` 内 `_syncToState()`（`60-map.js:88-92`） |
| 读点 | 构造时 `_restoreFromState()`（`:78-86`，静默策略：无键则保持） |
| ⚠ **范围** | ★本键**只搬 `current` 一项** —— `locations`／`exits`／钩子仍**全在堆上**（`60-map.js:55-57`）⇒ 见 §二 |

### 4. 存量 `stocks`
| 项 | 读数 |
|---|---|
| 定义面（堆上注册表） | `RPG.stocks = new Map()`（`18-stock.js:43`）—— **定义随包加载，✗ 不进档**（正确：def 是代码） |
| **实例侧真值** | `RPG.stockOf(c,id) => c.stats[id]`（`:123-126`）⇒ **存量落在角色 `stats`** |
| 写原语 | `RPG.consumeStock(c,id,n)`（`:134`，唯一写面） |
| 派生存量 | `RPG.syncDerivedStocks`（`:216`，按**道具侧真值**重算视图；`isDerivedStock` `:196`） |
| ⚠ 陷阱 | **存量不是独立域**——它是 `stats` 的字段 ⇒ 快照若把 `stats` 当普通对象存即可；但**派生视图**（`derivedFrom`）须在**加载后重算**（✗ 存镜像，否则双写漂移） |

### 5. 通知 `rpgNotices` / `rpgNoticeFilter`
| 项 | 读数 |
|---|---|
| 落点 | `State.variables.rpgNotices`（`71-notice.js:78-82`；**有界**默认 200）＋ `rpgNoticeFilter`（`:120`） |
| 无 State 时 | 落内存 `memNotices`（`:76`）⇒ 加载器须**容错两种环境** |
| ⚠ 陷阱 | 有界缓冲（截断）⇒ **往返相等判据对「超限历史」不成立**（E11 形须用行为断言，✗ 比值） |

### 6. 效果 `effects` / `effectTurns`
| 项 | 读数 |
|---|---|
| 形态 | `effects: string[]`（id 串，含层级 `exhaustion:3`）｜`effectTurns: {id→n}`（`20-character.js:27-31`） |
| 桥接 | 玩家经 `bridge('effects')`（`dnd3/player.js:63`）；`effectTurns` **随 `toJSON` 存档**（`20-character.js:29`） |
| ⚠ 陷阱 | ★`effects` 存的是 **id 字符串** ⇒ 加载时**依赖 `RPG.effects` 注册表**已就位（**加载序**敏感）；未注册 id 的行为见 `20-character.js:51-67`（**抛错 `EFFECT_UNKNOWN`**） |

### 7. 场景 `sceneId`
| 项 | 读数 |
|---|---|
| 写点 | `State.variables.sceneId = nextScene.id`（`50-scene.js:61`，舞台模式唯一写点） |
| ⚠ 陷阱 | 链式模式（`chain:true`）**不产生历史/不写 sceneId** ⇒ 快照语义须区分两模式 |

### 8. 建筑/农田 `span1Farms` / `span1Harvests`
| 项 | 读数 |
|---|---|
| 落点 | `State.variables.span1Farms`／`span1Harvests`（`dnd3/items/resources.js:214-215`，`FARM_KEY` `:141-151`） |
| ⚠ **命名风险** | 这两个键是**包内私有**裸键（`span1*` 前缀）⇒ **无命名空间约定**；随段数增长会**散键**（段 2/3 若照抄即 `span2*`…）。**格式设计建议**：收成 `np.<pack>.<key>` 或 `byPack: { dnd3: { farms: 0 } }`（★这是笔 1 可顺手定的**结构决策**） |

---

## 二、★真缺口：**堆上面**（不进 State ⇒ 读档错位）

`git grep -nE "this\.(current|locations|exits)\s*=" src/core/60-map.js` ⇒ `:55/:56/:57` **三行皆实例字段**。

| 面 | 现状 | 影响 | 归谁 |
|---|---|---|---|
| `WorldMap.locations` | `new Map()` 实例 | **图结构不进档** ⇒ 读档后**若图由代码重建**则无碍；**若运行时增删点**即错位 | `#1806` 笔 1（决策：图是**代码面**还是**状态面**） |
| `WorldMap.exits` | `[]` 实例 | 同上 | 同上 |
| `Character.hp`（NPC） | 实例字段 | ★已有**显式规避**：`goblin.js` 用 `:enginerestart` 事件重置；`README.md:114` 教人存 `$actors` 快照 | 内容侧惯例，✗ 契约面 |
| `Location.onEnter/onExit` | 函数 | **不可序列化**（正确：属代码） | 设计上应**只序列化 id** |

**⇒ 笔 1 的核心决策点**：**「什么算状态」的边界** —— 建议口径：
1. **可序列化且会变** ⇒ 进 payload（1–8 域）；
2. **不可序列化（函数/类实例）** ⇒ **只存 id**，加载时由**注册表重建**（`reviveItem` 已是此形）；
3. **纯代码常量（def 面）** ⇒ **不进档**（`RPG.stocks`／`RPG.effects`／`RPG.items`／`RPG.layerMeta`／`RPG.encounterTables` 等 7 个注册表，`§〇` 末引）。

---

## 三、依赖与陷阱（格式设计须一并处置）

1. **加载序敏感**：`effects` 存 id 串、`items` 存 `{id}` ⇒ **加载必须在包注册之后**（`RPG.effects/items/stocks/characters` 全就位）。⇒ 迁移/加载器须声明**加载时序契约**（✗ 只写「反序列化」）。
2. **跨包遮蔽（`#1743`）**：三包同 id `player`／`club` 等 ⇒ 快照须记 **`pack`**（或 `saveVersion` 一并记），否则换包读档会**静默取错定义**。
3. **命名空间缺失**：`span1*` 裸键（§一.8）＋ 无 `flags` 系统（§〇.9）⇒ 建议格式层**预留** `flags`／`byPack` 结构，**一次定死**，免各包自造键名。
4. **有界缓冲**：`rpgNotices` 有 200 上限 ⇒ **往返判据不可用「数组逐字等」**（须行为断言，`#1806` §四条边界 2 已立此规矩）。
5. **宿主面未挂**：`Save.onSave/onLoad`／`Config.saves` 在 `src/**` **0 命中** ⇒ 笔 1 是**首次接入**（无历史包袱，也无既有约定可循）。
6. **历史/回退面**：`State.history`／`previous()` 在 `src/**` **0 命中** ⇒ 回退按钮目前靠 **SugarCube 宿主原生**；**快照格式须与宿主回退共存**（✗ 假设只有我们一套状态机）。

---

## 四、给笔 1 的**建议 payload 骨架**（照 §〇／§二 口径，✗ 预设实现）

```jsonc
{
  "saveVersion": 1,          // ★第一天就带（#1806 边界 3：迁移链不得后补）
  "pack": "dnd3",            // 跨包遮蔽解（§三.2）
  "state": {
    "player": { …纯对象，含 stats/effects/effectTurns… },   // 域 2+4+6
    "inventory": [ {id, charges, equipped}, … ],            // 域 1
    "map": { "world": { "current": "L3" } },                // 域 3（具名地图同形）
    "sceneId": "…",                                          // 域 7
    "notices": { "items": [ … ], "filter": "all" },          // 域 5
    "flags": {},                                             // ★预留（域 9：现不存在）
    "byPack": { "dnd3": { "farms": 0, "harvests": 0 } }      // ★收拢裸键（§一.8 / §三.3）
  },
  "runtime": { "pc": "…", "startedAt": "…" }                 // 仅诊断，✗ 参与判定
}
```
**不进 payload**（属代码面，`§二` 口径 3）：`RPG.{items,effects,stocks,characters,stocks,pipelines,noticeChannels,layerMeta,encounterTables,buildEffects,slotLabels}`。

---

## 五、本件的方法学自陈（可复核性）

- 所有「0 命中／N 处」读数皆 `git grep` 于 `origin/main@6cbf3b07` 实取，命令随文给出（§〇／§三）。
- **「不存在」类断言**（`flags`、`Save.onSave`、`State.history`）已给**扫描面**，✗ 以「无命中」代替「未扫」。
- 本件**只盘点**，✗ 不含实现建议之外的设计（骨架仅作**讨论起点**，最终归笔 1 作者）。
