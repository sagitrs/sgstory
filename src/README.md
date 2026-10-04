# src/ —— 插件本体开发指南

这里是 SugarCube 增强插件的源码。三层结构（`core/` 一层 ＋ **宿主一层** ＋ **规则包一层（可多个）**）：

| 目录 | 命名空间 | 职责 | 铁律 |
|---|---|---|---|
| `core/` | `setup.RPG` | 规则无关引擎：基类、背包、战斗循环、场景、输入输出 | **零规则字段**——core 回答“能不能、怎么做”，不回答“掷什么骰、DC 多少” |
| `host/<宿主>/` | `setup.<宿主大写>` | **宿主适配层（L0）**：把某个界面/运行时（首例 SugarCube）的状态、渲染、页面生命周期收口为三个端口 | **全仓唯一**允许出现宿主符号（`State.variables`／`$()`／`Dialog`／`:passageinit`）的一层；内核只经 `RPG.portOf()` 取 |
| `dnd3/` | `setup.DND3` | D&D 3.5 规则包：数值块约定、判定数学、内容 | 判定数学只进 `dnd3/core/`，不碰 `src/core` |
| `dnd-5e/` | `setup.DND5E` | D&D 5e（2024 SRD）规则包：同上 | 判定数学只进 `dnd-5e/core/`，不碰 `src/core` |
| `d20m/` | `setup.D20M` | d20 Modern（MSRD）规则包：同上（3e 系判定数学、火器、义体/机器人自证件） | 判定数学只进 `d20m/core/`，不碰 `src/core` |

★**本表须列全所有规则包**——新增包时**同笔补行**（否则下一个人照着半张表建包）；复现命令：`ls -d src/dnd/*/`。
★**规则包之间互不可见**——共享的东西应下沉 `core/`；★**跨包同名 id 会彼此静默遮蔽**（见 §F2；系统性政策见 #1743）。

### 注册面 id 冲突的通知（`sgstory#295` 乙）

同一个故事同时装两套规则包（如 `dnd3` 与 `dnd-5e`）时，两包**共用一张 id 表** ⇒ 后装者**如实**遮蔽前者。
注册点（道具／角色／效果／存量／建造项／层表／管线／场景／遭遇表／通知通道／面板／宿主端口）**只上报**：
`RPG.regWarn.报(类, id, 详情)` ⇒ 加载期结束由 `RPG.regWarn.汇总()` **印一条** `console.warn`
（含**计数**与**逐条具名**；印过不再印）。判据 `tests/gates/regwarn-summary.mjs`；
单包故事不该撞这条 —— 让故事只装它要的包：`story.json` 的 `packs` 口（`#295` 甲）。

## 宿主与三端口（L0／L1 的边界）

引擎与界面之间只经**三个端口**（`#1912`／`#1917`）：`PersistContract`（存档/读档/迁移）、
`RenderPort`（输出与渲染）、`LifecyclePort`（段落切换/会话纪元/异步取消）。

- **契约由内核定义**：`src/core/ports/index.js`（L1）——它声明每个端口该有什么方法，并提供**登记面**；
- **实现由宿主提供**：`src/host/<宿主>/**`（L0）——全仓**唯一**允许出现宿主符号的地方；
- **依赖方向是 L0 → L1**：内核永远不知宿主 ⇒ `src/core/**` 里**不得出现任何宿主 id 字面量**
  （连注释里举例也用 `<宿主 id>` 占位），由门 `tests/gates/host-touchpoints.mjs` 的「宿主标识」判据机械盯着。

写一个新宿主（形见 `src/host/sugarcube/`，最小可跑的例子见 `tests/unit/core/hosts.test.js` 的用例内宿主）：

```js
/* ① 登记宿主（包根 00-init.js，首行 /* raw */）*/
setup.MYHOST = { id: 'myhost', desc: '…' };
setup.RPG.defHost(setup.MYHOST.id, { desc: setup.MYHOST.desc });

/* ② 把三端口**填进这个宿主**（其余文件；host 必填 —— ✗ 缺省落影子表）*/
RPG.defPort('render', { output(text) {…}, render(node) {…}, setCollector(fn) {…} }, { host: MYHOST.id });
```

