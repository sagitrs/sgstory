# 引擎／故事边界：`Sg.story` 接入契约（伞 `#441` · 票 `#459`）

> 一句话：**引擎不知道故事的名字，也不读故事的表**；故事把自己的数据与声明**注册**到 `Sg.story`，引擎只调用它。
> 本文件是这条边界的**形状权威**：谁提供什么、缺什么会怎样、以及**哪些形状会被门抓住**。

## 1. 故事侧注册什么

`window.Sg.story`（由故事文件注册；故事 1 现落在 `src/15-tables.twee` 的 `:: StoryBindings`，`)`#441-D`）搬家后随故事包走 `stories/<slug>/**`）。

| provider | 用途 | 缺省语义（**三条不许混**） |
|---|---|---|
| `notes()` | 笔记表 | 表是数据集 ⇒ 缺表返回空表 |
| `rules()` | 条件表（阶段 4 选择器的输入） | 同上（占位） |
| `checkSite(name)` | 位点表（`abil`/`skill`/`dc`/`dis`/`nat`） | **结构缺失 ⇒ 报错** |
| `checkKnowledge(name)` | 位点 ↔ 情报捷径 | **可选** ⇒ `null`（"没有捷径"是合法状态） |
| `combatAction(id)` | 战斗动作记录（`.label`/`.site`/`.good`…） | **结构缺失 ⇒ 报错** |
| `combatPool(id)` | 作战池（动作 id 列表） | 池缺 ⇒ `[]` |
| `itemDef(name)` / `itemEffect(name)` / `gearDef(name)` | 道具／道具效果／装备表 | 表缺项 ⇒ `null`（对应源码里的可选链） |
| `poisonReduce()` | 数值（毒液压制） | **必需数值 ⇒ 报错** |
| `dragonMaxHp()` | 龙血上限 | **必需数值 ⇒ 报错** |
| `actionLabel(id)` | 动作名（由 `combatAction()` 派生 ⇒ 单一权威） | 未登记／缺 label ⇒ 报错 |
| `mechanics()` | **新机制声明表**（本文件第 2 节） | **未启用 ⇒ `null`**（合法，见第 3 节） |

**纪律**（`#459` 定）：**结构缺失 ⇒ 报错**（未注册却来取数据必须炸，不许静默 0/空）；**可选缺省 ⇒ 明确的 `null`／`[]`**；
**文案缺失 ⇒ 兜底**（那是 `copy()` 的事，不是这里的）。三类不许合成一个 `?? {}`。

## 2. 新机制声明表（`mechanics()`）

故事若要启用**槽位／耐久／部位×异常／波次／事件池**这套机制，就返回一张表；形状（节选，`#459` 草案）：

```js
mechanics: () => ({
  slots: {                                   // 槽位：**保护关系是声明**，不是代码里的 if
    body: { protects: '躯干', label: '衣服' },
    neck: { protects: null, label: '项链' },  // 不保护部位的槽位：可装备，但不参与部位减成
  },
  hitLocations: ['手', '手臂', '肩膀', '头', '躯干', '腿', '脚'],
  equipment: { 皮甲: { slot: 'body', maxHp: 12, reduce: { flat: 2 } } },
  statuses: { bleed: { label: '流血', parts: '*', check: { attr: 'con', dc: 12 },
                       onFail: [{ harm: 'damage', dice: '1d4', when: 'most' },
                                { addStatus: 'random', part: 'random', when: 'low' }] } },
  statusPenalty: { 'stun@头': { all: -2 } },  // 部位 × 异常 ⇒ 减成
  encounters: { short: { waves: [{ pool: 'cave.w1', difficulty: 1 }] },
                long:  { waves: [{ pool: 'cave.w1', difficulty: 1 },
                                 { pool: 'cave.w2', difficulty: 2, reinforce: true }], rewardsScale: 1.5 } },
  roads: [{ from: 0, to: 1, options: [{ kind: 'short', hint: '碎石间有拖行的痕迹' },
                                      { kind: 'chest', hint: '岩壁凹处反着一点金属光' },
                                      { kind: 'trap',  hint: '地面浮土比别处松' }] }],
}),
```

### 形状即判据（**六条可机检点** —— 机器读得到，才算契约）

