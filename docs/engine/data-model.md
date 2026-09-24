# 数据模型：角色状态是 `pc` 一个袋 ＋ **袋外变量**，结算是 `pc → pc′` 的状态转移

> 本文回答**上游**问题：**被写的那个东西是什么** —— 先回答它，"往哪儿写"（MD／JSON／宏三层）才有根据。
> 那篇回答"往哪儿写"（MD／JSON／宏三层）；本篇回答"写的是什么"（数据的形状与操作性质）。
> 形状与行为逐条取自 `src/10-core.twee`（`Game.Pc`）与 `src/engine/40-sim/21-resolve.twee`（`Sg.rules`）——**每一条附可复算命令**（`grep`／`sed` 行号）→ 不靠"实测"二字取信。

## 1. 角色状态一个根 ＋ **少量袋外变量**

**角色状态**挂在 **`State.variables.pc`**；但 **`pc` 不是唯一的根** —— 存档里还有**袋外变量**，其中至少 `State.variables.era`（时代）**被条件求值直读**（`src/engine/40-sim/21-resolve.twee:1211` `return State.variables.era === want;`）→ 它**不在 `pc` 下**，也不是任何实体的属性。

→ 精确表述：**角色状态 `pc` ＋ 少量袋外变量**（`era` 是已知的一例；“只有 `pc` 一个根”是**不成立**的简化）。

**读写不是同一对 API**（`pc` 面的实际分工，三条）：

| 面 | 入口 | 干什么 | 复算 |
|---|---|---|---|
| **条件键解析** | `Sg.rules.readKey(key, pc)` | 把**条件里的键形**解析成真值：`n_*` → 笔记真假；`inv:`／`gear:`／`era:` → 持有／行囊／时代；`pc.` → 从 pc 根走；其余裸键 → 按 `readPath` 并补 `ev.` | `21-resolve.twee:1205-1219` |
| **底层路径读写** | `Sg.notes.readPath(pc, path)` ／ `writePath(pc, path, true)` | 按**点路径**取值／写值（`ev.x`／`world.x`）；`readPath` 支持**数组＝多源 OR** | `src/80-script.twee:59`（`readPath`）；`writePath` 同文件 |
| **运行时槽** | `State.variables.*`（如 `era`） | 引擎自己维护的袋外状态 → 由故事在 `State.domains` 的 `runtime` 域**登记** | `21-resolve.twee:1211`；`stories/<slug>/data/tables.json` 的 `containers.State` |

注意：**“所有读写都经这两个 API”是错的收窄**：`readPath`／`writePath` 管**点路径**那一层；条件里的**键形**（`inv:`／`era:`／`gear:`／`n_*`）先经 `readKey` 解析，两者**不同层**。

## 2. 两层定义：**形状住引擎，数值走故事**（`#660` 片三-3）

`Game.Pc.defaults()` 只给**键名 ＋ 中性值**（`0`／`''`／`false`／`[]`／`{}`）；
故事侧 `Sg.story.pcDefaults()` **一层深合并**叠加自己的数值。

> **为什么**：`star.charge = 12` 是**某个故事的数值**；写进引擎 → 别的故事也带着它的量跑。
> **缺面 → 显式降级**（只给形状，不报错）；**面返回非对象 → 报错**（结构畸形）。

### 2.1 `defaults()` 的形状全集（复算：`sed -n '142,182p' src/10-core.twee`）

```js
{
  // 车卡
  name: '', round: 0, picked: [], mode: '',
  classKey: '', classLabel: '', bgKey: '', bgLabel: '', speciesKey: '', speciesLabel: '',
  abilities: null, skills: [], feats: [], gear: [], flags: {},
  // 数值（可增可减）
  hp: 0, max_hp: 0, gold: 0, salves: 0,
  // 机制态（结构化）
  gearHp: {},      // { 具名: 剩余耐久 }  —— 未启用耐久的故事恒为 {}
  statuses: {},    // { 部位: { 异常: 剩余回合 } } —— 未启用该机制的故事恒为 {}
  // 世界
  inv: {},         // { 名: true }
  star:   { charge: 0, spent: 0, first_free: false },
  keeper: { met: false, trust: 0, state: '', key: false },
  ev: {},          // 证据链（笔记记录 `ev.notes.<id>` 在其下）
  soc:    { att: {}, tries: {}, read: {} },      // 交涉台账
  dragon: { hp: 0, defeats: 0, awake: false, venom: false },
  world: {},       // 世界旗标
}
```