**选择与解析**（`sgstory#1989`）：`RPG.useHost(id)` 显式选择，`RPG.hostOf()` 读已定宿主，`RPG.hostsReady()` 盘存各宿主缺哪些端口。
解析规则是**单一**的：已定宿主＝显式选择 ?? 恰好一个登记（自动）?? 无；0 个登记抛「无宿主登记」、
≥2 且未选抛「宿主未选择 ＋ 候选清单」——**两种不同形**，✗ 静默取第一个（那会让「哪个宿主在跑」取决于加载序）。

**产物级选择**（`sgstory#1998`）：一份产物只装它选中的宿主 —— `python3 build.py … --host <id>`；
`--host a,b` ⇒ 多装（✗ 注入选择）；`--host all` ⇒ 全装；**缺省** ⇒ 装 `DEFAULT_HOSTS`（`build.py` 一处常量，现＝ sugarcube）。
★为何缺省不是「全装」：全装 ＋ 未选择时 `RPG.portOf` 会在**运行期**抛（实测量得：单测 774 格中 31 格红，
端口取用全线抛）⇒ 缺省产物必须能跑。未知 id ⇒ **构建期**具名抛。
判据：`tests/gates/host-packaging.mjs`（产物面，含 3 把真刀）。

## 如何添加你自己的插件（规则包）

以 wfrp 为例，四步：

1. **建包目录与命名空间**——`src/wfrp/00-init.js`（首行必须是 `/* raw */`，
   因为它要创建命名空间本身）：

   ```js
   /* raw */
   setup.WFRP = {
       version: '0.1.0',
       pack: 'wfrp',
       // WFRP 数值块：字段带默认值，保证角色之间对称
   };
   setup.WFRP.STAT_BLOCK = { ws: 31, bs: 31, toughness: 31, wounds: 8, /* … */ };
   setup.WFRP.stats = (over = {}) => ({ ...setup.WFRP.STAT_BLOCK, ...over });
   ```

2. **规则扩展（可选）**——`src/wfrp/core/`：对本包语义的判定扩展放这里
   （参考 `dnd3/core/chest.js` 给宝箱加 3E 撬锁检定的写法）。

3. **内容**——`src/wfrp/items/`、`src/wfrp/characters/` 用声明式工厂：

   ```js
   DND3 风格：RPG.defItem({ id, name, stats, used(that, from) { … }, actions: { … } })
   ```

4. **构建注入是自动的**——build.py 对 `src/<包>/**` 自动注入 `(RPG, <别名>, $)`，文件里直接用。
   ★**别名 ＝ 包根目录名** 经 `upper()` 且**去掉 `-`**（`build.py:116`）。实测对照：

   | 目录 | 别名 |
   |---|---|
   | `src/dnd/dnd3/` | `DND3` |
   | `src/dnd/dnd-5e/` | `DND5E` |
   | `src/dnd/d20m/` | `D20M` |

   三条坑（都实测过）：
   - **别名由目录名唯一决定** ⇒ 包内**不得**自选短名：目录写 `d20-modern/` 却在文件里手写 `setup.D20M`
     ⇒ `D20M` 会 undefined。**目录名就是接口名**。
   - **包根 ＝ 向上最近的那个「含 `00-init.js` 的目录」**（`build.py:97` `find_pack_root`）
     ⇒ 包内子目录**不要再放** `00-init.js`（否则子树会被认成另一个包）。
   - **首行 `/* raw */`** 的文件**跳过** IIFE 包装（`build.py:43`）——只有**创建命名空间本身**的
     `00-init.js` 该这么写。

   前提：包的 `00-init` 先创建 `setup.<别名>`（加载顺序：数字前缀保证 00 最先）。

**先读参考实现**：`dnd3/` 是完整范例（规则包结构、stats 约定、判定扩展、内容组织）；
`dnd-5e/` 读 5E 面差异（`prof` 替代 `bab`、护甲**替换**基础 AC）；`d20m/` 读火器与自证件。
新包与它们平行，互不可见——共享的东西应该在 `core`。

## 命名约定（提交前自查）