| # | 判据 | 为什么 |
|---|---|---|
| ① | `slots[*].protects` ∈ `hitLocations` ∪ {`null`}；`slots[*].label` 非空；`hitLocations` 无重复 | 否则"有装备的槽位**永远打不到**"⇒ 装备白做 |
| ② | `equipment[*].slot` ∈ 已声明槽位；`maxHp > 0`；`reduce` 形态是 `flat`／`dice`／`percent` **之一且只写一种** | 耐久上限为 0 ⇒ 一碰就碎；两种形态并存 ⇒ 引擎无法判定按哪种结算 |
| ③ | `statuses[*].parts` ⊆ `hitLocations`（或 `'*'`）；`check.attr` 在属性表；`check.dc > 0`；`onFail[*].when` **分档穷尽**（`most`／`low`）；`statusPenalty` 只引用已声明异常 | 「判了却没效果」正是分档不穷尽的典型后果 |
| ④ | `encounters.short.waves` 恰 **1** 批；`long.waves` 恰 **2** 批，且第二批 `difficulty` **更大**、`reinforce: true`；每个 `pool` 必须是已登记作战池 | 这就是"**短／长战斗**"的可机检定义（两者之差**只**在批次数） |
| ⑤ | 同段各路 `options[*].hint` **两两不可等价**（去空白后不等）；≥3 个选项；每条有 `kind` | 线索是玩家区分两路的**唯一**手段；等价 ⇒ 玩家在赌运气 |
| ⑥ | **表里不得藏随机源**；引擎代码侧纪律：判定／波次／掉落一律走可注入的 `Game.Rules.rng`（sim 侧**不得直调 `Math.random()`**） | 分布口径要能被钉住、被复算 |

**实现与门**：校验器 `scripts/audit/lib/story-shape.mjs`（纯函数，导出 `validateStoryMechanics()` ＋ 两张词表 `GRADE_SET`／`REDUCE_FORMS` ——
改口径只动这两处）；门 `test/story-shape.mjs`（**真实契约** ＋ 六条各带**正反自证**，失败计入退出码），已挂进 `npm test`。

**真实契约的作用域＝每个注册故事**（`storySlugs()` 逐个判，`#571`）：原先只判默认故事，而默认故事声明的是
「未启用」（**合法**，见 §3）⇒ 第三个故事的真实声明**一次都没被形状校验过**——`statusPenalty` 两处键形错误
（`麻痹@腿`／`流血@躯干` 用的是中文标签，而引擎按 `statuses` 的 id 取值）就是这样漏过去的：声明仍在、**减成恒为 0**、
不报错也不告警（`退 0` 不是证据，`docs/dev-conventions.md` §13）。

### 位点表的形状：`skill`＝**技能名** ／ `abil`＝**属性豁免**（`#574`）

`Game.Checks.sites[<位点名>]` 两种形状（引擎侧 `Game.Checks.rollSite`）：

| 写什么 | 含义 | 引擎怎么判 |
|---|---|---|
| `{ skill: '隐匿', dc: 12 }` | **技能检定**（技能名走 `Game.Rules.SKILLS` 映射到属性；中文技能名） | `Rules.check(pc, skill, dc, …)` |
| `{ abil: 'dex', dc: 12 }` | **属性豁免**（`str/dex/con/int/wis/cha`） | `Rules.save(pc, abil, dc, …)` |

⚠️ **`skill: 'dex'` 是错的**（属性键不是技能名）：`Rules.check` 会抛「未知技能: dex」⇒
**每一次判定都在报错**，事件变成走过场（不落伤害/异常/成败分支）。第三个故事实测踩过这个坑
（18 个位点全写成了属性键，而**没有任何门跑过一次真实判定**）⇒ 现在由 `test/story-runtime.mjs` 判据 ② 逐个位点真判一次。

## 2b. 运行时面：每个故事**都有**什么 ／ **可以有**什么（`#574`）

§2 管的是“声明表的形状”，这一节管“**产物里到底有什么**”——两者都要有人对账。