## 3. 按语义分五类（甲-1 的根据）

| 类 | 例 | 可复述？ | 声明面 |
|---|---|---|---|
| ① **知识／笔记** | `pc.ev.notes.<id>` | ✅ 能（"你知道了…"） | `yields` |
| ② **世界态** | `pc.world.x` · `pc.inv.名` · `pc.ev.x` | ❌ | `sets`（只置真）／`gives` |
| ③ **数值／态度** | `hp` · `gold` · `salves` · `star.*` · `keeper.*` · `dragon.*` | ❌ | **无**（词汇宏） |
| ④ **运行时／瞬态** | `ev.last_roll` · `ev.last_result` · `ev.soc*` · `ev.fight.*` · `ev.ending` · `soc.*` · `settle` | ❌ | 引擎自写（`runtime` 域） |
| ⑤ **机制态** | `gearHp{}` · `statuses{}` | ❌ | 机制块 |

判据（口诀）来自 `docs/notes-model.md`（**唯一权威**）：能写成"你知道了……"→ ①；只是"发生过／已拥有"→ ②；
运行时（不可复述、也不改变世界结果）→ ④；**一个键同时承担两类语义 → 拆成两个键**。

**登记纪律**（`--state` 门）：`pc.ev`／`pc.world` 的每个键**必须落在 `Game.State.domains` 的某个域里**，未登记 → 红。
域表落点是故事的 `stories/<slug>/data/tables.json` 的 `containers.State`：`domains`（`{id, keys[], prefix[], where, note}`）· `bookkeeping[]`（**只写不读**的记账键，须显式登记）· `dynamicKeys[]`（前缀／`via` 动态族）。
最小合法集 ＝ 只有 `runtime` 一个域（复算：任一最小故事的 `tables.json` 里 `containers.State.domains` 长度 ＝ **1**；原举例 `minimal-demo` 已随 `#1261` 下架）。

## 4. 结算的本质：引擎**已经**把它形式化了

这是理解"数据模型"最直接的一处读数 —— `Game.Pc` 提供了一对函数：

```js
Game.Pc.snap(pc)          // 结算前的快照 —— 只抓五个字段
Game.Pc.diff(before, pc)  // 结算后的差分 —— 生成玩家可见文案
```

`snap()` 返回**恰好五项**（复算：`sed -n '185,192p' src/10-core.twee`）：

```js
{ hp, gold, gearHp: {...}, statuses: {...}, inv: {...} }
```

`diff()` 用它算出人话：`−3 生命（8→5）` · `−5 金币` · `获得异常：手臂·流血（5 回合）` · `耐久 火把 2→1` · `得到 干粮`。

> → **引擎对"结算能改变玩家什么"的自我定义 ＝ 这五个字段的差分。**
>注意：`notes`／`world`／`ev` 旗标**不在快照里** —— 它们是**叙事记账**，不是"玩家看得见的结算"。

## 5. 结算的三条通道（**操作性质不同**，这是本篇的核心）

| 通道 | 写在哪 | 对数据的操作 | 数学性质 |
|---|---|---|---|
| **① 声明三格** | 表行 `yields`／`gives`／`sets` | `ev.notes[id]=true` · `inv[k]=true` · `writePath(…, true)` | **单调布尔写入 ＋ 幂等** |
| **② 具名动作宏** | 正文：`<<damage>>` `<<econ>>` `<<give>>` `<<take>>` `<<setflag>>` `<<note>>` … | `hp−=n` · `gold+=delta` · `delete inv[x]` · `statuses[部位][异常]=n` | **带值／可逆／非幂等** |
| **③ 原始计算** | 正文 `<<set>>`／`<<run>>` | 任意变换 | 任意（甲-1 **判红**） |

### 5.1 为什么①只有三格，且 `sets` 必须是布尔（**结构原因**）