- 类大写、实例小写；单例角色大写（`DND3.Player`），效果等杂项实例小写（`RPG.death`）。
- 道具性质是布尔字段（`weapon: true`），角色性质是字符串标签数组（`properties: ['player']`）。
- 动作（verb）名小写字符串：`use` / `equip` / `unequip` / `open` / `lockpick`…
- core 只提供通用 `RPG.roll`；带规则色彩的便利函数归规则包（如 `DND3.d20`）。

## 装备槽（加武器/衣服/鞋这类装备）

- 道具声明 `slot`：`'weapon'` / `'body'` / `'feet'…`（槽名是普通字符串，
  规则包可自定义新槽；`null` = 不可装备）。**同槽互斥、异槽共存**。
- 共享动作 `actions: { equip: RPG.slotEquip, unequip: RPG.slotUnequip }`
  ——槽位感知，同槽已有装备则失败（提示先卸下），不自动换装。
- 查询：`RPG.equippedIn(槽)`（该槽已装备道具）、`RPG.isEquipped(id)`；
  `RPG.slotLabels.槽名 = '中文'` 由规则包补全提示文案（core 不认识具体槽）。
- 装备参与战斗数值走规则包：dnd3 的 `DND3.acOf(角色)` 会把已装备道具的
  `stats.ac_bonus` 计入防御等级（铁环甲 +3、包铁皮靴 +1）。
- 近战武器共用 `DND3.meleeAttack`（dnd3/core/combat.js）：拔出检查（`stats.ranged: true` 的远程武器**跳过**）、
  1d20+BAB+**力量**调整值 vs acOf（远程武器改用**灵巧**调整值；调整值由 `stats` 的原始分现算）、天然 1/重击威胁范围 `stats.critMin`、击倒结算
  ——**加新武器只需写数据（见 sword.js），零重复判定代码**（dnd-5e 同构：`DND5E.attack`，同样识别 `stats.ranged`）。

## 交互战（玩家控制的回合）

`properties` 含 `'player'` 的角色在 `interactive: true` 的 `Battle` 中由玩家亲自操作，
回合分三层：**① 选道具**（含「跳过本回合」）→ **② 选动作**（使用／装备／卸下）→
若选「使用」则 **③ 选目标**。三种动作的语义：

- **使用**：进入目标选择；武器若未装备会自动「拔出」（不额外消耗）。
- **装备／卸下**：**消耗整回合**，**不经目标选择**，且经 `RPG.useItem(id, actor, actor, action)`
  执行 ⇒ 修改会**提交回背包快照**（凡「改了实例没写回快照」的分裂脑问题见 F1 同源教训）。
- **跳过本回合**：不消耗任何资源，直接结束。
- **远程武器不需拔出**（`stats.ranged: true`），其攻击与伤害用**灵巧**而非力量。

选项构造在 `Battle.buildPlayerOptions()`（纯函数，可直接单测：道具选项／动作选项／目标选项）；
「选中后的分派」在 `Battle.dispatchAction(chosen, action, item)`（纯函数，返回
`skip`／`use`／`equip`／`unequip`）。测试范式见 `tests/unit/core/battle-interaction.test.js`
（驱动 `battle.execute()` ＋ 桩化 `choice` 时**必须**用 `finally` 还原包内单例，见 #1699）。

### 外部提交本回合行动（`battle.submit` · `sgstory#2003`）

故事侧（如「打开背包」视图）可以**替玩家提交这一手**，而**不是**绕过回合：

```js
battle.submit({ item: 'bandage', action: 'use', target: '（单位名，缺省自己）' })   // 战斗实例
RPG.submitBattleAction({ item: 'bandage' })      // 不必自己攥实例：交给**当前这场**（战外 ⇒ 具名 no-battle）
```

- **不是旁路**：三个决定点（选道具／选动作／选靶）都先看这条提交 ⇒ 它是**回答循环正在问的那一问**；
  执行仍走 `dispatchAction` → `RPG.act`，回合边界仍是 `#playerAction` 的 `finally`
  ⇒ `turnBoundary.end` 照发 ⇒ **回合真耗**（与战斗选单同一条账）。
- **一次性**：本回合用完即废；被拒重来（`#1914` 回路）时**也清**（✗ 重放同一手）。
- 取不到（身上没有／没有这个动作）⇒ **具名出声**并回到手动选择；战外 ⇒ `no-battle`（✗ 静默）。
- 循环正等着这个玩家时提交 ⇒ **当场兑现**（屏幕上那盘按钮由 `02-choice.js` 收掉 —— 谁造谁收）。

