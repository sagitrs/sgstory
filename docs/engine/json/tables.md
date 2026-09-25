# `data/tables.json` —— 声明面（容器由故事声明；下列 15 个＝`face-fixture` 的全集）

> 复算：`python3 -c "import json;print(sorted(json.load(open('stories/face-fixture/data/tables.json'))['containers']))"`（15 个）；同法 `night-ferry` → 12 个（含 `Shifts`）。
>注意：**不是封闭集**：`night-ferry` 另有 `Shifts` 容器（本表未逐字段——按「容器由故事声明」口径，写故事时按需声明）；`night-ferry`／`minimal-demo` 各 12 个容器、无 `Codex`/`NPC`/`Star`/`Dragon`。照本表**全集照抄**会得到与两个既有故事都不同形的包。

> 实况样本：某故事的 `tables.json`（最全／最小各一；原举例 `face-fixture`／`minimal-demo` 已随 `#1261` 下架）。
> 编译：`editor/compile-story.mjs` → `15-tables.twee`（产物）。形状校验：`scripts/audit/lib/story-shape.mjs`（**六条**，见 §17）。
>注意：**编译器的键名是 `containers`**（写成 `rows` → `undefined` → **静默**产出一句空赋值）。

## 1. 顶层

```jsonc
{
  "section": "Game Tables",   // 必填（缺 ⇒ 编译器干净拒绝）
  "note": "…",                // 可选：作者自述
  "containers": { … },        // 15 个容器，见下
  "merges": [ … ]             // 可选：并入的容器（见 §16）
}
```

## 2. `Checks` —— 判定位点

| 字段 | 型 | 含义 |
|---|---|---|
| `sites` | `{ [位点名]: { abil?, skill?, dc, dis?, nat?, auto?}}` | **判定位点表**。`abil`＝属性检定（`Game.Rules.ABILITIES` 的键）／`skill`＝技能检定；`dc`＝目标值；`dis`＋`disWhy`＝劣势；`nat`＝大成功/大失败的骰面；`auto`＝自动成功条件 |
| `keyYields` | `string[]` | 该故事用到的**关键产出**（门用） |
| `knowledge` | `{ [位点名]: 情报 id}` | 位点 ↔ 情报捷径（"带情报重试给优势"）。**可选面** → 无捷径是合法状态 |

注意：`abil` 与 `skill` **都是检定**但读不同的表：`abil` 走属性调整值、`skill` 走技能加值 —— 混用会让减成不生效。

## 3. `Combat` —— 战斗

| 字段 | 型 | 含义 |
|---|---|---|
| `pools` | `{ [池名]: [动作 id…]}` | **作战池**：每轮从池里随机 3 选 1 |
| `actions` | `{ [动作 id]: { site, label, ok, crit, bad}}` | 每个动作是一次**位点检定**；`ok`／`crit`／`bad` 为分档后果：`{ text, dmg?, hurt?}` |

`dmg` ＝ 对敌伤害；`hurt` ＝ 对自己的反伤。

## 4. `Economy` —— 经济

| 字段 | 型 | 含义 |
|---|---|---|
| `prices` | `{ [事件 id]: number}` | 显式价格表（注意：**运行时真源不读它**：`{price:…}` 实调 `Game.Economy.priceOf`（`src/engine/40-sim/21-resolve.twee:356`）＝事件 `delta` 经 `skillDiscount`/`featDiscount` 折扣后的值，**不读 `prices`**——反例：`drink_round` 的 `prices`=5 vs `delta`=−3 → 条件实值 3；`prices` 现由编辑器侧展示消费） |
| `events` | `{ [事件 id]: { delta, gives?, chapter?, note?, skillDiscount?, featDiscount?}}` | `delta`＝金币增量（**负数＝花钱**）；`gives`＝随赠（`{gear:[…]}`）；`skillDiscount`／`featDiscount`＝按技能/专长折扣 |

## 5. `Gear` —— 装备

| 字段 | 型 | 含义 |
|---|---|---|
| `defs` | `{ [名]: { kind?, protects?, maxHp?, reduce?, damage?, advSites?, from?, note?}}` | 装备定义 |