`<<rules>>` 的落地时机是「**先渲染 `text` → 渲染成功后**再落 `yields`／`gives`／`sets`」（复算：`sed -n '1324,1333p' src/engine/40-sim/21-resolve.twee`）。
这条纪律成立的前提是 **幂等**：`Sg.notes.add` 连调两次只落一次、`applyGrants`／`applySets` 只在"真的新落下"时才计入
→ 结果留屏重放、重渲染都安全。

> **而②的操作天然不幂等**（`hp−=n` 执行两次就掉两次血）。
> → **它们无论如何不能挂在"渲染后落地"这条路上** —— 这不是"还没做"，是**安全性冲突**。
>
> 这就是裁定注记那句「`sets` 是布尔 → 数值＋持续只能用 hook／JS」的**根本原因**：
> **不是"声明面没地方放"，是"放进声明面就破坏了幂等性"**。

### 5.2 因此表达力是**分裂的**（以"选择后果"为例）

| 选择后果 | 能声明吗 | 当前唯一表达 |
|---|---|---|
| 获得知识（笔记） | ✅ | `yields: ["n_x"]` |
| 置世界旗标 | ✅ | `sets: ["world.x"]`（**只置真**） |
| 获得道具 | ✅ | `gives: ["月光花"]` ／ `<<give>>` |
| **获得金钱** | ❌ | `<<econ "事件id">>`（`Game.Economy.apply` 改 `pc.gold`） |
| **受到伤害** | ❌ | `<<damage 3>>`（内含"伤重自动消耗药膏"分支） |
| **部位异常** | ❌ | 机制块 → `pc.statuses[部位][异常]=回合` |
| **装备耐久** | ❌ | 机制块 → `pc.gearHp[具名]=剩余` |

→ **作者的"选择后果"要跨三种写法**：笔记/旗标/道具写成数据，伤害/金钱/异常/耐久写在正文宏里。

## 6. 缺口与主张（**待裁，见 `decisions.md` §二 P5**）

`#1049` 取「甲 · 维持现状」在**今天**成立（唯一内容故事 `night-ferry` 的正文效果宏 ＝ 0）。
但它的理由是「**没有第二个消费者**」，**掩盖了 §5.1 那条结构原因**：将来真有消费者时，会在这里撞上"声明面要求幂等、而带值写入不幂等"。

**主张（P5）**：若将来开面，目标形状应当是**对 `snap` 五字段的「具名增量」**，而非自由表达式：

```jsonc
{ "effects": [
    { "damage": 3 },                       // 数值
    { "gold": -5 },
    { "give": "干粮" },  { "take": "月光花" },
    { "status": { "part": "手臂", "id": "bleed", "turns": 5 } },
    { "gearHp":  { "火把": -1 } }
] }
```

名字**全部取自既有词汇宏**（`damage`／`econ`／`give`／`take`）→ 符合 `#1049` 甲"具名动作、不造表达式面"的约束与 `docs/notes-model.md` 的「别再造表达式面」。
**但代价必须在票面写死**：它**不幂等** → **不能走"渲染后落地"**，必须显式引入「**这一次结算**」语义（一次性、不可重放）；且需同时处置 `contractVersion`（承 `#1036` 注记的触发条件）。

→ **重新开面前必须先裁的是"结算时机语义"，不是"形状"。** 这是本稿给未来那一票的前置结论。

## 路径读写器的形态三类

`Sg.notes.readPath` / `writePath` 是**通用状态读写**工具，其路径参数分三类：
(1) **缺项**（`undefined`／键不存在）；(2) **结构畸形**（非字符串／空串／空段 `a..b`）；(3) **多源数组**。

**读是查询，写是命令**：读侧遇缺项按"没有数据"处理（返回 `undefined`，不出声）；写侧"没有目的地"不等于"缺数据"，
故**缺项与结构畸形同归出声**。多源数组读侧取 **OR**（`#432-B8/B12`），写侧为**歧义目的地**故出声
（多源必须显式声明 `setPath`，见 `#434`）。

因此 **"缺项即静默"只对读侧成立**，勿按"三类对称"改。
