# 界面块名族（引擎持有的通用块名）

> **状态**：改名面**已落地**（`#1227` 片二，本页随该片入册）。删除面**部分落地** —— 见 §三"待裁"。
> **本页用处**：出仓作者据此引用块名（`ui-model.md` 讲"怎么摆"，本页是"可引名单"）。

## 一、定稿五名（Operator 2026-09-23 同意）

一名对应一个界面角色；名字**不得是具体故事的名词**。

| 新名 | 角色（一句） | 收编的旧名 |
|---|---|---|
| **`.acts`** | 动作区：一段／一区块里**可点项**的容器 | `.scene-acts`（动态构造，类与 id 同名）／`.fight-acts`／`.ending-acts` |
| **`.acts-wrap`** | `.acts` 的**横排变体**（结局页那一处用） |（原 `.ending-acts` 的布局部分） |
| **`.foot`** | 脚注区：一块收尾提示区；**两变体** `.foot-hint`／`.foot-lead` 属同角色，不另立 | `.ending-foot`／`.ending-foot-hint`／`.ending-foot-lead` |
| **`.panel`** | 面板：**成组容器**（含"容器与项共用词根"那类）；**项不另立名** | `.soc-opts`（容器） |
| **`.meta`** | 元信息／次要信息**文字**（**文字角色，非容器**） | `.fight-meta` |
| **`.dock`** | 常驻动作条（**随 `#1222` 引入的新摆放**，今日无既有名） | —（新名，非收编目标） |

`.acts-wrap` 是 `.acts` 的**布局修饰**，不是第六个角色：它只承载"横排"这一条布局差异，
因此避免了同一选择器在样式表里出现两条互相覆盖的定义。

## 二、施工三条（`#1227` 片二落地时遵守）

1. **类与 id 两个面都要改**：动态构造处（`autoActs()`）是 `className` ＋ `id` **双设**，
   改名时两处同步；引用该 id 的跳转链接（`跳到行动`）随之。
2. **按名删，不按行删**：删除面上有"一行多成员"的落点（`80-script.twee` 的 `feedbackSelector` 一行四名、
   `BLOCK_ZONES` 一行十一名）—— 按行处理必漏，逐名核。
3. **产出面也在扫描面内**：`class="…"` 由 **widget 模板** 与 **动态构造**（`className =`／`classList.add`／
   模板串）产出，只扫样式表会漏。

## 三、删除面与待裁（**未决**）

删除对象＝**样式规则 ＋ 选择器引用**（不扩到"删产出代码"）。

### 已删（7 名，纯死名：全仓无产出点）

`.tavern-actions`／`.tavern-heard`／`.tavern-tables`／`.soc-panel`／`.ending-card`／`#hall-act`／`#keeper-acts`

### 保留（10 名：**码在、运行时当前不出现**）—— **两种成因，别混为一谈**

| 成因 | 成员 | 性质 | 处置 |
|---|---|---|---|
| **调用点漏参** | `.soc-ask`／`.soc-cost`／`.soc-done`／`.soc-meta`／`.soc-no`／`.soc-opt`／`.soc-said`／`.soc-opts`（`socpanel` 一族） | **缺陷**：`<<socpanel>>` 未传实参 → `Game.Social.ask(undefined)` 恒 `null` → widget 内 `<<if _a>>` 永不成立 | 修＝补实参（见 `#1239`，并入 M1a 夹具化那批），属**行为变更**须显式声明 |
| **真·数据门** | `.fight-log`／`.scene-feedback` | 能力在、当前语料不可达（`<<if $pc.ev.fight.history and ….length>>` 等） | 保留待消费者 |


`.scene-feedback`／`.fight-log`／`.soc-ask`／`.soc-cost`／`.soc-done`／`.soc-meta`／`.soc-no`／`.soc-opt`／`.soc-said`／`.soc-opts`

它们的产出面在引擎 **widget 模板** 里，且**夹具真的在调**（`face-fixture` 的 `11-守林人.md` 有 `<<socpanel>>`、
`07-洞穴·战斗.md`／`19-封印·并肩.md` 有 `<<fightlog>>`）；**未渲染的成因按上表分两类**：`.soc-*` 族＝**调用点漏参**（缺陷，`#1239` 修）、`.fight-log` 等＝**真数据门**（保留）。
因此处置三选一（**待 Operator 裁**）：(a) 只删样式与引用（则名仍被产出，与本页"归零"相冲突）；
(b) 连产出代码一起删（则夹具可见行为变化）；(c) **改归族**（面板容器入 `.panel`、战报入 `.panel` 或 `.meta`）。
本片取"**按住不动**"，待裁后再落。

### 不在本页范围

`.codex-*` 五名是**机制名**（不动）；`.tavern-asks`／`.act-list`／`.ask-list`／`.item-list`／`.codex-list`／
`.log-list`／`.dock` 是**三面皆 0 的草稿名**（全仓无出现，因此不列删除面）。

### 附：本片改名带来的一处**非可见面**变化（须显式声明）

结局段容器由 `.ending-acts` 改为 `.acts` 后，**落进了** `autoActs()` 的选择器
（`if (querySelector('.acts'))`）→ 43 段里有 **7 段** 的 `textContent` 不同：**多插 7 条"跳到行动"无障碍跳转链接**
（`position:absolute;left:-9999px`，**视觉隐藏**，方向是**改善**）。

→ 这**不是玩家可见面变更**，但**是 DOM／`textContent` 变化**。
→ 任何人拿"可见文本逐字节相同"做对照时，**这 7 段会被读成差异** —— 那是本笔已知差异，不是回归。