注意：**实测形状与文档不一致（本仓已知漂移）**：**本页 §5.1** 声明的 `gearDef(id)` 是 `{kind,protects,maxHp,reduce,note}`；
而**代码实际读** `damage`（`Game.Gear.damageBonus`）与 `advSites`（`Game.Gear.advSource`），
`face-fixture` 的 `Gear.defs` 也是 `{from,damage,advSites,note}`。→ **两者是同一字段名的两套口径**，见 `decisions.md` 的待定项。

### 5.1 装备声明 `Sg.story.gearDef(id)` —— **字段表**（★口径门**逐字**比对本表 ↔ 代码 ✓）

> 来源：原 `docs/story2-contracts.md` §1.2（★该件已按"一份为准"删除 ⇒ 本表即其宿主 ✓；装备属 `tables.json` 面 ✓）。

>注意：**本节字段表以引擎实况为准**（`#1115` 件②）：表的字段集 ＝ **引擎在战斗路径实际读的**那组
>（`src/engine/40-sim/21-resolve.twee` 的 `Sg.story.gearDef(k)?.<字段>`）。**口径门**（`scripts/lib/gear-defs-criteria.mjs`）
> 逐字比对本表 ↔ 代码读的字段集 → **对称差非空即红**（给本文档加一个代码不读的字段 → 红；从本表删一个代码在读的字段 → 红）。

| 字段 | 型 | 含义 | 缺省 |
|---|---|---|---|
| `damage` | `number` | 该件提供的伤害值（引擎累加：`:450`／`:453`） | `0` |
| `advSites` | `string[]` | 该件**有优势**的位点（引擎按 `includes(site)` 判：`:456`） | `[]` |

>注意：**被本节取代的那一套**（`kind`／`protects`／`maxHp`／`reduce`）：**不是被删，而是被标为"引擎未读"** ——
> 本节的旧字段表曾按"护具契约"写（`kind`／`protects`／`maxHp`／`reduce`），而引擎在战斗路径**只读**上面两字段
>（一手证据：`stories/face-fixture/15-tables.twee` 的 provider 是 `Game.Gear.defs` 的**直通** → 故事按旧表写 → 引擎读不到）。
> → **旧四字段若要启用，须先在引擎里接线**（另票）；在那之前，本文档**不再声明**它们为 provider 字段（防止"按文档写 → 引擎不认"）。

## 6. `Items` —— 道具

| 字段 | 型 | 含义 |
|---|---|---|
| `defs` | `{ [名]: { from?, note?}}` | 道具定义（图鉴文案） |
| `effects` | `{ [名]: { advSite?, advSites?, flatDamageReduce?, note?}}` | 道具的**被动效果**：在某位点给优势／整场受击减成 |
| `poisonReduce` | `number` | 毒液压制值 |

注意：`items.effects` 与 `Gear.defs.advSites` **语义重叠**（同一件事两个家）—— 现状详见 `docs/engine/data-model.md` §四。

## 7. `Notes` —— 笔记（声明面）

| 字段 | 型 | 含义 |
|---|---|---|
| `entries` | `{ [笔记 id]: { …}}` | 笔记条目（形状见 [`notes.md`](notes.md) §3） |

注意：`face-fixture` 的 `tables.json` 里 `Notes.entries` 是 `{}`，真数据在 `data/notes.json`（**EXTENSIONS**）。

## 8. `Social` —— 交涉

| 字段 | 型 | 含义 |
|---|---|---|
| `asks` | `Array<{ id, tag, npc, q, base, yield?, sites?, levers?, done?, yields?, ok, bad, auto?}>` | 交涉事项表：`base`＝基础态度（`friendly`／`neutral`／`hostile`）；`levers`＝可用的手段；`ok`／`bad`／`auto` ＝三档文案 |
| `attAdj` | `{ friendly, neutral, hostile}` | 态度偏移档位（数字） |
| `approaches` | `{ [手段]: { verb, onFail?, onOk?, read?, note?}}` | 手段表（游说／恐吓／表演／洞悉／察觉…） |
| `ATT` | `{ friendly, neutral, hostile}` | 态度的**显示文案** |

## 9. `Truth` —— 真相命题

| 字段 | 型 | 含义 |
|---|---|---|
| `claims` | `Array<{ id, claim, sites: Array<{ p, anchor, via, type}>}>` | 命题 ＋ 它的**多个锚点**；`type` ∈ `codex`／`prose`／`echo`／`social`（**声明须与来源一致**，D8 门判） |