| 面 | 归属 | 证据 | 没有它会怎样 |
|---|---|---|---|
| `Sg.save`（存档 API）· `Sg.notes`（数据经 `Sg.story.notes()`）· `Sg.Ending` · 键盘 S/L · 结果留屏/空白归一/`data-choice` 派生 | **引擎运行时胶水**（`src/80-script.twee`，`layer: 'engine'`） | 随引擎进**每个**故事的作用域（`scopedFiles()`） | 点存档/落笔记直接抛错；故事 2 实测：“宝箱与洞窟事件走到就报错” |
| `Sg.Codex`（图鉴界面） | **故事面**（`stories/mist-forest/72-codex-ui.twee`，`layer: 'story'`） | 它读故事 1 的 `Game.Codex.items` | 引擎侧只能经**可选链**引用（`Sg.Codex?.sync?.()`）⇒ 没有它的故事只是“没有图鉴” |

**侧栏（`StoryCaption`）的分支口径**：车卡后的完整卡面（车卡故事）· 无车卡的故事给**最小面**（血量/金币/物品/存档）
· 有车卡但尚未车卡的故事**保持原样**（只有存档按钮——故事 1 零行为变化）。

**门**：`test/story-runtime.mjs`（逐故事五条：① 引用到的 `Sg.*` 面必须在产物里存在（可选链＝显式可选面）
② 声明的每个位点都要能真的判一次 ③ 内容用到的笔记必须已登记且 `add` 跑得通 ④ 侧栏可用 ⑤
故事 2 真机路：伤害＋异常＋结果槽都真的落了）；自证各带正反例，已挂进 `npm test`。

**为什么必需**：这四条曾同时静默通过——`Sg.notes` 缺失、位点写成属性键、`applyStatus` 返回值被丢、`maxHp`
字段名写错（引擎是 `max_hp`）。它们的共性就一句话：**“内容声称做了什么”与“运行时真的发生了什么”从来没人对过账**。

## 3. 兼容模式（**必须显式降级**，`#492`）

- 故事**未**声明新机制 ⇒ `mechanics()` 返回 **`null`**（故事 1 v1 就是这样，注释里写明理由）；
- 引擎遇到 `null` ⇒ **走旧路径**（故事 1 的现有战斗数值一动不动）；
- ⚠️ 引擎**不得**把"未声明"当成"0 减成／空槽位"—— 那会**悄悄改掉故事 1 的平衡**（这正是 `#492` 要防的事）。
  即：**降级是显式的**；"新机制在场但故事没声明"与"新机制不在场"必须走同一条旧路径。

## 4. 与层间判据的关系（`#458` 的出口判据）

- 引擎文件不得直读故事表：`test/layering.mjs --strict` ⇒ `STORY_SYMBOLS` 0 命中；
- ⚠️ **`--strict` 绿是必要不充分**：别名（`const T = window.Game`）已由 PR #508 解析，但**解构别名**（`const { Checks } = Game`）、
  **动态键**（`Game[k]`）、**拼接表名**仍逃得掉 ⇒ 关键处要**逐文件复核跨层调用面**；
- 引擎侧的**机制**已经就位（`#512` 把 11 个机制搬进 sim，数据全走 `Sg.story`）⇒ 新故事只需**声明数据**。

## 5. 给新故事接入的最小步骤

1. 建故事包（`stories/<slug>/**`）＋ 清单（`00-story.json` 的 `files` 是归属权威）；
2. 注册 `Sg.story`：先 `notes()`／`rules()`／`checkSite()`／`combatAction()`／`combatPool()`／`itemDef()`… ，
   再按需加 `mechanics()`（**形状一次性定死**，之后只加方法不改形状）；
3. 跑 `node test/story-shape.mjs`（形状合法）＋ `node test/layering.mjs`（引擎侧不直读故事表）；
4. 数值／文案**只**放故事包；机制**不**要再写进故事文件（`#512` 已把机制收进引擎侧）。

## 6. 已知边界与残留（如实记录）

- `Game.Dragon`／`Game.Systems`／`Game.Star`／`Game.Consequences` 等是 **`STORY_SYMBOLS` 里的"整命名空间"粒度** ⇒
  引擎侧**往它们上面挂机制**会被层间门判（`#512` 因此把 `dragonDamage` 改挂 `Game.Combat`）；
- `Combat.offer` 仍住在故事文件（它用 `Math.random()`，而 sim 有"不得直调"的门）⇒ **`#519`** 处理（搬入 ＋ 注入 rng ＋ 重签蒙特卡洛基线）；
- `copy()`（文案兜底，fail-soft）尚未落码 ⇒ 属 `#459` 剩余。