## 已知边界（开发者必读）

### F1 · 角色血量不进存档

SugarCube 存档只序列化 `State.variables`。道具走快照/复活进档 ✓；
但角色（`setup.DND3.Goblin` 等堆上单例）的 **hp/isDown/effects 不进档** ✗。
中弹 → 存档 → 读档 = 满血复活但战利品还在。

**修复路径**：战斗毕把角色态写回 State，读档时用 `Character.revive()` 还原：
```js
// 战毕存档
State.variables.actors = { goblin: setup.DND3.Goblin.toJSON() };
// 读档还原
const snap = State.variables.actors.goblin;
if (snap) Object.assign(setup.DND3.Goblin, setup.RPG.Character.revive(snap));
```
当前 e2e 用 `:enginerestart` 钩子重置而非快照（适用于"重开即重置"的短篇，
长篇或需要续档的故事应走上述快照路径）。

### F2 · 跨包同名静默覆盖

**各**规则包可能注册同名道具/角色（现例：`club` 在 `dnd3/items/club.js` 与 `dnd-5e/items/club.js`
都有；`player` 三个包都注册）。后加载的包会**覆盖**先加载的同名注册。
`registerItem`/`defCharacter` 对重复 id 会 `console.warn`，但不会阻止。

**消费方守则**：直接用 `new DND3.Club()` / `new DND5E.Club()` / `new D20M.Beretta92F()` 实例化，
不要通过 `RPG.createItem('club')` 查找（除非确认只有一个包在跑）。

★系统性政策（注册面静默遮蔽的实例与处置）见 **#1743**。本仓现况（机械可核）：
`grep -rn "id: 'player'" src/` ⇒ **三个包**都注册（`dnd3/player.js`、`dnd-5e/player.js`、`d20m/player.js`）
⇒ 启动告警 **2** 条（每个后加载者一次），**末位注册者生效**（`RPG.characters.get('player')` 逐字取末位）。

### F3 · 交互战的异步边界

`Battle.execute()` 在交互模式下是 async（内部 `await choice()`）。
twee 里 `<<run (new Battle(...)).execute()>>` **之后的 `<<if>>` 行
不代表战后状态**——首访时它们在玩家做选择之前就执行了。

**守则**：交互战的结果一律经重渲染链接取得（战后段落里用 `<<if>>` 读状态，
而不是在同一段落里紧跟 `<<run>>` 判断）。自动战（`interactive: false`）
同步完成，无此限制。

标题前缀标明层次：`[core]` / `[dnd3]` / `[build]` / `[arch]`（跨层）。
正文包含五节：

```markdown
## 现状
哪个文件 / 哪个类或函数，现在的行为是什么（贴代码行）。

## 期望
你认为应该怎样，为什么。

## 违反的原则
内聚 / 耦合 / 对称性 / 契约——具体违反了哪条（见根 README“核心设计”）。

## 最小复现
一个失败的最小单元用例（tests/unit 风格），或可复现的 e2e 步骤。

## 影响面
是否破坏现有故事（tests/e2e）与现有 API。
```

> 带“失败的最小测试”的 Issue 会被优先处理——测试即规格。

## PR 格式（分享你做的插件）

- **目录约定**：`src/<包>/00-init.js`（raw + 命名空间 + stats 约定）、
  `src/<包>/core/`（判定扩展，可空）、`src/<包>/items|characters/`（内容）。
- **必须自带测试**：新建 `tests/unit/<包名>.test.js`（IIFE 包裹，一个单元
  一个文件；build.py 自动发现），断言风格见
  [tests/README.md](../tests/README.md)：只测状态与异常。
- **PR 描述模板**：

  ```markdown
  ## 包名与定位
  （如 wfrp：WFRP 4e 规则包，含 d100 判定、优势、命中位置）

  ## 数值块约定
  列出 STAT_BLOCK 全部字段及含义。

  ## 能力清单
  items / characters / core 扩展各一行说明。

  ## 验证
  - [ ] python build.py 后 tests/unit/unit.html 标题为 PASS
  - [ ] e2e 故事核心路径未破坏（可开箱、可战斗、可离开）
  - [ ] src/core 代码层零规则字段（grep 自查）
  - [ ] 命名符合“命名约定”
  ```