## 10. `Echoes` —— 回响（延迟后果）

| 字段 | 型 | 含义 |
|---|---|---|
| `list` | `Array<…>` | 回响条目（本仓为空表 → **配了但没用**，见 `docs/manual/12-data.md`） |
| `revisit` | `Array<…>` | 重访条目 |

## 11. `Codex` —— 图鉴

| 字段 | 型 | 含义 |
|---|---|---|
| `items` | `{ [名]: { hint, clues: Array<{ id, label, req}>}}` | 每个词条：`hint`＝提示语；`clues`＝**逐步解锁的线索**，`req` 是条件项数组（与规则行**同一语法**，含 `inv:`／`n_*`／`{gte:…}`） |

### 11.2 段落数据的三支占位（`#1350` 片 2/4）—— **`{{名}}` 编译成什么**

> 契约（✗ 不是实现说明）：`data/passages.json` 的散文里 `{{名}}` 只有**三种**可能，编译形态**各有唯一去处**。

| 占位种类 | 判定 | 编译成 | 为什么 |
|---|---|---|---|
| **落位** `slot` | 名 ∈ 本段各链接的 `slot` | **拼装期**就地换成该链接的渲染（`[[label\|to]]` 或段尾块） | 位置维 ⇒ 编译期就能定（✗ 不需要运行时口） |
| **入参** `param` | 名 ∈ 本段 `params` | **引擎侧宏 `<<printparam "名">>`** ⇒ 从 **`Sg.inargs` 的闭包缓冲**（按段名键）取值 | 值只有**跳转时**才知道（"我从哪条链接来"）⇒ 必须运行期取值 ✗ 不许编译期烘值 |
| **世界态取值** | 名 ∈ 既有取值面（契约成员 ∩ `VALUE_KINDS` ∪ 引擎 `VALUE_LABELS`） | **既有形态** `$pc.<名>`（如 `$pc.classLabel`） | 它**已有既名**（`vocab.mjs` 的 `valueTerms` ＋ `10-core.twee:6` 的 `VALUE_LABELS`）⇒ ✗ 不另造第二名字 |

**写入点（唯一）：** 引擎函数 **`Sg.inargs.carry(dest, args)`** —— 它把入链 `args` 写到
**`Sg.inargs` 的闭包缓冲**（按 `dest` 段名键；**新一次 `carry` 整体替换**缓冲 ＝ 一跳清 ⇒ ✗ 不进存档、✗ 不留旧值）。
★ **✗ 不许改用 `State.temporary.sginargs`**（`#1350` 尾件 ⑥ 实测）：SugarCube 每次换段都调
`State.clearTemporary()`（`vendor/format.js` 的 `enginePlay`：`TempState={},State.clearTemporary()`
**在渲染新段之前**）⇒ 点击时写进去、渲染前就被抹掉 ⇒ 目标段**永远读不到** ✗
（实测：插桩 `carry` 只调 1 次且写对，最终槽 `null`）。**一跳清**也**✗ 不是"取后即删"**
（同段正文里 `{{入参}}` 出现两次 ⇒ 第二次必断 ✗）⇒ 语义是**整体替换** ✓
三处跳转路径**都调它**（✗ 不各写一份）：① 链接点击委托（`src/80-script.twee` 的 `#passages a.link-internal`）
② 链接遍历点（同文件 `a.link-internal[data-passage]`）③ 程序性跳转 `Engine.play(dest)`（全仓 5 处）。
宏 `<<printparam "名">>` 从该槽按名取（取不到 ⇒ 报『本段入参未传』 ✗ 不许静默空、✗ 不许读旧值）。

**红线：**
· ✗ **不许**把 `args` 值烘进产物 body（否则"我从哪条链接来"这个运行期事实就丢了 —— 见 `#1372` ① 格）
· ✗ **不许**为世界态取值另造宏名（同一角色两个名字＝病灶）
· ✗ **不许**在渲染面二次求值条件（`cond` 走 `Sg.rules.matches` 一处权威）

### 11.3 **结局声明契约**（`#1399`）—— 声明处**唯一**且有牙

> 契约（✗ 不是实现说明）：**"这是结局段"只能有一处活声明**，且它**必有牙**（漏了就是读者**卡在结局页** ✗）。

| 项 | 约定 | 为什么这样定 |
|---|---|---|
| **活声明** | `data/passages.json` 的 **`ending: {key, kind}`**（段级字段） | 与「链接成数据」「条件成数据」**同族** ⇒ 声明与校验同处一处 ✓ |
| `key` | **必填**（短标识，如 `"入林"`） | 出口卡 `data-ending` ＋ 图鉴记账都用它（空 ⇒ 记账失真 ✗） |
| `kind` | `chapter` \| `final`（缺省 `final`） | 终局与**章末**小结局的差别在**图鉴空页提示**（`#574`）⇒ 必须可表达 ✓ |
| **编译形态** | **编译期注入唯一一处** `<<ending "key" kind>>`（段末） | ✗ **不烘 HTML**：运行期仍走 `Sg.Ending.foot`（单一实现 ✓）；✗ 也不要求作者手写宏 |
| `tags: [ending]` | **✗ 不是活声明** | 全仓**零消费方** ⇒ 写了它**什么都不发生**（本票的病灶：看起来像声明、实为死声明 ✗） |
| **红线** | **"这是结局"的声明处必须唯一且有牙** | ✗ 不许"两处声明、一处死"；带 `tags: [ending]` 而**既无 `ending` 字段、正文也无 `<<ending>>`** ⇒ **编译期点名红** ✓ |
| 旧形态 | 正文手写 `<<ending …>>`（无段数据） | 仍**合法**（那本身就是活声明 ✓）⇒ 与 `tags` 并存也**不报**（tags 只是冗余标记）✓ |

**配套门（义务的承载者）**：`endingProblems`（`editor/lib/core/passages.mjs`，纯函数 ⇒ 能假）在**拼装期**跑：
`ending.key` 空 / `kind` 非法 / **只有 `tags: [ending]`**（点名并给修法：改用 `ending:{key,kind}`）✓
⇒ 复现旧 `stories/mist-forest/gates/canon.mjs:316` 那条义务的牙（义务的**旧承载者**已随旧故事删除 ✓）。

### 11.1 呈现契约（`#1308`）—— **面板容器 id** 与 **空声明态**

> 这一节是**契约**（✗ 不是实现说明）：判据格（`test/codex-panel.mjs`）**照本节写期望**，
> ✗ 不照实现里的 DOM 细节写（否则"期望照抄实现"⇒ 契约随实现漂移）。

| 项 | 约定 | 为什么这样定 |
|---|---|---|
| 呈现形态 | **常驻面板**（侧栏／面板容器），id ＝ **`codex-panel`** | 图鉴是**跨周目**面 ⇒ 不随周目重置；与"段内设定集页"（故事自己的正文，走现有 `visible`）**判面不同**、并存 |
| 数据来源 | 引擎**只读** `Game.Codex.items`（由 `Sg.story.codexItems()` 编译而来） | 面板**不自推**内容 ⇒ 声明与呈现一对一，可判 |
| 面板在场 | 渲染后 DOM 里存在 `#codex-panel`（**恒在**，不因内容为空而消失） | 见下一行"空态"的理由 |
| **空声明态（显式）** | 故事**未声明** `Codex.items`／或声明为空 ⇒ **仍渲染 `#codex-panel`，内含空态文案「图鉴还没有条目」**；✗ **不是**"不渲染面板" | **两种"零"不可同形**：若空声明 ⇒ 面板消失，就与"引擎根本没有这个能力"**长得一样** ✗ ⇒ 判据无法区分"没声明"与"没实现" |

**判据格照本节可写出的三格**（`test/codex-panel.mjs`）：
1. 声明生效：产物里 `Game.Codex.items` **条数 ≠ 0**（现状＝0 ⇒ 必红）
2. 面板在场且含期望文本：`#codex-panel` 在，且某条目的 `clues[].label` 出现在面板内
3. 空态：夹具把声明去掉 ⇒ **面板仍在**且含「图鉴还没有条目」（⇒ 与"没实现"两态可分）


## 12. `NPC`

| 字段 | 型 | 含义 |
|---|---|---|
| `entries` | `{ …}` | NPC 条目（本仓空表） |