- **红线**：把规则数学（掷骰公式、DC、字段名）放进 `src/core` 的 PR
  会被拒绝——请下沉到 `<包>/core/`。

## 引擎扩展点（规则包的三条标准接入面）

规则包要用「回合面」「效果面」「结算面」能力时，**不要改 core**——core 已把这三个面
做成 pack 无关的扩展点（`#1713`）。各面的**序／权威／失败形态**由 core 唯一承载：

### ① Effect 注册与归一化（`RPG.defEffect`）

```js
RPG.defEffect({ id: 'frightened', name: '恐惧', kind: 'debuff',
                selfRollMode: 'disadvantage',          // ← 任意声明字段都会挂到定义上
                levels: { min: 1, max: 6 },            // 层级效果（可选）
                hooks: { onTurnEnd(actor, ctx) {} } }) // 定义级回合钩子（可选）
```

- `c.gain / lose / contains` 收 **id 串或 Effect 实例**（归一化为 id；`c.effects` 永远是字符串数组，存档安全）。
- **读路径严格**：未注册 / 形态非法 / 层数缺失或越域 ⇒ 抛错（`err.code` 见 `17-effect.js` 头注释；消息只到 id，注册列表在 `err.registeredIds`）。
- ⚠ 层级效果用**参数化 id**（`'exhaustion:3'`）：`gain` 新层会**自动移除同 base 其它层**（原子升降级）；
  `lose('exhaustion')`＝移除全部层级；`contains('exhaustion')`＝任一层级为真；`c.effectLevel('exhaustion')` 读级数（0=未持有）。
- `RPG.death` 属 core；**包的效果由包自己 `defEffect`**（如 dnd3 的 `fear`）。

### ② 回合生命周期钩子（`RPG.turnBoundary` + `battle:turnStart/turnEnd`）

- 两条通路（自动 `BattleTurn` / 交互 `#playerAction`）**统一**发 `battle:turnStart`（可**闸门**）与 `battle:turnEnd`；
  订阅方置 `payload.cancel = true`（只认 `=== true`）＋可选 `reason`（仅字符串）⇒ 该行动者本次不行动（打印「无法行动（reason）」）。
- 失能类条件（#1689 的 `canAct`）＝ `turnStart` 的**闸门订阅方**；回合末豁免（`saveEnd`）＝ `turnEnd` 订阅方——core 不认识条件。
- 遗留事件 `battle:turn` 保持原位（仅自动通路）；**独立使用** `new RPG.BattleTurn(a, b).execute()` 不经本面——
  由调用方自行调 `RPG.turnBoundary.start/end`（e2e `battles.twee` 即此形态）。
- 定义级 hooks **只读**（改不了 cancel），顺序 = `c.effects` 数组序，抛错吞并不中断其余。

### ③ 结算管线（`RPG.defPipeline` / `RPG.runPipeline`）

```js
RPG.defPipeline({ id: '<pack>.<行为>', stages: [
  { id: '<pack>.atk',    run(ctx) { ctx.atkMod = …; } },   // ① 命中修正
  { id: '<pack>.mode',   run(ctx) { ctx.rollMode = …; } }, // ② 优势/劣势模式
  { id: '<pack>.resolve', run(ctx) { /* 掷骰/命中/暴击 */ } },
  { id: '<pack>.damage', run(ctx) { /* 伤害与施加 */ } },
] });
```

- **序的唯一权威 = `stages` 数组序**（core 不重排）；阶段置 `ctx.done = true` 提前结束（失手不结算）。
- `ctx.roll(mode)` 一律经 `RPG.rng`（唯一随机入口，`#1706`）——否则测试的固定序列注入会失效。
- 阶段抛错**传播**（结算不可逆，静默 = 数值算错还不报）；回合钩子抛错**吞并**（可重试的编排点）。
- 参考实现：`dnd-5e.attack`（`dnd-5e/core/combat.js`，四段）。

## Issue 格式（认为架构有欠缺时）