## 13. `Star` —— 星力

| 字段 | 型 | 含义 |
|---|---|---|
| `budget` | `number` | 星力预算 |
| `orders` | `Array<{ id, spent, floor, note}>` | 路线档：`spent`＝已耗、`floor`＝保底 |

## 14. `Dragon` —— 龙血

| 字段 | 型 | 含义 |
|---|---|---|
| `hp` | `number` | 龙血上限 |
| `sealAt` | `number` | 封印阈值 |
| `hitBase` | `number` | 基础命中 |
| `sneakHit` | `number` | 偷袭命中 |

## 15. `Investment` —— 投入/覆盖承诺

| 字段 | 型 | 含义 |
|---|---|---|
| `expressive` | `Array<…>` | 表达性内容清单 |
| `failClueExempt` | `{ …}` | 失败档线索的豁免 |
| `eraDomain` | `{ past: string[], branch, flagEra, crossEraGates: Array<{ id, p, label, pastFlags, presentFlags}>}` | **时代域**：哪些段属过去；`crossEraGates`＝跨时代合龙门 |

## 16. `State` —— 状态契约（**手写者必须登记**）

| 字段 | 型 | 含义 |
|---|---|---|
| `domains` | `Array<{ id, keys?: string[], prefix?: string[], where?, note?}>` | 状态域。`--state` 门要求 `pc.ev`／`pc.world` 的**每个键落在某个域里**，未登记 → 红 |
| `bookkeeping` | `string[]` | **只写不读**的记账键（显式登记，否则判红） |
| `dynamicKeys` | `Array<{ prefix, via, values}>` | 静态看不见的**动态键族**（如 `<<set>>` 拼出来的键） |

最小合法集 ＝ **只有 `runtime` 一个域**（`stories/minimal-demo` 实测）：

```jsonc
{ "domains": [{ "id": "runtime",
  "keys": ["last_result","last_roll","soc","soc_last","soc_lever","fight","ending","notes","settle"],
  "note": "引擎保留的运行时槽（每个故事都要登记）" }] }
```

## 17. `mechanics()` —— 新机制声明（**形状六条**）

新机制（槽位／耐久／部位×异常／波次／事件池）由**故事侧**声明，形状校验在 `scripts/audit/lib/story-shape.mjs`：

| # | 判据 | 反例（必红） |
|---|---|---|
| ① | `slots[*].protects ∈ hitLocations ∪ {null}` | 保护一个打不到的部位 → 装备无效 |
| ② | `equipment[*].maxHp > 0`；`reduce` 是 `REDUCE_FORMS` 之一且**只写一种** | `reduce: {flat:1, dice:'1d4'}` |
| ③ | `statuses[*].parts ⊆ hitLocations`（或 `'*'`）；`check.attr` 在属性表；`onFail` 的 `when` 分档**穷尽**（`GRADE_SET`） | `onFail` 缺 `low` 档 → 判了却没效果 |
| ④ | `encounters.short.waves` **恰 1 批**；`long.waves` **恰 2 批**且第二批 `difficulty` 更大、`reinforce: true` | 长短之差不在批次数 |
| ⑤ | 同段三路线索 `hint` **两两不可等价** | 两条路文案相同 → 玩家无法区分 |
| ⑥ | 随机源**不在表里**（是引擎代码纪律） | 表里藏 `Math.random` |

注意：**声明面不得大于实现面**：`REDUCE_FORMS` 目前只有 `['flat']`；实现 `dice`／`percent` 时**同一 PR 三处同源**（本表 ＋ 引擎 ＋ 门）。

另：**有 `encounters` 就必须有 `enemies`**（`#705`）；`enemies[*]` 必填 `name`／`hp`／`ac`／`attack.bonus`，`attack.dmg` 必须是**骰式**（`N`／`NdM`／`NdM±K`）—— 固定数字＝不可测。

## 18. `merges` —— 并入的容器（可选）

```jsonc
"merges": [{ "target": "Game.Consequences.engine", "default": {…}, "value": {…} }]
```

用于把值并进**引擎自建容器**（引擎用 `??=` 自建，故事只往里填数据 —— `#460`）。`default` 是兜底形状，`value` 是实际值。
